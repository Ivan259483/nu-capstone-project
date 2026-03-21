import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  createStripePaymentIntent,
  createStripeCheckoutSession,
  createLocalPaymentPlaceholder,
  confirmStripePayment,
  getSalesToday,
  getAllPayments,
} from '../controllers/paymentController.js';

const router = express.Router();

router.use(authenticate);

router.post('/stripe/checkout', createStripeCheckoutSession);
router.post('/stripe/intent', createStripePaymentIntent);
router.post('/stripe/confirm', confirmStripePayment);
router.post('/local', createLocalPaymentPlaceholder);
router.get('/sales/today', authorize('admin', 'detailer'), getSalesToday);
router.get('/', authorize('admin'), getAllPayments);

export default router;
