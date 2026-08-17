import Setting from '../models/setting.model.js';
import ShopAvailability, { normalizeRecurringSchedule } from '../models/shopAvailability.model.js';
import { logActivity } from '../utils/logActivity.utils.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../services/adminNotification.service.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const getAuthoritativeOperatingHours = async () => {
  const availability = await ShopAvailability.getSingleton();
  return Object.fromEntries(
    normalizeRecurringSchedule(availability.recurringSchedule).map((row) => [
      DAY_NAMES[row.dow],
      {
        isOpen: row.open,
        open: row.from,
        close: row.to,
      },
    ])
  );
};

const withAuthoritativeAvailability = async (settings) => {
  const plain = typeof settings?.toObject === 'function' ? settings.toObject() : { ...(settings || {}) };
  delete plain.serviceCapacity;
  delete plain.operatingHours;
  return {
    ...plain,
    operatingHours: await getAuthoritativeOperatingHours(),
  };
};

const removeRetiredAvailabilityFields = () => Setting.collection.updateMany(
  {
    $or: [
      { serviceCapacity: { $exists: true } },
      { operatingHours: { $exists: true } },
    ],
  },
  { $unset: { serviceCapacity: '', operatingHours: '' } }
);

/**
 * Get system settings
 */
export const getSettings = async (req, res, next) => {
  try {
    await removeRetiredAvailabilityFields();
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({});
    }
    res.json({ success: true, data: await withAuthoritativeAvailability(settings) });
  } catch (error) {
    next(error);
  }
};

/**
 * Get public settings (for landing page)
 */
export const getPublicSettings = async (req, res, next) => {
  try {
    await removeRetiredAvailabilityFields();
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
      operatingHours: await getAuthoritativeOperatingHours(),
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
    // Appointment hours/capacity are owned exclusively by ShopAvailability.
    // Ignore retired fields if an older Settings client still submits them.
    const {
      operatingHours: _retiredOperatingHours,
      serviceCapacity: _retiredDailyCapacity,
      ...settingsUpdate
    } = req.body || {};
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting(settingsUpdate);
    } else {
      Object.assign(settings, settingsUpdate);
    }
    await settings.save();
    await Setting.collection.updateOne(
      { _id: settings._id },
      { $unset: { serviceCapacity: '', operatingHours: '' } }
    );

    logActivity({
      req, type: 'settings', module: 'Settings', action: 'Settings Updated',
      description: `${req.user?.name || 'Admin'} updated system settings.`,
      status: 'info',
      metadata: { updatedFields: Object.keys(settingsUpdate) },
    });

    const updatedFields = Object.keys(settingsUpdate);
    if (updatedFields.length > 0) {
      try {
        await createAdminNotification({
          title: 'System settings updated',
          message: `${req.user?.name || req.user?.email || 'An administrator'} updated ${updatedFields.length} system setting${updatedFields.length === 1 ? '' : 's'}.`,
          category: 'system',
          event: 'settings_updated',
          severity: 'info',
          source: 'Settings',
          actionRequired: false,
          groupingKey: buildAdminGroupingKey('system', 'settings_updated', req.user?.id || req.user?._id || 'admin'),
          groupingWindowMs: 10 * 60 * 1000,
          groupedTitle: '{count} system settings updates',
          link: buildAdminDeepLink('security'),
          action: { label: 'Review activity' },
          metadata: {
            updatedFields,
            actorUserId: req.user?.id || req.user?._id,
            actorName: req.user?.name || req.user?.email,
          },
        });
      } catch (notificationError) {
        console.warn('[settings] Admin notification failed:', notificationError.message);
      }
    }

    res.json({
      success: true,
      data: await withAuthoritativeAvailability(settings),
      message: 'Settings updated successfully',
    });
  } catch (error) {
    next(error);
  }
};
