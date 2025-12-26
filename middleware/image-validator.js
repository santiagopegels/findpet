const { fromBuffer: fileTypeFromBuffer } = require('file-type');

// Configuración de validación de imágenes
const IMAGE_CONFIG = {
  maxSize: 5 * 1024 * 1024, // 5MB en bytes
  allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  minWidth: 100,
  minHeight: 100,
  maxWidth: 4000,
  maxHeight: 4000
};

const validateImageBase64 = async (req, res, next) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        status: false,
        error: 'IMAGE_REQUIRED',
        message: 'La imagen es requerida'
      });
    }

    // Verificar que sea una cadena base64 válida
    const base64Regex = /^data:image\/(jpeg|jpg|png|webp);base64,/;
    const isValidBase64Format = base64Regex.test(image);

    if (!isValidBase64Format) {
      return res.status(400).json({
        status: false,
        error: 'INVALID_IMAGE_FORMAT',
        message: 'El formato de imagen debe ser base64 válido (data:image/[tipo];base64,...)'
      });
    }

    // Extraer solo la parte base64 (sin el prefijo data:image/...)
    const base64Data = image.split(',')[1];

    if (!base64Data) {
      return res.status(400).json({
        status: false,
        error: 'INVALID_BASE64',
        message: 'Datos base64 inválidos'
      });
    }

    // Calcular tamaño del archivo
    const sizeInBytes = (base64Data.length * 3) / 4;

    if (sizeInBytes > IMAGE_CONFIG.maxSize) {
      return res.status(400).json({
        status: false,
        error: 'IMAGE_TOO_LARGE',
        message: `La imagen es demasiado grande. Máximo permitido: ${IMAGE_CONFIG.maxSize / 1024 / 1024}MB`
      });
    }

    // Convertir base64 a buffer para análisis
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (error) {
      return res.status(400).json({
        status: false,
        error: 'INVALID_BASE64_ENCODING',
        message: 'Codificación base64 inválida'
      });
    }

    // Detectar el tipo real del archivo usando file-type
    const fileType = await fileTypeFromBuffer(buffer);

    if (!fileType) {
      return res.status(400).json({
        status: false,
        error: 'UNRECOGNIZED_FILE_TYPE',
        message: 'No se pudo determinar el tipo de archivo'
      });
    }

    // Verificar que sea realmente una imagen
    if (!IMAGE_CONFIG.allowedTypes.includes(fileType.ext) ||
      !IMAGE_CONFIG.allowedMimeTypes.includes(fileType.mime)) {
      return res.status(400).json({
        status: false,
        error: 'INVALID_IMAGE_TYPE',
        message: `Tipo de imagen no permitido. Tipos permitidos: ${IMAGE_CONFIG.allowedTypes.join(', ')}`
      });
    }

    // Verificar que no sea un archivo ejecutable disfrazado
    const suspiciousHeaders = [
      Buffer.from([0x4D, 0x5A]), // MZ (ejecutable)
      Buffer.from([0x50, 0x4B]), // PK (ZIP/ejecutable)
      Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF (ejecutable Unix)
    ];

    for (const header of suspiciousHeaders) {
      if (buffer.subarray(0, header.length).equals(header)) {
        return res.status(400).json({
          status: false,
          error: 'SUSPICIOUS_FILE',
          message: 'El archivo contiene contenido sospechoso'
        });
      }
    }

    // Validaciones adicionales básicas de dimensiones (opcional, requiere librería adicional)
    // Por ahora solo validamos que no sea un archivo minúsculo (probablemente corrupto)
    if (buffer.length < 100) {
      return res.status(400).json({
        status: false,
        error: 'IMAGE_TOO_SMALL',
        message: 'La imagen es demasiado pequeña o está corrupta'
      });
    }

    // Agregar información del archivo validado al request para uso posterior
    req.validatedImage = {
      originalSize: sizeInBytes,
      type: fileType.ext,
      mimeType: fileType.mime,
      buffer: buffer,
      base64Data: base64Data
    };

    next();

  } catch (error) {
    console.error('Error en validación de imagen:', error);
    return res.status(500).json({
      status: false,
      error: 'IMAGE_VALIDATION_ERROR',
      message: 'Error interno al validar la imagen'
    });
  }
};

// Middleware simplificado para validar solo que la imagen existe (para reverse search)
const validateImageExists = (req, res, next) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({
      status: false,
      error: 'IMAGE_REQUIRED',
      message: 'La imagen es requerida para la búsqueda'
    });
  }

  // Validación básica de formato base64
  const base64Regex = /^data:image\/(jpeg|jpg|png|webp);base64,/;
  if (!base64Regex.test(image)) {
    return res.status(400).json({
      status: false,
      error: 'INVALID_IMAGE_FORMAT',
      message: 'Formato de imagen inválido'
    });
  }

  next();
};

module.exports = {
  validateImageBase64,
  validateImageExists,
  IMAGE_CONFIG
}; 