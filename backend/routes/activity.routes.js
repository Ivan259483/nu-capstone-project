import express from 'express';
import * as activityController from '../controllers/activity.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { FULL_ADMIN_ROLES, REPORTING_ROLES, ADMIN_DASHBOARD_ROLES } from '../constants/roles.js';

const router = express.Router();

/**
 * @route GET /api/activity
 * @desc Get activity logs with filters
 * @access Private - Admin dashboard roles
 */
router.get('/', authenticate, authorize(...ADMIN_DASHBOARD_ROLES), activityController.getActivityLogs);

/**
 * @route GET /api/activity/stats
 * @desc Get today's activity statistics
 * @access Private - Admin dashboard roles
 */
router.get('/stats', authenticate, authorize(...ADMIN_DASHBOARD_ROLES), activityController.getActivityStats);

/**
 * @route POST /api/activity
 * @desc Create new activity log entry
 * @access Private
 */
router.post('/', authenticate, activityController.createActivityLog);

/**
 * @route POST /api/activity/seed
 * @desc Seed sample activity logs for demo
 * @access Admin only
 */
router.post('/seed', authenticate, authorize(...FULL_ADMIN_ROLES), activityController.seedActivityLogs);

/**
 * @route DELETE /api/activity/cleanup
 * @desc Delete old activity logs
 * @access Admin only
 */
router.delete('/cleanup', authenticate, authorize(...FULL_ADMIN_ROLES), activityController.cleanupOldLogs);

export default router;
