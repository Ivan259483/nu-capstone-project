const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/autospf?directConnection=true');
  const db = mongoose.connection.db;
  const orders = await db.collection('orders').find({ status: 'pending_confirmation' }).toArray();
  console.log(`Found ${orders.length} orders pending_confirmation`);
  for (const order of orders) {
    console.log(`Order ${order._id}:`);
    console.log(`  paymentProofUrl exists: ${!!order.paymentProofUrl}`);
    console.log(`  paymentProofUrl length: ${order.paymentProofUrl ? order.paymentProofUrl.length : 0}`);
    console.log(`  downpaymentProof exists: ${!!order.downpaymentProof}`);
    console.log(`  downpaymentProof length: ${order.downpaymentProof ? order.downpaymentProof.length : 0}`);
  }
  await mongoose.disconnect();
}
run().catch(console.error);
