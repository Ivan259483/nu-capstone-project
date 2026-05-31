import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../utils/encryption.utils.js';
import { USER_ROLES, normalizeToCanonical } from '../constants/roles.js';

const stripSensitiveUserFields = (_doc, ret) => {
  delete ret.password;
  return ret;
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: false,
      default: undefined,
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'customer',
    },
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    address: String,
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    avatar: {
      type: String,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },
    loginAttempts: {
      type: Number,
      required: true,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    loyaltyPoints: {
      type: Number,
      default: 0,
    },
    loyaltyTier: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'Platinum'],
      default: 'Bronze',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending'],
      default: 'pending',
    },
    isFirstLogin: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    expoPushTokens: [
      {
        type: String,
      }
    ],
    /** Last client heartbeat / session ping — used for admin “presence” display */
    lastSeenAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: stripSensitiveUserFields },
    toObject: { transform: stripSensitiveUserFields },
  }
);

// Admin directory: filter by isDeleted + optional role $in — avoids full scans at scale
userSchema.index({ isDeleted: 1, role: 1 });

// Coerce deprecated role strings before enum validation (e.g. hr → office_admin).
userSchema.pre('validate', function (next) {
  if (this.role) {
    this.role = normalizeToCanonical(this.role);
  }
  next();
});

// Hash password and Encrypt PII before saving
userSchema.pre('save', async function (next) {
  // Auto-generate Referral Code for new users
  if (this.isNew && !this.referralCode) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const namePrefix = this.name ? this.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') : 'USR';
    this.referralCode = `${namePrefix}-${randomHex}`;
  }

  // Password hashing
  if (this.isModified('password') && this.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }

  // PII Encryption
  if (this.isModified('phone') && this.phone) {
    this.phone = encrypt(this.phone);
  }
  if (this.isModified('address') && this.address) {
    this.address = encrypt(this.address);
  }
  
  next();
});

// Decrypt PII after loading
userSchema.post('init', function (doc) {
  if (doc.phone) doc.phone = decrypt(doc.phone);
  if (doc.address) doc.address = decrypt(doc.address);
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    const hash = this.password;
    if (hash == null || typeof hash !== 'string' || hash.length < 10) return false;
    // bcrypt hashes start with $2a$, $2b$, or $2y$ — avoid bcrypt.compare throwing on garbage/legacy values
    if (!/^\$2[aby]\$\d{2}\$/.test(hash)) return false;
    return await bcrypt.compare(candidatePassword, hash);
  } catch (err) {
    console.error('[User.comparePassword] bcrypt error:', err?.message || err);
    return false;
  }
};

export default mongoose.model('User', userSchema);
