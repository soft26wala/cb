const express = require('express');
const ExpenseController = require('../controllers/expense.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { uploadSingleLogo } = require('../middleware/upload.middleware');

const router = express.Router();

// Upload Bill Receipt Image
router.post('/upload-receipt', uploadSingleLogo, ExpenseController.uploadReceipt);
router.post('/upload-bill', uploadSingleLogo, ExpenseController.uploadReceipt);
router.post('/upload-image', uploadSingleLogo, ExpenseController.uploadReceipt);

// GET Expenses (Supports /expenses, /expenses/expenses, /)
router.get('/', ExpenseController.getExpenses);
router.get('/expenses', ExpenseController.getExpenses);
router.get('/expense/:id', ExpenseController.getExpenseById);
router.get('/:id', ExpenseController.getExpenseById);

// POST Create Expense
router.post('/', ExpenseController.createExpense);
router.post('/expense', ExpenseController.createExpense);
router.post('/expenses', ExpenseController.createExpense);

// PUT Update Expense
router.put('/:id', ExpenseController.updateExpense);
router.put('/expense/:id', ExpenseController.updateExpense);
router.put('/expenses/:id', ExpenseController.updateExpense);

// DELETE Delete Expense
router.delete('/:id', ExpenseController.deleteExpense);
router.delete('/expense/:id', ExpenseController.deleteExpense);
router.delete('/expenses/:id', ExpenseController.deleteExpense);

module.exports = router;
