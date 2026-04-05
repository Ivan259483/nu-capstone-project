import express from 'express';
import { getSettings, updateSettings, getPublicSettings } from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { SETTINGS_MANAGER_ROLES } from '../constants/roles.js';

const router = express.Router();

// Public route for landing page data
router.get('/public', getPublicSettings);

// Protected routes for admin
router.use(authenticate);
router.use(authorize(...SETTINGS_MANAGER_ROLES));

router.get('/', getSettings);
router.post('/', updateSettings);
router.patch('/', updateSettings);

export default router;
