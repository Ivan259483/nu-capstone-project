import express from 'express';
import { getSettings, updateSettings, getPublicSettings } from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { SETTINGS_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();

// Public route for landing page data
router.get('/public', getPublicSettings);

// Protected routes
router.use(authenticate);

// Any authenticated user can read settings (sales staff need this for store info)
router.get('/', getSettings);

// Only admin/office_admin can modify settings
router.post('/', authorize(...SETTINGS_MANAGER_ROLES), updateSettings);
router.patch('/', authorize(...SETTINGS_MANAGER_ROLES), updateSettings);

export default router;
