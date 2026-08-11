const ProductModel = require('../models/product.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');
const { uploadToCloudinaryBuffer } = require('../services/cloudinary.service');

class ProductController {
  static async getProducts(req, res, next) {
    try {
      const { search, category_id, status, user_id, limit, offset } = req.query;
      const effectiveUserId = user_id || null;
      const products = await ProductModel.findAll({
        search,
        category_id,
        status,
        user_id: effectiveUserId,
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Products fetched successfully', products);
    } catch (error) {
      next(error);
    }
  }

  static async getProductById(req, res, next) {
    try {
      const { id } = req.params;
      const { user_id } = req.query;
      const effectiveUserId = req.user?.id || req.cookies?.userId || user_id || null;
      const product = await ProductModel.findById(id, effectiveUserId);
      if (!product) {
        return errorResponse(res, 'Product not found', null, 404);
      }
      return successResponse(res, 'Product details fetched successfully', product);
    } catch (error) {
      next(error);
    }
  }

  static async createProduct(req, res, next) {
    try {
      const { category_id, product_name, product_description, buy_price, sell_price, custom_price, price, gst_percent, pst_percent, stock, status } = req.body;
      const effectiveCustomPrice = parseFloat(custom_price ?? sell_price ?? price ?? 0);

      let imagesData = [];
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
          const cloudRes = await uploadToCloudinaryBuffer(file.buffer, 'gb_cabinet_doors_products');
          imagesData.push(cloudRes);
        }
      } else if (req.body.images) {
        let parsed = req.body.images;
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch (e) { parsed = [parsed]; }
        }
        if (!Array.isArray(parsed)) parsed = [parsed];
        imagesData = parsed
          .map(img => {
            if (typeof img === 'string') {
              return img.startsWith('/uploads') ? null : { secure_url: img, public_id: null };
            }
            if (img && typeof img === 'object') {
              const url = img.secure_url || img.image_url || img.url;
              if (url && url.startsWith('/uploads')) return null;
              return { secure_url: url, public_id: img.public_id || img.image_public_id || null };
            }
            return null;
          })
          .filter(Boolean);
      }

      const newProduct = await ProductModel.create(
        { category_id, product_name, product_description, buy_price, custom_price: effectiveCustomPrice, gst_percent, pst_percent, stock, status },
        imagesData
      );

      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'INSERT',
        tableName: 'products',
        recordId: newProduct.p_id,
        newData: newProduct,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Product created and stored in Cloudinary & PostgreSQL successfully', newProduct, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const existingProduct = await ProductModel.findById(id);
      if (!existingProduct) {
        return errorResponse(res, 'Product not found', null, 404);
      }

      let imagesData = null;
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        imagesData = [];
        for (const file of req.files) {
          const cloudRes = await uploadToCloudinaryBuffer(file.buffer, 'gb_cabinet_doors_products');
          imagesData.push(cloudRes);
        }
      } else if (req.body.images) {
        let parsed = req.body.images;
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch (e) { parsed = [parsed]; }
        }
        if (!Array.isArray(parsed)) parsed = [parsed];
        imagesData = parsed
          .map(img => {
            if (typeof img === 'string') {
              return img.startsWith('/uploads') ? null : { secure_url: img, public_id: null };
            }
            if (img && typeof img === 'object') {
              const url = img.secure_url || img.image_url || img.url;
              if (url && url.startsWith('/uploads')) return null;
              return { secure_url: url, public_id: img.public_id || img.image_public_id || null };
            }
            return null;
          })
          .filter(Boolean);
      }

      const updatedProduct = await ProductModel.update(id, req.body, imagesData);

      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'UPDATE',
        tableName: 'products',
        recordId: id,
        oldData: existingProduct,
        newData: updatedProduct,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Product updated successfully on Cloudinary & PostgreSQL', updatedProduct);
    } catch (error) {
      next(error);
    }
  }

  static async deleteProduct(req, res, next) {
    try {
      const { id } = req.params;
      const existingProduct = await ProductModel.findById(id);
      if (!existingProduct) {
        return errorResponse(res, 'Product not found', null, 404);
      }

      await ProductModel.delete(id);

      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'DELETE',
        tableName: 'products',
        recordId: id,
        oldData: existingProduct,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Product and associated Cloudinary images deleted successfully', { p_id: id });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ProductController;
