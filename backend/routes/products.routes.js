import express from 'express';
import * as productController from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { INVENTORY_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();

/**
 * @route GET /api/products
 * @desc Get all products with pagination
 * @access Public
 */
router.get('/', productController.getAllProducts);

/**
 * @route GET /api/products/:id
 * @desc Get product by ID
 * @access Public
 */
router.get('/:id', productController.getProductById);

/**
 * @route POST /api/products
 * @desc Create new product
 * @access Admin only
 */
router.post('/', authenticate, authorize(...INVENTORY_MANAGER_ROLES), productController.createProduct);

/**
 * @route PUT /api/products/:id
 * @desc Update product
 * @access Admin only
 */
router.put('/:id', authenticate, authorize(...INVENTORY_MANAGER_ROLES), productController.updateProduct);

/**
 * @route PATCH /api/inventory/consume
 * @desc Consume inventory (decrement stock) with activity logging
 * @access Private
 */
router.patch('/inventory/consume', authenticate, productController.consumeInventory);

/**
 * @route DELETE /api/products/:id
 * @desc Delete product
 * @access Admin only
 */
router.delete('/:id', authenticate, authorize(...INVENTORY_MANAGER_ROLES), productController.deleteProduct);

export default router;
