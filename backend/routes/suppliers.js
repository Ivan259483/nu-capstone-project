import express from 'express';
import * as supplierController from '../controllers/supplierController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, authorize('admin'), supplierController.getAllSuppliers);
router.post('/', authenticate, authorize('admin'), supplierController.createSupplier);
router.delete('/:id', authenticate, authorize('admin'), supplierController.deleteSupplier);
router.post('/place-order', authenticate, authorize('admin'), supplierController.placeOrder);

export default router;
