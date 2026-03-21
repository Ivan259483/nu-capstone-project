import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  businessName: { type: String, default: 'AutoSPF+' },
  contactEmail: { type: String, default: 'admin@autospf.com' },
  phoneNumber: { type: String, default: '+1 (555) 000-0000' },
  address: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  currency: { type: String, enum: ['PHP', 'USD'], default: 'PHP' },
  membershipDiscount: { type: Number, default: 10 },
  serviceCapacity: { type: Number, default: 5 },
  inventoryThreshold: { type: Number, default: 5 },
  systemTheme: { type: String, enum: ['light', 'dark'], default: 'dark' },
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
  }
}, { timestamps: true });

export default mongoose.model('Setting', settingSchema);
