const { validationResult } = require('express-validator');
const { createError } = require('../utils/errors');

const validateFields = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        // Formatear errores para mejor legibilidad
        const formattedErrors = errors.array().map(error => ({
            field: error.path || error.param,
            message: error.msg,
            value: error.value,
            location: error.location
        }));

        // Crear mensaje descriptivo
        const firstError = formattedErrors[0];
        const message = formattedErrors.length === 1
            ? `Error en ${firstError.field}: ${firstError.message}`
            : `Se encontraron ${formattedErrors.length} errores de validación`;

        // Crear error personalizado con detalles
        const validationError = createError.validation(message, firstError.field, firstError.value);
        validationError.validationErrors = formattedErrors;
        validationError.errorCount = formattedErrors.length;

        return next(validationError);
    }

    next();
};

/**
 * Middleware de validación que permite validaciones condicionales
 * Útil para campos que solo son requeridos bajo ciertas condiciones
 */
const conditionalValidateFields = (condition) => {
    return (req, res, next) => {
        if (condition(req)) {
            return validateFields(req, res, next);
        }
        next();
    };
};

/**
 * Middleware para sanitizar entrada antes de validación
 * Trim espacios, normalizar strings, etc.
 */
const sanitizeInput = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        // Sanitizar strings
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();

                // Normalizar campos específicos
                if (key === 'phone') {
                    // Remover caracteres no numéricos (espacios, guiones, etc)
                    let cleanPhone = req.body[key].replace(/\D/g, '');
                    // Agregar +54 si no lo tiene. Evitar duplicar si el usuario incluyó 54
                    if (cleanPhone.startsWith('54') && cleanPhone.length > 10) {
                        req.body[key] = '+' + cleanPhone;
                    } else {
                        req.body[key] = '+54' + cleanPhone;
                    }
                }
            }
        });

        // Normalizar coordenadas GPS
        if (req.body.gpsLocation) {
            if (req.body.gpsLocation.latitude) {
                req.body.gpsLocation.latitude = parseFloat(req.body.gpsLocation.latitude);
            }
            if (req.body.gpsLocation.longitude) {
                req.body.gpsLocation.longitude = parseFloat(req.body.gpsLocation.longitude);
            }
        }
    }

    next();
};

module.exports = {
    validateFields,
    conditionalValidateFields,
    sanitizeInput
};
