import numpy as np
from ultralytics import YOLO
from sentence_transformers import SentenceTransformer
from PIL import Image
from typing import Union, Optional, Tuple
from pathlib import Path
import hashlib
from config import Config
from utils.logger import logger, log_request_info


class NoAnimalDetectedError(ValueError):
    """Error raised when no animal (cat/dog) is detected in the image"""
    pass


class FeatureExtractor:
    """
    Extractor de características usando pipeline de 2 etapas:
    1. YOLOv8 para detección y recorte inteligente de mascotas
    2. CLIP para generación de embeddings semánticos
    """
    
    def __init__(self):
        """Inicializa el extractor con YOLOv8 y CLIP"""
        self.yolo_model = None
        self.clip_model = None
        self.feature_cache = {}  # Cache simple en memoria
        
        logger.info("Inicializando FeatureExtractor con YOLOv8 + CLIP pipeline")
        self._load_models()
    
    def _load_models(self):
        """Carga los modelos YOLOv8 y CLIP"""
        try:
            # Cargar YOLOv8 nano para detección rápida
            logger.info(f"Cargando modelo YOLO: {Config.YOLO_MODEL}")
            self.yolo_model = YOLO(Config.YOLO_MODEL)
            logger.info("YOLOv8 cargado exitosamente")
            
            # Cargar CLIP para embeddings
            logger.info(f"Cargando modelo CLIP: {Config.CLIP_MODEL}")
            self.clip_model = SentenceTransformer(Config.CLIP_MODEL)
            logger.info("CLIP cargado exitosamente")
            
        except Exception as e:
            logger.error(f"Error cargando modelos: {e}")
            raise
    
    def detect_and_crop(self, img: Union[Image.Image, np.ndarray, str]) -> Image.Image:
        """
        Detecta un perro o gato en la imagen y recorta al bounding box.
        
        Args:
            img: PIL Image, numpy array, o path a imagen
            
        Returns:
            Imagen PIL recortada al animal detectado
            
        Raises:
            NoAnimalDetectedError: Si no se detecta ningún perro o gato
        """
        # Convertir a PIL Image si es necesario
        pil_img = self._prepare_image(img)
        
        # Ejecutar detección con YOLOv8
        results = self.yolo_model.predict(
            source=pil_img,
            conf=Config.YOLO_CONFIDENCE_THRESHOLD,
            classes=Config.ANIMAL_CLASSES,  # Solo cat (16) y dog (17)
            verbose=False
        )
        
        # Verificar si hay detecciones
        if not results or len(results) == 0:
            raise NoAnimalDetectedError("No se detectó ningún animal en la imagen")
        
        result = results[0]
        
        if result.boxes is None or len(result.boxes) == 0:
            raise NoAnimalDetectedError("No se detectó ningún perro o gato en la imagen")
        
        # Obtener la detección con mayor confianza
        boxes = result.boxes
        confidences = boxes.conf.cpu().numpy()
        best_idx = np.argmax(confidences)
        
        # Obtener coordenadas del bounding box (xyxy format)
        best_box = boxes.xyxy[best_idx].cpu().numpy()
        x1, y1, x2, y2 = map(int, best_box)
        
        # Obtener información de la clase detectada
        class_id = int(boxes.cls[best_idx].cpu().numpy())
        class_name = self.yolo_model.names.get(class_id, "unknown")
        confidence = confidences[best_idx]
        
        logger.debug(f"Animal detectado: {class_name} con confianza {confidence:.2f}")
        logger.debug(f"Bounding box: [{x1}, {y1}, {x2}, {y2}]")
        
        # Recortar la imagen al bounding box
        cropped_img = pil_img.crop((x1, y1, x2, y2))
        
        return cropped_img
    
    def get_embedding(self, img: Image.Image) -> np.ndarray:
        """
        Genera el embedding de una imagen usando CLIP.
        
        Args:
            img: Imagen PIL (típicamente el recorte del animal)
            
        Returns:
            Vector de características numpy de 512 dimensiones
        """
        # CLIP encode acepta directamente PIL Images
        embedding = self.clip_model.encode(img)
        
        # Asegurar que sea numpy array
        if not isinstance(embedding, np.ndarray):
            embedding = np.array(embedding)
        
        logger.debug(f"Embedding generado: shape {embedding.shape}")
        
        return embedding
    
    @log_request_info
    def extract(self, img: Union[Image.Image, np.ndarray, str]) -> np.ndarray:
        """
        Pipeline completo: detecta animal, recorta y genera embedding.
        
        Args:
            img: PIL Image, numpy array, o path a imagen
            
        Returns:
            Vector de características normalizado (512 dimensiones)
            
        Raises:
            NoAnimalDetectedError: Si no se detecta ningún perro o gato
            ValueError: Si hay error procesando la imagen
        """
        try:
            # Preparar imagen
            pil_img = self._prepare_image(img)
            
            # Verificar cache por hash de imagen
            img_hash = self._get_image_hash(pil_img)
            if img_hash in self.feature_cache:
                logger.debug("Feature obtenida desde cache")
                return self.feature_cache[img_hash]
            
            # Etapa 1: Detección y recorte con YOLOv8
            cropped_img = self.detect_and_crop(pil_img)
            
            # Etapa 2: Embedding con CLIP
            features = self.get_embedding(cropped_img)
            
            # Normalizar vector para búsqueda por similitud
            norm = np.linalg.norm(features)
            if norm > 0:
                features = features / norm
            
            # Guardar en cache (limitado a 100 elementos)
            if len(self.feature_cache) < 100:
                self.feature_cache[img_hash] = features
            
            logger.debug(f"Feature extraída: shape {features.shape}")
            return features
            
        except NoAnimalDetectedError:
            # Re-lanzar este error específico
            raise
        except Exception as e:
            logger.error(f"Error extrayendo características: {e}")
            raise ValueError(f"Error procesando imagen: {str(e)}")
    
    def _prepare_image(self, img: Union[Image.Image, np.ndarray, str]) -> Image.Image:
        """Convierte entrada a PIL Image"""
        if isinstance(img, str):
            # Path a archivo
            img = Image.open(img)
        elif isinstance(img, np.ndarray):
            # Numpy array
            img = Image.fromarray(img)
        elif not isinstance(img, Image.Image):
            raise ValueError(f"Tipo de imagen no soportado: {type(img)}")
        
        # Asegurar modo RGB
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        return img
    
    def _get_image_hash(self, pil_img: Image.Image) -> str:
        """Genera hash para cache"""
        img_bytes = pil_img.tobytes()
        return hashlib.md5(img_bytes).hexdigest()
    
    def extract_batch(self, images: list) -> Tuple[np.ndarray, list]:
        """
        Extrae características de múltiples imágenes.
        
        Args:
            images: Lista de imágenes (PIL, numpy, o paths)
            
        Returns:
            Tuple de (array de características, lista de índices fallidos)
            El array tiene shape (n_successful, 512)
        """
        try:
            if not images:
                return np.array([]), []
            
            features_list = []
            failed_indices = []
            
            for idx, img in enumerate(images):
                try:
                    features = self.extract(img)
                    features_list.append(features)
                except NoAnimalDetectedError as e:
                    logger.warning(f"Imagen {idx}: {str(e)}")
                    failed_indices.append(idx)
                except Exception as e:
                    logger.error(f"Error procesando imagen {idx}: {e}")
                    failed_indices.append(idx)
            
            if features_list:
                return np.array(features_list), failed_indices
            else:
                return np.array([]), failed_indices
            
        except Exception as e:
            logger.error(f"Error en extracción batch: {e}")
            raise
    
    def get_model_info(self) -> dict:
        """Retorna información de los modelos actuales"""
        return {
            "pipeline": "YOLOv8 + CLIP",
            "yolo_model": Config.YOLO_MODEL,
            "clip_model": Config.CLIP_MODEL,
            "feature_dimension": Config.FEATURE_DIMENSION,
            "animal_classes": {
                "ids": Config.ANIMAL_CLASSES,
                "names": ["cat (15)", "dog (16)"]
            },
            "yolo_confidence_threshold": Config.YOLO_CONFIDENCE_THRESHOLD
        }
    
    def benchmark(self, num_images: int = 10) -> dict:
        """
        Ejecuta benchmark del pipeline.
        
        Args:
            num_images: Número de imágenes sintéticas para benchmark
            
        Returns:
            Estadísticas de rendimiento
        """
        import time
        
        try:
            # Crear imágenes sintéticas con contenido de animal simulado
            # Nota: Estas no tendrán animales reales, así que medimos el tiempo de detección
            synthetic_images = []
            for _ in range(num_images):
                # Crear imagen con patrón para simular contenido
                img = Image.new('RGB', (640, 640), 
                              color=(np.random.randint(0, 255), 
                                   np.random.randint(0, 255), 
                                   np.random.randint(0, 255)))
                synthetic_images.append(img)
            
            # Benchmark de detección YOLO (sin extracción completa ya que no hay animales)
            start_time = time.time()
            detection_count = 0
            for img in synthetic_images:
                try:
                    results = self.yolo_model.predict(
                        source=img,
                        conf=Config.YOLO_CONFIDENCE_THRESHOLD,
                        classes=Config.ANIMAL_CLASSES,
                        verbose=False
                    )
                    detection_count += 1
                except:
                    pass
            yolo_time = time.time() - start_time
            
            # Benchmark de CLIP embedding (usando imágenes directamente)
            start_time = time.time()
            for img in synthetic_images:
                _ = self.clip_model.encode(img)
            clip_time = time.time() - start_time
            
            return {
                "yolo_detection": {
                    "total_time": round(yolo_time, 3),
                    "avg_per_image": round(yolo_time / num_images, 3),
                    "images_per_second": round(num_images / yolo_time, 2)
                },
                "clip_embedding": {
                    "total_time": round(clip_time, 3),
                    "avg_per_image": round(clip_time / num_images, 3),
                    "images_per_second": round(num_images / clip_time, 2)
                },
                "combined_estimate": {
                    "avg_per_image": round((yolo_time + clip_time) / num_images, 3),
                    "images_per_second": round(num_images / (yolo_time + clip_time), 2)
                },
                "note": "Benchmark con imágenes sintéticas (sin animales reales)"
            }
            
        except Exception as e:
            logger.error(f"Error en benchmark: {e}")
            return {"error": str(e)}
    
    def clear_cache(self):
        """Limpia el cache de características"""
        self.feature_cache.clear()
        logger.debug("Cache de características limpiado")
