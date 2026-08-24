import bcryptjs from 'bcryptjs';
import sharp from 'sharp';
import User from '../models/user.model.js';
import { encrypt, decrypt } from '../utils/encryption.utils.js';
import Order from '../models/order.model.js';
import Customer from '../models/customer.model.js';
import Vehicle from '../models/vehicle.model.js';
import ChatSession from '../models/chatSession.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import ChatConversation from '../models/chatConversation.model.js';
import ActivityLog from '../models/activityLog.model.js';
import Payment from '../models/payment.model.js';
import mongoose from 'mongoose';
import Store from '../models/store.model.js';
import OTP from '../models/oTP.model.js';
import StaffVerificationToken from '../models/staffVerificationToken.model.js';
import firebaseAdmin from '../config/firebaseAdmin.js';
import { logActivity } from '../utils/logActivity.utils.js';
import {
  canManageUserRole,
  getManageableUserRoles,
  getInvalidUserRoleMessage,
  isValidUserRole,
  normalizeToCanonical,
  requiresStaffTwoFactor,
} from '../constants/roles.js';
import { parseOptionalProfilePhone } from '../utils/phone.utils.js';
import { serializeUserForClient, resolvePhoneForClient, USER_PHONE_FIELDS } from '../utils/phone-client.utils.js';
import { uploadBufferToCloudinary } from '../utils/cloudinaryStorage.utils.js';
import { normalizeEmailForOtp } from '../utils/otp.utils.js';
import { issueStaffVerificationLink } from '../services/staffVerification.service.js';
import { deleteOrdersAndReleaseSlotCounters } from '../services/slot.service.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../services/adminNotification.service.js';
import { runInBackground } from '../utils/performance.utils.js';
import { Expo } from 'expo-server-sdk';

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

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const getIncomingPhoneValue = (body = {}) => {
  for (const field of USER_PHONE_FIELDS) {
    if (hasOwn(body, field)) return { provided: true, value: body[field] };
  }
  return { provided: false, value: undefined };
};

const notifyAdminUserEvent = async ({
  event,
  title,
  message,
  severity = 'info',
  targetUser,
  actor,
  actionRequired,
  metadata = {},
}) => {
  try {
    const targetUserId = targetUser?._id || targetUser?.id;
    return await createAdminNotification({
      title,
      message,
      category: 'security',
      event,
      severity,
      source: 'User Management',
      actionRequired: actionRequired ?? (severity === 'critical' || severity === 'warning'),
      groupingKey: buildAdminGroupingKey('security', event, targetUserId || 'user'),
      groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
      link: buildAdminDeepLink('users', targetUserId ? { userId: String(targetUserId) } : {}),
      action: { label: 'Review user' },
      metadata: {
        targetUserId,
        targetUserName: targetUser?.name,
        targetUserRole: targetUser?.role,
        actorUserId: actor?.id || actor?._id,
        actorName: actor?.name || actor?.email,
        ...metadata,
      },
    });
  } catch (error) {
    console.warn('[UserController] Admin notification failed:', error.message);
    return null;
  }
};

/**
 * PATCH /api/users/me/activity — session heartbeat for admin “presence” UI
 */
const ACTIVITY_WRITE_COOLDOWN_MS = 30_000;
const recentActivityWrites = new Map();

export const touchMyActivity = async (req, res, next) => {
  const userId = String(req.user.id);
  const now = Date.now();
  const lastQueuedAt = recentActivityWrites.get(userId) || 0;

  // Authentication has already confirmed the live account. Presence is
  // best-effort metadata, so acknowledge immediately and write out of band.
  res.json({ success: true });

  if (now - lastQueuedAt < ACTIVITY_WRITE_COOLDOWN_MS) return;
  recentActivityWrites.set(userId, now);
  runInBackground({ req, kind: 'db', name: 'users.activity.updateLastSeen' }, async () => {
    await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
    if (recentActivityWrites.size > 1_000) {
      const cutoff = Date.now() - ACTIVITY_WRITE_COOLDOWN_MS;
      for (const [key, timestamp] of recentActivityWrites) {
        if (timestamp < cutoff) recentActivityWrites.delete(key);
      }
    }
  });
};

/**
 * Get all users
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const filter = { isDeleted: false };
    if (req.query.email) {
      const normalizedEmail = String(req.query.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ success: false, message: 'Invalid email filter.' });
      }
      filter.email = normalizedEmail;
    }

    if (req.user?.role && !['administrator', 'office_admin'].includes(normalizeToCanonical(req.user.role))) {
      const readableRoles = req.user.role === 'sales'
        ? ['customer']
        : getManageableUserRoles(req.user.role);
      filter.role = { $in: readableRoles };
    }

    const users = await User.collection
      .find(filter, {
        projection: {
          password: 0,
          avatar: 0,
          photoURL: 0,
          profileImage: 0,
          profilePhoto: 0,
          image: 0,
          photo: 0,
          expoPushTokens: 0,
          pushTokens: 0,
          refreshTokens: 0,
        },
      })
      .toArray();

    // Ensure PII is decrypted/resolved in JSON (.lean() skips post-init hooks; decrypt here).
    const data = users.map((doc) => {
      const u = serializeUserForClient(doc);
      if (u.address) u.address = decrypt(u.address);
      return u;
    });

    const ids = data.map((u) => u._id).filter(Boolean);
    if (ids.length > 0) {
      const plateGroups = await Vehicle.aggregate([
        { $match: { customer: { $in: ids } } },
        { $group: { _id: '$customer', plates: { $push: '$plateNumber' } } },
      ]);
      const byCustomer = new Map(plateGroups.map((g) => [String(g._id), g.plates]));
      for (const u of data) {
        u.vehiclePlates = byCustomer.get(String(u._id)) || [];
      }
    } else {
      for (const u of data) {
        u.vehiclePlates = [];
      }
    }

    res.json({
      success: true,
      data,
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
      data: serializeUserForClient(user),
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
    const { name, email, role, avatar, address, status, isActive } = req.body;
    const incomingPhone = getIncomingPhoneValue(req.body);
    const requestedId = req.params.id;
    const actorRole = req.user?.role;

    if (typeof role !== 'undefined' && !isValidUserRole(role)) {
      return res.status(400).json({
        success: false,
        message: getInvalidUserRoleMessage(),
      });
    }

    if (typeof role !== 'undefined' && normalizeToCanonical(role) === 'administrator') {
      return res.status(400).json({
        success: false,
        message: 'The Administrator role cannot be assigned. Use OFFICE ADMIN for full oversight.',
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
    if (typeof role !== 'undefined') updatePayload.role = role;
    if (typeof avatar !== 'undefined') updatePayload.avatar = avatar;
    if (incomingPhone.provided) {
      const p = parseOptionalProfilePhone(incomingPhone.value);
      if (!p.ok) {
        return res.status(400).json({
          success: false,
          message: p.message || 'Invalid phone number.',
        });
      }
      if (p.phone) updatePayload.phone = p.phone;
    }
    if (typeof address !== 'undefined') updatePayload.address = address;
    if (typeof status !== 'undefined') updatePayload.status = status;
    if (typeof isActive !== 'undefined') updatePayload.isActive = isActive;

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

    // Authentication middleware guarantees a live MongoDB user. User updates
    // must never auto-provision or link identities from client-controlled IDs.
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const targetUserCanonical = normalizeToCanonical(user.role);
    const actorCanonical = normalizeToCanonical(actorRole);
    if (targetUserCanonical === 'administrator' && actorCanonical !== 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only the bootstrap Administrator can modify the Administrator account.',
      });
    }
    if (
      typeof role !== 'undefined'
      && targetUserCanonical === 'administrator'
      && normalizeToCanonical(role) !== 'administrator'
    ) {
      return res.status(400).json({
        success: false,
        message: 'The bootstrap Administrator role cannot be reassigned.',
      });
    }

    const selfRequest = isSelfUser(req, user);
    if (selfRequest && ['role', 'status', 'isActive', 'isDeleted', 'permissions', 'firebaseUid']
      .some((field) => hasOwn(req.body, field))) {
      return res.status(403).json({
        success: false,
        message: 'Protected account fields cannot be changed through profile updates.',
      });
    }
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

    const resultingRole = requestedRole || user.role;
    if (
      requiresStaffTwoFactor(resultingRole)
      && !user.isVerified
      && typeof status !== 'undefined'
      && status === 'active'
    ) {
      return res.status(409).json({
        success: false,
        code: 'ACCOUNT_PENDING_VERIFICATION',
        message: 'A pending staff account becomes active only after the user opens its verification link.',
      });
    }

    let staffEmailChangeRequired = false;
    if (typeof email !== 'undefined') {
      const normalizedEmail = normalizeEmailForOtp(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ success: false, message: 'Invalid email address.' });
      }

      const emailChanged = normalizedEmail !== normalizeEmailForOtp(user.email);
      if (emailChanged && requiresStaffTwoFactor(resultingRole) && selfRequest) {
        return res.status(403).json({
          success: false,
          message: 'Staff email changes require another authorized administrator and email re-verification.',
        });
      }

      if (emailChanged) {
        const duplicate = await User.exists({ email: normalizedEmail, _id: { $ne: user._id } });
        if (duplicate) {
          return res.status(409).json({ success: false, message: 'Email address is already in use.' });
        }
        updatePayload.email = normalizedEmail;
        if (requiresStaffTwoFactor(resultingRole)) {
          staffEmailChangeRequired = true;
          updatePayload.isVerified = false;
          updatePayload.status = 'pending';
        }
      }
    }

    const affectsStaffAccount = requiresStaffTwoFactor(user.role)
      || requiresStaffTwoFactor(resultingRole);
    const transitionsStaffToInactive = affectsStaffAccount
      && isActive === false
      && user.isActive !== false;
    const transitionsStaffToRestrictedStatus = affectsStaffAccount
      && typeof status !== 'undefined'
      && status !== user.status
      && ['pending', 'suspended'].includes(status);
    const revokeExistingStaffSessions = staffEmailChangeRequired
      || transitionsStaffToInactive
      || transitionsStaffToRestrictedStatus;

    const canonicalPhone = resolvePhoneForClient({ phone: user.phone });
    const resolvedExistingPhone = resolvePhoneForClient(user);
    if (!updatePayload.phone && !canonicalPhone && resolvedExistingPhone) {
      updatePayload.phone = resolvedExistingPhone;
    }

    // Manually encrypt PII fields before update (findByIdAndUpdate bypasses pre-save hooks)
    if (typeof updatePayload.phone !== 'undefined' && updatePayload.phone) {
      updatePayload.phone = encrypt(updatePayload.phone);
    }
    if (typeof updatePayload.address !== 'undefined' && updatePayload.address) {
      updatePayload.address = encrypt(updatePayload.address);
    }

    // Execute the actual update on the existing user
    if (process.env.NODE_ENV === 'development') console.log(`   -> Executing findByIdAndUpdate for _id:`, user._id);
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      revokeExistingStaffSessions
        ? { $set: updatePayload, $inc: { authVersion: 1 } }
        : updatePayload,
      { new: true }
    ).select('-password');

    // Decrypt PII fields in the returned doc (findByIdAndUpdate doesn't trigger post-init)
    if (updatedUser) {
      if (updatedUser.phone) updatedUser.phone = decrypt(updatedUser.phone);
      if (updatedUser.address) updatedUser.address = decrypt(updatedUser.address);
    }

    let verification = null;
    if (updatedUser && staffEmailChangeRequired) {
      await OTP.deleteMany({
        $or: [
          { userId: user._id },
          { email: normalizeEmailForOtp(user.email) },
          { email: normalizeEmailForOtp(updatedUser.email) },
        ],
      });
      try {
        const delivery = await issueStaffVerificationLink(updatedUser);
        verification = { required: true, emailSent: true, ...delivery };
      } catch (emailError) {
        verification = { required: true, emailSent: false };
        console.error('[updateUser] Staff email re-verification failed:', emailError?.message || emailError);
      }
    }

    // Detect role change
    if (typeof requestedRole !== 'undefined' && requestedRole !== user.role) {
      logActivity({
        req, type: 'role_changed', module: 'User', action: 'Role Changed',
        description: `${req.user?.name || 'Admin'} changed ${user.name || user.email}'s role from ${user.role} to ${requestedRole}.`,
        status: 'warning', referenceId: user._id?.toString(),
        metadata: { targetUserId: user._id, previousRole: user.role, newRole: requestedRole },
      });

      await notifyAdminUserEvent({
        event: 'permissions_changed',
        title: 'Permissions changed',
        message: `${req.user?.name || req.user?.email || 'An administrator'} changed ${user.name || user.email} from ${user.role} to ${requestedRole}.`,
        severity: 'warning',
        actionRequired: true,
        targetUser: updatedUser || user,
        actor: req.user,
        metadata: { previousRole: user.role, newRole: requestedRole },
      });

      // Real-time: notify the affected user so their dashboard switches automatically
      try {
        const io = (await import('../utils/socket.utils.js')).getIO();
        const targetUserId = user._id?.toString();
        const targetFirebaseUid = user.firebaseUid;
        const payload = {
          newRole: requestedRole,
          previousRole: user.role,
          user: updatedUser,
        };
        // Emit to both possible user room IDs (MongoDB _id and Firebase UID)
        if (targetUserId) io.to(`user:${targetUserId}`).emit('user:role_changed', payload);
        if (targetFirebaseUid && targetFirebaseUid !== targetUserId) {
          io.to(`user:${targetFirebaseUid}`).emit('user:role_changed', payload);
        }
        console.log(`📡 [UserController] Emitted user:role_changed to user ${targetUserId} (${user.email}): ${user.role} → ${requestedRole}`);
      } catch (socketErr) {
        console.warn('⚠️ [UserController] Could not emit role_changed socket event:', socketErr.message);
      }
    } else if (Object.keys(updatePayload).length > 0) {
      logActivity({
        req, type: 'user_edited', module: 'User', action: 'User Updated',
        description: `${req.user?.name || 'Admin'} updated profile for ${user.name || user.email}.`,
        status: 'success', referenceId: user._id?.toString(),
        metadata: { targetUserId: user._id, fields: Object.keys(updatePayload) },
      });
    }

    if (updatedUser && staffEmailChangeRequired) {
      await notifyAdminUserEvent({
        event: 'staff_email_changed',
        title: 'Staff email changed',
        message: `${req.user?.name || req.user?.email || 'An administrator'} changed the email for ${updatedUser.name || 'a staff account'}; re-verification is required.`,
        severity: 'warning',
        actionRequired: true,
        targetUser: updatedUser,
        actor: req.user,
        metadata: { previousEmail: user.email, newEmail: updatedUser.email, verificationEmailSent: verification?.emailSent ?? false },
      });
    }

    // 6. Ensure API returns success (decrypted phone for profile forms)
    res.json({
      success: true,
      message: staffEmailChangeRequired
        ? verification?.emailSent
          ? 'User updated. A verification email was sent to the new address.'
          : 'User updated, but the verification email could not be sent. Please resend it.'
        : 'User updated successfully',
      data: {
        ...serializeUserForClient(updatedUser),
        ...(verification ? { verification, twoFactorRequired: true } : {}),
      },
    });
  } catch (error) {
    console.error("❌ Update User Error:", error);
    next(error);
  }
};

/**
 * PATCH /api/users/profile — update own profile (same rules as PUT /users/:id for self)
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    if (req.file) {
      let metadata;
      try {
        metadata = await sharp(req.file.buffer).metadata();
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Upload a valid JPG or PNG image.',
        });
      }

      if (!['jpeg', 'png'].includes(metadata.format)) {
        return res.status(400).json({
          success: false,
          message: 'Upload a valid JPG or PNG image.',
        });
      }

      const extension = metadata.format === 'png' ? 'png' : 'jpg';
      const contentType = metadata.format === 'png' ? 'image/png' : 'image/jpeg';
      const avatarUrl = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'profile-photos',
        publicId: `user_${req.user.id}_${Date.now()}`,
        filename: `profile.${extension}`,
        contentType,
      });

      req.body.avatar = avatarUrl;
    }

    req.params.id = String(req.user.id);
    return updateUser(req, res, next);
  } catch (error) {
    console.error('Profile photo upload failed:', error);
    const message = error?.code === 'CLOUDINARY_NOT_CONFIGURED'
      ? 'Profile photo storage is unavailable. Please contact support.'
      : 'Profile photo upload failed. Please try again.';
    return res.status(502).json({ success: false, message });
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

    if (normalizeToCanonical(req.user?.role) !== 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Hard delete is restricted to the bootstrap administrator account. Use Archive instead.',
      });
    }

    const userId = user._id;
    const userEmail = user.email;

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
    const cleanupLabels = [
      'Orders (customer)', 'Orders (assignedDetailer)', 'Customers',
      'Vehicles', 'ChatConversations', 'ChatSessions', 'ChatMessages',
      'ActivityLogs', 'Payments', 'Stores (unset manager)', 'OTPs', 'Staff verification tokens',
    ];

    const cleanup = await Promise.allSettled([
      deleteOrdersAndReleaseSlotCounters({ customer: userId }),
      Order.updateMany({ assignedDetailer: userId }, { $unset: { assignedDetailer: '' } }),
      Customer.deleteMany({ user: userId }),
      Vehicle.deleteMany({ customer: userId }),
      ChatConversation.deleteMany({ userId: userId }),
      ChatSession.deleteMany({ userId: userId }),
      ChatMessage.deleteMany({ userId: userId }),
      ActivityLog.deleteMany({ userId: userId }),
      Payment.deleteMany({ customer: userId }),
      Store.updateMany({ manager: userId }, { $unset: { manager: '' } }),
      OTP.deleteMany({ email: userEmail }),
      StaffVerificationToken.deleteMany({ userId }),
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
 * Archive user — mark account as inactive/suspended without deleting data
 */
export const archiveUser = async (req, res, next) => {
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
        message: 'You cannot archive your own account',
      });
    }

    if (!canManageUserRole(req.user?.role, user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    if (normalizeToCanonical(user.role) === 'administrator' && normalizeToCanonical(req.user?.role) !== 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only the bootstrap administrator can archive the Administrator account.',
      });
    }

    // Only archive if not already archived/suspended
    if (!user.isActive && ['archived', 'suspended'].includes(user.status)) {
      return res.status(409).json({
        success: false,
        message: 'User is already archived',
      });
    }

    await User.findOneAndUpdate(
      { _id: user._id },
      {
        $set: {
          isActive: false,
          status: 'suspended',
          archivedAt: new Date(),
          expoPushTokens: [],
        },
        ...(requiresStaffTwoFactor(user.role) ? { $inc: { authVersion: 1 } } : {}),
      },
      { new: true, runValidators: true },
    );

    logActivity({
      req, type: 'user_archived', module: 'User', action: 'User Archived',
      description: `${req.user?.name || 'Admin'} archived user ${user.name || user.email} (${user.role}).`,
      status: 'warning', referenceId: user._id.toString(),
      metadata: { archivedUserId: user._id, archivedEmail: user.email, archivedRole: user.role },
    });

    res.json({
      success: true,
      message: 'User archived successfully. The account is now inactive.',
    });
  } catch (error) {
    console.error('❌ Archive User Error:', error);
    next(error);
  }
};

/**
 * Activate user — restore an archived/suspended account back to active
 */
export const activateUser = async (req, res, next) => {
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
        message: 'You cannot activate your own account',
      });
    }

    if (!canManageUserRole(req.user?.role, user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    if (normalizeToCanonical(user.role) === 'administrator' && normalizeToCanonical(req.user?.role) !== 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only the bootstrap administrator can restore the Administrator account.',
      });
    }

    if (user.isActive && user.status === 'active') {
      return res.status(409).json({
        success: false,
        message: 'User is already active',
      });
    }

    if (requiresStaffTwoFactor(user.role) && !user.isVerified) {
      const restoredUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          $set: { isActive: true, status: 'pending' },
          $unset: { archivedAt: 1 },
          $inc: { authVersion: 1 },
        },
        { new: true, runValidators: true },
      );

      let verification;
      try {
        const delivery = await issueStaffVerificationLink(restoredUser);
        verification = { required: true, emailSent: true, ...delivery };
      } catch (emailError) {
        verification = { required: true, emailSent: false };
        console.error('[activateUser] Staff verification email failed:', emailError?.message || emailError);
      }

      logActivity({
        req,
        type: 'user_activated',
        module: 'User',
        action: 'Staff Restored Pending Verification',
        description: `${req.user?.name || 'Admin'} restored ${user.name || user.email} pending email verification.`,
        status: 'info',
        referenceId: user._id.toString(),
        metadata: { activatedUserId: user._id, activatedEmail: user.email, activatedRole: user.role },
      });

      return res.json({
        success: true,
        message: verification.emailSent
          ? 'User restored pending verification. A verification link was sent.'
          : 'User restored pending verification, but the email could not be sent. Please resend it.',
        data: { status: 'pending', isVerified: false, verification },
      });
    }

    await User.findOneAndUpdate(
      { _id: user._id },
      {
        $set: { isActive: true, status: 'active' },
        $unset: { archivedAt: 1 },
        ...(requiresStaffTwoFactor(user.role) ? { $inc: { authVersion: 1 } } : {}),
      },
      { new: true, runValidators: true },
    );

    logActivity({
      req, type: 'user_activated', module: 'User', action: 'User Activated',
      description: `${req.user?.name || 'Admin'} reactivated user ${user.name || user.email} (${user.role}).`,
      status: 'success', referenceId: user._id.toString(),
      metadata: { activatedUserId: user._id, activatedEmail: user.email, activatedRole: user.role },
    });

    res.json({
      success: true,
      message: 'User activated successfully. The account is now active.',
    });
  } catch (error) {
    console.error('❌ Activate User Error:', error);
    next(error);
  }
};

/**
 * Create user (Admin only)
 */
const ADMIN_CREATE_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

function getAdminCreatePasswordErrors(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 8) errors.push('at least 8 characters');
  if (typeof password !== 'string' || !/[A-Z]/.test(password)) errors.push('one uppercase letter');
  if (typeof password !== 'string' || !/[a-z]/.test(password)) errors.push('one lowercase letter');
  if (typeof password !== 'string' || !/[0-9]/.test(password)) errors.push('one number');
  if (typeof password !== 'string' || !ADMIN_CREATE_PASSWORD_SPECIAL_RE.test(password)) {
    errors.push('one special character');
  }
  return errors;
}

export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, avatar, firebaseUid } = req.body;
    const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
    const normalizedEmail = normalizeEmailForOtp(email);
    const incomingPhone = getIncomingPhoneValue(req.body);
    const requestedRole = role || 'customer';
    const staffAccount = requiresStaffTwoFactor(requestedRole);

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return res.status(400).json({
        success: false,
        message: 'Name must be between 2 and 80 characters.',
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }
    if (
      typeof req.body.confirmPassword !== 'undefined'
      && password !== req.body.confirmPassword
    ) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

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

    if (normalizeToCanonical(requestedRole) === 'administrator') {
      return res.status(400).json({
        success: false,
        message: 'The Administrator role cannot be assigned. Use OFFICE ADMIN for full oversight.',
      });
    }

    let parsedPhone;
    if (incomingPhone.provided) {
      parsedPhone = parseOptionalProfilePhone(incomingPhone.value);
      if (!parsedPhone.ok) {
        return res.status(400).json({
          success: false,
          message: parsedPhone.message || 'Invalid phone number.',
        });
      }
    }

    const passwordErrors = getAdminCreatePasswordErrors(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Password must contain: ${passwordErrors.join(', ')}`,
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      // If previously soft-deleted, restore instead of rejecting
      if (userExists.isDeleted) {
        const salt = await bcryptjs.genSalt(10);
        const hashedPassword = await bcryptjs.hash(password, salt);

        const restored = await User.findByIdAndUpdate(
          userExists._id,
          {
            $set: {
              name: normalizedName,
              role: requestedRole,
              avatar: avatar || userExists.avatar,
              isDeleted: false,
              isActive: true,
              isVerified: !staffAccount,
              status: staffAccount ? 'pending' : 'active',
              loginAttempts: 0,
              lockUntil: null,
              deletedAt: null,
              password: hashedPassword,
              isFirstLogin: false,
              ...(parsedPhone?.phone ? { phone: encrypt(parsedPhone.phone) } : {}),
              ...(!staffAccount && firebaseUid ? { firebaseUid } : {}),
            }
          },
          { new: true }
        );

        logActivity({
          req, type: 'user_restored', module: 'User', action: 'User Restored',
          description: `${req.user?.name || 'Admin'} restored deleted ${requestedRole} account: ${normalizedName} (${normalizedEmail}).`,
          status: 'success', referenceId: restored._id.toString(),
          metadata: { restoredUserId: restored._id, restoredEmail: normalizedEmail, newRole: requestedRole },
        });

        let verification = null;
        if (staffAccount) {
          try {
            const delivery = await issueStaffVerificationLink(restored);
            verification = { required: true, emailSent: true, ...delivery };
          } catch (emailError) {
            verification = { required: true, emailSent: false };
            console.error('[createUser] Staff verification email failed:', emailError?.message || emailError);
          }
        }

        if (staffAccount) {
          await notifyAdminUserEvent({
            event: 'staff_account_restored',
            title: 'Staff account restored',
            message: `${req.user?.name || req.user?.email || 'An administrator'} restored ${restored.name} as ${restored.role}.`,
            severity: 'info',
            actionRequired: !restored.isVerified,
            targetUser: restored,
            actor: req.user,
            metadata: { verificationEmailSent: verification?.emailSent ?? null },
          });
        }

        return res.status(201).json({
          success: true,
          message: staffAccount
            ? verification?.emailSent
              ? 'User restored. A verification email was sent to the user.'
              : 'User restored, but the verification email could not be sent. Please resend it.'
            : 'User account restored successfully',
          data: {
            id: restored._id,
            name: restored.name,
            email: restored.email,
            role: restored.role,
            avatar: restored.avatar,
            phone: resolvePhoneForClient(restored),
            status: restored.status,
            isVerified: restored.isVerified,
            twoFactorRequired: staffAccount,
            verification,
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: 'User already exists',
      });
    }

    const payload = {
      name: normalizedName,
      email: normalizedEmail,
      password,
      role: requestedRole,
      avatar,
      isVerified: !staffAccount,
      isActive: true,
      status: staffAccount ? 'pending' : 'active',
      isFirstLogin: false, // Admin-created users already receive validated strong passwords.
    };

    if (!staffAccount && firebaseUid) {
      payload.firebaseUid = firebaseUid;
    }

    if (parsedPhone?.phone) {
      payload.phone = parsedPhone.phone;
    }

    const user = await User.create(payload);

    let verification = null;
    if (staffAccount) {
      try {
        const delivery = await issueStaffVerificationLink(user);
        verification = { required: true, emailSent: true, ...delivery };
      } catch (emailError) {
        verification = { required: true, emailSent: false };
        console.error('[createUser] Staff verification email failed:', emailError?.message || emailError);
      }
    }

    logActivity({
      req, type: 'user_created', module: 'User', action: 'User Created',
      description: `${req.user?.name || 'Admin'} created new ${requestedRole} account: ${normalizedName} (${normalizedEmail}).`,
      status: 'success', referenceId: user._id.toString(),
      metadata: {
        newUserId: user._id,
        newUserEmail: normalizedEmail,
        newUserRole: requestedRole,
        verificationEmailSent: verification?.emailSent ?? null,
      },
    });

    if (staffAccount) {
      await notifyAdminUserEvent({
        event: 'staff_account_created',
        title: 'New staff account added',
        message: `${req.user?.name || req.user?.email || 'An administrator'} added ${user.name} as ${user.role}.`,
        severity: 'info',
        actionRequired: !user.isVerified,
        targetUser: user,
        actor: req.user,
        metadata: { verificationEmailSent: verification?.emailSent ?? null },
      });
    }

    res.status(201).json({
      success: true,
      message: staffAccount
        ? verification?.emailSent
          ? 'User created. A verification email was sent to the user.'
          : 'User created, but the verification email could not be sent. Please resend it.'
        : 'User created successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        phone: resolvePhoneForClient(user),
        status: user.status,
        isVerified: user.isVerified,
        twoFactorRequired: staffAccount,
        verification,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend a pending staff account's verification email (staff managers only).
 */
export const resendStaffVerification = async (req, res, next) => {
  try {
    const query = getQueryByIdOrFirebaseUid(req.params.id);
    const user = await User.findOne(query);
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (!canManageUserRole(req.user?.role, user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!requiresStaffTwoFactor(user.role)) {
      return res.status(400).json({
        success: false,
        message: 'Verification resend is only available for staff accounts.',
      });
    }
    if (user.isVerified) {
      return res.status(409).json({ success: false, message: 'Account is already verified.' });
    }
    if (!user.isActive || user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'This account is disabled and cannot receive verification email.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    const delivery = await issueStaffVerificationLink(user, { enforceCooldown: true });
    logActivity({
      req,
      type: 'user_edited',
      module: 'User',
      action: 'Staff Verification Resent',
      description: `${req.user?.name || 'Admin'} resent account verification to ${user.email}.`,
      status: 'info',
      referenceId: user._id.toString(),
      metadata: { targetUserId: user._id, targetRole: user.role },
    });

    return res.json({
      success: true,
      message: 'Verification email sent.',
      data: delivery,
    });
  } catch (error) {
    if (error?.code === 'VERIFICATION_RESEND_COOLDOWN') {
      return res.status(429).json({
        success: false,
        message: error.message,
        data: { retryAfterSeconds: error.retryAfterSeconds },
      });
    }
    if (error?.code === 'VERIFICATION_EMAIL_FAILED') {
      return res.status(502).json({ success: false, message: error.message });
    }
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

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.',
      });
    }

    const passwordErrors = [];
    if (newPassword.length < 8) passwordErrors.push('at least 8 characters');
    if (!/[A-Z]/.test(newPassword)) passwordErrors.push('one uppercase letter');
    if (!/[a-z]/.test(newPassword)) passwordErrors.push('one lowercase letter');
    if (!/[0-9]/.test(newPassword)) passwordErrors.push('one number');
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword)) {
      passwordErrors.push('one special character');
    }
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Password must contain: ${passwordErrors.join(', ')}`,
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
    const token = String(req.body?.token || '').trim();
    
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ success: false, message: 'A valid Expo push token is required' });
    }

    // An Expo token identifies one app installation. Transfer it away from any
    // previous account before attaching it to the current authenticated user so
    // a shared device can never receive another customer's private alerts.
    await User.updateMany(
      { _id: { $ne: req.user.id }, expoPushTokens: token },
      { $pull: { expoPushTokens: token } }
    );
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { expoPushTokens: token } },
      { new: true }
    ).select('_id');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('❌ Register Push Token Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/** Remove one device token without affecting the customer's other devices. */
export const unregisterPushToken = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Push token is required' });
    }
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { expoPushTokens: token } }
    );
    return res.json({ success: true, message: 'Push token unregistered successfully' });
  } catch (error) {
    console.error('❌ Unregister Push Token Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
