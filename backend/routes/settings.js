import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', getSettings);
router.post('/', updateSettings);
router.patch('/', updateSettings);

export default router;
