import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  createStripePaymentIntent,
  createStripeCheckoutSession,
  createLocalPaymentPlaceholder,
  confirmStripePayment,
  getSalesToday,
  getAllPayments,
  createPOSTransaction,
  getReceiptData,
} from '../controllers/payment.controller.js';
import { POS_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authenticate);

router.post('/stripe/checkout', createStripeCheckoutSession);
router.post('/stripe/intent', createStripePaymentIntent);
router.post('/stripe/confirm', confirmStripePayment);
router.post('/local', createLocalPaymentPlaceholder);
router.post('/pos', authorize(...POS_MANAGER_ROLES), createPOSTransaction);
router.get('/sales/today', authorize(...POS_MANAGER_ROLES), getSalesToday);
router.get('/:id/receipt', authorize(...POS_MANAGER_ROLES), getReceiptData);
router.get('/', authorize(...POS_MANAGER_ROLES), getAllPayments);

export default router;
