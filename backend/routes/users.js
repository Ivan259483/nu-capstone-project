import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/users
 * @desc Get all users
 * @access Private - Admin only
 */
router.get('/', authenticate, authorize('admin'), userController.getAllUsers);

/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 * @access Private
 */
router.get('/:id', authenticate, userController.getUserById);

/**
 * @route PUT /api/users/:id
 * @desc Update user
 * @access Private - Admin or own account
 */
router.put('/:id', authenticate, userController.updateUser);

/**
 * @route DELETE /api/users/:id
 * @desc Delete user
 * @access Private - Admin only
 */
router.delete('/:id', authenticate, authorize('admin'), userController.deleteUser);

/**
 * POST /api/users
 * @desc Create a new user
 * @access Private - Admin only
 */
router.post('/', authenticate, authorize('admin'), userController.createUser);

/**
 * @route PATCH /api/users/change-password
 * @desc Change user password
 * @access Private
 */
router.patch('/change-password', authenticate, userController.changePassword);


export default router;
