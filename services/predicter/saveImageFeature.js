const axios = require('axios');

exports.saveImageFeature = async (filename) => {
  try {
    const response = await axios.post(`${process.env.MACHINE_LEARNING_URL}/save-feature`, {
      filename: filename
    }, {
      headers: {
        'X-API-KEY': process.env.MACHINE_LEARNING_API_KEY
      }
    });
    return response.data;
  } catch (error) {
    console.error(error);
    return error;
  }
};
