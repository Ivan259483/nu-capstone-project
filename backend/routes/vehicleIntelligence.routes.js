import express from 'express';
import mongoose from 'mongoose';
import Vehicle from '../models/vehicle.model.js';
import VehicleDefinition from '../models/vehicleDefinition.model.js';
import VehicleClassification from '../models/vehicleClassification.model.js';
import { STANDARD_VEHICLE_COLORS, VEHICLE_COLOR_FINISHES } from '../models/vehicleColor.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { FULL_ADMIN_ROLES, canManageCustomerGarage } from '../constants/roles.js';
import { normalizeVehiclePricingCategory, getVehicleTypeLabelForPricingCategory } from '../constants/pricingCategories.js';
import { classifyVehicle, vehicleCatalog, latestDefinitions, publishDefinition, identityKey, vehicleClassificationFields } from '../services/vehicleIntelligence.service.js';
import {
  listVehicleManufacturers, listVehicleModels, listVehicleVariants,
  seedVehicleClassifications, upsertVehicleCatalogBatch, vehicleCatalogCoverage,
} from '../services/globalVehicleCatalog.service.js';
import {
  listVehicleColors,
  resolveVehicleColor,
  upsertVehicleColorBatch,
  vehicleColorCoverage,
} from '../services/vehicleColorIntelligence.service.js';

export const vehicleIntelligenceRouter = express.Router();
const router = vehicleIntelligenceRouter;
const admin = authorize(...FULL_ADMIN_ROLES);
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    next(error);
  }
};
const hasInvalidCatalogQuery = (query, keys) => keys.some((key) => query[key] !== undefined
  && (typeof query[key] !== 'string' || query[key].length > 200));

router.use(authenticate);
router.get('/catalog', handle(async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, data: await vehicleCatalog() });
}));
router.get('/manufacturers', handle(async (req, res) => {
  if (hasInvalidCatalogQuery(req.query, ['search', 'after', 'limit'])) return res.status(422).json({ success: false, message: 'Invalid manufacturer query.' });
  const result = await listVehicleManufacturers(req.query);
  res.set('Cache-Control', 'private, max-age=300').json({ success: true, ...result });
}));
router.get('/models', handle(async (req, res) => {
  if (hasInvalidCatalogQuery(req.query, ['manufacturerId', 'brand', 'year', 'search', 'after', 'limit'])) return res.status(422).json({ success: false, message: 'Invalid model query.' });
  if (req.query.manufacturerId && !mongoose.isValidObjectId(req.query.manufacturerId)) {
    return res.status(422).json({ success: false, message: 'Invalid manufacturer.' });
  }
  const result = await listVehicleModels(req.query);
  res.set('Cache-Control', 'private, max-age=300').json({ success: true, ...result });
}));
router.get('/variants', handle(async (req, res) => {
  if (hasInvalidCatalogQuery(req.query, ['modelId', 'year', 'after', 'limit'])) return res.status(422).json({ success: false, message: 'Invalid variant query.' });
  if (!mongoose.isValidObjectId(req.query.modelId)) return res.status(422).json({ success: false, message: 'Invalid model.' });
  const result = await listVehicleVariants(req.query);
  res.set('Cache-Control', 'private, max-age=300').json({ success: true, ...result });
}));
router.get('/classifications', handle(async (_req, res) => {
  await seedVehicleClassifications();
  const data = await VehicleClassification.find({ status: 'active' }).sort({ vehicleClass: 1 }).lean();
  res.set('Cache-Control', 'private, max-age=3600').json({ success: true, data });
}));
router.get('/colors/categories', handle(async (_req, res) => {
  res.set('Cache-Control', 'private, max-age=3600').json({
    success: true,
    data: { standardColors: STANDARD_VEHICLE_COLORS, finishTypes: VEHICLE_COLOR_FINISHES },
  });
}));
router.get('/colors', handle(async (req, res) => {
  if (req.query.after && !mongoose.isValidObjectId(req.query.after)) {
    return res.status(422).json({ success: false, message: 'Invalid color cursor.' });
  }
  for (const key of ['brand', 'model', 'year', 'standardColor', 'q']) {
    if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || req.query[key].length > 200)) {
      return res.status(422).json({ success: false, message: `Invalid ${key}.` });
    }
  }
  const result = await listVehicleColors(req.query);
  res.set('Cache-Control', 'private, max-age=300').json({ success: true, ...result });
}));
router.get('/colors/resolve', handle(async (req, res) => {
  for (const key of ['brand', 'model', 'year', 'color', 'factoryColorName', 'paintCode']) {
    if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || req.query[key].length > 200)) {
      return res.status(422).json({ success: false, message: `Invalid ${key}.` });
    }
  }
  res.set('Cache-Control', 'no-store').json({ success: true, data: await resolveVehicleColor(req.query) });
}));
router.get('/classify', handle(async (req, res) => {
  const identity = {};
  for (const key of ['brand', 'model', 'year', 'generation', 'facelift', 'bodyType', 'fuelType', 'drivetrain']) {
    if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || req.query[key].length > 200)) {
      return res.status(422).json({ success: false, message: `Invalid ${key}.` });
    }
    identity[key] = req.query[key];
  }
  if (req.query.vehicleId) {
    if (!mongoose.isValidObjectId(req.query.vehicleId)) return res.status(422).json({ success: false, message: 'Invalid vehicle.' });
    const existing = await Vehicle.findById(req.query.vehicleId).lean();
    if (!existing || (String(existing.customer) !== req.user.id && !canManageCustomerGarage(req.user.role))) {
      return res.status(404).json({ success: false, message: 'Vehicle not found.' });
    }
    const fields = await vehicleClassificationFields({ ...identity, make: identity.brand }, existing);
    return res.set('Cache-Control', 'no-store').json({ success: true, data: {
      ...fields.classification, pricingCategory: fields.pricingCategory || null,
      vehicleType: fields.pricingCategory ? fields.vehicleType : null,
      status: fields.pricingCategory ? 'classified' : 'review_required',
    } });
  }
  res.set('Cache-Control', 'no-store').json({ success: true, data: await classifyVehicle(identity) });
}));
router.get('/definitions', admin, handle(async (req, res) => {
  const match = {};
  if (typeof req.query.brand === 'string') match.brandKey = identityKey(req.query.brand);
  if (typeof req.query.model === 'string') match.modelKey = identityKey(req.query.model);
  const records = (await latestDefinitions(match)).sort((a, b) => a.definitionKey.localeCompare(b.definitionKey));
  const filtered = records.filter((r) => !req.query.after || r.definitionKey > String(req.query.after));
  const data = filtered.slice(0, 100);
  res.json({ success: true, data, nextCursor: filtered.length > 100 ? data.at(-1).definitionKey : null });
}));
router.get('/coverage', admin, handle(async (_req, res) => {
  res.json({ success: true, data: await vehicleCatalogCoverage() });
}));
router.post('/catalog/import', admin, handle(async (req, res) => {
  const data = await upsertVehicleCatalogBatch(req.body?.records, { maxBatchSize: 1000 });
  res.status(201).json({ success: true, data });
}));
router.get('/colors/coverage', admin, handle(async (_req, res) => {
  res.json({ success: true, data: await vehicleColorCoverage() });
}));
router.post('/colors/import', admin, handle(async (req, res) => {
  const data = await upsertVehicleColorBatch(req.body?.records, { maxBatchSize: 1000 });
  res.status(201).json({ success: true, data });
}));
router.get('/definitions/:key/history', admin, handle(async (req, res) => {
  const query = { definitionKey: req.params.key };
  if (req.query.beforeRevision !== undefined) {
    const before = Number(req.query.beforeRevision);
    if (!Number.isInteger(before) || before < 1) return res.status(422).json({ success: false, message: 'Invalid revision cursor.' });
    query.revision = { $lt: before };
  }
  const data = await VehicleDefinition.find(query).sort({ revision: -1 }).limit(100).lean();
  res.json({ success: true, data, nextCursor: data.length === 100 ? data.at(-1).revision : null });
}));
router.post('/definitions', admin, handle(async (req, res) => {
  const data = await publishDefinition(req.body, req.user.id);
  res.status(201).json({ success: true, data });
}));
router.put('/definitions/:key', admin, handle(async (req, res) => {
  if (!Number.isInteger(req.body.expectedRevision) || req.body.expectedRevision < 1) {
    return res.status(422).json({ success: false, message: 'expectedRevision is required.' });
  }
  const data = await publishDefinition(req.body, req.user.id, req.params.key, req.body.expectedRevision);
  res.json({ success: true, data });
}));

router.get('/review-queue', admin, handle(async (req, res) => {
  if (req.query.after && !mongoose.isValidObjectId(req.query.after)) return res.status(422).json({ success: false, message: 'Invalid vehicle cursor.' });
  const vehicles = await Vehicle.find(req.query.after ? { _id: { $gt: req.query.after } } : {})
    .sort({ _id: 1 }).limit(50).lean();
  const definitions = vehicles.length ? await latestDefinitions() : [];
  const reviewed = await Promise.all(vehicles.map(async (vehicle) => ({ ...vehicle, ...await vehicleClassificationFields(vehicle, vehicle, definitions) })));
  res.json({ success: true, data: reviewed.filter((vehicle) => !vehicle.pricingCategory),
    nextCursor: vehicles.length === 50 ? String(vehicles.at(-1)._id) : null });
}));

router.put('/vehicles/:id/override', admin, handle(async (req, res) => {
  const pricingCategory = normalizeVehiclePricingCategory(req.body.pricingCategory);
  if (!mongoose.isValidObjectId(req.params.id) || !pricingCategory || typeof req.body.reason !== 'string'
    || !req.body.reason.trim() || req.body.reason.length > 1000 || !Number.isInteger(req.body.expectedVersion)) {
    return res.status(422).json({ success: false, message: 'Valid vehicle, existing pricing category, reason and expectedVersion are required.' });
  }
  const current = await Vehicle.findById(req.params.id).lean();
  if (!current) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
  const data = await Vehicle.findOneAndUpdate({ _id: current._id, __v: req.body.expectedVersion }, {
    $set: {
      pricingCategory, vehicleType: getVehicleTypeLabelForPricingCategory(pricingCategory),
      pricingCategorySource: 'admin_assigned', pricingCategoryNeedsReview: false,
      pricingCategoryReviewedAt: new Date(), pricingCategoryReviewedBy: req.user.id,
      classification: { ...current.classification, status: 'classified', reason: 'ADMIN_OVERRIDE',
        confidenceLevel: 'high', pricingCategory, vehicleCategory: getVehicleTypeLabelForPricingCategory(pricingCategory),
        vehicleType: getVehicleTypeLabelForPricingCategory(pricingCategory), definitions: [], source: 'admin_override' },
    },
    $inc: { __v: 1 },
    $push: { classificationOverrides: { pricingCategory, previousCategory: current.pricingCategory || null,
      reason: req.body.reason.trim(), actor: req.user.id, at: new Date(),
      identity: { make: current.make, model: current.model, year: current.year, generation: current.generation } } },
  }, { new: true, runValidators: true });
  if (!data) return res.status(409).json({ success: false, code: 'VEHICLE_REVISION_CONFLICT', message: 'Vehicle changed. Reload before overriding.' });
  res.json({ success: true, data });
}));

export default router;
