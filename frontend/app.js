/**
 * Findog - Frontend Application
 * Vista minimalista con grid de mascotas y filtros
 */

// API Configuration
const API_BASE_URL = window.location.origin;
const API_ENDPOINTS = {
    search: `${API_BASE_URL}/api/search`,
    reverseSearch: `${API_BASE_URL}/api/search/reverse-search`,
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
    isLoading: false,
    isSidebarOpen: false
};

// DOM Elements
const elements = {
    // Header
    filterToggleBtn: document.getElementById('filterToggleBtn'),

    // Stats
    statsBar: document.getElementById('statsBar'),
    statsText: document.getElementById('statsText'),

    // Grid
    petsGrid: document.getElementById('petsGrid'),
    pagination: document.getElementById('pagination'),
    loadingGrid: document.getElementById('loadingGrid'),
    emptyState: document.getElementById('emptyState'),

    // Sidebar
    filterSidebar: document.getElementById('filterSidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),

    // Filters
    filterCity: document.getElementById('filterCity'),
    filterType: document.getElementById('filterType'),
    filterDateFrom: document.getElementById('filterDateFrom'),
    filterDateTo: document.getElementById('filterDateTo'),
    applyFiltersBtn: document.getElementById('applyFiltersBtn'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),

    // Reverse Search
    reverseSearchCity: document.getElementById('reverseSearchCity'),
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    uploadPlaceholder: document.getElementById('uploadPlaceholder'),
    imagePreview: document.getElementById('imagePreview'),
    removeImageBtn: document.getElementById('removeImageBtn'),
    reverseSearchBtn: document.getElementById('reverseSearchBtn'),

    // Loading & Toast
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    toastContainer: document.getElementById('toastContainer')
};

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

function applyFilters() {
    state.filters.city = elements.filterCity.value.trim();
    state.filters.type = elements.filterType.value;
    state.filters.dateFrom = elements.filterDateFrom.value;
    state.filters.dateTo = elements.filterDateTo.value;
    state.pagination.page = 1;

    closeSidebar();
    fetchPets();
}

function clearFilters() {
    elements.filterCity.value = '';
    elements.filterType.value = '';
    elements.filterDateFrom.value = '';
    elements.filterDateTo.value = '';

    state.filters = {
        city: '',
        type: '',
        dateFrom: '',
        dateTo: ''
    };
    state.pagination.page = 1;

    closeSidebar();
    fetchPets();
}

// Event Listeners for Filters
elements.applyFiltersBtn.addEventListener('click', applyFilters);
elements.clearFiltersBtn.addEventListener('click', clearFilters);

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
        showToast('Imagen comprimida y lista para subir', 'success');

    } catch (error) {
        console.error('Error comprimiendo imagen:', error);
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
    const hasImage = !!state.reverseSearch.image;
    const hasCity = elements.reverseSearchCity.value.trim().length > 0;
    elements.reverseSearchBtn.disabled = !hasImage || !hasCity;
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

elements.reverseSearchCity.addEventListener('input', updateReverseSearchButton);

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
        showToast('Por favor sube una imagen', 'warning');
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
        const card = createPetCard(pet);
        card.style.animationDelay = `${index * 50}ms`;
        card.classList.add('fade-in');
        elements.petsGrid.appendChild(card);
    });
}

function createPetCard(pet) {
    const card = document.createElement('article');
    card.className = 'pet-card';

    const typeLabel = pet.type === 'LOST' ? 'Perdido' : 'Encontrado';
    const typeClass = pet.type === 'LOST' ? 'lost' : 'found';

    // Usar thumbnails para el grid (mucho más rápido)
    const thumbnailUrl = pet.imageUrls?.thumbnail || pet.imageUrl || pet.image || '/images/placeholder.png';
    const mediumUrl = pet.imageUrls?.medium || pet.imageUrl || pet.image || '/images/placeholder.png';
    const largeUrl = pet.imageUrls?.large || pet.imageUrl || pet.image || '/images/placeholder.png';

    card.innerHTML = `
        <div class="pet-card-image">
            <img 
                src="${thumbnailUrl}" 
                data-medium="${mediumUrl}"
                data-large="${largeUrl}"
                alt="Imagen de mascota" 
                loading="lazy" 
                class="pet-image"
                srcset="${thumbnailUrl} 300w, ${mediumUrl} 800w, ${largeUrl} 1200w"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            >
            <span class="pet-card-badge ${typeClass}">${typeLabel}</span>
        </div>
        <div class="pet-card-content">
            <div class="pet-card-location">
                <span>📍</span>
                <span>${pet.city}</span>
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
        text += ` • <span style="color: var(--accent-secondary);">${activeFilters} filtro(s) activo(s)</span>`;
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
// Initialization
// ====================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🐕 Findog App initialized');
    checkApiHealth();
    fetchPets();
});
