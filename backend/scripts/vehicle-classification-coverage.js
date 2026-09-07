// Read-only: node backend/scripts/vehicle-classification-coverage.js [--database]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { brandModels, normalizeVehicleIdentity, canonicalVehicleIdentity } from '../constants/vehicleDatabase.js';
import { BOOTSTRAP_DEFINITIONS, classifyDefinitions, latestDefinitions, vehicleClassificationFields } from '../services/vehicleIntelligence.service.js';
import Vehicle from '../models/vehicle.model.js';
const useDatabase = process.argv.includes('--database');
let records = [];
try {
  if (useDatabase) {
    dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/autospf', { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 });
    records = await latestDefinitions();
  }
  const catalog = structuredClone(brandModels);
  for (const record of records) {
    const { brand, model } = canonicalVehicleIdentity(record.brand, record.model);
    catalog[brand] ||= [];
    if (!catalog[brand].includes(model)) catalog[brand].push(model);
  }
  const unclassified = {}; const categories = {}; let total = 0;
  for (const [brand, models] of Object.entries(catalog)) {
    if (brand === 'Other') continue;
    for (const model of models.filter(m => m !== 'Other')) {
      total++;
      const revisions = records.filter(r => normalizeVehicleIdentity(canonicalVehicleIdentity(r.brand, r.model).brand) === normalizeVehicleIdentity(brand) && normalizeVehicleIdentity(r.model) === normalizeVehicleIdentity(model));
      const classification = classifyDefinitions({ brand, model }, revisions.length ? revisions : BOOTSTRAP_DEFINITIONS);
      if (classification.pricingCategory) categories[classification.pricingCategory] = (categories[classification.pricingCategory] || 0) + 1;
      else (unclassified[brand] ||= []).push(model);
    }
  }
  const classified = Object.values(categories).reduce((a, b) => a + b, 0);
  const report = { scope: useDatabase ? 'Configured database revisions plus repository catalog' : 'Repository catalog; database revisions excluded', totalSelectableModels: total, classified, unclassifiedCount: total - classified, excluded: 'Other is a custom-entry action, not a model', categories, unclassified };
  if (useDatabase) {
    const saved = await Vehicle.find({}).lean();
    report.savedVehicles = { total: saved.length, classified: 0, reviewRequired: 0, effectiveCategoryDiffersFromStored: 0 };
    for (const vehicle of saved) {
      const effective = await vehicleClassificationFields(vehicle, vehicle, records);
      report.savedVehicles[effective.pricingCategory ? 'classified' : 'reviewRequired']++;
      if ((effective.pricingCategory || null) !== (vehicle.pricingCategory || null)) report.savedVehicles.effectiveCategoryDiffersFromStored++;
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--write-report') && !useDatabase) {
    const content = `# Vehicle classification coverage\n\nRepository baseline, evaluated ${new Date().toISOString().slice(0, 10)}. Live administrator definitions can change these totals.\n\nTotal selectable models: ${total}\n\nClassified: ${classified}\n\nUnclassified: ${total - classified}\n\nThe Other custom-entry actions are excluded. Mappings preserve existing explicit AutoSPF+ pricing rules; old keyword heuristics are excluded. No new automotive/body-style inference was used. Classifications cover optional model years through 2026 and remain subject to the existing review deadline.\n\n## Classified by canonical tier\n\n${Object.entries(categories).map(([c,n])=>`- ${c}: ${n}`).join('\n')}\n\n## Unclassified models requiring business review\n\n${Object.entries(unclassified).map(([b,ms])=>`- **${b}**: ${ms.join(', ')}`).join('\n')}\n\nRegenerate: \`node backend/scripts/vehicle-classification-coverage.js --write-report\`. Read-only live audit: append \`--database\` without \`--write-report\`.\n`;
    fs.writeFileSync(new URL('../docs/vehicle-classification-coverage.md', import.meta.url), content);
  }
} finally { if (useDatabase) await mongoose.disconnect(); }
