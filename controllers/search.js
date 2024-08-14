const Search = require('../models/search')

const createSearch = (req, res) => {
    try {

        return res.status(201).json({
            status: true
        })

    } catch (error) {
        console.log(error)
    }
}

module.exports = {
    createSearch
}