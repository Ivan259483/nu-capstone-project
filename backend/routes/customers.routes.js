import express from 'express';
import * as customerController from '../controllers/customer.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { BOOKING_MANAGER_ROLES, CUSTOMER_ROLES, USER_MANAGEMENT_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authenticate);

/**
 * @route GET /api/customers/me
 * @desc Get current customer's profile
 * @access Private
 */
router.get('/me', authorize(...CUSTOMER_ROLES), customerController.getMe);

/**
 * @route PUT /api/customers/me
 * @desc Update current customer's profile
 * @access Private
 */
router.put('/me', authorize(...CUSTOMER_ROLES), customerController.updateMe);

/**
 * @route GET /api/customers/vehicles
 * @desc Get customer vehicles
 * @access Private
 */
router.get('/vehicles', authorize(...CUSTOMER_ROLES, ...BOOKING_MANAGER_ROLES), customerController.getVehicles);

/**
 * @route POST /api/customers/vehicles
 * @desc Add vehicle to customer
 * @access Private
 */
router.post('/vehicles', authorize(...CUSTOMER_ROLES, ...BOOKING_MANAGER_ROLES), customerController.addVehicle);

/**
 * @route PUT /api/customers/vehicles/:id
 * @desc Update vehicle
 * @access Private
 */
router.put('/vehicles/:id', authorize(...CUSTOMER_ROLES, ...BOOKING_MANAGER_ROLES), customerController.updateVehicle);

/**
 * @route DELETE /api/customers/vehicles/:id
 * @desc Delete a vehicle
 * @access Private
 */
router.delete('/vehicles/:id', authorize(...CUSTOMER_ROLES, ...BOOKING_MANAGER_ROLES), customerController.deleteVehicle);

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
router.get('/:id', authorize(...CUSTOMER_ROLES, ...BOOKING_MANAGER_ROLES), customerController.getCustomerById);

/**
 * @route POST /api/customers
 * @desc Create new customer
 * @access Private
 */
router.post('/', authorize(...BOOKING_MANAGER_ROLES), customerController.createCustomer);

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
