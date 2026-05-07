import express from 'express';
import multer from 'multer';
import * as orderController from '../controllers/order.controller.js';
import * as supplierController from '../controllers/supplier.controller.js';
import * as trackerController from '../controllers/tracker.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  BOOKING_MANAGER_ROLES,
  CUSTOMER_ROLES,
  FULL_ADMIN_ROLES,
  SERVICE_OPERATION_ROLES,
  STAFF_ROLES,
  SUPPLIER_MANAGER_ROLES,
  POS_MANAGER_ROLES,
} from '../constants/roles.js';
import { getBilling, putBilling, checkoutBilling } from '../controllers/billing.controller.js';

const router = express.Router();

const trackerStagePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

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
 * @route GET /api/orders/:orderId/billing
 * @desc Load or create draft billing for an order
 */
router.get('/:orderId/billing', authorize(...POS_MANAGER_ROLES), getBilling);

/**
 * @route PUT /api/orders/:orderId/billing
 * @desc Replace billing line items and charges
 */
router.put('/:orderId/billing', authorize(...POS_MANAGER_ROLES), putBilling);

/**
 * @route POST /api/orders/:orderId/billing/checkout
 * @desc Checkout: invoice snapshot + POS payment + sync order items
 */
router.post('/:orderId/billing/checkout', authorize(...POS_MANAGER_ROLES), checkoutBilling);

/**
 * @route GET /api/orders/queue/staff
 * @desc Get prioritized staff queue of actionable jobs
 * @access Private - Detailer/Admin
 */
router.get('/queue/staff', authorize(...SERVICE_OPERATION_ROLES), orderController.getStaffQueue);

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
router.get('/detailer/my-orders', authorize(...STAFF_ROLES), orderController.getDetailerOrders);

/**
 * @route POST /api/orders/cleanup-stale
 * @desc Archive stale bookings (processing or missing labels)
 * @access Private - Admin
 */
router.post('/cleanup-stale', authorize(...BOOKING_MANAGER_ROLES), orderController.cleanupStaleBookings);

/**
 * @route POST /api/orders/:id/waiver
 * @desc Customer signs waiver
 * @access Private - Customer/Admin
 */
router.post('/:id/waiver', authorize(...CUSTOMER_ROLES, ...FULL_ADMIN_ROLES), orderController.signWaiver);

/**
 * @route POST /api/orders/:id/inspection
 * @desc Detailer uploads pre-service inspection
 * @access Private - Detailer/Admin
 */
router.post('/:id/inspection', authorize(...SERVICE_OPERATION_ROLES), orderController.updateInspection);

/**
 * @route GET /api/orders/:id/waiver-pdf
 * @desc Auto-generate and download Waiver PDF
 * @access Private
 */
router.get('/:id/waiver-pdf', authorize(...CUSTOMER_ROLES, ...STAFF_ROLES, ...FULL_ADMIN_ROLES), orderController.getWaiverPdf);

/**
 * @route POST /api/orders/:id/waiver-reminder
 * @desc Send waiver reminder to customer
 * @access Private - Admin
 */
router.post('/:id/waiver-reminder', authorize(...FULL_ADMIN_ROLES), orderController.sendWaiverReminder);

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
 * @route POST /api/orders/:id/payment-proof
 * @desc Customer uploads GCash payment proof
 * @access Private - Customer
 */
router.post('/:id/payment-proof', authorize(...CUSTOMER_ROLES), orderController.uploadPaymentProof);

/**
 * @route POST /api/orders/:id/confirm
 * @desc Admin confirms a pending booking (triggers full workflow chain)
 * @access Private - Admin
 */
router.post('/:id/confirm', authorize(...BOOKING_MANAGER_ROLES), orderController.confirmBooking);

/**
 * @route PATCH /api/orders/:id/approve
 * @desc Sales approves a pending_confirmation booking (GCash proof verified)
 * @access Private - Sales/Admin
 */
router.patch('/:id/approve', authorize(...BOOKING_MANAGER_ROLES, ...POS_MANAGER_ROLES), orderController.approveBooking);

/**
 * @route PATCH /api/orders/:id/reject
 * @desc Sales rejects a booking (invalid payment proof)
 * @access Private - Sales/Admin
 */
router.patch('/:id/reject', authorize(...BOOKING_MANAGER_ROLES, ...POS_MANAGER_ROLES), orderController.rejectBooking);

/**
 * @route PATCH /api/orders/:id/reschedule
 * @desc Sales reschedules a booking (drag and drop)
 * @access Private - Sales/Admin
 */
router.patch('/:id/reschedule', authorize(...BOOKING_MANAGER_ROLES, ...POS_MANAGER_ROLES), orderController.rescheduleBooking);

/**
 * @route PUT /api/orders/:id
 * @desc Update order
 * @access Private - Admin or order owner
 */
router.put('/:id', orderController.updateOrder);

/**
 * @route PATCH /api/orders/:id/workflow
 * @desc Update a workflow step (1-7) with strict step locking
 * @access Private - Detailer/Admin
 */
router.patch('/:id/workflow', authorize(...SERVICE_OPERATION_ROLES), orderController.updateWorkflowStep);

/**
 * @route PATCH /api/orders/:id/mobile-workflow
 * @desc Specifically manages the dedicated Mobile 9-Step workflow
 * @access Private - Detailer/Admin
 */
router.patch('/:id/mobile-workflow', authorize(...SERVICE_OPERATION_ROLES), orderController.updateMobileWorkflow);

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
router.put('/:id/assign', authorize(...BOOKING_MANAGER_ROLES), orderController.assignDetailer);

/**
 * @route PUT /api/orders/:id/assign-and-pay
 * @desc Assign detailer and optionally mark payment as paid (single atomic transaction)
 * @access Private - Admin
 */
router.put(
  '/:id/assign-and-pay',
  authorize(...BOOKING_MANAGER_ROLES),
  orderController.assignDetailerAndMarkPaid
);

/**
 * @route PUT /api/orders/:id/progress
 * @desc Update order progress/steps
 * @access Private - Detailer/Admin
 */
router.put('/:id/progress', authorize(...SERVICE_OPERATION_ROLES), orderController.updateOrderProgress);

/**
 * @route PATCH /api/orders/:id/operations-checklist
 * @desc Update operations checklist items (Ingress/Egress)
 * @access Private - Detailer/Admin
 */
router.patch('/:id/operations-checklist', authorize(...SERVICE_OPERATION_ROLES), orderController.updateOperationsChecklist);

/**
 * @route PATCH /api/orders/:id/warranty-receipt
 * @desc Update warranty and receipt details
 * @access Private - Detailer/Admin
 */
router.patch('/:id/warranty-receipt', authorize(...SERVICE_OPERATION_ROLES), orderController.updateWarrantyReceipt);

/**
 * @route PATCH /api/orders/:id/notes
 * @desc Add a note to the order's staffNotes
 * @access Private - Detailer/Admin
 */
router.patch('/:id/notes', authorize(...SERVICE_OPERATION_ROLES), orderController.addOrderNote);

/**
 * @route PATCH /api/orders/:id/photos
 * @desc Add a photo to the order's before/after photos
 * @access Private - Detailer/Admin
 */
router.patch('/:id/photos', authorize(...SERVICE_OPERATION_ROLES), orderController.addOrderPhoto);

/**
 * @route PATCH /api/orders/:id/stage-photo
 * @desc Save live-tracker stage photo URL + description (QC / service staff)
 */
router.patch(
  '/:id/stage-photo',
  authorize(...trackerController.TRACKER_STAGE_MEDIA_ROLES),
  trackerController.patchTrackerStagePhoto
);

/**
 * @route POST /api/orders/:id/stage-photo
 * @desc Upload stage photo (multipart) → Cloudinary → same record as PATCH
 */
router.post(
  '/:id/stage-photo',
  authorize(...trackerController.TRACKER_STAGE_MEDIA_ROLES),
  trackerStagePhotoUpload.single('photo'),
  trackerController.postTrackerStagePhotoUpload
);

/**
 * @route PUT /api/orders/:id/status
 * @desc Update customer-facing status
 * @access Private - Detailer/Admin
 */
router.put('/:id/status', authorize(...SERVICE_OPERATION_ROLES), orderController.updateCustomerStatus);

/**
 * @route POST /api/orders/:id/rating
 * @desc Submit rating for completed order
 * @access Private - Customer (order owner)
 */
router.post('/:id/rating', authorize(...CUSTOMER_ROLES, ...FULL_ADMIN_ROLES), orderController.submitRating);

/**
 * @route POST /api/orders/suppliers
 * @desc Place order with supplier
 * @access Private - Admin
 */
router.post('/suppliers', authorize(...SUPPLIER_MANAGER_ROLES), supplierController.placeOrder);

/**
 * @route POST /api/orders/:id/checkin
 * @desc POS/Admin check-in step (down payment, signature, Terms PDF)
 */
router.post('/:id/checkin', authorize(...BOOKING_MANAGER_ROLES), orderController.operateCheckIn);

/**
 * @route POST /api/orders/:id/start
 * @desc Detailer starts service
 */
router.post('/:id/start', authorize(...SERVICE_OPERATION_ROLES), orderController.operateStartService);

/**
 * @route POST /api/orders/:id/qc
 * @desc Detailer/QC completes service
 */
router.post('/:id/qc', authorize(...SERVICE_OPERATION_ROLES), orderController.operateQCComplete);

/**
 * @route POST /api/orders/:id/pay
 * @desc Cashier receives final payment
 */
router.post('/:id/pay', authorize(...BOOKING_MANAGER_ROLES), orderController.operateFinalPayment);

/**
 * @route POST /api/orders/:id/release
 * @desc Admin releases vehicle
 */
router.post('/:id/release', authorize(...BOOKING_MANAGER_ROLES), orderController.operateRelease);

export default router;
