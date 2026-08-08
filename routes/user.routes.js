const express = require('express');
const { body } = require('express-validator');
const UserController = require('../controllers/user.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

const router = express.Router();

// GET /api/users or /api/user
router.get('/', verifyToken, isAdmin, UserController.getUsers);
router.get('/users', verifyToken, isAdmin, UserController.getUsers);
router.get('/user', verifyToken, isAdmin, UserController.getUsers);

router.get('/:id', verifyToken, UserController.getUserById);
router.get('/user/:id', verifyToken, UserController.getUserById);

const createUserValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('username').notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

router.post('/', verifyToken, isAdmin, uploadSingle, createUserValidation, validate, UserController.createUser);
router.post('/user', verifyToken, isAdmin, uploadSingle, createUserValidation, validate, UserController.createUser);

router.put('/:id', verifyToken, isAdmin, uploadSingle, UserController.updateUser);
router.put('/user/:id', verifyToken, isAdmin, uploadSingle, UserController.updateUser);

router.put('/:id/reset-password', verifyToken, isAdmin, UserController.resetPassword);
router.put('/user/:id/reset-password', verifyToken, isAdmin, UserController.resetPassword);

router.delete('/:id', verifyToken, isAdmin, UserController.deleteUser);
router.delete('/user/:id', verifyToken, isAdmin, UserController.deleteUser);

module.exports = router;
