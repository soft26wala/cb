const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // Limit each IP to 300 API requests per 15 minutes
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
  },
});

module.exports = {
  authRateLimiter,
  globalRateLimiter,
};
