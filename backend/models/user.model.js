import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../utils/encryption.utils.js';
import { USER_ROLES, normalizeToCanonical } from '../constants/roles.js';
import { operationalClassificationPlugin } from '../plugins/operationalClassification.plugin.js';

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
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
    },
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: false,
      trim: true,
    },
    contactNumber: {
      type: String,
      required: false,
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: false,
      trim: true,
    },
    contactNo: {
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
    // Legacy Cloudinary identifier retained for older records and unrelated
    // cleanup tooling. New customer profile photos use GridFS below.
    avatarPublicId: {
      type: String,
      select: false,
    },
    profilePhotoFileId: {
      type: mongoose.Schema.Types.ObjectId,
      select: false,
      index: true,
    },
    profilePhotoUpdatedAt: {
      type: Date,
    },
    avatarUrl: {
      type: String,
    },
    photoURL: {
      type: String,
    },
    profileImage: {
      type: String,
    },
    profilePhoto: {
      type: String,
    },
    image: {
      type: String,
    },
    photo: {
      type: String,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** Increment to revoke every previously issued staff JWT for this account. */
    authVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
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
    /** Durable proof that password authentication plus login OTP completed. */
    lastPasswordOtpSignInAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
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

  // A password mutation invalidates any earlier password-plus-OTP proof. The
  // handover workflow therefore requires a fresh OTP login for the credential
  // that is current at transfer time.
  if (this.isModified('password')) {
    this.lastPasswordOtpSignInAt = null;
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

function invalidatePasswordOtpEvidenceOnQueryUpdate(next) {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return next();
  const directPasswordMutation = Object.prototype.hasOwnProperty.call(update, 'password');
  const setPasswordMutation = Object.prototype.hasOwnProperty.call(update.$set || {}, 'password');
  const unsetPasswordMutation = Object.prototype.hasOwnProperty.call(update.$unset || {}, 'password');
  if (directPasswordMutation) {
    update.lastPasswordOtpSignInAt = null;
  } else if (setPasswordMutation || unsetPasswordMutation) {
    update.$set = { ...(update.$set || {}), lastPasswordOtpSignInAt: null };
  }
  next();
}

userSchema.pre('updateOne', invalidatePasswordOtpEvidenceOnQueryUpdate);
userSchema.pre('updateMany', invalidatePasswordOtpEvidenceOnQueryUpdate);
userSchema.pre('findOneAndUpdate', invalidatePasswordOtpEvidenceOnQueryUpdate);

// Decrypt PII after loading
userSchema.post('init', function (doc) {
  const hydrateDecryptedValue = (path, value) => {
    if (!value) return;
    doc.set(path, decrypt(value));
    doc.unmarkModified(path);
  };

  hydrateDecryptedValue('phone', doc.phone);
  hydrateDecryptedValue('address', doc.address);
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

userSchema.plugin(operationalClassificationPlugin, {
  resolveCollectionName: (user) => {
    const role = normalizeToCanonical(user.role);
    if (role === 'customer') return 'customers';
    if (['office_admin', 'sales', 'staff_quality_checker'].includes(role)) return 'staff';
    return null;
  },
  label: (user) => `${user.name || ''} ${user.email || ''} ${user.role || ''}`,
});

export default mongoose.model('User', userSchema);
