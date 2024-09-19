const express = require('express');
const cors = require('cors');

const { dbConnection } = require('../database/config');

class Server {
    constructor() {
        this.app = express();
        this.app.use('/images', express.static('images'));
        this.port = process.env.PORT || 3000;
        this.server = require('http').createServer(this.app);

        this.paths = {
          search: '/api/search'
      }

        this.middlewares();
        this.routes();
        dbConnection();
    }

    middlewares() {
      //CORS
      this.app.use(cors());
      this.app.use(express.json());

    };

    routes() {
      this.app.use(this.paths.search, require('../routes/search'))
    }

    listen() {
      this.server.listen(this.port, () => {
          console.log(`Server Port: ${this.port}`)
      })
  }
}

module.exports = Server;