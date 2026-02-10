const { Schema, model } = require('mongoose');

const CiudadSchema = Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre es obligatorio']
    },
    id: {
        type: String,
        required: true,
        unique: true
    },
    provincia: {
        type: Schema.Types.ObjectId,
        ref: 'Provincia',
        required: true
    },
    centroide: {
        lat: {
            type: Number,
            required: false
        },
        lon: {
            type: Number,
            required: false
        }
    }
});

module.exports = model('Ciudad', CiudadSchema, 'ciudades');
