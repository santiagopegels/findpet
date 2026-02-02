const fs = require('fs').promises;
const path = require('path');
const StorageService = require('./contract/storageService');
const { local } = require('../../config/storageConfig');
const imageProcessor = require('../image-processor');

class LocalStorageService extends StorageService {
  /**
   * Sube y procesa una imagen, generando múltiples versiones optimizadas
   * @param {string} base64Data - Datos de imagen en base64 (sin el prefijo data:image/...)
   * @param {string} filename - Nombre base del archivo (ID de búsqueda)
   * @returns {Promise<Object>} Información sobre las versiones generadas
   */
  async upload(base64Data, filename) {
    try {
      // Convertir base64 a buffer
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Validar imagen antes de procesar
      const validation = await imageProcessor.validateImage(imageBuffer);
      if (!validation.valid) {
        throw new Error(`Imagen inválida: ${validation.error}`);
      }

      // Procesar imagen y generar todas las versiones
      const result = await imageProcessor.processImage(
        imageBuffer,
        filename,
        local.uploadDir
      );

      // Retornar información sobre las versiones generadas
      return {
        success: true,
        baseFilename: filename,
        versions: {
          thumbnail: result.thumbnail.filename,
          medium: result.medium.filename,
          large: result.large.filename
        },
        paths: {
          thumbnail: result.thumbnail.path,
          medium: result.medium.path,
          large: result.large.path
        },
        sizes: {
          thumbnail: `${result.thumbnail.size} KB`,
          medium: `${result.medium.size} KB`,
          large: `${result.large.size} KB`
        },
        metadata: result.metadata
      };

    } catch (error) {
      console.error('Error en upload de LocalStorageService:', error);
      throw error;
    }
  }

  /**
   * Elimina todas las versiones de una imagen
   * @param {string} filename - Nombre base del archivo
   */
  async delete(filename) {
    try {
      await imageProcessor.deleteImage(filename, local.uploadDir);
      return { success: true, message: 'Imágenes eliminadas correctamente' };
    } catch (error) {
      console.error('Error en delete de LocalStorageService:', error);
      throw error;
    }
  }

  /**
   * Obtiene la ruta de una versión específica de la imagen
   * @param {string} filename - Nombre base del archivo
   * @param {string} version - Versión deseada: 'thumbnail', 'medium', 'large'
   */
  getImagePath(filename, version = 'medium') {
    const suffixes = {
      thumbnail: '_thumb',
      medium: '_medium',
      large: '_large'
    };

    const suffix = suffixes[version] || suffixes.medium;
    return path.join(local.uploadDir, `${filename}${suffix}.webp`);
  }
}

module.exports = new LocalStorageService();