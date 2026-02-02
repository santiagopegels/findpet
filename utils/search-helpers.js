const { logger, logAppEvent } = require('./logger');
const { cacheManager, CacheUtils } = require('./cache');

/**
 * Utilidades centralizadas para operaciones de búsqueda
 * Elimina código duplicado y mejora la consistencia
 */

/**
 * Agregar path de imagen a las búsquedas
 * Función centralizada que antes estaba duplicada
 * Ahora incluye URLs para las diferentes versiones de imagen
 */
const addImagePathToSearches = (searches, baseUrl = null) => {
  if (!Array.isArray(searches)) {
    return [];
  }

  // Use EXTERNAL_PORT for URLs that will be accessed from the browser
  // The internal PORT may differ from the external mapped port (e.g., 3005 internal -> 3000 external)
  const externalPort = process.env.EXTERNAL_PORT || process.env.PORT || 3000;
  const serverUrl = baseUrl || `${process.env.URL || 'http://localhost'}:${externalPort}`;

  return searches.map(search => {
    const searchObject = search.toObject ? search.toObject() : search;

    // Construir URLs para todas las versiones de imagen
    let imageUrls = null;
    if (searchObject.imageVersions) {
      imageUrls = {
        thumbnail: searchObject.imageVersions.thumbnail
          ? `${serverUrl}/images/${searchObject.imageVersions.thumbnail}`
          : null,
        medium: searchObject.imageVersions.medium
          ? `${serverUrl}/images/${searchObject.imageVersions.medium}`
          : null,
        large: searchObject.imageVersions.large
          ? `${serverUrl}/images/${searchObject.imageVersions.large}`
          : null
      };
    }

    return {
      ...searchObject,
      // URLs para todas las versiones
      imageUrls: imageUrls,
      // URL principal (medium por defecto) para compatibilidad
      imageUrl: imageUrls?.medium || (searchObject.filename
        ? `${serverUrl}/images/${searchObject.filename}`
        : null),
      // Mantener compatibilidad con campo anterior
      image: imageUrls?.medium || (searchObject.filename
        ? `${serverUrl}/images/${searchObject.filename}`
        : null)
    };
  });
};

/**
 * Construir filtros de búsqueda de manera consistente
 */
const buildSearchFilters = (query) => {
  const filters = {};

  // Filtro por ciudad (case insensitive)
  if (query.city) {
    filters.city = new RegExp(query.city.trim(), 'i');
  }

  // Filtro por tipo
  if (query.type && ['FIND', 'LOST'].includes(query.type.toUpperCase())) {
    filters.type = query.type.toUpperCase();
  }

  // Filtro por rango de fechas
  if (query.dateFrom || query.dateTo) {
    filters.createdAt = {};

    if (query.dateFrom) {
      filters.createdAt.$gte = new Date(query.dateFrom);
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      // Incluir todo el día
      dateTo.setHours(23, 59, 59, 999);
      filters.createdAt.$lte = dateTo;
    }
  }

  // Filtro por teléfono (para evitar duplicados)
  if (query.phone) {
    filters.phone = query.phone.replace(/[^\d+]/g, ''); // Normalizar teléfono
  }

  return filters;
};

/**
 * Validar y normalizar parámetros de paginación
 */
const normalizePaginationParams = (query) => {
  const limit = Math.min(Math.max(parseInt(query.limit) || 21, 1), 100); // Entre 1 y 100
  const page = Math.max(parseInt(query.page) || 1, 1); // Mínimo 1
  const skip = (page - 1) * limit;

  return { limit, page, skip };
};

/**
 * Construir respuesta de paginación estándar
 */
const buildPaginationResponse = (results, totalCount, { limit, page, skip }) => {
  const pages = Math.ceil(totalCount / limit);
  const hasNext = skip + results.length < totalCount;
  const hasPrev = page > 1;

  return {
    total: totalCount,
    page: page,
    limit: limit,
    pages: pages,
    hasNext: hasNext,
    hasPrev: hasPrev,
    showing: results.length,
    // Información adicional útil
    startIndex: skip + 1,
    endIndex: skip + results.length
  };
};

/**
 * Ejecutar búsqueda con cache inteligente
 */
const executeSearchWithCache = async (cacheKey, searchFunction, ttl = 300) => {
  try {
    return await cacheManager.withCache(cacheKey, searchFunction, ttl);
  } catch (error) {
    // Si hay error en cache, ejecutar función directamente
    logger.warn('Cache error, executing function directly', {
      cacheKey,
      error: error.message
    });

    return await searchFunction();
  }
};

/**
 * Validar coordenadas GPS
 */
const validateGPSCoordinates = (latitude, longitude) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  const isValidLat = !isNaN(lat) && lat >= -90 && lat <= 90;
  const isValidLng = !isNaN(lng) && lng >= -180 && lng <= 180;

  if (!isValidLat || !isValidLng) {
    throw new Error(`Coordenadas GPS inválidas: lat=${lat}, lng=${lng}`);
  }

  return { latitude: lat, longitude: lng };
};

/**
 * Calcular distancia entre dos puntos GPS (en km)
 * Usando fórmula de Haversine
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // Redondear a 2 decimales
};

/**
 * Buscar por proximidad geográfica
 */
const findNearbySearches = async (SearchModel, latitude, longitude, radiusKm = 5, limit = 50) => {
  try {
    validateGPSCoordinates(latitude, longitude);

    const searches = await SearchModel.find({
      gpsLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude] // GeoJSON usa [lng, lat]
          },
          $maxDistance: radiusKm * 1000 // metros
        }
      }
    })
      .limit(limit)
      .sort({ createdAt: -1 });

    // Agregar distancia a cada resultado
    return searches.map(search => {
      const searchObj = search.toObject();
      const [searchLng, searchLat] = search.gpsLocation.coordinates;

      return {
        ...searchObj,
        distance: calculateDistance(latitude, longitude, searchLat, searchLng)
      };
    });

  } catch (error) {
    logger.error('Error in nearby search', {
      latitude,
      longitude,
      radiusKm,
      error: error.message
    });
    throw error;
  }
};

/**
 * Detectar posibles duplicados por teléfono y coordenadas
 */
const findPossibleDuplicates = async (SearchModel, searchData) => {
  const filters = [];

  // Buscar por mismo teléfono
  if (searchData.phone) {
    filters.push({ phone: searchData.phone });
  }

  // Buscar por coordenadas muy cercanas (menos de 100m)
  if (searchData.gpsLocation) {
    const { latitude, longitude } = searchData.gpsLocation;

    filters.push({
      gpsLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: 100 // 100 metros
        }
      }
    });
  }

  if (filters.length === 0) {
    return [];
  }

  try {
    // Buscar en las últimas 24 horas
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const duplicates = await SearchModel.find({
      $or: filters,
      createdAt: { $gte: yesterday },
      type: searchData.type
    }).limit(5);

    return duplicates;

  } catch (error) {
    logger.error('Error finding duplicates', {
      error: error.message,
      searchData: { ...searchData, image: '[REDACTED]' }
    });
    return [];
  }
};

/**
 * Formatear respuesta estándar de la API
 */
const formatApiResponse = (success, data, message = null, meta = {}) => {
  const response = {
    status: success,
    timestamp: new Date().toISOString(),
    ...meta
  };

  if (message) {
    response.message = message;
  }

  if (success) {
    Object.assign(response, data);
  } else {
    response.error = data.error || 'UNKNOWN_ERROR';
    response.message = data.message || message || 'Error desconocido';
  }

  return response;
};

/**
 * Construir parámetros de ordenamiento
 */
const buildSortParams = (query) => {
  const validSortFields = ['createdAt', 'city', 'type'];
  const sortField = validSortFields.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  return { [sortField]: sortOrder };
};

/**
 * Obtener estadísticas rápidas de búsquedas
 */
const getSearchStats = async (SearchModel, filters = {}) => {
  const cacheKey = CacheUtils.keys.searchCount(filters);

  return await executeSearchWithCache(
    cacheKey,
    async () => {
      const stats = await SearchModel.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            findCount: {
              $sum: { $cond: [{ $eq: ['$type', 'FIND'] }, 1, 0] }
            },
            lostCount: {
              $sum: { $cond: [{ $eq: ['$type', 'LOST'] }, 1, 0] }
            },
            avgPerDay: {
              $avg: {
                $dayOfMonth: '$createdAt'
              }
            }
          }
        }
      ]);

      return stats.length > 0 ? stats[0] : {
        total: 0,
        findCount: 0,
        lostCount: 0,
        avgPerDay: 0
      };
    },
    CacheUtils.ttl.searchCount
  );
};

module.exports = {
  addImagePathToSearches,
  buildSearchFilters,
  normalizePaginationParams,
  buildPaginationResponse,
  executeSearchWithCache,
  validateGPSCoordinates,
  calculateDistance,
  findNearbySearches,
  findPossibleDuplicates,
  formatApiResponse,
  buildSortParams,
  getSearchStats
}; 