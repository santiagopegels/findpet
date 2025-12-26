const { logger, logSecurityEvent } = require('../utils/logger');
const { 
  AppError, 
  isOperationalError, 
  normalizeMongooseError, 
  normalizeAxiosError,
  createError 
} = require('../utils/errors');

/**
 * Middleware para capturar errores no manejados
 * Se ejecuta cuando se llama next(error) en cualquier parte de la aplicación
 */
const errorHandler = (error, req, res, next) => {
  let err = error;

  // Normalizar errores comunes a nuestras clases personalizadas
  if (err.name === 'ValidationError' && err.errors) {
    // Error de Mongoose
    err = normalizeMongooseError(err);
  } else if (err.isAxiosError) {
    // Error de Axios (servicios externos)
    err = normalizeAxiosError(err, 'ML Service');
  } else if (err.name === 'CastError') {
    // Error de casting de MongoDB
    err = createError.validation(`ID inválido: ${err.value}`);
  } else if (err.code === 11000) {
    // Error de duplicación de MongoDB
    err = normalizeMongooseError(err);
  } else if (err.name === 'JsonWebTokenError') {
    // Error de JWT (si se implementa autenticación)
    err = createError.validation('Token inválido');
  } else if (err.name === 'TokenExpiredError') {
    // Token expirado
    err = createError.validation('Token expirado');
  } else if (!(err instanceof AppError)) {
    // Error no controlado - convertir a AppError
    const statusCode = err.statusCode || err.status || 500;
    const message = process.env.NODE_ENV === 'production' 
      ? 'Error interno del servidor' 
      : err.message;
    
    err = new AppError(message, statusCode, 'INTERNAL_ERROR', false);
  }

  // Logging del error
  logError(err, req);

  // Enviar respuesta al cliente
  sendErrorResponse(err, res);
};

/**
 * Log del error con contexto de la request
 */
const logError = (error, req) => {
  const errorInfo = {
    message: error.message,
    statusCode: error.statusCode,
    errorCode: error.errorCode,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    requestId: req.id, // Si se implementa request ID
    body: sanitizeRequestBody(req.body),
    query: req.query,
    params: req.params
  };

  // Agregar información específica del error si existe
  if (error.field) errorInfo.field = error.field;
  if (error.operation) errorInfo.operation = error.operation;
  if (error.service) errorInfo.service = error.service;

  // Determinar nivel de log basado en el tipo de error
  if (error.statusCode >= 500) {
    // Errores del servidor - críticos
    logger.error('Server Error', errorInfo);
    
    // Si no es operacional, es un bug del sistema
    if (!isOperationalError(error)) {
      logger.error('System Bug Detected', {
        ...errorInfo,
        type: 'SYSTEM_BUG',
        severity: 'CRITICAL'
      });
    }
  } else if (error.statusCode === 429) {
    // Rate limiting - evento de seguridad
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.url,
      method: req.method
    });
  } else if (error.statusCode === 403) {
    // Forbidden - evento de seguridad
    logSecurityEvent('FORBIDDEN_ACCESS', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.url,
      method: req.method,
      reason: error.message
    });
  } else if (error.statusCode >= 400) {
    // Errores del cliente - warning
    logger.warn('Client Error', errorInfo);
  } else {
    // Otros errores
    logger.info('Application Error', errorInfo);
  }
};

/**
 * Sanitizar el body de la request para el log
 * Remover información sensible
 */
const sanitizeRequestBody = (body) => {
  if (!body || typeof body !== 'object') return body;

  const sanitized = { ...body };
  
  // Remover campos sensibles
  const sensitiveFields = ['image', 'password', 'token', 'api_key', 'apiKey'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
};

/**
 * Enviar respuesta de error al cliente
 */
const sendErrorResponse = (error, res) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Estructura base de respuesta
  const errorResponse = {
    status: false,
    error: error.errorCode || 'UNKNOWN_ERROR',
    message: error.message,
    timestamp: error.timestamp || new Date().toISOString()
  };

  // Agregar información adicional en desarrollo
  if (isDevelopment) {
    errorResponse.stack = error.stack;
    errorResponse.details = {
      name: error.name,
      isOperational: error.isOperational
    };
    
    // Agregar información específica del error
    if (error.field) errorResponse.field = error.field;
    if (error.operation) errorResponse.operation = error.operation;
    if (error.service) errorResponse.service = error.service;
  }

  // Agregar headers específicos según el tipo de error
  if (error.statusCode === 429 && error.retryAfter) {
    res.setHeader('Retry-After', error.retryAfter);
  }

  // Enviar respuesta
  res.status(error.statusCode).json(errorResponse);
};

/**
 * Middleware para capturar rutas no encontradas (404)
 */
const notFoundHandler = (req, res, next) => {
  const error = createError.notFound('Endpoint', req.originalUrl);
  next(error);
};

/**
 * Wrapper para funciones async que automáticamente pasa errores al middleware
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware para logging de requests HTTP
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Interceptar el final de la respuesta para medir tiempo
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Log de la request
    const { logRequest, logPerformanceWarning } = require('../utils/logger');
    logRequest(req, res, responseTime);
    
    // Warning si la respuesta es muy lenta
    if (responseTime > 5000) { // 5 segundos
      logPerformanceWarning(`${req.method} ${req.url}`, responseTime, 5000);
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

/**
 * Middleware para validar configuración requerida
 */
const validateConfiguration = (req, res, next) => {
  const requiredEnvVars = [
    'MONGO_DB_CONNECTION',
    'MACHINE_LEARNING_URL',
    'MACHINE_LEARNING_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const error = createError.configuration(
      `Variables de entorno faltantes: ${missingVars.join(', ')}`,
      missingVars[0]
    );
    return next(error);
  }
  
  next();
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  requestLogger,
  validateConfiguration
}; 