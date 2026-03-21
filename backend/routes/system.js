import express from 'express';
import { 
  exportAllData, 
  backupDatabase, 
  clearCache, 
  resetSystem 
} from '../controllers/systemController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All system routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

router.get('/export', exportAllData);
router.post('/backup', backupDatabase);
router.post('/clear-cache', clearCache);
router.post('/reset', resetSystem);

export default router;
