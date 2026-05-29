import express from 'express';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
import {
  startSession,
  listConversations,
  createConversation,
  getConversation,
  saveLead,
  sendMessage,
  sendMessageStream,
  requestHandoff,
  verifyPublicTracker,
  getPublicTracker,
} from '../controllers/chatbot.controller.js';

const router = express.Router();

router.use(optionalAuthenticate);

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:conversationId', getConversation);
router.post('/session', startSession);
router.post('/lead', saveLead);
router.post('/tracker/verify', verifyPublicTracker);
router.get('/tracker/:token', getPublicTracker);
router.post('/message/stream', sendMessageStream);
router.post('/message', sendMessage);
router.post('/handoff', requestHandoff);

export default router;
