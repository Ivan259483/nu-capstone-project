import Customer from '../models/customer.model.js';
import Vehicle from '../models/vehicle.model.js';
import User from '../models/user.model.js';
import { normalizePlateNumber, findVehicleByNormalizedPlate } from '../utils/plate.utils.js';

import {
  isFullAdminRole,
  isUserManagementRole,
  canManageCustomerGarage,
  isCustomerRole,
} from '../constants/roles.js';

/** Resolve which User id owns the vehicle operation (self or staff-assist target). */
async function resolveVehicleOwnerUserId(req, bodyCustomerUserId, queryForUserId) {
  const raw =
    (typeof bodyCustomerUserId === 'string' && bodyCustomerUserId.trim()) ||
    (typeof queryForUserId === 'string' && queryForUserId.trim()) ||
    '';

  if (!raw) {
    return { ok: true, status: 200, customerUserId: req.user.id };
  }

  if (!canManageCustomerGarage(req.user.role)) {
    return {
      ok: false,
      status: 403,
      message: 'Access denied: cannot manage vehicles for other users',
    };
  }

  const targetUser = await User.findById(raw).select('role').lean();
  if (!targetUser) {
    return { ok: false, status: 404, message: 'Customer user not found' };
  }
  if (!isCustomerRole(targetUser.role)) {
    return {
      ok: false,
      status: 400,
      message: 'Target user must be a customer account',
    };
  }

  return { ok: true, status: 200, customerUserId: String(targetUser._id) };
}

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
 * Get current user's customer profile
 */
export const getMe = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let customer = await Customer.findOne({ user: req.user.id })
      .populate('user')
      .populate('vehicles')
      .populate('bookings')
      .populate('preferredStore');

    if (!customer) {
      // Auto-create if missing
      customer = new Customer({ user: req.user.id });
      await customer.save();
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
 * Update current user's customer profile (e.g. preferences)
 */
export const updateMe = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let customer = await Customer.findOne({ user: req.user.id });
    if (!customer) {
      customer = new Customer({ user: req.user.id });
    }

    Object.assign(customer, req.body);
    await customer.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
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
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Invalid or missing user session',
      });
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const isAdmin = isUserManagementRole(req.user.role);
    const isOwner = customer.user && customer.user.toString() === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own customer profile',
      });
    }

    Object.assign(customer, req.body);
    await customer.save();

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
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Invalid or missing user session'
      });
    }

    const { year, make, model, color, plateNumber, vehicleType, transmission, fuelType, customerUserId } = req.body;

    const resolved = await resolveVehicleOwnerUserId(req, customerUserId, undefined);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ success: false, message: resolved.message });
    }
    const customerId = resolved.customerUserId;
    const normalizedPlate = normalizePlateNumber(typeof plateNumber === 'string' ? plateNumber : '');
    const platePattern = /^[A-Z0-9]{4,9}$/;

    if (!normalizedPlate || !platePattern.test(normalizedPlate)) {
      return res.status(400).json({
        success: false,
        message: 'Plate number must be 4–9 alphanumeric characters (e.g., ABC1234)',
      });
    }

    const txAllowed = ['', 'Automatic', 'Manual', 'CVT'];
    const fuelAllowed = ['', 'Gasoline', 'Diesel', 'Electric', 'Hybrid'];
    const tx = txAllowed.includes(transmission) ? transmission : '';
    const fuel = fuelAllowed.includes(fuelType) ? fuelType : '';

    // ── Plate uniqueness check (normalized + legacy spaced formats in DB) ───
    const existingVehicle = await findVehicleByNormalizedPlate(normalizedPlate);
    if (existingVehicle) {
      if (existingVehicle.customer.toString() === customerId) {
        // Same customer — return the existing record instead of an error.
        // This makes the endpoint idempotent: adding a plate you already own
        // just hands you back the vehicle rather than failing.
        return res.status(200).json({
          success: true,
          message: 'Vehicle already registered to your account.',
          data: existingVehicle,
        });
      }
      // Different customer — the plate is genuinely taken
      return res.status(400).json({
        success: false,
        message: 'This plate number is already registered to another account.',
        code: 'PLATE_TAKEN',
      });
    }

    const vehicle = new Vehicle({
      customer: customerId,
      year: year || '',
      make: make || '',
      model: model || '',
      color: color || 'Unknown',
      plateNumber: normalizedPlate,
      vehicleType: vehicleType || '',
      transmission: tx,
      fuelType: fuel,
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
    // Fallback for any race-condition duplicate key error that slips past the pre-check
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This plate number is already registered to another account.',
        code: 'PLATE_TAKEN',
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
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Invalid or missing user session'
      });
    }

    const forUserId = typeof req.query.forUserId === 'string' ? req.query.forUserId.trim() : '';
    let ownerId = req.user.id;

    if (forUserId) {
      if (forUserId === req.user.id) {
        ownerId = req.user.id;
      } else {
        const resolved = await resolveVehicleOwnerUserId(req, undefined, forUserId);
        if (!resolved.ok) {
          return res.status(resolved.status).json({ success: false, message: resolved.message });
        }
        ownerId = resolved.customerUserId;
      }
    }

    const vehicles = await Vehicle.find({ customer: ownerId })
      .select('year make model color plateNumber vehicleType transmission fuelType customer')
      .lean();

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
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Invalid or missing user session'
      });
    }

    const { year, make, model, color, plateNumber, vehicleType, transmission, fuelType } = req.body;
    const platePattern = /^[A-Z0-9]{4,9}$/;
    const txAllowed = ['', 'Automatic', 'Manual', 'CVT'];
    const fuelAllowed = ['', 'Gasoline', 'Diesel', 'Electric', 'Hybrid'];

    // Find vehicle first to check ownership
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found',
      });
    }

    // Verify ownership
    if (
      vehicle.customer.toString() !== req.user.id &&
      !isFullAdminRole(req.user.role) &&
      !canManageCustomerGarage(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own vehicles',
      });
    }

    // Update fields
    if (year !== undefined) vehicle.year = year;
    if (make !== undefined) vehicle.make = make;
    if (model !== undefined) vehicle.model = model;
    if (color !== undefined) vehicle.color = color;
    if (vehicleType !== undefined) vehicle.vehicleType = vehicleType;
    if (plateNumber) {
      const normalizedPlate = normalizePlateNumber(typeof plateNumber === 'string' ? plateNumber : '');
      if (!platePattern.test(normalizedPlate)) {
        return res.status(400).json({
          success: false,
          message: 'Plate number must be 4–9 alphanumeric characters (e.g., ABC1234)',
        });
      }
      const conflict = await findVehicleByNormalizedPlate(normalizedPlate);
      if (conflict && conflict._id.toString() !== vehicle._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'This plate number is already registered to another account.',
          code: 'PLATE_TAKEN',
        });
      }
      vehicle.plateNumber = normalizedPlate;
    }
    if (transmission !== undefined) {
      vehicle.transmission = txAllowed.includes(transmission) ? transmission : '';
    }
    if (fuelType !== undefined) {
      vehicle.fuelType = fuelAllowed.includes(fuelType) ? fuelType : '';
    }

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

/**
 * Delete a vehicle
 */
export const deleteVehicle = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Invalid or missing user session',
      });
    }

    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found',
      });
    }

    if (
      vehicle.customer.toString() !== req.user.id &&
      !isFullAdminRole(req.user.role) &&
      !canManageCustomerGarage(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only delete your own vehicles',
      });
    }

    await vehicle.deleteOne();

    res.json({
      success: true,
      message: 'Vehicle deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
