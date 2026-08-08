const express = require('express');
const { body } = require('express-validator');
const CategoryController = require('../controllers/category.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/', CategoryController.getCategories);
router.get('/categories', CategoryController.getCategories);
router.get('/category/:id', CategoryController.getCategoryById);
router.get('/:id', CategoryController.getCategoryById);

router.use(verifyToken, isAdmin);

router.post(
  '/',
  [body('category_name').notEmpty().withMessage('Category name is required')],
  validate,
  CategoryController.createCategory
);

router.post(
  '/category',
  [body('category_name').notEmpty().withMessage('Category name is required')],
  validate,
  CategoryController.createCategory
);

router.post(
  '/categories',
  [body('category_name').notEmpty().withMessage('Category name is required')],
  validate,
  CategoryController.createCategory
);

router.put('/:id', CategoryController.updateCategory);
router.put('/category/:id', CategoryController.updateCategory);
router.delete('/:id', CategoryController.deleteCategory);
router.delete('/category/:id', CategoryController.deleteCategory);

module.exports = router;
