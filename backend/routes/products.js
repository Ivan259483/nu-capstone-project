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
 * @access Private - Admin only
 */
router.post('/', authenticate, authorize('admin'), productController.createProduct);

/**
 * @route PUT /api/products/:id
 * @desc Update product
 * @access Private - Admin only
 */
router.put('/:id', authenticate, authorize('admin'), productController.updateProduct);

/**
 * @route DELETE /api/products/:id
 * @desc Delete product
 * @access Private - Admin only
 */
router.delete('/:id', authenticate, authorize('admin'), productController.deleteProduct);

export default router;
