import Customer from '../models/Customer.js';
import Vehicle from '../models/Vehicle.js';

/**
 * Get all customers
 */
export const getAllCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find()
      .populate('user')
      .populate('vehicles')
      .populate('bookings')
      .populate('preferredStore');

    res.json({
      success: true,
      data: customers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get customer by ID
 */
export const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('user')
      .populate('vehicles')
      .populate('bookings')
      .populate('preferredStore');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    res.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create customer
 */
export const createCustomer = async (req, res, next) => {
  try {
    const { user, preferredStore } = req.body;

    const customer = new Customer({
      user,
      preferredStore,
    });

    await customer.save();

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update customer
 */
export const updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: customer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete customer
 */
export const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    res.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add vehicle to customer
 */
export const addVehicle = async (req, res, next) => {
  try {
    const { year, make, model, color, plateNumber } = req.body;
    const customerId = req.user.id; // From authenticate middleware

    const vehicle = new Vehicle({
      customer: customerId,
      year,
      make,
      model,
      color,
      plateNumber,
    });

    await vehicle.save();

    // Also link to customer profile if needed (though we can just query by customer id)
    await Customer.findOneAndUpdate(
        { user: customerId },
        { $push: { vehicles: vehicle._id } }
    );

    res.status(201).json({
      success: true,
      message: 'Vehicle added successfully',
      data: vehicle,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle with this plate number already exists',
      });
    }
    next(error);
  }
};

/**
 * Get customer vehicles
 */
export const getVehicles = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.find({ customer: req.user.id });

    res.json({
      success: true,
      data: vehicles,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update vehicle
 */
export const updateVehicle = async (req, res, next) => {
  try {
    const { year, make, model, color, plateNumber } = req.body;
    
    // Find vehicle first to check ownership
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found',
      });
    }

    // Verify ownership
    if (vehicle.customer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own vehicles',
      });
    }

    // Update fields
    if (year) vehicle.year = year;
    if (make) vehicle.make = make;
    if (model) vehicle.model = model;
    if (color) vehicle.color = color;
    if (plateNumber) vehicle.plateNumber = plateNumber;

    await vehicle.save();

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle,
    });
  } catch (error) {
    if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle with this plate number already exists',
        });
      }
    next(error);
  }
};
