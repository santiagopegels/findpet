const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const { dbConnection } = require('../database/config');
const initCrons = require('../crons/index');
const { generalLimiter } = require('../middleware/rate-limiter');
const {
  securityHeaders,
  additionalSecurityHeaders,
  preventInfoDisclosure,
  validateUserAgent,
  securityLogger
} = require('../middleware/security-headers');
const {
  errorHandler,
  notFoundHandler,
  requestLogger,
  validateConfiguration
} = require('../middleware/error-handler');
const { logger, logAppEvent } = require('../utils/logger');
const { cacheManager } = require('../utils/cache');
const { createAllIndexes } = require('../database/indexes');
const { config, ConfigUtils } = require('../config/app-config');

class Server {
  constructor() {
    // Validar configuración antes de inicializar
    ConfigUtils.validate();

    this.app = express();
    this.port = config.server.port;
    this.server = require('http').createServer(this.app);

    this.paths = config.paths.api;

    // Inicializar aplicación en orden específico (solo síncronos)
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddlewares() {
    // 1. Logging de requests (primero para capturar todo)
    this.app.use(requestLogger);

    // 2. Middlewares de seguridad (antes que cualquier procesamiento)
    this.app.use(securityHeaders);
    this.app.use(additionalSecurityHeaders);
    this.app.use(preventInfoDisclosure);
    this.app.use(securityLogger);

    // 3. Validación de configuración
    this.app.use(validateConfiguration);

    // 4. Rate limiting global
    this.app.use(generalLimiter);

    // 5. CORS (antes del parsing)
    this.app.use(cors());

    // 6. Body parsing con límites de seguridad
    this.app.use(express.json({ limit: '20mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '20mb' }));

    // 7. Servir archivos estáticos
    this.app.use(express.static('frontend')); // Serve frontend app
    this.app.use('/images', express.static('images'));
    this.app.use('/uploads', express.static('uploads'));

    // 8. Validación de User-Agent para endpoints API específicos
    this.app.use('/api/', validateUserAgent);
  }

  initializeRoutes() {
    this.app.use(this.paths.search, require('../routes/search'));
    this.app.use(this.paths.georef, require('../routes/georef.routes'));
    this.app.use(config.paths.api.health, require('../routes/health'));
  }

  initializeErrorHandling() {
    // Capturar rutas no encontradas (404)
    this.app.use(notFoundHandler);

    // Middleware centralizado de manejo de errores (debe ir al final)
    this.app.use(errorHandler);
  }

  async initializeDatabase() {
    try {
      await dbConnection();

      logAppEvent('DATABASE_CONNECTED', {
        database: 'MongoDB',
        environment: config.server.nodeEnv
      });

      // Crear índices si está habilitado
      if (config.database.indexing.createIndexesOnStartup) {
        await createAllIndexes();
      }

    } catch (error) {
      logger.error('Database connection failed', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  async initializeCache() {
    if (config.redis.enabled) {
      try {
        await cacheManager.connect();

        logAppEvent('CACHE_INITIALIZED', {
          type: 'redis',
          host: config.redis.host,
          port: config.redis.port
        });

      } catch (error) {
        logger.warn('Cache initialization failed, continuing without cache', {
          error: error.message,
          stack: error.stack
        });
      }
    } else {
      logger.info('Cache disabled by configuration');
    }
  }

  initializeCrons() {
    try {
      initCrons();
      logAppEvent('CRON_JOBS_INITIALIZED', {
        environment: process.env.NODE_ENV
      });
    } catch (error) {
      logger.error('Cron initialization failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async listen() {
    // Inicializar todos los servicios antes de escuchar
    await this.initializeDatabase();
    await this.initializeCache();
    this.initializeCrons();

    this.server.listen(this.port, config.server.host, () => {
      logAppEvent('SERVER_STARTED', {
        port: this.port,
        host: config.server.host,
        environment: config.server.nodeEnv,
        pid: process.pid,
        nodeVersion: process.version,
        apiVersion: config.api.version,
        redisEnabled: config.redis.enabled
      });

      console.log(`🚀 FinDog API Server listening on ${config.server.host}:${this.port}`);
      console.log(`📱 Environment: ${config.server.nodeEnv}`);
      console.log(`📊 Process ID: ${process.pid}`);
      console.log(`🗃️  Database: Connected`);
      console.log(`⚡ Cache: ${config.redis.enabled ? 'Enabled' : 'Disabled'}`);

      if (ConfigUtils.isDevelopment()) {
        const serverUrl = ConfigUtils.getServerUrl();
        console.log(`🔍 API Endpoints: ${serverUrl}${this.paths.search}`);
        console.log(`📋 Health Check: ${serverUrl}${config.paths.api.health}`);
        console.log(`📊 Metrics: ${serverUrl}${config.paths.api.health}/metrics`);
      }
    });

    // Manejar cierre graceful del servidor
    this.setupGracefulShutdown();
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      logAppEvent('SERVER_SHUTDOWN_INITIATED', {
        signal,
        pid: process.pid
      });

      console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);

      // Cerrar conexiones en orden
      try {
        // 1. Dejar de aceptar nuevas conexiones
        this.server.close(async () => {
          try {
            // 2. Cerrar conexión de Redis
            if (cacheManager.isAvailable()) {
              await cacheManager.disconnect();
              console.log('📴 Redis disconnected');
            }

            // 3. Cerrar conexión de MongoDB
            const mongoose = require('mongoose');
            await mongoose.connection.close();
            console.log('📴 MongoDB disconnected');

            logAppEvent('SERVER_SHUTDOWN_COMPLETED', {
              signal,
              pid: process.pid
            });

            console.log('✅ Server shutdown completed successfully');
            process.exit(0);

          } catch (error) {
            logger.error('Error during graceful shutdown', {
              error: error.message,
              stack: error.stack
            });
            console.log('❌ Error during shutdown, forcing exit');
            process.exit(1);
          }
        });

      } catch (error) {
        logger.error('Error initiating shutdown', {
          error: error.message
        });
        process.exit(1);
      }

      // Forzar cierre después del timeout configurado
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        console.log('❌ Forced shutdown due to timeout');
        process.exit(1);
      }, config.server.gracefulShutdown.timeout);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Manejar errores no capturados
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        pid: process.pid
      });

      console.error('💥 Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString(),
        pid: process.pid
      });

      console.error('💥 Unhandled Promise Rejection:', reason);
      process.exit(1);
    });
  }
}

module.exports = Server;