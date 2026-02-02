const { Router } = require('express');
const Provincia = require('../models/Provincia');
const Ciudad = require('../models/Ciudad');

const router = Router();

// GET /api/georef/provincias - Listar todas las provincias
router.get('/provincias', async (req, res) => {
    try {
        const provincias = await Provincia.find().sort({ nombre: 1 });
        res.json({
            ok: true,
            provincias
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            msg: 'Error al obtener provincias'
        });
    }
});

// GET /api/georef/provincias/:id/ciudades - Listar ciudades de una provincia
// :id puede ser el _id de MongoDB o el id de API GEOREF
router.get('/provincias/:id/ciudades', async (req, res) => {
    const { id } = req.params;
    try {
        // Primero intentamos buscar por _id de Mongo
        let provincia;
        const isMongoId = id.match(/^[0-9a-fA-F]{24}$/);

        if (isMongoId) {
            provincia = await Provincia.findById(id);
        }

        // Si no se encontró (o no es MongoID), intentar por id de API
        if (!provincia) {
            provincia = await Provincia.findOne({ id });
        }

        if (!provincia) {
            return res.status(404).json({
                ok: false,
                msg: 'Provincia no encontrada'
            });
        }

        const ciudades = await Ciudad.find({ provincia: provincia._id }).sort({ nombre: 1 });

        res.json({
            ok: true,
            provincia: {
                _id: provincia._id,
                nombre: provincia.nombre,
                id: provincia.id
            },
            ciudades
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            msg: 'Error al obtener ciudades'
        });
    }
});

// GET /api/georef/ciudades?search=nombre - Buscar ciudades por nombre
router.get('/ciudades', async (req, res) => {
    const { search } = req.query;
    const limit = parseInt(req.query.limit) || 20;

    try {
        const query = {};
        if (search) {
            query.nombre = { $regex: search, $options: 'i' };
        }

        const ciudades = await Ciudad.find(query)
            .limit(limit)
            .populate('provincia', 'nombre')
            .sort({ nombre: 1 });

        res.json({
            ok: true,
            ciudades
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            msg: 'Error al buscar ciudades'
        });
    }
});

module.exports = router;
