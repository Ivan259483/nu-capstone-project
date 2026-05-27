import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { handleSocketMessage, handleSocketStreamingMessage } from '../controllers/chatbot.controller.js';
import { isAdminDashboardRole, isBookingManagerRole, isPosManagerRole } from '../constants/roles.js';
import User from '../models/user.model.js';
import { sendExpoPushNotification } from './push.utils.js';
import { decrypt } from './encryption.utils.js';

/**
 * Change streams return raw BSON — Mongoose decrypt middleware does not run.
 * Mirror order.controller formatBookingDto safeDecrypt so Sales / dashboards see real plates.
 */
function safeDecryptOrderField(val) {
  if (!val || typeof val !== 'string') return val;
  if (/^[0-9a-f]{32}:[0-9a-f]+$/i.test(val)) {
    try {
      return decrypt(val);
    } catch {
      return val;
    }
  }
  return val;
}

function prepareOrderDocumentForSocket(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const vehicleInfo = [doc.vehicleYear, doc.vehicleMake, doc.vehicleModel].filter(Boolean).join(' ').trim();
  const serviceName = doc.serviceName || doc.serviceType || 'Service';
  const id = doc._id?.toString?.() || doc.id;
  const customerId = doc.customer?._id?.toString?.() || doc.customer?.toString?.() || doc.customer || '';

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
      ? doc.items.map((item) => ({ quantity: item.quantity, price: item.price }))
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
    serviceStaffAssignments: Array.isArray(doc.serviceStaffAssignments) ? doc.serviceStaffAssignments : [],
    hasPaymentProof: Boolean(doc.paymentProofUrl || doc.downpaymentProof || doc.status === 'pending_confirmation'),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

let io;

// ── Collections the frontend actually watches ────────────────────────
const WATCHED_COLLECTIONS = new Set([
  'orders',
  'products',
  'services',
  'shopavailabilities',
  'scheduledclosures',
]);

// ── Debounce/batch rapid successive changes (200 ms window) ─────────
const BATCH_INTERVAL_MS = 200;
let batchBuffer = [];
let batchTimer = null;

const flushBatch = () => {
  if (!io || batchBuffer.length === 0) return;
  // Deduplicate by collection+docId — keep the latest change per doc
  const deduped = new Map();
  for (const item of batchBuffer) {
    const key = `${item.collection}:${item.documentKey?._id || ''}`;
    deduped.set(key, item);
  }
  for (const payload of deduped.values()) {
    io.emit('db_change', payload);
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
  });

  io.use((socket, next) => {
    const authHeader = socket.handshake.headers?.authorization;
    const tokenFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
    const token = socket.handshake.auth?.token || socket.handshake.query?.token || tokenFromHeader;

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        socket.user = decoded;
      } catch (error) {
        console.warn('[SOCKET_AUTH] Invalid token:', error.message);
      }
    }

    next();
  });

  io.on('connection', (socket) => {
    const sessionId = socket.handshake.auth?.sessionId || socket.handshake.query?.sessionId;
    if (sessionId) {
      socket.join(`chat:${sessionId}`);
    }
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }
    if (isAdminDashboardRole(socket.user?.role)) {
      socket.join('admin:chat');
    }
    if (isBookingManagerRole(socket.user?.role) || isPosManagerRole(socket.user?.role)) {
      socket.join('booking:approvals');
    }

    // Allow clients to join rooms dynamically
    socket.on('join_room', (room) => {
      socket.join(room);
    });

    socket.on('chat:message', async (payload) => {
      await handleSocketMessage(io, socket, payload);
    });

    socket.on('chat:message:stream', async (payload) => {
      await handleSocketStreamingMessage(io, socket, payload);
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

export const initChangeStreams = (mongooseConnection) => {
  if (!io) return;
  console.log('[SOCKET] Initializing MongoDB Change Streams...');
  console.log('[SOCKET] Watching collections:', [...WATCHED_COLLECTIONS].join(', '));
  try {
    const changeStream = mongooseConnection.watch([], { fullDocument: 'updateLookup' });
    changeStream.on('change', (change) => {
      const collectionName = change.ns ? change.ns.coll : '';

      // Only emit changes for collections the frontends care about
      if (!WATCHED_COLLECTIONS.has(collectionName)) return;

      const rawDoc = change.fullDocument || null;
      const fullDocument =
        collectionName === 'orders' && rawDoc ? prepareOrderDocumentForSocket(rawDoc) : rawDoc;

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

      // Expo Push Notification Logic for Orders
      if (collectionName === 'orders' && change.operationType === 'update' && change.updateDescription?.updatedFields?.status) {
        // Run asynchronously so we don't block the change stream
        (async () => {
          try {
            const newStatus = change.updateDescription.updatedFields.status;
            // Fetch the document to know who owns it
            const fullDoc = payload.fullDocument;
            if (!fullDoc || !fullDoc.customer) return;

            const customer = await User.findById(fullDoc.customer);
            if (customer && customer.expoPushTokens && customer.expoPushTokens.length > 0) {
              let title = 'Booking Update';
              let body = `Your booking status is now: ${newStatus}`;

              if (newStatus === 'completed' || newStatus === 'ready_for_payment') {
                title = 'Service Completed!';
                body = 'Your vehicle is ready. Please view your invoice to proceed with payment.';
              } else if (newStatus === 'in_progress') {
                title = 'Service Started';
                body = 'We have started working on your vehicle!';
              } else if (newStatus === 'confirmed') {
                title = 'Booking Confirmed';
                body = 'Your AutoSPF+ appointment has been confirmed.';
              }

              await sendExpoPushNotification(customer.expoPushTokens, title, body, { orderId: fullDoc._id });
            }
          } catch (e) {
            console.error('[SOCKET] Error dispatching push notification:', e);
          }
        })();
      }
    });
    changeStream.on('error', (err) => {
      // Code 40573 = "$changeStream is only supported on replica sets"
      // This happens when using a standalone in-memory MongoDB (non-replica-set).
      if (err.code === 40573) {
        console.warn('[SOCKET] ⚠️  Change Streams not supported (standalone MongoDB — not a replica set). Real-time db_change events disabled.');
        console.warn('[SOCKET]    Tip: The in-memory fallback should use MongoMemoryReplSet for Change Stream support.');
      } else {
        console.error('[SOCKET] MongoDB Change Stream Error:', err);
      }
    });
  } catch (error) {
    console.error('[SOCKET] Failed to initialize Mongoose Change Streams:', error);
  }
};
