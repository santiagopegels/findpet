const express = require('express');
const cors = require('cors');

class Server {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.server = require('http').createServer(this.app);

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
      this.app.use(this.paths.queue, require('../routes/queue'))
    }

    listen() {
      this.server.listen(this.port, () => {
          console.log(`Server Port: ${this.port}`)
      })
  }
}

module.exports = Server;