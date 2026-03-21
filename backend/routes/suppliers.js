import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
    getAllSuppliers,
    createSupplier,
    deleteSupplier
} from '../controllers/supplierController.js';

const router = express.Router();

// All supplier routes require authentication
router.use(authenticate);

// List suppliers (admin or staff for visibility)
router.get('/', authorize('admin', 'detailer'), getAllSuppliers);

// Create supplier (admin only)
router.post('/', authorize('admin'), createSupplier);

// Delete supplier (admin only)
router.delete('/:id', authorize('admin'), deleteSupplier);

export default router;
