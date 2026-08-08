const express = require('express');
const { body } = require('express-validator');
const AuthController = require('../controllers/auth.controller');
const { validate } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');
const { authRateLimiter } = require('../middleware/rateLimiter.middleware');

const router = express.Router();

router.post(
  '/signup',
  authRateLimiter,
  uploadSingle,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('username').notEmpty().withMessage('Username is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validate,
  AuthController.signup
);

router.post(
  '/login',
  authRateLimiter,
  (req, res, next) => {
    if (!req.body.emailOrUsername && !req.body.username && !req.body.email) {
      req.body.emailOrUsername = '';
    } else {
      req.body.emailOrUsername = req.body.emailOrUsername || req.body.username || req.body.email;
    }
    next();
  },
  [
    body('emailOrUsername').notEmpty().withMessage('Username or Email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  AuthController.login
);

router.post(
  '/google-login',
  authRateLimiter,
  [body('idToken').notEmpty().withMessage('Google idToken is required')],
  validate,
  AuthController.googleLogin
);

router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required')],
  validate,
  AuthController.forgotPassword
);

router.post(
  '/reset-password',
  [
    body('resetToken').notEmpty().withMessage('Reset token is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  validate,
  AuthController.resetPassword
);

router.post('/refresh-token', AuthController.refreshToken);
router.post('/logout', verifyToken, AuthController.logout);

module.exports = router;
