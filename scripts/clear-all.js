const mongoose = require('mongoose');
require('dotenv').config();

const Search = require('../models/search');

const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/findog';

async function clearDB() {
    try {
        await mongoose.connect(dbUri);
        console.log('Connected to DB. Deleting all searches...');
        const result = await Search.deleteMany({});
        console.log(`Deleted ${result.deletedCount} searches.`);
    } catch (e) {
        console.error('Error clearing DB:', e);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected');
        process.exit(0);
    }
}

clearDB();
