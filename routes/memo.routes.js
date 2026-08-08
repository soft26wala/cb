const express = require('express');
const router = express.Router();
const { getMemos, createMemo, updateMemoStatus } = require('../controllers/memo.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermission } = require('../middleware/permission.middleware');

router.get('/', verifyToken, checkPermission('Memo Management'), getMemos);
router.post('/', verifyToken, checkPermission('Create'), createMemo);
router.put('/:id/status', verifyToken, checkPermission('Edit'), updateMemoStatus);

module.exports = router;
