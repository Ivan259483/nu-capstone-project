import Setting from '../models/setting.model.js';
import { logActivity } from '../utils/logActivity.utils.js';

/**
 * Get system settings
 */
export const getSettings = async (req, res, next) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({});
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

/**
 * Get public settings (for landing page)
 */
export const getPublicSettings = async (req, res, next) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({});
    }
    
    // Selectively pick fields that are safe to expose publicly
    const publicData = {
      businessName: settings.businessName,
      contactEmail: settings.contactEmail,
      phoneNumber: settings.phoneNumber,
      address: settings.address,
      logoUrl: settings.logoUrl,
      currency: settings.currency,
      operatingHours: settings.operatingHours,
      landingDetails: settings.landingDetails
    };
    
    res.json({ success: true, data: publicData });
  } catch (error) {
    next(error);
  }
};

/**
 * Update system settings
 */
export const updateSettings = async (req, res, next) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting(req.body);
    } else {
      Object.assign(settings, req.body);
    }
    await settings.save();

    logActivity({
      req, type: 'settings', module: 'Settings', action: 'Settings Updated',
      description: `${req.user?.name || 'Admin'} updated system settings.`,
      status: 'info',
      metadata: { updatedFields: Object.keys(req.body) },
    });

    res.json({ success: true, data: settings, message: 'Settings updated successfully' });
  } catch (error) {
    next(error);
  }
};
