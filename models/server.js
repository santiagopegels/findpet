const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const { dbConnection } = require('../database/config');
const initCrons = require('../crons/index');

class Server {
    constructor() {
        this.app = express();
        this.app.use('/images', express.static('images'));
        this.app.use(bodyParser.json({ limit: '2mb' }));
        this.port = process.env.PORT || 3000;
        this.server = require('http').createServer(this.app);

        this.paths = {
          search: '/api/search'
      }

        this.middlewares();
        this.routes();
        dbConnection();
        initCrons();
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