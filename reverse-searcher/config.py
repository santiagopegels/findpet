import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Configuración centralizada del proyecto"""
    
    # API Configuration
    API_KEY = os.getenv('API_KEY', 'default-key-change-me')
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', 5000))
    DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
    
    # Model Configuration
    MODEL_TYPE = os.getenv('MODEL_TYPE', 'efficientnet')  # 'efficientnet' or 'vgg16'
    MODEL_PATH = os.getenv('MODEL_PATH', './models/')
    FEATURE_DIMENSION = 1280 if MODEL_TYPE == 'efficientnet' else 4096
    
    # Storage Configuration
    IMAGES_DIR = Path('./images')
    FEATURES_DIR = Path('./features')
    FAISS_INDEX_PATH = Path('./features/faiss_index.bin')
    METADATA_PATH = Path('./features/metadata.json')
    
    # Redis Configuration (for caching)
    REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
    REDIS_DB = int(os.getenv('REDIS_DB', 0))
    REDIS_ENABLED = os.getenv('REDIS_ENABLED', 'False').lower() == 'true'
    
    # Image Processing
    MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', 10 * 1024 * 1024))  # 10MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
    TARGET_SIZE = (224, 224)
    
    # Search Configuration
    MAX_SEARCH_RESULTS = int(os.getenv('MAX_SEARCH_RESULTS', 20))
    SIMILARITY_THRESHOLD = float(os.getenv('SIMILARITY_THRESHOLD', 0.8))
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FORMAT = os.getenv('LOG_FORMAT', 'json')  # 'json' or 'text'
    
    @classmethod
    def validate(cls):
        """Valida la configuración"""
        errors = []
        
        if not cls.API_KEY or cls.API_KEY == 'default-key-change-me':
            errors.append("API_KEY debe ser configurada")
        
        if cls.FEATURE_DIMENSION not in [1280, 4096]:
            errors.append("FEATURE_DIMENSION debe ser 1280 (EfficientNet) o 4096 (VGG16)")
        
        if cls.MAX_IMAGE_SIZE < 1024:
            errors.append("MAX_IMAGE_SIZE debe ser al menos 1KB")
        
        return errors
    
    @classmethod
    def setup_directories(cls):
        """Crea directorios necesarios"""
        cls.IMAGES_DIR.mkdir(exist_ok=True)
        cls.FEATURES_DIR.mkdir(exist_ok=True)
        Path(cls.MODEL_PATH).mkdir(exist_ok=True) 