const express = require('express');
const CompanyCredentialsController = require('../controllers/companyCredentials.controller');
const { uploadSingleLogo } = require('../middleware/upload.middleware');

const router = express.Router();

// GET /company-credentials - Retrieve single credentials record
router.get('/', CompanyCredentialsController.getCredentials);

// POST /company-credentials/upload-logo - Upload company logo image
router.post('/upload-logo', uploadSingleLogo, CompanyCredentialsController.uploadLogo);
router.post('/upload-image', uploadSingleLogo, CompanyCredentialsController.uploadLogo);

// PUT /company-credentials - Update single credentials record
router.put('/', CompanyCredentialsController.updateCredentials);

// POST /company-credentials - Update single credentials record (prevent creating duplicate records)
router.post('/', CompanyCredentialsController.updateCredentials);

module.exports = router;

