const axios = require('axios');

exports.searchSimilarImages = async (image, searchesIds) => {
  try {
    const response = await axios.post(process.env.MACHINE_LEARNING_URL + '/reverse-search', {
      'image': image,
      'ids': searchesIds
    }, {
      headers: {
        'API_KEY': process.env.MACHINE_LEARNING_API_KEY
      }
    });
    return response.data.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
