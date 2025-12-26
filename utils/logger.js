const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Configuración de niveles de log personalizados
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    security: 2,
    info: 3,
    http: 4,
    debug: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    security: 'magenta',
    info: 'blue',
    http: 'green',
    debug: 'white'
  }
};

// Formato personalizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Formato para consola (más legible en desarrollo)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Agregar metadatos si existen
    if (Object.keys(meta).length > 0) {
      msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return msg;
  })
);

// Crear directorio de logs si no existe
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configuración de transports (archivos y consola)
const transports = [
  // Logs de error (solo errores y warnings)
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'warn',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
    auditFile: path.join(logsDir, '.audit-error.json')
  }),
  
  // Logs de seguridad (eventos de seguridad específicos)
  new DailyRotateFile({
    filename: path.join(logsDir, 'security-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'security',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true,
    auditFile: path.join(logsDir, '.audit-security.json'),
    // Solo logs de seguridad
    filter: (info) => info.level === 'security'
  }),
  
  // Logs combinados (todos los niveles)
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true,
    auditFile: path.join(logsDir, '.audit-combined.json')
  }),
  
  // Logs HTTP (solo requests HTTP)
  new DailyRotateFile({
    filename: path.join(logsDir, 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    format: logFormat,
    maxSize: '50m',
    maxFiles: '3d',
    zippedArchive: true,
    auditFile: path.join(logsDir, '.audit-http.json'),
    // Solo logs HTTP
    filter: (info) => info.level === 'http'
  })
];

// Agregar consola en desarrollo
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug'
    })
  );
}

// Crear el logger principal
const logger = winston.createLogger({
  levels: customLevels.levels,
  format: logFormat,
  defaultMeta: {
    service: 'findog-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports,
  // Manejar excepciones no capturadas
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],
  // Manejar promesas rechazadas
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],
  exitOnError: false
});

// Agregar colores personalizados
winston.addColors(customLevels.colors);

// Funciones de utilidad para logging específico
const loggerUtils = {
  // Log de request HTTP
  logRequest: (req, res, responseTime) => {
    logger.http('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      contentLength: res.get('content-length') || 0,
      referrer: req.get('Referrer') || '-'
    });
  },

  // Log de eventos de seguridad
  logSecurityEvent: (event, details = {}) => {
    logger.security('Security Event', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  },

  // Log de errores de base de datos
  logDatabaseError: (operation, error, query = null) => {
    logger.error('Database Error', {
      operation,
      error: error.message,
      stack: error.stack,
      query: query ? JSON.stringify(query) : null,
      timestamp: new Date().toISOString()
    });
  },

  // Log de errores de servicios externos
  logExternalServiceError: (service, endpoint, error, requestData = null) => {
    logger.error('External Service Error', {
      service,
      endpoint,
      error: error.message,
      stack: error.stack,
      requestData: requestData ? JSON.stringify(requestData) : null,
      timestamp: new Date().toISOString()
    });
  },

  // Log de eventos de aplicación importantes
  logAppEvent: (event, details = {}) => {
    logger.info('Application Event', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  },

  // Log de performance warnings
  logPerformanceWarning: (operation, duration, threshold) => {
    logger.warn('Performance Warning', {
      operation,
      duration: `${duration}ms`,
      threshold: `${threshold}ms`,
      timestamp: new Date().toISOString()
    });
  }
};

// Exportar logger y utilidades
module.exports = {
  logger,
  ...loggerUtils
}; 