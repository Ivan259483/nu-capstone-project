import Product from '../models/product.model.js';
import Notification from '../models/notification.model.js';
import Setting from '../models/setting.model.js';
import User from '../models/user.model.js';
import emailService from '../utils/emailService.utils.js';
import { FULL_ADMIN_ROLES } from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';

/**
 * Get all products
 */
export const getAllProducts = async (req, res, next) => {
  try {
    const { category, skip = 0, limit = 1000 } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const parsedSkip = parseInt(skip);
    const parsedLimit = parseInt(limit);

    const products = await Product.find(query)
      .populate('category')
      .populate('supplier')
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    const total = parsedLimit >= 500
      ? parsedSkip + products.length
      : await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        skip: parsedSkip,
        limit: parsedLimit,
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
    const { name, description, price, category, supplier, inventory, minLevel, maxLevel, unit, sku } = req.body;

    const isValidId = (id) => id && id.length === 24 && /^[0-9a-fA-F]+$/.test(id);

    // Auto-resolve Category
    let categoryId = null;
    if (category) {
      if (typeof category === 'object' && category._id) {
        categoryId = category._id;
      } else if (isValidId(category)) {
        categoryId = category;
      } else {
        const Category = (await import('../models/category.model.js')).default;
        let cat = await Category.findOne({ name: category });
        if (!cat) {
          cat = await Category.create({ name: category, slug: category.toLowerCase().replace(/\s+/g, '-') });
        }
        categoryId = cat._id;
      }
    }

    // Auto-resolve Supplier
    let supplierId = null;
    if (supplier) {
      if (typeof supplier === 'object' && supplier._id) {
        supplierId = supplier._id;
      } else if (isValidId(supplier)) {
        supplierId = supplier;
      } else {
        const Supplier = (await import('../models/supplier.model.js')).default;
        let sup = await Supplier.findOne({ name: supplier });
        if (!sup) {
          sup = await Supplier.create({ name: supplier });
        }
        supplierId = sup._id;
      }
    }

    const product = new Product({
      name,
      description,
      price,
      category: categoryId,
      supplier: supplierId,
      inventory,
      minLevel,
      maxLevel,
      unit,
      sku,
    });

    await product.save();

    logActivity({
      req, type: 'stock_in', module: 'Inventory', action: 'Product Created',
      description: `New product created: ${name} (stock: ${inventory || 0}).`,
      status: 'success', referenceId: product._id?.toString(),
      metadata: { productId: product._id, productName: name, initialStock: inventory || 0 },
    });

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
    const isValidId = (id) => id && id.length === 24 && /^[0-9a-fA-F]+$/.test(id);
    const updateData = { ...req.body };
    if (process.env.NODE_ENV === 'development') console.log(`[BACKEND RECEIVED UPDATE] ID: ${req.params.id}`, req.body);

    // ── Field normalization: accept frontend aliases ──
    if (updateData.stock !== undefined && updateData.inventory === undefined) {
      updateData.inventory = updateData.stock;
    }
    delete updateData.stock;

    if (updateData.cost !== undefined && updateData.price === undefined) {
      updateData.price = updateData.cost;
    }
    delete updateData.cost;

    // Strip non-schema fields that the frontend may spread
    delete updateData.id;
    delete updateData._id;
    delete updateData.image;
    delete updateData.__v;
    
    // Auto-resolve Category
    if (updateData.category === "") {
        updateData.category = null;
    } else if (updateData.category && !isValidId(updateData.category)) {
        const Category = (await import('../models/category.model.js')).default;
        let cat = await Category.findOne({ name: updateData.category });
        if (!cat) {
          cat = await Category.create({ name: updateData.category, slug: updateData.category.toLowerCase().replace(/\s+/g, '-') });
        }
        updateData.category = cat._id;
    }

    // Auto-resolve Supplier
    if (updateData.supplier === "") {
        updateData.supplier = null;
    } else if (updateData.supplier && !isValidId(updateData.supplier)) {
        const Supplier = (await import('../models/supplier.model.js')).default;
        let sup = await Supplier.findOne({ name: updateData.supplier });
        if (!sup) {
          sup = await Supplier.create({ name: updateData.supplier });
        }
        updateData.supplier = sup._id;
    }

    if (process.env.NODE_ENV === 'development') console.log(`[BACKEND NORMALIZED PAYLOAD]`, updateData);

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
      { new: true, runValidators: true }
    );
    if (process.env.NODE_ENV === 'development') console.log(`[BACKEND DB RESULT]`, product);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Log inventory edit
    logActivity({
      req, type: 'inventory_edit', module: 'Inventory', action: 'Product Updated',
      description: `${req.user?.name || 'Admin'} updated product: ${product.name}.`,
      status: 'success', referenceId: product._id?.toString(),
      metadata: { productId: product._id, productName: product.name, updatedFields: Object.keys(updateData) },
    });

    // Check for Low Stock
    if (product.inventory <= product.minLevel) {
      logActivity({
        req, type: 'low_stock', module: 'Inventory', action: 'Low Stock Alert',
        description: `${product.name} is below minimum level (${product.inventory}/${product.minLevel}).`,
        status: 'warning', referenceId: product._id?.toString(),
        metadata: { productId: product._id, productName: product.name, stock: product.inventory, minLevel: product.minLevel },
      });

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
            recipientRole: 'admin_family',
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
          const admins = await User.find({ role: { $in: FULL_ADMIN_ROLES }, isActive: true });
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

    const responseData = {
      success: true,
      message: 'Product updated successfully',
      data: product,
    };
    if (process.env.NODE_ENV === 'development') console.log(`[BACKEND SENDING RESPONSE]`, responseData);
    res.json(responseData);
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

    // Create activity log via centralized logger
    logActivity({
      req, type: 'stock_out', module: 'Inventory', action: 'Inventory Consumed',
      description: `Used ${quantity} ${product.unit || 'units'} of ${product.name}.`,
      userId, userName, status: 'success', referenceId: product._id?.toString(),
      metadata: { productId: product._id, productName: product.name, quantity, previousStock: product.inventory + quantity, newStock: product.inventory },
    });

    // Check for low stock and create notification
    if (product.inventory <= product.minLevel) {
      try {
        const Notification = (await import('../models/notification.model.js')).default;
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
            recipientRole: 'admin_family',
            link: '/admin/inventory',
            metadata: { productId: product._id }
          });

          logActivity({
            req, type: 'low_stock', module: 'Inventory', action: 'Low Stock Alert',
            description: `${product.name} is below minimum level (${product.inventory}/${product.minLevel}).`,
            userId, userName, status: 'warning', referenceId: product._id?.toString(),
            metadata: { productId: product._id, productName: product.name },
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

    logActivity({
      req, type: 'inventory_edit', module: 'Inventory', action: 'Product Deleted',
      description: `${req.user?.name || 'Admin'} deleted product: ${product.name}.`,
      status: 'warning', referenceId: product._id?.toString(),
      metadata: { productId: product._id, productName: product.name },
    });

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
