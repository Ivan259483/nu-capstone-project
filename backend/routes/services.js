import express from 'express';
import * as serviceController from '../controllers/serviceController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, serviceController.getAllServices);
router.post('/', authenticate, authorize('admin'), serviceController.createService);
router.delete('/:id', authenticate, authorize('admin'), serviceController.deleteService);

export default router;
