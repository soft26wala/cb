const express = require('express');
const { body } = require('express-validator');
const LoanController = require('../controllers/loan.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

router.use(verifyToken, isAdmin);

router.get('/', LoanController.getLoans);
router.get('/loans', LoanController.getLoans);

router.get('/:id', LoanController.getLoanById);
router.get('/loan/:id', LoanController.getLoanById);

router.post(
  '/',
  [
    body('person_name').notEmpty().withMessage('Person name is required'),
    body('loan_type').isIn(['Given', 'Taken']).withMessage('Loan type must be Given or Taken'),
    body('amount').isNumeric().withMessage('Valid loan amount required'),
  ],
  validate,
  LoanController.createLoan
);

router.post(
  '/loan',
  [
    body('person_name').notEmpty().withMessage('Person name is required'),
    body('loan_type').isIn(['Given', 'Taken']).withMessage('Loan type must be Given or Taken'),
    body('amount').isNumeric().withMessage('Valid loan amount required'),
  ],
  validate,
  LoanController.createLoan
);

router.put('/:id', LoanController.updateLoan);
router.put('/loan/:id', LoanController.updateLoan);

router.delete('/:id', LoanController.deleteLoan);
router.delete('/loan/:id', LoanController.deleteLoan);

module.exports = router;
