import Store from '../models/store.model.js';
import { isFullAdminRole } from '../constants/roles.js';

/**
 * Get all stores
 */
export const getAllStores = async (req, res, next) => {
  try {
    const stores = await Store.find({ isActive: true }).populate({
      path: 'manager',
      select: 'name email role',
    });

    res.json({
      success: true,
      data: stores,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get store by ID
 */
export const getStoreById = async (req, res, next) => {
  try {
    const store = await Store.findById(req.params.id).populate({
      path: 'manager',
      select: 'name email role',
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    res.json({
      success: true,
      data: store,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create store
 */
export const createStore = async (req, res, next) => {
  try {
    const { name, address, city, state, zipCode, phone, email, manager } = req.body;

    const store = new Store({
      name,
      address,
      city,
      state,
      zipCode,
      phone,
      email,
      manager,
    });

    await store.save();

    res.status(201).json({
      success: true,
      message: 'Store created successfully',
      data: store,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update store
 */
export const updateStore = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Invalid or missing user session',
      });
    }

    const store = await Store.findById(req.params.id);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    const isAdmin = isFullAdminRole(req.user.role);
    const isManager = store.manager && store.manager.toString() === req.user.id;

    if (!isAdmin && !isManager) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own store',
      });
    }

    Object.assign(store, req.body);
    await store.save();

    res.json({
      success: true,
      message: 'Store updated successfully',
      data: store,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete store
 */
export const deleteStore = async (req, res, next) => {
  try {
    const store = await Store.findByIdAndDelete(req.params.id);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    res.json({
      success: true,
      message: 'Store deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
