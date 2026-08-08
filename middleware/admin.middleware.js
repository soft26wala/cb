const { errorResponse } = require('../utils/response');

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 'Access denied. Privilege required.', null, 403);
  }
  next();
};

module.exports = {
  isAdmin,
};
