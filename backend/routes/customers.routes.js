import express from 'express';
import * as customerController from '../controllers/customer.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { CUSTOMER_ROLES, USER_MANAGEMENT_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authenticate);

/**
 * @route GET /api/customers/me
 * @desc Get current customer's profile
 * @access Private
 */
router.get('/me', customerController.getMe);

/**
 * @route PUT /api/customers/me
 * @desc Update current customer's profile
 * @access Private
 */
router.put('/me', customerController.updateMe);

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
router.get('/', authorize(...USER_MANAGEMENT_ROLES), customerController.getAllCustomers);

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
router.put('/:id', authorize(...CUSTOMER_ROLES, ...USER_MANAGEMENT_ROLES), customerController.updateCustomer);

/**
 * @route DELETE /api/customers/:id
 * @desc Delete customer
 * @access Private - Admin only
 */
router.delete('/:id', authorize(...USER_MANAGEMENT_ROLES), customerController.deleteCustomer);

export default router;
