#!/usr/bin/env python3
"""
Tests básicos para el sistema reverse-searcher
"""

import sys
import unittest
import numpy as np
import base64
from pathlib import Path
from PIL import Image
from io import BytesIO

# Agregar directorio padre al path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import Config
from utils.image_validator import ImageValidator
from models.feature_extractor import FeatureExtractor
from storage.vector_store import VectorStore

class TestImageValidator(unittest.TestCase):
    """Tests para el validador de imágenes"""
    
    def setUp(self):
        self.validator = ImageValidator()
    
    def test_valid_image(self):
        """Test con imagen válida"""
        # Crear imagen de prueba
        img = Image.new('RGB', (100, 100), color='red')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        img_bytes = buffer.getvalue()
        img_b64 = base64.b64encode(img_bytes).decode('utf-8')
        
        is_valid, message, bytes_result = self.validator.validate_base64_image(img_b64)
        
        self.assertTrue(is_valid)
        self.assertEqual(message, "OK")
        self.assertIsNotNone(bytes_result)
    
    def test_invalid_base64(self):
        """Test con base64 inválido"""
        is_valid, message, bytes_result = self.validator.validate_base64_image("invalid_base64")
        
        self.assertFalse(is_valid)
        self.assertIn("Base64 inválido", message)
        self.assertIsNone(bytes_result)
    
    def test_image_too_large(self):
        """Test con imagen demasiado grande"""
        # Crear imagen muy grande
        large_img = Image.new('RGB', (2000, 2000), color='blue')
        buffer = BytesIO()
        large_img.save(buffer, format='PNG')
        img_bytes = buffer.getvalue()
        
        # Si la imagen es más grande que el límite
        if len(img_bytes) > Config.MAX_IMAGE_SIZE:
            img_b64 = base64.b64encode(img_bytes).decode('utf-8')
            is_valid, message, bytes_result = self.validator.validate_base64_image(img_b64)
            
            self.assertFalse(is_valid)
            self.assertIn("demasiado grande", message)
    
    def test_preprocess_image(self):
        """Test de preprocesamiento de imagen"""
        # Crear imagen de prueba
        img = Image.new('RGB', (300, 200), color='green')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        img_bytes = buffer.getvalue()
        
        processed_img = self.validator.preprocess_image(img_bytes)
        
        self.assertEqual(processed_img.size, Config.TARGET_SIZE)
        self.assertEqual(processed_img.mode, 'RGB')
    
    def test_sanitize_filename(self):
        """Test de sanitización de nombres de archivo"""
        dangerous_filename = "../../../etc/passwd"
        safe_filename = self.validator.sanitize_filename(dangerous_filename)
        
        self.assertNotIn('/', safe_filename)
        self.assertNotIn('..', safe_filename)

class TestFeatureExtractor(unittest.TestCase):
    """Tests para el extractor de características"""
    
    @classmethod
    def setUpClass(cls):
        """Setup una vez para toda la clase"""
        try:
            cls.extractor = FeatureExtractor()
        except Exception as e:
            raise unittest.SkipTest(f"No se pudo inicializar FeatureExtractor: {e}")
    
    def test_extract_from_pil_image(self):
        """Test de extracción desde PIL Image"""
        img = Image.new('RGB', (224, 224), color='red')
        features = self.extractor.extract(img)
        
        self.assertIsInstance(features, np.ndarray)
        self.assertEqual(len(features.shape), 1)  # Vector 1D
        self.assertEqual(features.shape[0], Config.FEATURE_DIMENSION)
        
        # Verificar que está normalizado
        norm = np.linalg.norm(features)
        self.assertAlmostEqual(norm, 1.0, places=5)
    
    def test_extract_batch(self):
        """Test de extracción en lote"""
        images = [
            Image.new('RGB', (224, 224), color='red'),
            Image.new('RGB', (224, 224), color='blue'),
            Image.new('RGB', (224, 224), color='green')
        ]
        
        features = self.extractor.extract_batch(images)
        
        self.assertEqual(features.shape[0], 3)  # 3 imágenes
        self.assertEqual(features.shape[1], Config.FEATURE_DIMENSION)
        
        # Verificar que todos están normalizados
        for i in range(3):
            norm = np.linalg.norm(features[i])
            self.assertAlmostEqual(norm, 1.0, places=5)
    
    def test_model_info(self):
        """Test de información del modelo"""
        info = self.extractor.get_model_info()
        
        self.assertIn('model_type', info)
        self.assertIn('feature_dimension', info)
        self.assertEqual(info['feature_dimension'], Config.FEATURE_DIMENSION)
    
    def test_cache_functionality(self):
        """Test de funcionalidad de cache"""
        img = Image.new('RGB', (224, 224), color='yellow')
        
        # Primera extracción
        features1 = self.extractor.extract(img)
        
        # Segunda extracción (debería usar cache)
        features2 = self.extractor.extract(img)
        
        np.testing.assert_array_equal(features1, features2)

class TestVectorStore(unittest.TestCase):
    """Tests para el almacén vectorial"""
    
    def setUp(self):
        """Setup para cada test"""
        self.vector_store = VectorStore()
        # Limpiar índice para tests
        self.vector_store._create_new_index()
    
    def test_add_and_search_feature(self):
        """Test de agregar y buscar características"""
        # Crear vector de prueba
        feature_vector = np.random.rand(Config.FEATURE_DIMENSION)
        feature_vector = feature_vector / np.linalg.norm(feature_vector)  # Normalizar
        
        # Agregar feature
        feature_id = "test_image_001"
        internal_id = self.vector_store.add_feature(
            feature_id=feature_id,
            feature_vector=feature_vector,
            metadata={'test': True}
        )
        
        self.assertIsNotNone(internal_id)
        
        # Buscar feature similar (el mismo vector)
        results = self.vector_store.search_similar(feature_vector, k=1)
        
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][0], feature_id)
        self.assertGreater(results[0][1], 0.99)  # Similitud muy alta
    
    def test_remove_features(self):
        """Test de eliminación de características"""
        # Agregar múltiples features
        feature_ids = []
        for i in range(5):
            vector = np.random.rand(Config.FEATURE_DIMENSION)
            vector = vector / np.linalg.norm(vector)
            feature_id = f"test_image_{i:03d}"
            
            self.vector_store.add_feature(feature_id, vector)
            feature_ids.append(feature_id)
        
        # Verificar que se agregaron
        stats = self.vector_store.get_stats()
        self.assertEqual(stats['total_vectors'], 5)
        
        # Eliminar algunos
        to_remove = feature_ids[:3]
        removed, not_found = self.vector_store.remove_features(to_remove)
        
        self.assertEqual(len(removed), 3)
        self.assertEqual(len(not_found), 0)
        
        # Verificar que se eliminaron
        stats = self.vector_store.get_stats()
        self.assertEqual(stats['total_vectors'], 2)
    
    def test_get_stats(self):
        """Test de estadísticas"""
        stats = self.vector_store.get_stats()
        
        required_keys = ['total_vectors', 'dimension', 'index_type', 'metadata_count']
        for key in required_keys:
            self.assertIn(key, stats)
        
        self.assertEqual(stats['dimension'], Config.FEATURE_DIMENSION)

class TestIntegration(unittest.TestCase):
    """Tests de integración"""
    
    @classmethod
    def setUpClass(cls):
        """Setup para tests de integración"""
        try:
            cls.validator = ImageValidator()
            cls.extractor = FeatureExtractor()
            cls.vector_store = VectorStore()
            cls.vector_store._create_new_index()  # Limpiar índice
        except Exception as e:
            raise unittest.SkipTest(f"No se pudieron inicializar componentes: {e}")
    
    def test_full_pipeline(self):
        """Test del pipeline completo: imagen -> feature -> búsqueda"""
        # Crear imagen de prueba
        img = Image.new('RGB', (300, 300), color='purple')
        buffer = BytesIO()
        img.save(buffer, format='JPEG')
        img_bytes = buffer.getvalue()
        img_b64 = base64.b64encode(img_bytes).decode('utf-8')
        
        # 1. Validar imagen
        is_valid, message, validated_bytes = self.validator.validate_base64_image(img_b64)
        self.assertTrue(is_valid)
        
        # 2. Preprocesar imagen
        processed_img = self.validator.preprocess_image(validated_bytes)
        
        # 3. Extraer características
        features = self.extractor.extract(processed_img)
        
        # 4. Guardar en vector store
        feature_id = "integration_test_001"
        self.vector_store.add_feature(feature_id, features)
        
        # 5. Buscar similar
        similar_results = self.vector_store.search_similar(features, k=1)
        
        self.assertEqual(len(similar_results), 1)
        self.assertEqual(similar_results[0][0], feature_id)
        self.assertGreater(similar_results[0][1], 0.99)

def run_tests():
    """Ejecuta todos los tests"""
    # Configurar nivel de log para tests
    import logging
    logging.getLogger().setLevel(logging.WARNING)
    
    # Crear suite de tests
    test_classes = [
        TestImageValidator,
        TestFeatureExtractor,
        TestVectorStore,
        TestIntegration
    ]
    
    suite = unittest.TestSuite()
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        suite.addTests(tests)
    
    # Ejecutar tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1) 