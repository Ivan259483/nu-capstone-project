import mongoose from 'mongoose';
import { config } from './config/environment.js';
import Service from './models/Service.js';

const seedServicesOnly = async () => {
    try {
        console.log('🌱 Starting service seed...');
        await mongoose.connect(config.mongodbUri);
        console.log('✅ Connected to MongoDB');

        const count = await Service.countDocuments();
        if (count > 0) {
            console.log(`ℹ️ Found ${count} existing services. Skipping seed to preserve data.`);
            await mongoose.disconnect();
            return;
        }

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
        console.log(`✅ Created ${createdServices.length} services.`);

        await mongoose.disconnect();
        console.log('👋 Disconnected');
        process.exit(0);

    } catch (error) {
        console.error('❌ SEED ERROR:', error);
        process.exit(1);
    }
};

seedServicesOnly();
