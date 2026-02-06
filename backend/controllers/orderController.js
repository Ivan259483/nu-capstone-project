import Order from '../models/Order.js';
import Service from '../models/Service.js';
import Vehicle from '../models/Vehicle.js';

/**
 * Get all orders
 */
export const getAllOrders = async (req, res, next) => {
  try {
    const { status, skip = 0, limit = 10 } = req.query;

    const query = {};
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('customer')
      .populate('customer')
      .populate('items.product')
      .populate('assignedDetailer', 'name email')
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: orders,
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
 * Get order by ID
 */
export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer')
      .populate('customer')
      .populate('items.product')
      .populate('assignedDetailer', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.json({
      success: true,
      data: order,
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
    console.log('📝 [CREATE_ORDER] Request Body:', req.body);

    const { 
      customer, 
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
      service: serviceId
    } = req.body;

    let finalItems = items || [];
    let finalTotalAmount = 0;
    let finalVehicleData = {
        vehicleYear,
        vehicleMake,
        vehicleModel,
        vehicleColor,
        vehiclePlate
    };

    // Handle Service Booking Mode (if service & vehicle IDs are provided)
    if (serviceId && vehicleId) {
        // 1. Fetch Service details
        const service = await Service.findById(serviceId);
        if (!service) {
             return res.status(404).json({ success: false, message: 'Service not found' });
        }

        // 2. Fetch Vehicle details
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        // 3. Construct Order Items (Treat service as a product item)
        // Note: 'product' field in Order Schema refs Product, but we can store the ID or create a dummy item structure.
        // If strict refs are enforced, this might fail population, but saving should work.
        finalItems = [{
            product: service._id, // Using service ID as product
            quantity: 1,
            price: service.basePrice,
            // We can add extra fields if schema allows, otherwise rely on price
        }];

        finalTotalAmount = service.basePrice;

        // 4. Populate Vehicle Data
        finalVehicleData = {
            vehicleYear: vehicle.year,
            vehicleMake: vehicle.make,
            vehicleModel: vehicle.model,
            vehicleColor: vehicle.color,
            vehiclePlate: vehicle.plateNumber
        };
    } else {
        // Standard Product Order Mode
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
        }
        finalTotalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }

    const order = new Order({
      orderNumber: `ORD-${Date.now()}`,
      customer: customer || req.user.id,
      items: finalItems,
      totalAmount: finalTotalAmount,
      shippingAddress, // Optional for service bookings
      notes,
      ...finalVehicleData, // Spread vehicle details
      bookingDate,
      bookingTime
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order,
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
    if (!order.customer || (order.customer.toString() !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own bookings',
      });
    }

    // Update fields
    Object.assign(order, req.body);
    await order.save();

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
    if (!order.customer || (order.customer.toString() !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only delete your own bookings',
      });
    }

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
 * Assign a detailer to an order
 */
export const assignDetailer = async (req, res, next) => {
  try {
    const { detailerId } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.assignedDetailer = detailerId;
    if (order.status === 'pending') {
      order.status = 'processing';
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = [
        { name: 'Wash', status: 'pending' },
        { name: 'Detail', status: 'pending' },
        { name: 'Wax', status: 'pending' },
        { name: 'Final Inspection', status: 'pending' }
      ];
    }

    await order.save();

    // Populate for return
    await order.populate('assignedDetailer', 'name email');

    res.json({
      success: true,
      message: 'Detailer assigned successfully',
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
    if (req.user.role !== 'admin' && 
       (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
        return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    // Update top-level status if provided
    if (orderStatus) {
        order.status = orderStatus;
    }

    // Update specific step if provided
    if (stepIndex !== undefined && order.serviceSteps[stepIndex]) {
      order.serviceSteps[stepIndex].status = status || 'completed';
      if (order.serviceSteps[stepIndex].status === 'completed') {
        order.serviceSteps[stepIndex].completedAt = new Date();
      }
      
      // Auto-advance current step index
      if (status === 'completed' && stepIndex === order.currentStepIndex) {
          order.currentStepIndex = Math.min(order.currentStepIndex + 1, order.serviceSteps.length - 1);
      }
    }
    
    // Complete entire order if last step is done or explicit completion
    if (completed) {
        order.status = 'completed';
    }

    await order.save();
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
