const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/response');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, 'Input validation failed', errors.array(), 400);
  }
  next();
};

module.exports = {
  validate,
};
