import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
    getAllSuppliers,
    createSupplier,
    deleteSupplier
} from '../controllers/supplier.controller.js';
import { INVENTORY_MANAGER_ROLES, SUPPLIER_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();

// All supplier routes require authentication
router.use(authenticate);

// List suppliers for inventory workflows
router.get('/', authorize(...INVENTORY_MANAGER_ROLES), getAllSuppliers);

// Create supplier (admin only)
router.post('/', authorize(...SUPPLIER_MANAGER_ROLES), createSupplier);

// Delete supplier (admin only)
router.delete('/:id', authorize(...SUPPLIER_MANAGER_ROLES), deleteSupplier);

export default router;
