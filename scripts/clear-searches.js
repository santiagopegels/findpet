#!/usr/bin/env node

/**
 * Script para limpiar completamente los datos de búsquedas:
 * 1. Elimina todos los documentos de la colección 'searches' en MongoDB
 * 2. Elimina todas las imágenes en /images/ (versiones webp)
 * 3. Elimina todas las imágenes en /uploads/
 * 4. Resetea el índice FAISS y metadata.json del reverse-searcher
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Search = require('../models/search');

const dbUri = process.env.MONGO_DB_CONNECTION || process.env.DB_URI || 'mongodb://localhost:27017/findog';

// Rutas de directorios a limpiar
const IMAGES_DIR = path.join(__dirname, '../images');
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const FEATURES_DIR = path.join(__dirname, '../reverse-searcher/features');
const FAISS_INDEX = path.join(FEATURES_DIR, 'faiss_index.bin');
const METADATA_JSON = path.join(FEATURES_DIR, 'metadata.json');

function deleteFilesInDir(dirPath, label) {
    if (!fs.existsSync(dirPath)) {
        console.log(`  ⚠️  Directorio no encontrado: ${dirPath}`);
        return 0;
    }

    const files = fs.readdirSync(dirPath).filter(f => {
        // Ignorar directorios y archivos de sistema
        const fullPath = path.join(dirPath, f);
        return fs.statSync(fullPath).isFile() && !f.startsWith('.');
    });

    let deleted = 0;
    for (const file of files) {
        try {
            fs.unlinkSync(path.join(dirPath, file));
            deleted++;
        } catch (e) {
            console.error(`  ❌ Error eliminando ${file}: ${e.message}`);
        }
    }

    console.log(`  🗑️  ${label}: ${deleted} archivos eliminados`);
    return deleted;
}

async function clearAll() {
    console.log('🧹 Findog - Limpieza completa de búsquedas\n');

    // 1. Limpiar MongoDB
    try {
        await mongoose.connect(dbUri);
        console.log('✅ Conectado a MongoDB');
        const result = await Search.deleteMany({});
        console.log(`  🗑️  Searches eliminados de MongoDB: ${result.deletedCount}`);
    } catch (e) {
        console.error('❌ Error conectando/limpiando MongoDB:', e.message);
    } finally {
        await mongoose.disconnect();
        console.log('  🔌 Desconectado de MongoDB\n');
    }

    // 2. Limpiar imágenes en /images/
    console.log('📁 Limpiando /images/...');
    deleteFilesInDir(IMAGES_DIR, 'images');

    // 3. Limpiar uploads en /uploads/
    console.log('\n📁 Limpiando /uploads/...');
    deleteFilesInDir(UPLOADS_DIR, 'uploads');

    // 4. Resetear features del reverse-searcher
    console.log('\n📁 Reseteando features del reverse-searcher...');

    // Eliminar faiss_index.bin
    if (fs.existsSync(FAISS_INDEX)) {
        try {
            fs.unlinkSync(FAISS_INDEX);
            console.log('  🗑️  faiss_index.bin eliminado');
        } catch (e) {
            console.error(`  ❌ Error eliminando faiss_index.bin: ${e.message}`);
        }
    } else {
        console.log('  ℹ️  faiss_index.bin no encontrado, se omite');
    }

    // Resetear metadata.json a objeto vacío
    try {
        fs.writeFileSync(METADATA_JSON, '{}', 'utf8');
        console.log('  ✅ metadata.json reseteado a {}');
    } catch (e) {
        console.error(`  ❌ Error reseteando metadata.json: ${e.message}`);
    }

    console.log('\n✅ ¡Limpieza completada! Ahora podés ejecutar el seeder.');
}

clearAll().catch(e => {
    console.error('❌ Error fatal:', e);
    process.exit(1);
});
