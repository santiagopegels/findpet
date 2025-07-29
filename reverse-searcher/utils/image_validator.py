import magic
import hashlib
from PIL import Image, ImageFile
from io import BytesIO
import base64
from typing import Tuple, Optional
from config import Config
from utils.logger import logger

# Permitir cargar imágenes truncadas (más robusto)
ImageFile.LOAD_TRUNCATED_IMAGES = True

class ImageValidator:
    """Validador de imágenes con verificaciones de seguridad"""
    
    @staticmethod
    def validate_base64_image(base64_data: str) -> Tuple[bool, str, Optional[bytes]]:
        """
        Valida una imagen en base64
        
        Returns:
            (is_valid, error_message, image_bytes)
        """
        try:
            # Decodificar base64
            image_bytes = base64.b64decode(base64_data)
            
            # Verificar tamaño
            if len(image_bytes) > Config.MAX_IMAGE_SIZE:
                return False, f"Imagen demasiado grande. Máximo: {Config.MAX_IMAGE_SIZE} bytes", None
            
            if len(image_bytes) < 100:  # Mínimo razonable
                return False, "Imagen demasiado pequeña", None
            
            # Verificar tipo MIME usando python-magic
            mime_type = magic.from_buffer(image_bytes, mime=True)
            if not mime_type.startswith('image/'):
                return False, f"Tipo de archivo no válido: {mime_type}", None
            
            # Verificar extensión permitida
            extension = mime_type.split('/')[-1]
            if extension not in Config.ALLOWED_EXTENSIONS:
                return False, f"Extensión no permitida: {extension}", None
            
            # Intentar abrir con PIL para verificar que es una imagen válida
            try:
                with Image.open(BytesIO(image_bytes)) as img:
                    # Verificar dimensiones mínimas
                    if img.size[0] < 32 or img.size[1] < 32:
                        return False, "Imagen demasiado pequeña (min: 32x32px)", None
                    
                    # Verificar dimensiones máximas
                    if img.size[0] > 4096 or img.size[1] > 4096:
                        return False, "Imagen demasiado grande (max: 4096x4096px)", None
                    
                    # Verificar que no sea corruptos
                    img.verify()
                    
            except Exception as e:
                return False, f"Imagen corrupta o inválida: {str(e)}", None
            
            return True, "OK", image_bytes
            
        except base64.binascii.Error:
            return False, "Base64 inválido", None
        except Exception as e:
            logger.error(f"Error validando imagen: {str(e)}")
            return False, f"Error de validación: {str(e)}", None
    
    @staticmethod
    def preprocess_image(image_bytes: bytes) -> Image.Image:
        """
        Preprocesa una imagen para el modelo ML
        """
        try:
            # Abrir imagen
            img = Image.open(BytesIO(image_bytes))
            
            # Convertir a RGB si es necesario
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Redimensionar manteniendo aspecto
            img.thumbnail(Config.TARGET_SIZE, Image.Resampling.LANCZOS)
            
            # Crear imagen final con el tamaño exacto
            final_img = Image.new('RGB', Config.TARGET_SIZE, (255, 255, 255))
            
            # Centrar la imagen
            x = (Config.TARGET_SIZE[0] - img.size[0]) // 2
            y = (Config.TARGET_SIZE[1] - img.size[1]) // 2
            final_img.paste(img, (x, y))
            
            return final_img
            
        except Exception as e:
            logger.error(f"Error preprocesando imagen: {str(e)}")
            raise ValueError(f"Error procesando imagen: {str(e)}")
    
    @staticmethod
    def get_image_hash(image_bytes: bytes) -> str:
        """Genera hash SHA256 de la imagen para caching"""
        return hashlib.sha256(image_bytes).hexdigest()
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Sanitiza nombres de archivo para evitar path traversal"""
        # Remover caracteres peligrosos
        dangerous_chars = ['/', '\\', '..', '~', '$', '&', '|', ';', '`']
        safe_filename = filename
        
        for char in dangerous_chars:
            safe_filename = safe_filename.replace(char, '_')
        
        # Limitar longitud
        if len(safe_filename) > 100:
            safe_filename = safe_filename[:100]
        
        return safe_filename 