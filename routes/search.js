const { Router } = require('express')
const { check } = require('express-validator')
const { createSearch, getAllSearches, reverseSearch } = require('../controllers/search');
const { validateFields, sanitizeInput } = require('../middleware/validate-fields');
const { uploadLimiter, reverseSearchLimiter } = require('../middleware/rate-limiter');
const { validateImageBase64, validateImageExists } = require('../middleware/image-validator');
const { asyncHandler } = require('../middleware/error-handler');

const router = Router();

// GET - Obtener todas las búsquedas con paginación y filtros
router.get('/', asyncHandler(getAllSearches))

// POST - Búsqueda por similitud de imagen (reverse search)
router.post('/reverse-search',
  reverseSearchLimiter, // Rate limiting específico para búsquedas con IA
  sanitizeInput, // Limpiar y normalizar datos de entrada
  [
    check('city', 'La ciudad es requerida').notEmpty()
      .isLength({ min: 2, max: 50 }).withMessage('La ciudad debe tener entre 2 y 50 caracteres')
      .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('La ciudad solo puede contener letras y espacios'),
    validateFields
  ],
  validateImageExists, // Validación básica de imagen para reverse search
  asyncHandler(reverseSearch))

// POST - Crear nueva búsqueda de mascota
router.post('/',
  uploadLimiter, // Rate limiting específico para uploads
  sanitizeInput, // Limpiar y normalizar datos de entrada
  [
    check('city', 'La ciudad es requerida').notEmpty()
      .isLength({ min: 2, max: 50 }).withMessage('La ciudad debe tener entre 2 y 50 caracteres')
      .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('La ciudad solo puede contener letras y espacios'),
    
    check('description', 'La descripción es requerida').notEmpty()
      .isLength({ min: 10, max: 500 }).withMessage('La descripción debe tener entre 10 y 500 caracteres')
      .trim(),
    
    check('gpsLocation.latitude', 'La latitud es requerida').notEmpty()
      .isFloat({ min: -90, max: 90 }).withMessage('La latitud debe estar entre -90 y 90 grados'),
    
    check('gpsLocation.longitude', 'La longitud es requerida').notEmpty()
      .isFloat({ min: -180, max: 180 }).withMessage('La longitud debe estar entre -180 y 180 grados'),
    
    check('phone', 'El teléfono es requerido').notEmpty()
      .isMobilePhone('any', { strictMode: false }).withMessage('Formato de teléfono inválido')
      .isLength({ min: 8, max: 15 }).withMessage('El teléfono debe tener entre 8 y 15 dígitos'),
    
    check('type', 'El tipo es requerido').notEmpty()
      .isIn(['FIND', 'LOST']).withMessage('El tipo debe ser FIND (encontrado) o LOST (perdido)'),
      
    validateFields
  ],
  validateImageBase64, // Validación robusta de imagen
  asyncHandler(createSearch))

module.exports = router;