import mongoose from 'mongoose';
import { config } from './config/environment.js';
import Service from './models/service.model.js';

/**
 * Seed real AutoSPF+ SPF Graphene Ceramic Coating packages.
 * This replaces old placeholder services with the 4 real tiers.
 */
const seedSPFPackages = async () => {
    try {
        console.log('🌱 Starting SPF Package seed...');
        await mongoose.connect(config.mongodbUri);
        console.log('✅ Connected to MongoDB');

        // Remove old placeholder services
        const deleted = await Service.deleteMany({});
        console.log(`🗑️  Removed ${deleted.deletedCount} old service(s)`);

        console.log('🚗 Creating SPF Graphene Ceramic Coating packages...');
        const services = [
            {
                name: 'SPF 80 — Essential',
                category: 'Exterior',
                description: '3 Layers Graphene Ceramic Coating (Canada) with Graphene Sealant. 3 years protection.',
                duration: '2-3 hours',
                basePrice: 7499, // Hatchback starting price
                status: 'Active',
                isPublished: true,
            },
            {
                name: 'SPF 89 — Advanced',
                category: 'Exterior',
                description: '4 Layers Graphene Ceramic Coating (Canada) with free maintenance visit. 5 years protection.',
                duration: '3-4 hours',
                basePrice: 8999, // Hatchback starting price
                status: 'Active',
                isPublished: true,
            },
            {
                name: 'SPF 99 — Premium',
                category: 'Premium',
                description: '4 Layers SONAX Profiline CC EVO (Germany) with free recoat and maintenance. 10 years protection.',
                duration: '4-6 hours',
                basePrice: 13999, // Hatchback starting price
                status: 'Active',
                isPublished: true,
            },
            {
                name: 'SPF 101 — Flagship ALL-IN',
                category: 'Premium',
                description: 'PPF + SONAX CC EVO + Nano Ceramic Tint + Undercoating — the ultimate 10-year package.',
                duration: '6-8 hours',
                basePrice: 39999, // Hatchback starting price
                status: 'Active',
                isPublished: true,
            },
        ];

        const createdServices = await Service.insertMany(services);
        console.log(`✅ Created ${createdServices.length} SPF packages:`);
        createdServices.forEach((s) => {
            console.log(`   • ${s.name} — ₱${s.basePrice.toLocaleString()} (${s.category})`);
        });

        await mongoose.disconnect();
        console.log('👋 Disconnected. Seed complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ SEED ERROR:', error);
        process.exit(1);
    }
};

seedSPFPackages();
