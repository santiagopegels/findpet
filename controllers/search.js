const Search = require('../models/search');
const { uploadFile } = require('../services/uploader/upload');
const { saveImageFeature } = require('../services/predicter/saveImageFeature');
const { searchSimilarImages } = require('../services/predicter/searchSimilarImages');
const { getFilenameFromUrl } = require('../helpers/utils');
const { 
  logger, 
  logDatabaseError, 
  logExternalServiceError, 
  logAppEvent,
  logPerformanceWarning 
} = require('../utils/logger');
const { 
  createError, 
  normalizeMongooseError, 
  normalizeAxiosError 
} = require('../utils/errors');
const { cacheManager, CacheUtils } = require('../utils/cache');
const {
  addImagePathToSearches,
  buildSearchFilters,
  normalizePaginationParams,
  buildPaginationResponse,
  executeSearchWithCache,
  findPossibleDuplicates,
  formatApiResponse,
  buildSortParams,
  getSearchStats
} = require('../utils/search-helpers');
const { config } = require('../config/app-config');

const createSearch = async (req, res, next) => {
    const startTime = Date.now();
    
    try {
        logAppEvent('SEARCH_CREATE_INITIATED', {
            city: req.body.city,
            type: req.body.type,
            hasImage: !!req.validatedImage
        });

        // Verificar posibles duplicados antes de crear
        const possibleDuplicates = await findPossibleDuplicates(Search, req.body);
        if (possibleDuplicates.length > 0) {
            logAppEvent('DUPLICATE_SEARCH_DETECTED', {
                city: req.body.city,
                type: req.body.type,
                duplicatesFound: possibleDuplicates.length,
                duplicateIds: possibleDuplicates.map(d => d._id)
            });
        }

        const search = new Search(req.body);

        // Usar la imagen validada del middleware
        const imageData = req.validatedImage ? req.validatedImage.base64Data : req.body.image.split(',')[1];
        
        // Subir archivo con validación mejorada
        let urlFile;
        try {
            urlFile = await uploadFile(imageData, search.id);
            
            // Validar que el archivo existe físicamente
            const fs = require('fs');
            if (!fs.existsSync(urlFile)) {
                throw new Error('Archivo no creado en el sistema de archivos');
            }
            
            search.filename = getFilenameFromUrl(urlFile);
        } catch (error) {
            throw createError.file('Error al guardar la imagen', 'upload', search.id);
        }
        
        // Validar que el filename se asignó correctamente
        if (!search.filename) {
            throw createError.file('El nombre del archivo no se generó correctamente', 'filename_generation', search.id);
        }
        
        // Guardar en base de datos
        let searchCreated;
        try {
            searchCreated = await search.save();
        } catch (error) {
            // Si es error de Mongoose, normalizarlo
            if (error.name === 'ValidationError' || error.code === 11000) {
                throw normalizeMongooseError(error);
            }
            throw createError.database('Error al guardar la búsqueda en la base de datos', 'save', error);
        }

        // Invalidar caches relacionados
        await cacheManager.invalidateSearchCaches(searchCreated.city, searchCreated.type);

        // Proceso asíncrono para extraer características de la imagen
        saveImageFeature(search.id).catch(error => {
            logExternalServiceError('ML Service', config.ml.endpoints.saveFeature, error, { searchId: search.id });
        });

        const duration = Date.now() - startTime;
        
        // Warning si tardó mucho
        if (duration > config.search.performance.slowQueryThreshold) {
            logPerformanceWarning('createSearch', duration, config.search.performance.slowQueryThreshold);
        }

        logAppEvent('SEARCH_CREATED_SUCCESS', {
            searchId: searchCreated._id,
            city: searchCreated.city,
            type: searchCreated.type,
            duration: `${duration}ms`,
            imageSize: req.validatedImage?.originalSize,
            hasDuplicates: possibleDuplicates.length > 0
        });

        // Formatear respuesta usando utilidad centralizada
        const searchWithImage = addImagePathToSearches([searchCreated])[0];

        return res.status(201).json(formatApiResponse(true, {
            search: {
                ...searchWithImage,
                // Incluir información de la imagen procesada
                imageInfo: req.validatedImage ? {
                    size: req.validatedImage.originalSize,
                    type: req.validatedImage.type,
                    mimeType: req.validatedImage.mimeType
                } : null,
                // Incluir duplicados si los hay (para información del usuario)
                possibleDuplicates: possibleDuplicates.length > 0 ? 
                    addImagePathToSearches(possibleDuplicates) : []
            }
        }, 'Búsqueda creada exitosamente', {
            processingTime: `${duration}ms`,
            duplicatesDetected: possibleDuplicates.length
        }));

    } catch (error) {
        const duration = Date.now() - startTime;
        
        logAppEvent('SEARCH_CREATE_FAILED', {
            city: req.body.city,
            type: req.body.type,
            error: error.message,
            duration: `${duration}ms`
        });
        
        // Pasar el error al middleware centralizado
        next(error);
    }
}

const getAllSearches = async (req, res, next) => {
    const startTime = Date.now();
    
    try {
        // Usar utilidades centralizadas para normalizar parámetros
        const paginationParams = normalizePaginationParams(req.query);
        const filters = buildSearchFilters(req.query);
        const sortParams = buildSortParams(req.query);
        
        logAppEvent('GET_ALL_SEARCHES_INITIATED', {
            page: paginationParams.page,
            limit: paginationParams.limit,
            filters: Object.keys(filters),
            hasFilters: Object.keys(filters).length > 0,
            sortBy: req.query.sortBy || 'createdAt'
        });

        // Construir cache key
        const cacheKey = CacheUtils.keys.searches({
            ...req.query,
            page: paginationParams.page,
            limit: paginationParams.limit
        });

        // Función para ejecutar la búsqueda
        const executeSearch = async () => {
            try {
                // Ejecutar búsquedas en paralelo para mejor performance
                const [totalSearches, searches] = await Promise.all([
                    Search.countDocuments(filters),
                    Search.find(filters)
                        .sort(sortParams)
                        .limit(paginationParams.limit)
                        .skip(paginationParams.skip)
                        .select('-__v') // Excluir campo de versión de Mongoose
                ]);

                const searchesWithImagePath = addImagePathToSearches(searches);
                const pagination = buildPaginationResponse(searches, totalSearches, paginationParams);

                return {
                    searches: searchesWithImagePath,
                    pagination,
                    filters: {
                        city: req.query.city || null,
                        type: req.query.type || null,
                        dateFrom: req.query.dateFrom || null,
                        dateTo: req.query.dateTo || null
                    },
                    sorting: {
                        sortBy: req.query.sortBy || 'createdAt',
                        sortOrder: req.query.sortOrder || 'desc'
                    }
                };

            } catch (error) {
                throw createError.database('Error al consultar búsquedas', 'find', error);
            }
        };

        // Ejecutar con cache inteligente
        const result = await executeSearchWithCache(
            cacheKey,
            executeSearch,
            CacheUtils.ttl.searches
        );

        const duration = Date.now() - startTime;

        // Warning si tardó mucho
        if (duration > config.search.performance.slowQueryThreshold) {
            logPerformanceWarning('getAllSearches', duration, config.search.performance.slowQueryThreshold);
        }

        logAppEvent('GET_ALL_SEARCHES_SUCCESS', {
            page: paginationParams.page,
            limit: paginationParams.limit,
            resultCount: result.searches.length,
            totalCount: result.pagination.total,
            pages: result.pagination.pages,
            duration: `${duration}ms`,
            hasFilters: Object.keys(filters).length > 0,
            fromCache: duration < 50 // Probablemente del cache si fue muy rápido
        });

        return res.status(200).json(formatApiResponse(true, result, 'Búsquedas obtenidas exitosamente', {
            processingTime: `${duration}ms`
        }));

    } catch (error) {
        const duration = Date.now() - startTime;
        
        logAppEvent('GET_ALL_SEARCHES_FAILED', {
            page: req.query.page,
            limit: req.query.limit,
            error: error.message,
            duration: `${duration}ms`
        });
        
        // Pasar el error al middleware centralizado
        next(error);
    }
}

const reverseSearch = async (req, res, next) => {
    const startTime = Date.now();
    
    try {
        const { city, image } = req.body;
        let searchMethod = 'city';
        let filters = { city };

        logAppEvent('REVERSE_SEARCH_INITIATED', {
            city,
            hasImage: !!image
        });

        // Construir cache key para esta búsqueda
        const cacheKey = CacheUtils.keys.reverseSearch({ 
            city, 
            hasImage: !!image,
            imageHash: image ? require('crypto').createHash('md5').update(image.substring(0, 100)).digest('hex') : null
        });

        // Intentar obtener del cache primero
        const cachedResult = await cacheManager.get(cacheKey);
        if (cachedResult) {
            logAppEvent('REVERSE_SEARCH_CACHE_HIT', {
                city,
                hasImage: !!image
            });

            return res.status(200).json(formatApiResponse(true, cachedResult, 'Búsqueda completada exitosamente (desde cache)', {
                processingTime: `${Date.now() - startTime}ms`,
                fromCache: true
            }));
        }

        if (image) {
            // Buscar IDs de búsquedas en la ciudad
            let searchIdsByCity;
            try {
                searchIdsByCity = await Search.find({ city }).select('_id');
            } catch (error) {
                throw createError.database('Error al buscar por ciudad', 'find', error);
            }
            
            const searchIdsArray = searchIdsByCity.map(search => search._id);
            
            // CORREGIR BUG: Buscar similitud si hay al menos 1 imagen (no 10)
            if (searchIdsArray.length > 0) {
                try {
                    logAppEvent('ML_SIMILARITY_SEARCH_INITIATED', {
                        city,
                        candidateCount: searchIdsArray.length
                    });

                    const similarImageIds = await searchSimilarImages(image, searchIdsArray);
                    
                    if (similarImageIds && similarImageIds.length > 0) {
                        filters._id = { $in: similarImageIds };
                        searchMethod = 'ai_similarity';
                        
                        logAppEvent('ML_SIMILARITY_SEARCH_SUCCESS', {
                            city,
                            similarCount: similarImageIds.length,
                            candidateCount: searchIdsArray.length
                        });
                    } else {
                        logAppEvent('ML_SIMILARITY_SEARCH_NO_RESULTS', {
                            city,
                            candidateCount: searchIdsArray.length
                        });
                    }
                } catch (mlError) {
                    logExternalServiceError('ML Service', config.ml.endpoints.reverseSearch, mlError, {
                        city,
                        candidateCount: searchIdsArray.length
                    });
                    
                    // Si falla ML, continuar con búsqueda por ciudad
                    searchMethod = 'city_fallback';
                }
            } else {
                logAppEvent('REVERSE_SEARCH_NO_CANDIDATES', {
                    city
                });
            }
        }

        // Ejecutar búsqueda final con paginación
        const paginationParams = normalizePaginationParams({ ...req.query, limit: 50 });
        const sortParams = buildSortParams(req.query);

        let searches, totalCount;
        try {
            [searches, totalCount] = await Promise.all([
                Search.find(filters)
                    .sort(sortParams)
                    .limit(paginationParams.limit)
                    .skip(paginationParams.skip),
                Search.countDocuments(filters)
            ]);
        } catch (error) {
            throw createError.database('Error al ejecutar búsqueda', 'find', error);
        }
            
        const searchesWithImagePath = addImagePathToSearches(searches);
        const pagination = buildPaginationResponse(searches, totalCount, paginationParams);
        const duration = Date.now() - startTime;

        // Warning si tardó mucho
        if (duration > config.search.performance.verySlowQueryThreshold) {
            logPerformanceWarning('reverseSearch', duration, config.search.performance.verySlowQueryThreshold);
        }

        const responseData = {
            searches: searchesWithImagePath,
            pagination,
            searchMethod: searchMethod,
            hasAIResults: searchMethod === 'ai_similarity',
            processingTime: `${duration}ms`
        };

        // Cachear resultado si la búsqueda fue lenta o exitosa con IA
        if (duration > config.search.performance.cacheIfSlowerThan || searchMethod === 'ai_similarity') {
            await cacheManager.set(cacheKey, responseData, CacheUtils.ttl.reverseSearch);
        }

        logAppEvent('REVERSE_SEARCH_SUCCESS', {
            city,
            searchMethod,
            resultCount: searches.length,
            totalCount,
            duration: `${duration}ms`,
            hasAIResults: searchMethod === 'ai_similarity',
            cached: duration > config.search.performance.cacheIfSlowerThan
        });

        return res.status(200).json(formatApiResponse(true, responseData, 'Búsqueda completada exitosamente'));

    } catch (error) {
        const duration = Date.now() - startTime;
        
        logAppEvent('REVERSE_SEARCH_FAILED', {
            city: req.body.city,
            hasImage: !!req.body.image,
            error: error.message,
            duration: `${duration}ms`
        });
        
        // Pasar el error al middleware centralizado
        next(error);
    }
}



module.exports = {
    createSearch,
    getAllSearches,
    reverseSearch
}