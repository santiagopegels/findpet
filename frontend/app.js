/**
 * Findog - Frontend Application
 * Vista minimalista con grid de mascotas y filtros
 */

// API Configuration
const API_BASE_URL = window.location.origin;
const API_ENDPOINTS = {
    search: `${API_BASE_URL}/api/search`,
    reverseSearch: `${API_BASE_URL}/api/search/reverse-search`,
    mapLocations: `${API_BASE_URL}/api/search/map-locations`,
    health: `${API_BASE_URL}/api/health`
};

// App State
const state = {
    pets: [],
    pagination: {
        page: 1,
        limit: 20,
        total: 0,
        pages: 0
    },
    filters: {
        city: '',
        type: '',
        dateFrom: '',
        dateTo: ''
    },
    reverseSearch: {
        city: '',
        image: null
    },
    newSearch: {
        image: null,
        location: null
    },
    isLoading: false,
    isSidebarOpen: false
};

// DOM Elements - Lazy loading para evitar bloquear el hilo principal
// Los elementos se cachean después de la primera obtención
const _elementsCache = {};
const elements = new Proxy({}, {
    get(target, prop) {
        if (!_elementsCache[prop]) {
            _elementsCache[prop] = document.getElementById(prop);
        }
        return _elementsCache[prop];
    }
});

// ====================================
// Utility Functions
// ====================================

function showLoading(message = 'Procesando...') {
    state.isLoading = true;
    elements.loadingText.textContent = message;
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    state.isLoading = false;
    elements.loadingOverlay.classList.add('hidden');
}

function showGridLoading() {
    elements.petsGrid.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.loadingGrid.classList.remove('hidden');
}

function hideGridLoading() {
    elements.loadingGrid.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// ====================================
// Sidebar Functions
// ====================================

function openSidebar() {
    state.isSidebarOpen = true;
    elements.filterSidebar.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    state.isSidebarOpen = false;
    elements.filterSidebar.classList.remove('open');
    document.body.style.overflow = '';
}

// Event Listeners for Sidebar
elements.filterToggleBtn.addEventListener('click', openSidebar);
elements.closeSidebarBtn.addEventListener('click', closeSidebar);
elements.sidebarOverlay.addEventListener('click', closeSidebar);

// Close sidebar with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isSidebarOpen) {
        closeSidebar();
    }
});

// ====================================
// Filter Functions
// ====================================



// ====================================
// Image Upload Functions
// ====================================

async function handleFileSelect(file) {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona un archivo de imagen', 'error');
        return;
    }

    // Validate file size (5MB max antes de comprimir)
    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar 5MB', 'error');
        return;
    }

    try {
        showLoading('Comprimiendo imagen...');

        // Comprimir la imagen antes de mostrarla
        const compressedDataUrl = await ImageCompressor.compressImage(file);

        state.reverseSearch.image = compressedDataUrl;
        elements.imagePreview.src = compressedDataUrl;
        elements.imagePreview.classList.remove('hidden');
        elements.uploadPlaceholder.classList.add('hidden');
        elements.removeImageBtn.classList.remove('hidden');
        elements.uploadArea.classList.add('has-image');
        updateReverseSearchButton();

        hideLoading();
        showToast('✅ Imagen comprimida y lista para subir', 'success');

    } catch (error) {
        console.error('Error procesando imagen:', error);
        showToast('Error al procesar la imagen: ' + error.message, 'error');
        hideLoading();
    }
}

function removeImage() {
    state.reverseSearch.image = null;
    elements.imagePreview.src = '';
    elements.imagePreview.classList.add('hidden');
    elements.uploadPlaceholder.classList.remove('hidden');
    elements.removeImageBtn.classList.add('hidden');
    elements.uploadArea.classList.remove('has-image');
    elements.fileInput.value = '';
    updateReverseSearchButton();
}

function updateReverseSearchButton() {
    const hasCity = elements.reverseSearchCity.value.trim().length > 0;
    elements.reverseSearchBtn.disabled = !hasCity;
}

// Event Listeners for Upload
elements.uploadArea.addEventListener('click', () => {
    if (!state.reverseSearch.image) {
        elements.fileInput.click();
    }
});

elements.fileInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
});

elements.removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeImage();
});

elements.reverseSearchCity.addEventListener('change', updateReverseSearchButton);

// Drag and Drop
elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
});

elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragover');
});

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
});

// Clear All Filters Function
function clearAllFilters() {
    // Reset state
    state.filters = {
        city: '',
        type: '',
        dateFrom: '',
        dateTo: ''
    };
    state.reverseSearch = {
        city: '',
        image: null
    };
    state.pagination.page = 1;

    // Reset UI Elements
    removeImage();
    elements.reverseSearchProvince.value = '';
    elements.reverseSearchCity.innerHTML = '<option value="">Selecciona primero una provincia</option>';
    elements.reverseSearchCity.disabled = true;
    updateReverseSearchButton();

    // Fetch fresh data
    fetchPets();
    showToast('Filtros limpiados', 'success');
}

// Clear Filters Event Listeners
if (elements.clearFiltersBtn) {
    elements.clearFiltersBtn.addEventListener('click', clearAllFilters);
}

// Limpiar Filtros Link inside Stats Bar
if (elements.statsText) {
    elements.statsText.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'clearFiltersLink') {
            e.preventDefault();
            clearAllFilters();
        }
    });
}

// ====================================
// API Functions
// ====================================

async function fetchPets() {
    showGridLoading();

    try {
        const params = new URLSearchParams({
            page: state.pagination.page,
            limit: state.pagination.limit
        });

        // Add filters
        if (state.filters.city) params.append('city', state.filters.city);
        if (state.filters.type) params.append('type', state.filters.type);
        if (state.filters.dateFrom) params.append('dateFrom', state.filters.dateFrom);
        if (state.filters.dateTo) params.append('dateTo', state.filters.dateTo);

        const response = await fetch(`${API_ENDPOINTS.search}?${params}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error al cargar mascotas');
        }

        // API returns searches directly in response, not wrapped in data
        state.pets = data.searches || [];
        state.pagination = {
            ...state.pagination,
            ...(data.pagination || {})
        };

        renderPets();
        renderPagination();
        updateStats();

    } catch (error) {
        console.error('Error fetching pets:', error);
        showToast(`Error: ${error.message}`, 'error');
        showEmptyState();
    } finally {
        hideGridLoading();
    }
}

async function performReverseSearch() {
    const city = elements.reverseSearchCity.value.trim();

    if (!city) {
        showToast('Por favor ingresa una ciudad', 'warning');
        return;
    }

    if (!state.reverseSearch.image) {
        // Búsqueda estándar por ciudad si no hay imagen
        closeSidebar();
        state.filters.city = city;
        state.pagination.page = 1;
        fetchPets();
        return;
    }

    showLoading('Buscando mascotas similares...');
    closeSidebar();

    try {
        const response = await fetch(API_ENDPOINTS.reverseSearch, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                city: city,
                image: state.reverseSearch.image
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error en la búsqueda');
        }

        // API returns data directly in response
        state.pets = data.searches || [];
        state.pagination = {
            ...state.pagination,
            page: 1,
            total: data.pagination?.total || 0,
            pages: data.pagination?.pages || 0
        };

        renderPets();
        renderPagination();
        updateStats(data.hasAIResults, data.processingTime);

        if (data.hasAIResults) {
            showToast('Búsqueda por IA completada', 'success');
        }

    } catch (error) {
        console.error('Reverse search error:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// Event Listener for Reverse Search
elements.reverseSearchBtn.addEventListener('click', performReverseSearch);

// ====================================
// Render Functions
// ====================================

function renderPets() {
    if (state.pets.length === 0) {
        showEmptyState();
        return;
    }

    elements.emptyState.classList.add('hidden');
    elements.petsGrid.classList.remove('hidden');
    elements.petsGrid.innerHTML = '';

    state.pets.forEach((pet, index) => {
        const card = createPetCard(pet, index);
        card.style.animationDelay = `${index * 50}ms`;
        card.classList.add('fade-in');
        elements.petsGrid.appendChild(card);
    });
}

function createPetCard(pet, index = 0) {
    const card = document.createElement('article');
    card.className = 'pet-card';

    const typeLabel = pet.type === 'LOST' ? 'Perdido' : 'Encontrado';
    const typeClass = pet.type === 'LOST' ? 'lost' : 'found';

    // Usar thumbnails para el grid (mucho más rápido)
    const thumbnailUrl = pet.imageUrls?.thumbnail || pet.imageUrl || pet.image || '/images/placeholder.png';
    const mediumUrl = pet.imageUrls?.medium || pet.imageUrl || pet.image || '/images/placeholder.png';
    const largeUrl = pet.imageUrls?.large || pet.imageUrl || pet.image || '/images/placeholder.png';

    // LCP Optimization: Primeras 6 imágenes (viewport inicial) sin lazy loading + high priority
    // Resto con lazy loading para mejor performance
    const isAboveFold = index < 6;
    const loadingAttr = isAboveFold ? '' : 'loading="lazy"';
    const fetchPriorityAttr = isAboveFold ? 'fetchpriority="high"' : '';

    const locationText = pet.city && pet.city.nombre && pet.city.provincia && pet.city.provincia.nombre 
        ? `${pet.city.nombre}, ${pet.city.provincia.nombre}` 
        : (pet.city && pet.city.nombre ? pet.city.nombre : 'Ubicación desconocida');

    card.innerHTML = `
        <div class="pet-card-image">
            <img 
                src="${thumbnailUrl}" 
                data-medium="${mediumUrl}"
                data-large="${largeUrl}"
                alt="Imagen de mascota ${pet.type === 'LOST' ? 'perdida' : 'encontrada'} en ${locationText}" 
                ${loadingAttr}
                ${fetchPriorityAttr}
                class="pet-image"
                srcset="${thumbnailUrl} 300w, ${mediumUrl} 800w, ${largeUrl} 1200w"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            >
            <span class="pet-card-badge ${typeClass}">${typeLabel}</span>
        </div>
        <div class="pet-card-content">
            <div class="pet-card-location">
                <span>📍</span>
                <span>${locationText}</span>
            </div>
            <p class="pet-card-description">${pet.description}</p>
            <div class="pet-card-footer">
                <a href="tel:${pet.phone}" class="pet-card-phone">📞 ${pet.phone}</a>
                <span class="pet-card-date">${formatDate(pet.createdAt)}</span>
            </div>
        </div>
    `;

    // Add error handler for image loading (CSP compliant - no inline handlers)
    const img = card.querySelector('.pet-image');
    if (img) {
        img.addEventListener('error', function () {
            this.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect fill="#12121a" width="200" height="150"/><text fill="#64748b" x="100" y="75" text-anchor="middle" font-family="sans-serif">Sin imagen</text></svg>');
        });
    }

    return card;
}

function showEmptyState() {
    elements.petsGrid.classList.add('hidden');
    elements.emptyState.classList.remove('hidden');
}

function renderPagination() {
    const { page, pages } = state.pagination;

    if (pages <= 1) {
        elements.pagination.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `
        <button class="pagination-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
            ←
        </button>
    `;

    // Page numbers
    const pagesToShow = getPageNumbers(page, pages);

    pagesToShow.forEach((p, index) => {
        if (p === '...') {
            html += `<span class="pagination-ellipsis">...</span>`;
        } else {
            html += `
                <button class="pagination-btn ${p === page ? 'active' : ''}" data-page="${p}">
                    ${p}
                </button>
            `;
        }
    });

    // Next button
    html += `
        <button class="pagination-btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">
            →
        </button>
    `;

    elements.pagination.innerHTML = html;

    // Add event listeners
    elements.pagination.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = parseInt(btn.dataset.page);
            if (targetPage && targetPage !== state.pagination.page) {
                state.pagination.page = targetPage;
                fetchPets();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
            range.push(i);
        }
    }

    range.forEach(i => {
        if (l) {
            if (i - l === 2) {
                rangeWithDots.push(l + 1);
            } else if (i - l !== 1) {
                rangeWithDots.push('...');
            }
        }
        rangeWithDots.push(i);
        l = i;
    });

    return rangeWithDots;
}

function updateStats(hasAIResults = false, processingTime = null) {
    const { total, page, limit } = state.pagination;
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    let text = `Mostrando <strong>${start}-${end}</strong> de <strong>${total}</strong> mascotas`;

    if (hasAIResults) {
        text += ` • <span style="color: var(--accent-tertiary);">Búsqueda por IA</span>`;
    }

    if (processingTime) {
        text += ` • ${processingTime}`;
    }

    // Check active filters
    const activeFilters = Object.values(state.filters).filter(v => v).length;
    if (activeFilters > 0) {
        text += ` • <span style="color: var(--accent-secondary);">${activeFilters} filtro(s) activo(s)</span> - <a href="#" id="clearFiltersLink" style="color: var(--error); text-decoration: underline; cursor: pointer; font-weight: 500;">Limpiar Filtros</a>`;
    }

    elements.statsText.innerHTML = text;
}

// ====================================
// Health Check
// ====================================

async function checkApiHealth() {
    // We don't need a separate health check since fetchPets will test the connection
    // Just verify the API is accessible by making a lightweight request
    try {
        const response = await fetch(`${API_ENDPOINTS.search}?limit=1`);
        if (response.ok) {
            console.log('✅ API connection successful');
        } else {
            console.warn('⚠️ API returned non-OK status');
        }
    } catch (error) {
        console.error('❌ API connection failed:', error);
        // Don't show toast here since fetchPets will handle the error display
    }
}

// ====================================
// New Search Functions
// ====================================

function openNewSearchModal() {
    elements.newSearchModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Inicializar mapa después de que el modal esté visible
    setTimeout(() => {
        initMap();
    }, 100);
}

function closeNewSearchModal() {
    elements.newSearchModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Image Handling for New Search
async function handleNewSearchFileSelect(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona un archivo de imagen', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar 5MB', 'error');
        return;
    }

    try {
        showLoading('Comprimiendo imagen...');
        const compressedDataUrl = await ImageCompressor.compressImage(file);

        state.newSearch.image = compressedDataUrl;
        elements.newSearchImagePreview.src = compressedDataUrl;
        elements.newSearchImagePreview.classList.remove('hidden');
        elements.newSearchUploadPlaceholder.classList.add('hidden');
        elements.newSearchRemoveImageBtn.classList.remove('hidden');
        elements.newSearchUploadArea.classList.add('has-image');

        hideLoading();
        showToast('✅ Imagen comprimida y lista', 'success');
    } catch (error) {
        console.error('Error procesando imagen:', error);
        showToast('Error al procesar la imagen', 'error');
        hideLoading();
    }
}

function removeNewSearchImage() {
    state.newSearch.image = null;
    elements.newSearchImagePreview.src = '';
    elements.newSearchImagePreview.classList.add('hidden');
    elements.newSearchUploadPlaceholder.classList.remove('hidden');
    elements.newSearchRemoveImageBtn.classList.add('hidden');
    elements.newSearchUploadArea.classList.remove('has-image');
    elements.newSearchFileInput.value = '';
}

// ====================================
// Interactive Map for Location Selection
// ====================================

let map = null;
let marker = null;
const DEFAULT_CENTER = [-34.6037, -58.3816]; // Buenos Aires, Argentina
const DEFAULT_ZOOM = 13;

function initMap() {
    // Inicializar mapa solo si no existe
    if (map) return;

    // Crear mapa centrado en Buenos Aires por defecto
    map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    // Agregar capa de tiles de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Evento de clic en el mapa
    map.on('click', function (e) {
        setMapLocation(e.latlng.lat, e.latlng.lng);
    });

    console.log('🗺️ Mapa inicializado');
}

function setMapLocation(lat, lng) {
    // Remover marcador anterior si existe
    if (marker) {
        map.removeLayer(marker);
    }

    // Crear nuevo marcador
    marker = L.marker([lat, lng], {
        draggable: true,
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(map);

    // Evento cuando se arrastra el marcador
    marker.on('dragend', function (e) {
        const position = e.target.getLatLng();
        updateLocationInputs(position.lat, position.lng);
    });

    // Actualizar inputs
    updateLocationInputs(lat, lng);

    // Centrar mapa en la nueva ubicación
    map.setView([lat, lng], map.getZoom());
}

function updateLocationInputs(lat, lng) {
    elements.newSearchLat.value = lat;
    elements.newSearchLng.value = lng;

    // Actualizar texto de coordenadas
    const coordsText = document.getElementById('coordsText');
    if (coordsText) {
        coordsText.textContent = `📍 Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
    }
}

// ====================================
// GPS Location
// ====================================


// Submit New Search
async function submitNewSearch(e) {
    e.preventDefault();

    if (!state.newSearch.image) {
        showToast('Debes subir una foto de la mascota', 'warning');
        return;
    }

    if (!elements.newSearchLat.value || !elements.newSearchLng.value) {
        showToast('Es necesaria la ubicación GPS', 'warning');
        // Optional: Auto-trigger GPS?
        // getGPSLocation();
        return;
    }

    const type = elements.newSearchType.value;
    const phone = elements.newSearchPhone.value;
    const provinciaId = elements.newSearchProvince.value;
    const cityInput = elements.newSearchCity.value;
    const description = elements.newSearchDescription.value;

    // Obtener el nombre de la provincia del select
    const provinciaSelect = elements.newSearchProvince;
    const provinciaName = provinciaSelect.options[provinciaSelect.selectedIndex]?.text || '';

    const payload = {
        type,
        phone,
        city: cityInput,
        description,
        gpsLocation: {
            latitude: parseFloat(elements.newSearchLat.value),
            longitude: parseFloat(elements.newSearchLng.value)
        },
        image: state.newSearch.image
    };

    try {
        showLoading('Publicando búsqueda...');

        const response = await fetch(API_ENDPOINTS.search, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error al guardar la búsqueda');
        }

        showToast('Búsqueda publicada con éxito!', 'success');
        closeNewSearchModal();

        // Reset form
        elements.newSearchForm.reset();
        removeNewSearchImage();


        // Reset ciudad select
        elements.newSearchCity.innerHTML = '<option value="">Selecciona primero una provincia</option>';
        elements.newSearchCity.disabled = true;

        // Reset mapa y marcador
        if (marker) {
            map.removeLayer(marker);
            marker = null;
        }
        if (map) {
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        }
        const coordsText = document.getElementById('coordsText');
        if (coordsText) {
            coordsText.textContent = 'Selecciona un punto en el mapa';
        }

        // Refresh grid
        fetchPets();

    } catch (error) {
        console.error('Error publishing search:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// Event Listeners for New Search
if (elements.openNewSearchBtn) {
    elements.openNewSearchBtn.addEventListener('click', openNewSearchModal);
}

if (elements.closeNewSearchBtn) {
    elements.closeNewSearchBtn.addEventListener('click', closeNewSearchModal);
}



if (elements.newSearchForm) {
    elements.newSearchForm.addEventListener('submit', submitNewSearch);
}

// Image Upload Events (New Search)
if (elements.newSearchUploadArea) {
    elements.newSearchUploadArea.addEventListener('click', () => {
        if (!state.newSearch.image) elements.newSearchFileInput.click();
    });

    elements.newSearchFileInput.addEventListener('change', (e) => {
        handleNewSearchFileSelect(e.target.files[0]);
    });

    elements.newSearchRemoveImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeNewSearchImage();
    });

    elements.newSearchUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.newSearchUploadArea.classList.add('dragover');
    });

    elements.newSearchUploadArea.addEventListener('dragleave', () => {
        elements.newSearchUploadArea.classList.remove('dragover');
    });

    elements.newSearchUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.newSearchUploadArea.classList.remove('dragover');
        handleNewSearchFileSelect(e.dataTransfer.files[0]);
    });
}

// ====================================
// Global Map Logic
// ====================================

let globalMap = null;
let globalMapMarkers = [];

function openMapModal() {
    elements.mapModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Initialize map if needed
    if (!globalMap) {
        setTimeout(() => {
            globalMap = L.map('globalMap').setView([-34.6037, -58.3816], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(globalMap);
            loadMapLocations();
        }, 100);
    } else {
        setTimeout(() => {
            globalMap.invalidateSize();
            loadMapLocations();
        }, 100);
    }
}

function closeMapModal() {
    elements.mapModal.classList.add('hidden');
    document.body.style.overflow = '';
}

async function loadMapLocations() {
    const loadingOverlay = document.getElementById('mapLoadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    try {
        const response = await fetch(API_ENDPOINTS.mapLocations);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error al cargar ubicaciones');
        }

        const locations = data.locations || [];

        // Clear existing markers
        globalMapMarkers.forEach(m => globalMap.removeLayer(m));
        globalMapMarkers = [];

        // Add pins
        locations.forEach(pet => {
            if (pet.gpsLocation && pet.gpsLocation.latitude != null && pet.gpsLocation.longitude != null) {
                const typeLabel = pet.type === 'LOST' ? 'Perdido' : 'Encontrado';
                const markerColor = pet.type === 'LOST' ? 'red' : 'green';

                const markerIcon = L.icon({
                    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`,
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                const m = L.marker([pet.gpsLocation.latitude, pet.gpsLocation.longitude], { icon: markerIcon }).addTo(globalMap);
                
                const locationText = pet.city && pet.city.nombre && pet.city.provincia && pet.city.provincia.nombre 
                    ? `${pet.city.nombre}, ${pet.city.provincia.nombre}` 
                    : (pet.city && pet.city.nombre ? pet.city.nombre : 'Desconocida');

                // Add popup
                const imgTag = pet.imageUrl || pet.imageUrls?.thumbnail ? `<img src="${pet.imageUrl || pet.imageUrls?.thumbnail}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" alt="Mascota">` : '';
                const phoneTag = pet.phone ? `<div style="font-size: 13px; color: #666; margin-bottom: 4px;">📞 <a href="tel:${pet.phone}">${pet.phone}</a></div>` : '';

                m.bindPopup(`
                    <div style="text-align: center; min-width: 150px;">
                        ${imgTag}
                        <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background: ${pet.type === 'LOST' ? '#ffebee' : '#e8f5e9'}; color: ${pet.type === 'LOST' ? '#ef5350' : '#4caf50'}; margin-bottom: 8px;">${typeLabel}</span>
                        <div style="font-weight: bold; margin-bottom: 4px;">📍 ${locationText}</div>
                        ${phoneTag}
                        <p style="font-size: 12px; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${pet.description || ''}</p>
                    </div>
                `, { minWidth: 200 });

                globalMapMarkers.push(m);
            }
        });

        // Fit bounds if we have markers
        if (globalMapMarkers.length > 0) {
            const group = new L.featureGroup(globalMapMarkers);
            globalMap.fitBounds(group.getBounds().pad(0.1));
        }

    } catch (error) {
        console.error('Error fetching map locations:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
}

// Global Map Event Listeners
if (elements.openMapBtn) {
    elements.openMapBtn.addEventListener('click', openMapModal);
}

if (elements.closeMapBtn) {
    elements.closeMapBtn.addEventListener('click', closeMapModal);
}

// ====================================
// Georef - Provincias y Ciudades
// ====================================

let provinciasData = [];
let ciudadesCache = {}; // Cache de ciudades por provincia

async function loadProvincias() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/georef/provincias`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error('Error al cargar provincias');
        }

        provinciasData = data.provincias;

        // Poblar selects de provincias
        const selects = [elements.newSearchProvince, elements.reverseSearchProvince];

        selects.forEach(select => {
            if (!select) return;
            select.innerHTML = '<option value="">Selecciona una provincia</option>';
            provinciasData.forEach(provincia => {
                const option = document.createElement('option');
                option.value = provincia._id;
                option.textContent = provincia.nombre;
                select.appendChild(option);
            });
        });

        console.log(`✅ ${provinciasData.length} provincias cargadas`);

    } catch (error) {
        console.error('Error cargando provincias:', error);
        showToast('Error al cargar provincias', 'error');
        if (elements.newSearchProvince) elements.newSearchProvince.innerHTML = '<option value="">Error al cargar provincias</option>';
        if (elements.reverseSearchProvince) elements.reverseSearchProvince.innerHTML = '<option value="">Error al cargar provincias</option>';
    }
}

async function loadCiudades(provinciaId, targetSelect) {
    try {
        // Verificar cache primero
        if (ciudadesCache[provinciaId]) {
            populateCiudadesSelect(ciudadesCache[provinciaId], targetSelect);
            return;
        }

        // Deshabilitar select mientras carga
        targetSelect.disabled = true;
        targetSelect.innerHTML = '<option value="">Cargando ciudades...</option>';

        const response = await fetch(`${API_BASE_URL}/api/georef/provincias/${provinciaId}/ciudades`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error('Error al cargar ciudades');
        }

        // Guardar en cache
        ciudadesCache[provinciaId] = data.ciudades;

        // Poblar select
        populateCiudadesSelect(data.ciudades, targetSelect);

        console.log(`✅ ${data.ciudades.length} ciudades cargadas para ${data.provincia.nombre}`);

    } catch (error) {
        console.error('Error cargando ciudades:', error);
        showToast('Error al cargar ciudades', 'error');
        targetSelect.innerHTML = '<option value="">Error al cargar ciudades</option>';
        targetSelect.disabled = true;
    }
}

function populateCiudadesSelect(ciudades, targetSelect) {
    targetSelect.innerHTML = '<option value="">Selecciona una ciudad</option>';

    ciudades.forEach(ciudad => {
        const option = document.createElement('option');
        option.value = ciudad._id;
        option.textContent = ciudad.nombre;

        // Guardar centroide en data attributes si existe
        if (ciudad.centroide && ciudad.centroide.lat && ciudad.centroide.lon) {
            option.dataset.lat = ciudad.centroide.lat;
            option.dataset.lon = ciudad.centroide.lon;
        }

        targetSelect.appendChild(option);
    });

    targetSelect.disabled = false;
}

if (elements.newSearchProvince) {
    elements.newSearchProvince.addEventListener('change', (e) => {
        const provinciaId = e.target.value;
        if (provinciaId) {
            loadCiudades(provinciaId, elements.newSearchCity);
        } else {
            elements.newSearchCity.innerHTML = '<option value="">Selecciona primero una provincia</option>';
            elements.newSearchCity.disabled = true;
        }
    });
}

if (elements.reverseSearchProvince) {
    elements.reverseSearchProvince.addEventListener('change', (e) => {
        const provinciaId = e.target.value;
        if (provinciaId) {
            loadCiudades(provinciaId, elements.reverseSearchCity);
        } else {
            elements.reverseSearchCity.innerHTML = '<option value="">Selecciona primero una provincia</option>';
            elements.reverseSearchCity.disabled = true;
        }
        updateReverseSearchButton();
    });
}

// Event listener para cambio de ciudad - centrar mapa en centroide
if (elements.newSearchCity) {
    elements.newSearchCity.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const lat = selectedOption.dataset.lat;
        const lon = selectedOption.dataset.lon;

        // Si la ciudad tiene centroide, centrar el mapa allí
        if (lat && lon && map) {
            const latNum = parseFloat(lat);
            const lonNum = parseFloat(lon);

            // Centrar mapa en el centroide de la ciudad
            map.setView([latNum, lonNum], 14);

            // Colocar un marcador en el centroide
            setMapLocation(latNum, lonNum);

            showToast('📍 Mapa centrado en ' + selectedOption.text, 'success');
        }
    });
}

// ====================================
// Initialization
// ====================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🐕 Findog App initialized');
    checkApiHealth();
    fetchPets();
    loadProvincias(); // Cargar provincias al iniciar
});
