import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config/environment.js';

// Import models
import User from './models/User.js';
import Service from './models/Service.js';
import Order from './models/Order.js';

/**
 * Fix Data Script - Auto-populate Local Database
 * 
 * Creates:
 * - Admin account (admin@autospf.com)
 * - Sample services
 * - 3 dummy bookings
 * 
 * Usage: node fix-data.js
 */

const fixData = async () => {
  try {
    console.log('🔧 Starting data fix...\n');

    // Connect to MongoDB
    console.log(`📡 Connecting to: ${config.mongodbUri}`);
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected\n');

    // ============================================
    // 1. CREATE ADMIN ACCOUNT
    // ============================================
    console.log('👤 Creating admin account...');
    
    // Check if admin exists
    let admin = await User.findOne({ email: 'admin@autospf.com' });
    
    if (!admin) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Admin123', salt);
      
      admin = await User.create({
        name: 'Admin User',
        email: 'admin@autospf.com',
        password: hashedPassword,
        role: 'admin',
        isVerified: true,
        isActive: true,
        loginAttempts: 0,
      });
      console.log('✅ Admin created: admin@autospf.com / Admin123');
    } else {
      console.log('ℹ️  Admin already exists');
    }

    // ============================================
    // 2. CREATE SERVICES
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
    // 3. CREATE CUSTOMER ACCOUNTS
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

    // Clear existing customers (keep admin)
    await User.deleteMany({ role: 'customer' });
    const customers = await User.insertMany(customerData);
    console.log(`✅ Created ${customers.length} customers`);

    // ============================================
    // 4. CREATE DUMMY BOOKINGS
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
        vehiclePlate: 'ABC 1234',
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
        vehiclePlate: 'XYZ 5678',
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
        vehiclePlate: 'DEF 9012',
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
    console.log('   Admin:');
    console.log('   Email: admin@autospf.com');
    console.log('   Password: Admin123\n');
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
