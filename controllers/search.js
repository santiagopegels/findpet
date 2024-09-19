const Search = require('../models/search');
const { uploadFile } = require('../services/uploader/upload');
const { saveImageFeature } = require('../services/predicter/saveImageFeature');
const { searchSimilarImages } = require('../services/predicter/searchSimilarImages');
const { getFilenameFromUrl } = require('../helpers/utils');

const createSearch = async (req, res) => {
    try {
        search = new Search(req.body);   

        const urlFile = await uploadFile(req.body.image, search.id)
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
        const limit = parseInt(req.query.limit) || 20;

        const searches = await Search.find().limit(limit);
        const searchesWithImagePath = searches.map(search => ({
            ...search.toObject(),
            image: `${process.env.URL}:${process.env.PORT}/images/${search.filename}`
        }));
        
        return res.status(200).json({
            status: true,
            searches: searchesWithImagePath
        });

    } catch (error) {
        console.log(error)
    }
}

const reverseSearch = async (req, res) => {
    const similarImageIds = await searchSimilarImages(req.body.image);
    const searches = await Search.find({ _id: { $in: similarImageIds } });
    
    return res.status(200).json({
        data: searches
    });
}

module.exports = {
    createSearch, 
    getAllSearches,
    reverseSearch
}