import express from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { SERVICE_CATALOG_ROLES } from '../constants/roles.js';

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
router.post('/', authenticate, authorize(...SERVICE_CATALOG_ROLES), categoryController.createCategory);

/**
 * @route PUT /api/categories/:id
 * @desc Update category
 * @access Private - Admin only
 */
router.put('/:id', authenticate, authorize(...SERVICE_CATALOG_ROLES), categoryController.updateCategory);

/**
 * @route DELETE /api/categories/:id
 * @desc Delete category
 * @access Private - Admin only
 */
router.delete('/:id', authenticate, authorize(...SERVICE_CATALOG_ROLES), categoryController.deleteCategory);

export default router;
