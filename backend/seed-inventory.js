import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Supplier from './models/Supplier.js';

dotenv.config();

const seedInventory = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Supplier.deleteMany({});
    console.log('🗑️  Cleared existing inventory data');

    // Create Categories
    const categories = await Category.insertMany([
      { name: 'Cleaning Chemicals', slug: 'cleaning-chemicals', description: 'Car wash and detailing chemicals' },
      { name: 'Waxes & Polishes', slug: 'waxes-polishes', description: 'Waxes, polishes, and sealants' },
      { name: 'Tools & Equipment', slug: 'tools-equipment', description: 'Detailing tools and equipment' },
      { name: 'Accessories', slug: 'accessories', description: 'Microfiber towels, applicators, etc.' }
    ]);
    console.log('📦 Created categories');

    // Create Suppliers
    const suppliers = await Supplier.insertMany([
      {
        name: 'AutoCare Supplies Inc.',
        contactPerson: 'John Smith',
        email: 'john@autocare.com',
        phone: '+63 917 123 4567',
        address: '123 Industrial Ave, Manila',
        productsSupplied: []
      },
      {
        name: 'DetailPro Distributors',
        contactPerson: 'Maria Santos',
        email: 'maria@detailpro.com',
        phone: '+63 918 234 5678',
        address: '456 Commerce St, Quezon City',
        productsSupplied: []
      }
    ]);
    console.log('🏢 Created suppliers');

    // Create Products
    const products = await Product.insertMany([
      {
        name: 'Car Wash Shampoo',
        description: 'pH-balanced car wash shampoo',
        category: categories[0]._id,
        supplier: suppliers[0]._id,
        price: 450,
        inventory: 25,
        minLevel: 5,
        unit: 'bottles'
      },
      {
        name: 'Ceramic Coating',
        description: 'Professional grade ceramic coating',
        category: categories[1]._id,
        supplier: suppliers[1]._id,
        price: 3500,
        inventory: 8,
        minLevel: 3,
        unit: 'bottles'
      },
      {
        name: 'Microfiber Towels (Pack of 10)',
        description: 'Premium microfiber towels',
        category: categories[3]._id,
        supplier: suppliers[0]._id,
        price: 850,
        inventory: 15,
        minLevel: 5,
        unit: 'packs'
      },
      {
        name: 'Tire Shine',
        description: 'Long-lasting tire shine spray',
        category: categories[0]._id,
        supplier: suppliers[0]._id,
        price: 320,
        inventory: 30,
        minLevel: 10,
        unit: 'bottles'
      },
      {
        name: 'Glass Cleaner',
        description: 'Streak-free glass cleaner',
        category: categories[0]._id,
        supplier: suppliers[1]._id,
        price: 280,
        inventory: 20,
        minLevel: 8,
        unit: 'bottles'
      },
      {
        name: 'Leather Conditioner',
        description: 'Premium leather conditioner',
        category: categories[1]._id,
        supplier: suppliers[1]._id,
        price: 650,
        inventory: 12,
        minLevel: 4,
        unit: 'bottles'
      },
      {
        name: 'Foam Cannon',
        description: 'Professional foam cannon',
        category: categories[2]._id,
        supplier: suppliers[0]._id,
        price: 1200,
        inventory: 5,
        minLevel: 2,
        unit: 'units'
      },
      {
        name: 'Clay Bar Kit',
        description: 'Paint decontamination clay bar kit',
        category: categories[2]._id,
        supplier: suppliers[1]._id,
        price: 980,
        inventory: 10,
        minLevel: 3,
        unit: 'kits'
      },
      {
        name: 'Wheel Cleaner',
        description: 'Acid-free wheel cleaner',
        category: categories[0]._id,
        supplier: suppliers[0]._id,
        price: 420,
        inventory: 18,
        minLevel: 6,
        unit: 'bottles'
      },
      {
        name: 'Interior Detailer',
        description: 'All-purpose interior detailer',
        category: categories[0]._id,
        supplier: suppliers[1]._id,
        price: 380,
        inventory: 22,
        minLevel: 7,
        unit: 'bottles'
      }
    ]);

    console.log(`✨ Created ${products.length} products`);
    console.log('🎉 Inventory seeding completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding inventory:', error);
    process.exit(1);
  }
};

seedInventory();
