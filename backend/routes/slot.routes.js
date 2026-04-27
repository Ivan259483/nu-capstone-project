/**
 * slot.routes.js
 *
 * All /api/slots routes.
 * Public read (date/range) — authenticated write (settings).
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  getSlotsByDate,
  getSlotsByRange,
  getBusinessSettings,
  updateBusinessSettings,
} from '../controllers/slot.controller.js';
import { FULL_ADMIN_ROLES, SETTINGS_MANAGER_ROLES, BOOKING_MANAGER_ROLES } from '../constants/roles.js';

const router = Router();

// ── Public slot availability (requires auth — customer/staff/admin all need this) ──
router.get('/', authenticate, getSlotsByDate);
router.get('/range', authenticate, getSlotsByRange);

// ── Business settings (admin only) ────────────────────────────────────────────
router.get(
  '/settings',
  authenticate,
  authorize(...FULL_ADMIN_ROLES, ...SETTINGS_MANAGER_ROLES, ...BOOKING_MANAGER_ROLES),
  getBusinessSettings
);

router.patch(
  '/settings',
  authenticate,
  authorize(...FULL_ADMIN_ROLES, ...SETTINGS_MANAGER_ROLES),
  updateBusinessSettings
);

export default router;
