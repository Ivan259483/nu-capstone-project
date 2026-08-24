import { Expo } from 'expo-server-sdk';

// Create a new Expo SDK client
// optionally providing an access token if you have enabled push security
let expo = new Expo();

/**
 * Sends a push notification to one or more Expo push tokens.
 * @param {string[]} somePushTokens - Array of Expo Push Tokens
 * @param {string} title - Title of the notification
 * @param {string} body - Body content of the notification
 * @param {object} data - Custom JSON data to handle when parsing notification
 */
const sendExpoPushNotification = async (somePushTokens, title, body, data = {}) => {
  // Create the messages that you want to send to clients
  let messages = [];

  const invalidTokens = [];
  const tokenByMessageIndex = [];
  const receiptTokens = {};

  for (const pushToken of [...new Set(somePushTokens || [])]) {
    // Each push token looks like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]

    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(pushToken)) {
      console.warn('[PUSH] Ignoring an invalid Expo push token.');
      invalidTokens.push(pushToken);
      continue;
    }

    // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
    messages.push({
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
    });
    tokenByMessageIndex.push(pushToken);
  }

  // The Expo push notification service accepts batches of notifications so
  // that you don't need to send 1000 requests to send 1000 notifications. We
  // recommend you batch your notifications to reduce the number of requests
  // and to compress them (notifications with similar content will get
  // compressed).
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  let messageOffset = 0;
  
  // Send the chunks to the Expo push notification service. There are
  // different strategies you could use. A simple one is to send one chunk at a
  // time, which nicely spreads the load out over time:
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
      ticketChunk.forEach((ticket, index) => {
        const token = tokenByMessageIndex[messageOffset + index];
        if (ticket?.status === 'ok' && ticket?.id && token) {
          receiptTokens[ticket.id] = token;
        }
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          if (token) invalidTokens.push(token);
        }
      });
      messageOffset += chunk.length;
    } catch (error) {
      console.error('Error sending push notifications chunk:', error);
      messageOffset += chunk.length;
    }
  }
  
  return { tickets, receiptTokens, invalidTokens: [...new Set(invalidTokens)] };
};

/** Resolve delayed Expo receipts and return only tokens known to be expired. */
const getInvalidExpoPushTokensFromReceipts = async (receiptTokens = {}) => {
  const receiptIds = Object.keys(receiptTokens);
  if (!receiptIds.length) return [];
  const invalidTokens = [];
  for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
    const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (receipt?.status === 'error' && receipt?.details?.error === 'DeviceNotRegistered') {
        const token = receiptTokens[receiptId];
        if (token) invalidTokens.push(token);
      }
    }
  }
  return [...new Set(invalidTokens)];
};

export { getInvalidExpoPushTokensFromReceipts, sendExpoPushNotification };
