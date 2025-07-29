# LEGACY FILE - Use models/feature_extractor.py instead
# This file is kept for backward compatibility only

from models.feature_extractor import FeatureExtractor as ModernFeatureExtractor
from utils.logger import logger

class FeatureExtractor:
    """Legacy wrapper for backward compatibility"""
    
    def __init__(self):
        logger.warning("Using legacy FeatureExtractor. Consider migrating to models.feature_extractor.FeatureExtractor")
        self.modern_extractor = ModernFeatureExtractor(model_type='vgg16')
    
    def extract(self, img):
        """Legacy extract method"""
        return self.modern_extractor.extract(img)