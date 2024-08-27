const fs = require('fs');
const path = require('path');
const StorageService = require('./contract/storageService');
const { local } = require('../../config/storageConfig');

class LocalStorageService extends StorageService {
  async upload(file, filename) {
    const uploadPath = path.join(local.uploadDir, filename + '.png');
    const decoded = Buffer.from(file, "base64");
    await fs.writeFile(uploadPath, decoded, (err) => {
      if (err) {
        throw new Error(err);
      }
  });
    return uploadPath;
  }
}

module.exports = new LocalStorageService();