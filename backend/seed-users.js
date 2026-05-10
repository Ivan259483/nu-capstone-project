import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/user.model.js';
import connectDB from './config/database.js';

const seedUsers = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB for seeding');

    const demoUsers = [
      {
        name: 'System Admin',
        email: 'admin@autospf.com',
        password: 'Admin123!',
        role: 'administrator',
        isVerified: true,
        isActive: true,
      },
      {
        name: 'Mike Detailer',
        email: 'mike@detailshop.com',
        password: 'Detailer123!',
        role: 'staff_quality_checker',
        isVerified: true,
        isActive: true,
      },
      {
        name: 'John Customer',
        email: 'customer@test.com',
        password: 'Customer123!',
        role: 'customer',
        isVerified: true,
        isActive: true,
      },
    ];

    for (const userData of demoUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`⚠️ User already exists: ${userData.email}`);
        // Update password just in case user wants to reset it to demo default
        existingUser.password = userData.password;
        existingUser.role = userData.role;
        existingUser.isVerified = true;
        await existingUser.save();
        console.log(`✅ Updated existing user: ${userData.email}`);
      } else {
        await User.create(userData);
        console.log(`✅ Created new user: ${userData.email}`);
      }
    }

    console.log('✨ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedUsers();
