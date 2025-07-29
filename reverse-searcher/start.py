#!/usr/bin/env python3
"""
Script de inicio para el servidor reverse-searcher
Maneja configuración inicial, migraciones y startup del servidor
"""

import sys
import os
import argparse
import time
from pathlib import Path

# Agregar directorio actual al path
sys.path.insert(0, str(Path(__file__).parent))

from config import Config
from utils.logger import logger
from scripts.migrate_legacy_features import FeatureMigrator

def check_dependencies():
    """Verifica que todas las dependencias estén instaladas"""
    logger.info("Verificando dependencias...")
    
    try:
        import tensorflow as tf
        logger.info(f"✅ TensorFlow {tf.__version__}")
        
        import faiss
        faiss_version = getattr(faiss, '__version__', 'unknown')
        logger.info(f"✅ FAISS {faiss_version}")
        
        import redis
        logger.info(f"✅ Redis {redis.__version__}")
        
        import PIL
        logger.info(f"✅ Pillow {PIL.__version__}")
        
        import magic
        logger.info("✅ python-magic OK")
        
        return True
        
    except ImportError as e:
        logger.error(f"❌ Dependencia faltante: {e}")
        return False

def setup_environment():
    """Configura el entorno inicial"""
    logger.info("Configurando entorno...")
    
    # Validar configuración
    config_errors = Config.validate()
    if config_errors:
        logger.error("❌ Errores de configuración:")
        for error in config_errors:
            logger.error(f"  - {error}")
        return False
    
    # Crear directorios necesarios
    Config.setup_directories()
    logger.info("✅ Directorios creados")
    
    # Verificar permisos de escritura
    test_paths = [Config.FEATURES_DIR, Config.IMAGES_DIR]
    for path in test_paths:
        try:
            test_file = path / '.test_write'
            test_file.touch()
            test_file.unlink()
        except Exception as e:
            logger.error(f"❌ Sin permisos de escritura en {path}: {e}")
            return False
    
    logger.info("✅ Permisos verificados")
    return True

def migrate_legacy_data():
    """Migra datos legacy si existen"""
    logger.info("Verificando datos legacy...")
    
    legacy_feature_dir = Path('./feature')
    if not legacy_feature_dir.exists():
        logger.info("No se encontró directorio legacy ./feature")
        return True
    
    npy_files = list(legacy_feature_dir.glob("*.npy"))
    if not npy_files:
        logger.info("No se encontraron archivos .npy legacy")
        return True
    
    logger.info(f"Encontrados {len(npy_files)} archivos .npy legacy")
    
    # Verificar si ya existe índice FAISS
    if Config.FAISS_INDEX_PATH.exists():
        logger.info("Índice FAISS ya existe, omitiendo migración automática")
        logger.info("Use scripts/migrate_legacy_features.py para migración manual")
        return True
    
    # Ejecutar migración automática
    logger.info("Ejecutando migración automática...")
    try:
        migrator = FeatureMigrator(legacy_feature_dir)
        results = migrator.migrate_all(backup_originals=True, dry_run=False)
        
        if results['failed_migrations'] == 0:
            logger.info(f"✅ Migración exitosa: {results['successful_migrations']} archivos")
            return True
        else:
            logger.warning(f"⚠️  Migración con errores: {results['failed_migrations']} fallidos")
            return False
            
    except Exception as e:
        logger.error(f"❌ Error en migración: {e}")
        return False

def download_models():
    """Descarga modelos necesarios si no existen"""
    logger.info("Verificando modelos...")
    
    if Config.MODEL_TYPE == 'efficientnet':
        # EfficientNet se descarga automáticamente de Keras
        logger.info("✅ EfficientNet se descargará automáticamente")
        return True
    
    elif Config.MODEL_TYPE == 'vgg16':
        # Verificar si existe el modelo VGG16 local
        vgg_model_path = Path(Config.MODEL_PATH) / 'vgg16_imagenet.h5'
        if vgg_model_path.exists():
            logger.info("✅ Modelo VGG16 local encontrado")
            return True
        else:
            logger.info("ℹ️  Modelo VGG16 se creará desde ImageNet al iniciar")
            return True
    
    else:
        logger.error(f"❌ Tipo de modelo no soportado: {Config.MODEL_TYPE}")
        return False

def test_server_components():
    """Prueba básica de componentes del servidor"""
    logger.info("Probando componentes...")
    
    try:
        # Test del extractor de características
        from models.feature_extractor import FeatureExtractor
        extractor = FeatureExtractor()
        logger.info("✅ Extractor de características inicializado")
        
        # Test del almacén vectorial
        from storage.vector_store import VectorStore
        vector_store = VectorStore()
        stats = vector_store.get_stats()
        logger.info(f"✅ Almacén vectorial: {stats['total_vectors']} vectores")
        
        # Test del validador de imágenes
        from utils.image_validator import ImageValidator
        validator = ImageValidator()
        logger.info("✅ Validador de imágenes inicializado")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error probando componentes: {e}")
        return False

def start_server(host=None, port=None, debug=None, workers=None):
    """Inicia el servidor"""
    logger.info("Iniciando servidor...")
    
    host = host or Config.HOST
    port = port or Config.PORT
    debug = debug if debug is not None else Config.DEBUG
    workers = workers or 2
    
    if debug:
        # Modo desarrollo con Flask
        logger.info(f"Iniciando en modo desarrollo: {host}:{port}")
        from server import server
        server.run(host=host, port=port, debug=True)
    else:
        # Modo producción con gunicorn
        logger.info(f"Iniciando en modo producción: {host}:{port} (workers={workers})")
        
        # Importar servidor para verificar que funciona
        from server import app
        
        # Ejecutar gunicorn
        cmd = [
            'gunicorn',
            '--bind', f'{host}:{port}',
            '--workers', str(workers),
            '--threads', '4',
            '--timeout', '120',
            '--access-logfile', '-',
            '--error-logfile', '-',
            '--log-level', 'info',
            'server:app'
        ]
        
        import subprocess
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"Error ejecutando gunicorn: {e}")
            sys.exit(1)
        except KeyboardInterrupt:
            logger.info("Servidor detenido por usuario")

def main():
    """Función principal"""
    parser = argparse.ArgumentParser(description='Iniciar servidor reverse-searcher')
    parser.add_argument('--host', default=None, help='Host del servidor')
    parser.add_argument('--port', type=int, default=None, help='Puerto del servidor')
    parser.add_argument('--debug', action='store_true', help='Modo debug')
    parser.add_argument('--workers', type=int, default=2, help='Número de workers (solo producción)')
    parser.add_argument('--skip-checks', action='store_true', help='Omitir verificaciones iniciales')
    parser.add_argument('--skip-migration', action='store_true', help='Omitir migración automática')
    
    args = parser.parse_args()
    
    logger.info("🚀 Iniciando reverse-searcher v2.0")
    
    # Verificaciones iniciales
    if not args.skip_checks:
        if not check_dependencies():
            logger.error("❌ Falló verificación de dependencias")
            sys.exit(1)
        
        if not setup_environment():
            logger.error("❌ Falló configuración del entorno")
            sys.exit(1)
        
        if not download_models():
            logger.error("❌ Falló verificación de modelos")
            sys.exit(1)
        
        if not args.skip_migration:
            if not migrate_legacy_data():
                logger.warning("⚠️  Migración legacy falló, continuando...")
        
        if not test_server_components():
            logger.error("❌ Falló prueba de componentes")
            sys.exit(1)
    
    # Mostrar información del sistema
    logger.info(f"📊 Configuración:")
    logger.info(f"  - Modelo: {Config.MODEL_TYPE}")
    logger.info(f"  - Host: {args.host or Config.HOST}")
    logger.info(f"  - Puerto: {args.port or Config.PORT}")
    logger.info(f"  - Debug: {args.debug or Config.DEBUG}")
    logger.info(f"  - Redis: {'Habilitado' if Config.REDIS_ENABLED else 'Deshabilitado'}")
    
    # Iniciar servidor
    try:
        start_server(
            host=args.host,
            port=args.port,
            debug=args.debug,
            workers=args.workers
        )
    except KeyboardInterrupt:
        logger.info("👋 Servidor detenido")
    except Exception as e:
        logger.error(f"❌ Error fatal: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 