const { MongoClient } = require('mongodb');

async function run() {
  const uri = "mongodb+srv://ivantadena21_db_user:FpTBIER6Eqq4hlyr@cluster0.sctggqd.mongodb.net/autospf?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
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
      if (order.downpaymentProof && order.downpaymentProof.length > 0) {
          console.log(`  PREFIX: ${order.downpaymentProof.substring(0, 50)}`);
      }
    }
  } finally {
    await client.close();
  }
}
run().catch(console.error);
