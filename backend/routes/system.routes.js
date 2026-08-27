import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  acknowledgeBackupController,
  clearCache,
  createCleanupPreviewController,
  createDemoResetPreviewController,
  createHandoverPreviewController,
  createLifecyclePreviewController,
  downloadBackup,
  downloadSafeExport,
  executeCleanupController,
  executeDemoResetController,
  executeHandoverController,
  executeLifecycleController,
  getBackups,
  getClassification,
  getOperation,
  getOverview,
  getReconciliationEvents,
  getSystemStatus,
  inviteHandoverCandidateController,
  legacySystemEndpointRemoved,
  patchClassification,
  patchReconciliationEvent,
  retryOperation,
} from '../controllers/system.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

const executionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'SYSTEM_OPERATION_RATE_LIMITED',
    message: 'Too many protected System Management attempts. Try again later.',
  },
});

const backupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'BACKUP_RATE_LIMITED',
    message: 'Too many backup attempts. Try again later.',
  },
});

const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'HANDOVER_INVITATION_RATE_LIMITED',
    message: 'Too many client administrator invitation attempts. Try again later.',
  },
});

router.get('/status', getSystemStatus);

// Permanently disabled before auth so stale clients always receive the stable
// 410 contract instead of retrying a destructive operation.
router.all('/reset', legacySystemEndpointRemoved);
router.all('/export', legacySystemEndpointRemoved);
router.all('/backup', legacySystemEndpointRemoved);

router.use(authenticate);

router.get('/overview', authorize('administrator', 'office_admin'), getOverview);
router.post('/exports/download', authorize('administrator', 'office_admin'), downloadSafeExport);

router.use(authorize('administrator'));

router.get('/classification', getClassification);
router.patch('/classification', patchClassification);
router.post('/cleanup/previews', createCleanupPreviewController);
router.post('/cleanup/executions', executionLimiter, executeCleanupController);
router.post('/demo-reset/previews', createDemoResetPreviewController);
router.post('/demo-reset/executions', executionLimiter, executeDemoResetController);

router.post('/backups/download', backupLimiter, downloadBackup);
router.post('/backups/:id/acknowledge', acknowledgeBackupController);
router.get('/backups', getBackups);

router.post('/handover/invitations', invitationLimiter, inviteHandoverCandidateController);
router.post('/handover/previews', createHandoverPreviewController);
router.post('/handover/executions', executionLimiter, executeHandoverController);
router.post('/lifecycle/previews', createLifecyclePreviewController);
router.post('/lifecycle/executions', executionLimiter, executeLifecycleController);

router.get('/operations/:id', getOperation);
router.post('/operations/:id/retry', executionLimiter, retryOperation);
router.get('/reconciliation', getReconciliationEvents);
router.patch('/reconciliation/:id', patchReconciliationEvent);
router.post('/clear-cache', clearCache);

export default router;
