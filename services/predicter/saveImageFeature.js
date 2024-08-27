const axios = require('axios');

exports.saveImageFeature = async (filename) => {
  try {   
    axios.get('http://localhost:5000/reverse-search').then((response) => {
        console.log(response.data);
    }).catch((error) => {
      console.error(error);
    });
    // axios.post('http://localhost:5000/save-feature', {
    //     'filename': filename
    // }).then((response) => {
    //     console.log(response.data);
    // }).catch((error) => {
    //   console.error(error);
    // });

    return '';
  } catch (error) {
    console.log(error.message);
  }
};