import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config/environment.js';

// Import models
import User from './models/User.js';
import Service from './models/Service.js';

/**
 * Seed Script for AutoSPF+ Local Database
 * 
 * Populates the local MongoDB with:
 * - Admin user (admin@test.com)
 * - Customer user (customer@test.com)
 * - 5 Car wash services
 * 
 * Usage: node seed.js
 */

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seed...\n');

    // Connect to MongoDB
    console.log(`📡 Connecting to MongoDB: ${config.mongodbUri}`);
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to MongoDB\n');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing users and services...');
    await User.deleteMany({});
    await Service.deleteMany({});
    console.log('✅ Cleared existing data\n');

    // ============================================
    // SEED USERS
    // ============================================
    console.log('👥 Creating users...');

    // Hash password manually (same as User model pre-save hook)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Password123', salt);

    const users = [
      {
        name: 'Admin User',
        email: 'admin@test.com',
        password: hashedPassword,
        role: 'admin',
        isVerified: true,
        isActive: true,
        loginAttempts: 0,
      },
      {
        name: 'Customer User',
        email: 'customer@test.com',
        password: hashedPassword,
        role: 'customer',
        phone: '+63 912 345 6789',
        address: 'Manila, Philippines',
        isVerified: true,
        isActive: true,
        loginAttempts: 0,
      },
    ];

    const createdUsers = await User.insertMany(users);
    console.log(`✅ Created ${createdUsers.length} users:`);
    createdUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });
    console.log('');

    // ============================================
    // SEED SERVICES
    // ============================================
    console.log('🚗 Creating car wash services...');

    const services = [
      {
        name: 'Body Wash',
        category: 'Exterior',
        duration: '30 minutes',
        basePrice: 300,
        status: 'Active',
      },
      {
        name: 'Interior Cleaning',
        category: 'Interior',
        duration: '45 minutes',
        basePrice: 250,
        status: 'Active',
      },
      {
        name: 'Wax & Polish',
        category: 'Exterior',
        duration: '60 minutes',
        basePrice: 500,
        status: 'Active',
      },
      {
        name: 'Engine Cleaning',
        category: 'Engine',
        duration: '40 minutes',
        basePrice: 400,
        status: 'Active',
      },
      {
        name: 'Full Detailing',
        category: 'Complete',
        duration: '2-3 hours',
        basePrice: 1200,
        status: 'Active',
      },
    ];

    const createdServices = await Service.insertMany(services);
    console.log(`✅ Created ${createdServices.length} services:`);
    createdServices.forEach(service => {
      console.log(`   - ${service.name} - ₱${service.basePrice} (${service.duration})`);
    });
    console.log('');

    // ============================================
    // SUMMARY
    // ============================================
    console.log('═'.repeat(60));
    console.log('🎉 DATABASE SEED COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(60));
    console.log('\n📋 DEMO ACCOUNTS:\n');
    console.log('   Admin Account:');
    console.log('   Email: admin@test.com');
    console.log('   Password: Password123');
    console.log('');
    console.log('   Customer Account:');
    console.log('   Email: customer@test.com');
    console.log('   Password: Password123');
    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ Your database is ready for offline presentation!');
    console.log('═'.repeat(60));
    console.log('');

    // Disconnect
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ SEED ERROR:', error);
    console.error('\nMake sure:');
    console.error('1. MongoDB is running: brew services start mongodb-community');
    console.error('2. .env file has: MONGODB_URI=mongodb://127.0.0.1:27017/autospf');
    console.error('');
    process.exit(1);
  }
};

// Run seed
seedDatabase();
