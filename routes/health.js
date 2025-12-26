const { Router } = require('express');
const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/error-handler');
const { logger, logAppEvent } = require('../utils/logger');
const Search = require('../models/search');

const router = Router();

// Health check básico - rápido y simple
router.get('/', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'findog-api',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        memory: process.memoryUsage()
    };

    const responseTime = Date.now() - startTime;
    healthData.responseTime = `${responseTime}ms`;

    res.status(200).json(healthData);
}));

// Health check detallado - incluye estado de dependencias
router.get('/detailed', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const checks = {};

    // Check MongoDB
    try {
        await mongoose.connection.db.admin().ping();
        checks.database = {
            status: 'healthy',
            connection: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            host: mongoose.connection.host,
            name: mongoose.connection.name
        };
    } catch (error) {
        checks.database = {
            status: 'unhealthy',
            error: error.message,
            connection: 'failed'
        };
    }

    // Check si hay datos en la base
    try {
        const searchCount = await Search.countDocuments();
        checks.data = {
            status: 'healthy',
            searchCount: searchCount
        };
    } catch (error) {
        checks.data = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Check ML Service (opcional - no hacer fallar si no responde)
    checks.mlService = {
        status: 'unknown',
        note: 'Check not implemented - requires service ping'
    };

    // Check filesystem (directorio de imágenes)
    const fs = require('fs');
    try {
        await fs.promises.access('./images', fs.constants.R_OK | fs.constants.W_OK);
        checks.filesystem = {
            status: 'healthy',
            imagesDir: 'accessible'
        };
    } catch (error) {
        checks.filesystem = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Determinar estado general
    const hasUnhealthy = Object.values(checks).some(check => check.status === 'unhealthy');
    const overallStatus = hasUnhealthy ? 'unhealthy' : 'healthy';
    const statusCode = hasUnhealthy ? 503 : 200;

    const responseTime = Date.now() - startTime;

    const healthData = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        service: 'findog-api',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        pid: process.pid,
        memory: process.memoryUsage(),
        checks: checks
    };

    // Log health check si hay problemas
    if (hasUnhealthy) {
        logAppEvent('HEALTH_CHECK_FAILED', {
            checks: Object.keys(checks).filter(key => checks[key].status === 'unhealthy'),
            responseTime: `${responseTime}ms`
        });
    }

    res.status(statusCode).json(healthData);
}));

// Endpoint para métricas básicas
router.get('/metrics', asyncHandler(async (req, res) => {
    const startTime = Date.now();

    try {
        // Métricas de base de datos
        const [totalSearches, findSearches, lostSearches] = await Promise.all([
            Search.countDocuments(),
            Search.countDocuments({ type: 'FIND' }),
            Search.countDocuments({ type: 'LOST' })
        ]);

        // Búsquedas recientes (últimas 24 horas)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentSearches = await Search.countDocuments({ 
            createdAt: { $gte: yesterday } 
        });

        // Ciudades con más reportes
        const topCities = await Search.aggregate([
            { $group: { _id: '$city', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        const responseTime = Date.now() - startTime;

        const metrics = {
            timestamp: new Date().toISOString(),
            responseTime: `${responseTime}ms`,
            service: 'findog-api',
            database: {
                totalSearches,
                findSearches,
                lostSearches,
                recentSearches: recentSearches,
                topCities: topCities
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                nodeVersion: process.version
            }
        };

        res.status(200).json(metrics);

    } catch (error) {
        logger.error('Metrics endpoint error', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            status: false,
            error: 'METRICS_ERROR',
            message: 'Error al obtener métricas',
            timestamp: new Date().toISOString()
        });
    }
}));

// Endpoint para administrar cache (desarrollo/admin)
router.post('/cache/flush', asyncHandler(async (req, res) => {
  try {
    const { cacheManager } = require('../utils/cache');
    const deleted = await cacheManager.flushAppCache();
    
    res.status(200).json({
      status: true,
      message: 'Cache limpiado exitosamente',
      keysDeleted: deleted,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      status: false,
      error: 'CACHE_FLUSH_ERROR',
      message: 'Error al limpiar cache',
      timestamp: new Date().toISOString()
    });
  }
}));

// Endpoint para estadísticas del cache
router.get('/cache/stats', asyncHandler(async (req, res) => {
  try {
    const { cacheManager } = require('../utils/cache');
    const stats = await cacheManager.getStats();
    
    res.status(200).json({
      status: true,
      cache: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      status: false,
      error: 'CACHE_STATS_ERROR', 
      message: 'Error al obtener estadísticas de cache',
      timestamp: new Date().toISOString()
    });
  }
}));

module.exports = router; 