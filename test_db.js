const mongoose = require('mongoose');
require('dotenv').config();
const Order = require('./backend/models/order.model.js').default; // doesn't matter, we can use raw mongo

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const orders = await db.collection('orders').find({ status: 'completed' }).limit(1).toArray();
  console.log(JSON.stringify(orders[0], null, 2));
  process.exit(0);
}
main().catch(console.error);
