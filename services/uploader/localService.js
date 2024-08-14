const fs = require('fs');
const path = require('path');
const StorageService = require('./contract/storageService');
const { local } = require('../../config/storageConfig');

class LocalStorageService extends StorageService {
  async upload(file) {
    const uploadPath = path.join(local.uploadDir, 'test.png');
    const decoded = Buffer.from(file, "base64");
    fs.writeFile(uploadPath, decoded, (err) => {
      if (err) {
        throw new Error(err);
      }
  });
    return { path: uploadPath };
  }
}

module.exports = new LocalStorageService();