import express from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { STAFF_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();
const authorizeStaffManagers = authorize(...STAFF_MANAGER_ROLES);
const authorizeUserDirectoryReaders = authorize(...STAFF_MANAGER_ROLES, 'sales');

const requireUserDirectoryAccess = (req, res, next) => {
  if (typeof req.query.email === 'string' && req.query.email.trim()) {
    return next();
  }

  authenticate(req, res, () => authorizeUserDirectoryReaders(req, res, next));
};

/**
 * @route GET /api/users
 * @desc Get all users
 * @access Private - Staff managers, or public exact-email lookup for auth bootstrap
 */
router.get('/', requireUserDirectoryAccess, userController.getAllUsers);

/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 * @access Private
 */
router.get('/:id', authenticate, userController.getUserById);

/**
 * @route PUT /api/users/:id
 * @desc Update user
 * @access Private
 */
router.put('/:id', authenticate, userController.updateUser);

/**
 * @route DELETE /api/users/:id
 * @desc Delete user
 * @access Private - Staff managers
 */
router.delete('/:id', authenticate, authorizeStaffManagers, userController.deleteUser);

/**
 * POST /api/users
 * @desc Create a new user
 * @access Private - Staff managers
 */
router.post('/', authenticate, authorizeStaffManagers, userController.createUser);

/**
 * @route PATCH /api/users/change-password
 * @desc Change user password
 * @access Private
 */
router.patch('/change-password', authenticate, userController.changePassword);

/**
 * @route POST /api/users/push-token
 * @desc Register Expo Push Notification Token
 * @access Private
 */
router.post('/push-token', authenticate, userController.registerPushToken);

export default router;
