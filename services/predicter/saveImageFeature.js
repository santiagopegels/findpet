const axios = require('axios');

/**
 * Guarda las características de una imagen en el reverse-searcher.
 *
 * Incluye lógica de reintentos con backoff exponencial para manejar el race
 * condition donde la imagen puede no estar disponible aún en el volumen
 * compartido de Docker cuando el reverse-searcher intenta accederla.
 *
 * @param {string} filename - Nombre base del archivo (sin extensión de versión)
 * @param {object} options
 * @param {number} options.maxRetries - Número máximo de reintentos (default: 4)
 * @param {number} options.initialDelayMs - Delay inicial en ms antes del primer intento (default: 500)
 */
exports.saveImageFeature = async (filename, { maxRetries = 4, initialDelayMs = 500 } = {}) => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Esperar antes de cada intento (el primero incluido) para dar tiempo
    // al archivo de estar disponible en el volumen compartido de Docker.
    const waitMs = initialDelayMs * attempt; // 500ms, 1000ms, 1500ms, 2000ms
    await delay(waitMs);

    try {
      const response = await axios.post(
        `${process.env.MACHINE_LEARNING_URL}/save-feature`,
        { filename },
        { headers: { 'X-API-KEY': process.env.MACHINE_LEARNING_API_KEY } }
      );
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const description = error.response?.data?.error || error.message;
      const isImageNotFound = status === 400 && description?.includes('Imagen no encontrada');

      if (isImageNotFound && attempt < maxRetries) {
        console.warn(
          `[saveImageFeature] Intento ${attempt}/${maxRetries}: imagen aún no disponible para "${filename}". Reintentando en ${initialDelayMs * (attempt + 1)}ms...`
        );
        continue;
      }

      // Si no es un error de imagen no encontrada, o agotamos reintentos, loguear y salir.
      console.error(
        `[saveImageFeature] Error al guardar feature de "${filename}" (intento ${attempt}/${maxRetries}):`,
        description
      );
      return error;
    }
  }
};
