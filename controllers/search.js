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
        const limit = parseInt(req.query.limit) || 21;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;
        
        const totalSearches = await Search.countDocuments();
        const searches = await Search.find().limit(limit).skip(skip);
        const searchesWithImagePath = addImagePathToSearches(searches);

        return res.status(200).json({
            status: true,
            searches: searchesWithImagePath,
            total: totalSearches
        });

    } catch (error) {
        console.log(error)
    }
}

const reverseSearch = async (req, res) => {
    const filters = {};
    if (req.body.city) {
        filters.city = req.body.city;
    }
    if (req.body.image) {
        const similarImageIds = await searchSimilarImages(req.body.image);
        filters._id = { $in: similarImageIds };
    }    

    const searches = await Search.find(filters);
    const searchesWithImagePath = addImagePathToSearches(searches);

    return res.status(200).json({
        status: true,
        searches: searchesWithImagePath,
        total: searches.length
    });
}

const addImagePathToSearches = (searches) => {
    return searches.map(search => ({
        ...search.toObject(),
        image: `${process.env.URL}:${process.env.PORT}/images/${search.filename}`
    }));
}

module.exports = {
    createSearch,
    getAllSearches,
    reverseSearch
}