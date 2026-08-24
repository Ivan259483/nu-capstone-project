import express from 'express';
import {
  bulkSetArchivedState,
  bulkSetReadState,
  clearNotifications,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.post('/mark-all-read', markAllAsRead);
router.post('/bulk-status', bulkSetReadState);
router.post('/archive', bulkSetArchivedState);
router.post('/clear', clearNotifications);
router.patch('/:id/read', markAsRead);

export default router;
