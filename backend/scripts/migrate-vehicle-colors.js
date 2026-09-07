import mongoose from 'mongoose';
import '../config/environment.js';
import connectDB from '../config/database.js';
import Vehicle from '../models/vehicle.model.js';
import { vehicleColorFields } from '../services/vehicleColorIntelligence.service.js';

const apply = process.argv.includes('--apply');
const batchSize = Math.min(Math.max(Number(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]) || 250, 1), 1000);

await connectDB();
let scanned = 0;
let changed = 0;
let after = null;

try {
  while (true) {
    const vehicles = await Vehicle.find(after ? { _id: { $gt: after } } : {}).sort({ _id: 1 }).limit(batchSize);
    if (!vehicles.length) break;
    for (const vehicle of vehicles) {
      const fields = await vehicleColorFields(vehicle.toObject());
      const before = JSON.stringify({
        color: vehicle.color,
        standardColor: vehicle.standardColor,
        factoryColorName: vehicle.factoryColorName,
        paintCode: vehicle.paintCode,
        finishType: vehicle.finishType,
        colorHex: vehicle.colorHex,
        colorSource: vehicle.colorSource,
        colorDatabaseId: vehicle.colorDatabaseId,
      });
      const next = JSON.stringify({
        color: fields.color,
        standardColor: fields.standardColor,
        factoryColorName: fields.factoryColorName,
        paintCode: fields.paintCode,
        finishType: fields.finishType,
        colorHex: fields.colorHex,
        colorSource: fields.colorSource,
        colorDatabaseId: fields.colorDatabaseId,
      });
      scanned += 1;
      if (before !== next) {
        changed += 1;
        if (apply) {
          Object.assign(vehicle, fields);
          await vehicle.save();
        }
      }
    }
    after = vehicles.at(-1)._id;
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', scanned, changed }, null, 2));
  if (!apply) console.log('Dry run only. Add --apply to persist normalized vehicle colors.');
} finally {
  await mongoose.disconnect();
}
