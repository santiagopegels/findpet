/**
 * Utilidades de compresión de imágenes en el cliente
 * Reduce el tamaño antes de enviar al servidor
 */

const ImageCompressor = {
    // Configuración de compresión
    config: {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.85,
        targetFormat: 'image/webp', // WebP si el navegador lo soporta
        fallbackFormat: 'image/jpeg'
    },

    /**
     * Comprime una imagen antes de enviarla al servidor
     * @param {File} file - Archivo de imagen a comprimir
     * @returns {Promise<string>} - Data URL de la imagen comprimida
     */
    async compressImage(file) {
        return new Promise((resolve, reject) => {
            // Validar que sea una imagen
            if (!file.type.startsWith('image/')) {
                reject(new Error('El archivo no es una imagen'));
                return;
            }

            const reader = new FileReader();

            reader.onerror = () => reject(new Error('Error al leer el archivo'));

            reader.onload = (e) => {
                const img = new Image();

                img.onerror = () => reject(new Error('Error al cargar la imagen'));

                img.onload = async () => {
                    try {
                        // Calcular nuevas dimensiones manteniendo aspect ratio
                        const dimensions = this.calculateDimensions(img.width, img.height);

                        // Crear canvas
                        const canvas = document.createElement('canvas');
                        canvas.width = dimensions.width;
                        canvas.height = dimensions.height;

                        const ctx = canvas.getContext('2d');

                        // Configurar para mejor calidad
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';

                        // Dibujar imagen redimensionada
                        ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);

                        // Determinar formato de salida
                        const outputFormat = this.getSupportedFormat();

                        // Convertir a data URL con compresión
                        const compressedDataUrl = canvas.toDataURL(outputFormat, this.config.quality);

                        // Calcular tamaños
                        const originalSize = file.size;
                        const compressedSize = this.getBase64Size(compressedDataUrl);
                        const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

                        console.log('🖼️ Imagen comprimida en el cliente:');
                        console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
                        console.log(`   Comprimida: ${(compressedSize / 1024).toFixed(2)} KB`);
                        console.log(`   Reducción: ${reduction}%`);
                        console.log(`   Dimensiones: ${dimensions.width}x${dimensions.height}`);
                        console.log(`   Formato: ${outputFormat}`);

                        resolve(compressedDataUrl);

                    } catch (error) {
                        reject(error);
                    }
                };

                img.src = e.target.result;
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Calcula las dimensiones optimizadas manteniendo aspect ratio
     */
    calculateDimensions(width, height) {
        let newWidth = width;
        let newHeight = height;

        // Si excede el máximo ancho
        if (newWidth > this.config.maxWidth) {
            newHeight = (newHeight * this.config.maxWidth) / newWidth;
            newWidth = this.config.maxWidth;
        }

        // Si excede el máximo alto
        if (newHeight > this.config.maxHeight) {
            newWidth = (newWidth * this.config.maxHeight) / newHeight;
            newHeight = this.config.maxHeight;
        }

        return {
            width: Math.round(newWidth),
            height: Math.round(newHeight)
        };
    },

    /**
     * Detecta el formato de imagen soportado por el navegador
     */
    getSupportedFormat() {
        // Detectar soporte de WebP
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;

        const webpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;

        return webpSupported ? this.config.targetFormat : this.config.fallbackFormat;
    },

    /**
     * Calcula el tamaño de un string base64 en bytes
     */
    getBase64Size(dataUrl) {
        // Extraer la parte base64
        const base64 = dataUrl.split(',')[1];
        // Aproximar tamaño real (3 bytes originales = 4 caracteres base64)
        return (base64.length * 3) / 4;
    },

    /**
     * Valida el tamaño del archivo
     */
    validateSize(file, maxSizeMB = 5) {
        const maxBytes = maxSizeMB * 1024 * 1024;
        return file.size <= maxBytes;
    }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.ImageCompressor = ImageCompressor;
}
