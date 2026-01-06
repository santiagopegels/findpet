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
                    logger.info(f"Índice FAISS cargado: {self.index.ntotal} vectores")
                else:
                    # Crear nuevo índice
                    self._create_new_index()
                    logger.info("Nuevo índice FAISS L2 creado")
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
                
                # Guardar cambios cada 10 adiciones
                if self.index.ntotal % 10 == 0:
                    self._save_index()
                
                logger.debug(f"Feature añadido: {feature_id} -> índice {current_id}")
                return current_id
                
            except Exception as e:
                logger.error(f"Error añadiendo feature {feature_id}: {e}")
                raise
    
    def search_similar(self, query_vector: np.ndarray, k: int = None) -> List[Tuple[str, float]]:
        """
        Busca vectores similares usando distancia L2.
        
        Para L2: menor distancia = más similar.
        Retorna resultados ordenados de más similar a menos similar.
        
        Args:
            query_vector: Vector de consulta
            k: Número de resultados a retornar
            
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
                    query_hash = str(hash(query_vector.tobytes()))
                    cached_result = self.redis_client.get(f"search:{query_hash}:{k}")
                    if cached_result:
                        logger.debug("Resultado obtenido desde cache")
                        return json.loads(cached_result)
                
                # Buscar en FAISS (retorna distancias L2, no similitudes)
                k_search = min(k, self.index.ntotal)
                distances, indices = self.index.search(
                    query_vector.astype(np.float32), 
                    k_search
                )
                
                # Procesar resultados
                # Para L2: menor distancia = más similar
                # Filtramos por MAX_L2_DISTANCE (umbral máximo de distancia)
                results = []
                for idx, dist in zip(indices[0], distances[0]):
                    if idx >= 0 and str(idx) in self.metadata:
                        feature_id = self.metadata[str(idx)]['feature_id']
                        # Filtrar por umbral de distancia máxima
                        if dist <= Config.MAX_L2_DISTANCE:
                            results.append((feature_id, float(dist)))
                
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
                
                logger.debug(f"Búsqueda completada: {len(results)} resultados")
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
    
    def __del__(self):
        """Limpieza al destruir el objeto"""
        try:
            if hasattr(self, 'index') and self.index is not None:
                self._save_index()
        except:
            pass
