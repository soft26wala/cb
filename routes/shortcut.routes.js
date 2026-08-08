const express = require('express');
const ShortcutController = require('../controllers/shortcut.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Allow public GET or authenticated GET depending on application design; authenticate updates
router.get('/', ShortcutController.getShortcuts);
router.post('/reset', ShortcutController.resetShortcuts);
router.post('/', ShortcutController.createShortcut);
router.put('/batch', ShortcutController.batchUpdateShortcuts);
router.put('/:id', ShortcutController.updateShortcut);
router.delete('/:id', ShortcutController.deleteShortcut);

module.exports = router;
