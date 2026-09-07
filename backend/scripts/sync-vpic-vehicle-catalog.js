import { writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { upsertVehicleCatalogBatch, vehicleCatalogCoverage } from '../services/globalVehicleCatalog.service.js';

const API_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/*?format=json';
const valueOf = (name) => process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = process.argv.includes('--apply');
const output = valueOf('--output');
if (!apply && !output) throw new Error('Choose --output=catalog.ndjson for an inspectable dry run or --apply to import.');

async function fetchInventory() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(API_URL, { signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': 'AutoSPF-VehicleCatalog/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.Results)) throw new Error('Unexpected vPIC response.');
      return payload.Results;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw new Error(`vPIC inventory request failed: ${lastError.message}`);
}

const rows = await fetchInventory();
const records = rows.map((row) => ({
  provider: 'nhtsa-vpic',
  providerManufacturerId: String(row.Make_ID || ''),
  providerModelId: String(row.Model_ID || ''),
  sourceId: `${row.Make_ID}:${row.Model_ID}`,
  brandName: row.Make_Name,
  modelName: row.Model_Name,
  bodyType: '',
  vehicleClass: '',
  segment: '',
  classificationConfidence: 'unknown',
  regions: ['United States'],
  license: 'U.S. government NHTSA vPIC manufacturer-reported data',
}));

if (output) {
  await writeFile(output, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
  console.log(`Wrote ${records.length} source records to ${output}. Review before importing.`);
}
if (apply) {
  await import('../config/environment.js');
  const { default: connectDB } = await import('../config/database.js');
  await connectDB();
  try {
    for (let index = 0; index < records.length; index += 500) {
      await upsertVehicleCatalogBatch(records.slice(index, index + 500));
      console.log(`Imported ${Math.min(index + 500, records.length)}/${records.length} vPIC model identities.`);
    }
    console.log(JSON.stringify(await vehicleCatalogCoverage(), null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
