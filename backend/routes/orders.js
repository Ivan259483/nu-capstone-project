import express from 'express';
import * as orderController from '../controllers/orderController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/orders
 * @desc Get all orders
 * @access Private
 */
router.get('/', authenticate, orderController.getAllOrders);

/**
 * @route GET /api/orders/detailer/my-orders
 * @desc Get orders assigned to current detailer
 * @access Private
 */
router.get('/detailer/my-orders', authenticate, orderController.getDetailerOrders);

/**
 * @route GET /api/orders/:id
 * @desc Get order by ID
 * @access Private
 */
router.get('/:id', authenticate, orderController.getOrderById);

/**
 * @route POST /api/orders
 * @desc Create new order
 * @access Private
 */
router.post('/', authenticate, orderController.createOrder);

/**
 * @route PUT /api/orders/:id
 * @desc Update order
 * @access Private - Admin or order owner
 */
router.put('/:id', authenticate, orderController.updateOrder);

/**
 * @route PATCH /api/orders/:id
 * @desc Partial update order
 * @access Private - Admin or order owner
 */
router.patch('/:id', authenticate, orderController.updateOrder);

/**
 * @route DELETE /api/orders/:id
 * @desc Delete order
 * @access Private - Admin or order owner
 */
router.delete('/:id', authenticate, orderController.deleteOrder);

/**
 * @route PUT /api/orders/:id/assign
 * @desc Assign detailer to order
 * @access Private - Admin
 */
router.put('/:id/assign', authenticate, authorize('admin'), orderController.assignDetailer);

/**
 * @route PUT /api/orders/:id/progress
 * @desc Update order progress/steps
 * @access Private - Detailer/Admin
 */
router.put('/:id/progress', authenticate, orderController.updateOrderProgress);

import * as supplierController from '../controllers/supplierController.js';

/**
 * @route POST /api/orders/suppliers
 * @desc Place order with supplier
 * @access Private - Admin
 */
router.post('/suppliers', authenticate, authorize('admin'), supplierController.placeOrder);

export default router;
