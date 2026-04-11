import Product from '../models/product.model.js';
import Service from '../models/service.model.js';
import Notification from '../models/notification.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';

const LOW_STOCK_THRESHOLD = 10;

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
      recipientRole: 'admin_family',
      link: '/admin/inventory',
      metadata,
    });
  } catch (error) {
    console.error('[INVENTORY] Failed to create notification:', error.message);
  }
};

// ─── Keyword-based fallback mapping ──────────────────────────────────
const INVENTORY_MAP = [
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

/**
 * Resolve which products + quantities are needed for an order's service.
 * Uses the service recipe first, then falls back to keyword mapping.
 */
const resolveRequiredMaterials = async (order) => {
  const resolved = [];
  const insufficient = [];

  // 1. Try to load the service from the order items
  let service = null;
  let serviceLabel = order.serviceType || '';

  if (order.items?.length) {
    const itemProduct = order.items[0]?.product;
    if (itemProduct) {
      service = await Service.findById(itemProduct);
      if (service?.name) serviceLabel = service.name;
    }
  }

  // 2. If service has a recipe, use it
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
          metadata: { serviceId: service._id, productName: entry.productName, quantity },
        });
        continue;
      }

      const available = (product.inventory || 0) - (product.reserved || 0);
      if (available < quantity) {
        insufficient.push({ product, quantity, serviceName: service.name });
        continue;
      }

      resolved.push({ product, quantity });
    }
  }

  // 3. Keyword-based fallback
  const label = (serviceLabel || '').toLowerCase();
  const entry = INVENTORY_MAP.find((item) => label.includes(item.keyword));
  if (entry) {
    for (const mapping of entry.items) {
      let product = null;
      for (const name of mapping.productNames) {
        product = await findProductByName(name);
        if (product) break;
      }
      if (!product) continue;

      const alreadyIncluded = resolved.some(
        (item) => item.product._id.toString() === product._id.toString()
      );
      if (alreadyIncluded) continue;

      const available = (product.inventory || 0) - (product.reserved || 0);
      if (available < mapping.quantity) {
        insufficient.push({ product, quantity: mapping.quantity, serviceName: serviceLabel });
        continue;
      }

      resolved.push({ product, quantity: mapping.quantity });
    }
  }

  return { resolved, insufficient };
};

// ═══════════════════════════════════════════════════════════════════════
//  PHASE 1 — RESERVE (called at booking confirmation)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reserve inventory materials for a confirmed booking.
 * Increments `product.reserved` and stores reservation details on the order.
 *
 * @param {Document} order - Mongoose order document (must be saved by caller)
 * @returns {{ reserved: number, warnings: Array }}
 */
export const reserveInventory = async (order) => {
  // Skip if already reserved
  if (order.inventoryReservation?.status === 'reserved') {
    return { reserved: 0, warnings: [] };
  }
  // Skip if inventory was already fully deducted (legacy path)
  if (order.inventoryDeductedAt) {
    return { reserved: 0, warnings: [] };
  }

  const { resolved, insufficient } = await resolveRequiredMaterials(order);

  // Warn about insufficient stock
  for (const item of insufficient) {
    await notifyInventoryIssue({
      title: 'Inventory Reservation Warning',
      message: `Cannot reserve ${item.product.name} for ${item.serviceName || 'service'} — needed ${item.quantity}, available ${(item.product.inventory || 0) - (item.product.reserved || 0)}`,
      metadata: {
        productId: item.product._id,
        productName: item.product.name,
        required: item.quantity,
        available: (item.product.inventory || 0) - (item.product.reserved || 0),
        orderId: order._id,
      },
    });
  }

  // Reserve stock
  const reservationItems = [];
  for (const item of resolved) {
    item.product.reserved = (item.product.reserved || 0) + item.quantity;
    await item.product.save();

    reservationItems.push({
      product: item.product._id,
      productName: item.product.name,
      quantity: item.quantity,
      reservedAt: new Date(),
    });
  }

  // Store reservation metadata on the order
  order.inventoryReservation = {
    items: reservationItems,
    status: 'reserved',
    reservedAt: new Date(),
  };

  console.log(`[INVENTORY] Reserved ${resolved.length} item(s) for order ${order.orderNumber || order._id}`);

  return { reserved: resolved.length, warnings: insufficient.map((i) => i.product.name) };
};

// ═══════════════════════════════════════════════════════════════════════
//  PHASE 2 — COMMIT (called at payment)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Commit reservation → actual deduction.
 * Decrements `product.inventory` and `product.reserved`, creates ledger entries.
 *
 * @param {Document} order - Mongoose order document (must be saved by caller)
 */
export const commitReservation = async (order) => {
  // If already committed or no reservation, fall back to legacy deduction
  if (order.inventoryReservation?.status === 'committed') {
    return { committed: 0 };
  }

  // If there's no reservation but inventory hasn't been deducted yet,
  // the order may have been created before the reservation system.
  // In that case, we fall back to the legacy direct-deduction approach.
  if (!order.inventoryReservation || order.inventoryReservation.status !== 'reserved') {
    if (!order.inventoryDeductedAt) {
      // Legacy path: direct deduction without reservation
      return await legacyDirectDeduction(order);
    }
    return { committed: 0 };
  }

  let committed = 0;
  for (const item of order.inventoryReservation.items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    const previousInventory = product.inventory || 0;
    product.inventory = Math.max(previousInventory - item.quantity, 0);
    product.reserved = Math.max((product.reserved || 0) - item.quantity, 0);
    await product.save();
    committed++;

    // Ledger entry
    try {
      await InventoryTransaction.create({
        product: product._id,
        type: 'out',
        quantity: item.quantity,
        previousStock: previousInventory,
        newStock: product.inventory,
        referenceId: order._id,
        referenceModel: 'Order',
        notes: `Committed reservation for order ${order.orderNumber || order._id}`,
      });
    } catch (err) {
      console.error('[INVENTORY] Ledger error:', err.message);
    }

    // Low stock warning
    if (previousInventory > LOW_STOCK_THRESHOLD && product.inventory <= LOW_STOCK_THRESHOLD) {
      await notifyInventoryIssue({
        title: 'Low Stock',
        message: `Low Stock: ${product.name} only has ${product.inventory} units left`,
        metadata: {
          productId: product._id,
          productName: product.name,
          threshold: LOW_STOCK_THRESHOLD,
          remaining: product.inventory,
        },
      });
    }
  }

  order.inventoryReservation.status = 'committed';
  order.inventoryReservation.committedAt = new Date();
  order.inventoryDeductedAt = new Date();

  console.log(`[INVENTORY] Committed ${committed} reservation(s) for order ${order.orderNumber || order._id}`);
  return { committed };
};

// ═══════════════════════════════════════════════════════════════════════
//  PHASE 3 — RELEASE (called on cancellation)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Release reserved inventory when a booking is cancelled.
 *
 * @param {Document} order - Mongoose order document (must be saved by caller)
 */
export const releaseReservation = async (order) => {
  if (!order.inventoryReservation || order.inventoryReservation.status !== 'reserved') {
    return { released: 0 };
  }

  let released = 0;
  for (const item of order.inventoryReservation.items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    product.reserved = Math.max((product.reserved || 0) - item.quantity, 0);
    await product.save();
    released++;
  }

  order.inventoryReservation.status = 'released';

  console.log(`[INVENTORY] Released ${released} reservation(s) for cancelled order ${order.orderNumber || order._id}`);
  return { released };
};

// ═══════════════════════════════════════════════════════════════════════
//  LEGACY FALLBACK — for orders created before reservation system
// ═══════════════════════════════════════════════════════════════════════

const legacyDirectDeduction = async (order) => {
  const { resolved, insufficient } = await resolveRequiredMaterials(order);

  for (const item of insufficient) {
    await notifyInventoryIssue({
      title: 'Inventory Alert',
      message: `${item.product.name} insufficient for ${item.serviceName || 'service'} (needed ${item.quantity}, available ${item.product.inventory})`,
      metadata: {
        productId: item.product._id,
        required: item.quantity,
        available: item.product.inventory,
        orderId: order._id,
      },
    });
  }

  for (const item of resolved) {
    const prev = item.product.inventory || 0;
    item.product.inventory = Math.max(prev - item.quantity, 0);
    await item.product.save();

    try {
      await InventoryTransaction.create({
        product: item.product._id,
        type: 'out',
        quantity: item.quantity,
        previousStock: prev,
        newStock: item.product.inventory,
        referenceId: order._id,
        referenceModel: 'Order',
        notes: `Direct deduction (legacy) for order ${order.orderNumber || order._id}`,
      });
    } catch (err) {
      console.error('[INVENTORY] Ledger error:', err.message);
    }

    if (prev > LOW_STOCK_THRESHOLD && item.product.inventory <= LOW_STOCK_THRESHOLD) {
      await notifyInventoryIssue({
        title: 'Low Stock',
        message: `Low Stock: ${item.product.name} only has ${item.product.inventory} units left`,
        metadata: {
          productId: item.product._id,
          productName: item.product.name,
          remaining: item.product.inventory,
        },
      });
    }
  }

  order.inventoryDeductedAt = new Date();
  return { committed: resolved.length };
};

// ═══════════════════════════════════════════════════════════════════════
//  RESERVATION EXPIRY — auto-release after 24 hours
// ═══════════════════════════════════════════════════════════════════════

const RESERVATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cleanup expired inventory reservations.
 * Releases stock held for bookings that are still 'pending' after 24 hours.
 *
 * Should be called periodically (e.g. every hour via setInterval).
 */
export const cleanupExpiredReservations = async () => {
  // Lazy-import Order to avoid circular dependency at module load time
  const Order = (await import('../models/order.model.js')).default;
  const expiryThreshold = new Date(Date.now() - RESERVATION_EXPIRY_MS);

  try {
    // Find orders that:
    // 1. Have a reservation in 'reserved' status
    // 2. Were reserved before the expiry threshold
    // 3. Are still in 'pending' status (admin never confirmed)
    const expiredOrders = await Order.find({
      'inventoryReservation.status': 'reserved',
      'inventoryReservation.reservedAt': { $lt: expiryThreshold },
      status: 'pending',
    });

    if (expiredOrders.length === 0) return { released: 0 };

    let totalReleased = 0;

    for (const order of expiredOrders) {
      try {
        const result = await releaseReservation(order);
        totalReleased += result.released;
        await order.save();

        // Notify admin about the expiry
        await notifyInventoryIssue({
          title: 'Reservation Expired',
          message: `Inventory reservation for booking ${order.orderNumber || order._id} expired after 24h (order still pending). Stock released.`,
          metadata: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            releasedItems: result.released,
          },
        });

        console.log(`[INVENTORY] Auto-released expired reservation for order ${order.orderNumber || order._id}`);
      } catch (err) {
        console.error(`[INVENTORY] Failed to release expired reservation for ${order._id}:`, err.message);
      }
    }

    if (totalReleased > 0) {
      console.log(`[INVENTORY] Cleanup: released ${totalReleased} expired reservation(s) from ${expiredOrders.length} order(s)`);
    }

    return { released: totalReleased, orders: expiredOrders.length };
  } catch (err) {
    console.error('[INVENTORY] Cleanup expired reservations failed:', err.message);
    return { released: 0, error: err.message };
  }
};
