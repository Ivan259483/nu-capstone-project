import Service from '../models/service.model.js';
import ActivityLog from '../models/activityLog.model.js';

export const getAllServices = async (req, res, next) => {
    try {
        const services = await Service.find().sort({ bookingCount: -1, createdAt: -1 });
        res.json({ success: true, data: services });
    } catch (error) {
        next(error);
    }
};

// Get only published+active services (for customer-facing endpoints)
export const getPublishedServices = async (req, res, next) => {
    try {
        const services = await Service.find({
            status: 'Active',
            isPublished: true,
        }).sort({ bookingCount: -1, createdAt: -1 });
        res.json({ success: true, data: services });
    } catch (error) {
        next(error);
    }
};

export const createService = async (req, res, next) => {
    try {
        const service = new Service({
            ...req.body,
            lastUpdatedBy: req.user?.name || 'Admin',
            lastUpdatedAt: new Date(),
        });
        await service.save();

        // Log activity
        try {
            await ActivityLog.create({
                type: 'status_change',
                title: `New service created — ${service.name}`,
                description: `Service "${service.name}" (${service.category}) was created at ₱${service.basePrice}`,
                userId: req.user?._id || 'system',
                userName: req.user?.name || 'Admin',
                metadata: {
                    serviceId: service._id,
                    serviceName: service.name,
                    price: service.basePrice,
                },
            });
        } catch (logErr) {
            console.warn('Activity log failed:', logErr.message);
        }

        res.status(201).json({ success: true, data: service });
    } catch (error) {
        next(error);
    }
};

export const updateService = async (req, res, next) => {
    try {
        const existing = await Service.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }

        const oldPrice = existing.basePrice;
        const oldStatus = existing.status;
        const oldPublished = existing.isPublished;

        // Apply updates
        Object.assign(existing, req.body, {
            lastUpdatedBy: req.user?.name || 'Admin',
            lastUpdatedAt: new Date(),
        });
        await existing.save();

        // Log price change to activity
        if (req.body.basePrice !== undefined && req.body.basePrice !== oldPrice) {
            try {
                await ActivityLog.create({
                    type: 'price_override',
                    title: `Price updated — ${existing.name}`,
                    description: `${existing.name} price changed from ₱${oldPrice.toLocaleString()} to ₱${existing.basePrice.toLocaleString()} by ${req.user?.name || 'Admin'}`,
                    userId: req.user?._id || 'system',
                    userName: req.user?.name || 'Admin',
                    metadata: {
                        serviceId: existing._id,
                        serviceName: existing.name,
                        oldPrice,
                        newPrice: existing.basePrice,
                    },
                });
            } catch (logErr) {
                console.warn('Activity log failed:', logErr.message);
            }
        }

        // Log status/published changes
        if (req.body.status !== undefined && req.body.status !== oldStatus) {
            try {
                await ActivityLog.create({
                    type: 'status_change',
                    title: `Service ${req.body.status === 'Active' ? 'activated' : 'deactivated'} — ${existing.name}`,
                    description: `${existing.name} was set to ${req.body.status} by ${req.user?.name || 'Admin'}`,
                    userId: req.user?._id || 'system',
                    userName: req.user?.name || 'Admin',
                });
            } catch (logErr) {
                console.warn('Activity log failed:', logErr.message);
            }
        }

        if (req.body.isPublished !== undefined && req.body.isPublished !== oldPublished) {
            try {
                await ActivityLog.create({
                    type: 'status_change',
                    title: `Service ${req.body.isPublished ? 'published' : 'unpublished'} — ${existing.name}`,
                    description: `${existing.name} visibility set to ${req.body.isPublished ? 'published' : 'unpublished'} by ${req.user?.name || 'Admin'}`,
                    userId: req.user?._id || 'system',
                    userName: req.user?.name || 'Admin',
                });
            } catch (logErr) {
                console.warn('Activity log failed:', logErr.message);
            }
        }

        res.json({ success: true, data: existing });
    } catch (error) {
        next(error);
    }
};

export const deleteService = async (req, res, next) => {
    try {
        const service = await Service.findByIdAndDelete(req.params.id);
        if (!service) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }

        // Log deletion
        try {
            await ActivityLog.create({
                type: 'status_change',
                title: `Service deleted — ${service.name}`,
                description: `Service "${service.name}" was permanently deleted by ${req.user?.name || 'Admin'}`,
                userId: req.user?._id || 'system',
                userName: req.user?.name || 'Admin',
            });
        } catch (logErr) {
            console.warn('Activity log failed:', logErr.message);
        }

        res.json({ success: true, message: 'Service deleted successfully' });
    } catch (error) {
        next(error);
    }
};
