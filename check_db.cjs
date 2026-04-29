const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.8.2');
  try {
    await client.connect();
    const db = client.db('autospf');
    const orders = await db.collection('orders').find({ status: 'pending_confirmation' }).toArray();
    console.log(`Found ${orders.length} orders pending_confirmation`);
    for (const order of orders) {
      console.log(`Order ${order._id}:`);
      console.log(`  paymentProofUrl exists: ${!!order.paymentProofUrl}`);
      console.log(`  paymentProofUrl length: ${order.paymentProofUrl ? order.paymentProofUrl.length : 0}`);
      console.log(`  downpaymentProof exists: ${!!order.downpaymentProof}`);
      console.log(`  downpaymentProof length: ${order.downpaymentProof ? order.downpaymentProof.length : 0}`);
    }
  } finally {
    await client.close();
  }
}
run().catch(console.error);
