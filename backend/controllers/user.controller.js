import crypto from 'crypto';
import User from '../models/user.model.js';
import Order from '../models/order.model.js';
import Customer from '../models/customer.model.js';
import Vehicle from '../models/vehicle.model.js';
import ChatSession from '../models/chatSession.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import ActivityLog from '../models/activityLog.model.js';
import Payment from '../models/payment.model.js';
import mongoose from 'mongoose';
import Store from '../models/store.model.js';
import OTP from '../models/oTP.model.js';
import firebaseAdmin from '../config/firebaseAdmin.js';
import { logActivity } from '../utils/logActivity.utils.js';
import {
  canManageUserRole,
  getManageableUserRoles,
  getInvalidUserRoleMessage,
  isValidUserRole,
} from '../constants/roles.js';

const getQueryByIdOrFirebaseUid = (id) => {
  // If it's a 24-character hex string, assume it's a valid ObjectId
  const isObjectId = mongoose.Types.ObjectId.isValid(id) && (String(new mongoose.Types.ObjectId(id)) === String(id));
  return isObjectId ? { _id: id } : { firebaseUid: id };
};

const isSelfUser = (req, user) => Boolean(req.user?.id) && String(user?._id) === String(req.user.id);

const canViewUser = (req, user) => {
  if (isSelfUser(req, user)) return true;
  return canManageUserRole(req.user?.role, user.role);
};

/**
 * Get all users
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    if (req.query.email) {
      filter.email = { $regex: new RegExp(`^${req.query.email.trim()}$`, 'i') };
    }

    if (req.user?.role && !['administrator', 'office_admin'].includes(req.user.role)) {
      const readableRoles = req.user.role === 'sales'
        ? ['service_staff']
        : getManageableUserRoles(req.user.role);
      filter.role = { $in: readableRoles };
    }

    const users = await User.find(filter).select('-password');

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
    const query = getQueryByIdOrFirebaseUid(req.params.id);
    const user = await User.findOne({ ...query, isDeleted: { $ne: true } }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!canViewUser(req, user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
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
    const { name, email, role, avatar, phone, address } = req.body;
    const requestedId = req.params.id;
    const actorRole = req.user?.role;

    if (typeof role !== 'undefined' && !isValidUserRole(role)) {
      return res.status(400).json({
        success: false,
        message: getInvalidUserRoleMessage(),
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log("\n=== UPDATE USER DEBUG LOGS ===");
      console.log("1. Incoming request:");
      console.log("   - req.body:", req.body);
      console.log("   - req.user:", req.user);
      console.log("   - Requested ID (params):", requestedId);
      console.log("   - Email from payload:", email);
    }

    const updatePayload = {};
    if (typeof name !== 'undefined') updatePayload.name = name;
    if (typeof email !== 'undefined') updatePayload.email = email;
    if (typeof role !== 'undefined') updatePayload.role = role;
    if (typeof avatar !== 'undefined') updatePayload.avatar = avatar;
    if (typeof phone !== 'undefined') updatePayload.phone = phone;
    if (typeof address !== 'undefined') updatePayload.address = address;

    let user = null;

    // 2. Check if ID is a valid MongoDB ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(requestedId) && (String(new mongoose.Types.ObjectId(requestedId)) === String(requestedId));
    const isFirebaseUid = !isObjectId;

    if (isObjectId) {
      if (process.env.NODE_ENV === 'development') console.log(`2a. ID is ObjectId. Finding by _id: ${requestedId}`);
      user = await User.findById(requestedId);
      if (process.env.NODE_ENV === 'development') console.log(`    -> Result of find by _id:`, user ? 'FOUND' : 'NOT FOUND');
    } else {
      if (process.env.NODE_ENV === 'development') console.log(`2b. ID is string. Finding by firebaseUid: ${requestedId}`);
      user = await User.findOne({ firebaseUid: requestedId });
      if (process.env.NODE_ENV === 'development') console.log(`    -> Result of find by firebaseUid:`, user ? 'FOUND' : 'NOT FOUND');
    }

    const requestedRole = typeof role !== 'undefined' ? role : undefined;

    // 3. Fallback to Email if not found
    if (!user && email) {
      if (process.env.NODE_ENV === 'development') console.log(`2c. User not found by ID. Attempting fallback find by email: ${email}`);
      user = await User.findOne({ email });
      if (process.env.NODE_ENV === 'development') console.log(`    -> Result of find by email:`, user ? 'FOUND' : 'NOT FOUND');

      if (user && isFirebaseUid) {
        if (process.env.NODE_ENV === 'development') console.log(`3. User found by email! Linking Firebase UID.`);
        updatePayload.firebaseUid = requestedId;
      }
    }

    // 5. If no user is completely found, create one
    if (!user) {
      if (process.env.NODE_ENV === 'development') console.log(`5. User entirely missing from DB! Creating new user automatically.`);

      const selfProvisioning = String(requestedId) === String(req.user?.id);
      if (!selfProvisioning) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      const createRole = requestedRole || req.user?.role || 'customer';
      if (createRole !== req.user?.role) {
        return res.status(403).json({
          success: false,
          message: 'You cannot change your own role.',
        });
      }

      // Use cryptographically secure random bytes for the auto-provisioned fallback password
      const newUserData = {
         email: email || `unknown-${Date.now()}@example.com`,
         name: name || (email ? email.split('@')[0] : 'Unknown User'),
         password: crypto.randomBytes(16).toString('hex') + 'A1!',
         role: createRole,
         avatar: avatar,
         isVerified: true
      };

      if (isFirebaseUid) {
         newUserData.firebaseUid = requestedId;
      }

      user = await User.create(newUserData);

      // 6. Ensure API returns success
      return res.json({
        success: true,
        message: 'User created and updated successfully',
        data: user,
      });
    }

    const selfRequest = isSelfUser(req, user);
    if (!selfRequest && !canManageUserRole(actorRole, user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    if (selfRequest && typeof requestedRole !== 'undefined' && requestedRole !== user.role) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own role.',
      });
    }

    if (!selfRequest && typeof requestedRole !== 'undefined' && !canManageUserRole(actorRole, requestedRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Execute the actual update on the existing user
    if (process.env.NODE_ENV === 'development') console.log(`   -> Executing findByIdAndUpdate for _id:`, user._id);
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      updatePayload,
      { new: true }
    ).select('-password');

    // Detect role change
    if (typeof requestedRole !== 'undefined' && requestedRole !== user.role) {
      logActivity({
        req, type: 'role_changed', module: 'User', action: 'Role Changed',
        description: `${req.user?.name || 'Admin'} changed ${user.name || user.email}'s role from ${user.role} to ${requestedRole}.`,
        status: 'warning', referenceId: user._id?.toString(),
        metadata: { targetUserId: user._id, previousRole: user.role, newRole: requestedRole },
      });
    } else if (Object.keys(updatePayload).length > 0) {
      logActivity({
        req, type: 'user_edited', module: 'User', action: 'User Updated',
        description: `${req.user?.name || 'Admin'} updated profile for ${user.name || user.email}.`,
        status: 'success', referenceId: user._id?.toString(),
        metadata: { targetUserId: user._id, fields: Object.keys(updatePayload) },
      });
    }

    // 6. Ensure API returns success
    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error("❌ Update User Error:", error);
    next(error);
  }
};

/**
 * Delete user and cascade-clean all related documents
 */
export const deleteUser = async (req, res, next) => {
  try {
    const query = getQueryByIdOrFirebaseUid(req.params.id);
    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (isSelfUser(req, user)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }

    if (!canManageUserRole(req.user?.role, user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.isActive = false;
    user.expoPushTokens = [];
    await user.save();

    // Delete from Firebase Auth if admin is initialized
    if (firebaseAdmin) {
      try {
        if (user.firebaseUid) {
          await firebaseAdmin.auth().deleteUser(user.firebaseUid);
          console.log(`✅ Deleted user from Firebase Auth via UID: ${user.firebaseUid}`);
        } else if (userEmail) {
          // Fallback to email lookup if UID isn't available
          const fbUser = await firebaseAdmin.auth().getUserByEmail(userEmail);
          await firebaseAdmin.auth().deleteUser(fbUser.uid);
          console.log(`✅ Deleted user from Firebase Auth via Email: ${fbUser.uid}`);
        }
      } catch (fbError) {
        if (fbError.code !== 'auth/user-not-found') {
          console.error(`⚠️ Failed to delete user from Firebase Auth:`, fbError);
        } else {
          console.log(`ℹ️ User not found in Firebase Auth, skipping Firebase deletion.`);
        }
      }
    } else {
      console.warn(`⚠️ Firebase Admin not initialized, skipping Firebase Auth deletion for user ${userEmail}`);
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

    logActivity({
      req, type: 'user_deleted', module: 'User', action: 'User Deleted',
      description: `${req.user?.name || 'Admin'} deleted user ${user.name || user.email} (${user.role}).`,
      status: 'warning', referenceId: userId.toString(),
      metadata: { deletedUserId: userId, deletedEmail: userEmail, deletedRole: user.role },
    });

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
    const { name, email, password, role, avatar, firebaseUid } = req.body;
    const requestedRole = role || 'customer';

    if (typeof role !== 'undefined' && !isValidUserRole(role)) {
      return res.status(400).json({
        success: false,
        message: getInvalidUserRoleMessage(),
      });
    }

    if (!canManageUserRole(req.user?.role, requestedRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      // If previously soft-deleted, restore instead of rejecting
      if (userExists.isDeleted) {
        const bcrypt = await import('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const restored = await User.findByIdAndUpdate(
          userExists._id,
          {
            $set: {
              name,
              role: requestedRole,
              avatar: avatar || userExists.avatar,
              isDeleted: false,
              isActive: true,
              isVerified: true,
              loginAttempts: 0,
              lockUntil: null,
              deletedAt: null,
              password: hashedPassword,
              ...(firebaseUid ? { firebaseUid } : {}),
            }
          },
          { new: true }
        );

        logActivity({
          req, type: 'user_restored', module: 'User', action: 'User Restored',
          description: `${req.user?.name || 'Admin'} restored deleted ${requestedRole} account: ${name} (${email}).`,
          status: 'success', referenceId: restored._id.toString(),
          metadata: { restoredUserId: restored._id, restoredEmail: email, newRole: requestedRole },
        });

        return res.status(201).json({
          success: true,
          message: 'User account restored successfully',
          data: {
            id: restored._id,
            name: restored.name,
            email: restored.email,
            role: restored.role,
            avatar: restored.avatar,
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: 'User already exists',
      });
    }

    const payload = {
      name,
      email,
      password,
      role: requestedRole,
      avatar,
      isVerified: true, // Admin created users are verified by default
    };

    if (firebaseUid) {
      payload.firebaseUid = firebaseUid;
    }

    const user = await User.create(payload);

    logActivity({
      req, type: 'user_created', module: 'User', action: 'User Created',
      description: `${req.user?.name || 'Admin'} created new ${requestedRole} account: ${name} (${email}).`,
      status: 'success', referenceId: user._id.toString(),
      metadata: { newUserId: user._id, newUserEmail: email, newUserRole: requestedRole },
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

/**
 * Register an Expo Push Token for the logged-in user
 */
export const registerPushToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, message: 'Push token is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.expoPushTokens) {
      user.expoPushTokens = [];
    }

    if (!user.expoPushTokens.includes(token)) {
      user.expoPushTokens.push(token);
      await user.save();
    }

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('❌ Register Push Token Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
