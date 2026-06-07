import Notification from '../models/notification.model.js';
import {
  assignSalesConversation,
  getCustomerConversationMessages,
  getSalesConversation,
  listSalesConversations,
  markCustomerConversationRead,
  markSalesConversationRead,
  promoteConversationToSales,
  sendCustomerConversationMessage,
  sendSalesConversationMessage,
  updateSalesConversationStatus,
} from '../services/chatSalesHandoff.service.js';

const clean = (value = '') => String(value || '').trim();
const isCustomerActor = (user) => !user?.id || user.role === 'customer';

const sendKnownError = (res, error, next) => {
  if (error?.status && error?.code) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  return next(error);
};

export const handoffConversation = async (req, res, next) => {
  try {
    if (!isCustomerActor(req.user)) {
      return res.status(403).json({
        success: false,
        code: 'CUSTOMER_CHAT_ACCESS_REQUIRED',
        message: 'Use the Sales conversation endpoints for staff messages.',
      });
    }
    const conversationId = clean(
      req.body?.conversationId || req.body?.sessionId
    );
    const guestKey = clean(req.body?.guestKey);
    if (!req.user?.id && !guestKey) {
      return res.status(400).json({
        success: false,
        code: 'GUEST_KEY_REQUIRED',
        message: 'Missing guestKey',
      });
    }

    const result = await promoteConversationToSales({
      conversationId,
      userId: req.user?.id,
      guestKey,
      body: req.body || {},
      source: clean(req.body?.source) || 'web',
    });

    if (result.firstHandoff) {
      await Notification.create({
        title: 'Chatbot Handoff Requested',
        message: `${result.conversation.customerName} requested AutoSPF+ Sales assistance.`,
        type: 'chat',
        recipientRole: 'admin_family',
        metadata: { conversationId: result.conversation.conversationId },
      });
    }

    return res.status(result.firstHandoff ? 201 : 200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const getCustomerMessages = async (req, res, next) => {
  try {
    if (!isCustomerActor(req.user)) {
      return res.status(403).json({
        success: false,
        code: 'CUSTOMER_CHAT_ACCESS_REQUIRED',
        message: 'Use the Sales conversation endpoints for staff access.',
      });
    }
    const guestKey = clean(req.query?.guestKey);
    if (!req.user?.id && !guestKey) {
      return res.status(400).json({
        success: false,
        code: 'GUEST_KEY_REQUIRED',
        message: 'Missing guestKey',
      });
    }
    const result = await getCustomerConversationMessages({
      conversationId: clean(req.params.conversationId),
      userId: req.user?.id,
      guestKey,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const postCustomerMessage = async (req, res, next) => {
  try {
    if (!isCustomerActor(req.user)) {
      return res.status(403).json({
        success: false,
        code: 'CUSTOMER_CHAT_ACCESS_REQUIRED',
        message: 'Use the Sales conversation endpoints for staff messages.',
      });
    }
    const guestKey = clean(req.body?.guestKey);
    if (!req.user?.id && !guestKey) {
      return res.status(400).json({
        success: false,
        code: 'GUEST_KEY_REQUIRED',
        message: 'Missing guestKey',
      });
    }
    const result = await sendCustomerConversationMessage({
      conversationId: clean(req.params.conversationId),
      userId: req.user?.id,
      guestKey,
      message: req.body?.message,
      senderType: req.body?.senderType,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const readCustomerConversation = async (req, res, next) => {
  try {
    if (!isCustomerActor(req.user)) {
      return res.status(403).json({
        success: false,
        code: 'CUSTOMER_CHAT_ACCESS_REQUIRED',
        message: 'Use the Sales conversation endpoints for staff access.',
      });
    }
    const guestKey = clean(req.body?.guestKey);
    if (!req.user?.id && !guestKey) {
      return res.status(400).json({
        success: false,
        code: 'GUEST_KEY_REQUIRED',
        message: 'Missing guestKey',
      });
    }
    const conversation = await markCustomerConversationRead({
      conversationId: clean(req.params.conversationId),
      userId: req.user?.id,
      guestKey,
    });
    return res.json({ success: true, conversation });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const getSalesConversations = async (req, res, next) => {
  try {
    const conversations = await listSalesConversations({
      status: req.query?.status,
      search: req.query?.search,
    });
    return res.json({ success: true, conversations });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const getSalesConversationDetail = async (req, res, next) => {
  try {
    const result = await getSalesConversation(clean(req.params.conversationId));
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const postSalesMessage = async (req, res, next) => {
  try {
    const result = await sendSalesConversationMessage({
      conversationId: clean(req.params.conversationId),
      salesUser: req.user,
      message: req.body?.message,
      senderType: req.body?.senderType,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const patchSalesConversationStatus = async (req, res, next) => {
  try {
    const conversation = await updateSalesConversationStatus({
      conversationId: clean(req.params.conversationId),
      status: req.body?.status,
    });
    return res.json({ success: true, conversation });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const assignSalesConversationToCurrentUser = async (req, res, next) => {
  try {
    const conversation = await assignSalesConversation({
      conversationId: clean(req.params.conversationId),
      salesUser: req.user,
    });
    return res.json({ success: true, conversation });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};

export const readSalesConversation = async (req, res, next) => {
  try {
    const conversation = await markSalesConversationRead(
      clean(req.params.conversationId)
    );
    return res.json({ success: true, conversation });
  } catch (error) {
    return sendKnownError(res, error, next);
  }
};
