import mongoose from 'mongoose';
import { config } from '../config/environment.js';
import Vehicle from '../models/vehicle.model.js';
import { resolveVehiclePricingCategory } from '../constants/pricingCategories.js';

const apply = process.argv.includes('--apply');

async function migrateVehiclePricingCategories() {
  await mongoose.connect(config.mongodbUri);

  const vehicles = await Vehicle.find({
    $or: [
      { pricingCategory: { $exists: false } },
      { pricingCategory: null },
      { pricingCategory: '' },
    ],
  }).select('_id year make model plateNumber vehicleType pricingCategory').lean();

  const proposed = [];
  const unresolved = [];

  for (const vehicle of vehicles) {
    // Preserve exact legacy vehicleType values first, then the centralized
    // make/model compatibility classifications for known saved records.
    const pricingCategory = resolveVehiclePricingCategory(vehicle);
    const summary = {
      vehicleId: String(vehicle._id),
      vehicle: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '),
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType || null,
      pricingCategory,
    };

    if (!pricingCategory) {
      unresolved.push(summary);
      continue;
    }

    proposed.push(summary);
    if (apply) {
      await Vehicle.updateOne(
        { _id: vehicle._id, $or: [{ pricingCategory: null }, { pricingCategory: { $exists: false } }, { pricingCategory: '' }] },
        {
          $set: {
            pricingCategory,
            pricingCategorySource: 'legacy_migration',
            pricingCategoryNeedsReview: true,
            pricingCategoryReviewedAt: null,
            pricingCategoryReviewedBy: null,
          },
        }
      );
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    proposedCount: proposed.length,
    unresolvedCount: unresolved.length,
    proposed,
    unresolved,
  }, null, 2));
}

migrateVehiclePricingCategories()
  .catch((error) => {
    console.error('Vehicle pricing-category migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
