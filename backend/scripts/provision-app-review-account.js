#!/usr/bin/env node
/**
 * One-time (idempotent) provisioning for the Apple App Store review account.
 *
 * Creates or updates exactly one Customer-role account —
 * APP_REVIEW_ACCOUNT_EMAIL (constants/appReview.exempt.js) — plus one
 * registered demo vehicle owned by it, so reviewers can sign in and exercise
 * the real Customer mobile app (vehicles, services, booking) without needing
 * a real inbox. It never touches any other account and never grants any
 * role above Customer.
 *
 * Run from the backend directory:
 *   node scripts/provision-app-review-account.js
 *
 * Requires in backend/.env (or the environment):
 *   MONGODB_URI               — same Atlas cluster the Render backend uses
 *   APP_REVIEW_ACCOUNT_PASSWORD — plaintext password to hash into the account
 *                                 (never read by the running server)
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { APP_REVIEW_ACCOUNT_EMAIL } = await import('../constants/appReview.exempt.js');
const { default: User } = await import('../models/user.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required. This script never falls back to another database.');
  process.exit(1);
}
const password = process.env.APP_REVIEW_ACCOUNT_PASSWORD;
if (!password || password.length < 12) {
  console.error('APP_REVIEW_ACCOUNT_PASSWORD is required (12+ chars). Set it in backend/.env before running.');
  process.exit(1);
}

const REVIEW_VEHICLE_PLATE = 'APLRVW01';

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log(`Connected to ${mongoose.connection.name}`);

  let user = await User.findOne({ email: APP_REVIEW_ACCOUNT_EMAIL });
  if (user) {
    if (user.role !== 'customer') {
      console.error(
        `Refusing to continue: ${APP_REVIEW_ACCOUNT_EMAIL} already exists with role "${user.role}", not customer.`
      );
      process.exit(1);
    }
    user.name = 'Apple Review';
    user.password = password; // pre('save') hashes this
    user.isVerified = true;
    user.isActive = true;
    user.isDeleted = false;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    console.log(`Updated existing reviewer account (id ${user._id}).`);
  } else {
    user = await User.create({
      name: 'Apple Review',
      email: APP_REVIEW_ACCOUNT_EMAIL,
      password,
      role: 'customer',
      isVerified: true,
      isActive: true,
    });
    console.log(`Created reviewer account (id ${user._id}).`);
  }

  const vehicleFields = {
    customer: user._id,
    year: '2022',
    make: 'Toyota',
    model: 'Vios',
    color: 'White',
    plateNumber: REVIEW_VEHICLE_PLATE,
    vehicleType: 'Sedan',
    // Fixed classification (not catalog-derived) so booking pricing resolves
    // deterministically for the reviewer without depending on the vehicle
    // catalog lookup. See services/vehicleIntelligence.service.js.
    pricingCategory: 'SEDAN',
    pricingCategorySource: 'admin_assigned',
    pricingCategoryNeedsReview: false,
    pricingCategoryReviewedAt: new Date(),
    pricingCategoryReviewedBy: user._id,
    transmission: 'Automatic',
    fuelType: 'Gasoline',
  };

  const vehicle = await Vehicle.findOneAndUpdate(
    { plateNumber: REVIEW_VEHICLE_PLATE },
    { $set: vehicleFields },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  console.log(`Reviewer demo vehicle ready (id ${vehicle._id}, plate ${vehicle.plateNumber}).`);

  console.log('\nDone. Credentials were not printed — read them from backend/.env / your secrets manager.');
} catch (error) {
  console.error('Provisioning failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
