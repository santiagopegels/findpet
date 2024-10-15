const { Router } = require('express')
const { check } = require('express-validator')
const { createSearch, getAllSearches, reverseSearch } = require('../controllers/search');
const { validateFields } = require('../middleware/validate-fields');

const router = Router();

router.get('/',  getAllSearches)

router.post('/reverse-search',
  [
    check('city', 'City is required').notEmpty(),
    validateFields
  ],
  reverseSearch)

router.post('/',
  [
    check('city', 'City is required').notEmpty(),
    check('gpsLocation.latitude', 'Latitude is required').notEmpty().isFloat(),
    check('gpsLocation.longitude', 'Longitude is required').notEmpty().isFloat(),
    check('phone', 'Phone is required').notEmpty(),
    check('type', 'Type is required').notEmpty().isIn(['FIND', 'LOST']),
    check('image', 'Image is required').notEmpty().isBase64(),
    validateFields
  ],
  createSearch)

module.exports = router;