const path = require('path');

/**
 * Configuración centralizada de la aplicación FinDog
 * Elimina hardcoding y centraliza todas las configuraciones
 */

// Validar variables de entorno críticas
const requiredEnvVars = ['MONGO_DB_CONNECTION', 'MACHINE_LEARNING_URL', 'MACHINE_LEARNING_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Variables de entorno faltantes: ${missingVars.join(', ')}`);
  console.error('Por favor configura estas variables en tu archivo .env');
  process.exit(1);
}

const config = {
  // Configuración del servidor
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    baseUrl: process.env.URL || 'http://localhost',
    
    // Timeouts y límites
    requestTimeout: 30000, // 30 segundos
    bodyLimit: '6mb',
    
    // CORS configuration
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'User-Agent']
    },
    
    // Configuración de shutdown graceful
    gracefulShutdown: {
      timeout: 10000 // 10 segundos
    }
  },

  // Configuración de base de datos
  database: {
    uri: process.env.MONGO_DB_CONNECTION,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT) || 5000,
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT) || 45000,
      family: 4, // IPv4
      retryWrites: true,
      retryReads: true
    },
    
    // Configuración de índices
    indexing: {
      background: true,
      createIndexesOnStartup: process.env.CREATE_INDEXES_ON_STARTUP !== 'false'
    }
  },

  // Configuración de Redis
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    
    // Configuración de conexión
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    retryDelayOnClusterDown: 300,
    enableOfflineQueue: false,
    lazyConnect: true,
    
    // TTL por defecto para diferentes tipos de cache
    ttl: {
      default: parseInt(process.env.CACHE_TTL) || 300, // 5 minutos
      searches: parseInt(process.env.CACHE_TTL_SEARCHES) || 300,
      searchCount: parseInt(process.env.CACHE_TTL_SEARCH_COUNT) || 600,
      reverseSearch: parseInt(process.env.CACHE_TTL_REVERSE_SEARCH) || 180,
      topCities: parseInt(process.env.CACHE_TTL_TOP_CITIES) || 1800,
      metrics: parseInt(process.env.CACHE_TTL_METRICS) || 300
    }
  },

  // Configuración del servicio de Machine Learning
  ml: {
    baseUrl: process.env.MACHINE_LEARNING_URL,
    apiKey: process.env.MACHINE_LEARNING_API_KEY,
    timeout: parseInt(process.env.ML_TIMEOUT) || 30000,
    retries: parseInt(process.env.ML_RETRIES) || 3,
    retryDelay: parseInt(process.env.ML_RETRY_DELAY) || 1000,
    
    endpoints: {
      saveFeature: '/save-feature',
      reverseSearch: '/reverse-search',
      health: '/health'
    }
  },

  // Configuración de imágenes y archivos
  files: {
    // Directorio de imágenes
    imagesDir: path.resolve(process.env.IMAGES_DIR || './images'),
    uploadsDir: path.resolve(process.env.UPLOADS_DIR || './uploads'),
    
    // Límites de imágenes
    maxSize: parseInt(process.env.MAX_IMAGE_SIZE) || 5 * 1024 * 1024, // 5MB
    allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    
    // Dimensiones
    minWidth: 100,
    minHeight: 100,
    maxWidth: 4000,
    maxHeight: 4000,
    
    // Configuración de almacenamiento
    storage: {
      type: process.env.STORAGE_TYPE || 'local',
      local: {
        uploadDir: process.env.LOCAL_UPLOAD_DIR || 'images/'
      }
    }
  },

  // Configuración de seguridad
  security: {
    // Rate limiting
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutos
      max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
      
      // Rate limits específicos
      upload: {
        windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW) || 60 * 60 * 1000, // 1 hora
        max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX) || 10
      },
      
      reverseSearch: {
        windowMs: parseInt(process.env.REVERSE_SEARCH_RATE_LIMIT_WINDOW) || 60 * 60 * 1000, // 1 hora
        max: parseInt(process.env.REVERSE_SEARCH_RATE_LIMIT_MAX) || 20
      }
    },
    
    // Headers de seguridad
    headers: {
      hsts: {
        maxAge: 31536000, // 1 año
        includeSubDomains: true,
        preload: true
      },
      
      csp: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    
    // User-Agents bloqueados
    blockedUserAgents: [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /zap/i,
      /burp/i,
      /\bbot\b/i,
      /crawler/i,
      /spider/i,
      /scraper/i
    ]
  },

  // Configuración de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    
    // Directorios
    logsDir: path.resolve(process.env.LOGS_DIR || './logs'),
    
    // Configuración de archivos
    files: {
      error: {
        filename: 'error-%DATE%.log',
        level: 'warn',
        maxSize: '20m',
        maxFiles: '14d'
      },
      security: {
        filename: 'security-%DATE%.log',
        level: 'security',
        maxSize: '20m',
        maxFiles: '30d'
      },
      combined: {
        filename: 'combined-%DATE%.log',
        maxSize: '20m',
        maxFiles: '7d'
      },
      http: {
        filename: 'http-%DATE%.log',
        level: 'http',
        maxSize: '50m',
        maxFiles: '3d'
      }
    }
  },

  // Configuración de búsquedas
  search: {
    // Paginación
    pagination: {
      defaultLimit: 21,
      maxLimit: 100,
      minLimit: 1
    },
    
    // Filtros
    filters: {
      validSortFields: ['createdAt', 'city', 'type'],
      validTypes: ['FIND', 'LOST']
    },
    
    // Búsqueda geográfica
    geo: {
      defaultRadius: 5, // km
      maxRadius: 50, // km
      minRadius: 0.1 // km
    },
    
    // Performance
    performance: {
      slowQueryThreshold: 2000, // 2 segundos
      verySlowQueryThreshold: 5000, // 5 segundos
      cacheIfSlowerThan: 1000 // Cachear si tarda más de 1 segundo
    }
  },

  // Configuración de cron jobs
  cron: {
    removeOldSearches: {
      schedule: process.env.CRON_REMOVE_OLD_SEARCHES || '0 2 * * *', // 2 AM diario
      maxAge: parseInt(process.env.SEARCH_MAX_AGE_DAYS) || 365, // 365 días
      batchSize: parseInt(process.env.CRON_BATCH_SIZE) || 100
    }
  },

  // Configuración de desarrollo
  development: {
    showDetailedErrors: process.env.NODE_ENV !== 'production',
    enableDebugLogging: process.env.DEBUG_LOGS === 'true',
    mockExternalServices: process.env.MOCK_EXTERNAL_SERVICES === 'true'
  },

  // Configuración de health checks
  health: {
    checks: {
      database: true,
      redis: true,
      filesystem: true,
      mlService: false // Opcional por defecto
    },
    
    intervals: {
      basic: 30000, // 30 segundos
      detailed: 60000, // 1 minuto
      metrics: 300000 // 5 minutos
    }
  },

  // URLs y paths
  paths: {
    api: {
      search: '/api/search',
      health: '/health'
    },
    
    static: {
      images: '/images'
    }
  },

  // Versión de la API
  api: {
    version: process.env.API_VERSION || '1.0.0',
    name: 'findog-api',
    description: 'API para encontrar mascotas perdidas'
  }
};

// Funciones de utilidad para la configuración
const ConfigUtils = {
  /**
   * Verificar si estamos en producción
   */
  isProduction: () => config.server.nodeEnv === 'production',

  /**
   * Verificar si estamos en desarrollo
   */
  isDevelopment: () => config.server.nodeEnv === 'development',

  /**
   * Obtener URL completa del servidor
   */
  getServerUrl: () => `${config.server.baseUrl}:${config.server.port}`,

  /**
   * Verificar si Redis está habilitado
   */
  isRedisEnabled: () => config.redis.enabled,

  /**
   * Obtener configuración de CORS
   */
  getCorsConfig: () => config.server.cors,

  /**
   * Validar configuración al inicio
   */
  validate: () => {
    const errors = [];

    // Validar puertos
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push('Puerto del servidor inválido');
    }

    // Validar URLs
    try {
      new URL(config.ml.baseUrl);
    } catch (e) {
      errors.push('URL del servicio ML inválida');
    }

    // Validar directorios
    const fs = require('fs');
    if (!fs.existsSync(path.dirname(config.files.imagesDir))) {
      errors.push('Directorio de imágenes no accesible');
    }

    if (errors.length > 0) {
      throw new Error(`Errores de configuración: ${errors.join(', ')}`);
    }

    return true;
  }
};

module.exports = {
  config,
  ConfigUtils
}; 