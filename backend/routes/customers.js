import express from 'express';
import * as customerController from '../controllers/customerController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

/**
 * @route GET /api/customers/vehicles
 * @desc Get customer vehicles
 * @access Private
 */
router.get('/vehicles', customerController.getVehicles);

/**
 * @route POST /api/customers/vehicles
 * @desc Add vehicle to customer
 * @access Private
 */
router.post('/vehicles', customerController.addVehicle);

/**
 * @route PUT /api/customers/vehicles/:id
 * @desc Update vehicle
 * @access Private
 */
router.put('/vehicles/:id', customerController.updateVehicle);

/**
 * @route GET /api/customers
 * @desc Get all customers
 * @access Private - Admin only
 */
router.get('/', authorize('admin'), customerController.getAllCustomers);

/**
 * @route GET /api/customers/:id
 * @desc Get customer by ID
 * @access Private
 */
router.get('/:id', customerController.getCustomerById);

/**
 * @route POST /api/customers
 * @desc Create new customer
 * @access Private
 */
router.post('/', customerController.createCustomer);

/**
 * @route PUT /api/customers/:id
 * @desc Update customer
 * @access Private - Customer or admin
 */
router.put('/:id', authorize('customer', 'admin'), customerController.updateCustomer);

/**
 * @route DELETE /api/customers/:id
 * @desc Delete customer
 * @access Private - Admin only
 */
router.delete('/:id', authorize('admin'), customerController.deleteCustomer);

export default router;
