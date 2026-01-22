# 🚨 Sistema de Manejo de Errores - FinDog API

## Resumen de Implementación

El sistema de manejo de errores de FinDog ha sido completamente refactorizado para proporcionar logging estructurado, manejo centralizado de errores y respuestas consistentes al cliente.

## 🏗️ **Arquitectura del Sistema**

### **1. Componentes Principales**

```
┌─ utils/logger.js          # Sistema de logging con Winston
├─ utils/errors.js          # Clases de errores personalizadas  
├─ middleware/error-handler.js # Middleware centralizado de errores
├─ middleware/validate-fields.js # Validación mejorada con errores
└─ routes/health.js         # Health checks y métricas
```

### **2. Flujo de Manejo de Errores**

```
Request → Middlewares → Controller → Error → Error Handler → Response
    ↓                       ↓             ↓
  Logging              Custom Error   Structured Log
```

## 📊 **Sistema de Logging**

### **Niveles de Log**
- **error**: Errores del servidor (500+)
- **warn**: Errores del cliente (400-499) 
- **security**: Eventos de seguridad
- **info**: Eventos de aplicación
- **http**: Requests HTTP
- **debug**: Información de debugging

### **Archivos de Log**
```
logs/
├── error-YYYY-MM-DD.log      # Solo errores y warnings
├── security-YYYY-MM-DD.log   # Eventos de seguridad
├── combined-YYYY-MM-DD.log   # Todos los logs
├── http-YYYY-MM-DD.log       # Solo requests HTTP
├── exceptions-YYYY-MM-DD.log # Excepciones no capturadas
└── rejections-YYYY-MM-DD.log # Promesas rechazadas
```

### **Rotación de Archivos**
- **Errores**: Retención 14 días, máx 20MB
- **Seguridad**: Retención 30 días, máx 20MB
- **Combinados**: Retención 7 días, máx 20MB
- **HTTP**: Retención 3 días, máx 50MB

## 🎯 **Clases de Errores Personalizadas**

### **AppError (Clase Base)**
```javascript
const error = new AppError(message, statusCode, errorCode, isOperational);
```

### **Errores Específicos**

| Clase | Status Code | Uso |
|-------|-------------|-----|
| `ValidationError` | 400 | Errores de validación de entrada |
| `ImageValidationError` | 400 | Errores específicos de imágenes |
| `NotFoundError` | 404 | Recursos no encontrados |
| `ConflictError` | 409 | Duplicados o conflictos |
| `RateLimitError` | 429 | Límites de rate limiting |
| `DatabaseError` | 500 | Errores de base de datos |
| `ExternalServiceError` | 502/503 | Errores de servicios externos |
| `FileError` | 500 | Errores de archivos/storage |

### **Funciones de Utilidad**
```javascript
const { createError } = require('../utils/errors');

// Ejemplos de uso
throw createError.validation('Campo requerido', 'email', 'invalid@');
throw createError.notFound('Usuario', userId);
throw createError.database('Error de conexión', 'connect', originalError);
```

## 🔧 **Middleware Centralizado**

### **errorHandler**
- Normaliza errores de Mongoose y Axios
- Determina nivel de log apropiado
- Envía respuesta estructurada al cliente
- Oculta información sensible en producción

### **requestLogger** 
- Logging automático de todas las requests
- Medición de tiempo de respuesta
- Warnings de performance (>5 segundos)

### **asyncHandler**
```javascript
const { asyncHandler } = require('../middleware/error-handler');

router.get('/', asyncHandler(async (req, res) => {
    // Errores async son capturados automáticamente
    const data = await someAsyncFunction();
    res.json(data);
}));
```

## 📝 **Formato de Respuestas de Error**

### **Desarrollo**
```json
{
  "status": false,
  "error": "VALIDATION_ERROR",
  "message": "Error en city: La ciudad es requerida",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "stack": "Error: ...",
  "details": {
    "name": "ValidationError",
    "isOperational": true
  },
  "field": "city"
}
```

### **Producción**
```json
{
  "status": false,
  "error": "VALIDATION_ERROR", 
  "message": "Error en city: La ciudad es requerida",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🛡️ **Validación Mejorada**

### **Sanitización Automática**
```javascript
// Antes del procesamiento
router.post('/', sanitizeInput, [...validations], asyncHandler(controller));
```

### **Validaciones Específicas**
- **Ciudad**: Solo letras y espacios, 2-50 caracteres
- **Descripción**: 10-500 caracteres, requerida
- **Coordenadas GPS**: Rangos válidos de latitud/longitud
- **Teléfono**: Formato válido, 8-15 dígitos
- **Tipo**: Solo 'FIND' o 'LOST'

### **Mensajes en Español**
Todos los mensajes de error están en español para mejor UX.

## 📈 **Monitoreo y Health Checks**

### **Endpoints de Health**

| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Health check básico |
| `GET /health/detailed` | Health check con dependencias |
| `GET /health/metrics` | Métricas del sistema |

### **Health Check Detallado**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "responseTime": "15ms",
  "service": "findog-api",
  "checks": {
    "database": { "status": "healthy", "connection": "connected" },
    "filesystem": { "status": "healthy", "imagesDir": "accessible" },
    "mlService": { "status": "unknown" }
  }
}
```

### **Métricas Disponibles**
- Total de búsquedas por tipo
- Búsquedas recientes (24h)
- Top 5 ciudades con más reportes
- Métricas del sistema (memoria, CPU, uptime)

## 🔍 **Logging Estructurado**

### **Eventos de Aplicación**
```javascript
logAppEvent('SEARCH_CREATED', {
    searchId: '507f1f77bcf86cd799439011',
    city: 'Madrid', 
    type: 'LOST',
    duration: '245ms'
});
```

### **Eventos de Seguridad**
```javascript
logSecurityEvent('RATE_LIMIT_EXCEEDED', {
    ip: '192.168.1.1',
    endpoint: '/api/search',
    userAgent: 'Mozilla/5.0...'
});
```

### **Errores de Performance**
```javascript
logPerformanceWarning('createSearch', 3500, 3000);
// Warning: createSearch took 3500ms (threshold: 3000ms)
```

## ⚙️ **Configuración**

### **Variables de Entorno**
```bash
# Logging level (error, warn, info, debug)
LOG_LEVEL=info

# Node environment
NODE_ENV=production

# Database connection
MONGO_DB_CONNECTION=mongodb://localhost:27017/findog
```

### **Configuración de Winston**
- Logs en JSON para fácil parsing
- Compresión automática de archivos antiguos
- Manejo de excepciones no capturadas
- Diferentes transports por tipo de log

## 🚀 **Beneficios Implementados**

### **Antes vs Después**

| Aspecto | ❌ Antes | ✅ Después |
|---------|----------|------------|
| **Logging** | console.log básico | Winston estructurado |
| **Errores** | Respuestas inconsistentes | Clases y códigos estandarizados |
| **Debugging** | Stack traces expuestos | Información sanitizada |
| **Monitoreo** | Sin health checks | Health checks + métricas |
| **Performance** | Sin medición | Logging automático de tiempos |
| **Seguridad** | Información expuesta | Logs de eventos sospechosos |

### **Mejoras de Rendimiento**
- Queries paralelas en `getAllSearches`
- Logging asíncrono no bloqueante
- Sanitización eficiente de datos sensibles
- Manejo graceful de cierre del servidor

## 🔧 **Uso en Desarrollo**

### **Testear Errores**
```bash
# Error de validación
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"city": ""}'

# Health check
curl http://localhost:3000/health/detailed
```

### **Ver Logs en Tiempo Real**
```bash
# Todos los logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Solo errores
tail -f logs/error-$(date +%Y-%m-%d).log

# Solo eventos de seguridad
tail -f logs/security-$(date +%Y-%m-%d).log
```

## 📊 **Métricas de Calidad**

### **Cobertura de Errores**
- ✅ Errores de validación
- ✅ Errores de base de datos
- ✅ Errores de servicios externos
- ✅ Errores de archivos/storage
- ✅ Errores de rate limiting
- ✅ Errores 404 (rutas no encontradas)

### **Logging Completo**
- ✅ Todas las requests HTTP
- ✅ Errores con contexto completo
- ✅ Eventos de seguridad
- ✅ Métricas de performance
- ✅ Eventos de aplicación importantes

## 🎯 **Próximos Pasos**

- [ ] Integración con servicios de monitoreo externos
- [ ] Alertas automáticas por errores críticos
- [ ] Dashboard de métricas en tiempo real
- [ ] Tests unitarios para manejo de errores
- [ ] Documentación automática de APIs

---

**El sistema está completamente implementado y listo para producción.** 🚀 