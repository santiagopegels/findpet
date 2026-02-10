const axios = require('axios');

exports.removeFeatures = async (ids) => {
  try {
    const response = await axios.delete(process.env.MACHINE_LEARNING_URL + '/remove-features', {
      data: {
        'ids': ids
      },
      headers: {
        'X-API-KEY': process.env.MACHINE_LEARNING_API_KEY
      }
    });
    return response.data;
  } catch (error) {
    console.error(error);
  }
};
