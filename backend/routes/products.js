import express from 'express';
import * as productController from '../controllers/productController.js';
import { authenticate, authorize } from '../middleware/auth.js';

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
 * @access Public
 */
router.post('/', productController.createProduct);

/**
 * @route PUT /api/products/:id
 * @desc Update product
 * @access Public
 */
router.put('/:id', productController.updateProduct);

/**
 * @route PATCH /api/inventory/consume
 * @desc Consume inventory (decrement stock) with activity logging
 * @access Private
 */
router.patch('/inventory/consume', authenticate, productController.consumeInventory);

/**
 * @route DELETE /api/products/:id
 * @desc Delete product
 * @access Public
 */
router.delete('/:id', productController.deleteProduct);

export default router;
