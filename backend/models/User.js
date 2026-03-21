import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../utils/encryption.js';

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
      required: true,
    },
    role: {
      type: String,
      enum: ['customer', 'detailer', 'admin'],
      default: 'customer',
    },
    phone: String,
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
  },
  { timestamps: true }
);

// Hash password and Encrypt PII before saving
userSchema.pre('save', async function (next) {
  // Password hashing
  if (this.isModified('password')) {
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
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
