import crypto from 'crypto';
import Stripe from 'stripe';
import Order from '../models/Order.js';
import Service from '../models/Service.js';
import Product from '../models/Product.js';
import Payment from '../models/Payment.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getIO } from '../utils/socket.js';

const LOW_STOCK_THRESHOLD = 10;
const LOCAL_PAYMENTS_PROVIDER = (process.env.LOCAL_PAYMENTS_PROVIDER || 'paymongo').toLowerCase();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const options = {};
  if (process.env.STRIPE_API_VERSION) {
    options.apiVersion = process.env.STRIPE_API_VERSION;
  }
  return new Stripe(key, options);
};

const generateInvoiceId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INV-${date}-${random}`;
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findProductByName = async (name) => {
  if (!name) return null;
  let product = await Product.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (product) return product;
  product = await Product.findOne({ name: new RegExp(escapeRegex(name), 'i') });
  return product;
};

const notifyInventoryIssue = async ({ title, message, metadata }) => {
  try {
    await Notification.create({
      title,
      message,
      type: 'inventory',
      recipientRole: 'admin',
      link: '/admin/inventory',
      metadata,
    });
  } catch (error) {
    console.error('Failed to create inventory notification:', error.message);
  }
};

const emitAdminNotification = (notification) => {
  try {
    const io = getIO();
    io.to('admin:chat').emit('admin:notification', notification);
  } catch (error) {
    console.warn('Socket not initialized for admin notification:', error.message);
  }
};

const emitCustomerNotification = (customerId, notification) => {
  try {
    if (!customerId) return;
    const io = getIO();
    io.to(`user:${customerId.toString()}`).emit('notification:customer', notification);
  } catch (error) {
    console.warn('Socket not initialized for customer notification:', error.message);
  }
};

const PAYMENT_INVENTORY_MAP = [
  {
    keyword: 'full ceramic coating',
    items: [
      { productNames: ['Ceramic Coating', 'Ceramic Coat'], quantity: 1 },
      { productNames: ['Microfiber Towel', 'Microfiber Towels'], quantity: 5 },
    ],
  },
  {
    keyword: 'ceramic coating',
    items: [
      { productNames: ['Ceramic Liquid', 'Ceramic Coating'], quantity: 1 },
      { productNames: ['Applicator Pad', 'Applicator Pads'], quantity: 1 },
    ],
  },
];

const resolveInventoryForService = async (service, serviceLabel) => {
  const resolved = [];
  const insufficient = [];

  if (service?.recipe?.length) {
    for (const entry of service.recipe) {
      let product = null;
      if (entry.product) {
        product = await Product.findById(entry.product);
      }
      if (!product && entry.productName) {
        product = await findProductByName(entry.productName);
      }
      const quantity = Number(entry.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      if (!product) {
        await notifyInventoryIssue({
          title: 'Inventory Mapping Missing',
          message: `${service.name}: recipe item not found (${entry.productName || 'Unnamed item'})`,
          metadata: {
            serviceId: service._id,
            serviceName: service.name,
            productName: entry.productName,
            quantity,
            unit: entry.unit,
          },
        });
        continue;
      }

      if (product.inventory < quantity) {
        insufficient.push({ product, quantity, unit: entry.unit, serviceName: service.name });
        continue;
      }

      resolved.push({ product, quantity });
    }

  }

  const label = (serviceLabel || '').toLowerCase();
  const entry = PAYMENT_INVENTORY_MAP.find((item) => label.includes(item.keyword));
  if (entry) {
    for (const mapping of entry.items) {
      let product = null;
      for (const name of mapping.productNames) {
        product = await findProductByName(name);
        if (product) break;
      }

      if (!product) {
        await notifyInventoryIssue({
          title: 'Inventory Mapping Missing',
          message: `Missing inventory mapping for ${mapping.productNames[0]} (${serviceLabel || 'Service'})`,
          metadata: {
            keyword: mapping.productNames[0],
            serviceName: serviceLabel,
          },
        });
        continue;
      }

      const alreadyIncluded = resolved.some((item) => item.product._id.toString() === product._id.toString());
      if (alreadyIncluded) {
        continue;
      }

      if (product.inventory < mapping.quantity) {
        insufficient.push({ product, quantity: mapping.quantity, serviceName: serviceLabel });
        continue;
      }

      resolved.push({ product, quantity: mapping.quantity });
    }
  }

  return { resolved, insufficient };
};

const applyInventoryDeductions = async (order) => {
  if (order.inventoryDeductedAt) {
    return { skipped: true };
  }

  let service = null;
  let serviceLabel = order.serviceType || '';

  if (order.items?.length) {
    const itemProduct = order.items[0]?.product;
    if (itemProduct) {
      service = await Service.findById(itemProduct);
      if (service?.name) serviceLabel = service.name;
    }
  }

  const { resolved, insufficient } = await resolveInventoryForService(service, serviceLabel);

  for (const item of insufficient) {
    await notifyInventoryIssue({
      title: 'Inventory Alert',
      message: `${item.product.name} out of stock for ${item.serviceName || 'service'} (needed ${item.quantity}${item.unit ? ` ${item.unit}` : ''}, available ${item.product.inventory})`,
      metadata: {
        productId: item.product._id,
        productName: item.product.name,
        required: item.quantity,
        available: item.product.inventory,
        serviceName: item.serviceName,
      },
    });
  }

  for (const item of resolved) {
    const previousInventory = Number.isFinite(item.product.inventory) ? item.product.inventory : 0;
    const updatedInventory = previousInventory - item.quantity;
    item.product.inventory = updatedInventory;
    await item.product.save();

    if (previousInventory > LOW_STOCK_THRESHOLD && updatedInventory <= LOW_STOCK_THRESHOLD) {
      await notifyInventoryIssue({
        title: 'Low Stock',
        message: `Low Stock: ${item.product.name} only has ${updatedInventory} units left`,
        metadata: {
          productId: item.product._id,
          productName: item.product.name,
          threshold: LOW_STOCK_THRESHOLD,
          remaining: updatedInventory,
        },
      });
    }
  }

  order.inventoryDeductedAt = new Date();
  await order.save();

  return { skipped: false, deducted: resolved.length };
};

const finalizePayment = async (payment, order, payload = {}) => {
  payment.status = 'succeeded';
  payment.providerReference = payload.providerReference || payment.providerReference;
  payment.metadata = { ...payment.metadata, ...payload.metadata };
  await payment.save();

  order.invoiceId = order.invoiceId || payment.invoiceId;
  order.paymentStatus = 'paid';
  order.paymentMethod = payment.method;
  order.paymentProvider = payment.provider;
  order.paidAt = new Date();
  if (order.status === 'pending') {
    order.status = 'confirmed';
  }
  await order.save();

  await applyInventoryDeductions(order);

  try {
    const io = getIO();
    const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
    if (customerId) {
      io.to(`user:${customerId.toString()}`).emit('booking:status', {
        bookingId: order._id?.toString?.() || order.id,
        status: order.status,
        customerStatus: order.customerStatus,
        paymentStatus: order.paymentStatus,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn('Socket not initialized for payment status update:', error.message);
  }

  try {
    const existing = await Notification.findOne({
      'metadata.paymentId': payment._id,
      type: 'success',
      recipientRole: 'admin',
    });
    if (!existing) {
      const notification = await Notification.create({
        title: 'Payment Completed',
        message: `Payment ${payment.invoiceId} received (${payment.method?.toUpperCase() || 'PAYMENT'})`,
        type: 'success',
        recipientRole: 'admin',
        link: '/admin/dashboard?tab=billing',
        metadata: {
          paymentId: payment._id,
          orderId: order._id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
        },
      });
      emitAdminNotification({
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        link: notification.link,
      });
    }
  } catch (notifyError) {
    console.error('Failed to notify payment completion:', notifyError.message);
  }

  try {
    const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
    if (customerId) {
      const existingCustomer = await Notification.findOne({
        'metadata.paymentId': payment._id,
        type: 'success',
        recipientRole: 'customer',
      });
      if (!existingCustomer) {
        const createdNotification = await Notification.create({
          title: 'Payment Received',
          message: `Payment ${payment.invoiceId} received successfully.`,
          type: 'success',
          recipientRole: 'customer',
          link: '/customer/dashboard?tab=bookings',
          metadata: {
            paymentId: payment._id,
            orderId: order._id,
            customerId: customerId.toString(),
            invoiceId: payment.invoiceId,
            amount: payment.amount,
          },
        });
        emitCustomerNotification(customerId, {
          id: createdNotification._id,
          title: createdNotification.title,
          message: createdNotification.message,
          type: createdNotification.type,
          isRead: createdNotification.isRead,
          createdAt: createdNotification.createdAt,
          link: createdNotification.link,
        });
      }
    }
  } catch (notifyError) {
    console.error('Failed to notify customer payment completion:', notifyError.message);
  }
};

const getOrderForPayment = async (orderId, user) => {
  const order = await Order.findById(orderId);
  if (!order) return null;

  if (user?.role === 'customer' && order.customer.toString() !== user.id) {
    return null;
  }

  return order;
};

export const createStripePaymentIntent = async (req, res, next) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await getOrderForPayment(orderId, req.user);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or access denied' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const amount = Number(order.totalPrice ?? order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order amount' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const existingPayment = await Payment.findOne({
      order: order._id,
      status: 'pending',
      method: 'card',
      provider: 'stripe',
    });
    if (existingPayment?.metadata?.clientSecret) {
      return res.json({
        success: true,
        data: {
          paymentId: existingPayment._id,
          invoiceId: existingPayment.invoiceId,
          clientSecret: existingPayment.metadata.clientSecret,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
        },
      });
    }
    if (existingPayment) {
      return res.status(409).json({
        success: false,
        message: 'Payment already initiated for this booking.',
      });
    }

    const invoiceId = order.invoiceId || generateInvoiceId();
    if (!order.invoiceId) {
      order.invoiceId = invoiceId;
      await order.save();
    }

    const payment = await Payment.create({
      invoiceId,
      order: order._id,
      customer: order.customer,
      amount,
      currency: 'PHP',
      status: 'pending',
      method: 'card',
      provider: 'stripe',
      metadata: { orderNumber: order.orderNumber },
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'php',
      description: `AutoSPF+ Booking ${order.orderNumber}`,
      metadata: {
        orderId: order._id.toString(),
        invoiceId,
        paymentId: payment._id.toString(),
      },
      automatic_payment_methods: { enabled: true },
    });

    payment.providerReference = paymentIntent.id;
    payment.metadata = { ...payment.metadata, clientSecret: paymentIntent.client_secret };
    await payment.save();

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        invoiceId,
        clientSecret: paymentIntent.client_secret,
        amount,
        currency: 'PHP',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createStripeCheckoutSession = async (req, res, next) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await getOrderForPayment(orderId, req.user);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or access denied' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const amount = Number(order.totalPrice ?? order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order amount' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const invoiceId = order.invoiceId || generateInvoiceId();
    if (!order.invoiceId) {
      order.invoiceId = invoiceId;
      await order.save();
    }

    const existingPayment = await Payment.findOne({
      order: order._id,
      status: 'pending',
      method: 'card',
      provider: 'stripe',
    });
    if (existingPayment?.metadata?.checkoutUrl) {
      return res.json({
        success: true,
        data: {
          paymentId: existingPayment._id,
          invoiceId: existingPayment.invoiceId,
          checkoutUrl: existingPayment.metadata.checkoutUrl,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
        },
      });
    }
    if (existingPayment) {
      return res.status(409).json({ success: false, message: 'Payment already initiated for this booking.' });
    }

    const payment = await Payment.create({
      invoiceId,
      order: order._id,
      customer: order.customer,
      amount,
      currency: 'PHP',
      status: 'pending',
      method: 'card',
      provider: 'stripe',
      metadata: { orderNumber: order.orderNumber },
    });

    let customerEmail = undefined;
    if (order.customer) {
      const customer = await User.findById(order.customer).select('email');
      customerEmail = customer?.email;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'php',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: order.serviceType || `AutoSPF+ Booking ${order.orderNumber}`,
            },
          },
        },
      ],
      success_url: `${FRONTEND_URL}/dashboard?payment=success&order=${order._id}`,
      cancel_url: `${FRONTEND_URL}/dashboard?payment=cancel&order=${order._id}`,
      customer_email: customerEmail,
      metadata: {
        orderId: order._id.toString(),
        paymentId: payment._id.toString(),
        invoiceId,
      },
    });

    payment.providerReference = session.id;
    payment.metadata = { ...payment.metadata, checkoutUrl: session.url };
    await payment.save();

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        invoiceId,
        checkoutUrl: session.url,
        amount,
        currency: 'PHP',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createLocalPaymentPlaceholder = async (req, res, next) => {
  try {
    const { orderId, method } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const paymentMethod = (method || 'gcash').toLowerCase();
    if (!['gcash', 'maya'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid local payment method' });
    }

    const order = await getOrderForPayment(orderId, req.user);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or access denied' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const amount = Number(order.totalPrice ?? order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order amount' });
    }

    const invoiceId = order.invoiceId || generateInvoiceId();
    if (!order.invoiceId) {
      order.invoiceId = invoiceId;
      await order.save();
    }

    const payment = await Payment.create({
      invoiceId,
      order: order._id,
      customer: order.customer,
      amount,
      currency: 'PHP',
      status: 'pending',
      method: paymentMethod,
      provider: LOCAL_PAYMENTS_PROVIDER,
      providerReference: `LOCAL-${invoiceId}`,
      metadata: { orderNumber: order.orderNumber },
    });

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        invoiceId,
        status: payment.status,
        provider: payment.provider,
        method: payment.method,
        checkoutUrl: null,
        message: `${paymentMethod.toUpperCase()} placeholder created via ${payment.provider}.`,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const confirmStripePayment = async (req, res, next) => {
  try {
    const { paymentId, paymentIntentId } = req.body || {};
    if (!paymentId && !paymentIntentId) {
      return res.status(400).json({ success: false, message: 'Payment ID or PaymentIntent ID is required' });
    }

    const payment = paymentId
      ? await Payment.findById(paymentId)
      : await Payment.findOne({ providerReference: paymentIntentId });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }
    if (payment.status === 'succeeded') {
      return res.json({ success: true, message: 'Payment already confirmed', data: { invoiceId: payment.invoiceId } });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured' });
    }

    const intentId = payment.providerReference || paymentIntentId;
    if (!intentId) {
      return res.status(400).json({ success: false, message: 'Missing Stripe PaymentIntent reference' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.json({
        success: false,
        message: 'Payment is not completed yet',
        status: paymentIntent.status,
      });
    }

    const order = await Order.findById(payment.order);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    await finalizePayment(payment, order, {
      providerReference: paymentIntent.id,
      metadata: { stripeStatus: paymentIntent.status },
    });

    res.json({ success: true, message: 'Payment confirmed', data: { invoiceId: payment.invoiceId } });
  } catch (error) {
    next(error);
  }
};

export const stripeWebhookHandler = async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    return res.status(500).send('Stripe not configured');
  }

  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).send('Stripe webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentId = session.metadata?.paymentId;
    const orderId = session.metadata?.orderId;

    try {
      let payment = paymentId ? await Payment.findById(paymentId) : null;
      if (!payment && session.id) {
        payment = await Payment.findOne({ providerReference: session.id });
      }
      if (!payment) {
        console.warn('Payment record not found for checkout session:', session.id);
        return res.json({ received: true });
      }
      if (payment.status === 'succeeded') {
        return res.json({ received: true });
      }

      const order = orderId ? await Order.findById(orderId) : await Order.findById(payment.order);
      if (!order) {
        console.warn('Order not found for checkout session:', session.id);
        return res.json({ received: true });
      }

      await finalizePayment(payment, order, {
        providerReference: session.id,
        metadata: { stripeSessionStatus: session.status },
      });
    } catch (error) {
      console.error('Failed to finalize payment from webhook:', error.message);
    }
  }

  res.json({ received: true });
};

export const getSalesToday = async (req, res, next) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const result = await Payment.aggregate([
      {
        $match: {
          status: 'succeeded',
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const total = result?.[0]?.total || 0;
    const count = result?.[0]?.count || 0;

    res.json({
      success: true,
      data: {
        total,
        count,
        currency: 'PHP',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPayments = async (req, res, next) => {
  try {
    const { limit = 100 } = req.query || {};
    const payments = await Payment.find()
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('order', 'orderNumber customerName serviceType')
      .populate('customer', 'name email')
      .lean();

    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: payments,
      totalRevenue: totalRevenue?.[0]?.total || 0,
      totalCount: totalRevenue?.[0]?.count || 0,
    });
  } catch (error) {
    next(error);
  }
};
