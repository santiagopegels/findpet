# 🔒 Mejoras de Seguridad - FinDog API

## Resumen de Implementaciones

Este documento describe las mejoras de seguridad implementadas en el proyecto FinDog para proteger contra ataques comunes y mejorar la robustez de la aplicación.

## 🚫 Rate Limiting

### Implementación
- **General**: 100 requests por IP cada 15 minutos
- **Upload de imágenes**: 10 uploads por IP cada hora
- **Reverse Search**: 20 búsquedas con IA por IP cada hora

### Archivos modificados
- `middleware/rate-limiter.js`
- `routes/search.js`

### Beneficios
- Previene ataques de denegación de servicio (DDoS)
- Reduce el abuso de recursos computacionales
- Limita el spam de imágenes

## 🖼️ Validación Robusta de Imágenes

### Implementación
- Detección real del tipo de archivo usando `file-type`
- Validación de formato base64
- Verificación de tamaño (máximo 5MB)
- Detección de archivos ejecutables disfrazados
- Validación de tipos permitidos: JPG, PNG, WebP

### Archivos modificados
- `middleware/image-validator.js`
- `controllers/search.js`

### Beneficios
- Previene upload de malware
- Evita ataques de desbordamiento de memoria
- Garantiza que solo se procesen imágenes reales

## 🛡️ Headers de Seguridad

### Implementación
- **Helmet.js**: Headers de seguridad estándar
- **Content Security Policy**: Previene XSS
- **HSTS**: Fuerza HTTPS en producción
- **X-Frame-Options**: Previene clickjacking
- **No-Sniff**: Previene MIME sniffing

### Archivos modificados
- `middleware/security-headers.js`
- `models/server.js`

### Beneficios
- Protección contra XSS
- Prevención de clickjacking
- Mejor control de recursos cargados

## 🚨 Validación de User-Agent

### Implementación
- Bloqueo de bots conocidos y herramientas de hacking
- Requerimiento de User-Agent válido
- Logging de eventos sospechosos

### Patterns Bloqueados
- `sqlmap`, `nikto`, `nmap`, `burp`
- Bots genéricos (`bot`, `crawler`, `scraper`)

## 📝 Logging de Seguridad

### Implementación
- Log estructurado de eventos sospechosos
- Ocultación de información sensible en producción
- Monitoreo de intentos de rate limiting

### Información Registrada
- IP del cliente
- User-Agent
- URL y método HTTP
- Timestamp y duración
- Código de estado HTTP

## 🔧 Configuración

### Variables de Entorno
Copia `env.example` a `.env` y configura:

```bash
# Requeridas
MONGO_DB_CONNECTION=mongodb://localhost:27017/findog
MACHINE_LEARNING_URL=http://localhost:5000
MACHINE_LEARNING_API_KEY=tu-clave-segura-aqui

# Opcionales (tienen valores por defecto)
PORT=3000
NODE_ENV=development
MAX_IMAGE_SIZE=5242880
```

### Instalación
```bash
npm install
```

### Ejecución
```bash
npm start
```

## 📊 Endpoints Actualizados

### POST `/api/search`
- ✅ Rate limiting: 10 uploads/hora
- ✅ Validación robusta de imagen
- ✅ Validación mejorada de campos
- ✅ Headers de seguridad

### POST `/api/search/reverse-search`
- ✅ Rate limiting: 20 búsquedas/hora
- ✅ Validación básica de imagen
- ✅ Manejo de errores mejorado

### GET `/api/search`
- ✅ Rate limiting general
- ✅ Paginación segura (máx 100 resultados)
- ✅ Filtros opcionales

## 🔍 Monitoreo

### Eventos de Seguridad
Los siguientes eventos se registran automáticamente:
- Rate limiting activado (429)
- User-Agent bloqueado (403)
- Imágenes rechazadas
- Errores de validación

### Headers de Respuesta
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1640995200
X-API-Version: 1.0
X-Service-Type: lost-pets-api
```

## ⚠️ Consideraciones para Producción

1. **HTTPS**: Habilitar HTTPS en producción
2. **API Keys**: Cambiar `MACHINE_LEARNING_API_KEY` por una clave segura
3. **MongoDB**: Usar autenticación y conexión segura
4. **Logs**: Configurar rotación de logs
5. **Firewall**: Configurar firewall a nivel de servidor

## 🚀 Próximas Mejoras

- [ ] Implementar Redis para rate limiting distribuido
- [ ] Agregar autenticación opcional para administradores
- [ ] Implementar CAPTCHA para prevenir bots
- [ ] Monitoreo con Prometheus/Grafana
- [ ] Backup automático de base de datos

## 📞 Soporte

Para reportar problemas de seguridad o sugerir mejoras, crear un issue en el repositorio. 