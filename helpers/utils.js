function getFilenameFromUrl(url) {
  return url.split('/').pop();
}

function farewell(name) {
  return `Goodbye, ${name}!`;
}

module.exports = {
  getFilenameFromUrl
};