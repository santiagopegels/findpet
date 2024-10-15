const axios = require('axios');

exports.searchSimilarImages = async (image, searchesIds) => {
  try {   
    
   const result = await axios.post(process.env.MACHINE_LEARNING_URL + '/reverse-search', {
        'image': image,
        'ids': searchesIds
    }).then((response) => {
        return response.data.data;
    })

    return result;
  } catch (error) {
    console.log(error.message);
  }
};