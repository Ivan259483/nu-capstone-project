/**
 * Mock OTP Store - In-memory storage for testing
 * Replace with MongoDB when database is available
 */

const otpStore = new Map();

export const mockOtpStore = {
  /**
   * Save OTP to memory
   */
  save: (email, otp, expiryTime = 600000) => {
    const expiresAt = new Date(Date.now() + expiryTime);
    otpStore.set(email, {
      email,
      otp,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      verified: false,
      createdAt: new Date(),
    });
    
    console.log(`✅ OTP stored in memory for ${email}:`, {
      otp,
      expiresAt: expiresAt.toISOString(),
    });
    
    // Auto-delete after expiry
    setTimeout(() => {
      otpStore.delete(email);
      console.log(`🗑️  OTP expired for ${email}`);
    }, expiryTime);
  },

  /**
   * Find OTP record
   */
  findByEmail: (email) => {
    return otpStore.get(email);
  },

  /**
   * Update OTP record
   */
  update: (email, updates) => {
    const record = otpStore.get(email);
    if (record) {
      Object.assign(record, updates);
      otpStore.set(email, record);
      return record;
    }
    return null;
  },

  /**
   * Delete OTP record
   */
  deleteByEmail: (email) => {
    return otpStore.delete(email);
  },

  /**
   * Delete all OTP records (for email)
   */
  deleteAll: (email) => {
    otpStore.delete(email);
  },

  /**
   * Get all stored OTPs (for debugging)
   */
  getAll: () => {
    return Array.from(otpStore.values());
  },

  /**
   * Clear all (for testing)
   */
  clear: () => {
    otpStore.clear();
  },
};

export default mockOtpStore;
