const { logError } = require('../utils/logger');
const { errorResponse } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  logError(`Unhandled Error at ${req.method} ${req.originalUrl}:`, err);

  if (err.name === 'MulterError') {
    return errorResponse(res, `File upload error: ${err.message}`, null, 400);
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  return errorResponse(res, message, process.env.NODE_ENV === 'development' ? err.stack : null, statusCode);
};

module.exports = {
  errorHandler,
};
