import mongoose from 'mongoose';
import { config } from './config/environment.js';
import Service from './models/service.model.js';
import {
    SPF_PACKAGE_PRICING,
    buildLegacyPrices,
    buildRichPricing,
    getMinimumPackageBasePrice,
} from './constants/spfPricing.js';

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
        const services = Object.values(SPF_PACKAGE_PRICING).map((pkg) => ({
            name: pkg.name,
            category: pkg.category,
            description: pkg.description,
            duration: pkg.duration,
            basePrice: getMinimumPackageBasePrice(pkg),
            prices: buildLegacyPrices(pkg),
            pricing: buildRichPricing(pkg),
            billingGroup: 'ceramic_spf',
            displayOrder: pkg.displayOrder,
            status: 'Active',
            isPublished: true,
        }));

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
