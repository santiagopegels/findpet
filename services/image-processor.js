const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

/**
 * Configuración de tamaños de imagen
 */
const IMAGE_SIZES = {
    thumbnail: {
        width: 300,
        height: 300,
        quality: 80,
        suffix: '_thumb'
    },
    medium: {
        width: 800,
        height: 800,
        quality: 85,
        suffix: '_medium'
    },
    large: {
        width: 1200,
        height: 1200,
        quality: 90,
        suffix: '_large'
    }
};

/**
 * Clase para procesamiento de imágenes
 */
class ImageProcessor {
    /**
     * Procesa una imagen y genera múltiples versiones optimizadas
     * @param {Buffer} imageBuffer - Buffer de la imagen original
     * @param {string} filename - Nombre base del archivo (sin extensión)
     * @param {string} uploadDir - Directorio de destino
     * @returns {Promise<Object>} Objeto con las rutas de todas las versiones generadas
     */
    async processImage(imageBuffer, filename, uploadDir) {
        try {
            // Asegurar que el directorio existe
            await fs.mkdir(uploadDir, { recursive: true });

            // Obtener metadata de la imagen original
            const metadata = await sharp(imageBuffer).metadata();

            console.log(`📸 Procesando imagen: ${filename}`);
            console.log(`   Dimensiones originales: ${metadata.width}x${metadata.height}`);
            console.log(`   Formato original: ${metadata.format}`);
            console.log(`   Tamaño original: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

            // Generar todas las versiones en paralelo
            const versions = await Promise.all([
                this.createThumbnail(imageBuffer, filename, uploadDir),
                this.createMedium(imageBuffer, filename, uploadDir),
                this.createLarge(imageBuffer, filename, uploadDir)
            ]);

            const result = {
                thumbnail: versions[0],
                medium: versions[1],
                large: versions[2],
                metadata: {
                    originalWidth: metadata.width,
                    originalHeight: metadata.height,
                    originalFormat: metadata.format,
                    originalSize: imageBuffer.length
                }
            };

            console.log(`✅ Imagen procesada exitosamente:`);
            console.log(`   Thumbnail: ${result.thumbnail.size} KB (${result.thumbnail.width}x${result.thumbnail.height})`);
            console.log(`   Medium: ${result.medium.size} KB (${result.medium.width}x${result.medium.height})`);
            console.log(`   Large: ${result.large.size} KB (${result.large.width}x${result.large.height})`);

            return result;

        } catch (error) {
            console.error('Error procesando imagen:', error);
            throw new Error(`Error al procesar imagen: ${error.message}`);
        }
    }

    /**
     * Crea versión thumbnail
     */
    async createThumbnail(imageBuffer, filename, uploadDir) {
        return this.createVersion(imageBuffer, filename, uploadDir, IMAGE_SIZES.thumbnail);
    }

    /**
     * Crea versión medium
     */
    async createMedium(imageBuffer, filename, uploadDir) {
        return this.createVersion(imageBuffer, filename, uploadDir, IMAGE_SIZES.medium);
    }

    /**
     * Crea versión large
     */
    async createLarge(imageBuffer, filename, uploadDir) {
        return this.createVersion(imageBuffer, filename, uploadDir, IMAGE_SIZES.large);
    }

    /**
     * Crea una versión específica de la imagen
     */
    async createVersion(imageBuffer, filename, uploadDir, config) {
        const outputPath = path.join(uploadDir, `${filename}${config.suffix}.webp`);

        const processedImage = await sharp(imageBuffer)
            .resize(config.width, config.height, {
                fit: 'inside', // Mantiene aspect ratio, no recorta
                withoutEnlargement: true // No agranda imágenes pequeñas
            })
            .webp({
                quality: config.quality,
                effort: 4 // Balance entre velocidad y compresión (0-6)
            })
            .toBuffer({ resolveWithObject: true });

        // Guardar archivo
        await fs.writeFile(outputPath, processedImage.data);

        return {
            path: outputPath,
            filename: `${filename}${config.suffix}.webp`,
            width: processedImage.info.width,
            height: processedImage.info.height,
            size: (processedImage.info.size / 1024).toFixed(2),
            format: 'webp'
        };
    }

    /**
     * Elimina todas las versiones de una imagen
     * @param {string} filename - Nombre base del archivo (sin extensión ni sufijo)
     * @param {string} uploadDir - Directorio donde están las imágenes
     */
    async deleteImage(filename, uploadDir) {
        try {
            const suffixes = ['_thumb', '_medium', '_large'];
            const deletePromises = suffixes.map(suffix => {
                const filePath = path.join(uploadDir, `${filename}${suffix}.webp`);
                return fs.unlink(filePath).catch(err => {
                    // Ignorar si el archivo no existe
                    if (err.code !== 'ENOENT') {
                        console.error(`Error eliminando ${filePath}:`, err);
                    }
                });
            });

            await Promise.all(deletePromises);
            console.log(`🗑️  Versiones de imagen eliminadas: ${filename}`);

        } catch (error) {
            console.error('Error eliminando imágenes:', error);
            throw new Error(`Error al eliminar imágenes: ${error.message}`);
        }
    }

    /**
     * Valida que un buffer sea una imagen válida
     */
    async validateImage(imageBuffer) {
        try {
            const metadata = await sharp(imageBuffer).metadata();

            // Validar formato
            const allowedFormats = ['jpeg', 'png', 'webp', 'jpg'];
            if (!allowedFormats.includes(metadata.format)) {
                throw new Error(`Formato no permitido: ${metadata.format}`);
            }

            // Validar dimensiones mínimas
            if (metadata.width < 100 || metadata.height < 100) {
                throw new Error('La imagen es demasiado pequeña (mínimo 100x100px)');
            }

            // Validar dimensiones máximas
            if (metadata.width > 8000 || metadata.height > 8000) {
                throw new Error('La imagen es demasiado grande (máximo 8000x8000px)');
            }

            return {
                valid: true,
                metadata
            };

        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

module.exports = new ImageProcessor();
