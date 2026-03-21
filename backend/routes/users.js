import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/users
 * @desc Get all users
 * @access Public (for development/testing)
 */
router.get('/', userController.getAllUsers);

/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 * @access Public
 */
router.get('/:id', userController.getUserById);

/**
 * @route PUT /api/users/:id
 * @desc Update user
 * @access Public
 */
router.put('/:id', userController.updateUser);

/**
 * @route DELETE /api/users/:id
 * @desc Delete user
 * @access Public
 */
router.delete('/:id', userController.deleteUser);

/**
 * POST /api/users
 * @desc Create a new user
 * @access Public
 */
router.post('/', userController.createUser);

/**
 * @route PATCH /api/users/change-password
 * @desc Change user password
 * @access Private
 */
router.patch('/change-password', authenticate, userController.changePassword);


export default router;
