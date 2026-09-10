import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db();
  const orders = db.collection('orders');

  // Look for Ivan's most recent Acura ILX booking (matches screenshot: ref ASPF-260911-BFCDDCF3E3, plate 2NCR)
  const byRef = await orders.findOne({ bookingReference: /ASPF-260911-BFCDDCF3E3/i });
  if (byRef) {
    console.log('--- Found by bookingReference ---');
    console.log(JSON.stringify(pick(byRef), null, 2));
  } else {
    console.log('No exact bookingReference match; searching by plate/vehicle...');
    const candidates = await orders
      .find({ vehiclePlate: /2NCR/i })
      .sort({ updatedAt: -1 })
      .limit(5)
      .toArray();
    for (const c of candidates) {
      console.log('--- Candidate ---');
      console.log(JSON.stringify(pick(c), null, 2));
    }
  }

  await client.close();
}

function pick(o) {
  return {
    _id: o._id,
    bookingReference: o.bookingReference,
    status: o.status,
    serviceTrackingStage: o.serviceTrackingStage,
    serviceTrackingUpdatedAt: o.serviceTrackingUpdatedAt,
    paymentStatus: o.paymentStatus,
    customerStatus: o.customerStatus,
    readyForPickupEvidenceComplete: o.readyForPickupEvidenceComplete,
    readyForPaymentAt: o.readyForPaymentAt,
    vehiclePlate: o.vehiclePlate,
    vehicleMake: o.vehicleMake,
    vehicleModel: o.vehicleModel,
    totalPrice: o.totalPrice,
    totalAmount: o.totalAmount,
    downPaymentAmount: o.downPaymentAmount,
    finalPaymentAmount: o.finalPaymentAmount,
    updatedAt: o.updatedAt,
    createdAt: o.createdAt,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
