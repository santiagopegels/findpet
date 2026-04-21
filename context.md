# Findog – Contexto del Proyecto

> Documento de contexto para modelos de IA. Lee este archivo al inicio para tener comprensión completa del proyecto.

---

## 1. Resumen ejecutivo

**Findog** es una plataforma para reportar mascotas perdidas y encontradas. Permite:

- **Búsqueda tradicional**: listar búsquedas por ciudad, tipo (FIND/LOST), fechas
- **Búsqueda inversa por imagen**: subir una foto y encontrar imágenes similares usando ML (detección YOLOv8 + embeddings CLIP + Qdrant)
- **Mapa de ubicaciones**: visualizar búsquedas geográficamente
- **Georreferenciación**: provincias y ciudades de Argentina (API GEOREF)

**Stack principal**: Node.js (Express) + MongoDB + Redis + Python/Flask (servicio ML).

---

## 2. Estructura del proyecto

```
findog/
├── app.js                 # Entrada: carga dotenv, arranca Server
├── config/app-config.js   # Configuración centralizada (DB, Redis, ML, seguridad)
├── models/
│   ├── server.js          # Clase Server: Express, middlewares, rutas, servicios
│   ├── search.js          # Mongoose Schema: Search
│   ├── Provincia.js       # Mongoose Schema: Provincia (GEOREF)
│   └── Ciudad.js          # Mongoose Schema: Ciudad (GEOREF)
├── controllers/           # Lógica de negocio
│   └── search.js          # createSearch, getAllSearches, reverseSearch, getMapLocations
├── routes/
│   ├── search.js          # CRUD búsquedas + reverse-search
│   ├── georef.routes.js   # Provincias y ciudades
│   └── health.js          # Health checks, métricas, cache
├── services/
│   ├── uploader/          # Subida de imágenes (local, aws-s3 contract)
│   │   ├── upload.js
│   │   ├── localService.js
│   │   └── contract/storageService.js
│   ├── predicter/         # Comunicación con ML
│   │   ├── saveImageFeature.js
│   │   ├── searchSimilarImages.js
│   │   └── removeFeatures.js
│   └── image-processor.js # Procesamiento con Sharp (3 versiones)
├── middleware/
│   ├── security-headers.js
│   ├── rate-limiter.js
│   ├── error-handler.js
│   ├── image-validator.js
│   └── validate-fields.js
├── database/
│   ├── config.js          # Conexión MongoDB
│   └── indexes.js         # Índices de Search
├── crons/
│   ├── index.js           # Orquestador de crons
│   └── removeSearchesCron.js
├── utils/
│   ├── logger.js
│   ├── cache.js           # CacheManager Redis + CacheUtils
│   ├── errors.js
│   └── search-helpers.js
├── helpers/utils.js
├── seeders/georef.seeder.js
├── frontend/              # Vanilla HTML/CSS/JS
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── animal-detector.js # TensorFlow.js COCO-SSD
│   ├── image-compressor.js
│   └── lib/
├── reverse-searcher/      # Servicio ML Python
│   ├── server.py          # API Flask
│   ├── start.py           # Entry point
│   ├── config.py
│   ├── models/feature_extractor.py  # YOLOv8 + CLIP
│   ├── storage/vector_store.py     # Qdrant + Redis
│   ├── utils/logger.py, image_validator.py
│   ├── scripts/docker-helper.sh
│   └── tests/
├── scripts/               # Utilidades CLI
├── docker-compose.yml
├── docker-compose.prod.yml
├── docker-compose.override.yml
├── Dockerfile
├── env.example
└── context.md             # Este archivo
```

---

## 3. Arquitectura y flujo de datos

```
[Frontend] ──► [App Node.js :3000/3005] ──► [MongoDB :27017]
                      │                            ▲
                      │ save-feature               │
                      │ reverse-search             │
                      │ remove-features            │
                      ▼                            │
              [reverse-searcher :5000]             │
                      │                            │
                      ▼                            │
              [Qdrant :6333]                       │
              [Redis :6379] ◄───────────────────┘
                   (cache)
```

### Comunicación Node.js ↔ ML (reverse-searcher)

- **Autenticación**: header `X-API-KEY` (mismo valor que `MACHINE_LEARNING_API_KEY` / `API_KEY`)
- **Endpoints**:
  - `POST /save-feature`: extraer características y guardar en Qdrant
  - `POST /reverse-search`: buscar imágenes similares
  - `DELETE /remove-features`: borrar características por IDs
  - `GET /health`: health check

### Volumen compartido Docker

- `./images` montado en app y reverse-searcher
- El ML busca `{searchId}_large.webp` en `IMAGES_DIR`
- **Nombres de archivos**: `{searchId}_thumb.webp`, `{searchId}_medium.webp`, `{searchId}_large.webp`
- `saveImageFeature` envía solo `filename` (ObjectId string); existe retry con backoff por race condition de volumen Docker

---

## 4. Modelos de datos (MongoDB/Mongoose)

### Search

```javascript
{
  city: ObjectId (ref: Ciudad),
  description: String,
  gpsLocation: { latitude, longitude },
  filename: String,           // opcional, legacy
  imageVersions: {
    thumbnail: String,        // ej. {id}_thumb.webp
    medium: String,           // ej. {id}_medium.webp
    large: String             // ej. {id}_large.webp (usado por ML)
  },
  phone: String,
  type: 'FIND' | 'LOST',
  createdAt: Date
}
```

Índices: `city`, `type`, `createdAt`, `gps_location_2dsphere`, `filename`, `phone`, TTL 365 días.

### Provincia / Ciudad

- Provincias: GEOREF `id`, `nombre`, `centroide`
- Ciudades: `provincia` (ref Provincia), `nombre`, `id`, `centroide`
- Seeder: `seeders/georef.seeder.js` (APIs datos.gob.ar)

---

## 5. Rutas API principales

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/search` | GET | Listar búsquedas (paginación, filtros: city, type, dateFrom, dateTo) |
| `/api/search` | POST | Crear búsqueda (imagen base64, city, description, gpsLocation, phone, type) |
| `/api/search/reverse-search` | POST | Búsqueda por similitud de imagen (imagen, cityId) |
| `/api/search/map-locations` | GET | Ubicaciones para mapa |
| `/api/georef/provincias` | GET | Listar provincias |
| `/api/georef/provincias/:id/ciudades` | GET | Ciudades por provincia |
| `/api/georef/ciudades` | GET | Buscar ciudades por nombre |
| `/health` | GET | Health básico |
| `/health/detailed` | GET | Health con DB, filesystem |
| `/health/metrics` | GET | Métricas agregadas |
| `/health/cache/flush` | POST | Limpiar cache Redis |
| `/health/cache/stats` | GET | Estadísticas cache |

---

## 6. Uso de Redis

- **Cache distribuido**: habilitado con `REDIS_ENABLED=true`
- **App Node.js** (`utils/cache.js`): cache de búsquedas, conteos, reverse-search, top cities, metrics (TTL 3–30 min)
- **Reverse-searcher** (`storage/vector_store.py`): cache de resultados de búsqueda vectorial (clave `search:{query_hash}:{k}`, TTL 1h)
- Fallback: si Redis no está disponible, la app funciona sin cache
- Invalidación: al crear búsqueda se invalida cache de searches; al añadir/eliminar features se invalida `search:*`

---

## 7. Pipeline ML (reverse-searcher)

1. **YOLOv8** detecta perro/gato (COCO classes 15=cat, 16=dog), recorta bounding box
2. **CLIP (ViT-B-32)** genera embedding 512D
3. **Normalización L2** del vector
4. **Qdrant** (colección `pet_features`, distancia Euclid/L2) almacena vectores con payloads
5. Filtro nativo por `animal_class` (payload) y por IDs (HasIdCondition)
6. Filtro por `MAX_L2_DISTANCE` (score_threshold, menor distancia = más similar)

Config: `config.py` (YOLO_MODEL, CLIP_MODEL, FEATURE_DIMENSION=512, MAX_L2_DISTANCE, QDRANT_HOST, QDRANT_PORT).

---

## 8. Procesamiento de imágenes (Node.js)

- **Sharp**: genera 3 versiones: thumbnail (300px), medium (800px), large (1200px)
- **Formato**: WebP
- **Validación**: `middleware/image-validator.js` (tipo MIME, tamaño, dimensiones)
- **Almacenamiento**: contrato en `services/uploader/contract/storageService.js`; implementación local en `localService.js`

---

## 9. Patrones y convenciones

### Código Node.js

- `asyncHandler` en rutas para capturar errores async
- `Server` en `models/server.js` configura todo (middlewares, rutas, DB, Redis, crons)
- Configuración en `config/app-config.js`; validación con `ConfigUtils.validate()`
- Errores: `utils/errors.js` + middleware `error-handler.js`
- Logging: Winston + `logAppEvent` para eventos estructurados

### Seguridad

- Helmet, HSTS, CSP
- Rate limiting global y específico (uploads, reverse-search)
- Bloqueo de User-Agents sospechosos (bots, crawlers, sqlmap, etc.)
- Validación de imagen con `file-type` y Sharp
- `sanitizeInput` para limpieza de inputs

### Respuestas API

- `formatApiResponse` en `search-helpers.js`
- Metadatos: `processingTime`, `fromCache`, `searchMethod`, paginación

---

## 10. Variables de entorno clave

### App Node.js

```
PORT, NODE_ENV, URL
MONGO_DB_CONNECTION
MACHINE_LEARNING_URL, MACHINE_LEARNING_API_KEY
STORAGE_TYPE, REDIS_ENABLED, REDIS_HOST, REDIS_PORT
RATE_LIMIT_*, UPLOAD_RATE_LIMIT_*, REVERSE_SEARCH_RATE_LIMIT_*
MAX_IMAGE_SIZE, CREATE_INDEXES_ON_STARTUP
CRON_REMOVE_OLD_SEARCHES, SEARCH_MAX_AGE_DAYS
LOG_LEVEL, LOG_FORMAT, LOGS_DIR
```

### reverse-searcher

```
API_KEY, HOST, PORT, DEBUG
YOLO_MODEL, CLIP_MODEL, YOLO_CONFIDENCE_THRESHOLD
MAX_IMAGE_SIZE, MAX_SEARCH_RESULTS, MAX_L2_DISTANCE
QDRANT_HOST, QDRANT_PORT, QDRANT_COLLECTION
REDIS_ENABLED, REDIS_HOST, REDIS_PORT
IMAGES_DIR, LOG_LEVEL, LOG_FORMAT
```

### Docker Compose

| Servicio | Puerto |
|----------|--------|
| mongo | 27017 |
| redis | 6379 |
| qdrant | 6333 (REST), 6334 (gRPC) |
| reverse-searcher | 5000 |
| app | 3000 (dev) / 3005 (prod) |

---

## 11. Scripts y comandos

```bash
npm start          # node app.js
npm run dev        # NODE_ENV=development
npm run prod       # NODE_ENV=production
npm run seed:georef  # Cargar provincias/ciudades

# Reverse-searcher
./scripts/docker-helper.sh dev    # Levantar ML + Redis
./scripts/docker-helper.sh redis  # CLI Redis
```

---

## 12. Flujos principales

### Crear búsqueda (POST /api/search)

1. Validar body (imagen base64, city, description, gpsLocation, phone, type)
2. Procesar imagen con Sharp → thumbnail, medium, large
3. Guardar en storage (local/S3 según configuración)
4. Crear documento Search en MongoDB
5. Llamar **asíncronamente** a `saveImageFeature` en ML para extraer y guardar features en Qdrant

### Reverse search (POST /api/search/reverse-search)

1. Obtener IDs de búsquedas por ciudad (desde cache o MongoDB)
2. Enviar imagen base64 + IDs al ML
3. ML extrae embedding, busca en Qdrant (filtrando por esos IDs y clase de animal), devuelve IDs ordenados por similitud
4. Node reordena documentos y devuelve resultados con metadatos

### Cron de limpieza (removeSearchesCron)

1. Encuentra búsquedas más antiguas que `SEARCH_MAX_AGE_DAYS`
2. Llama `removeFeatures` al ML
3. Elimina imágenes del disco
4. Elimina documentos de MongoDB

---

## 13. Frontend

- Vanilla JS, sin framework
- TensorFlow.js + COCO-SSD para detección de animales en cliente
- Leaflet para mapas
- Compresión de imágenes antes de subir
- Llamadas a la API desde `app.js`

---

## 14. Documentación adicional

- `QUICKSTART.md` – inicio rápido
- `SECURITY.md` – seguridad
- `PERFORMANCE_OPTIMIZATION.md` – optimizaciones (Redis, índices, etc.)
- `ERROR_HANDLING.md` – manejo de errores
- `IMAGE_OPTIMIZATION.md` – procesamiento de imágenes
- `reverse-searcher/README.md` – servicio ML

---

## 15. Notas para IA

- Responder en **español** salvo que se pida otro idioma
- Usar Context7 cuando necesites documentación de librerías
- La app tolera Redis caído; no asumas que Redis está siempre disponible
- Los vectores se almacenan en Qdrant (colección `pet_features`); cada punto tiene un UUID5 generado determinísticamente a partir del `feature_id` (MongoDB ObjectId string)
- Los payloads de Qdrant incluyen `feature_id`, `animal_class`, `detection_confidence`, `filename`, `image_path`, `timestamp`
- La búsqueda inversa **siempre** filtra por ciudad (HasIdCondition con UUIDs) y opcionalmente por clase de animal (FieldCondition en payload)
- Qdrant reemplazó a FAISS; ya no existen `faiss_index.bin` ni `metadata.json`
