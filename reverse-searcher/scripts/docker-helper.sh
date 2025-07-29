#!/bin/bash
set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuración
PROJECT_NAME="findog"
COMPOSE_FILES="-f docker-compose.yml"

# Funciones de logging
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
    echo -e "${PURPLE}ℹ️  $1${NC}"
}

# Función de ayuda
show_help() {
    cat << EOF
🐕 FinDog Reverse Searcher - Docker Helper

USO:
    $0 <comando> [opciones]

COMANDOS:
    dev         Iniciar en modo desarrollo
    prod        Iniciar en modo producción  
    test        Ejecutar tests
    stop        Detener todos los servicios
    restart     Reiniciar servicios
    logs        Ver logs de servicios
    status      Ver estado de servicios
    clean       Limpiar contenedores e imágenes
    build       Construir imágenes
    shell       Abrir shell en el contenedor principal
    redis       Abrir CLI de Redis
    migrate     Ejecutar migración de datos legacy
    benchmark   Ejecutar benchmark del sistema
    monitor     Iniciar stack de monitoreo
    
EJEMPLOS:
    $0 dev                 # Iniciar en desarrollo
    $0 prod                # Iniciar en producción
    $0 test load           # Ejecutar test de carga
    $0 logs reverse-searcher  # Ver logs del servidor
    $0 benchmark 20        # Benchmark con 20 imágenes
    
OPCIONES:
    --build    Forzar rebuild de imágenes
    --clean    Limpiar volúmenes también
EOF
}

# Verificar dependencias
check_dependencies() {
    if ! command -v docker &> /dev/null; then
        error "Docker no está instalado"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose no está instalado"
        exit 1
    fi
}

# Crear directorios necesarios
setup_directories() {
    log "Creando directorios necesarios..."
    mkdir -p images features models logs test-images test-results
    mkdir -p nginx/ssl monitoring
    success "Directorios creados"
}

# Verificar archivo .env
check_env_file() {
    if [ ! -f .env ]; then
        warning "Archivo .env no encontrado"
        if [ -f .env.example ]; then
            log "Copiando .env.example a .env"
            cp .env.example .env
            warning "Por favor edita .env con tu configuración"
        else
            error "No se encontró .env.example"
            exit 1
        fi
    fi
}

# Comandos principales
cmd_dev() {
    log "🚀 Iniciando en modo DESARROLLO..."
    check_env_file
    setup_directories
    
    local extra_flags=""
    if [[ "$*" == *"--build"* ]]; then
        extra_flags="--build"
    fi
    
    docker-compose $COMPOSE_FILES -f docker-compose.override.yml up $extra_flags -d reverse-searcher redis
    
    success "Servicios iniciados en modo desarrollo"
    info "Servidor: http://localhost:5000"
    info "Redis: localhost:6379"
    
    log "Esperando a que el servidor esté listo..."
    sleep 5
    
    # Test rápido
    if curl -s http://localhost:5000/health > /dev/null; then
        success "Servidor respondiendo correctamente"
    else
        warning "Servidor puede tardar unos segundos más en estar listo"
    fi
}

cmd_prod() {
    log "🏭 Iniciando en modo PRODUCCIÓN..."
    check_env_file
    setup_directories
    
    local extra_flags=""
    if [[ "$*" == *"--build"* ]]; then
        extra_flags="--build"
    fi
    
    docker-compose $COMPOSE_FILES -f docker-compose.prod.yml up $extra_flags -d
    
    success "Servicios iniciados en modo producción"
    info "Servidor: http://localhost (Nginx)"
    info "Directo: http://localhost:5000"
}

cmd_test() {
    log "🧪 Ejecutando tests..."
    
    local test_type="${1:-test}"
    
    # Asegurar que el servidor esté ejecutándose
    if ! docker-compose ps reverse-searcher | grep -q "Up"; then
        log "Iniciando servidor para tests..."
        cmd_dev --build
        sleep 10
    fi
    
    # Ejecutar tests
    docker-compose $COMPOSE_FILES run --rm test-client $test_type
}

cmd_stop() {
    log "🛑 Deteniendo servicios..."
    docker-compose $COMPOSE_FILES -f docker-compose.override.yml -f docker-compose.prod.yml down
    success "Servicios detenidos"
}

cmd_restart() {
    log "🔄 Reiniciando servicios..."
    cmd_stop
    sleep 2
    cmd_dev
}

cmd_logs() {
    local service="${1:-reverse-searcher}"
    log "📋 Mostrando logs de $service..."
    docker-compose $COMPOSE_FILES logs -f $service
}

cmd_status() {
    log "📊 Estado de servicios:"
    docker-compose $COMPOSE_FILES ps
    
    echo
    log "💾 Uso de volúmenes:"
    docker volume ls | grep findog
    
    echo
    log "🌐 Conexiones de red:"
    docker network ls | grep findog
}

cmd_clean() {
    log "🧹 Limpiando contenedores e imágenes..."
    
    docker-compose $COMPOSE_FILES -f docker-compose.override.yml -f docker-compose.prod.yml down
    
    if [[ "$*" == *"--clean"* ]]; then
        warning "Eliminando volúmenes también..."
        docker-compose $COMPOSE_FILES down -v
        docker volume prune -f
    fi
    
    docker system prune -f
    success "Limpieza completada"
}

cmd_build() {
    log "🔨 Construyendo imágenes..."
    docker-compose $COMPOSE_FILES build --no-cache
    success "Imágenes construidas"
}

cmd_shell() {
    log "🐚 Abriendo shell en el contenedor..."
    docker-compose $COMPOSE_FILES exec reverse-searcher /bin/bash
}

cmd_redis() {
    log "💾 Abriendo CLI de Redis..."
    docker-compose $COMPOSE_FILES exec redis redis-cli
}

cmd_migrate() {
    log "🔄 Ejecutando migración de datos legacy..."
    docker-compose $COMPOSE_FILES exec reverse-searcher python scripts/migrate_legacy_features.py --verbose
}

cmd_benchmark() {
    local num_images="${1:-10}"
    log "⚡ Ejecutando benchmark con $num_images imágenes..."
    
    curl -X POST \
        -H "API_KEY: $(grep API_KEY .env | cut -d= -f2)" \
        -H "Content-Type: application/json" \
        -d "{\"num_images\": $num_images}" \
        http://localhost:5000/benchmark | jq '.'
}

cmd_monitor() {
    log "📊 Iniciando stack de monitoreo..."
    docker-compose $COMPOSE_FILES --profile monitoring up -d prometheus grafana
    
    success "Monitoreo iniciado"
    info "Prometheus: http://localhost:9090"
    info "Grafana: http://localhost:3000 (admin/admin123)"
}

# Función principal
main() {
    check_dependencies
    
    case "${1:-help}" in
        "dev"|"development")
            shift
            cmd_dev "$@"
            ;;
        "prod"|"production")
            shift
            cmd_prod "$@"
            ;;
        "test")
            shift
            cmd_test "$@"
            ;;
        "stop"|"down")
            cmd_stop
            ;;
        "restart")
            cmd_restart
            ;;
        "logs")
            shift
            cmd_logs "$@"
            ;;
        "status"|"ps")
            cmd_status
            ;;
        "clean")
            shift
            cmd_clean "$@"
            ;;
        "build")
            cmd_build
            ;;
        "shell"|"bash")
            cmd_shell
            ;;
        "redis")
            cmd_redis
            ;;
        "migrate")
            cmd_migrate
            ;;
        "benchmark")
            shift
            cmd_benchmark "$@"
            ;;
        "monitor")
            cmd_monitor
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            error "Comando desconocido: $1"
            echo
            show_help
            exit 1
            ;;
    esac
}

# Ejecutar comando
main "$@" 