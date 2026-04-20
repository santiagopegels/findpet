import faiss
import numpy as np
import json
import threading
from pathlib import Path
from typing import List, Tuple, Dict, Optional
from config import Config
from utils.logger import logger
import redis

class VectorStore:
    """Sistema de almacenamiento vectorial optimizado con FAISS usando distancia L2"""
    
    def __init__(self):
        self.index = None
        self.metadata = {}
        self.lock = threading.RLock()
        self.redis_client = None
        
        # Configurar Redis si está habilitado
        if Config.REDIS_ENABLED:
            try:
                self.redis_client = redis.Redis(
                    host=Config.REDIS_HOST,
                    port=Config.REDIS_PORT,
                    db=Config.REDIS_DB,
                    decode_responses=True,
                    socket_timeout=5,
                    socket_connect_timeout=5
                )
                # Test connection
                self.redis_client.ping()
                logger.info("Redis conectado exitosamente")
            except Exception as e:
                logger.warning(f"No se pudo conectar a Redis: {e}")
                self.redis_client = None
        
        self._initialize_index()
    
    def _initialize_index(self):
        """Inicializa el índice FAISS"""
        with self.lock:
            try:
                # Intentar cargar índice existente
                if Config.FAISS_INDEX_PATH.exists() and Config.METADATA_PATH.exists():
                    self._load_index()

                    # Verificar que la dimensión del índice coincide con la configuración actual.
                    # Si cambia el modelo (ej. de dim 1280 a 512), el índice guardado queda
                    # incompatible y FAISS lanza AssertionError al intentar agregar vectores.
                    if self.index.d != Config.FEATURE_DIMENSION:
                        logger.warning(
                            f"Dimensión del índice en disco ({self.index.d}) no coincide con "
                            f"la configuración actual ({Config.FEATURE_DIMENSION}). "
                            f"Recreando índice vacío."
                        )
                        # Eliminar archivos incompatibles y crear uno nuevo
                        try:
                            Config.FAISS_INDEX_PATH.unlink(missing_ok=True)
                            Config.METADATA_PATH.unlink(missing_ok=True)
                        except Exception:
                            pass
                        self._create_new_index()
                        logger.info(f"Nuevo índice FAISS L2 creado con dimensión {Config.FEATURE_DIMENSION}")
                    else:
                        logger.info(f"Índice FAISS cargado: {self.index.ntotal} vectores (dim={self.index.d})")
                else:
                    # Crear nuevo índice
                    self._create_new_index()
                    logger.info(f"Nuevo índice FAISS L2 creado con dimensión {Config.FEATURE_DIMENSION}")
            except Exception as e:
                logger.error(f"Error inicializando índice: {e}")
                self._create_new_index()
    
    def _create_new_index(self):
        """Crea un nuevo índice FAISS vacío usando distancia L2"""
        # Usar IndexFlatL2 para distancia euclidiana
        # Menor distancia = más similar
        self.index = faiss.IndexFlatL2(Config.FEATURE_DIMENSION)
        self.metadata = {}
        
        # Guardar índice vacío
        self._save_index()
    
    def _load_index(self):
        """Carga índice existente desde disco"""
        try:
            self.index = faiss.read_index(str(Config.FAISS_INDEX_PATH))
            
            with open(Config.METADATA_PATH, 'r') as f:
                self.metadata = json.load(f)
                
        except Exception as e:
            logger.error(f"Error cargando índice: {e}")
            raise
    
    def _save_index(self):
        """Guarda índice en disco"""
        try:
            Config.FEATURES_DIR.mkdir(exist_ok=True)
            
            # Guardar índice FAISS
            faiss.write_index(self.index, str(Config.FAISS_INDEX_PATH))
            
            # Guardar metadata
            with open(Config.METADATA_PATH, 'w') as f:
                json.dump(self.metadata, f, indent=2)
                
            logger.debug("Índice guardado exitosamente")
            
        except Exception as e:
            logger.error(f"Error guardando índice: {e}")
            raise
    
    def add_feature(self, feature_id: str, feature_vector: np.ndarray, metadata: Dict = None):
        """
        Añade un vector de características al índice
        
        Args:
            feature_id: ID único del feature
            feature_vector: Vector de características normalizado
            metadata: Metadata adicional asociada al feature
        """
        with self.lock:
            try:
                # Normalizar vector para consistencia en búsqueda L2
                if np.linalg.norm(feature_vector) > 0:
                    feature_vector = feature_vector / np.linalg.norm(feature_vector)
                
                # Asegurar formato correcto
                if feature_vector.ndim == 1:
                    feature_vector = feature_vector.reshape(1, -1)
                
                # Verificar dimensión
                if feature_vector.shape[1] != Config.FEATURE_DIMENSION:
                    raise ValueError(f"Dimensión incorrecta: {feature_vector.shape[1]} != {Config.FEATURE_DIMENSION}")
                
                # Añadir al índice
                current_id = self.index.ntotal
                self.index.add(feature_vector.astype(np.float32))
                
                # Guardar metadata
                self.metadata[str(current_id)] = {
                    'feature_id': feature_id,
                    'metadata': metadata or {},
                    'timestamp': str(np.datetime64('now'))
                }
                
                # Invalidar cache si existe
                if self.redis_client:
                    try:
                        self.redis_client.delete(f"search:*")
                    except:
                        pass
                
                # Persistir inmediatamente para no perder datos si el servidor reinicia
                self._save_index()
                
                logger.debug(f"Feature añadido: {feature_id} -> índice {current_id}")
                return current_id
                
            except Exception as e:
                logger.error(f"Error añadiendo feature {feature_id}: {e}")
                raise
    
    def search_similar(self, query_vector: np.ndarray, k: int = None, filter_ids: set = None, filter_class: str = None) -> List[Tuple[str, float]]:
        """
        Busca vectores similares usando distancia L2.
        
        Para L2: menor distancia = más similar.
        Retorna resultados ordenados de más similar a menos similar.
        
        Args:
            query_vector: Vector de consulta
            k: Número máximo de resultados a retornar
            filter_ids: Set opcional de feature_ids permitidos. Si se proporciona,
                        solo se devuelven resultados cuyo feature_id esté en este set.
                        FAISS busca en todo el índice para no perder matches válidos.
            filter_class: Clase de animal para filtrar (ej: 'dog', 'cat'). Si se proporciona,
                          solo se devuelven resultados cuya metadata tenga la misma clase.
            
        Returns:
            Lista de (feature_id, distance) ordenada por distancia ascendente
        """
        if k is None:
            k = Config.MAX_SEARCH_RESULTS
        
        with self.lock:
            try:
                if self.index.ntotal == 0:
                    return []
                
                # Normalizar query vector
                if np.linalg.norm(query_vector) > 0:
                    query_vector = query_vector / np.linalg.norm(query_vector)
                
                # Asegurar formato correcto
                if query_vector.ndim == 1:
                    query_vector = query_vector.reshape(1, -1)
                
                # Verificar en cache si existe
                query_hash = None
                if self.redis_client:
                    # Incluir filter_ids y filter_class en el hash del cache
                    filter_key = ','.join(sorted(filter_ids)) if filter_ids else 'all'
                    class_key = filter_class or 'all'
                    query_hash = str(hash(query_vector.tobytes() + filter_key.encode() + class_key.encode()))
                    cached_result = self.redis_client.get(f"search:{query_hash}:{k}")
                    if cached_result:
                        logger.debug("Resultado obtenido desde cache")
                        return json.loads(cached_result)
                
                # Cuando se filtran por IDs específicos o por clase, buscar en TODO
                # el índice para no perder matches válidos que estarían más allá del top-k global.
                # IndexFlatL2 es búsqueda exhaustiva de todas formas, así que no hay
                # penalización de rendimiento por buscar todos los vectores.
                if filter_ids or filter_class:
                    k_search = self.index.ntotal
                else:
                    k_search = min(k, self.index.ntotal)
                
                distances, indices = self.index.search(
                    query_vector.astype(np.float32), 
                    k_search
                )
                
                # Procesar resultados
                # Para L2: menor distancia = más similar
                # Filtramos por MAX_L2_DISTANCE, filter_ids y filter_class
                results = []
                for idx, dist in zip(indices[0], distances[0]):
                    if idx >= 0 and str(idx) in self.metadata:
                        entry = self.metadata[str(idx)]
                        feature_id = entry['feature_id']
                        
                        # Filtrar por IDs permitidos si se proporcionaron
                        if filter_ids and feature_id not in filter_ids:
                            continue
                        
                        # Filtrar por clase de animal (perro con perro, gato con gato)
                        if filter_class:
                            stored_class = entry.get('metadata', {}).get('animal_class', None)
                            if stored_class and stored_class != filter_class:
                                continue
                        
                        # Filtrar por umbral de distancia máxima
                        if dist <= Config.MAX_L2_DISTANCE:
                            results.append((feature_id, float(dist)))
                        
                        # Si ya tenemos suficientes resultados, cortar
                        if len(results) >= k:
                            break
                
                # Guardar en cache
                if self.redis_client and query_hash:
                    try:
                        self.redis_client.setex(
                            f"search:{query_hash}:{k}", 
                            3600,  # 1 hora de cache
                            json.dumps(results)
                        )
                    except:
                        pass
                
                logger.debug(f"Búsqueda completada: {len(results)} resultados (filter_ids: {len(filter_ids) if filter_ids else 'none'}, filter_class: {filter_class or 'none'})")
                return results
                
            except Exception as e:
                logger.error(f"Error en búsqueda: {e}")
                raise
    
    def remove_features(self, feature_ids: List[str]) -> Tuple[List[str], List[str]]:
        """
        Elimina features del índice
        
        Args:
            feature_ids: Lista de IDs a eliminar
            
        Returns:
            (removed_ids, not_found_ids)
        """
        with self.lock:
            removed_ids = []
            not_found_ids = []
            
            # Identificar índices a eliminar
            indices_to_remove = []
            for internal_id, data in self.metadata.items():
                if data['feature_id'] in feature_ids:
                    indices_to_remove.append(int(internal_id))
                    removed_ids.append(data['feature_id'])
            
            # Identificar IDs no encontrados
            for feature_id in feature_ids:
                if feature_id not in removed_ids:
                    not_found_ids.append(feature_id)
            
            if indices_to_remove:
                # Para FAISS necesitamos reconstruir el índice sin los elementos eliminados
                self._rebuild_index_without_indices(indices_to_remove)
                
                # Invalidar cache
                if self.redis_client:
                    try:
                        self.redis_client.delete(f"search:*")
                    except:
                        pass
                
                logger.info(f"Eliminados {len(removed_ids)} features")
            
            return removed_ids, not_found_ids
    
    def _rebuild_index_without_indices(self, indices_to_remove: List[int]):
        """Reconstruye el índice excluyendo ciertos índices"""
        try:
            # Obtener todos los vectores actuales
            all_vectors = []
            new_metadata = {}
            new_internal_id = 0
            
            for internal_id in range(self.index.ntotal):
                if internal_id not in indices_to_remove:
                    # Reconstruir vector desde el índice
                    vector = self.index.reconstruct(internal_id)
                    all_vectors.append(vector)
                    
                    # Actualizar metadata con nuevo ID
                    if str(internal_id) in self.metadata:
                        new_metadata[str(new_internal_id)] = self.metadata[str(internal_id)]
                        new_internal_id += 1
            
            # Crear nuevo índice L2
            self.index = faiss.IndexFlatL2(Config.FEATURE_DIMENSION)
            self.metadata = new_metadata
            
            # Añadir vectores al nuevo índice
            if all_vectors:
                vectors_matrix = np.vstack(all_vectors)
                self.index.add(vectors_matrix)
            
            # Guardar cambios
            self._save_index()
            
        except Exception as e:
            logger.error(f"Error reconstruyendo índice: {e}")
            raise
    
    def get_stats(self) -> Dict:
        """Retorna estadísticas del índice"""
        with self.lock:
            return {
                'total_vectors': self.index.ntotal,
                'dimension': Config.FEATURE_DIMENSION,
                'index_type': 'IndexFlatL2',
                'metadata_count': len(self.metadata),
                'redis_enabled': self.redis_client is not None
            }
    
    # NOTA: No implementamos __del__ para guardar el índice.
    # Durante el shutdown de Python, los built-ins (como open) ya no están
    # disponibles, lo que causa "name 'open' is not defined" y puede
    # corromper el índice guardando un estado vacío/parcial.
    # _save_index() ya se llama después de cada add_feature() y remove_features(),
    # por lo que los datos siempre están persistidos en disco.
