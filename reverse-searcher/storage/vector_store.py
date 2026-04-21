import numpy as np
import json
import threading
import uuid
from typing import List, Tuple, Dict, Optional, Set
from config import Config
from utils.logger import logger
import redis

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    HasIdCondition,
    FilterSelector,
    SearchParams,
)


class VectorStore:
    """Sistema de almacenamiento vectorial con Qdrant"""

    COLLECTION_NAME = "pet_features"

    def __init__(self):
        self.lock = threading.RLock()
        self.redis_client = None
        self.qdrant = None

        # Configurar Redis si está habilitado
        if Config.REDIS_ENABLED:
            try:
                self.redis_client = redis.Redis(
                    host=Config.REDIS_HOST,
                    port=Config.REDIS_PORT,
                    db=Config.REDIS_DB,
                    decode_responses=True,
                    socket_timeout=5,
                    socket_connect_timeout=5,
                )
                # Test connection
                self.redis_client.ping()
                logger.info("Redis conectado exitosamente")
            except Exception as e:
                logger.warning(f"No se pudo conectar a Redis: {e}")
                self.redis_client = None

        self._initialize_qdrant()

    def _initialize_qdrant(self):
        """Inicializa la conexión a Qdrant y crea la colección si no existe"""
        with self.lock:
            try:
                self.qdrant = QdrantClient(
                    host=Config.QDRANT_HOST,
                    port=Config.QDRANT_PORT,
                    timeout=30,
                )

                # Verificar conexión
                self.qdrant.get_collections()
                logger.info(
                    f"Qdrant conectado exitosamente en {Config.QDRANT_HOST}:{Config.QDRANT_PORT}"
                )

                # Crear colección si no existe
                collections = [
                    c.name for c in self.qdrant.get_collections().collections
                ]

                if self.COLLECTION_NAME not in collections:
                    self.qdrant.create_collection(
                        collection_name=self.COLLECTION_NAME,
                        vectors_config=VectorParams(
                            size=Config.FEATURE_DIMENSION,
                            distance=Distance.EUCLID,
                        ),
                    )
                    logger.info(
                        f"Colección '{self.COLLECTION_NAME}' creada con dimensión {Config.FEATURE_DIMENSION} (L2/Euclid)"
                    )
                else:
                    info = self.qdrant.get_collection(self.COLLECTION_NAME)
                    logger.info(
                        f"Colección '{self.COLLECTION_NAME}' existente: {info.points_count} puntos"
                    )

                    # Verificar dimensión
                    if info.config.params.vectors.size != Config.FEATURE_DIMENSION:
                        logger.warning(
                            f"Dimensión de colección ({info.config.params.vectors.size}) no coincide "
                            f"con configuración ({Config.FEATURE_DIMENSION}). Recreando colección."
                        )
                        self.qdrant.delete_collection(self.COLLECTION_NAME)
                        self.qdrant.create_collection(
                            collection_name=self.COLLECTION_NAME,
                            vectors_config=VectorParams(
                                size=Config.FEATURE_DIMENSION,
                                distance=Distance.EUCLID,
                            ),
                        )
                        logger.info(
                            f"Colección recreada con dimensión {Config.FEATURE_DIMENSION}"
                        )

            except Exception as e:
                logger.error(f"Error inicializando Qdrant: {e}")
                raise

    @staticmethod
    def _feature_id_to_uuid(feature_id: str) -> str:
        """Convierte un feature_id string a un UUID determinístico para Qdrant.
        
        Qdrant requiere UUIDs o enteros como IDs de punto.
        Usamos UUID5 basado en el feature_id para generar un ID determinístico,
        de modo que el mismo feature_id siempre produce el mismo UUID.
        """
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, feature_id))

    def add_feature(
        self, feature_id: str, feature_vector: np.ndarray, metadata: Dict = None
    ):
        """
        Añade un vector de características a Qdrant

        Args:
            feature_id: ID único del feature (ej: MongoDB ObjectId string)
            feature_vector: Vector de características
            metadata: Metadata adicional asociada al feature
        """
        with self.lock:
            try:
                # Normalizar vector para consistencia en búsqueda L2
                if np.linalg.norm(feature_vector) > 0:
                    feature_vector = feature_vector / np.linalg.norm(feature_vector)

                # Asegurar formato correcto
                if feature_vector.ndim != 1:
                    feature_vector = feature_vector.flatten()

                # Verificar dimensión
                if feature_vector.shape[0] != Config.FEATURE_DIMENSION:
                    raise ValueError(
                        f"Dimensión incorrecta: {feature_vector.shape[0]} != {Config.FEATURE_DIMENSION}"
                    )

                # Construir payload con metadata
                payload = {
                    "feature_id": feature_id,
                    **(metadata or {}),
                }

                # Generar UUID determinístico a partir del feature_id
                point_id = self._feature_id_to_uuid(feature_id)

                # Upsert en Qdrant (inserta o actualiza si ya existe)
                self.qdrant.upsert(
                    collection_name=self.COLLECTION_NAME,
                    points=[
                        PointStruct(
                            id=point_id,
                            vector=feature_vector.astype(np.float32).tolist(),
                            payload=payload,
                        )
                    ],
                )

                # Invalidar cache si existe
                if self.redis_client:
                    try:
                        self.redis_client.delete("search:*")
                    except Exception:
                        pass

                logger.debug(f"Feature añadido a Qdrant: {feature_id} -> {point_id}")
                return point_id

            except Exception as e:
                logger.error(f"Error añadiendo feature {feature_id}: {e}")
                raise

    def search_similar(
        self,
        query_vector: np.ndarray,
        k: int = None,
        filter_ids: Set[str] = None,
        filter_class: str = None,
    ) -> List[Tuple[str, float]]:
        """
        Busca vectores similares usando distancia L2 (Euclid).

        Para L2: menor distancia = más similar.
        Retorna resultados ordenados de más similar a menos similar.

        Args:
            query_vector: Vector de consulta
            k: Número máximo de resultados a retornar
            filter_ids: Set opcional de feature_ids permitidos. Si se proporciona,
                        solo se devuelven resultados cuyo feature_id esté en este set.
            filter_class: Clase de animal para filtrar (ej: 'dog', 'cat'). Si se proporciona,
                          solo se devuelven resultados cuya metadata tenga la misma clase.

        Returns:
            Lista de (feature_id, distance) ordenada por distancia ascendente
        """
        if k is None:
            k = Config.MAX_SEARCH_RESULTS

        with self.lock:
            try:
                collection_info = self.qdrant.get_collection(self.COLLECTION_NAME)
                if collection_info.points_count == 0:
                    return []

                # Normalizar query vector
                if np.linalg.norm(query_vector) > 0:
                    query_vector = query_vector / np.linalg.norm(query_vector)

                # Asegurar formato correcto
                if query_vector.ndim != 1:
                    query_vector = query_vector.flatten()

                # Verificar en cache si existe
                query_hash = None
                if self.redis_client:
                    filter_key = (
                        ",".join(sorted(filter_ids)) if filter_ids else "all"
                    )
                    class_key = filter_class or "all"
                    query_hash = str(
                        hash(
                            query_vector.tobytes()
                            + filter_key.encode()
                            + class_key.encode()
                        )
                    )
                    cached_result = self.redis_client.get(f"search:{query_hash}:{k}")
                    if cached_result:
                        logger.debug("Resultado obtenido desde cache")
                        return json.loads(cached_result)

                # Construir filtros nativos de Qdrant
                must_conditions = []

                # Filtrar por IDs permitidos (feature_ids de la ciudad)
                if filter_ids:
                    # Convertir feature_ids a UUIDs de Qdrant
                    qdrant_ids = [
                        self._feature_id_to_uuid(fid) for fid in filter_ids
                    ]
                    must_conditions.append(HasIdCondition(has_id=qdrant_ids))

                # Filtrar por clase de animal
                if filter_class:
                    must_conditions.append(
                        FieldCondition(
                            key="animal_class",
                            match=MatchValue(value=filter_class),
                        )
                    )

                search_filter = (
                    Filter(must=must_conditions) if must_conditions else None
                )

                # Buscar en Qdrant
                # Qdrant maneja internamente la búsqueda con filtros pre-aplicados
                query_response = self.qdrant.search(
                    collection_name=self.COLLECTION_NAME,
                    query_vector=query_vector.astype(np.float32).tolist(),
                    query_filter=search_filter,
                    limit=k,
                    score_threshold=Config.MAX_L2_DISTANCE,
                    with_payload=True,
                )
                results = query_response

                # Procesar resultados
                processed_results = []
                for hit in results:
                    feature_id = hit.payload.get("feature_id", "")
                    distance = hit.score
                    processed_results.append((feature_id, float(distance)))

                # Guardar en cache
                if self.redis_client and query_hash:
                    try:
                        self.redis_client.setex(
                            f"search:{query_hash}:{k}",
                            3600,  # 1 hora de cache
                            json.dumps(processed_results),
                        )
                    except Exception:
                        pass

                logger.debug(
                    f"Búsqueda completada: {len(processed_results)} resultados "
                    f"(filter_ids: {len(filter_ids) if filter_ids else 'none'}, "
                    f"filter_class: {filter_class or 'none'})"
                )
                return processed_results

            except Exception as e:
                logger.error(f"Error en búsqueda: {e}")
                raise

    def remove_features(self, feature_ids: List[str]) -> Tuple[List[str], List[str]]:
        """
        Elimina features de Qdrant

        Args:
            feature_ids: Lista de feature_ids a eliminar

        Returns:
            (removed_ids, not_found_ids)
        """
        with self.lock:
            removed_ids = []
            not_found_ids = []

            for feature_id in feature_ids:
                try:
                    point_id = self._feature_id_to_uuid(feature_id)

                    # Verificar si existe
                    existing = self.qdrant.retrieve(
                        collection_name=self.COLLECTION_NAME,
                        ids=[point_id],
                    )

                    if existing:
                        self.qdrant.delete(
                            collection_name=self.COLLECTION_NAME,
                            points_selector=[point_id],
                        )
                        removed_ids.append(feature_id)
                    else:
                        not_found_ids.append(feature_id)

                except Exception as e:
                    logger.warning(
                        f"Error eliminando feature {feature_id}: {e}"
                    )
                    not_found_ids.append(feature_id)

            # Invalidar cache
            if self.redis_client and removed_ids:
                try:
                    self.redis_client.delete("search:*")
                except Exception:
                    pass

            logger.info(f"Eliminados {len(removed_ids)} features de Qdrant")
            return removed_ids, not_found_ids

    def get_stats(self) -> Dict:
        """Retorna estadísticas de la colección"""
        with self.lock:
            try:
                info = self.qdrant.get_collection(self.COLLECTION_NAME)
                return {
                    "total_vectors": info.points_count,
                    "dimension": Config.FEATURE_DIMENSION,
                    "index_type": "Qdrant (Euclid/L2)",
                    "collection_name": self.COLLECTION_NAME,
                    "status": str(info.status),
                    "redis_enabled": self.redis_client is not None,
                }
            except Exception as e:
                logger.error(f"Error obteniendo stats de Qdrant: {e}")
                return {
                    "total_vectors": 0,
                    "dimension": Config.FEATURE_DIMENSION,
                    "index_type": "Qdrant (Euclid/L2)",
                    "collection_name": self.COLLECTION_NAME,
                    "status": "error",
                    "redis_enabled": self.redis_client is not None,
                }
