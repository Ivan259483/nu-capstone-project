import mongoose from 'mongoose';
import { config } from '../config/environment.js';
import Service from '../models/service.model.js';
import {
  SPF_PACKAGE_PRICING,
  buildLegacyPrices,
  buildRichPricing,
  getMinimumPackageBasePrice,
  getPackageKeyFromName,
} from '../constants/spfPricing.js';

const buildServicePayload = (pkg) => ({
  name: pkg.name,
  category: pkg.category,
  description: pkg.description,
  duration: pkg.duration,
  basePrice: getMinimumPackageBasePrice(pkg),
  prices: buildLegacyPrices(pkg),
  pricing: buildRichPricing(pkg),
  billingGroup: 'ceramic_spf',
  displayOrder: pkg.displayOrder,
  status: 'Active',
  isPublished: true,
  lastUpdatedBy: 'sync-spf-services',
  lastUpdatedAt: new Date(),
});

async function syncSPFServices() {
  await mongoose.connect(config.mongodbUri);

  const existingServices = await Service.find({
    name: { $regex: /spf\s*[-_]*(80|89|99|101)/i },
  });

  const existingByKey = new Map();
  existingServices.forEach((service) => {
    const key = getPackageKeyFromName(service.name);
    if (key && !existingByKey.has(key)) {
      existingByKey.set(key, service);
    }
  });

  const results = [];
  for (const [key, pkg] of Object.entries(SPF_PACKAGE_PRICING)) {
    const payload = buildServicePayload(pkg);
    const existing = existingByKey.get(key);

    if (existing) {
      existing.set(payload);
      await existing.save();
      results.push({ key, action: 'updated', id: existing._id.toString(), name: payload.name });
      continue;
    }

    const created = await Service.create(payload);
    results.push({ key, action: 'created', id: created._id.toString(), name: payload.name });
  }

  return results;
}

syncSPFServices()
  .then((results) => {
    console.log('SPF service pricing sync complete:');
    results.forEach((result) => {
      console.log(`- ${result.action.padEnd(7)} ${result.key}: ${result.name} (${result.id})`);
    });
  })
  .catch((error) => {
    console.error('SPF service pricing sync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
