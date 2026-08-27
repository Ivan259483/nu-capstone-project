import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { REPORTING_ROLES } from '../constants/roles.js';
import {
  downloadSalesAnalyticsCsv,
  getSalesAnalyticsReport,
  getSalesCustomerBookings,
  getSalesCustomerOverview,
  getSalesCustomerTransactions,
  getSalesCustomers,
} from '../controllers/salesAnalytics.controller.js';

const router = express.Router();
router.use(authenticate, authorize(...REPORTING_ROLES));

router.get('/report.csv', downloadSalesAnalyticsCsv);
router.get('/report', getSalesAnalyticsReport);
router.get('/customers', getSalesCustomers);
router.get('/customers/:customerKey/bookings', getSalesCustomerBookings);
router.get('/customers/:customerKey/transactions', getSalesCustomerTransactions);
router.get('/customers/:customerKey', getSalesCustomerOverview);

export default router;

