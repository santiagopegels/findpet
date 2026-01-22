const redis = require('redis');
const { logger, logAppEvent, logPerformanceWarning } = require('./logger');

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isEnabled = process.env.REDIS_ENABLED !== 'false'; // Habilitado por defecto
  }

  /**
   * Inicializar conexión con Redis
   */
  async connect() {
    if (!this.isEnabled) {
      logger.info('Redis caching is disabled');
      return;
    }

    try {
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT) || 6379;
      const redisPassword = process.env.REDIS_PASSWORD || undefined;
      const redisDb = parseInt(process.env.REDIS_DB) || 0;

      // Redis v4+ usa formato de URL o socket
      const redisUrl = `redis://${redisPassword ? `:${redisPassword}@` : ''}${redisHost}:${redisPort}/${redisDb}`;

      const redisConfig = {
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.warn('Max Redis reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      };

      logger.info(`Connecting to Redis at ${redisHost}:${redisPort}`);
      this.client = redis.createClient(redisConfig);

      // Event listeners
      this.client.on('connect', () => {
        logger.info('🔗 Redis client connected');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        logAppEvent('REDIS_CONNECTED', {
          host: redisHost,
          port: redisPort,
          db: redisDb
        });
        logger.info('✅ Redis client ready');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.error('Redis connection error', {
          error: error.message,
          stack: error.stack
        });
      });

      this.client.on('end', () => {
        this.isConnected = false;
        logger.warn('⚠️  Redis connection ended');
      });

      this.client.on('reconnecting', () => {
        logger.info('🔄 Redis client reconnecting');
      });

      await this.client.connect();

    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to Redis', {
        error: error.message,
        stack: error.stack
      });
      // No lanzar error para que la aplicación pueda funcionar sin cache
    }
  }

  /**
   * Verificar si el cache está disponible
   */
  isAvailable() {
    return this.isEnabled && this.isConnected && this.client;
  }

  /**
   * Generar clave de cache
   */
  generateKey(prefix, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `findog:${prefix}:${sortedParams}`;
  }

  /**
   * Obtener datos del cache
   */
  async get(key) {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const startTime = Date.now();
      const data = await this.client.get(key);
      const duration = Date.now() - startTime;

      if (data) {
        logAppEvent('CACHE_HIT', {
          key,
          duration: `${duration}ms`
        });
        return JSON.parse(data);
      } else {
        logAppEvent('CACHE_MISS', {
          key,
          duration: `${duration}ms`
        });
        return null;
      }

    } catch (error) {
      logger.error('Cache get error', {
        key,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Guardar datos en el cache
   */
  async set(key, data, ttlSeconds = 300) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const startTime = Date.now();
      const serializedData = JSON.stringify(data);

      await this.client.setEx(key, ttlSeconds, serializedData);

      const duration = Date.now() - startTime;

      logAppEvent('CACHE_SET', {
        key,
        ttl: ttlSeconds,
        size: serializedData.length,
        duration: `${duration}ms`
      });

      return true;

    } catch (error) {
      logger.error('Cache set error', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Eliminar clave específica del cache
   */
  async del(key) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client.del(key);

      logAppEvent('CACHE_DELETE', {
        key,
        deleted: result > 0
      });

      return result > 0;

    } catch (error) {
      logger.error('Cache delete error', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Eliminar múltiples claves por patrón
   */
  async delPattern(pattern) {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(keys);

      logAppEvent('CACHE_DELETE_PATTERN', {
        pattern,
        keysFound: keys.length,
        keysDeleted: result
      });

      return result;

    } catch (error) {
      logger.error('Cache delete pattern error', {
        pattern,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Wrapper para ejecutar función con cache
   */
  async withCache(key, fetchFunction, ttlSeconds = 300) {
    // Intentar obtener del cache primero
    const cachedData = await this.get(key);
    if (cachedData !== null) {
      return cachedData;
    }

    // Si no está en cache, ejecutar función y cachear resultado
    try {
      const startTime = Date.now();
      const freshData = await fetchFunction();
      const duration = Date.now() - startTime;

      // Warning si la función tardó mucho
      if (duration > 1000) {
        logPerformanceWarning('cache_fetch_function', duration, 1000);
      }

      // Cachear solo si hay datos válidos
      if (freshData !== null && freshData !== undefined) {
        await this.set(key, freshData, ttlSeconds);
      }

      return freshData;

    } catch (error) {
      logger.error('Cache fetch function error', {
        key,
        error: error.message
      });
      throw error; // Re-lanzar para que el llamador pueda manejarlo
    }
  }

  /**
   * Invalidar cache relacionado con búsquedas
   */
  async invalidateSearchCaches(city = null, type = null) {
    const patterns = [
      'findog:searches:*',
      'findog:search_count:*',
      'findog:top_cities:*'
    ];

    if (city) {
      patterns.push(`findog:searches:*city:${city}*`);
      patterns.push(`findog:reverse_search:*city:${city}*`);
    }

    if (type) {
      patterns.push(`findog:searches:*type:${type}*`);
    }

    let totalDeleted = 0;
    for (const pattern of patterns) {
      const deleted = await this.delPattern(pattern);
      totalDeleted += deleted;
    }

    logAppEvent('CACHE_INVALIDATED', {
      reason: 'search_change',
      city,
      type,
      patternsChecked: patterns.length,
      keysDeleted: totalDeleted
    });

    return totalDeleted;
  }

  /**
   * Obtener estadísticas del cache
   */
  async getStats() {
    if (!this.isAvailable()) {
      return { available: false };
    }

    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');

      // Contar claves de nuestra aplicación
      const appKeys = await this.client.keys('findog:*');

      return {
        available: true,
        connected: this.isConnected,
        appKeys: appKeys.length,
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace)
      };

    } catch (error) {
      logger.error('Failed to get cache stats', {
        error: error.message
      });
      return { available: false, error: error.message };
    }
  }

  /**
   * Parsear información de Redis
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Limpiar todo el cache de la aplicación
   */
  async flushAppCache() {
    const deleted = await this.delPattern('findog:*');

    logAppEvent('CACHE_FLUSHED', {
      keysDeleted: deleted
    });

    return deleted;
  }

  /**
   * Cerrar conexión
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        logAppEvent('REDIS_DISCONNECTED', {});
        logger.info('📴 Redis connection closed');
      } catch (error) {
        logger.error('Error closing Redis connection', {
          error: error.message
        });
      }
    }
  }
}

// Crear instancia singleton
const cacheManager = new CacheManager();

// Funciones de utilidad específicas para la aplicación
const CacheUtils = {
  // Cache keys
  keys: {
    searches: (params) => cacheManager.generateKey('searches', params),
    searchCount: (params) => cacheManager.generateKey('search_count', params),
    reverseSearch: (params) => cacheManager.generateKey('reverse_search', params),
    topCities: () => 'findog:top_cities:all',
    metrics: () => 'findog:metrics:basic'
  },

  // TTL por tipo de datos
  ttl: {
    searches: 300,     // 5 minutos para listas de búsquedas
    searchCount: 600,  // 10 minutos para conteos
    reverseSearch: 180, // 3 minutos para búsquedas con IA
    topCities: 1800,   // 30 minutos para top ciudades
    metrics: 300       // 5 minutos para métricas
  }
};

module.exports = {
  cacheManager,
  CacheUtils
}; 