#!/usr/bin/env python3
"""
Script de migración para convertir archivos .npy existentes al nuevo sistema FAISS
"""

import sys
import numpy as np
from pathlib import Path
import argparse
import time
from typing import List, Tuple

# Agregar el directorio padre al path para importar módulos
sys.path.append(str(Path(__file__).parent.parent))

from config import Config
from storage.vector_store import VectorStore
from utils.logger import logger

class FeatureMigrator:
    """Migrador de características de .npy a FAISS"""
    
    def __init__(self, legacy_feature_dir: Path = None):
        self.legacy_dir = legacy_feature_dir or Path('./feature')
        self.vector_store = VectorStore()
        self.migration_stats = {
            'total_files': 0,
            'successful_migrations': 0,
            'failed_migrations': 0,
            'errors': []
        }
    
    def find_npy_files(self) -> List[Path]:
        """Encuentra todos los archivos .npy en el directorio legacy"""
        if not self.legacy_dir.exists():
            logger.error(f"Directorio no existe: {self.legacy_dir}")
            return []
        
        npy_files = list(self.legacy_dir.glob("*.npy"))
        logger.info(f"Encontrados {len(npy_files)} archivos .npy")
        return npy_files
    
    def validate_feature_vector(self, feature_vector: np.ndarray, filename: str) -> bool:
        """Valida que el vector de características sea válido"""
        try:
            # Verificar que es un array numpy
            if not isinstance(feature_vector, np.ndarray):
                logger.warning(f"No es un array numpy: {filename}")
                return False
            
            # Verificar dimensiones
            if feature_vector.ndim != 1:
                logger.warning(f"Dimensiones incorrectas {feature_vector.shape}: {filename}")
                return False
            
            # Verificar tamaño esperado
            expected_size = 4096  # VGG16 fc2 layer
            if feature_vector.shape[0] != expected_size:
                logger.warning(f"Tamaño incorrecto {feature_vector.shape[0]} != {expected_size}: {filename}")
                return False
            
            # Verificar que no tiene valores inválidos
            if np.any(np.isnan(feature_vector)) or np.any(np.isinf(feature_vector)):
                logger.warning(f"Valores inválidos (NaN/Inf): {filename}")
                return False
            
            # Verificar que no es un vector cero
            if np.allclose(feature_vector, 0):
                logger.warning(f"Vector cero: {filename}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error validando {filename}: {e}")
            return False
    
    def migrate_single_file(self, npy_file: Path) -> bool:
        """Migra un solo archivo .npy"""
        try:
            # Extraer ID del nombre del archivo
            feature_id = npy_file.stem
            
            # Cargar vector de características
            feature_vector = np.load(npy_file)
            
            # Validar vector
            if not self.validate_feature_vector(feature_vector, feature_id):
                self.migration_stats['errors'].append(f"Validación fallida: {feature_id}")
                return False
            
            # Normalizar vector si no está normalizado
            norm = np.linalg.norm(feature_vector)
            if norm > 0 and not np.isclose(norm, 1.0, rtol=1e-5):
                feature_vector = feature_vector / norm
                logger.debug(f"Vector normalizado: {feature_id}")
            
            # Agregar al almacén vectorial
            self.vector_store.add_feature(
                feature_id=feature_id,
                feature_vector=feature_vector,
                metadata={
                    'migrated_from': str(npy_file),
                    'original_norm': float(norm),
                    'migration_timestamp': time.time()
                }
            )
            
            logger.debug(f"Migrado exitosamente: {feature_id}")
            return True
            
        except Exception as e:
            error_msg = f"Error migrando {npy_file}: {e}"
            logger.error(error_msg)
            self.migration_stats['errors'].append(error_msg)
            return False
    
    def migrate_all(self, backup_originals: bool = True, 
                   dry_run: bool = False) -> dict:
        """
        Migra todos los archivos .npy encontrados
        
        Args:
            backup_originals: Si crear backup de archivos originales
            dry_run: Si solo simular la migración sin realizar cambios
        """
        start_time = time.time()
        
        # Encontrar archivos
        npy_files = self.find_npy_files()
        self.migration_stats['total_files'] = len(npy_files)
        
        if not npy_files:
            logger.warning("No se encontraron archivos .npy para migrar")
            return self.migration_stats
        
        if dry_run:
            logger.info("MODO DRY RUN - No se realizarán cambios")
        
        # Crear directorio de backup si es necesario
        backup_dir = None
        if backup_originals and not dry_run:
            backup_dir = self.legacy_dir / f"backup_{int(time.time())}"
            backup_dir.mkdir(exist_ok=True)
            logger.info(f"Backup será guardado en: {backup_dir}")
        
        # Procesar archivos
        for i, npy_file in enumerate(npy_files, 1):
            logger.info(f"Procesando {i}/{len(npy_files)}: {npy_file.name}")
            
            if dry_run:
                # Solo validar en dry run
                try:
                    feature_vector = np.load(npy_file)
                    if self.validate_feature_vector(feature_vector, npy_file.stem):
                        self.migration_stats['successful_migrations'] += 1
                    else:
                        self.migration_stats['failed_migrations'] += 1
                except Exception as e:
                    self.migration_stats['failed_migrations'] += 1
                    self.migration_stats['errors'].append(f"Error en {npy_file}: {e}")
            else:
                # Migración real
                if self.migrate_single_file(npy_file):
                    self.migration_stats['successful_migrations'] += 1
                    
                    # Mover a backup si es necesario
                    if backup_dir:
                        backup_path = backup_dir / npy_file.name
                        npy_file.rename(backup_path)
                        logger.debug(f"Movido a backup: {backup_path}")
                else:
                    self.migration_stats['failed_migrations'] += 1
        
        # Estadísticas finales
        elapsed_time = time.time() - start_time
        self.migration_stats['elapsed_time'] = elapsed_time
        
        logger.info(f"Migración completada en {elapsed_time:.2f}s")
        logger.info(f"Exitosos: {self.migration_stats['successful_migrations']}")
        logger.info(f"Fallidos: {self.migration_stats['failed_migrations']}")
        
        if self.migration_stats['errors']:
            logger.warning(f"Errores encontrados: {len(self.migration_stats['errors'])}")
            for error in self.migration_stats['errors'][:5]:  # Mostrar solo primeros 5
                logger.warning(f"  - {error}")
        
        return self.migration_stats
    
    def verify_migration(self) -> dict:
        """Verifica que la migración fue exitosa"""
        logger.info("Verificando migración...")
        
        # Obtener estadísticas del almacén vectorial
        stats = self.vector_store.get_stats()
        
        # Contar archivos .npy restantes
        remaining_npy = len(list(self.legacy_dir.glob("*.npy")))
        
        # Verificar coherencia
        verification = {
            'vector_store_count': stats['total_vectors'],
            'remaining_npy_files': remaining_npy,
            'metadata_count': stats['metadata_count'],
            'migration_successful': stats['total_vectors'] > 0 and remaining_npy == 0
        }
        
        logger.info(f"Verificación: {verification}")
        return verification

def main():
    """Función principal del script"""
    parser = argparse.ArgumentParser(description='Migrar archivos .npy al sistema FAISS')
    parser.add_argument('--feature-dir', type=Path, default=Path('./feature'),
                       help='Directorio con archivos .npy (default: ./feature)')
    parser.add_argument('--no-backup', action='store_true',
                       help='No crear backup de archivos originales')
    parser.add_argument('--dry-run', action='store_true',
                       help='Simular migración sin realizar cambios')
    parser.add_argument('--verify-only', action='store_true',
                       help='Solo verificar migración existente')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Logging detallado')
    
    args = parser.parse_args()
    
    # Configurar logging
    if args.verbose:
        import logging
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Crear migrador
    migrator = FeatureMigrator(args.feature_dir)
    
    if args.verify_only:
        # Solo verificar
        verification = migrator.verify_migration()
        if verification['migration_successful']:
            print("✅ Migración verificada exitosamente")
            sys.exit(0)
        else:
            print("❌ Migración no completada o con problemas")
            sys.exit(1)
    else:
        # Ejecutar migración
        results = migrator.migrate_all(
            backup_originals=not args.no_backup,
            dry_run=args.dry_run
        )
        
        # Mostrar resultados
        print(f"\n{'='*50}")
        print("RESULTADOS DE MIGRACIÓN")
        print(f"{'='*50}")
        print(f"Total de archivos: {results['total_files']}")
        print(f"Exitosos: {results['successful_migrations']}")
        print(f"Fallidos: {results['failed_migrations']}")
        print(f"Tiempo: {results.get('elapsed_time', 0):.2f}s")
        
        if results['errors']:
            print(f"\nErrores ({len(results['errors'])}):")
            for error in results['errors'][:10]:  # Mostrar solo primeros 10
                print(f"  - {error}")
        
        # Verificar si se completó exitosamente
        if results['failed_migrations'] == 0 and not args.dry_run:
            print("\n✅ Migración completada exitosamente")
            
            # Verificar migración
            verification = migrator.verify_migration()
            if verification['migration_successful']:
                print("✅ Verificación exitosa")
            else:
                print("⚠️  Advertencia: Verificación falló")
                sys.exit(1)
        elif args.dry_run:
            print(f"\n🔍 Dry run completado - {results['successful_migrations']} archivos se pueden migrar")
        else:
            print(f"\n❌ Migración con errores: {results['failed_migrations']} fallidos")
            sys.exit(1)

if __name__ == "__main__":
    main() 