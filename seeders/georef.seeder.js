const fs = require('fs');
const path = require('path');

// Cargar .env.local si existe (para ejecución local), sino .env
const envLocalPath = path.join(__dirname, '..', '.env.local');
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envLocalPath)) {
    require('dotenv').config({ path: envLocalPath });
    console.log('📝 Usando configuración de .env.local');
} else {
    require('dotenv').config({ path: envPath });
    console.log('📝 Usando configuración de .env');
}
const axios = require('axios');
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const Provincia = require('../models/Provincia');
const Ciudad = require('../models/Ciudad');

const SEED_PROVINCIAS = async () => {
    try {
        console.log('🌱 Iniciando seed de GEOREF...');
        await dbConnection();

        // 1. Fetch Provincias
        console.log('⬇️  Descargando provincias...');
        const provResponse = await axios.get('https://apis.datos.gob.ar/georef/api/provincias');
        const provinciasData = provResponse.data.provincias;

        console.log(`📦 Procesando ${provinciasData.length} provincias...`);

        let provinciasGuardadas = 0;
        const provinciaMap = {}; // Map API ID -> Mongo ID

        for (const prov of provinciasData) {
            const data = {
                nombre: prov.nombre,
                id: prov.id,
                centroide: prov.centroide
            };

            const savedProv = await Provincia.findOneAndUpdate(
                { id: prov.id },
                data,
                { upsert: true, new: true }
            );

            provinciaMap[prov.id] = savedProv._id;
            provinciasGuardadas++;
        }
        console.log(`✅ ${provinciasGuardadas} provincias actualizadas/insertadas.`);

        // 2. Fetch Ciudades (Municipios)
        console.log('⬇️  Descargando municipios (max 5000)...');
        const munResponse = await axios.get('https://apis.datos.gob.ar/georef/api/municipios?max=5000');
        const municipiosData = munResponse.data.municipios;

        console.log(`📦 Procesando ${municipiosData.length} municipios...`);

        let ciudadesGuardadas = 0;
        const chunkSize = 100;
        const chunks = [];
        for (let i = 0; i < municipiosData.length; i += chunkSize) {
            chunks.push(municipiosData.slice(i, i + chunkSize));
        }

        for (const chunk of chunks) {
            const operations = chunk.map(mun => {
                const provId = mun.provincia.id;
                const mongoProvId = provinciaMap[provId];

                if (!mongoProvId) {
                    console.warn(`⚠️  Provincia ID ${provId} no encontrada para municipio ${mun.nombre}`);
                    return null;
                }

                return Ciudad.findOneAndUpdate(
                    { id: mun.id },
                    {
                        nombre: mun.nombre,
                        id: mun.id,
                        provincia: mongoProvId,
                        centroide: mun.centroide ? {
                            lat: mun.centroide.lat,
                            lon: mun.centroide.lon
                        } : undefined
                    },
                    { upsert: true, new: true }
                );
            });

            await Promise.all(operations);
            ciudadesGuardadas += chunk.length;
            process.stdout.write(`\r⏳ Progreso ciudades: ${ciudadesGuardadas}/${municipiosData.length}`);
        }

        console.log('\n✅ Seed completado exitosamente.');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error en el seed:', error);
        process.exit(1);
    }
};

SEED_PROVINCIAS();
