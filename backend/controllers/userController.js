import User from '../models/User.js';
import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import Vehicle from '../models/Vehicle.js';
import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import ActivityLog from '../models/ActivityLog.js';
import Payment from '../models/Payment.js';
import Store from '../models/Store.js';
import OTP from '../models/OTP.js';

/**
 * Get all users
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password');

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user
 */
export const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, avatar } = req.body;

    const updatePayload = {};
    if (typeof name !== 'undefined') updatePayload.name = name;
    if (typeof email !== 'undefined') updatePayload.email = email;
    if (typeof role !== 'undefined') updatePayload.role = role;
    if (typeof avatar !== 'undefined') updatePayload.avatar = avatar;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user and cascade-clean all related documents
 */
export const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Cascade-clean all related documents
    const userId = user._id;
    const userEmail = user.email;

    const cleanupLabels = [
      'Orders (customer)', 'Orders (assignedDetailer)', 'Customers',
      'Vehicles', 'ChatSessions', 'ChatMessages',
      'ActivityLogs', 'Payments', 'Stores (unset manager)', 'OTPs',
    ];

    const cleanup = await Promise.allSettled([
      Order.deleteMany({ customer: userId }),
      Order.updateMany({ assignedDetailer: userId }, { $unset: { assignedDetailer: '' } }),
      Customer.deleteMany({ user: userId }),
      Vehicle.deleteMany({ customer: userId }),
      ChatSession.deleteMany({ userId: userId }),
      ChatMessage.deleteMany({ userId: userId }),
      ActivityLog.deleteMany({ userId: userId }),
      Payment.deleteMany({ customer: userId }),
      Store.updateMany({ manager: userId }, { $unset: { manager: '' } }),
      OTP.deleteMany({ email: userEmail }),
    ]);

    const cleanupSummary = cleanup.map((result, i) => ({
      collection: cleanupLabels[i],
      status: result.status,
      affected: result.status === 'fulfilled'
        ? (result.value.deletedCount ?? result.value.modifiedCount ?? 0)
        : result.reason?.message,
    }));

    console.log(`🗑️ User ${userEmail} (${userId}) deleted. Cascade cleanup:`, cleanupSummary);

    res.json({
      success: true,
      message: 'User deleted successfully and all related data cleaned up',
    });
  } catch (error) {
    console.error('❌ Delete User Error:', error);
    next(error);
  }
};

/**
 * Create user (Admin only)
 */
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, avatar } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists',
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'customer',
      avatar,
      isVerified: true, // Admin created users are verified by default
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change Password
 * PATCH /api/users/change-password
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new passwords are required',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect current password',
      });
    }

    // Update to new password
    user.password = newPassword; // Will be hashed by pre-save hook
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    console.error('❌ Change Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};
