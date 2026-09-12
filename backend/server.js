// Load backend/.env before evaluating modules that read process.env at import time.
// config/environment.js resolves the file relative to itself, so startup does not
// depend on whether Node was launched from the repository root or backend/.
import { config } from './config/environment.js';
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

console.log('Offline damage detection enabled:', true);
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.middleware.js';
import { initializeMailer } from './utils/mail.utils.js'; // Import mailer
import { isCloudinaryConfigured, getCloudinaryMissingConfigMessage, getCloudinaryRuntimeDiagnostics } from './utils/cloudinaryStorage.utils.js';
import { migrateLegacyUserRoles } from './utils/migrateLegacyUserRoles.utils.js';
import { initSocket, initChangeStreams } from './utils/socket.utils.js';
import { cleanupExpiredReservations } from './utils/inventory.utils.js';
import { startAppointmentReminderScheduler } from './services/appointmentReminder.service.js';
import { startQualityNotificationRetryScheduler } from './services/qualityNotification.service.js';
import { buildStaticArCsp } from './utils/csp.utils.js';
import { isConfiguredCorsOriginAllowed } from './utils/origin.utils.js';
import { authenticate, authorize } from './middleware/auth.middleware.js';
import {
  enforceSystemLifecycle,
  runTrackedSystemMutation,
} from './middleware/systemLifecycle.middleware.js';
import { BOOKING_MANAGER_ROLES } from './constants/roles.js';
import { getSystemState } from './services/systemState.service.js';
import User from './models/user.model.js';
import {
  startExternalCleanupWorker,
  stopExternalCleanupWorker,
} from './services/systemExternalCleanup.service.js';

// ============================================
// EMAIL CONFIGURATION
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
import vehicleIntelligenceRoutes from './routes/vehicleIntelligence.routes.js';
import activityRoutes from './routes/activity.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import chatRoutes from './routes/chatbot.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import salesAnalyticsRoutes from './routes/salesAnalytics.routes.js';
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
app.disable('x-powered-by');
const backendProcessStartedAt = Date.now();

// Trust proxy for rate limiting (Vercel, Render, Heroku, etc.)
app.set('trust proxy', 1);

// Helmet runs before every route, including early-returning CORS preflights and
// Stripe webhook errors. Browser CSP is configured only on routes that serve HTML.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  strictTransportSecurity: config.nodeEnv === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: false }
    : false,
}));

// Correlate frontend, API, database, and email-provider logs without exposing
// credentials or OTP values. A valid client ID is preserved across Vercel/Render.
app.use((req, res, next) => {
  const supplied = String(req.get('x-request-id') || '').trim();
  req.id = /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
  req.backendProcessStartedAt = backendProcessStartedAt;
  res.setHeader('X-Request-ID', req.id);
  next();
});

const isHealthPath = (req) => req.path === '/api/health' || req.path === '/health';
app.use((req, res, next) => {
  if (!isHealthPath(req)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  res.setHeader('X-API-Version', '1.0.0');
  next();
});

// Stripe signature verification requires the unparsed request bytes. Keep this
// route before express.json(), but after non-body-consuming security middleware.
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

const corsOptionsDelegate = (req, callback) => {
  // Public GLB delivery is intentionally credential-free and cross-origin so
  // Model Viewer/native AR clients can range-fetch host-allowlisted binaries.
  if (req.path === '/api/ai/proxy-glb') {
    return callback(null, {
      origin: '*',
      credentials: false,
      methods: ['GET', 'HEAD', 'OPTIONS'],
      allowedHeaders: ['Range'],
      exposedHeaders: [
        'Accept-Ranges',
        'Content-Length',
        'Content-Range',
        'X-Operational-Data-Epoch',
      ],
      maxAge: 86400,
    });
  }

  return callback(null, {
    origin(origin, originCallback) {
      return originCallback(null, isConfiguredCorsOriginAllowed(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Client-Type', 'Idempotency-Key', 'X-Idempotency-Key', 'ngrok-skip-browser-warning'],
    exposedHeaders: [
      'X-Request-ID',
      'Server-Timing',
      'Content-Disposition',
      'X-AutoSPF-Backup-Id',
      'X-AutoSPF-Export-Id',
      'X-AutoSPF-Checksum',
      'X-Operational-Data-Epoch',
    ],
  });
};

app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

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
  skip: (req) => {
    const path = req.path || '';
    const original = req.originalUrl || '';
    return path === '/health' || original.startsWith('/api/health');
  },
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
const redactLogUrl = (rawUrl) => {
  try {
    const parsed = new URL(String(rawUrl || '/'), 'http://log.invalid');
    const redactedPath = parsed.pathname.replace(
      /\/(tracker|ar-session|webar-session|scan)\/[^/]+/gi,
      '/$1/[redacted]'
    );
    return parsed.search ? `${redactedPath}?[redacted]` : redactedPath;
  } catch {
    return '/[unparseable-url]';
  }
};

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const logPath = redactLogUrl(req.originalUrl || req.url);
  console.log(`[${new Date().toISOString()}] ${req.method} ${logPath} requestId=${req.id}`);
  if (req.method === 'OPTIONS') {
    console.log('  -> Preflight request');
  }
  
  // Track response time for performance monitoring
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (logPath === '/api/auth/login' || durationMs > 1000) {
      console.info('[HTTP_REQUEST]', JSON.stringify({
        event: 'request_completed',
        requestId: req.id,
        method: req.method,
        path: logPath,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        processUptimeMs: Date.now() - backendProcessStartedAt,
      }));
    }
    if (durationMs > 1000) {
      const breakdown = (res.locals.performanceTimings || [])
        .map((entry) => `${entry.kind}.${entry.name}=${entry.durationMs.toFixed(1)}ms`)
        .join(', ');
      console.warn(
        `⚠️ SLOW REQUEST: ${req.method} ${logPath} — ${durationMs.toFixed(0)}ms${breakdown ? ` [${breakdown}]` : ''}`
      );
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

// Attach authoritative lifecycle state to every API request, reject writes
// while a destructive lease is active, and enforce archived/read-only gates.
// Stripe's raw signed webhook is intentionally mounted earlier and performs
// its own archived reconciliation handling after signature verification.
app.use('/api', enforceSystemLifecycle);
app.use('/api', (req, res, next) => {
  if (req.systemState?.mode !== 'archived' || !['GET', 'HEAD'].includes(req.method)) {
    return next();
  }
  const path = String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  if (path === '/api/system/status') return next();
  return authenticate(req, res, () => {
    req.archivedLifecycleAuthenticated = true;
    next();
  });
});

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
app.use('/api/vehicle-intelligence', vehicleIntelligenceRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/sales-analytics', salesAnalyticsRoutes);
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
    // Public model/target assets are intentionally consumable by the isolated
    // AR documents. The JSON API retains Helmet's same-origin CORP policy.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (path.extname(filePath).toLowerCase() !== '.html') return;

    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), usb=()');
    res.setHeader('Content-Security-Policy', buildStaticArCsp(filePath, config.nodeEnv));

    if (filePath.includes(`${path.sep}public${path.sep}webar${path.sep}`)) {
      // CSP frame-ancestors is the authoritative control for this intentional
      // cross-origin embed. X-Frame-Options cannot express an origin allowlist.
      res.removeHeader('X-Frame-Options');
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
    // SMTP verification can take several seconds on a fresh container. Start it
    // in parallel with MongoDB so cold-start work is not unnecessarily serial.
    const mailerInitialization = (async () => {
      console.log(`\n📧 Initializing ${config.emailProvider} mailer...`);
      try {
        await initializeMailer();
        console.log(`✅ ${config.emailProvider} mailer initialized\n`);
      } catch (mailerError) {
        console.error('❌ Failed to initialize mailer:', mailerError.message);
        console.error('   OTP delivery will fail closed until the provider recovers.\n');
      }
    })();

    // Cloudinary is required for permanent QC/tracker photo storage. When it is
    // unusable, uploads silently fall back to embedding base64 image data
    // directly in Order documents — this is the historical root cause of
    // multi-second tracker-media/stage-photo latency, so surface it loudly at
    // boot instead of letting it fail silently on every upload.
    if (!isCloudinaryConfigured()) {
      console.error(`❌ Cloudinary is not configured: ${getCloudinaryMissingConfigMessage()}`);
      console.error('   Tracker/QC photo uploads will fall back to inline base64 storage in MongoDB until this is fixed.\n');
    } else {
      const diag = getCloudinaryRuntimeDiagnostics();
      console.log(
        `☁️  Cloudinary configured: cloudName=${diag.cloudName} uploadMode=${diag.uploadMode} ` +
        `(auth fields: ${diag.authFieldNames.join(', ')})`
      );
      if (diag.uploadMode === 'unsigned') {
        console.warn(
          '⚠️  Cloudinary is running in UNSIGNED mode (CLOUDINARY_UPLOAD_PRESET only, no CLOUDINARY_API_SECRET).\n' +
          '   This requires that preset to exist in the Cloudinary dashboard as an UNSIGNED upload preset.\n' +
          '   If uploads fail with "Upload preset not found", either create that preset as unsigned in Cloudinary,\n' +
          '   or set CLOUDINARY_API_SECRET to switch to signed uploads (recommended — no preset needed).'
        );
      }
    }

    // Connect to MongoDB Atlas
    await connectDB();
    console.log('✅ MongoDB connected successfully');
    await migrateLegacyUserRoles();
    const startupSystemState = await getSystemState();
    try {
      if (!startupSystemState.protectedAdministratorId) {
        const error = new Error('No protected administrator ID is stored. Run the one-time protected-administrator migration.');
        error.code = 'PROTECTED_ADMIN_NOT_INITIALIZED';
        throw error;
      }
      const usableProtectedAdministrator = await User.exists({
        _id: startupSystemState.protectedAdministratorId,
        role: 'administrator',
        isActive: true,
        isVerified: true,
        status: 'active',
        isDeleted: { $ne: true },
      });
      if (!usableProtectedAdministrator) {
        const error = new Error('The stored protected administrator ID does not resolve to a usable verified Administrator.');
        error.code = 'PROTECTED_ADMIN_INVALID';
        throw error;
      }
      console.log('🔐 Protected administrator lifecycle binding verified');
    } catch (error) {
      // Runtime startup validates only the persisted ID. Email lookup and the
      // initial binding are exclusively owned by the one-time migration.
      console.error(`[SYSTEM_STATE] Protected administrator validation failed (${error.code || 'UNKNOWN'}): ${error.message}`);
    }
    if (startupSystemState.mode !== 'archived') {
      startExternalCleanupWorker();
    } else {
      console.log('[SYSTEM_STATE] Archived startup: external cleanup worker remains stopped.');
    }
    // Do not hold the HTTP listener behind provider verification. If the first
    // login arrives while warm-up is still running, initializeMailer() joins
    // the same single-flight promise and the request-level timeout remains in
    // control; health checks can succeed as soon as Mongo is ready.
    void mailerInitialization;

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
      console.info('[CHECKOUT-TARGET] backend', {
        pid: process.pid,
        port: config.port,
        nodeEnv: config.nodeEnv,
        cwd: process.cwd(),
        checkoutRoute: `${proto}://localhost:${config.port}/api/orders/:orderId/billing/checkout`,
      });

      // ── Inventory Reservation Expiry Scheduler ──────────────────────
      // Runs every hour to release inventory held for bookings still
      // in 'pending' status after 24 hours.
      const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
      setInterval(async () => {
        try {
          const result = await runTrackedSystemMutation(
            () => cleanupExpiredReservations(),
          );
          if (result?.skipped) return;
          if (result.released > 0) {
            console.log(`[SCHEDULER] 🧹 Released ${result.released} expired inventory reservation(s)`);
          }
        } catch (err) {
          console.error('[SCHEDULER] Reservation cleanup failed:', err.message);
        }
      }, CLEANUP_INTERVAL_MS);
      console.log(`⏰ Inventory reservation expiry scheduler started (every 60 min, 24h TTL)`);
      startAppointmentReminderScheduler();
      console.log('⏰ Appointment reminder scheduler started (every 15 min)');
      startQualityNotificationRetryScheduler();
      console.log('⏰ Quality notification recovery scheduler started (every 1 min)');
    });

    server.on('error', (err) => {
      console.error('❌ Server startup error:', err);
      process.exit(1); // Force exit so nodemon can restart cleanly
    });

    let shutdownStarted = false;
    const shutdown = (signal) => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      console.log(`[SERVER] ${signal} received; stopping background workers.`);
      stopExternalCleanupWorker();
      server.close(async () => {
        try {
          await mongoose.disconnect();
        } finally {
          process.exit(0);
        }
      });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    stopExternalCleanupWorker();
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

if (process.env.SKIP_SERVER_START !== 'true') {
  startServer();
}

export default app;
