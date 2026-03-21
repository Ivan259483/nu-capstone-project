import Product from '../models/Product.js';
import Notification from '../models/Notification.js';
import Setting from '../models/Setting.js';
import User from '../models/User.js';
import emailService from '../utils/emailService.js';

/**
 * Get all products
 */
export const getAllProducts = async (req, res, next) => {
  try {
    const { category, skip = 0, limit = 10 } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const products = await Product.find(query)
      .populate('category')
      .populate('supplier')
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        skip: parseInt(skip),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get product by ID
 */
export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category')
      .populate('supplier');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create product
 */
export const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, category, supplier, inventory, minLevel, sku } = req.body;

    // Prevent Cast to ObjectId errors by setting empty strings to null
    const isValidId = (id) => id && id.length === 24 && /^[0-9a-fA-F]+$/.test(id);

    const product = new Product({
      name,
      description,
      price,
      category: isValidId(category) ? category : null,
      supplier: isValidId(supplier) ? supplier : null,
      inventory,
      minLevel,
      sku,
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update product
 */
export const updateProduct = async (req, res, next) => {
  try {
    // Prevent Cast to ObjectId errors in body
    const isValidId = (id) => id && id.length === 24 && /^[0-9a-fA-F]+$/.test(id);
    const updateData = { ...req.body };
    
    if (updateData.category === "") updateData.category = null;
    else if (updateData.category && !isValidId(updateData.category)) delete updateData.category;

    if (updateData.supplier === "") updateData.supplier = null;
    else if (updateData.supplier && !isValidId(updateData.supplier)) delete updateData.supplier;

    // If updating inventory, validate stock won't go negative
    if (updateData.inventory !== undefined) {
      const existingProduct = await Product.findById(req.params.id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }
      
      // Check if new inventory value would be negative
      if (updateData.inventory < 0) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Current stock: ${existingProduct.inventory} units`,
        });
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Check for Low Stock
    if (product.inventory <= product.minLevel) {
      // 1. Create In-App Notification
      try {
        const existingNotification = await Notification.findOne({
          type: 'inventory',
          'metadata.productId': product._id,
          isRead: false
        });

        if (!existingNotification) {
          await Notification.create({
            title: 'Low Stock Alert',
            message: `${product.name} is running low (${product.inventory} left)`,
            type: 'inventory',
            recipientRole: 'admin',
            link: '/admin/inventory',
            metadata: { productId: product._id }
          });
        }
      } catch (notifyErr) {
        console.error('Failed to create low stock notification:', notifyErr);
      }

      // 2. Send Email Alert if enabled
      try {
        const settings = await Setting.findOne();
        if (settings?.notifications?.lowStockAlerts) {
          const admins = await User.find({ role: 'admin', isActive: true });
          const adminEmails = admins.map(a => a.email);
          
          if (adminEmails.length > 0) {
            await emailService.sendLowStockAlert(adminEmails, {
              name: product.name,
              stock: product.inventory,
              minLevel: product.minLevel,
              unit: product.unit || 'units'
            });
          }
        }
      } catch (emailErr) {
        console.error('Failed to send low stock email:', emailErr);
      }
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Consume inventory (decrement stock with activity logging)
 */
export const consumeInventory = async (req, res, next) => {
  try {
    const { productId, quantity, userId, userName, jobId } = req.body;

    if (!productId || !quantity || !userId || !userName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: productId, quantity, userId, userName',
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Check stock availability
    if (product.inventory < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${product.inventory} ${product.unit || 'units'}`,
      });
    }

    // Atomic stock update
    const newStock = product.inventory - quantity;
    product.inventory = newStock;
    await product.save();

    // Create activity log
    try {
      const ActivityLog = (await import('../models/ActivityLog.js')).default;
      await ActivityLog.create({
        type: 'inventory_update',
        title: 'Inventory Used',
        description: `Used ${quantity} ${product.unit || 'units'} of ${product.name}`,
        userId,
        userName,
        metadata: {
          productId: product._id,
          productName: product.name,
          quantity,
          jobId: jobId || 'general',
          previousStock: product.inventory + quantity,
          newStock: product.inventory
        }
      });
    } catch (logErr) {
      console.error('Failed to create activity log:', logErr);
      // Don't fail the request if logging fails
    }

    // Check for low stock and create notification
    if (product.inventory <= product.minLevel) {
      try {
        const Notification = (await import ('../models/Notification.js')).default;
        const existingNotification = await Notification.findOne({
          type: 'inventory',
          'metadata.productId': product._id,
          isRead: false
        });

        if (!existingNotification) {
          await Notification.create({
            title: 'Low Stock Alert',
            message: `${product.name} is running low (${product.inventory} left)`,
            type: 'inventory',
            recipientRole: 'admin',
            link: '/admin/inventory',
            metadata: { productId: product._id }
          });

          // Create low stock activity log
          const ActivityLog = (await import('../models/ActivityLog.js')).default;
          await ActivityLog.create({
            type: 'low_stock',
            title: 'Low Stock Alert',
            description: `${product.name} is below minimum level (${product.inventory}/${product.minLevel})`,
            userId,
            userName,
            metadata: { productId: product._id, productName: product.name }
          });
        }
      } catch (notifyErr) {
        console.error('Failed to create low stock notification:', notifyErr);
      }
    }

    res.json({
      success: true,
      message: 'Inventory consumed successfully',
      data: {
        product: {
          id: product._id,
          name: product.name,
          inventory: product.inventory,
          unit: product.unit
        },
        consumed: quantity,
        remaining: product.inventory
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete product
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
