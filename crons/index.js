const removeSearchesCron = require('./removeSearchesCron');

const initCrons = () => {
  removeSearchesCron();
  console.log('Crons :)')
};

module.exports = initCrons;