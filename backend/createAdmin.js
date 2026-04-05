import mongoose from 'mongoose';
import connectDB from './config/database.js';
import User from './models/user.model.js';

const run = async () => {
  await connectDB();
  const email = 'admin@autospf.com';
  let admin = await User.findOne({ email });
  if (!admin) {
    console.log('Admin not found in MongoDB. Creating...');
    admin = await User.create({ email, name: 'Admin Account', role: 'administrator', password: 'Password1!', isVerified: true });
    console.log('Admin created.');
  } else {
    console.log('Admin already exists in MongoDB:', admin.email, admin.role);
    if (admin.role !== 'administrator') {
       admin.role = 'administrator';
       await admin.save();
       console.log('Updated to administrator role');
    }
  }
  process.exit(0);
};

run().catch(console.error);
