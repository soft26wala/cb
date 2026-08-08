const express = require('express');
const SearchController = require('../controllers/search.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/search', verifyToken, SearchController.search);

module.exports = router;
