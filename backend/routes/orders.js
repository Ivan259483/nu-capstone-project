import express from 'express';
import * as orderController from '../controllers/orderController.js';
import * as supplierController from '../controllers/supplierController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

/**
 * @route GET /api/orders
 * @desc Get all orders
 * @access Private
 */
router.get('/', orderController.getAllOrders);

/**
 * @route GET /api/orders/available-slots
 * @desc Get available time slots for a given date
 * @access Private
 */
router.get('/available-slots', orderController.getAvailableSlots);

/**
 * @route GET /api/jobs/active
 * @desc Get active/in-progress jobs
 * @access Private
 */
router.get('/jobs/active', orderController.getActiveJobs);

/**
 * @route GET /api/orders/detailer/my-orders
 * @desc Get orders assigned to current detailer
 * @access Private
 */
router.get('/detailer/my-orders', authorize('detailer', 'admin'), orderController.getDetailerOrders);

/**
 * @route POST /api/orders/cleanup-stale
 * @desc Archive stale bookings (processing or missing labels)
 * @access Private - Admin
 */
router.post('/cleanup-stale', authorize('admin'), orderController.cleanupStaleBookings);

/**
 * @route POST /api/orders/:id/waiver
 * @desc Customer signs waiver
 * @access Private - Customer/Admin
 */
router.post('/:id/waiver', authorize('customer', 'admin'), orderController.signWaiver);

/**
 * @route POST /api/orders/:id/inspection
 * @desc Detailer uploads pre-service inspection
 * @access Private - Detailer/Admin
 */
router.post('/:id/inspection', authorize('detailer', 'admin'), orderController.updateInspection);

/**
 * @route GET /api/orders/:id
 * @desc Get order by ID
 * @access Private
 */
router.get('/:id', orderController.getOrderById);

/**
 * @route POST /api/orders
 * @desc Create new order
 * @access Private
 */
router.post('/', orderController.createOrder);

/**
 * @route PUT /api/orders/:id
 * @desc Update order
 * @access Private - Admin or order owner
 */
router.put('/:id', orderController.updateOrder);

/**
 * @route PATCH /api/orders/:id
 * @desc Partial update order
 * @access Private - Admin or order owner
 */
router.patch('/:id', orderController.updateOrder);

/**
 * @route DELETE /api/orders/:id
 * @desc Delete order
 * @access Private - Admin or order owner
 */
router.delete('/:id', orderController.deleteOrder);

/**
 * @route PUT /api/orders/:id/assign
 * @desc Assign detailer to order
 * @access Private - Admin
 */
router.put('/:id/assign', authorize('admin'), orderController.assignDetailer);

/**
 * @route PUT /api/orders/:id/assign-and-pay
 * @desc Assign detailer and optionally mark payment as paid (single atomic transaction)
 * @access Private - Admin
 */
router.put(
  '/:id/assign-and-pay',
  authorize('admin'),
  orderController.assignDetailerAndMarkPaid
);

/**
 * @route PUT /api/orders/:id/progress
 * @desc Update order progress/steps
 * @access Private - Detailer/Admin
 */
router.put('/:id/progress', authorize('detailer', 'admin'), orderController.updateOrderProgress);

/**
 * @route PUT /api/orders/:id/status
 * @desc Update customer-facing status
 * @access Private - Detailer/Admin
 */
router.put('/:id/status', authorize('detailer', 'admin'), orderController.updateCustomerStatus);

/**
 * @route POST /api/orders/:id/rating
 * @desc Submit rating for completed order
 * @access Private - Customer (order owner)
 */
router.post('/:id/rating', authorize('customer', 'admin'), orderController.submitRating);

/**
 * @route POST /api/orders/suppliers
 * @desc Place order with supplier
 * @access Private - Admin
 */
router.post('/suppliers', authorize('admin'), supplierController.placeOrder);

export default router;
