# Multi-stage Dockerfile para el servidor reverse-searcher optimizado
FROM python:3.9-slim as builder

# Instalar dependencias del sistema necesarias para compilación
RUN apt-get update && apt-get install -y \
    build-essential \
    libmagic-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar requirements y instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ========================
# Imagen final optimizada
# ========================
FROM python:3.9-slim

# Instalar solo dependencias runtime necesarias
RUN apt-get update && apt-get install -y \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Crear usuario no-root para seguridad
RUN useradd --create-home --shell /bin/bash --uid 1000 appuser

# Crear directorios necesarios
RUN mkdir -p /app/images /app/features /app/models /app/logs \
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
ENV TF_CPP_MIN_LOG_LEVEL=2
ENV HOST=0.0.0.0
ENV PORT=5000
ENV LOG_LEVEL=INFO
ENV MODEL_TYPE=efficientnet

# Crear directorio para modelos si no existe
RUN mkdir -p models

# Verificar instalación
RUN python -c "import tensorflow as tf; print(f'TensorFlow version: {tf.__version__}')" && \
    python -c "import faiss; print(f'FAISS version: {faiss.__version__ if hasattr(faiss, \"__version__\") else \"OK\"}')" && \
    python -c "import config; print('Configuration loaded successfully')"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health', timeout=5)" || exit 1

# Exponer puerto
EXPOSE 5000

# Comando por defecto usando gunicorn para producción
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "server:app"] 