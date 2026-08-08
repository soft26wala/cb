const successResponse = (res, message = 'Success', data = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (res, message = 'Error', errors = null, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors: errors ? (Array.isArray(errors) ? errors : [errors]) : undefined,
  });
};

module.exports = {
  successResponse,
  errorResponse,
};
