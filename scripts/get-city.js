const mongoose = require('mongoose');
require('dotenv').config();

const Provincia = require('../models/Provincia');
const Ciudad = require('../models/Ciudad');

const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/findog';

async function run() {
  await mongoose.connect(dbUri);
  const misiones = await Provincia.findOne({ nombre: 'Misiones' });
  if (!misiones) {
    console.log("No province found");
    return process.exit(0);
  }
  const posadas = await Ciudad.findOne({ nombre: 'Posadas', provincia: misiones._id });
  console.log("Posadas ID:", posadas ? posadas._id.toString() : "Not found");
  process.exit(0);
}
run().catch(console.error);
