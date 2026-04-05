import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { handleSocketMessage } from '../controllers/chatbot.controller.js';
import { isAdminDashboardRole } from '../constants/roles.js';

let io;

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
  try {
    const changeStream = mongooseConnection.watch([], { fullDocument: 'updateLookup' });
    changeStream.on('change', (change) => {
      // Emit the change to all connected admin and detailer clients
      io.emit('db_change', {
        collection: change.ns ? change.ns.coll : '',
        operationType: change.operationType,
        documentKey: change.documentKey,
      });
    });
    changeStream.on('error', (err) => {
      console.error('[SOCKET] MongoDB Change Stream Error:', err);
    });
  } catch (error) {
    console.error('[SOCKET] Failed to initialize Mongoose Change Streams:', error);
  }
};
