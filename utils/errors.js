/**
 * Clases de errores personalizadas para la aplicación FinDog
 * Permite categorizar y manejar errores de manera consistente
 */

// Clase base para errores personalizados
class AppError extends Error {
  constructor(message, statusCode, errorCode = null, isOperational = true) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational; // true para errores esperados, false para bugs
    this.timestamp = new Date().toISOString();
    
    // Capturar stack trace sin incluir este constructor
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      timestamp: this.timestamp,
      isOperational: this.isOperational
    };
  }
}

// Errores de validación (400)
class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
  }
}

// Errores de imagen específicos (400)
class ImageValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'IMAGE_VALIDATION_ERROR');
    this.imageDetails = details;
  }
}

// Errores de autenticación/autorización (401/403)
class AuthError extends AppError {
  constructor(message, statusCode = 401) {
    const errorCode = statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
    super(message, statusCode, errorCode);
  }
}

// Errores de recursos no encontrados (404)
class NotFoundError extends AppError {
  constructor(resource, identifier = null) {
    const message = identifier 
      ? `${resource} con ID '${identifier}' no encontrado`
      : `${resource} no encontrado`;
    super(message, 404, 'RESOURCE_NOT_FOUND');
    this.resource = resource;
    this.identifier = identifier;
  }
}

// Errores de conflicto/duplicación (409)
class ConflictError extends AppError {
  constructor(message, duplicateField = null) {
    super(message, 409, 'CONFLICT_ERROR');
    this.duplicateField = duplicateField;
  }
}

// Errores de rate limiting (429)
class RateLimitError extends AppError {
  constructor(message, retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

// Errores de base de datos (500)
class DatabaseError extends AppError {
  constructor(message, operation = null, originalError = null) {
    super(message, 500, 'DATABASE_ERROR', false); // isOperational = false (bug del sistema)
    this.operation = operation;
    this.originalError = originalError?.message;
  }
}

// Errores de servicios externos (502/503)
class ExternalServiceError extends AppError {
  constructor(service, message, statusCode = 502, originalError = null) {
    super(message, statusCode, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError?.message;
  }
}

// Errores de configuración (500)
class ConfigurationError extends AppError {
  constructor(message, configKey = null) {
    super(message, 500, 'CONFIGURATION_ERROR', false);
    this.configKey = configKey;
  }
}

// Errores de archivos/storage (500)
class FileError extends AppError {
  constructor(message, operation = null, filename = null) {
    super(message, 500, 'FILE_ERROR');
    this.operation = operation;
    this.filename = filename;
  }
}

// Funciones de utilidad para crear errores comunes
const createError = {
  // Validación
  validation: (message, field = null, value = null) => {
    return new ValidationError(message, field, value);
  },

  // Imagen inválida
  invalidImage: (message, details = {}) => {
    return new ImageValidationError(message, details);
  },

  // Recurso no encontrado
  notFound: (resource, identifier = null) => {
    return new NotFoundError(resource, identifier);
  },

  // Conflicto/duplicado
  conflict: (message, field = null) => {
    return new ConflictError(message, field);
  },

  // Base de datos
  database: (message, operation = null, originalError = null) => {
    return new DatabaseError(message, operation, originalError);
  },

  // Servicio externo
  externalService: (service, message, statusCode = 502, originalError = null) => {
    return new ExternalServiceError(service, message, statusCode, originalError);
  },

  // Configuración
  configuration: (message, configKey = null) => {
    return new ConfigurationError(message, configKey);
  },

  // Archivo/storage
  file: (message, operation = null, filename = null) => {
    return new FileError(message, operation, filename);
  }
};

// Función para determinar si un error es operacional
const isOperationalError = (error) => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

// Función para normalizar errores de mongoose
const normalizeMongooseError = (error) => {
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return createError.validation(`Errores de validación: ${messages.join(', ')}`);
  }
  
  if (error.name === 'CastError') {
    return createError.validation(`Valor inválido para el campo '${error.path}': ${error.value}`);
  }
  
  if (error.code === 11000) { // Duplicate key error
    const field = Object.keys(error.keyPattern)[0];
    return createError.conflict(`Ya existe un registro con este ${field}`, field);
  }
  
  // Error genérico de base de datos
  return createError.database('Error de base de datos', 'unknown', error);
};

// Función para normalizar errores de axios (servicios externos)
const normalizeAxiosError = (error, serviceName = 'External Service') => {
  if (error.response) {
    // El servidor respondió con un status code de error
    const statusCode = error.response.status;
    const message = error.response.data?.message || error.message;
    return createError.externalService(serviceName, message, statusCode, error);
  } else if (error.request) {
    // La request fue hecha pero no se recibió respuesta
    return createError.externalService(serviceName, 'No se pudo conectar con el servicio', 503, error);
  } else {
    // Error en la configuración de la request
    return createError.externalService(serviceName, 'Error de configuración del cliente', 500, error);
  }
};

module.exports = {
  // Clases de errores
  AppError,
  ValidationError,
  ImageValidationError,
  AuthError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  ConfigurationError,
  FileError,
  
  // Funciones de utilidad
  createError,
  isOperationalError,
  normalizeMongooseError,
  normalizeAxiosError
}; 