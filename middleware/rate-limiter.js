const rateLimit = require('express-rate-limit');

// Rate limiter general para todas las rutas
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP en 15 minutos
  message: {
    status: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo en 15 minutos.',
    retryAfter: 15 * 60 // 15 minutos en segundos
  },
  standardHeaders: true, // Incluir rate limit info en headers `RateLimit-*`
  legacyHeaders: false, // Deshabilitar headers `X-RateLimit-*`
  handler: (req, res) => {
    res.status(429).json({
      status: false,
      error: 'TOO_MANY_REQUESTS',
      message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo en 15 minutos.',
      retryAfter: 15 * 60
    });
  }
});

// Rate limiter más estricto para upload de imágenes
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: process.env.NODE_ENV === 'development' ? 1000 : 10, // máximo 10 uploads por IP por hora (1000 en dev)
  message: {
    status: false,
    error: 'UPLOAD_LIMIT_EXCEEDED',
    message: 'Límite de subidas excedido. Máximo 10 imágenes por hora.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      status: false,
      error: 'UPLOAD_LIMIT_EXCEEDED',
      message: 'Límite de subidas excedido. Máximo 10 imágenes por hora.',
      retryAfter: 60 * 60
    });
  }
});

// Rate limiter para búsquedas con reverse search (más costosas computacionalmente)
const reverseSearchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: process.env.NODE_ENV === 'development' ? 1000 : 20, // máximo 20 búsquedas con IA por IP por hora (1000 en dev)
  message: {
    status: false,
    error: 'SEARCH_LIMIT_EXCEEDED',
    message: 'Límite de búsquedas con IA excedido. Máximo 20 búsquedas por hora.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      status: false,
      error: 'SEARCH_LIMIT_EXCEEDED',
      message: 'Límite de búsquedas con IA excedido. Máximo 20 búsquedas por hora.',
      retryAfter: 60 * 60
    });
  }
});

module.exports = {
  generalLimiter,
  uploadLimiter,
  reverseSearchLimiter
}; 