const mongoose = require('mongoose');
const { logger, logAppEvent } = require('../utils/logger');

/**
 * Configuración de índices para optimizar consultas
 * 
 * Análisis de consultas más comunes:
 * 1. Búsqueda por ciudad (reverseSearch)
 * 2. Búsqueda por ciudad + createdAt (getAllSearches con ordenamiento)
 * 3. Búsqueda por tipo (getAllSearches con filtro)
 * 4. Búsqueda geográfica por coordenadas (futura implementación)
 * 5. Conteo de documentos con filtros
 */

const indexesConfig = [
  {
    collection: 'searches',
    indexes: [
      // Índice compuesto para city + createdAt (consulta más común)
      {
        fields: { city: 1, createdAt: -1 },
        options: { 
          name: 'city_createdAt_idx',
          background: true 
        },
        description: 'Optimiza búsquedas por ciudad ordenadas por fecha'
      },
      
      // Índice compuesto para type + createdAt 
      {
        fields: { type: 1, createdAt: -1 },
        options: { 
          name: 'type_createdAt_idx',
          background: true 
        },
        description: 'Optimiza búsquedas por tipo ordenadas por fecha'
      },
      
      // Índice compuesto para city + type + createdAt (filtros combinados)
      {
        fields: { city: 1, type: 1, createdAt: -1 },
        options: { 
          name: 'city_type_createdAt_idx',
          background: true 
        },
        description: 'Optimiza búsquedas con filtros combinados'
      },
      
      // Índice geoespacial para coordenadas GPS (2dsphere para consultas geográficas)
      {
        fields: { gpsLocation: '2dsphere' },
        options: { 
          name: 'gps_location_2dsphere_idx',
          background: true 
        },
        description: 'Optimiza búsquedas geográficas por proximidad'
      },
      
      // Índice en filename para operaciones de archivos
      {
        fields: { filename: 1 },
        options: { 
          name: 'filename_idx',
          background: true,
          sparse: true // Solo documentos que tengan filename
        },
        description: 'Optimiza búsquedas y operaciones por nombre de archivo'
      },
      
      // Índice en phone para evitar duplicados y búsquedas rápidas
      {
        fields: { phone: 1 },
        options: { 
          name: 'phone_idx',
          background: true 
        },
        description: 'Optimiza búsquedas por teléfono y validación de duplicados'
      },
      
      // Índice TTL para eliminar documentos antiguos automáticamente (opcional)
      // Eliminar búsquedas después de 365 días
      {
        fields: { createdAt: 1 },
        options: { 
          name: 'ttl_idx',
          background: true,
          expireAfterSeconds: 365 * 24 * 60 * 60 // 365 días en segundos
        },
        description: 'Elimina automáticamente documentos después de 365 días'
      }
    ]
  }
];

/**
 * Crear índices para una colección específica
 */
const createIndexesForCollection = async (collectionName, indexes) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    
    logAppEvent('INDEX_CREATION_STARTED', {
      collection: collectionName,
      indexCount: indexes.length
    });

    for (const indexConfig of indexes) {
      const { fields, options, description } = indexConfig;
      
      try {
        // Verificar si el índice ya existe
        const existingIndexes = await collection.indexes();
        const indexExists = existingIndexes.some(idx => idx.name === options.name);
        
        if (indexExists) {
          logger.info(`Index ${options.name} already exists on ${collectionName}`);
          continue;
        }

        // Crear el índice
        await collection.createIndex(fields, options);
        
        logAppEvent('INDEX_CREATED', {
          collection: collectionName,
          indexName: options.name,
          fields: JSON.stringify(fields),
          description
        });

        logger.info(`✅ Created index: ${options.name} on ${collectionName}`);
        
      } catch (error) {
        logger.error(`Failed to create index ${options.name}`, {
          collection: collectionName,
          error: error.message,
          fields: JSON.stringify(fields)
        });
      }
    }
    
  } catch (error) {
    logger.error(`Failed to create indexes for collection ${collectionName}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Crear todos los índices configurados
 */
const createAllIndexes = async () => {
  try {
    logAppEvent('INDEXES_CREATION_STARTED', {
      collections: indexesConfig.map(config => config.collection)
    });

    for (const config of indexesConfig) {
      await createIndexesForCollection(config.collection, config.indexes);
    }

    logAppEvent('INDEXES_CREATION_COMPLETED', {
      collections: indexesConfig.map(config => config.collection),
      totalIndexes: indexesConfig.reduce((sum, config) => sum + config.indexes.length, 0)
    });

    logger.info('✅ All database indexes created successfully');
    
  } catch (error) {
    logger.error('Failed to create database indexes', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Verificar el estado de los índices
 */
const checkIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    const results = {};
    
    for (const config of indexesConfig) {
      const collection = db.collection(config.collection);
      const indexes = await collection.indexes();
      
      results[config.collection] = {
        totalIndexes: indexes.length,
        customIndexes: indexes.filter(idx => !idx.name.startsWith('_id')),
        details: indexes.map(idx => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false,
          background: idx.background || false,
          expireAfterSeconds: idx.expireAfterSeconds || null
        }))
      };
    }
    
    return results;
    
  } catch (error) {
    logger.error('Failed to check indexes', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Eliminar índices (para limpieza o recreación)
 */
const dropCustomIndexes = async (collectionName = null) => {
  try {
    const collectionsToClean = collectionName 
      ? [{ collection: collectionName }]
      : indexesConfig;

    for (const config of collectionsToClean) {
      const db = mongoose.connection.db;
      const collection = db.collection(config.collection);
      const indexes = await collection.indexes();
      
      // Eliminar todos los índices excepto _id_
      for (const index of indexes) {
        if (index.name !== '_id_') {
          try {
            await collection.dropIndex(index.name);
            logger.info(`Dropped index: ${index.name} from ${config.collection}`);
          } catch (error) {
            if (error.code !== 27) { // Index not found
              logger.error(`Failed to drop index ${index.name}`, {
                error: error.message
              });
            }
          }
        }
      }
    }
    
    logger.info('✅ Custom indexes dropped successfully');
    
  } catch (error) {
    logger.error('Failed to drop indexes', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Obtener estadísticas de uso de índices
 */
const getIndexStats = async () => {
  try {
    const db = mongoose.connection.db;
    const results = {};
    
    for (const config of indexesConfig) {
      const collection = db.collection(config.collection);
      
      // Obtener estadísticas de índices
      const stats = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();
      
      results[config.collection] = stats.map(stat => ({
        name: stat.name,
        accesses: stat.accesses,
        host: stat.host,
        shard: stat.shard
      }));
    }
    
    return results;
    
  } catch (error) {
    logger.error('Failed to get index stats', {
      error: error.message
    });
    return {};
  }
};

module.exports = {
  createAllIndexes,
  createIndexesForCollection,
  checkIndexes,
  dropCustomIndexes,
  getIndexStats,
  indexesConfig
}; 