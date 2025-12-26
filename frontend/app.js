/**
 * Findog - Frontend Application
 * Camera capture, pet registration, and reverse image search
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
    mode: 'search', // 'search' or 'register'
    capturedImage: null, // Base64 image data
    cameraStream: null,
    isLoading: false,
    map: null, // Leaflet map instance
    mapMarker: null // Current location marker
};

// DOM Elements
const elements = {
    // Mode selectors
    searchModeBtn: document.getElementById('searchModeBtn'),
    registerModeBtn: document.getElementById('registerModeBtn'),

    // Camera elements
    cameraContainer: document.getElementById('cameraContainer'),
    videoPreview: document.getElementById('videoPreview'),
    imagePreview: document.getElementById('imagePreview'),
    cameraOverlay: document.getElementById('cameraOverlay'),
    captureCanvas: document.getElementById('captureCanvas'),

    // Camera controls
    startCameraBtn: document.getElementById('startCameraBtn'),
    captureBtn: document.getElementById('captureBtn'),
    uploadBtn: document.getElementById('uploadBtn'),
    resetBtn: document.getElementById('resetBtn'),
    fileInput: document.getElementById('fileInput'),

    // Forms
    searchForm: document.getElementById('searchForm'),
    registerForm: document.getElementById('registerForm'),
    reverseSearchForm: document.getElementById('reverseSearchForm'),
    petRegistrationForm: document.getElementById('petRegistrationForm'),

    // Form inputs
    searchCity: document.getElementById('searchCity'),
    petType: document.getElementById('petType'),
    regCity: document.getElementById('regCity'),
    description: document.getElementById('description'),
    phone: document.getElementById('phone'),
    latitude: document.getElementById('latitude'),
    longitude: document.getElementById('longitude'),
    descCount: document.getElementById('descCount'),
    locationStatus: document.getElementById('locationStatus'),
    getLocationBtn: document.getElementById('getLocationBtn'),
    mapContainer: document.getElementById('mapContainer'),

    // Submit buttons
    searchSubmitBtn: document.getElementById('searchSubmitBtn'),
    registerSubmitBtn: document.getElementById('registerSubmitBtn'),

    // Results
    resultsSection: document.getElementById('resultsSection'),
    resultsInfo: document.getElementById('resultsInfo'),
    resultsGrid: document.getElementById('resultsGrid'),

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
// Mode Switching
// ====================================

function switchMode(mode) {
    state.mode = mode;

    // Update buttons
    elements.searchModeBtn.classList.toggle('active', mode === 'search');
    elements.registerModeBtn.classList.toggle('active', mode === 'register');

    // Show/hide forms
    elements.searchForm.classList.toggle('hidden', mode !== 'search');
    elements.registerForm.classList.toggle('hidden', mode !== 'register');

    // Hide results when switching modes
    elements.resultsSection.classList.add('hidden');

    // Update submit button state
    updateSubmitButtonState();

    // Fix map rendering when switching to register mode
    if (mode === 'register' && state.map) {
        // Leaflet needs to recalculate size when container becomes visible
        setTimeout(() => {
            state.map.invalidateSize();
        }, 100);
    }
}

elements.searchModeBtn.addEventListener('click', () => switchMode('search'));
elements.registerModeBtn.addEventListener('click', () => switchMode('register'));

// ====================================
// Camera Functions
// ====================================

async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment', // Prefer back camera
                width: { ideal: 1280 },
                height: { ideal: 960 }
            }
        };

        state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.videoPreview.srcObject = state.cameraStream;

        // Update UI
        elements.cameraOverlay.classList.add('hidden');
        elements.cameraContainer.classList.add('active');
        elements.startCameraBtn.classList.add('hidden');
        elements.captureBtn.classList.remove('hidden');
        elements.uploadBtn.classList.add('hidden');

        showToast('Cámara activa', 'success');
    } catch (error) {
        console.error('Error accessing camera:', error);
        showToast('No se pudo acceder a la cámara. Por favor, permite el acceso.', 'error');
    }
}

function capturePhoto() {
    const video = elements.videoPreview;
    const canvas = elements.captureCanvas;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Get base64 image
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    setImagePreview(imageData);

    // Stop camera
    stopCamera();
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
    }
}

function setImagePreview(imageData) {
    state.capturedImage = imageData;

    // Update UI
    elements.imagePreview.src = imageData;
    elements.imagePreview.classList.remove('hidden');
    elements.videoPreview.classList.add('hidden');
    elements.cameraOverlay.classList.add('hidden');
    elements.cameraContainer.classList.remove('active');
    elements.cameraContainer.classList.add('has-image');

    // Update buttons
    elements.startCameraBtn.classList.add('hidden');
    elements.captureBtn.classList.add('hidden');
    elements.uploadBtn.classList.add('hidden');
    elements.resetBtn.classList.remove('hidden');

    // Enable submit buttons
    updateSubmitButtonState();

    showToast('Imagen capturada correctamente', 'success');
}

function resetImage() {
    state.capturedImage = null;
    stopCamera();

    // Reset UI
    elements.imagePreview.classList.add('hidden');
    elements.imagePreview.src = '';
    elements.videoPreview.classList.remove('hidden');
    elements.videoPreview.srcObject = null;
    elements.cameraOverlay.classList.remove('hidden');
    elements.cameraContainer.classList.remove('active', 'has-image');

    // Reset buttons
    elements.startCameraBtn.classList.remove('hidden');
    elements.captureBtn.classList.add('hidden');
    elements.uploadBtn.classList.remove('hidden');
    elements.resetBtn.classList.add('hidden');

    // Disable submit buttons
    updateSubmitButtonState();
}

// File upload handler
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona un archivo de imagen', 'error');
        return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar 5MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
}

// Event listeners for camera controls
elements.startCameraBtn.addEventListener('click', startCamera);
elements.captureBtn.addEventListener('click', capturePhoto);
elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());
elements.resetBtn.addEventListener('click', resetImage);
elements.fileInput.addEventListener('change', handleFileUpload);

// ====================================
// Form Validation & Submission
// ====================================

function updateSubmitButtonState() {
    const hasImage = !!state.capturedImage;

    if (state.mode === 'search') {
        elements.searchSubmitBtn.disabled = !hasImage;
    } else {
        elements.registerSubmitBtn.disabled = !hasImage;
    }
}

// Character count for description
elements.description.addEventListener('input', () => {
    elements.descCount.textContent = elements.description.value.length;
});

// Geolocation - centers map on user location
elements.getLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
        showToast('Tu navegador no soporta geolocalización', 'error');
        return;
    }

    elements.locationStatus.textContent = 'Obteniendo ubicación...';
    elements.locationStatus.className = 'location-status';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Update hidden inputs
            elements.latitude.value = lat.toFixed(6);
            elements.longitude.value = lng.toFixed(6);

            // Update map
            if (state.map) {
                state.map.setView([lat, lng], 15);
                setMapMarker(lat, lng);
            }

            elements.locationStatus.textContent = '✓ Ubicación obtenida';
            elements.locationStatus.className = 'location-status success';
        },
        (error) => {
            console.error('Geolocation error:', error);
            elements.locationStatus.textContent = '✗ No se pudo obtener la ubicación';
            elements.locationStatus.className = 'location-status error';
            showToast('No se pudo obtener la ubicación', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});

// ====================================
// Map Functions
// ====================================

function initializeMap() {
    if (!elements.mapContainer) return;

    // Default center: Buenos Aires, Argentina
    const defaultLat = -34.6037;
    const defaultLng = -58.3816;

    // Initialize Leaflet map
    state.map = L.map('mapContainer').setView([defaultLat, defaultLng], 12);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(state.map);

    // Click handler for placing marker
    state.map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        setMapMarker(lat, lng);

        // Update hidden inputs
        elements.latitude.value = lat.toFixed(6);
        elements.longitude.value = lng.toFixed(6);

        elements.locationStatus.textContent = `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        elements.locationStatus.className = 'location-status success';
    });

    // Try to get initial location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                state.map.setView([lat, lng], 14);
                setMapMarker(lat, lng);
                elements.latitude.value = lat.toFixed(6);
                elements.longitude.value = lng.toFixed(6);
                elements.locationStatus.textContent = '📍 Ubicación actual';
                elements.locationStatus.className = 'location-status success';
            },
            () => {
                // Silent fail - just use default location
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
}

function setMapMarker(lat, lng) {
    // Remove existing marker if any
    if (state.mapMarker) {
        state.map.removeLayer(state.mapMarker);
    }

    // Custom marker icon
    const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="background: linear-gradient(135deg, #6366f1, #22d3ee); width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);"></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 30]
    });

    // Add new marker
    state.mapMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(state.map);

    // Update map container style
    elements.mapContainer.classList.add('has-marker');
}

// ====================================
// API Calls
// ====================================

async function performReverseSearch(event) {
    event.preventDefault();

    if (!state.capturedImage) {
        showToast('Por favor captura o sube una imagen primero', 'warning');
        return;
    }

    const city = elements.searchCity.value.trim();
    if (!city) {
        showToast('Por favor ingresa una ciudad', 'warning');
        return;
    }

    showLoading('Buscando mascotas similares...');

    try {
        const response = await fetch(API_ENDPOINTS.reverseSearch, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                city: city,
                image: state.capturedImage
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error en la búsqueda');
        }

        displaySearchResults(data.data);

    } catch (error) {
        console.error('Reverse search error:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function registerPet(event) {
    event.preventDefault();

    if (!state.capturedImage) {
        showToast('Por favor captura o sube una imagen primero', 'warning');
        return;
    }

    // Gather form data
    const formData = {
        type: elements.petType.value,
        city: elements.regCity.value.trim(),
        description: elements.description.value.trim(),
        phone: elements.phone.value.trim(),
        gpsLocation: {
            latitude: parseFloat(elements.latitude.value),
            longitude: parseFloat(elements.longitude.value)
        },
        image: state.capturedImage
    };

    // Validate all fields
    if (!formData.type || !formData.city || !formData.description || !formData.phone) {
        showToast('Por favor completa todos los campos requeridos', 'warning');
        return;
    }

    if (isNaN(formData.gpsLocation.latitude) || isNaN(formData.gpsLocation.longitude)) {
        showToast('Por favor selecciona una ubicación en el mapa', 'warning');
        return;
    }

    // Debug: log GPS values
    console.log('GPS values being sent:', formData.gpsLocation);
    console.log('Latitude input value:', elements.latitude.value);
    console.log('Longitude input value:', elements.longitude.value);

    showLoading('Registrando mascota...');

    try {
        const response = await fetch(API_ENDPOINTS.search, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error al registrar');
        }

        showToast('¡Mascota registrada exitosamente!', 'success');

        // Reset form
        elements.petRegistrationForm.reset();
        elements.descCount.textContent = '0';
        elements.locationStatus.textContent = '';
        resetImage();

    } catch (error) {
        console.error('Registration error:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// Form submission handlers
elements.reverseSearchForm.addEventListener('submit', performReverseSearch);
elements.petRegistrationForm.addEventListener('submit', registerPet);

// ====================================
// Results Display
// ====================================

function displaySearchResults(data) {
    const { searches, pagination, searchMethod, hasAIResults, processingTime } = data;

    // Show results section
    elements.resultsSection.classList.remove('hidden');

    // Update info
    let infoText = `Se encontraron ${pagination.total} resultado(s)`;
    if (hasAIResults) {
        infoText += ` • Búsqueda por IA`;
        elements.resultsInfo.className = 'results-info ai';
    } else {
        elements.resultsInfo.className = 'results-info';
    }
    infoText += ` • ${processingTime}`;
    elements.resultsInfo.textContent = infoText;

    // Clear previous results
    elements.resultsGrid.innerHTML = '';

    if (searches.length === 0) {
        elements.resultsGrid.innerHTML = `
            <div class="no-results">
                <p>😢 No se encontraron mascotas similares en esta ciudad.</p>
                <p>Intenta con otra ciudad o registra una nueva búsqueda.</p>
            </div>
        `;
        return;
    }

    // Render results
    searches.forEach(search => {
        const card = createResultCard(search);
        elements.resultsGrid.appendChild(card);
    });

    // Scroll to results
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function createResultCard(search) {
    const card = document.createElement('div');
    card.className = 'result-card';

    const typeLabel = search.type === 'LOST' ? 'Perdido' : 'Encontrado';
    const typeClass = search.type === 'LOST' ? 'lost' : 'found';
    const imageUrl = search.imageUrl || search.image || '/images/placeholder.png';

    card.innerHTML = `
        <img src="${imageUrl}" alt="Imagen de mascota" class="result-image"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22150%22><rect fill=%22%2312121a%22 width=%22200%22 height=%22150%22/><text fill=%22%2364748b%22 x=%22100%22 y=%2275%22 text-anchor=%22middle%22>Sin imagen</text></svg>'">
        <div class="result-content">
            <div class="result-header">
                <span class="result-type ${typeClass}">${typeLabel}</span>
                <span class="result-city">📍 ${search.city}</span>
            </div>
            <p class="result-description">${search.description}</p>
            <div class="result-footer">
                <a href="tel:${search.phone}" class="result-phone">📞 ${search.phone}</a>
                <span class="result-date">${formatDate(search.createdAt)}</span>
            </div>
        </div>
    `;

    return card;
}

// ====================================
// Initialization
// ====================================

async function checkApiHealth() {
    try {
        const response = await fetch(API_ENDPOINTS.health);
        if (response.ok) {
            console.log('✅ API connection successful');
        } else {
            console.warn('⚠️ API returned non-OK status');
        }
    } catch (error) {
        console.error('❌ API connection failed:', error);
        showToast('No se pudo conectar con el servidor. Verifica que esté activo.', 'warning');
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('🐕 Findog App initialized');
    checkApiHealth();

    // Initialize map for location selection
    initializeMap();
});
