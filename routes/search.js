const { check } = require('express-validator')

router.post('/',
  [
      check('description', 'Name is required').notEmpty(),
  ],
  createQueue)