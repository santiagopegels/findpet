const { Schema, model } = require('mongoose');

const ProvinciaSchema = Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre es obligatorio']
    },
    id: {
        type: String,
        required: true,
        unique: true
    },
    centroide: {
        lat: Number,
        lon: Number
    }
});

module.exports = model('Provincia', ProvinciaSchema, 'provincias');
