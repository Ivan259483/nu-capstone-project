import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  businessName: { type: String, default: 'AutoSPF+' },
  businessRegistrationNo: { type: String, default: '' },
  taxId: { type: String, default: '' },
  country: { type: String, default: 'PH' },
  contactEmail: { type: String, default: 'autospf2023@gmail.com' },
  phoneNumber: { type: String, default: '0917 630 3116' },
  address: { type: String, default: 'Marcos Alvarez Ave., Las Piñas City' },
  logoUrl: { type: String, default: '' },
  currency: { type: String, default: 'PHP' },
  timezone: { type: String, default: 'Asia/Manila' },
  language: { type: String, default: 'en' },
  dateFormat: { type: String, default: 'MM/DD/YYYY' },
  timeFormat: { type: String, default: '12h' },
  taxRate: { type: Number, default: 0 },
  membershipDiscount: { type: Number, default: 10 },
  serviceCapacity: { type: Number, default: 5 },
  inventoryThreshold: { type: Number, default: 5 },
  auditLogRetention: { type: Number, default: 30 },
  systemTheme: { type: String, enum: ['light', 'dark'], default: 'dark' },
  twoFactorAuth: { type: Boolean, default: false },
  emailVerificationOnSignup: { type: Boolean, default: false },
  loginAttemptLimit: { type: Boolean, default: false },
  sessionTimeout: { type: String, default: '120' },
  emailAlerts: { type: Boolean, default: false },
  smsAlerts: { type: Boolean, default: false },
  operatingHours: {
    monday: { open: { type: String, default: '08:00' }, close: { type: String, default: '18:00' } },
    tuesday: { open: { type: String, default: '08:00' }, close: { type: String, default: '18:00' } },
    wednesday: { open: { type: String, default: '08:00' }, close: { type: String, default: '18:00' } },
    thursday: { open: { type: String, default: '08:00' }, close: { type: String, default: '18:00' } },
    friday: { open: { type: String, default: '08:00' }, close: { type: String, default: '18:00' } },
    saturday: { open: { type: String, default: '09:00' }, close: { type: String, default: '16:00' } },
    sunday: { open: { type: String, default: 'Closed' }, close: { type: String, default: 'Closed' } }
  },
  notifications: {
    emailNewBookings: { type: Boolean, default: true },
    lowStockAlerts: { type: Boolean, default: true },
    dailySummary: { type: Boolean, default: false },
    maintenanceAlerts: { type: Boolean, default: true }
  },
  landingDetails: {
    services: [
      {
        id: String,
        title: String,
        subtitle: String,
        desc: String,
        image: String,
        badge: String,
        badgeColor: String,
        features: [String],
        icon: String,
        glow: String,
        route: String
      }
    ],
    packages: [
      {
        id: String,
        tier: String,
        icon: String,
        tagline: String,
        focus: String,
        price: String,
        recommended: Boolean,
        borderClass: String,
        glowColor: String,
        badgeLabel: String,
        accentFrom: String,
        accentTo: String,
        features: [String],
        btnClass: String
      }
    ],
    stats: [
      {
        id: String,
        icon: String,
        value: String,
        label: String
      }
    ],
    gallery: [
      {
        id: String,
        url: String,
        caption: String,
        order: Number
      }
    ],
    team: [
      {
        id: String,
        name: String,
        role: String,
        photo: String,
        bio: String
      }
    ]
  }
}, { timestamps: true });

export default mongoose.model('Setting', settingSchema);
