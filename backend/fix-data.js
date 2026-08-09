import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config/environment.js';

// Import models
import User from './models/user.model.js';
import Service from './models/service.model.js';
import Order from './models/order.model.js';

/**
 * Fix Data Script - Auto-populate Local Database
 * 
 * Creates:
 * - Sample services
 * - Sample customer accounts
 * - 3 dummy bookings
 * 
 * Usage: node fix-data.js
 */

const fixData = async () => {
  try {
    if (config.nodeEnv !== 'development' || process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
      console.error(
        'Refusing to modify seed data. This script requires NODE_ENV=development and ALLOW_DESTRUCTIVE_SEED=true.',
      );
      process.exitCode = 1;
      return;
    }

    console.log('🔧 Starting data fix...\n');
    console.log(
      'Administrator provisioning is excluded. Run `npm run bootstrap:administrator -- inspect` for the one-time workflow.\n',
    );

    // Connect to MongoDB
    console.log(`📡 Connecting to: ${config.mongodbUri}`);
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected\n');

    // ============================================
    // 1. CREATE SERVICES
    // ============================================
    console.log('\n🚗 Creating services...');
    
    const serviceData = [
      {
        name: 'Basic Wash',
        category: 'Exterior',
        duration: '30 minutes',
        basePrice: 200,
        status: 'Active',
      },
      {
        name: 'Premium Wash',
        category: 'Exterior',
        duration: '45 minutes',
        basePrice: 350,
        status: 'Active',
      },
      {
        name: 'Interior Detailing',
        category: 'Interior',
        duration: '60 minutes',
        basePrice: 500,
        status: 'Active',
      },
      {
        name: 'Full Service',
        category: 'Complete',
        duration: '90 minutes',
        basePrice: 800,
        status: 'Active',
      },
      {
        name: 'Engine Bay Cleaning',
        category: 'Engine',
        duration: '40 minutes',
        basePrice: 400,
        status: 'Active',
      },
    ];

    // Clear existing services
    await Service.deleteMany({});
    const services = await Service.insertMany(serviceData);
    console.log(`✅ Created ${services.length} services`);

    // ============================================
    // 2. CREATE CUSTOMER ACCOUNTS
    // ============================================
    console.log('\n👥 Creating customer accounts...');
    
    const salt = await bcrypt.genSalt(10);
    const customerPassword = await bcrypt.hash('Customer123', salt);
    
    const customerData = [
      {
        name: 'Juan Dela Cruz',
        email: 'juan@test.com',
        password: customerPassword,
        role: 'customer',
        phone: '+63 917 123 4567',
        address: 'Makati City, Metro Manila',
        isVerified: true,
        isActive: true,
        loginAttempts: 0,
      },
      {
        name: 'Maria Santos',
        email: 'maria@test.com',
        password: customerPassword,
        role: 'customer',
        phone: '+63 918 234 5678',
        address: 'Quezon City, Metro Manila',
        isVerified: true,
        isActive: true,
        loginAttempts: 0,
      },
      {
        name: 'Pedro Reyes',
        email: 'pedro@test.com',
        password: customerPassword,
        role: 'customer',
        phone: '+63 919 345 6789',
        address: 'Pasig City, Metro Manila',
        isVerified: true,
        isActive: true,
        loginAttempts: 0,
      },
    ];

    // Clear only customer accounts. Staff and Administrator accounts are never touched.
    await User.deleteMany({ role: 'customer' });
    const customers = await User.insertMany(customerData);
    console.log(`✅ Created ${customers.length} customers`);

    // ============================================
    // 3. CREATE DUMMY BOOKINGS
    // ============================================
    console.log('\n📅 Creating dummy bookings...');
    
    // Clear existing orders
    await Order.deleteMany({});
    
    const bookingData = [
      {
        orderNumber: 'ORD-001',
        customer: customers[0]._id,
        items: [],
        totalAmount: 800,
        status: 'completed',
        vehicleYear: '2020',
        vehicleMake: 'Toyota',
        vehicleModel: 'Vios',
        vehicleColor: 'White',
        vehiclePlate: 'ABC1234',
        bookingDate: '2026-02-03',
        bookingTime: '10:00 AM',
        notes: 'Full service wash and detailing',
      },
      {
        orderNumber: 'ORD-002',
        customer: customers[1]._id,
        items: [],
        totalAmount: 500,
        status: 'processing',
        vehicleYear: '2019',
        vehicleMake: 'Honda',
        vehicleModel: 'City',
        vehicleColor: 'Silver',
        vehiclePlate: 'XYZ5678',
        bookingDate: '2026-02-05',
        bookingTime: '2:00 PM',
        notes: 'Interior detailing only',
      },
      {
        orderNumber: 'ORD-003',
        customer: customers[2]._id,
        items: [],
        totalAmount: 350,
        status: 'pending',
        vehicleYear: '2021',
        vehicleMake: 'Mitsubishi',
        vehicleModel: 'Mirage',
        vehicleColor: 'Red',
        vehiclePlate: 'DEF9012',
        bookingDate: '2026-02-06',
        bookingTime: '11:00 AM',
        notes: 'Premium wash',
      },
    ];

    const bookings = await Order.insertMany(bookingData);
    console.log(`✅ Created ${bookings.length} bookings`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '═'.repeat(60));
    console.log('🎉 DATA FIX COMPLETED!');
    console.log('═'.repeat(60));
    console.log('\n📋 ACCOUNTS CREATED:\n');
    console.log('   Customers (all use password: Customer123):');
    customers.forEach(c => {
      console.log(`   - ${c.email} (${c.name})`);
    });
    console.log('\n📊 DATA SUMMARY:\n');
    console.log(`   Services: ${services.length}`);
    console.log(`   Customers: ${customers.length}`);
    console.log(`   Bookings: ${bookings.length}`);
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Your dashboard is now populated with data!');
    console.log('═'.repeat(60));
    console.log('');

    // Disconnect
    await mongoose.disconnect();
    console.log('👋 Disconnected\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nMake sure MongoDB is running:');
    console.error('  brew services start mongodb-community\n');
    process.exit(1);
  }
};

// Run fix
fixData();
