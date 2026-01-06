import os
import sys
from pathlib import Path
from typing import Dict, List
import base64
import hashlib
import time
from io import BytesIO
from functools import wraps

# Flask y extensions
from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge

# Componentes del proyecto
from config import Config
from utils.logger import logger, log_request_info
from utils.image_validator import ImageValidator
from models.feature_extractor import FeatureExtractor
from storage.vector_store import VectorStore

# Configurar límites de memoria para TensorFlow
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

class ReverseSearchServer:
    """Servidor optimizado para búsqueda reversa de imágenes"""
    
    def __init__(self):
        self.app = Flask(__name__)
        self.setup_flask()
        
        # Componentes principales
        self.feature_extractor = None
        self.vector_store = None
        self.image_validator = ImageValidator()
        
        # Estadísticas
        self.stats = {
            'requests_total': 0,
            'requests_successful': 0,
            'requests_failed': 0,
            'features_added': 0,
            'features_removed': 0,
            'searches_performed': 0,
            'startup_time': time.time()
        }
        
        # Inicializar componentes
        self.initialize_components()
        self.setup_routes()
        
        logger.info("ReverseSearchServer inicializado exitosamente")
    
    def setup_flask(self):
        """Configura Flask con middleware y configuraciones"""
        # CORS
        CORS(self.app, origins="*")
        
        # Configuraciones de Flask
        self.app.config['MAX_CONTENT_LENGTH'] = Config.MAX_IMAGE_SIZE
        self.app.config['JSON_SORT_KEYS'] = False
        
        # Manejo de errores globales
        self.setup_error_handlers()
        
        # Middleware de logging
        @self.app.before_request
        def log_request():
            logger.info(f"Request: {request.method} {request.path}", extra={
                'method': request.method,
                'path': request.path,
                'remote_addr': request.remote_addr,
                'user_agent': request.headers.get('User-Agent', 'unknown')
            })
            self.stats['requests_total'] += 1
        
        @self.app.after_request
        def log_response(response):
            logger.info(f"Response: {response.status_code}", extra={
                'status_code': response.status_code,
                'content_type': response.content_type
            })
            if response.status_code < 400:
                self.stats['requests_successful'] += 1
            else:
                self.stats['requests_failed'] += 1
            return response
    
    def setup_error_handlers(self):
        """Configura manejadores de error personalizados"""
        
        @self.app.errorhandler(400)
        def bad_request(error):
            return jsonify({
                'status': 400,
                'message': 'Solicitud inválida',
                'error': str(error.description) if hasattr(error, 'description') else 'Bad Request'
            }), 400
        
        @self.app.errorhandler(403)
        def forbidden(error):
            return jsonify({
                'status': 403,
                'message': 'Acceso denegado',
                'error': 'API Key inválida o ausente'
            }), 403
        
        @self.app.errorhandler(413)
        def request_entity_too_large(error):
            return jsonify({
                'status': 413,
                'message': 'Archivo demasiado grande',
                'error': f'Tamaño máximo permitido: {Config.MAX_IMAGE_SIZE} bytes'
            }), 413
        
        @self.app.errorhandler(500)
        def internal_error(error):
            logger.error(f"Error interno: {str(error)}")
            return jsonify({
                'status': 500,
                'message': 'Error interno del servidor',
                'error': 'Por favor contacte al administrador'
            }), 500
        
        @self.app.errorhandler(Exception)
        def handle_exception(error):
            logger.error(f"Excepción no manejada: {str(error)}", exc_info=True)
            return jsonify({
                'status': 500,
                'message': 'Error inesperado',
                'error': str(error) if Config.DEBUG else 'Error interno'
            }), 500
    
    def initialize_components(self):
        """Inicializa los componentes principales"""
        try:
            # Validar configuración
            config_errors = Config.validate()
            if config_errors:
                logger.error(f"Errores de configuración: {config_errors}")
                sys.exit(1)
            
            # Crear directorios necesarios
            Config.setup_directories()
            
            # Inicializar extractor de características
            logger.info("Inicializando extractor de características...")
            self.feature_extractor = FeatureExtractor()
            
            # Inicializar almacén vectorial
            logger.info("Inicializando almacén vectorial...")
            self.vector_store = VectorStore()
            
            logger.info("Componentes inicializados exitosamente")
            
        except Exception as e:
            logger.error(f"Error inicializando componentes: {e}")
            sys.exit(1)
    
    def require_api_key(self, f):
        """Decorator para validar API key"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            api_key = request.headers.get('X-API-KEY')
            if not api_key or api_key != Config.API_KEY:
                logger.warning(f"Intento de acceso con API key inválida desde {request.remote_addr}")
                abort(403)
            return f(*args, **kwargs)
        return decorated_function
    
    def validate_json_request(self, required_fields: List[str]):
        """Decorator para validar campos requeridos en JSON"""
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                if not request.is_json:
                    abort(400, description="Content-Type debe ser application/json")
                
                data = request.get_json()
                if not data:
                    abort(400, description="Body JSON requerido")
                
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    abort(400, description=f"Campos faltantes: {', '.join(missing_fields)}")
                
                return f(*args, **kwargs)
            return decorated_function
        return decorator
    
    def setup_routes(self):
        """Configura las rutas del API"""
        
        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Endpoint de health check"""
            return jsonify({
                'status': 'healthy',
                'timestamp': time.time(),
                'version': '2.0.0',
                'pipeline': 'YOLOv8 + CLIP',
                'yolo_model': Config.YOLO_MODEL,
                'clip_model': Config.CLIP_MODEL,
                'vector_store_stats': self.vector_store.get_stats()
            })
        
        @self.app.route('/stats', methods=['GET'])
        @self.require_api_key
        def get_stats():
            """Endpoint de estadísticas"""
            uptime = time.time() - self.stats['startup_time']
            
            return jsonify({
                'status': 200,
                'message': 'success',
                'data': {
                    **self.stats,
                    'uptime_seconds': round(uptime, 2),
                    'vector_store': self.vector_store.get_stats(),
                    'model_info': self.feature_extractor.get_model_info()
                }
            })
        
        @self.app.route('/benchmark', methods=['POST'])
        @self.require_api_key
        def benchmark():
            """Endpoint para ejecutar benchmark del modelo"""
            try:
                data = request.get_json() or {}
                num_images = data.get('num_images', 10)
                
                if num_images > 50:  # Límite de seguridad
                    abort(400, description="num_images no puede ser mayor a 50")
                
                results = self.feature_extractor.benchmark(num_images)
                
                return jsonify({
                    'status': 200,
                    'message': 'success',
                    'data': results
                })
                
            except Exception as e:
                logger.error(f"Error en benchmark: {e}")
                abort(500, description=str(e))
        
        @self.app.route('/save-feature', methods=['POST'])
        @self.require_api_key
        @self.validate_json_request(['filename'])
        @log_request_info
        def save_feature():
            """Guarda características de una imagen"""
            try:
                data = request.get_json()
                filename = self.image_validator.sanitize_filename(data['filename'])
                
                # Verificar que la imagen existe
                image_path = Config.IMAGES_DIR / f"{filename}.png"
                if not image_path.exists():
                    abort(400, description=f"Imagen no encontrada: {filename}.png")
                
                # Extraer características
                feature_vector = self.feature_extractor.extract(str(image_path))
                
                # Guardar en almacén vectorial
                self.vector_store.add_feature(
                    feature_id=filename,
                    feature_vector=feature_vector,
                    metadata={
                        'filename': filename,
                        'image_path': str(image_path),
                        'timestamp': time.time()
                    }
                )
                
                self.stats['features_added'] += 1
                
                logger.info(f"Feature guardada exitosamente: {filename}")
                
                return jsonify({
                    'status': 200,
                    'message': 'success',
                    'data': filename
                })
                
            except Exception as e:
                logger.error(f"Error guardando feature: {e}")
                abort(500, description=str(e))
        
        @self.app.route('/reverse-search', methods=['POST'])
        @self.require_api_key
        @self.validate_json_request(['image', 'ids'])
        @log_request_info
        def reverse_search():
            """Búsqueda reversa de imágenes similares"""
            try:
                data = request.get_json()
                image_base64 = data['image']
                ids_to_search = data['ids']
                
                # Validar imagen
                is_valid, error_msg, image_bytes = self.image_validator.validate_base64_image(image_base64)
                if not is_valid:
                    abort(400, description=f"Imagen inválida: {error_msg}")
                
                # Procesar imagen
                processed_image = self.image_validator.preprocess_image(image_bytes)
                
                # Extraer características
                query_features = self.feature_extractor.extract(processed_image)
                
                # Filtrar IDs válidos (opcional: verificar que existen)
                valid_ids = [str(id_).strip() for id_ in ids_to_search if id_]
                
                # Buscar imágenes similares
                similar_images = self.vector_store.search_similar(
                    query_vector=query_features,
                    k=Config.MAX_SEARCH_RESULTS
                )
                
                # Filtrar resultados por IDs solicitados
                filtered_results = [
                    img_id for img_id, score in similar_images
                    if img_id in valid_ids
                ]
                
                self.stats['searches_performed'] += 1
                
                logger.info(f"Búsqueda completada: {len(filtered_results)} resultados")
                
                return jsonify({
                    'status': 200,
                    'message': 'success',
                    'data': filtered_results[:10]  # Limitar a top 10
                })
                
            except Exception as e:
                logger.error(f"Error en búsqueda reversa: {e}")
                abort(500, description=str(e))
        
        @self.app.route('/remove-features', methods=['DELETE'])
        @self.require_api_key
        @self.validate_json_request(['ids'])
        @log_request_info
        def remove_features():
            """Elimina características del almacén"""
            try:
                data = request.get_json()
                ids_to_remove = data['ids']
                
                if not isinstance(ids_to_remove, list):
                    abort(400, description="'ids' debe ser una lista")
                
                # Sanitizar IDs
                safe_ids = [
                    self.image_validator.sanitize_filename(str(id_))
                    for id_ in ids_to_remove
                ]
                
                # Eliminar del almacén vectorial
                removed_ids, not_found_ids = self.vector_store.remove_features(safe_ids)
                
                self.stats['features_removed'] += len(removed_ids)
                
                logger.info(f"Eliminadas {len(removed_ids)} características")
                
                return jsonify({
                    'status': 200,
                    'message': 'success',
                    'removed': removed_ids,
                    'not_found': not_found_ids
                })
                
            except Exception as e:
                logger.error(f"Error eliminando features: {e}")
                abort(500, description=str(e))
    
    def run(self, host=None, port=None, debug=None):
        """Ejecuta el servidor"""
        host = host or Config.HOST
        port = port or Config.PORT
        debug = debug if debug is not None else Config.DEBUG
        
        logger.info(f"Iniciando servidor en {host}:{port} (debug={debug})")
        
        # En producción, usar gunicorn
        if not debug:
            logger.info("Para producción, use: gunicorn -w 4 -b 0.0.0.0:5000 server:app")
        
        self.app.run(host=host, port=port, debug=debug, threaded=True)

# Crear instancia global para gunicorn
server = ReverseSearchServer()
app = server.app

if __name__ == "__main__":
    server.run()