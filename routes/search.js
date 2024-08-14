const { Router } = require('express')
const { check } = require('express-validator')
const { createSearch } = require('../controllers/search')

const router = Router();

router.post('/',
  [
      check('description', 'Name is required').notEmpty(),
  ],
  createSearch)

module.exports = router;