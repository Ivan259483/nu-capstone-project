import express from 'express';
import * as activityController from '../controllers/activityController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/activity
 * @desc Get recent activity logs
 * @access Private
 */
router.get('/', authenticate, activityController.getActivityLogs);

/**
 * @route POST /api/activity
 * @desc Create new activity log entry
 * @access Private
 */
router.post('/', authenticate, activityController.createActivityLog);

/**
 * @route DELETE /api/activity/cleanup
 * @desc Delete old activity logs
 * @access Admin only
 */
router.delete('/cleanup', authenticate, authorize('admin'), activityController.cleanupOldLogs);

export default router;
