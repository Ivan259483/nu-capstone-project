import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, '..', '.env'), override: false });

const safeErrorMessage = (error) =>
  String(error?.message || 'unknown error')
    .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://[credentials-redacted]@');

async function createPerformanceIndexes() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
  const [
    { default: Order },
    { default: AIScan },
    { default: User },
    { default: OTP },
    { default: Notification },
    { default: NotificationUserState },
    { default: ActivityLog },
    { default: InvoiceRecord },
  ] = await Promise.all([
    import('../models/order.model.js'),
    import('../models/aiScan.model.js'),
    import('../models/user.model.js'),
    import('../models/oTP.model.js'),
    import('../models/notification.model.js'),
    import('../models/notificationUserState.model.js'),
    import('../models/activityLog.model.js'),
    import('../models/invoiceRecord.model.js'),
  ]);

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  try {
    const models = [
      Order,
      AIScan,
      User,
      OTP,
      Notification,
      NotificationUserState,
      ActivityLog,
      InvoiceRecord,
    ];
    await Promise.all(models.map((model) => model.createIndexes()));
    const indexesByModel = await Promise.all(models.map(async (model) => ({
      collection: model.collection.collectionName,
      indexes: (await model.collection.indexes()).map((index) => index.name),
    })));
    indexesByModel.forEach((summary) => console.log(JSON.stringify(summary)));
  } finally {
    await mongoose.disconnect();
  }
}

createPerformanceIndexes().catch((error) => {
  console.error(`[Performance indexes] Failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
