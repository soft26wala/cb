const express = require('express');
const { body } = require('express-validator');
const EmployeeController = require('../controllers/employee.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

router.use(verifyToken, isAdmin);

router.get('/', EmployeeController.getEmployees);
router.get('/employees', EmployeeController.getEmployees);
router.get('/employee', EmployeeController.getEmployees);

router.get('/:id', EmployeeController.getEmployeeById);
router.get('/employee/:id', EmployeeController.getEmployeeById);

const createEmpValidation = [
  body('name').notEmpty().withMessage('Employee name is required'),
  body('mobile').notEmpty().withMessage('Mobile number is required'),
  body('salary').isNumeric().withMessage('Valid salary is required'),
  body('joining_date').notEmpty().withMessage('Joining date is required'),
];

router.post('/', createEmpValidation, validate, EmployeeController.createEmployee);
router.post('/employee', createEmpValidation, validate, EmployeeController.createEmployee);

router.put('/:id', EmployeeController.updateEmployee);
router.put('/employee/:id', EmployeeController.updateEmployee);

router.delete('/:id', EmployeeController.deleteEmployee);
router.delete('/employee/:id', EmployeeController.deleteEmployee);

module.exports = router;
