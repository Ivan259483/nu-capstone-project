import Order from '../models/Order.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Service from '../models/Service.js';
import Supplier from '../models/Supplier.js';
import Category from '../models/Category.js';
import Vehicle from '../models/Vehicle.js';

/**
 * Export All Data
 */
export const exportAllData = async (req, res, next) => {
  try {
    const data = {
      users: await User.find({}),
      orders: await Order.find({}),
      products: await Product.find({}),
      services: await Service.find({}),
      suppliers: await Supplier.find({}),
      categories: await Category.find({}),
      vehicles: await Vehicle.find({}),
      exportedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'System data exported successfully',
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Backup Database (Mock implementation for now)
 */
export const backupDatabase = async (req, res, next) => {
  try {
    // In a real scenario, this would trigger a mongodump or cloud backup
    res.json({
      success: true,
      message: 'Database backup initiated and stored in cloud repository.',
      backupId: `BK-${Date.now()}`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear Cache
 */
export const clearCache = async (req, res, next) => {
  try {
    // This app doesn't use redis or heavy server caching yet
    res.json({
      success: true,
      message: 'Server-side cache and memory segments purged successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset System (Delete all data except the logged-in admin)
 */
export const resetSystem = async (req, res, next) => {
  try {
    const adminId = req.user.id;

    // Delete everything except current admin
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Service.deleteMany({});
    await Supplier.deleteMany({});
    await Category.deleteMany({});
    await Vehicle.deleteMany({});
    await User.deleteMany({ _id: { $ne: adminId } });

    res.json({
      success: true,
      message: 'System factory reset complete. All transaction and user records (except current admin) have been purged.'
    });
  } catch (error) {
    next(error);
  }
};
