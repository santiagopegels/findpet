const mongoose = require('mongoose')

const dbConnection = async () => {

    try {

       await mongoose.connect(process.env.MONGO_DB_CONNECTION) 

       console.log('DB Online :)')

    } catch (error) {
        throw new Error(error)
    }
}

module.exports = {
    dbConnection
}