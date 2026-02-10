#!/usr/bin/env node

/**
 * Script de Migración de Imágenes Existentes
 * 
 * Este script procesa todas las imágenes PNG/JPG existentes en el directorio uploads
 * y genera las versiones optimizadas en WebP (thumbnail, medium, large).
 * 
 * Uso: node scripts/migrate-existing-images.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const Search = require('../models/search');
const imageProcessor = require('../services/image-processor');
const { local } = require('../config/storageConfig');

// Colores para consola
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

async function migrateExistingImages() {
    console.log(`${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║  Migración de Imágenes a WebP Optimizado  ║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
    console.log('');

    try {
        // Conectar a MongoDB
        console.log(`${colors.blue}📡 Conectando a MongoDB...${colors.reset}`);
        await mongoose.connect(process.env.MONGO_DB_CONNECTION || process.env.MONGO_URI || 'mongodb://mongo:27017/findog');
        console.log(`${colors.green}✅ Conexión establecida${colors.reset}`);
        console.log('');

        // Obtener todas las búsquedas con imágenes
        console.log(`${colors.blue}🔍 Buscando imágenes para migrar...${colors.reset}`);
        const searches = await Search.find({
            filename: { $exists: true, $ne: null },
            imageVersions: { $exists: false }
        });

        console.log(`${colors.yellow}📊 Encontradas ${searches.length} imágenes para procesar${colors.reset}`);
        console.log('');

        if (searches.length === 0) {
            console.log(`${colors.green}✅ No hay imágenes pendientes de migración${colors.reset}`);
            await mongoose.disconnect();
            return;
        }

        let processed = 0;
        let errors = 0;
        let skipped = 0;

        // Procesar cada imagen
        for (let i = 0; i < searches.length; i++) {
            const search = searches[i];
            const progressPercent = ((i + 1) / searches.length * 100).toFixed(1);

            console.log(`${colors.cyan}[${i + 1}/${searches.length}] (${progressPercent}%)${colors.reset} Procesando: ${search.filename}`);

            try {
                // Construir path de la imagen antigua
                const oldImagePath = path.join(local.uploadDir, search.filename);

                // Verificar si existe
                try {
                    await fs.access(oldImagePath);
                } catch (error) {
                    console.log(`${colors.yellow}  ⚠️  Archivo no encontrado, saltando...${colors.reset}`);
                    skipped++;
                    continue;
                }

                // Leer imagen
                const imageBuffer = await fs.readFile(oldImagePath);
                console.log(`  📖 Leyendo imagen (${(imageBuffer.length / 1024).toFixed(2)} KB)`);

                // Generar ID base (sin extensión)
                const baseFilename = search._id.toString();

                // Procesar y generar versiones
                const result = await imageProcessor.processImage(
                    imageBuffer,
                    baseFilename,
                    local.uploadDir
                );

                // Actualizar documento en DB
                search.imageVersions = {
                    thumbnail: result.thumbnail.filename,
                    medium: result.medium.filename,
                    large: result.large.filename
                };

                await search.save();

                console.log(`${colors.green}  ✅ Procesado exitosamente${colors.reset}`);
                console.log(`     Thumbnail: ${result.thumbnail.size} KB`);
                console.log(`     Medium: ${result.medium.size} KB`);
                console.log(`     Large: ${result.large.size} KB`);

                processed++;

                // Opcional: Eliminar imagen antigua (comentado por seguridad)
                // await fs.unlink(oldImagePath);
                // console.log(`  🗑️  Imagen antigua eliminada`);

            } catch (error) {
                console.error(`${colors.red}  ❌ Error: ${error.message}${colors.reset}`);
                errors++;
            }

            console.log('');
        }

        // Resumen
        console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);
        console.log(`${colors.cyan}           RESUMEN DE MIGRACIÓN        ${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);
        console.log(`${colors.green}✅ Procesadas exitosamente: ${processed}${colors.reset}`);
        console.log(`${colors.yellow}⚠️  Saltadas (no encontradas): ${skipped}${colors.reset}`);
        console.log(`${colors.red}❌ Errores: ${errors}${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════════${colors.reset}`);
        console.log('');

        if (processed > 0) {
            // Calcular ahorro de espacio
            const oldFiles = await fs.readdir(local.uploadDir);
            const oldPngFiles = oldFiles.filter(f => f.endsWith('.png'));

            console.log(`${colors.blue}💾 Información de almacenamiento:${colors.reset}`);
            console.log(`   Imágenes antiguas (PNG): ${oldPngFiles.length}`);
            console.log(`   ${colors.yellow}Puedes eliminar manualmente las imágenes PNG antiguas si todo funciona correctamente${colors.reset}`);
            console.log('');
            console.log(`${colors.green}🎉 ¡Migración completada exitosamente!${colors.reset}`);
        }

    } catch (error) {
        console.error(`${colors.red}❌ Error fatal: ${error.message}${colors.reset}`);
        console.error(error);
    } finally {
        // Desconectar de MongoDB
        await mongoose.disconnect();
        console.log(`${colors.blue}📡 Desconectado de MongoDB${colors.reset}`);
    }
}

// Confirmar antes de ejecutar
console.log('');
console.log(`${colors.yellow}⚠️  IMPORTANTE: Esta migración procesará todas las imágenes existentes.${colors.reset}`);
console.log(`${colors.yellow}   Asegúrate de tener un backup antes de continuar.${colors.reset}`);
console.log('');
console.log('Iniciando en 3 segundos...');
console.log('');

setTimeout(() => {
    migrateExistingImages().catch(error => {
        console.error(`${colors.red}Error fatal:${colors.reset}`, error);
        process.exit(1);
    });
}, 3000);
