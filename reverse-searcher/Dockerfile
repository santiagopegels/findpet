# Multi-stage Dockerfile para el servidor reverse-searcher con YOLOv8 + CLIP
FROM python:3.10-slim as builder

# Instalar dependencias del sistema necesarias para compilación
RUN apt-get update && apt-get install -y \
    build-essential \
    libmagic-dev \
    pkg-config \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar requirements y instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ========================
# Imagen final optimizada
# ========================
FROM python:3.10-slim

# Instalar solo dependencias runtime necesarias
RUN apt-get update && apt-get install -y \
    libmagic1 \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Crear usuario no-root para seguridad
RUN useradd --create-home --shell /bin/bash --uid 1000 appuser

# Crear directorios necesarios
RUN mkdir -p /app/images /app/features /app/models /app/logs /app/test-images /app/test-results \
    && chown -R appuser:appuser /app

# Cambiar a usuario no-root
USER appuser
WORKDIR /app

# Copiar dependencias instaladas desde builder
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local

# Agregar el directorio local de Python al PATH
ENV PATH=/home/appuser/.local/bin:$PATH

# Copiar código de la aplicación
COPY --chown=appuser:appuser . .

# Variables de entorno por defecto
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=5000
ENV LOG_LEVEL=INFO

# Variables para YOLOv8 + CLIP pipeline
ENV YOLO_MODEL=yolov8n.pt
ENV CLIP_MODEL=clip-ViT-B-32
ENV YOLO_CONFIDENCE_THRESHOLD=0.25

# Crear directorio para modelos si no existe
RUN mkdir -p models

# Verificar instalación de las nuevas dependencias
RUN python -c "from ultralytics import YOLO; print('Ultralytics OK')" && \
    python -c "from sentence_transformers import SentenceTransformer; print('SentenceTransformers OK')" && \
    python -c "import faiss; print('FAISS OK')" && \
    python -c "import config; print('Configuration loaded successfully')"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health', timeout=5)" || exit 1

# Exponer puerto
EXPOSE 5000

# Comando por defecto usando gunicorn para producción
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "server:app"]
