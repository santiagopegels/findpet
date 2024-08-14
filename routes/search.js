const { Router } = require('express')
const { check } = require('express-validator')
const { createSearch, getAllSearches } = require('../controllers/search')

const router = Router();

router.get('/',
  getAllSearches)

router.post('/',
  [
      check('description', 'Name is required').notEmpty(),
  ],
  createSearch)

module.exports = router;