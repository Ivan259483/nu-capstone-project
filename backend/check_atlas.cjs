require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('Missing MONGODB_URI');
  process.exit(1);
}

mongoose
  .connect(uri)
  .then(async () => {
    console.log('MongoDB connected');
    await mongoose.disconnect();
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });
