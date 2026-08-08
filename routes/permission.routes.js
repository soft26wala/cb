const express = require('express');
const router = express.Router();
const { 
  getPermissions, 
  getUserPermissions, 
  updatePermissions,
  getUserPermissionsById,
  updateUserPermissionsById
} = require('../controllers/permission.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

router.get('/me', verifyToken, getUserPermissions);
router.get('/', verifyToken, isAdmin, getPermissions);
router.put('/', verifyToken, isAdmin, updatePermissions);
router.get('/user/:userId', verifyToken, isAdmin, getUserPermissionsById);
router.put('/user/:userId', verifyToken, isAdmin, updateUserPermissionsById);

module.exports = router;

