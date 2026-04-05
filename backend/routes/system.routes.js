import express from 'express';
import { 
  exportAllData, 
  backupDatabase, 
  clearCache, 
  resetSystem 
} from '../controllers/system.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { FULL_ADMIN_ROLES } from '../constants/roles.js';

const router = express.Router();

// All system routes require admin authentication
router.use(authenticate);
router.use(authorize(...FULL_ADMIN_ROLES));

router.get('/export', exportAllData);
router.post('/backup', backupDatabase);
router.post('/clear-cache', clearCache);
router.post('/reset', resetSystem);

export default router;
