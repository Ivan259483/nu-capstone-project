import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config/environment.js';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import orderRoutes from './routes/orders.js';
import storeRoutes from './routes/stores.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import serviceRoutes from './routes/services.js';

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://172.20.10.11:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/stores', storeRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/services', serviceRoutes);

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



    // Start listening on all interfaces (0.0.0.0)
    const server = app.listen(config.port, '0.0.0.0', () => {
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
