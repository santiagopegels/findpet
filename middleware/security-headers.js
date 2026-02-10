const helmet = require('helmet');

// Configuración de seguridad para headers
const securityHeaders = helmet({
  // Configuraciones específicas de helmet
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "http://localhost:3005", "https://raw.githubusercontent.com", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Deshabilitar para permitir imágenes externas
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  },
  noSniff: true, // Prevenir MIME type sniffing
  frameguard: { action: 'deny' }, // Prevenir clickjacking
  xssFilter: true, // Habilitar filtro XSS del navegador
});

// Middleware adicional para headers de seguridad personalizados
const additionalSecurityHeaders = (req, res, next) => {
  // Agregar headers de seguridad adicionales
  res.setHeader('X-API-Version', '1.0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); // Prevenir indexación
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Header personalizado para indicar que la API es para mascotas perdidas
  res.setHeader('X-Service-Type', 'lost-pets-api');

  // Remover header que expone tecnología
  res.removeHeader('X-Powered-By');

  next();
};

// Middleware para prevenir information disclosure
const preventInfoDisclosure = (req, res, next) => {
  // Ocultar información del servidor en caso de error
  const originalSend = res.send;

  res.send = function (data) {
    // Si es un error 500, no mostrar stack trace en producción
    if (res.statusCode >= 500 && process.env.NODE_ENV === 'production') {
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.stack) {
            delete parsed.stack;
            data = JSON.stringify(parsed);
          }
        } catch (e) {
          // Si no es JSON válido, dejar como está
        }
      } else if (typeof data === 'object' && data.stack) {
        delete data.stack;
      }
    }

    originalSend.call(this, data);
  };

  next();
};

// Middleware para validar User-Agent (prevenir bots maliciosos)
const validateUserAgent = (req, res, next) => {
  const userAgent = req.get('User-Agent');

  // Lista de User-Agents sospechosos/bloqueados
  const blockedAgents = [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /masscan/i,
    /zap/i,
    /burp/i,
    /\bbot\b/i, // Genérico para muchos bots
    /crawler/i,
    /spider/i,
    /scraper/i
  ];

  if (!userAgent) {
    return res.status(400).json({
      status: false,
      error: 'USER_AGENT_REQUIRED',
      message: 'User-Agent es requerido'
    });
  }

  // Verificar si el User-Agent está en la lista de bloqueados
  for (const blockedPattern of blockedAgents) {
    if (blockedPattern.test(userAgent)) {
      return res.status(403).json({
        status: false,
        error: 'FORBIDDEN_USER_AGENT',
        message: 'User-Agent no permitido'
      });
    }
  }

  next();
};

// Middleware para logging de seguridad
const securityLogger = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log eventos sospechosos
    if (res.statusCode === 429 || res.statusCode === 403) {
      console.warn({
        type: 'SECURITY_EVENT',
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: duration,
        headers: req.headers
      });
    }

    originalSend.call(this, data);
  };

  next();
};

module.exports = {
  securityHeaders,
  additionalSecurityHeaders,
  preventInfoDisclosure,
  validateUserAgent,
  securityLogger
}; 