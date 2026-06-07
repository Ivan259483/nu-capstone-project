import express from 'express';
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from '../middleware/auth.middleware.js';
import { BOOKING_MANAGER_ROLES } from '../constants/roles.js';
import {
  startSession,
  listConversations,
  createConversation,
  getConversation,
  saveLead,
  sendMessage,
  sendMessageStream,
  verifyPublicTracker,
  getPublicTracker,
} from '../controllers/chatbot.controller.js';
import {
  assignSalesConversationToCurrentUser,
  getCustomerMessages,
  getSalesConversationDetail,
  getSalesConversations,
  handoffConversation,
  patchSalesConversationStatus,
  postCustomerMessage,
  postSalesMessage,
  readCustomerConversation,
  readSalesConversation,
} from '../controllers/chatSales.controller.js';

const router = express.Router();

router.use(optionalAuthenticate);

const authenticateIfTokenPresent = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  return authenticate(req, res, next);
};

const requireSalesChatAccess = [
  authenticate,
  authorize(...BOOKING_MANAGER_ROLES),
];

router.get('/sales/conversations', ...requireSalesChatAccess, getSalesConversations);
router.get(
  '/sales/conversations/:conversationId',
  ...requireSalesChatAccess,
  getSalesConversationDetail
);
router.post(
  '/sales/conversations/:conversationId/messages',
  ...requireSalesChatAccess,
  postSalesMessage
);
router.patch(
  '/sales/conversations/:conversationId/status',
  ...requireSalesChatAccess,
  patchSalesConversationStatus
);
router.patch(
  '/sales/conversations/:conversationId/assign',
  ...requireSalesChatAccess,
  assignSalesConversationToCurrentUser
);
router.patch(
  '/sales/conversations/:conversationId/read',
  ...requireSalesChatAccess,
  readSalesConversation
);

router.get('/conversations', authenticateIfTokenPresent, listConversations);
router.post('/conversations', authenticateIfTokenPresent, createConversation);
router.get(
  '/conversations/:conversationId/messages',
  authenticateIfTokenPresent,
  getCustomerMessages
);
router.post(
  '/conversations/:conversationId/messages',
  authenticateIfTokenPresent,
  postCustomerMessage
);
router.patch(
  '/conversations/:conversationId/read',
  authenticateIfTokenPresent,
  readCustomerConversation
);
router.get('/conversations/:conversationId', authenticateIfTokenPresent, getConversation);
router.post('/session', startSession);
router.post('/lead', saveLead);
router.post('/tracker/verify', verifyPublicTracker);
router.get('/tracker/:token', getPublicTracker);
router.post('/message/stream', sendMessageStream);
router.post('/message', sendMessage);
router.post('/handoff', authenticateIfTokenPresent, handoffConversation);

export default router;
