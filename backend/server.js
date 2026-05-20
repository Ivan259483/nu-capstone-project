import dotenv from 'dotenv';
dotenv.config();
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

console.log('Offline damage detection enabled:', true);
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import { config } from './config/environment.js';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.middleware.js';
import { initializeMailer } from './utils/mail.utils.js'; // Import mailer
import { migrateLegacyUserRoles } from './utils/migrateLegacyUserRoles.utils.js';
import { initSocket, initChangeStreams } from './utils/socket.utils.js';
import { cleanupExpiredReservations } from './utils/inventory.utils.js';
import { authenticate, authorize } from './middleware/auth.middleware.js';
import { BOOKING_MANAGER_ROLES } from './constants/roles.js';

// ============================================
// RESEND EMAIL CONFIGURATION
// ============================================
console.log('\n📧 Email Configuration:');
console.log('  ✓ EMAIL_PROVIDER:', config.emailProvider);
console.log('  ✓ RESEND_API_KEY:', !!process.env.RESEND_API_KEY ? 'Present (***hidden***)' : '❌ MISSING');
console.log('  ✓ EMAIL_FROM_ADDRESS:', config.emailFromAddress);

// Import routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import productRoutes from './routes/products.routes.js';
import categoryRoutes from './routes/categories.routes.js';
import orderRoutes from './routes/orders.routes.js';
import servicesRoutes from './routes/services.routes.js';
import storeRoutes from './routes/stores.routes.js';
import customerRoutes from './routes/customers.routes.js';
import activityRoutes from './routes/activity.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import chatRoutes from './routes/chatbot.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import { stripeWebhookHandler } from './controllers/payment.controller.js';
import supplierRoutes from './routes/suppliers.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import aiRoutes from './routes/ai.routes.js';
import systemRoutes from './routes/system.routes.js';
import qcRoutes from './routes/qc.routes.js';
import slotRoutes from './routes/slot.routes.js';
import availabilityRouter from './routes/admin/availability.js';

const app = express();

// Trust proxy for rate limiting (Vercel, Render, Heroku, etc.)
app.set('trust proxy', 1);

// Stripe webhook (must be raw body)
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// Middleware — CORS (allow ngrok / tunnel frontends when using explicit origin list)
const allowNgrokHostname = (hostname) =>
  /\.ngrok-free\.(app|dev)$/i.test(hostname)
  || /\.ngrok\.app$/i.test(hostname)
  || /\.ngrok\.io$/i.test(hostname);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.corsOrigin === true) return callback(null, true);
    const list = Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin];
    if (list.includes(origin)) return callback(null, true);
    try {
      const host = new URL(origin).hostname;
      if (allowNgrokHostname(host)) return callback(null, true);
    } catch (_) { /* ignore */ }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ── Security Headers (Helmet) ─────────────────────────────────────────
// Sets 15+ HTTP headers: X-XSS-Protection, Strict-Transport-Security,
// X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, etc.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // CSP disabled in dev for Vite proxy; enabled in production to block XSS
  contentSecurityPolicy: config.nodeEnv === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: [
        "'self'",
        ...(config.corsOrigin ? (Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin]) : []),
        "https://api.brevo.com",
        "https://api.stripe.com",
        "wss:",
        "ws:",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false,
}));

// ── NoSQL Injection Prevention ────────────────────────────────────────
// Strips $ and . from req.body, req.query, req.params to block injection
app.use(mongoSanitize());

// ── Rate Limiting ─────────────────────────────────────────────────────
// General API: 3000 requests per 15-minute window per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Auth endpoints: stricter — 100 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

// Apply general rate limiter to all API routes
app.use('/api/', generalLimiter);

// Compress all HTTP responses (gzip/brotli) — reduces JSON payload by ~70-80%
app.use(compression());

// ── Request logger with response time tracking ──────────────────────
// Use originalUrl: Express mutates req.url to "/" as it enters mounted routers
// (e.g. /api/activity?limit=200), so res.on("finish") would log misleading "GET /".
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const logPath = req.originalUrl || req.url;
  console.log(`[${new Date().toISOString()}] ${req.method} ${logPath}`);
  if (req.method === 'OPTIONS') {
    console.log('  -> Preflight request');
  }
  
  // Prevent aggressive browser caching of API responses (e.g., Safari GET caching).
  // Skip for /api/health so probes and optional edge caching can use short TTL.
  if (req.path !== '/api/health' && req.path !== '/health') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  // API versioning header — enterprise standard
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Powered-By', 'AutoSPF+');
  
  // Track response time for performance monitoring
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (durationMs > 1000) {
      console.warn(`⚠️ SLOW REQUEST: ${req.method} ${logPath} — ${durationMs.toFixed(0)}ms`);
    }
  });
  
  next();
});

const getHealthPayload = () => ({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
});

const healthCheckHandler = (req, res) => {
  res.status(200).json(getHealthPayload());
};

app.get('/health', healthCheckHandler);

// Backward-compatible API-prefixed health check for existing host settings/monitors.
app.get('/api/health', healthCheckHandler);

// API Routes
app.use('/api/auth', authLimiter, authRoutes); // Stricter rate limit on auth
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
app.use('/api/invoices', invoiceRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/admin/availability', authenticate, authorize(...BOOKING_MANAGER_ROLES), availabilityRouter);

// Serve static public assets (e.g. /ar-viewer.html used by the mobile WebView)
// Must be before the 404 handler so the file is matched first.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // Allow the AR viewer to load resources cross-origin (required for model-viewer CDN script)
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');

    if (filePath.includes(`${path.sep}public${path.sep}webar${path.sep}`)) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://ajax.googleapis.com https://unpkg.com https://cdn.jsdelivr.net https://www.gstatic.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' https: blob:",
          "worker-src 'self' blob:",
          "media-src 'self' blob:",
          "model-src 'self' blob: https:",
          "frame-src 'self' blob: https:",
          "frame-ancestors 'self'",
          "object-src 'none'",
        ].join('; ')
      );
    }
  },
}));

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
    await migrateLegacyUserRoles();

    // ── Canonical test admin — always administrator on boot (idempotent) ──
    try {
      const User = (await import('./models/user.model.js')).default;
      const canon = await User.updateOne(
        { email: 'admin@test.com' },
        { $set: { role: 'administrator', status: 'active', loginAttempts: 0, lockUntil: null } }
      );
      if (canon.modifiedCount > 0) {
        console.log('[ROLE_FIX] ✅ admin@test.com → administrator + lock cleared');
      }
    } catch (e) { /* non-fatal */ }

    // Initialize Resend mailer
    console.log('\n📧 Initializing Resend mailer...');
    try {
      await initializeMailer();
      console.log('✅ Resend mailer initialized\n');
    } catch (mailerError) {
      console.error('❌ Failed to initialize mailer:', mailerError.message);
      console.error('   OTP emails will not be sent. Please check RESEND_API_KEY.\n');
    }

    // HTTPS (mkcert / local dev on LAN) — set HTTPS_KEY_PATH + HTTPS_CERT_PATH to PEM files.
    const keyPath = String(process.env.HTTPS_KEY_PATH || '').trim();
    const certPath = String(process.env.HTTPS_CERT_PATH || '').trim();
    const keyExists = keyPath && fs.existsSync(keyPath);
    const certExists = certPath && fs.existsSync(certPath);
    const useHttps = Boolean(keyExists && certExists);

    let httpServer;
    if (useHttps) {
      const credentials = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      httpServer = https.createServer(credentials, app);
      console.log(`🔐 HTTPS enabled (key=${keyPath}, cert=${certPath})`);
    } else {
      if (keyPath || certPath) {
        console.warn(
          '⚠️ HTTPS_KEY_PATH / HTTPS_CERT_PATH set but file(s) missing — falling back to HTTP. ' +
            'Generate certs with mkcert and point both env vars to the PEM files.'
        );
      }
      httpServer = http.createServer(app);
    }

    initSocket(httpServer);
    initChangeStreams(mongoose.connection);

    // Bind to 0.0.0.0 so Railway (and all cloud platforms) can receive external traffic.
    // 127.0.0.1 only works on localhost and blocks all inbound connections on Railway.
    const proto = useHttps ? 'https' : 'http';
    const server = httpServer.listen(config.port, '0.0.0.0', () => {
      console.log(`✅ Server running on ${proto}://127.0.0.1:${config.port}`);
      console.log(`📍 Locally accessible at ${proto}://localhost:${config.port} and ${proto}://127.0.0.1:${config.port}`);
      console.log(`📍 API Base: ${proto}://localhost:${config.port}/api`);
      console.log(`📍 Environment: ${config.nodeEnv}`);
      console.log(`📧 Email Provider: ${config.emailProvider}`);
      console.log(`📨 Using MongoDB for OTP storage`);
      console.log(`✅ Ready for connectivity testing!`);

      // ── Inventory Reservation Expiry Scheduler ──────────────────────
      // Runs every hour to release inventory held for bookings still
      // in 'pending' status after 24 hours.
      const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
      setInterval(async () => {
        try {
          const result = await cleanupExpiredReservations();
          if (result.released > 0) {
            console.log(`[SCHEDULER] 🧹 Released ${result.released} expired inventory reservation(s)`);
          }
        } catch (err) {
          console.error('[SCHEDULER] Reservation cleanup failed:', err.message);
        }
      }, CLEANUP_INTERVAL_MS);
      console.log(`⏰ Inventory reservation expiry scheduler started (every 60 min, 24h TTL)`);
    });

    server.on('error', (err) => {
      console.error('❌ Server startup error:', err);
      process.exit(1); // Force exit so nodemon can restart cleanly
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
