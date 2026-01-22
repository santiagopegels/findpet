#!/usr/bin/env python3
"""
Test del pipeline YOLOv8 + CLIP para detección de mascotas.
Ejecutar desde el directorio reverse-searcher/
"""
import sys
import os
import time
from pathlib import Path

# Asegurar que podemos importar los módulos locales
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image
from models.feature_extractor import FeatureExtractor, NoAnimalDetectedError
from config import Config


def print_header(text: str):
    """Imprime un header formateado"""
    print("\n" + "=" * 60)
    print(f" {text}")
    print("=" * 60)


def test_single_image(extractor: FeatureExtractor, image_path: str, save_crop: bool = False) -> dict:
    """
    Prueba el pipeline con una imagen individual.
    
    Returns:
        dict con resultados del test
    """
    result = {
        'path': image_path,
        'filename': os.path.basename(image_path),
        'success': False,
        'animal_detected': False,
        'crop_size': None,
        'embedding_shape': None,
        'time_elapsed': 0,
        'error': None
    }
    
    start_time = time.time()
    
    try:
        # Test detect_and_crop
        cropped = extractor.detect_and_crop(image_path)
        result['animal_detected'] = True
        result['crop_size'] = cropped.size
        
        # Guardar crop si se solicita
        if save_crop:
            crop_dir = Path("test-results/crops")
            crop_dir.mkdir(parents=True, exist_ok=True)
            crop_path = crop_dir / f"crop_{result['filename']}"
            cropped.save(crop_path)
        
        # Test embedding
        embedding = extractor.get_embedding(cropped)
        result['embedding_shape'] = embedding.shape
        
        # Test pipeline completo
        features = extractor.extract(image_path)
        result['features'] = features
        result['norm'] = float(np.linalg.norm(features))
        result['success'] = True
        
    except NoAnimalDetectedError as e:
        result['error'] = str(e)
    except Exception as e:
        result['error'] = f"Error inesperado: {str(e)}"
    
    result['time_elapsed'] = time.time() - start_time
    return result


def test_similarity(extractor: FeatureExtractor, features1: np.ndarray, features2: np.ndarray) -> dict:
    """
    Calcula métricas de similitud entre dos vectores de características.
    """
    # Distancia L2 (menor = más similar)
    l2_distance = float(np.linalg.norm(features1 - features2))
    
    # Similitud coseno (mayor = más similar)
    cosine_sim = float(np.dot(features1, features2))
    
    return {
        'l2_distance': l2_distance,
        'cosine_similarity': cosine_sim
    }


def run_all_tests():
    """Ejecuta todos los tests con las imágenes de prueba"""
    
    print_header("INICIALIZANDO PIPELINE YOLOV8 + CLIP")
    
    # Crear directorio de resultados
    results_dir = Path("test-results")
    results_dir.mkdir(exist_ok=True)
    
    # Inicializar extractor
    print("Cargando modelos (esto puede tomar un momento)...")
    start_init = time.time()
    extractor = FeatureExtractor()
    init_time = time.time() - start_init
    print(f"✅ Modelos cargados en {init_time:.2f}s")
    
    # Info del modelo
    print("\n📋 Información del modelo:")
    model_info = extractor.get_model_info()
    for key, value in model_info.items():
        print(f"   {key}: {value}")
    
    print_header("TESTEANDO IMÁGENES INDIVIDUALES")
    
    # Obtener imágenes de test
    test_images_dir = Path("test-images")
    if not test_images_dir.exists():
        print("❌ No se encontró el directorio test-images/")
        return
    
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    test_images = [
        str(f) for f in test_images_dir.iterdir() 
        if f.suffix.lower() in image_extensions
    ]
    
    print(f"Encontradas {len(test_images)} imágenes de prueba\n")
    
    # Ejecutar tests
    results = []
    successful_results = []
    
    for i, img_path in enumerate(test_images, 1):
        result = test_single_image(extractor, img_path, save_crop=True)
        results.append(result)
        
        status = "✅" if result['success'] else "❌"
        time_str = f"{result['time_elapsed']:.2f}s"
        
        if result['success']:
            successful_results.append(result)
            print(f"{status} [{i:2d}/{len(test_images)}] {result['filename'][:40]:<40} | {time_str} | crop: {result['crop_size']}")
        else:
            print(f"{status} [{i:2d}/{len(test_images)}] {result['filename'][:40]:<40} | {time_str} | {result['error']}")
    
    # Resumen de tests individuales
    print_header("RESUMEN DE DETECCIÓN")
    
    total = len(results)
    success = len([r for r in results if r['success']])
    failed = total - success
    
    print(f"Total imágenes:     {total}")
    print(f"Detección exitosa:  {success} ({100*success/total:.1f}%)")
    print(f"Sin animal:         {failed} ({100*failed/total:.1f}%)")
    
    if successful_results:
        times = [r['time_elapsed'] for r in successful_results]
        print(f"\nTiempos de procesamiento (exitosos):")
        print(f"   Promedio: {np.mean(times):.2f}s")
        print(f"   Mínimo:   {np.min(times):.2f}s")
        print(f"   Máximo:   {np.max(times):.2f}s")
    
    # Tests de similitud entre pares
    if len(successful_results) >= 2:
        print_header("TESTS DE SIMILITUD (L2 Distance)")
        print("Menor distancia = más similar\n")
        
        # Calcular matriz de similitud para los primeros N resultados exitosos
        n_compare = min(10, len(successful_results))
        
        print(f"Comparando las primeras {n_compare} imágenes exitosas:\n")
        
        # Mostrar comparaciones más interesantes
        similarities = []
        for i in range(n_compare):
            for j in range(i + 1, n_compare):
                sim = test_similarity(
                    extractor,
                    successful_results[i]['features'],
                    successful_results[j]['features']
                )
                similarities.append({
                    'img1': successful_results[i]['filename'],
                    'img2': successful_results[j]['filename'],
                    **sim
                })
        
        # Ordenar por distancia L2 (más similares primero)
        similarities.sort(key=lambda x: x['l2_distance'])
        
        print("🔗 TOP 5 PARES MÁS SIMILARES:")
        print("-" * 80)
        for sim in similarities[:5]:
            print(f"   L2: {sim['l2_distance']:.4f} | cos: {sim['cosine_similarity']:.4f}")
            print(f"      {sim['img1'][:35]}")
            print(f"      {sim['img2'][:35]}")
            print()
        
        print("🔀 TOP 5 PARES MÁS DIFERENTES:")
        print("-" * 80)
        for sim in similarities[-5:]:
            print(f"   L2: {sim['l2_distance']:.4f} | cos: {sim['cosine_similarity']:.4f}")
            print(f"      {sim['img1'][:35]}")
            print(f"      {sim['img2'][:35]}")
            print()
        
        # Estadísticas de similitud
        l2_distances = [s['l2_distance'] for s in similarities]
        print_header("ESTADÍSTICAS DE DISTANCIA L2")
        print(f"Promedio:   {np.mean(l2_distances):.4f}")
        print(f"Mediana:    {np.median(l2_distances):.4f}")
        print(f"Mínimo:     {np.min(l2_distances):.4f}")
        print(f"Máximo:     {np.max(l2_distances):.4f}")
        print(f"Std Dev:    {np.std(l2_distances):.4f}")
    
    # Guardar resultados
    print_header("RESULTADOS GUARDADOS")
    print(f"📁 Crops guardados en: test-results/crops/")
    
    # Guardar log de resultados
    log_path = results_dir / "test_log.txt"
    with open(log_path, 'w') as f:
        f.write("TEST RESULTS - YOLOv8 + CLIP Pipeline\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Total: {total} | Success: {success} | Failed: {failed}\n\n")
        for r in results:
            status = "OK" if r['success'] else "FAIL"
            f.write(f"[{status}] {r['filename']}\n")
            if r['error']:
                f.write(f"       Error: {r['error']}\n")
    
    print(f"📄 Log guardado en: {log_path}")
    
    print_header("TEST COMPLETADO")


if __name__ == "__main__":
    run_all_tests()

