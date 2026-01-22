#!/usr/bin/env node

/**
 * Script para cargar datos de prueba en Findog
 * Usa las imágenes de test-images para crear registros de mascotas
 */

const fs = require('fs');
const path = require('path');

// Configuración
const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_IMAGES_DIR = path.join(__dirname, '../reverse-searcher/test-images');

// Datos de ejemplo para generar mascotas aleatorias
const CITIES = [
    'Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata',
    'San Miguel de Tucumán', 'Mar del Plata', 'Salta', 'Santa Fe', 'Posadas',
    'Misiones', 'Resistencia', 'Neuquén', 'Bariloche', 'Ushuaia'
];

const DESCRIPTIONS = [
    'Perro mediano, muy amigable. Se perdió cerca del parque. Tiene collar azul.',
    'Perrito pequeño de color marrón. Muy asustadizo. Responde al nombre de Max.',
    'Golden Retriever adulto. Muy cariñoso. Se escapó durante una tormenta.',
    'Cachorro de 6 meses. Color blanco con manchas negras. Muy juguetón.',
    'Perro mestizo grande. Color negro. Tiene una cicatriz en la pata trasera.',
    'Border Collie. Muy inteligente. Perdido en zona rural.',
    'Labrador color chocolate. Collar rojo con placa de identificación.',
    'Perro pequeño tipo Pomeranian. Color crema. Muy nervioso con extraños.',
    'Husky siberiano. Ojos azules. Se perdió durante paseo matutino.',
    'Beagle adulto. Muy curioso. Sigue olores y se aleja fácilmente.',
    'Caniche toy blanco. Recién cortado el pelo. Responde a Luna.',
    'Bulldog francés color gris. Tiene problemas respiratorios leves.',
    'Pastor alemán joven. Muy leal. Desapareció del jardín trasero.',
    'Perro salchicha de pelo largo. Color marrón rojizo. Muy vocal.',
    'Boxer atigrado. Muy energético. Tiene chip de identificación.',
    'Cocker spaniel dorado. Oreja izquierda con marca distintiva.',
    'Shih Tzu blanco y negro. Pelaje largo. Necesita medicación diaria.',
    'Pitbull blanco con manchas marrones. Muy dócil con personas.',
    'Schnauzer miniatura gris. Recién bañado. Collar verde.',
    'Yorkshire terrier. Muy pequeño. Tiene miedo a ruidos fuertes.',
    'Mestizo mediano color arena. Muy sociable con otros perros.',
    'Pointer inglés. Tiene instinto de caza. Puede estar en zonas boscosas.',
    'Rottweiler adulto. Bien entrenado. Responde a comandos en alemán.',
    'Galgo español. Muy tímido. Rescatado recientemente.'
];

const PHONES = [
    '1155443322', '1166554433', '1177665544', '1188776655',
    '3511234567', '3512345678', '3513456789', '3514567890',
    '2614567890', '2615678901', '2616789012', '2617890123',
    '3415678901', '3416789012', '3417890123', '3418901234',
    '2234567890', '2235678901', '2236789012', '2237890123',
    '3765123456', '3766234567', '3767345678', '3768456789'
];

// Coordenadas de Argentina (aproximadas por ciudad)
const COORDINATES = {
    'Buenos Aires': { lat: -34.6037, lng: -58.3816 },
    'Córdoba': { lat: -31.4201, lng: -64.1888 },
    'Rosario': { lat: -32.9468, lng: -60.6393 },
    'Mendoza': { lat: -32.8895, lng: -68.8458 },
    'La Plata': { lat: -34.9205, lng: -57.9536 },
    'San Miguel de Tucumán': { lat: -26.8083, lng: -65.2176 },
    'Mar del Plata': { lat: -38.0055, lng: -57.5426 },
    'Salta': { lat: -24.7821, lng: -65.4232 },
    'Santa Fe': { lat: -31.6107, lng: -60.6973 },
    'Posadas': { lat: -27.3621, lng: -55.8969 },
    'Misiones': { lat: -27.4692, lng: -55.8969 },
    'Resistencia': { lat: -27.4512, lng: -58.9867 },
    'Neuquén': { lat: -38.9516, lng: -68.0591 },
    'Bariloche': { lat: -41.1335, lng: -71.3103 },
    'Ushuaia': { lat: -54.8019, lng: -68.3030 }
};

// Función para agregar variación aleatoria a coordenadas
function addCoordinateVariation(coords, maxVariationKm = 5) {
    // Aproximadamente 0.01 grados = 1.1 km
    const variation = maxVariationKm * 0.009;
    return {
        latitude: coords.lat + (Math.random() - 0.5) * variation * 2,
        longitude: coords.lng + (Math.random() - 0.5) * variation * 2
    };
}

// Función para convertir imagen a base64
function imageToBase64(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
}

// Función para crear una mascota
async function createPet(petData) {
    try {
        const response = await fetch(`${API_URL}/api/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Findog-Seed-Script/1.0'
            },
            body: JSON.stringify(petData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error al crear mascota');
        }

        return data;
    } catch (error) {
        throw error;
    }
}

// Función principal
async function seedDatabase() {
    console.log('🐕 Findog - Script de carga de datos de prueba\n');
    console.log(`📁 Directorio de imágenes: ${TEST_IMAGES_DIR}`);
    console.log(`🌐 API URL: ${API_URL}\n`);

    // Verificar que existe el directorio de imágenes
    if (!fs.existsSync(TEST_IMAGES_DIR)) {
        console.error('❌ Error: No se encontró el directorio de imágenes de prueba');
        process.exit(1);
    }

    // Obtener lista de imágenes
    const imageFiles = fs.readdirSync(TEST_IMAGES_DIR)
        .filter(file => /\.(jpg|jpeg|png)$/i.test(file));

    console.log(`📷 Imágenes encontradas: ${imageFiles.length}\n`);

    if (imageFiles.length === 0) {
        console.error('❌ Error: No se encontraron imágenes en el directorio');
        process.exit(1);
    }

    let successCount = 0;
    let errorCount = 0;

    // Procesar cada imagen
    for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const imagePath = path.join(TEST_IMAGES_DIR, imageFile);

        // Seleccionar datos aleatorios
        const city = CITIES[i % CITIES.length];
        const description = DESCRIPTIONS[i % DESCRIPTIONS.length];
        const phone = PHONES[i % PHONES.length];
        const type = Math.random() > 0.5 ? 'LOST' : 'FIND';
        const coords = addCoordinateVariation(COORDINATES[city] || COORDINATES['Buenos Aires']);

        console.log(`[${i + 1}/${imageFiles.length}] Procesando: ${imageFile}`);
        console.log(`   📍 ${city} | ${type === 'LOST' ? '🔴 Perdido' : '🟢 Encontrado'}`);

        try {
            // Convertir imagen a base64
            const imageBase64 = imageToBase64(imagePath);

            // Crear datos de la mascota
            const petData = {
                city: city,
                description: description,
                phone: phone,
                type: type,
                gpsLocation: coords,
                image: imageBase64
            };

            // Enviar a la API
            const result = await createPet(petData);
            console.log(`   ✅ Creado exitosamente\n`);
            successCount++;

            // Pequeña pausa para no sobrecargar la API
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.log(`   ❌ Error: ${error.message}\n`);
            errorCount++;
        }
    }

    // Resumen final
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMEN DE CARGA');
    console.log('='.repeat(50));
    console.log(`✅ Mascotas creadas exitosamente: ${successCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log(`📷 Total procesadas: ${imageFiles.length}`);
    console.log('='.repeat(50));

    if (successCount > 0) {
        console.log('\n🎉 ¡Datos de prueba cargados! Visita http://localhost:3000 para verlos.');
    }
}

// Ejecutar
seedDatabase().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});
