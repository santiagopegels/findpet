function getFilenameFromUrl(url) {
  return url.split('/').pop();
}

module.exports = {
  getFilenameFromUrl
};