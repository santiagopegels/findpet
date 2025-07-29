#!/bin/bash
set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
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

# Esperar a que el servidor esté listo
wait_for_server() {
    log "Esperando a que el servidor esté listo..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "${REVERSE_SEARCHER_URL}/health" > /dev/null 2>&1; then
            success "Servidor listo en ${REVERSE_SEARCHER_URL}"
            return 0
        fi
        
        log "Intento ${attempt}/${max_attempts}: Servidor no listo, esperando..."
        sleep 2
        ((attempt++))
    done
    
    error "Servidor no respondió después de ${max_attempts} intentos"
    return 1
}

# Test básico de health check
test_health() {
    log "Probando health check..."
    
    local response=$(curl -s "${REVERSE_SEARCHER_URL}/health")
    if echo "$response" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        success "Health check OK"
        return 0
    else
        error "Health check falló: $response"
        return 1
    fi
}

# Test de estadísticas
test_stats() {
    log "Probando endpoint de estadísticas..."
    
    local response=$(curl -s -H "API_KEY: ${API_KEY}" "${REVERSE_SEARCHER_URL}/stats")
    if echo "$response" | jq -e '.status == 200' > /dev/null 2>&1; then
        success "Stats endpoint OK"
        log "Estadísticas: $(echo "$response" | jq -c '.data')"
        return 0
    else
        error "Stats endpoint falló: $response"
        return 1
    fi
}

# Test de benchmark
test_benchmark() {
    log "Probando benchmark del modelo..."
    
    local response=$(curl -s -X POST \
        -H "API_KEY: ${API_KEY}" \
        -H "Content-Type: application/json" \
        -d '{"num_images": 5}' \
        "${REVERSE_SEARCHER_URL}/benchmark")
    
    if echo "$response" | jq -e '.status == 200' > /dev/null 2>&1; then
        success "Benchmark OK"
        local individual_time=$(echo "$response" | jq -r '.data.individual_processing.avg_per_image')
        local batch_time=$(echo "$response" | jq -r '.data.batch_processing.avg_per_image')
        log "Tiempo individual: ${individual_time}s, Tiempo batch: ${batch_time}s"
        return 0
    else
        error "Benchmark falló: $response"
        return 1
    fi
}

# Test de búsqueda con imagen sintética
test_reverse_search() {
    log "Probando búsqueda reversa con imagen sintética..."
    
    # Crear imagen de prueba en base64 (1x1 pixel rojo)
    local test_image="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    
    local response=$(curl -s -X POST \
        -H "API_KEY: ${API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"image\": \"${test_image}\", \"ids\": [\"test1\", \"test2\"]}" \
        "${REVERSE_SEARCHER_URL}/reverse-search")
    
    if echo "$response" | jq -e '.status == 200' > /dev/null 2>&1; then
        success "Reverse search OK"
        local results=$(echo "$response" | jq -r '.data | length')
        log "Resultados encontrados: ${results}"
        return 0
    else
        error "Reverse search falló: $response"
        return 1
    fi
}

# Test completo
run_tests() {
    log "🧪 Iniciando suite de tests..."
    
    local tests_passed=0
    local tests_total=5
    
    # Ejecutar tests
    wait_for_server && ((tests_passed++))
    test_health && ((tests_passed++))
    test_stats && ((tests_passed++))
    test_benchmark && ((tests_passed++))
    test_reverse_search && ((tests_passed++))
    
    # Resultados
    log "📊 Resultados de tests:"
    log "Pasados: ${tests_passed}/${tests_total}"
    
    if [ $tests_passed -eq $tests_total ]; then
        success "Todos los tests pasaron! 🎉"
        return 0
    else
        error "Algunos tests fallaron"
        return 1
    fi
}

# Función para tests de carga
load_test() {
    log "🚀 Ejecutando test de carga..."
    
    local concurrent_requests=10
    local total_requests=100
    local test_image="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    
    log "Enviando ${total_requests} requests con ${concurrent_requests} concurrentes..."
    
    # Usar GNU parallel si está disponible, sino bucle secuencial
    if command -v parallel > /dev/null 2>&1; then
        seq 1 $total_requests | parallel -j $concurrent_requests "curl -s -X POST \
            -H 'API_KEY: ${API_KEY}' \
            -H 'Content-Type: application/json' \
            -d '{\"image\": \"${test_image}\", \"ids\": [\"test1\"]}' \
            '${REVERSE_SEARCHER_URL}/reverse-search' > /dev/null"
    else
        for i in $(seq 1 $total_requests); do
            curl -s -X POST \
                -H "API_KEY: ${API_KEY}" \
                -H "Content-Type: application/json" \
                -d "{\"image\": \"${test_image}\", \"ids\": [\"test1\"]}" \
                "${REVERSE_SEARCHER_URL}/reverse-search" > /dev/null &
            
            if [ $((i % concurrent_requests)) -eq 0 ]; then
                wait
            fi
        done
        wait
    fi
    
    success "Test de carga completado"
}

# Función principal
main() {
    case "${1:-test}" in
        "test")
            run_tests
            ;;
        "load")
            wait_for_server && load_test
            ;;
        "health")
            wait_for_server && test_health
            ;;
        "interactive")
            log "Modo interactivo - el contenedor permanecerá activo"
            wait_for_server
            exec /bin/bash
            ;;
        *)
            echo "Uso: $0 [test|load|health|interactive]"
            exit 1
            ;;
    esac
}

# Ejecutar función principal
main "$@" 