const express = require('express');
const { body } = require('express-validator');
const ProductController = require('../controllers/product.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');
const { uploadMultipleProductImages } = require('../middleware/upload.middleware');

const router = express.Router();

router.get('/', ProductController.getProducts);
router.get('/products', ProductController.getProducts);
router.get('/product', ProductController.getProducts);
router.get('/product/:id', ProductController.getProductById);
router.get('/:id', ProductController.getProductById);

router.use(verifyToken, isAdmin);

const productValidation = [
  body('product_name').notEmpty().withMessage('Product name is required'),
  body('sell_price').optional(),
];

router.post('/', uploadMultipleProductImages, productValidation, validate, ProductController.createProduct);
router.post('/product', uploadMultipleProductImages, productValidation, validate, ProductController.createProduct);

router.put('/:id', uploadMultipleProductImages, ProductController.updateProduct);
router.put('/product/:id', uploadMultipleProductImages, ProductController.updateProduct);

router.delete('/:id', ProductController.deleteProduct);
router.delete('/product/:id', ProductController.deleteProduct);

module.exports = router;
