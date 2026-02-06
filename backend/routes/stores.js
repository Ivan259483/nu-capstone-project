import express from 'express';
import * as storeController from '../controllers/storeController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/stores
 * @desc Get all stores
 * @access Public
 */
router.get('/', storeController.getAllStores);

/**
 * @route GET /api/stores/:id
 * @desc Get store by ID
 * @access Public
 */
router.get('/:id', storeController.getStoreById);

/**
 * @route POST /api/stores
 * @desc Create new store
 * @access Private - Admin only
 */
router.post('/', authenticate, authorize('admin'), storeController.createStore);

/**
 * @route PUT /api/stores/:id
 * @desc Update store
 * @access Private - Admin or store manager
 */
router.put('/:id', authenticate, storeController.updateStore);

/**
 * @route DELETE /api/stores/:id
 * @desc Delete store
 * @access Private - Admin only
 */
router.delete('/:id', authenticate, authorize('admin'), storeController.deleteStore);

export default router;
