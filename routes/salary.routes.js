const express = require('express');
const { body } = require('express-validator');
const SalaryController = require('../controllers/salary.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

router.use(verifyToken, isAdmin);

// GET routes
router.get('/', SalaryController.getSalaries);
router.get('/salaries', SalaryController.getSalaries);
router.get('/advances', SalaryController.getAdvances);
router.get('/advance/pending/:employeeId', SalaryController.getPendingAdvance);

// POST & DELETE Salary Advance
router.post('/advance', SalaryController.createAdvance);
router.delete('/advance/:advanceId', SalaryController.deleteAdvance);

// POST Monthly Salary Disbursement
router.post(
  '/',
  [
    body('employee_id').notEmpty().withMessage('Employee ID is required'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Valid month (1-12) required'),
    body('year').isInt({ min: 2000 }).withMessage('Valid year required'),
    body('salary').isNumeric().withMessage('Valid salary amount required'),
    body('paid').isNumeric().withMessage('Valid paid amount required'),
    body('payment_method').notEmpty().withMessage('Payment method required'),
  ],
  validate,
  SalaryController.createSalary
);

// Individual ID routes
router.get('/:id', SalaryController.getSalaryById);
router.put('/:id', SalaryController.updateSalary);
router.delete('/:id', SalaryController.deleteSalary);

module.exports = router;
