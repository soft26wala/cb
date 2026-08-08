const CompanyCredentialsModel = require('../models/companyCredentials.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');
const { uploadToCloudinaryBuffer } = require('../services/cloudinary.service');

class CompanyCredentialsController {
  static async getCredentials(req, res, next) {
    try {
      const credentials = await CompanyCredentialsModel.getCredentials();
      return successResponse(res, 'Company credentials retrieved successfully', credentials);
    } catch (error) {
      next(error);
    }
  }

  static async uploadLogo(req, res, next) {
    try {
      if (!req.file) {
        return errorResponse(res, 'No image file provided for upload', null, 400);
      }

      let logoUrl = '';
      try {
        const cloudRes = await uploadToCloudinaryBuffer(req.file.buffer, 'gb_company_logo', req.file.mimetype);
        logoUrl = cloudRes.secure_url;
      } catch (cloudErr) {
        console.warn('[Company Credentials Logo Upload Warning] Cloudinary fallback:', cloudErr.message);
        const base64Str = req.file.buffer.toString('base64');
        logoUrl = `data:${req.file.mimetype || 'image/png'};base64,${base64Str}`;
      }

      return successResponse(res, 'Logo uploaded successfully', { logo_url: logoUrl, url: logoUrl, secure_url: logoUrl });
    } catch (error) {
      next(error);
    }
  }

  static async updateCredentials(req, res, next) {

    try {
      const {
        company_name,
        company_email,
        company_phone,
        business_number,
        gst_number,
        pst_number,
      } = req.body;

      // Backend Validation
      if (company_name !== undefined && !company_name.trim()) {
        return errorResponse(res, 'Company name cannot be empty', null, 400);
      }
      if (company_email !== undefined && company_email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(company_email.trim())) {
          return errorResponse(res, 'Invalid company email format', null, 400);
        }
      }
      if (company_phone !== undefined && !company_phone.trim()) {
        return errorResponse(res, 'Company phone number cannot be empty', null, 400);
      }
      if (business_number !== undefined && !business_number.trim()) {
        return errorResponse(res, 'Business Number cannot be empty', null, 400);
      }

      const updated = await CompanyCredentialsModel.updateCredentials(req.body);

      // Audit Log Record
      if (req.user && req.user.id) {
        await recordHistory({
          userId: req.user.id,
          action: 'UPDATE',
          tableName: 'company_credentials',
          recordId: updated.id,
          newData: { company_name: updated.company_name, business_number: updated.business_number },
          ipAddress: req.ip,
        }).catch(() => {});
      }

      return successResponse(res, 'Company credentials updated successfully', updated);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CompanyCredentialsController;
