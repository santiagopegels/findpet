const Search = require('../models/search');
const { uploadFile } = require('../services/uploader/upload');
const { saveImageFeature } = require('../services/predicter/saveImageFeature');
const { getFilenameFromUrl } = require('../helpers/utils');

const createSearch = async (req, res) => {
    try {
        search = new Search(req.body);   

        const urlFile = await uploadFile(req.body.file, search.id)
        search.filename = await getFilenameFromUrl(urlFile);        
        const searchCreated = await search.save();

        saveImageFeature(search.id);

        return res.status(201).json({
            status: true,
            search: searchCreated
        });

    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

const getAllSearches = async (req, res) => {
    try {
        const searches = await Search.find()

        return res.status(200).json({
            status: true,
            searches
        });

    } catch (error) {
        console.log(error)
    }
}

// Agregar el metodo para buscar por reverse search

module.exports = {
    createSearch, 
    getAllSearches
}