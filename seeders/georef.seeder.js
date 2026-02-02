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

        // 2. Fetch Ciudades (Localidades)
        console.log('⬇️  Descargando localidades (max 5000)...');
        const locResponse = await axios.get('https://apis.datos.gob.ar/georef/api/localidades?max=5000');
        const localidadesData = locResponse.data.localidades;

        console.log(`📦 Procesando ${localidadesData.length} localidades...`);

        let ciudadesGuardadas = 0;
        const chunkSize = 100;
        const chunks = [];
        for (let i = 0; i < localidadesData.length; i += chunkSize) {
            chunks.push(localidadesData.slice(i, i + chunkSize));
        }

        for (const chunk of chunks) {
            const operations = chunk.map(loc => {
                const provId = loc.provincia.id;
                const mongoProvId = provinciaMap[provId];

                if (!mongoProvId) {
                    console.warn(`⚠️  Provincia ID ${provId} no encontrada para localidad ${loc.nombre}`);
                    return null;
                }

                return Ciudad.findOneAndUpdate(
                    { id: loc.id },
                    {
                        nombre: loc.nombre,
                        id: loc.id,
                        provincia: mongoProvId
                    },
                    { upsert: true, new: true }
                );
            });

            await Promise.all(operations);
            ciudadesGuardadas += chunk.length;
            process.stdout.write(`\r⏳ Progreso ciudades: ${ciudadesGuardadas}/${localidadesData.length}`);
        }

        console.log('\n✅ Seed completado exitosamente.');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error en el seed:', error);
        process.exit(1);
    }
};

SEED_PROVINCIAS();
