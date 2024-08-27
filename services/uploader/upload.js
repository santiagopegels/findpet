const storageConfig = require('../../config/storageConfig');
const localStorageService = require('./localService')

let uploadService;

switch (storageConfig.storageType) {
  default:
    uploadService = localStorageService;
}

exports.uploadFile = async (file, filename) => {
  try {
    return await uploadService.upload(file, filename);
  } catch (error) {
    console.log(error.message)
  }
};