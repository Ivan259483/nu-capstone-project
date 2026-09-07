import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import mongoose from 'mongoose';
import { normalizeCatalogRecord, upsertVehicleCatalogBatch, vehicleCatalogCoverage } from '../services/globalVehicleCatalog.service.js';

const valueOf = (name) => process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const file = valueOf('--file');
const apply = process.argv.includes('--apply');
const batchSize = Math.min(Math.max(Number(valueOf('--batch-size')) || 500, 1), 1000);
if (!file) throw new Error('Usage: node scripts/import-global-vehicle-catalog.js --file=catalog.ndjson [--apply] [--batch-size=500]');

async function* readRecords(path) {
  if (path.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('A .json catalog must contain an array. Use NDJSON for large files.');
    for (const record of parsed) yield record;
    return;
  }
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try { yield JSON.parse(line); }
    catch (error) { throw new Error(`Invalid JSON on line ${lineNumber}: ${error.message}`); }
  }
}

let count = 0;
let batch = [];
if (apply) {
  await import('../config/environment.js');
  const { default: connectDB } = await import('../config/database.js');
  await connectDB();
}
try {
  for await (const record of readRecords(file)) {
    normalizeCatalogRecord(record);
    count += 1;
    if (!apply) continue;
    batch.push(record);
    if (batch.length >= batchSize) {
      await upsertVehicleCatalogBatch(batch, { maxBatchSize: batchSize });
      batch = [];
      console.log(`Imported ${count} records.`);
    }
  }
  if (apply && batch.length) await upsertVehicleCatalogBatch(batch, { maxBatchSize: batchSize });
  console.log(`${apply ? 'Imported' : 'Validated'} ${count} vehicle model records.`);
  if (apply) console.log(JSON.stringify(await vehicleCatalogCoverage(), null, 2));
  else console.log('Dry run only. Add --apply to write to MongoDB.');
} finally {
  if (apply) await mongoose.disconnect();
}
