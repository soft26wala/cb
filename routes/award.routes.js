const express = require('express');
const AwardController = require('../controllers/award.controller');

const router = express.Router();

router.get('/', AwardController.getAwards);
router.get('/:id', AwardController.getAwardById);
router.post('/', AwardController.createAward);
router.put('/:id', AwardController.updateAward);
router.delete('/:id', AwardController.deleteAward);

module.exports = router;
