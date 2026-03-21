import 'dotenv/config'; // MUST be first line - load env variables immediately
import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config/environment.js';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import { initializeMailer } from './utils/mail.js'; // Import mailer
import { initSocket } from './utils/socket.js';

// ============================================
// BREVO CONFIGURATION VERIFICATION
// ============================================
console.log('\n🔐 Brevo Configuration Loaded:');
console.log('Brevo Config Loaded:', !!process.env.BREVO_API_KEY);
console.log('  ✓ BREVO_SMTP_USER:', !!process.env.BREVO_SMTP_USER ? 'Present (' + (process.env.BREVO_SMTP_USER || '').substring(0, 15) + '...)' : '❌ MISSING');
console.log('  ✓ BREVO_SMTP_PASSWORD:', !!process.env.BREVO_SMTP_PASSWORD ? 'Present (***hidden***)' : '❌ MISSING');
console.log('  ✓ BREVO_API_KEY:', !!process.env.BREVO_API_KEY ? 'Present (***hidden***)' : '❌ MISSING');
console.log('  ✓ EMAIL_FROM_ADDRESS:', config.emailFromAddress);
console.log('  ✓ EMAIL_PROVIDER:', config.emailProvider);

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import orderRoutes from './routes/orders.js';
import servicesRoutes from './routes/services.js';
import storeRoutes from './routes/stores.js';
import customerRoutes from './routes/customers.js';
import activityRoutes from './routes/activity.js';
import notificationRoutes from './routes/notifications.js';
import chatRoutes from './routes/chatbot.js';
import paymentRoutes from './routes/paymentRoutes.js';
import { stripeWebhookHandler } from './controllers/paymentController.js';
import supplierRoutes from './routes/suppliers.js';
import settingsRoutes from './routes/settings.js';
import aiDamageRoutes from './routes/aiDamage.js';

const app = express();

// Stripe webhook (must be raw body)
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Request logger for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'OPTIONS') {
    console.log('  -> Preflight request');
  }
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bookings', orderRoutes); // Alias for booking-related operations
app.use('/api/services', servicesRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiDamageRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB Atlas
    await connectDB();
    console.log('✅ MongoDB connected successfully');

    // Initialize Brevo SMTP mailer
    console.log('\n📧 Initializing Brevo SMTP mailer...');
    try {
      await initializeMailer();
      console.log('✅ Brevo SMTP mailer initialized and verified\n');
    } catch (mailerError) {
      console.error('❌ Failed to initialize mailer:', mailerError.message);
      console.error('   OTP emails will not be sent. Please check Brevo credentials.\n');
    }

    // Create HTTP server and attach Socket.io
    const httpServer = http.createServer(app);
    initSocket(httpServer);

    // Start listening on all interfaces (0.0.0.0)
    const server = httpServer.listen(config.port, '0.0.0.0', () => {
      console.log(`✅ Server running on http://0.0.0.0:${config.port}`);
      console.log(`📍 Locally accessible at http://localhost:${config.port} and http://127.0.0.1:${config.port}`);
      console.log(`📍 API Base: http://localhost:${config.port}/api`);
      console.log(`📍 Environment: ${config.nodeEnv}`);
      console.log(`📧 Email Provider: ${config.emailProvider}`);
      console.log(`📨 Using MongoDB for OTP storage`);
      console.log(`✅ Ready for connectivity testing!`);
    });

    server.on('error', (err) => {
      console.error('❌ Server startup error:', err);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
