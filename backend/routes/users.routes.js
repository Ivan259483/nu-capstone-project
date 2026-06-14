import express from 'express';
import multer from 'multer';
import * as userController from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { STAFF_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();
const authorizeStaffManagers = authorize(...STAFF_MANAGER_ROLES);
const authorizeUserDirectoryReaders = authorize(...STAFF_MANAGER_ROLES, 'sales');
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'photo');
    error.message = 'Upload a JPG or PNG image.';
    cb(error);
  },
});

const handleProfilePhotoUpload = (req, res, next) => {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    next();
    return;
  }

  profilePhotoUpload.single('photo')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Profile photo is too large. Upload a JPG or PNG image under 2 MB.'
        : error.message || 'Invalid profile photo upload.';
      return res.status(400).json({ success: false, message });
    }

    return res.status(400).json({
      success: false,
      message: error.message || 'Invalid profile photo upload.',
    });
  });
};

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
 * @route PATCH /api/users/profile
 * @desc Update current authenticated user's profile (name, phone, avatar, email)
 * @access Private
 */
router.patch('/profile', authenticate, handleProfilePhotoUpload, userController.updateMyProfile);

/**
 * @route PATCH /api/users/me/activity
 * @desc Heartbeat — updates lastSeenAt for presence in admin User Management
 * @access Private
 */
router.patch('/me/activity', authenticate, userController.touchMyActivity);

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
 * @route PATCH /api/users/:id/archive
 * @desc Archive (deactivate) a user account without deleting data
 * @access Private - Staff managers
 */
router.patch('/:id/archive', authenticate, authorizeStaffManagers, userController.archiveUser);

/**
 * @route PATCH /api/users/:id/activate
 * @desc Reactivate an archived/suspended user account
 * @access Private - Staff managers
 */
router.patch('/:id/activate', authenticate, authorizeStaffManagers, userController.activateUser);

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
