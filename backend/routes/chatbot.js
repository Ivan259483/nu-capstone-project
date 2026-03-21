import express from 'express';
import { optionalAuthenticate } from '../middleware/auth.js';
import {
  startSession,
  saveLead,
  sendMessage,
  requestHandoff,
} from '../controllers/chatbotController.js';

const router = express.Router();

router.use(optionalAuthenticate);

router.post('/session', startSession);
router.post('/lead', saveLead);
router.post('/message', sendMessage);
router.post('/handoff', requestHandoff);

export default router;
