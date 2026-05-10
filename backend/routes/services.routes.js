import express from 'express';
import * as serviceController from '../controllers/service.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { SERVICE_CATALOG_ROLES } from '../constants/roles.js';

const router = express.Router();

// Public endpoint — only published + active services (for customer booking)
router.get('/published', serviceController.getPublishedServices);

// Admin endpoints
router.get('/', authenticate, serviceController.getAllServices);
router.post('/', authenticate, authorize(...SERVICE_CATALOG_ROLES), serviceController.createService);
router.patch('/:serviceId/pricing', authenticate, authorize(...SERVICE_CATALOG_ROLES), serviceController.updateServicePricing);
router.put('/:id', authenticate, authorize(...SERVICE_CATALOG_ROLES), serviceController.updateService);
router.delete('/:id', authenticate, authorize(...SERVICE_CATALOG_ROLES), serviceController.deleteService);

export default router;
