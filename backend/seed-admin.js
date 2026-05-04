// Quick seed script to create the admin user (admin@autospf.com).
// For admin@test.com + Firebase, use: node seed-super-admin.js (role: administrator).
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf';

async function seed() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Import User model
    const { default: User } = await import('./models/user.model.js');

    // Check if admin exists
    const existing = await User.findOne({ email: 'admin@autospf.com' });
    if (existing) {
        console.log('Admin already exists:', existing.email, existing.role);
        await mongoose.disconnect();
        return;
    }

    // Create admin user — password is auto-hashed by the model pre-save hook
    const admin = new User({
        name: 'Admin',
        email: 'admin@autospf.com',
        password: 'Admin@123',
        role: 'administrator',
        isVerified: true,
        isActive: true,
    });

    await admin.save();
    console.log('✅ Admin user created successfully!');
    console.log('   Email: admin@autospf.com');
    console.log('   Password: Admin@123');
    console.log('   Role: administrator');

    await mongoose.disconnect();
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
