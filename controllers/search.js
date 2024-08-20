const Search = require('../models/search');
const { uploadFile } = require('../services/uploader/upload');
const { predict } = require('../services/predicter/main');

const createSearch = async (req, res) => {
    try {
        search = new Search({
            ...req.body,
            imageUrl: await uploadFile(req.body.file)
        })
        
        console.log(await predict(req.body.file));
        
        const searchCreated = await search.save()
        
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

module.exports = {
    createSearch, 
    getAllSearches
}