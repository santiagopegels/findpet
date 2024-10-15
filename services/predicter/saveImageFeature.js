const axios = require('axios');

exports.saveImageFeature = async (filename) => {
  try {   
    axios.post(process.env.MACHINE_LEARNING_URL + '/save-feature', {
        'filename': filename
    }, {
      headers: {
        'API_KEY': process.env.MACHINE_LEARNING_API_KEY
      }
    }).then((response) => {
        return response;
    }).catch((error) => {
      console.error(error);
    });

    return '';
  } catch (error) {
    console.log(error.message);
  }
};