import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  createStripePaymentIntent,
  createStripeCheckoutSession,
  createLocalPaymentPlaceholder,
  confirmStripePayment,
  getSalesToday,
  getAllPayments,
  getMyPayments,
  getCustomerPaymentSummary,
  createPOSTransaction,
  getReceiptData,
  createPaymentRefund,
} from '../controllers/payment.controller.js';
import { POS_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authenticate);

// Customer-accessible: own payment history
router.get('/my', getMyPayments);

router.post('/stripe/checkout', createStripeCheckoutSession);
router.post('/stripe/intent', createStripePaymentIntent);
router.post('/stripe/confirm', confirmStripePayment);
router.post('/local', createLocalPaymentPlaceholder);
router.post('/pos', authorize(...POS_MANAGER_ROLES), createPOSTransaction);
router.get('/sales/today', authorize(...POS_MANAGER_ROLES), getSalesToday);
router.get('/customer/:customerId/summary', authorize(...POS_MANAGER_ROLES), getCustomerPaymentSummary);
router.post('/:paymentId/refunds', authorize(...POS_MANAGER_ROLES), createPaymentRefund);
router.get('/:id/receipt', authorize(...POS_MANAGER_ROLES), getReceiptData);
router.get('/', authorize(...POS_MANAGER_ROLES), getAllPayments);

export default router;
