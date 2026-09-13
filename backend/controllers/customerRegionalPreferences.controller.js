import Customer from '../models/customer.model.js';
import {
  normalizeCustomerRegionalPreferences,
  validateCustomerRegionalPatch,
} from '../utils/customerRegionalPreferences.utils.js';

export async function getMyRegionalPreferences(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const customer = await Customer.findOne({ user: req.user.id }).select('regionalPreferences');
    return res.json({ success: true, data: normalizeCustomerRegionalPreferences(customer?.regionalPreferences) });
  } catch (error) {
    next(error);
  }
}

export async function updateMyRegionalPreferences(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const error = validateCustomerRegionalPatch(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const updates = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [
      `regionalPreferences.${key}`, value,
    ]));
    const customer = await Customer.findOneAndUpdate(
      { user: req.user.id },
      { $set: updates },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).select('regionalPreferences');
    return res.json({
      success: true,
      message: 'Regional preferences updated.',
      data: normalizeCustomerRegionalPreferences(customer.regionalPreferences),
    });
  } catch (error) {
    next(error);
  }
}
