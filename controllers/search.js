const Search = require('../models/search')
const { uploadFile } = require('../services/uploader/upload')

const createSearch = async (req, res) => {
    try {
        search = new Search(req.body)
        
        const algo = await uploadFile(req.body.file);
        const searchCreated = await search.save()

        return res.status(201).json({
            status: true,
            queue: searchCreated
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

module.exports = {
    createSearch, 
    getAllSearches
}