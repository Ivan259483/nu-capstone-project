import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { getInvoiceByNumber, getInvoicePdf } from '../controllers/invoice.controller.js';
import { POS_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authenticate);

router.get('/:invoiceNumber/pdf', authorize(...POS_MANAGER_ROLES), getInvoicePdf);
router.get('/:invoiceNumber', authorize(...POS_MANAGER_ROLES), getInvoiceByNumber);

export default router;
