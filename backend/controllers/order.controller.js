import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import Product from '../models/product.model.js';
import Service from '../models/service.model.js';
import Vehicle from '../models/vehicle.model.js';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js';
import Setting from '../models/setting.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';
import emailService from '../utils/emailService.utils.js';
import { getIO } from '../utils/socket.utils.js';
import { jsPDF } from 'jspdf';
import {
  FULL_ADMIN_ROLES,
  isBookingManagerRole,
  isCustomerRole,
  isFullAdminRole,
  isPosManagerRole,
  isServiceStaffRole,
} from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';

const DEFAULT_SERVICE_STEPS = [
  { name: 'Initial Wash & Prep', status: 'pending' },
  { name: 'Surface Decontamination', status: 'pending' },
  { name: 'Main Service Execution', status: 'pending' },
  { name: 'Quality Inspection', status: 'pending' },
  { name: 'Customer Handover Ready', status: 'pending' }
];

const LOW_STOCK_THRESHOLD = 10;

const SIGNED_URL_QUERY_REGEX = /(X-Amz-Signature|Signature|sig|signed)=/i;
const isDataUrl = (value = '') => typeof value === 'string' && value.startsWith('data:');
const isSignedUrl = (value = '') =>
  typeof value === 'string' &&
  (value.startsWith('https://') || value.startsWith('s3://')) &&
  SIGNED_URL_QUERY_REGEX.test(value);

const SERVICE_INVENTORY_MAP = [
  {
    keyword: 'wash',
    productNames: ['Premium Wash Soap', 'Car Wash Shampoo', 'Wash Shampoo', 'Wash Soap'],
    quantity: 0.5
  },
  {
    keyword: 'wax',
    productNames: ['Wax Sealant', 'Wax', 'Ceramic Coating'],
    quantity: 1
  },
  {
    keyword: 'detail',
    productNames: ['Interior Detailer', 'Detailing Spray', 'Detailer'],
    quantity: 1
  }
];

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CUSTOMER_STATUS_VALUES = ['queued', 'in-progress', 'finishing', 'ready'];

const normalizeCustomerStatus = (value = '') => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!CUSTOMER_STATUS_VALUES.includes(normalized)) {
    return null;
  }
  return normalized;
};

const emitCustomerStatusUpdate = (order) => {
  try {
    const io = getIO();
    const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
    if (!customerId) return;
    io.to(`user:${customerId.toString()}`).emit('booking:status', {
      bookingId: order._id?.toString?.() || order.id,
      customerStatus: order.customerStatus,
      status: order.status,
      paymentStatus: order.paymentStatus,
      updatedAt: order.customerStatusUpdatedAt || new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Socket not initialized for status update:', error.message);
  }
};

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
  } catch (notifyErr) {
    console.error('Failed to create inventory notification:', notifyErr);
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
const normalizeCurrency = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = value.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(numeric);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

const formatBookingDto = (orderDoc) => {
  if (!orderDoc) return null;
  const order = typeof orderDoc.toObject === 'function'
    ? orderDoc.toObject({ virtuals: true })
    : orderDoc;

  const id = order._id?.toString?.() || order.id;
  const customerId = typeof order.customer === 'object'
    ? (order.customer?._id?.toString?.() || order.customer?.id)
    : (order.customer?.toString?.() || order.customer);

  const vehicleInfo =
    order.vehicleInfo
    || [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ').trim();

  const serviceName =
    order.serviceName
    || order.serviceType
    || order.items?.[0]?.product?.name
    || 'Service';

  const customerName =
    order.customerName
    || (typeof order.customer === 'object' ? order.customer?.name : '')
    || '';

  const customerPhone =
    order.customerPhone
    || (typeof order.customer === 'object' ? order.customer?.phone : '')
    || '';

  return {
    ...order,
    id,
    customerId,
    serviceName,
    date: order.date || order.bookingDate || '',
    time: order.time || order.bookingTime || '',
    vehicleInfo: vehicleInfo || '',
    customerName,
    customerPhone,
  };
};

/**
 * Get all orders
 */
export const getAllOrders = async (req, res, next) => {
  try {
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
        return res.status(401).json({ 
            success: false, 
            message: 'Not authorized - Invalid or missing user session' 
        });
    }

    const { status, skip = 0, limit = 10, includeArchived } = req.query;

    const query = {};
    if (status) query.status = status;
    if (includeArchived !== 'true') {
      query.archived = { $ne: true };
    }

    if (isCustomerRole(req.user.role)) {
      query.customer = req.user.id;
    } else if (isServiceStaffRole(req.user.role)) {
      query.assignedDetailer = req.user.id;
    } else if (!isBookingManagerRole(req.user.role) && !isPosManagerRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('items.product')
      .populate('assignedDetailer', 'name email')
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: orders.map((o) => formatBookingDto(o)),
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
 * Get booked time slots for a specific date
 */
export const getAvailableSlots = async (req, res, next) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    // Find all bookings on that date that aren't cancelled or failed
    const bookings = await Order.find({
      bookingDate: date,
      status: { $nin: ['cancelled', 'failed'] }
    }).select('bookingTime');

    // Extract just the time slots that are taken
    const bookedSlots = bookings
      .filter(b => b.bookingTime)
      .map(b => b.bookingTime);

    res.json({
      success: true,
      bookedSlots // Returning booked slots is usually easier for the frontend to filter against
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cleanup stale bookings (admin)
 */
export const cleanupStaleBookings = async (req, res, next) => {
  try {
    const staleQuery = {
      $or: [
        { status: 'processing' },
        { customerName: { $in: [null, ''] } },
        { serviceType: { $in: [null, ''] } }
      ]
    };

    const result = await Order.updateMany(staleQuery, {
      $set: {
        archived: true,
        archivedAt: new Date(),
        archivedReason: 'stale_booking_cleanup',
        status: 'cancelled'
      }
    });

    res.json({
      success: true,
      archived: result.modifiedCount || result.nModified || 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active/in-progress jobs
 */
export const getActiveJobs = async (req, res, next) => {
  try {
    const query = {
      status: { $in: ['assigned', 'processing', 'in-progress'] }
    };

    if (isServiceStaffRole(req.user.role)) {
      query.assignedDetailer = req.user.id;
    } else if (!isBookingManagerRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('assignedDetailer', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get order by ID
 */
export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone')
      .populate('items.product')
      .populate('assignedDetailer', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const customerId = typeof order.customer === 'object'
      ? order.customer?._id?.toString?.()
      : order.customer?.toString?.();
    const assignedDetailerId = typeof order.assignedDetailer === 'object'
      ? order.assignedDetailer?._id?.toString?.()
      : order.assignedDetailer?.toString?.();

    const canViewOrder =
      isBookingManagerRole(req.user.role) ||
      isPosManagerRole(req.user.role) ||
      (isCustomerRole(req.user.role) && customerId === req.user.id) ||
      (isServiceStaffRole(req.user.role) && assignedDetailerId === req.user.id);

    if (!canViewOrder) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    res.json({
      success: true,
      data: formatBookingDto(order),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create order
 */
export const createOrder = async (req, res, next) => {
  try {
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
        return res.status(401).json({ 
            success: false, 
            message: 'Not authorized - Invalid or missing user session' 
        });
    }

    console.log('📝 [CREATE_ORDER] Request Body:', req.body);

    const { 
      customer: customerInput, 
      items, 
      shippingAddress, 
      notes,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      vehicleColor,
      vehiclePlate,
      bookingDate,
      bookingTime,
      vehicle: vehicleId,
      service: serviceId,
      customerName: customerNameInput,
      serviceType: serviceTypeInput,
      serviceName: serviceNameInput,
      totalPrice: totalPriceInput,
      price: priceInput
    } = req.body;

    // Always trust the authenticated user for customer bookings.
    // Only admins can create bookings on behalf of another customer.
    const resolvedCustomerId =
      isBookingManagerRole(req.user.role) && customerInput && mongoose.Types.ObjectId.isValid(customerInput)
        ? customerInput
        : req.user.id;

    let fallbackCustomerName = (typeof customerNameInput === 'string' && customerNameInput.trim())
      || req.user?.name
      || '';
    const fallbackServiceType = (typeof serviceTypeInput === 'string' && serviceTypeInput.trim())
      || (typeof serviceNameInput === 'string' && serviceNameInput.trim())
      || '';

    const normalizedTotalPriceInput = normalizeCurrency(
      totalPriceInput !== undefined ? totalPriceInput : priceInput
    );

    if (!fallbackCustomerName && resolvedCustomerId && mongoose.Types.ObjectId.isValid(resolvedCustomerId)) {
      const customerRecord = await User.findById(resolvedCustomerId);
      if (customerRecord?.name) {
        fallbackCustomerName = customerRecord.name;
      }
    }

    // FormData sends all values as strings — parse items if it arrived as a JSON string
    let parsedItems = items;
    if (typeof items === 'string') {
      try {
        parsedItems = JSON.parse(items);
      } catch {
        parsedItems = [];
      }
    }
    let finalItems = Array.isArray(parsedItems) ? parsedItems : [];
    let finalTotalAmount = 0;
    let finalTotalPrice = Number.isFinite(normalizedTotalPriceInput) ? normalizedTotalPriceInput : undefined;
    let finalServiceType = fallbackServiceType;
    let finalVehicleData = {
        vehicleYear,
        vehicleMake,
        vehicleModel,
        vehicleColor,
        vehiclePlate
    };

    // Handle Service Booking Mode (if service & vehicle IDs are provided)
    if (serviceId && vehicleId) {
        // 1. Fetch Service details (strict)
        let service = null;
        if (mongoose.Types.ObjectId.isValid(serviceId)) {
            service = await Service.findById(serviceId);
        }

        if (!service) {
            return res.status(400).json({ success: false, message: 'Invalid or missing service selected' });
        }

        // 2. Fetch Vehicle details (best-effort)
        let vehicle = null;
        if (mongoose.Types.ObjectId.isValid(vehicleId)) {
            vehicle = await Vehicle.findById(vehicleId);
        }

        const servicePrice = normalizeCurrency(service.basePrice);

        // 3. Construct Order Items (Treat service as a product item)
        // Note: 'product' field in Order Schema refs Product, but we can store the ID or create a dummy item structure.
        // If strict refs are enforced, this might fail population, but saving should work.
        finalItems = [{
            product: service._id, // Using service ID as product
            quantity: 1,
            price: servicePrice,
        }];
        finalServiceType = service.name || finalServiceType;

        finalTotalAmount = servicePrice;
        finalTotalPrice = servicePrice;

        // 4. Populate Vehicle Data (fallback to provided fields if lookup fails)
        if (vehicle) {
            finalVehicleData = {
                vehicleYear: vehicle.year,
                vehicleMake: vehicle.make,
                vehicleModel: vehicle.model,
                vehicleColor: vehicle.color,
                vehiclePlate: vehicle.plateNumber
            };
        } else {
            finalVehicleData = {
                vehicleYear,
                vehicleMake,
                vehicleModel,
                vehicleColor,
                vehiclePlate
            };
        }
    } else {
        // Standard Product Order Mode (with a "custom package" escape hatch)

        const hasCustomServiceType = typeof finalServiceType === 'string' && finalServiceType.trim().length > 0;
        const hasValidTotal = Number.isFinite(normalizedTotalPriceInput) && normalizedTotalPriceInput > 0;

        // If frontend submits a package booking (no real Product IDs), allow saving it as a service booking
        // by storing items without `product` refs and using the provided price.
        const hasNonObjectIdItem =
          Array.isArray(finalItems) &&
          finalItems.some((item) => {
            const productId = item?.product || item?._id || item?.id;
            return productId && !mongoose.Types.ObjectId.isValid(productId);
          });

        if ((finalItems.length === 0 || hasNonObjectIdItem) && hasCustomServiceType && hasValidTotal) {
          finalItems = [{
            quantity: 1,
            price: normalizedTotalPriceInput,
          }];
          finalTotalAmount = normalizedTotalPriceInput;
          finalTotalPrice = normalizedTotalPriceInput;
        } else {
          if (finalItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
          }

          // RECALCULATE PRICES FROM DATABASE
          try {
            finalItems = await Promise.all(finalItems.map(async (item) => {
              const productId = item.product || item._id || item.id;
              if (!mongoose.Types.ObjectId.isValid(productId)) {
                throw new Error(`Invalid product ID format`);
              }
              const dbProduct = await Product.findById(productId);
              if (!dbProduct) {
                throw new Error(`Product not found: ${item.name || productId}`);
              }
              return {
                ...item,
                product: dbProduct._id,
                price: dbProduct.price // Enforce server-side price
              };
            }));
          } catch (err) {
            return res.status(400).json({ success: false, message: err.message });
          }

          finalTotalAmount = finalItems.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
          finalTotalPrice = finalTotalAmount;
        }
    }

    const safeTotalPrice = finalTotalPrice;
    const initialStatus = 'pending';

    // ── Anti-Double Booking Validation (Create) ─────────────────────
    if (bookingDate && bookingTime) {
      const existingBooking = await Order.findOne({
        bookingDate,
        bookingTime,
        status: { $nin: ['cancelled', 'failed'] }
      });

      if (existingBooking) {
        return res.status(400).json({
          success: false,
          message: 'This time slot is already booked. Please select another time.'
        });
      }
    }
    // ────────────────────────────────────────────────────────────────

    const order = new Order({
      orderNumber: `ORD-${Date.now()}`,
      customer: resolvedCustomerId,
      customerName: fallbackCustomerName,
      serviceType: finalServiceType,
      items: finalItems,
      totalAmount: finalTotalAmount,
      totalPrice: safeTotalPrice,
      status: initialStatus,
      shippingAddress, // Optional for service bookings
      notes,
      ...finalVehicleData, // Spread vehicle details
      bookingDate,
      bookingTime
    });

    // Auto-assign a default available detailer when possible
    if (isCustomerRole(req.user.role)) {
      const detailers = await User.find({ role: 'service_staff', isActive: true }).select('_id name');
      let availableDetailer = null;

      for (const detailer of detailers) {
        const activeBooking = await Order.findOne({
          assignedDetailer: detailer._id,
          status: { $in: ['assigned', 'processing', 'in-progress'] }
        });
        if (!activeBooking) {
          availableDetailer = detailer;
          break;
        }
      }

      if (availableDetailer) {
        order.assignedDetailer = availableDetailer._id;
        order.status = 'assigned';
        if (!order.serviceSteps || order.serviceSteps.length === 0) {
          order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
        }
      } else if (order.status === 'processing') {
        order.status = 'pending';
      }
    }

    await order.save();

    // Populate so the response DTO is consistent with list endpoints (My Bookings)
    try {
      await order.populate('customer', 'name email phone');
      await order.populate('items.product');
      await order.populate('assignedDetailer', 'name email');
    } catch (populateErr) {
      // Non-fatal; DTO formatter has fallbacks
      console.warn('Failed to populate order before response:', populateErr.message);
    }

    // 1. Create In-App Notification for Admin
    try {
      await Notification.create({
        title: 'New Service Booking',
        message: `New booking ${order.orderNumber} for ${finalVehicleData.vehicleYear} ${finalVehicleData.vehicleMake} ${finalVehicleData.vehicleModel}`,
        type: 'booking',
        recipientRole: 'admin_family',
        link: `/admin/bookings/${order._id}`,
        metadata: { orderId: order._id }
      });
    } catch (notifyErr) {
      console.error('Failed to create notification:', notifyErr);
    }

    // 2. Send Email Notification if enabled
    try {
      const settings = await Setting.findOne();
      if (settings?.notifications?.emailNewBookings) {
        // Find admin user(s) to notify
        const admins = await User.find({ role: { $in: FULL_ADMIN_ROLES }, isActive: true });
        const adminEmails = admins.map(a => a.email);
        
        if (adminEmails.length > 0) {
          // Fetch customer name for email (if populated or available)
          const customer = await User.findById(order.customer);
          
          await emailService.sendBookingNotification(adminEmails, {
            orderNumber: order.orderNumber,
            customerName: customer?.name || 'Customer',
            serviceName: finalServiceType || (serviceId && (await Service.findById(serviceId))?.name) || 'Premium Detailing',
            bookingDate: order.bookingDate,
            bookingTime: order.bookingTime,
            vehicleInfo: `${finalVehicleData.vehicleYear} ${finalVehicleData.vehicleMake} ${finalVehicleData.vehicleModel}`
          });
        }
      }
    } catch (emailErr) {
      console.error('Failed to send booking email notification:', emailErr);
    }

    logActivity({
      req, type: 'booking_created', module: 'Booking', action: 'Booking Created',
      description: `${fallbackCustomerName || 'Customer'} created booking ${order.orderNumber} — ${finalServiceType || 'Service'}.`,
      status: 'success', referenceId: order.orderNumber,
      metadata: { orderId: order._id, serviceType: finalServiceType, totalPrice: safeTotalPrice },
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully. Admin has been notified.',
      data: formatBookingDto(order),
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({
            success: false,
            message: messages.join(', ')
        });
    }
    next(error);
  }
};

/**
 * Customer signs waiver
 */
export const signWaiver = async (req, res, next) => {
  try {
    const { waiverSignature, waiverPdf } = req.body;

    if (!waiverSignature) {
      return res.status(400).json({ success: false, message: 'Waiver signature is required' });
    }

    const isValidSignature = isDataUrl(waiverSignature) || isSignedUrl(waiverSignature);
    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid waiver signature format. Use base64 data URL or a signed URL.'
      });
    }
    if (waiverPdf) {
      const isValidPdf = isDataUrl(waiverPdf) || isSignedUrl(waiverPdf);
      if (!isValidPdf) {
        return res.status(400).json({
          success: false,
          message: 'Invalid waiver PDF format. Use base64 data URL or a signed URL.'
        });
      }
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!isFullAdminRole(req.user.role) && (!order.customer || order.customer.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only sign your own waiver' });
    }

    order.legalCompliance = {
      ...order.legalCompliance,
      waiverSignature,
      waiverSignedAt: new Date(),
      waiverPdf: waiverPdf || order.legalCompliance?.waiverPdf,
    };

    const preServiceCount = order.legalCompliance?.preServicePhotos?.length || 0;
    if (order.assignedDetailer && preServiceCount >= 2) {
      order.status = 'in-progress';
      if (!order.serviceSteps || order.serviceSteps.length === 0) {
        order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
      }
    }

    await order.save();

    try {
      const customerName = order.customerName || req.user?.name || 'Customer';
      const notification = await Notification.create({
        title: 'Waiver Signed',
        message: `${customerName} signed the service waiver for order ${order.orderNumber || order._id}`,
        type: 'booking',
        recipientRole: 'admin_family',
        link: '/admin/dashboard?tab=waivers',
        metadata: {
          orderId: order._id,
          customerId: order.customer,
          waiverSignedAt: order.legalCompliance?.waiverSignedAt,
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

      const io = getIO();
      if (io) {
        io.emit('waiver:signed', {
          orderId: order._id,
          customerName,
          signedAt: order.legalCompliance.waiverSignedAt,
        });
      }
    } catch (notifyError) {
      console.error('Failed to notify waiver signature:', notifyError.message);
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Detailer uploads pre-service inspection
 */
export const updateInspection = async (req, res, next) => {
  try {
    const { preServicePhotos = [], damageNotes } = req.body;

    if (!Array.isArray(preServicePhotos)) {
      return res.status(400).json({ success: false, message: 'preServicePhotos must be an array' });
    }

    const invalidPhoto = preServicePhotos.find((url) => !isSignedUrl(url) && !isDataUrl(url));
    if (invalidPhoto) {
      return res.status(400).json({
        success: false,
        message: 'Pre-service photos must be signed URLs or valid Base64 data URLs.'
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (isServiceStaffRole(req.user.role) &&
        (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    const existingPhotos = order.legalCompliance?.preServicePhotos || [];
    const mergedPhotos = [...new Set([...existingPhotos, ...preServicePhotos])];

    order.legalCompliance = {
      ...order.legalCompliance,
      preServicePhotos: mergedPhotos,
      damageNotes: damageNotes || order.legalCompliance?.damageNotes,
    };

    if (order.legalCompliance?.waiverSignature && mergedPhotos.length >= 2) {
      order.status = 'in-progress';
      if (!order.serviceSteps || order.serviceSteps.length === 0) {
        order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
      }
    }

    await order.save();

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order
 */
export const updateOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check ownership or admin status
    if (!order.customer || (order.customer.toString() !== req.user.id && !isBookingManagerRole(req.user.role))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own bookings',
      });
    }

    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;

    // ── Anti-Double Booking Validation (Update) ─────────────────────
    const newDate = req.body.bookingDate || order.bookingDate;
    const newTime = req.body.bookingTime || order.bookingTime;

    if (newDate && newTime && (req.body.bookingDate || req.body.bookingTime)) {
      const existingBooking = await Order.findOne({
        _id: { $ne: order._id },
        bookingDate: newDate,
        bookingTime: newTime,
        status: { $nin: ['cancelled', 'failed'] }
      });

      if (existingBooking) {
        return res.status(400).json({
          success: false,
          message: 'This time slot is already booked by another customer. Please select another time.'
        });
      }
    }
    // ────────────────────────────────────────────────────────────────

    // Update fields
    Object.assign(order, req.body);
    await order.save();

    // ── Fire real-time events when payment is marked paid ─────────────────
    const paymentJustMarkedPaid =
      previousPaymentStatus !== 'paid' && order.paymentStatus === 'paid';

    if (paymentJustMarkedPaid) {
      // 1. Push live status update to the customer's socket room
      emitCustomerStatusUpdate(order);

      // 2. Create a persistent Notification for the customer
      try {
        const customerId =
          typeof order.customer === 'object' ? order.customer?._id : order.customer;
        if (customerId) {
          const createdNotification = await Notification.create({
            title: 'Payment Received ✓',
            message: `Your booking ${order.orderNumber || order._id} is confirmed and paid. Your detailer will be assigned shortly.`,
            type: 'payment',
            recipientRole: 'customer',
            link: '/customer/dashboard?tab=tracking',
            metadata: {
              orderId: order._id,
              customerId: customerId.toString(),
            },
          });
          // 3. Push real-time notification to customer socket
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
      } catch (notifyError) {
        console.error('Failed to create payment notification:', notifyError.message);
      }

      // 4. Notify admin panel (refreshes calendar dot color via optimistic update)
      emitAdminNotification({
        title: 'Payment Updated',
        message: `Booking ${order.orderNumber || order._id} marked as paid.`,
        type: 'payment',
      });
    }
    // ─────────────────────────────────────────────────────────────────────

    if (previousStatus !== order.status) {
      emitCustomerStatusUpdate(order);
      logActivity({
        req, type: 'status_change', module: 'Booking', action: 'Booking Status Updated',
        description: `${req.user?.name || 'Staff'} changed booking ${order.orderNumber || order._id} from ${previousStatus} to ${order.status}.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus, newStatus: order.status },
      });
    }

    if (previousStatus !== order.status && order.status === 'confirmed') {
      try {
        const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
        if (customerId) {
          const createdNotification = await Notification.create({
            title: 'Booking Confirmed',
            message: `Your booking ${order.orderNumber || order._id} is confirmed.`,
            type: 'booking',
            recipientRole: 'customer',
            link: '/customer/dashboard?tab=bookings',
            metadata: {
              orderId: order._id,
              customerId: customerId.toString(),
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
      } catch (notifyError) {
        console.error('Failed to notify customer booking confirmation:', notifyError.message);
      }
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete order
 */
export const deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check ownership or admin status
    if (!order.customer || (order.customer.toString() !== req.user.id && !isBookingManagerRole(req.user.role))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only delete your own bookings',
      });
    }

    logActivity({
      req, type: 'booking_cancelled', module: 'Booking', action: 'Booking Deleted',
      description: `${req.user?.name || 'User'} deleted booking ${order.orderNumber || order._id}.`,
      status: 'warning', referenceId: order.orderNumber,
      metadata: { orderId: order._id },
    });

    await Order.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unified Admin flow:
 * Assign a detailer AND optionally mark payment as paid in a single transaction.
 */
export const assignDetailerAndMarkPaid = async (req, res, next) => {
  try {
    const { detailerId, markPaid, paymentMethod } = req.body || {};
    const isMarkPaid = markPaid === true || markPaid === 'true';

    if (!detailerId) {
      return res.status(400).json({
        success: false,
        message: 'detailerId is required',
      });
    }

    // Defensive guard – route already uses authorize(...BOOKING_MANAGER_ROLES)
    if (!req.user || !isBookingManagerRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only booking managers can assign staff and mark payments as paid',
      });
    }

    // Check if detailer is already assigned to an active booking
    const activeBooking = await Order.findOne({
      assignedDetailer: detailerId,
      status: { $in: ['assigned', 'processing', 'in-progress'] }
    });

    if (activeBooking) {
      return res.status(400).json({
        success: false,
        message: 'Detailer is currently handling another active job. Simultaneous assignments are prohibited.'
      });
    }

    const order = await Order.findById(req.params.id).populate('customer', 'name email');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;

    // Perform assignment
    order.assignedDetailer = detailerId;
    if (order.status === 'pending') {
      order.status = 'assigned';
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    // Optionally mark as paid as part of the same transaction
    if (isMarkPaid) {
      order.paymentStatus = 'paid';
      order.paidAt = order.paidAt || new Date();
      order.paymentMethod = paymentMethod || order.paymentMethod || 'manual';
      order.paymentProvider = order.paymentProvider || 'admin';
      if (!order.invoiceId) {
        order.invoiceId = `INV-${Date.now()}`;
      }
      if (order.status === 'pending') {
        order.status = 'confirmed';
      }
    }

    await order.save();
    await order.populate('assignedDetailer', 'name email');

    // Push live status update to the customer
    emitCustomerStatusUpdate(order);

    // Create unified customer notification that a detailer is assigned
    try {
      const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
      if (customerId) {
        const notification = await Notification.create({
          title: 'Detailer Assigned',
          message: 'Your detailer has been assigned and is working on your car! Please check Live Tracking to track your vehicle\'s progress.',
          type: 'booking',
          recipientRole: 'customer',
          link: '/customer/dashboard?tab=tracking',
          metadata: {
            orderId: order._id,
            customerId: customerId.toString(),
            assignedDetailer: order.assignedDetailer,
            paymentStatus: order.paymentStatus,
          },
        });

        emitCustomerNotification(customerId, {
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
      console.error('Failed to send detailer-assigned notification:', notifyError.message);
    }

    // If payment status just transitioned to paid, emit admin notification
    if (previousPaymentStatus !== 'paid' && order.paymentStatus === 'paid') {
      emitAdminNotification({
        title: 'Payment Updated',
        message: `Booking ${order.orderNumber || order._id} marked as paid (via admin).`,
        type: 'payment',
      });
    }

    // Activity logs for assignment and status changes
    logActivity({
      req, type: 'booking_assigned', module: 'Booking', action: 'Detailer Assigned',
      description: `${req.user?.name || 'Admin'} assigned detailer to booking ${order.orderNumber || order._id}.`,
      status: 'success', referenceId: order.orderNumber,
      metadata: { orderId: order._id, detailerId, paymentStatus: order.paymentStatus },
    });

    if (previousStatus !== order.status) {
      logActivity({
        req, type: 'status_change', module: 'Booking', action: 'Booking Status Updated',
        description: `Booking ${order.orderNumber || order._id} status changed from ${previousStatus} to ${order.status} during assignment.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus, newStatus: order.status },
      });
    }

    return res.json({
      success: true,
      message: isMarkPaid
        ? 'Detailer assigned and payment marked as paid.'
        : 'Detailer assigned successfully.',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};
/**
 * Assign a detailer to an order
 */
export const assignDetailer = async (req, res, next) => {
  try {
    const { detailerId } = req.body;
    
    // 1. Check if detailer is already assigned to an active booking
    const activeBooking = await Order.findOne({
      assignedDetailer: detailerId,
      status: { $in: ['assigned', 'processing', 'in-progress'] }
    });

    if (activeBooking) {
      return res.status(400).json({ 
        success: false, 
        message: 'Detailer is currently handling another active job. Simultaneous assignments are prohibited.' 
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // 2. Perform assignment
    order.assignedDetailer = detailerId;
    if (order.status === 'pending') {
      order.status = 'assigned';
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    await order.save();

    // Populate for return
    await order.populate('assignedDetailer', 'name email');

    logActivity({
      req, type: 'booking_assigned', module: 'Booking', action: 'Detailer Assigned',
      description: `${req.user?.name || 'Admin'} assigned detailer to booking ${order.orderNumber || order._id}.`,
      status: 'success', referenceId: order.orderNumber,
      metadata: { orderId: order._id, detailerId },
    });

    res.json({
      success: true,
      message: 'Detailer assigned successfully and locked to this job.',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order progress (for Detailer)
 */
export const updateOrderProgress = async (req, res, next) => {
  try {
    const { stepIndex, status, completed, orderStatus } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if user is the assigned detailer or admin
    if (isServiceStaffRole(req.user.role) && 
       (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
        return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    const wantsInProgress = orderStatus === 'in-progress';
    const hasWaiver = !!order.legalCompliance?.waiverSignature;
    const preServiceCount = order.legalCompliance?.preServicePhotos?.length || 0;
    if (wantsInProgress && (!hasWaiver || preServiceCount < 2)) {
      return res.status(400).json({
        success: false,
        message: 'Waiver signature and at least 2 pre-service photos are required before starting the job'
      });
    }

    const previousStatus = order.status;
    const normalizedStepIndex = stepIndex !== undefined ? Number(stepIndex) : undefined;

    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    // Update top-level status if provided
    if (orderStatus) {
        order.status = orderStatus;
    }

    // Update specific step if provided
    if (normalizedStepIndex !== undefined && order.serviceSteps[normalizedStepIndex]) {
      order.serviceSteps[normalizedStepIndex].status = status || 'completed';
      if (order.serviceSteps[normalizedStepIndex].status === 'completed') {
        order.serviceSteps[normalizedStepIndex].completedAt = new Date();
      }
      
      // Auto-advance current step index
      if (status === 'completed' && normalizedStepIndex === order.currentStepIndex) {
          order.currentStepIndex = Math.min(order.currentStepIndex + 1, order.serviceSteps.length - 1);
      }
    }
    
    // Complete entire order if last step is done or explicit completion
    const lastStepIndex = order.serviceSteps.length - 1;
    const shouldComplete =
      completed === true ||
      orderStatus === 'completed' ||
      (normalizedStepIndex !== undefined && normalizedStepIndex === lastStepIndex && status === 'completed');

    if (shouldComplete) {
      if (previousStatus !== 'completed') {
        if (!order.inventoryDeductedAt) {
          const serviceStepNames = (order.serviceSteps || []).map(step => step.name).join(' ');
          let serviceLabel = '';
          let serviceForRecipe = null;

          if (order.items?.length) {
            const itemProduct = order.items[0]?.product;
            if (itemProduct && typeof itemProduct === 'object' && itemProduct.name) {
              serviceLabel = itemProduct.name;
            }
            if (itemProduct) {
              serviceForRecipe = await Service.findById(itemProduct);
              if (serviceForRecipe?.name) {
                serviceLabel = serviceForRecipe.name;
              }
            }
          }

          const resolvedInventory = [];
          const insufficientInventory = [];

          if (serviceForRecipe?.recipe?.length) {
            for (const entry of serviceForRecipe.recipe) {
              let product = null;
              if (entry.product) {
                product = await Product.findById(entry.product);
              }
              if (!product && entry.productName) {
                product = await findProductByName(entry.productName);
              }

              const quantity = Number(entry.quantity);
              if (!Number.isFinite(quantity) || quantity <= 0) {
                continue;
              }

              if (!product) {
                await notifyInventoryIssue({
                  title: 'Inventory Mapping Missing',
                  message: `${serviceForRecipe.name}: recipe item not found (${entry.productName || 'Unnamed item'})`,
                  metadata: {
                    serviceId: serviceForRecipe._id,
                    serviceName: serviceForRecipe.name,
                    productName: entry.productName,
                    quantity,
                    unit: entry.unit
                  }
                });
                continue;
              }

              if (product.inventory < quantity) {
                insufficientInventory.push({ product, quantity, unit: entry.unit, serviceName: serviceForRecipe.name });
                continue;
              }

              resolvedInventory.push({ product, quantity });
            }
          } else {
            const serviceText = `${serviceLabel} ${serviceStepNames}`.toLowerCase();
            const requiredInventory = SERVICE_INVENTORY_MAP.filter(entry => serviceText.includes(entry.keyword));

            if (requiredInventory.length > 0) {
              for (const entry of requiredInventory) {
                let product = null;

                for (const name of entry.productNames) {
                  product = await findProductByName(name);
                  if (product) break;
                }

                if (!product) {
                  console.warn(`[INVENTORY_SKIP] No matching inventory item found for ${entry.keyword}`);
                  await notifyInventoryIssue({
                    title: 'Inventory Mapping Missing',
                    message: `Missing inventory mapping for ${entry.keyword} (${serviceLabel || 'Service'})`,
                    metadata: {
                      keyword: entry.keyword,
                      serviceName: serviceLabel
                    }
                  });
                  continue;
                }

                if (product.inventory < entry.quantity) {
                  insufficientInventory.push({ product, quantity: entry.quantity, serviceName: serviceLabel });
                  continue;
                }

                resolvedInventory.push({ product, quantity: entry.quantity });
              }
            }
          }

          for (const item of insufficientInventory) {
            await notifyInventoryIssue({
              title: 'Inventory Alert',
              message: `${item.product.name} out of stock for ${item.serviceName || 'service'} (needed ${item.quantity}${item.unit ? ` ${item.unit}` : ''}, available ${item.product.inventory})`,
              metadata: {
                productId: item.product._id,
                productName: item.product.name,
                required: item.quantity,
                available: item.product.inventory,
                serviceName: item.serviceName
              }
            });
          }

          for (const item of resolvedInventory) {
            const previousInventory = Number.isFinite(item.product.inventory) ? item.product.inventory : 0;
            const updatedInventory = previousInventory - item.quantity;

            item.product.inventory = updatedInventory;
            await item.product.save();

            // Log ledger entry for usage history
            try {
              await InventoryTransaction.create({
                product: item.product._id,
                type: 'out',
                quantity: item.quantity,
                previousStock: previousInventory,
                newStock: updatedInventory,
                referenceId: order._id,
                referenceModel: 'Order',
                notes: `Auto-deducted for service execution.`,
              });
            } catch (err) {
              console.error('[INVENTORY_LEDGER_ERROR] Failed to log inventory transaction:', err);
            }

            if (previousInventory > LOW_STOCK_THRESHOLD && updatedInventory <= LOW_STOCK_THRESHOLD) {
              await notifyInventoryIssue({
                title: 'Low Stock',
                message: `Low Stock: ${item.product.name} only has ${updatedInventory} units left`,
                metadata: {
                  productId: item.product._id,
                  productName: item.product.name,
                  threshold: LOW_STOCK_THRESHOLD,
                  remaining: updatedInventory
                }
              });
            }
          }

          order.inventoryDeductedAt = new Date();
        }
      }

      order.status = 'completed';

      // Send completion email to customer
      try {
        const customer = await User.findById(order.customer);
        if (customer) {
          // -- Loyalty Points Reward (5% back) --
          if (order.totalAmount && order.totalAmount > 0) {
              const pointsEarned = Math.floor(order.totalAmount * 0.05);
              customer.loyaltyPoints = (customer.loyaltyPoints || 0) + pointsEarned;
              
              const currentPoints = customer.loyaltyPoints;
              let newTier = 'Bronze';
              if (currentPoints >= 10000) newTier = 'Platinum';
              else if (currentPoints >= 5000) newTier = 'Gold';
              else if (currentPoints >= 2000) newTier = 'Silver';
              
              customer.loyaltyTier = newTier;
              await customer.save();
              console.log(`[Loyalty] Awarded ${pointsEarned} points to user ${customer._id}. New Tier: ${newTier}`);
          }

          if (customer.email) {
            const service = order.items?.[0]?.product
              ? await Service.findById(order.items[0].product)
              : null;
            
            await emailService.sendServiceCompletedEmail(customer.email, {
              orderNumber: order.orderNumber,
              customerName: customer.name || 'Valued Customer',
              serviceName: service?.name || 'Premium Detailing',
              vehicleInfo: `${order.vehicleYear || ''} ${order.vehicleMake || ''} ${order.vehicleModel || ''}`.trim() || 'Your Vehicle',
              ratingLink: `${process.env.FRONTEND_URL || 'https://autospf.com'}/dashboard?rating=${order._id}`
            });
          }
        }
      } catch (rewardErr) {
        console.error('Failed to process rewards or send completion email:', rewardErr);
      }
    }

    await order.save();

    // Activity logs for status changes (fire-and-forget)
    if (previousStatus !== order.status) {
      logActivity({
        req, type: 'status_change', module: 'Booking', action: 'Service Status Updated',
        description: `Service on booking ${order.orderNumber || order._id} changed from ${previousStatus} to ${order.status}.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus, newStatus: order.status },
      });
    }
    if (previousStatus === 'assigned' && order.status === 'in-progress') {
      logActivity({
        req, type: 'service_started', module: 'Service', action: 'Job Started',
        description: `${req.user?.name || 'Detailer'} started job ${order.orderNumber || order._id}.`,
        status: 'success', referenceId: order.orderNumber,
        metadata: { orderId: order._id },
      });
    }
    if (order.status === 'completed' && previousStatus !== 'completed') {
      logActivity({
        req, type: 'service_completed', module: 'Service', action: 'Job Completed',
        description: `${req.user?.name || 'Detailer'} completed job ${order.orderNumber || order._id}.`,
        status: 'success', referenceId: order.orderNumber,
        metadata: { orderId: order._id },
      });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Update customer-facing status (Queued/In Progress/Finishing/Ready)
 */
export const updateCustomerStatus = async (req, res, next) => {
  try {
    const requestedStatus = req.body?.status;
    const normalizedStatus = normalizeCustomerStatus(requestedStatus);

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${CUSTOMER_STATUS_VALUES.join(', ')}`
      });
    }

    const order = await Order.findById(req.params.id).populate('customer', 'email name');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (isServiceStaffRole(req.user.role) &&
      (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    const hasWaiver = !!order.legalCompliance?.waiverSignature;
    if (normalizedStatus !== 'queued' && !hasWaiver) {
      return res.status(400).json({
        success: false,
        message: 'Waiver signature is required before status can progress'
      });
    }

    const previousCustomerStatus = order.customerStatus || 'queued';
    order.customerStatus = normalizedStatus;
    order.customerStatusUpdatedAt = new Date();

    await order.save();
    emitCustomerStatusUpdate(order);

    if (previousCustomerStatus !== normalizedStatus) {
      logActivity({
        req, type: 'customer_status_change', module: 'Booking', action: 'Customer Status Updated',
        description: `${req.user?.name || 'Staff'} updated customer status from ${previousCustomerStatus} to ${normalizedStatus} on booking ${order.orderNumber || order._id}.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus: previousCustomerStatus, newStatus: normalizedStatus },
      });
    }

    if (normalizedStatus === 'ready' && previousCustomerStatus !== 'ready' && order.status !== 'completed') {
      const customerEmail = order.customer?.email;
      if (customerEmail) {
        const vehicleInfo = order.vehicleInfo
          || [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ')
          || 'N/A';
        const orderData = {
          customerName: order.customerName || order.customer?.name || 'Customer',
          serviceName: order.serviceType || order.items?.[0]?.product?.name || 'Service',
          orderNumber: order.orderNumber || order._id?.toString?.(),
          vehicleInfo,
        };
        await emailService.sendServiceCompletedEmail(customerEmail, orderData);
      }
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Get orders assigned to specific detailer
 */
export const getDetailerOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ assignedDetailer: req.user.id })
      .populate('customer', 'name email phone')
      .populate('assignedDetailer', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit rating for completed order
 */
export const submitRating = async (req, res, next) => {
  try {
    const { score, comment } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify user is the customer who owns this order
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only rate your own bookings' });
    }

    // Verify order is completed
    if (order.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only rate completed bookings' });
    }

    // Verify not already rated
    if (order.rating?.score) {
      return res.status(400).json({ success: false, message: 'You have already rated this booking' });
    }

    // Validate score
    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ success: false, message: 'Rating score must be between 1 and 5' });
    }

    order.rating = {
      score,
      comment: comment || '',
      ratedAt: new Date()
    };

    await order.save();

    res.json({ 
      success: true, 
      message: 'Thank you for your feedback!',
      data: order 
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download Auto-Generated Waiver PDF
 */
export const getWaiverPdf = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'name email');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    if (!order.legalCompliance?.waiverSignature) {
      return res.status(400).json({ success: false, message: 'Waiver has not been signed yet' });
    }

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text('AutoSPF+ Liability Waiver', 20, 20);

    doc.setFontSize(12);
    doc.text(`Order Number: ${order.orderNumber || order._id}`, 20, 35);
    doc.text(`Customer Name: ${order.customer?.name || order.customerName || 'N/A'}`, 20, 42);
    doc.text(`Date Signed: ${new Date(order.legalCompliance.waiverSignedAt).toLocaleString()}`, 20, 49);

    doc.setFontSize(14);
    doc.text('Terms and Conditions', 20, 65);
    doc.setFontSize(10);
    const terms = 'By signing this document, the customer acknowledges and agrees that AutoSPF+ and its technicians are not liable for any pre-existing damage, wear and tear, or underlying conditions prior to the detailing service. All loose items, valuables, and sensitive materials must be removed from the vehicle before the service begins. The customer releases AutoSPF+ from all claims damages from standard operations.';
    const splitTerms = doc.splitTextToSize(terms, 170);
    doc.text(splitTerms, 20, 75);

    doc.setFontSize(14);
    doc.text('Customer Signature:', 20, 110);
    
    const sigStr = order.legalCompliance.waiverSignature;
    if (sigStr.startsWith('data:image')) {
      const imgType = sigStr.split(';')[0].split('/')[1].toUpperCase(); // PNG, JPEG, etc.
      doc.addImage(sigStr, imgType, 20, 120, 80, 40);
    } else {
      doc.text('(Signature file stored securely on server)', 20, 130);
    }

    doc.setFontSize(8);
    doc.text('AutoSPF+ Legal Dept. | Auto-generated via Node System', 20, 280);

    const pdfBuffer = doc.output('arraybuffer');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="waiver-${order._id}.pdf"`,
    });

    return res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    next(error);
  }
};

/**
 * Send Waiver Reminder via Email/SMS (Mock/Placeholder for now)
 */
export const sendWaiverReminder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'name email phone');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.legalCompliance?.waiverSignature) {
      return res.status(400).json({ success: false, message: 'Waiver is already signed.' });
    }

    // In a real implementation, you would trigger the emailService / SMS service here.
    // Example: await emailService.sendWaiverReminder(order.customer.email, order);

    return res.status(200).json({ 
      success: true, 
      message: 'Reminder sent successfully' 
    });
  } catch (error) {
    next(error);
  }
};
