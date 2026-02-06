import express from 'express';
import * as categoryController from '../controllers/categoryController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/categories
 * @desc Get all categories
 * @access Public
 */
router.get('/', categoryController.getAllCategories);

/**
 * @route GET /api/categories/:id
 * @desc Get category by ID
 * @access Public
 */
router.get('/:id', categoryController.getCategoryById);

/**
 * @route POST /api/categories
 * @desc Create new category
 * @access Private - Admin only
 */
router.post('/', authenticate, authorize('admin'), categoryController.createCategory);

/**
 * @route PUT /api/categories/:id
 * @desc Update category
 * @access Private - Admin only
 */
router.put('/:id', authenticate, authorize('admin'), categoryController.updateCategory);

/**
 * @route DELETE /api/categories/:id
 * @desc Delete category
 * @access Private - Admin only
 */
router.delete('/:id', authenticate, authorize('admin'), categoryController.deleteCategory);

export default router;
