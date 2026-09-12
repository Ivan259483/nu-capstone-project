import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import {
  handleSocketMessage,
  handleSocketStreamingMessage,
} from '../controllers/chatbot.controller.js';
import {
  isBookingManagerRole,
  isPosManagerRole,
  isSettingsManagerRole,
  migrateLegacyUserRole,
  requiresStaffTwoFactor,
  isCustomerRole,
  STAFF_2FA_AUTH_LEVEL,
} from '../constants/roles.js';
import User from '../models/user.model.js';
import { decrypt, looksLikeEncryptedValue } from './encryption.utils.js';
import {
  authVersionMatches,
  globalSessionEpochMatches,
} from './authVersion.utils.js';
import { isConfiguredCorsOriginAllowed } from './origin.utils.js';
import { buildCustomerStagePayload } from './customerTrackerStage.utils.js';
import {
  getSystemState,
  isProtectedAdministrator,
} from '../services/systemState.service.js';
import {
  assertRegistrationEnabled,
  runTrackedSystemMutation,
} from '../middleware/systemLifecycle.middleware.js';

/**
 * Change streams return raw BSON — Mongoose decrypt middleware does not run.
 * Mirror order.controller formatBookingDto safeDecrypt so Sales / dashboards see real plates.
 */
function safeDecryptOrderField(val) {
  if (!val || typeof val !== 'string') return val;
  if (looksLikeEncryptedValue(val)) {
    try {
      return decrypt(val);
    } catch {
      return null;
    }
  }
  return val;
}

function prepareOrderDocumentForSocket(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const vehicleInfo = [doc.vehicleYear, doc.vehicleMake, doc.vehicleModel]
    .filter(Boolean)
    .join(' ')
    .trim();
  const serviceName = doc.serviceName || doc.serviceType || 'Service';
  const id = doc._id?.toString?.() || doc.id;
  const customerId =
    doc.customer?._id?.toString?.() ||
    doc.customer?.toString?.() ||
    doc.customer ||
    '';

  return {
    _id: doc._id,
    id,
    orderNumber: doc.orderNumber,
    bookingReference: doc.bookingReference || doc.orderNumber,
    customer: doc.customer,
    customerId,
    customerName: doc.customerName || '',
    customerPhone: doc.customerPhone || '',
    serviceId: doc.serviceId,
    serviceType: doc.serviceType,
    serviceName,
    items: Array.isArray(doc.items)
      ? doc.items.map((item) => ({
          quantity: item.quantity,
          price: item.price,
        }))
      : [],
    totalAmount: doc.totalAmount,
    totalPrice: doc.totalPrice,
    downPaymentAmount: doc.downPaymentAmount,
    finalPaymentAmount: doc.finalPaymentAmount,
    invoiceId: doc.invoiceId,
    paymentStatus: doc.paymentStatus,
    paymentMethod: doc.paymentMethod,
    paymentProvider: doc.paymentProvider,
    paidAt: doc.paidAt,
    approvedAt: doc.approvedAt,
    rejectedAt: doc.rejectedAt,
    rejectionReason: doc.rejectionReason,
    status: doc.status,
    customerStatus: doc.customerStatus,
    customerStatusUpdatedAt: doc.customerStatusUpdatedAt,
    archived: doc.archived,
    archivedAt: doc.archivedAt,
    archivedReason: doc.archivedReason,
    vehicleYear: doc.vehicleYear,
    vehicleMake: doc.vehicleMake,
    vehicleModel: doc.vehicleModel,
    vehicleColor: doc.vehicleColor,
    vehiclePlate: safeDecryptOrderField(doc.vehiclePlate),
    notes: safeDecryptOrderField(doc.notes),
    vehicleInfo,
    bookingDate: doc.bookingDate,
    bookingTime: doc.bookingTime,
    date: doc.bookingDate || '',
    time: doc.bookingTime || '',
    assignedDetailer: doc.assignedDetailer,
    serviceTrackingStage: doc.serviceTrackingStage || null,
    serviceTrackingUpdatedAt: doc.serviceTrackingUpdatedAt || null,
    serviceTrackingUpdatedBy: doc.serviceTrackingUpdatedBy || null,
    // Canonical customer stage travels with every realtime row so customer clients patch the
    // tracker directly instead of inferring Quality Check from `status: in_progress`.
    ...buildCustomerStagePayload(doc),
    serviceStaffAssignments: Array.isArray(doc.serviceStaffAssignments)
      ? doc.serviceStaffAssignments
      : [],
    hasPaymentProof: Boolean(
      doc.paymentProofUrl ||
        doc.downpaymentProof ||
        doc.status === 'pending_confirmation',
    ),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

let io;

// ── Collections the frontend actually watches ────────────────────────
const WATCHED_COLLECTIONS = new Set([
  'orders',
  'payments',
  'invoicerecords',
  'products',
  'services',
  'shopavailabilities',
  'scheduledclosures',
  'chatconversations',
  'chatmessages',
  // Internal-only security streams. These are never forwarded to clients.
  'users',
  'systemstates',
]);

// ── Debounce/batch rapid successive changes (200 ms window) ─────────
const BATCH_INTERVAL_MS = 200;
const REALTIME_STAFF_ROOM = 'realtime:staff';
const REALTIME_LIMITED_ROOM = 'realtime:limited';
let batchBuffer = [];
let batchTimer = null;

export const isSocketOriginAllowed = isConfiguredCorsOriginAllowed;

export const getLimitedDbChangePayload = (payload = {}) => ({
  collection: payload.collection,
  operationType: payload.operationType,
});

export const isSocketRoomAuthorized = (socketUser, room) => {
  if (typeof room !== 'string' || room.length > 200) return false;
  if (/^chat:[A-Za-z0-9_-]{8,180}$/.test(room)) return true;
  if (!socketUser?.id) return false;

  if (room === `user:${socketUser.id}`) return true;
  if (room === 'admin:chat') return isSettingsManagerRole(socketUser.role);
  const roleRoom = /^role:([a-z][a-z0-9_]{1,79})$/.exec(room);
  if (roleRoom) return roleRoom[1] === migrateLegacyUserRole(socketUser.role);
  if (room === 'booking:approvals') {
    return (
      isBookingManagerRole(socketUser.role) || isPosManagerRole(socketUser.role)
    );
  }
  if (room === `staff:${socketUser.id}`)
    return requiresStaffTwoFactor(socketUser.role);
  return false;
};

const flushBatch = () => {
  if (!io || batchBuffer.length === 0) return;
  // Deduplicate by collection+docId — keep the latest change per doc
  const deduped = new Map();
  for (const item of batchBuffer) {
    const key = `${item.collection}:${item.documentKey?._id || ''}`;
    deduped.set(key, item);
  }
  for (const payload of deduped.values()) {
    // Full change-stream documents can contain customer, payment, vehicle, and
    // internal workflow data. Only fully authenticated staff sessions receive
    // them. Customers and anonymous chat clients receive a content-free cache
    // invalidation signal and must refetch through the authorized HTTP API.
    io.to(REALTIME_STAFF_ROOM).emit('db_change', payload);
    io.to(REALTIME_LIMITED_ROOM).emit(
      'db_change',
      getLimitedDbChangePayload(payload),
    );
  }
  batchBuffer = [];
  batchTimer = null;
};

const enqueueChange = (payload) => {
  batchBuffer.push(payload);
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
  }
};

export const initSocket = (httpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    },
    // WebSocket upgrades are not protected by browser CORS enforcement. Reject
    // unauthorized browser origins at the Engine.IO handshake itself.
    allowRequest: (req, callback) => {
      callback(null, isSocketOriginAllowed(req.headers.origin));
    },
  });

  io.use(async (socket, next) => {
    const authHeader = socket.handshake.headers?.authorization;
    const tokenFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
    // Bearer tokens are accepted only through the Socket.IO auth payload or
    // Authorization header. Query-string tokens leak into proxy/access logs.
    const token = socket.handshake.auth?.token || tokenFromHeader;

    let systemState;
    try {
      systemState = await getSystemState();
    } catch (error) {
      console.error('[SOCKET_AUTH] System state unavailable:', error.message);
      return next(new Error('SYSTEM_STATE_UNAVAILABLE'));
    }
    socket.systemState = systemState;

    if (!token) {
      if (systemState.mode === 'archived') {
        return next(new Error('SYSTEM_ARCHIVED'));
      }
      // Anonymous chat connections remain supported, but receive no user/staff rooms.
      return next();
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (!decoded?.id) return next(new Error('Unauthorized socket'));

      const user = await User.findById(decoded.id)
        .select(
          'email name role isActive isDeleted isVerified lockUntil authVersion',
        )
        .lean();
      if (
        !user ||
        user.isDeleted ||
        !user.isActive ||
        (user.lockUntil && user.lockUntil > new Date())
      ) {
        return next(new Error('Unauthorized socket'));
      }

      const liveRole = migrateLegacyUserRole(user.role);
      if (
        requiresStaffTwoFactor(liveRole) &&
        (!user.isVerified ||
          decoded.authLevel !== STAFF_2FA_AUTH_LEVEL)
      ) {
        return next(new Error('Staff two-factor authentication required'));
      }
      if (!authVersionMatches(decoded.authVersion, user.authVersion)) {
        return next(new Error('SESSION_REVOKED'));
      }
      if (!globalSessionEpochMatches(decoded.globalSessionEpoch, systemState.globalSessionEpoch)) {
        return next(new Error('GLOBAL_SESSION_REVOKED'));
      }
      if (
        systemState.mode === 'archived'
        && !await isProtectedAdministrator(user, systemState)
      ) {
        return next(new Error('SYSTEM_ARCHIVED'));
      }
      if (
        isCustomerRole(liveRole) &&
        (!user.isVerified ||
          !(
            decoded.otpVerified === true ||
            decoded.federatedVerified === true ||
            decoded.emailLinkVerified === true
          ))
      ) {
        return next(new Error('Customer email verification required'));
      }

      socket.user = {
        ...decoded,
        email: user.email,
        name: user.name,
        role: liveRole,
      };
      return next();
    } catch (error) {
      console.warn('[SOCKET_AUTH] Invalid token:', error.message);
      return next(new Error('Unauthorized socket'));
    }
  });

  io.on('connection', (socket) => {
    if (requiresStaffTwoFactor(socket.user?.role)) {
      socket.join(REALTIME_STAFF_ROOM);
    } else {
      socket.join(REALTIME_LIMITED_ROOM);
    }

    const sessionId =
      socket.handshake.auth?.sessionId || socket.handshake.query?.sessionId;
    if (
      typeof sessionId === 'string' &&
      /^[A-Za-z0-9_-]{8,180}$/.test(sessionId)
    ) {
      socket.join(`chat:${sessionId}`);
    }
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
      socket.join(`role:${migrateLegacyUserRole(socket.user.role)}`);
    }
    if (isSettingsManagerRole(socket.user?.role)) {
      socket.join('admin:chat');
    }
    if (
      isBookingManagerRole(socket.user?.role) ||
      isPosManagerRole(socket.user?.role)
    ) {
      socket.join('booking:approvals');
    }

    // Room names are client-controlled. Authorize each supported room so an
    // anonymous or pre-2FA socket cannot subscribe to staff/customer events.
    socket.on('join_room', (room) => {
      if (isSocketRoomAuthorized(socket.user, room)) socket.join(room);
    });

    socket.on('chat:message', async (payload) => {
      try {
        await runTrackedSystemMutation(async (state) => {
          if (!socket.user) await assertRegistrationEnabled(state);
          await handleSocketMessage(io, socket, payload);
        }, { throwOnBlocked: true });
      } catch (error) {
        socket.emit('system:error', {
          code: error.code || 'SYSTEM_MUTATION_BLOCKED',
          message: error.message || 'This action is temporarily unavailable.',
        });
      }
    });

    socket.on('chat:message:stream', async (payload) => {
      try {
        await runTrackedSystemMutation(async (state) => {
          if (!socket.user) await assertRegistrationEnabled(state);
          await handleSocketStreamingMessage(io, socket, payload);
        }, { throwOnBlocked: true });
      } catch (error) {
        socket.emit('system:error', {
          code: error.code || 'SYSTEM_MUTATION_BLOCKED',
          message: error.message || 'This action is temporarily unavailable.',
        });
      }
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const disconnectUserSockets = (userIds, code = 'SESSION_REVOKED') => {
  if (!io) return 0;
  const ids = new Set((Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .map(String));
  let disconnected = 0;
  for (const socket of io.sockets.sockets.values()) {
    if (!socket.user?.id || !ids.has(String(socket.user.id))) continue;
    socket.emit('session:revoked', { code });
    socket.disconnect(true);
    disconnected += 1;
  }
  return disconnected;
};

export const disconnectAllAuthenticatedSockets = (code = 'GLOBAL_SESSION_REVOKED') => {
  if (!io) return 0;
  let disconnected = 0;
  for (const socket of io.sockets.sockets.values()) {
    if (!socket.user?.id) continue;
    socket.emit('session:revoked', { code });
    socket.disconnect(true);
    disconnected += 1;
  }
  return disconnected;
};

export const initChangeStreams = (mongooseConnection) => {
  if (!io) return;
  console.log('[SOCKET] Initializing MongoDB Change Streams...');
  console.log(
    '[SOCKET] Watching collections:',
    [...WATCHED_COLLECTIONS].join(', '),
  );
  try {
    const changeStream = mongooseConnection.watch([], {
      fullDocument: 'updateLookup',
    });
    changeStream.on('change', (change) => {
      const collectionName = change.ns ? change.ns.coll : '';

      // Only emit changes for collections the frontends care about
      if (!WATCHED_COLLECTIONS.has(collectionName)) return;

      if (collectionName === 'users') {
        const userId = change.documentKey?._id?.toString?.();
        if (!userId) return;
        const liveUser = change.fullDocument;
        for (const socket of io.sockets.sockets.values()) {
          if (String(socket.user?.id || '') !== userId) continue;
          const sessionStillValid = Boolean(
            liveUser
            && !liveUser.isDeleted
            && liveUser.isActive
            && authVersionMatches(socket.user.authVersion, liveUser.authVersion)
          );
          if (sessionStillValid) continue;
          socket.emit('session:revoked', { code: 'SESSION_REVOKED' });
          socket.disconnect(true);
        }
        return;
      }

      if (collectionName === 'systemstates') {
        const state = change.fullDocument;
        if (!state) return;
        const protectedId = String(state.protectedAdministratorId || '');
        for (const socket of io.sockets.sockets.values()) {
          const authenticated = Boolean(socket.user?.id);
          const epochValid = !authenticated || globalSessionEpochMatches(
            socket.user.globalSessionEpoch,
            state.globalSessionEpoch,
          );
          const archiveAccessValid = state.mode !== 'archived'
            || (authenticated && String(socket.user.id) === protectedId);
          if (!epochValid || !archiveAccessValid) {
            socket.emit('session:revoked', {
              code: !epochValid ? 'GLOBAL_SESSION_REVOKED' : 'SYSTEM_ARCHIVED',
            });
            socket.disconnect(true);
            continue;
          }
          socket.systemState = state;
          socket.emit('system:state', {
            mode: state.mode,
            registrationEnabled: Boolean(state.registrationEnabled),
            bookingsEnabled: Boolean(state.bookingsEnabled),
            operationalDataEpoch: Number(state.operationalDataEpoch || 0),
          });
        }
        return;
      }

      const rawDoc = change.fullDocument || null;
      const fullDocument =
        collectionName === 'orders' && rawDoc
          ? prepareOrderDocumentForSocket(rawDoc)
          : rawDoc;

      const payload = {
        collection: collectionName,
        operationType: change.operationType,
        documentKey: change.documentKey,
        // Include the full document so clients can update state
        // without a follow-up HTTP fetch (only for insert/update)
        fullDocument,
      };

      // Batch rapid successive changes (e.g. bulk import, migration)
      enqueueChange(payload);
    });
    changeStream.on('error', (err) => {
      // Code 40573 = "$changeStream is only supported on replica sets"
      // This happens when using a standalone in-memory MongoDB (non-replica-set).
      if (err.code === 40573) {
        console.warn(
          '[SOCKET] ⚠️  Change Streams not supported (standalone MongoDB — not a replica set). Real-time db_change events disabled.',
        );
        console.warn(
          '[SOCKET]    Tip: The in-memory fallback should use MongoMemoryReplSet for Change Stream support.',
        );
      } else {
        console.error('[SOCKET] MongoDB Change Stream Error:', err);
      }
    });
  } catch (error) {
    console.error(
      '[SOCKET] Failed to initialize Mongoose Change Streams:',
      error,
    );
  }
};
