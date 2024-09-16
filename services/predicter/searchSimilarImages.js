const axios = require('axios');

exports.searchSimilarImages = async (image) => {
  try {   
    
   const result = await axios.post(process.env.MACHINE_LEARNING_URL + '/reverse-search', {
        'image': image,
    }).then((response) => {
        return response.data.data;
    })

    return result;
  } catch (error) {
    console.log(error.message);
  }
};