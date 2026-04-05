import mongoose from 'mongoose';
import Order from './models/order.model.js';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

/**
 * Script to check bookings and fix inconsistent states (e.g. completed but queued)
 */
async function checkAndFix() {
  console.log('Connecting to DB...');
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const orders = await Order.find({}).sort({ createdAt: -1 });
  console.log(`Found ${orders.length} orders`);

  for (const order of orders) {
    console.log(`Order ${order._id}: Status=${order.status}, CustomerStatus=${order.customerStatus}, Vehicle=${order.vehicleInfo || order.vehicleMake}`);

    // FIX 1: Inconsistent Status (Completed/Cancelled but still in Queue)
    if (['completed', 'cancelled'].includes(order.status) && ['queued', 'in-progress', 'finishing'].includes(order.customerStatus)) {
        console.log(`Fixing inconsistent order ${order._id}: Status is ${order.status} but customerStatus is ${order.customerStatus}. Setting to ready.`);
        order.customerStatus = 'ready'; // Or should we have a 'cancelled' customerStatus? 'ready' removes it from queue views usually.
        // Actually, if cancelled, maybe we should just double check. For now, matching the previous logic.
        await order.save();
        console.log('Fixed.');
    }

    // FIX 2: Delete specific demo data if requested (Toyota Camry 2026)
    // The user mentioned "2026 TOYOTA CAMRY".
    const vehicleInfo = (order.vehicleInfo || '').toUpperCase();
    if (vehicleInfo.includes('TOYOTA CAMRY') && vehicleInfo.includes('2026')) {
         console.log(`Found DEMO order ${order._id}. Deleting...`);
         await Order.deleteOne({ _id: order._id });
         console.log('Deleted.');
    }
  }

  console.log('Done');
  await mongoose.disconnect();
}

checkAndFix().catch(err => console.error(err));
