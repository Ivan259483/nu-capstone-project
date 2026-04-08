import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { handleSocketMessage } from '../controllers/chatbot.controller.js';
import { isAdminDashboardRole } from '../constants/roles.js';

let io;

// ── Collections the frontend actually watches ────────────────────────
const WATCHED_COLLECTIONS = new Set(['orders', 'products', 'services']);

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

    // Allow clients to join rooms dynamically
    socket.on('join_room', (room) => {
      socket.join(room);
    });

    socket.on('chat:message', async (payload) => {
      await handleSocketMessage(io, socket, payload);
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

      const payload = {
        collection: collectionName,
        operationType: change.operationType,
        documentKey: change.documentKey,
        // Include the full document so clients can update state
        // without a follow-up HTTP fetch (only for insert/update)
        fullDocument: change.fullDocument || null,
      };

      // Batch rapid successive changes (e.g. bulk import, migration)
      enqueueChange(payload);
    });
    changeStream.on('error', (err) => {
      console.error('[SOCKET] MongoDB Change Stream Error:', err);
    });
  } catch (error) {
    console.error('[SOCKET] Failed to initialize Mongoose Change Streams:', error);
  }
};
