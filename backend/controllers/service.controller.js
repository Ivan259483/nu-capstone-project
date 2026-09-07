import { requireVehiclePricing } from '../services/vehicleIntelligence.service.js';
import Service from '../models/service.model.js';
import Vehicle from '../models/vehicle.model.js';
import ActivityLog from '../models/activityLog.model.js';
import {
    SPF_CATALOG_VERSION,
    SPF_PACKAGE_PRICING,
    UNDERCOATING_PRICING,
    getPackageKeyFromName,
} from '../constants/spfPricing.js';
import { PPF_FULL_WRAP_CATALOG } from '../constants/ppfCatalog.js';
import {
    VEHICLE_PRICING_CATEGORIES,
} from '../constants/pricingCategories.js';
import { isCustomerRole } from '../constants/roles.js';
import { ServicePricingError, resolveServicePricing } from '../services/servicePricing.service.js';

const VEHICLE_PRICING_KEYS = ['hatchback', 'sedan', 'midsized', 'suv', 'pickup', 'largeSuv', 'highend'];
const LEGACY_PRICE_KEYS = {
    hatchback: 'hatchback',
    sedan: 'sedan',
    midsized: 'midsized',
    suv: 'suv',
    pickup: 'pickup',
    largeSuv: 'largesuv',
    highend: 'highend',
};

const VEHICLE_LABELS = {
    hatchback: 'Hatchback',
    sedan: 'Sedan',
    midsized: 'Midsized',
    suv: 'SUV',
    pickup: 'Pick Up',
    largeSuv: 'Large SUV / Van',
    highend: 'Highend Sedan',
};

const normalizeVehicleType = (vehicleType) => {
    if (typeof vehicleType !== 'string') return null;
    const normalized = vehicleType.trim().toLowerCase().replace(/[\s_-]/g, '');
    const map = {
        hatchback: 'hatchback',
        sedan: 'sedan',
        midsized: 'midsized',
        midsize: 'midsized',
        suv: 'suv',
        pickup: 'pickup',
        pickuptruck: 'pickup',
        largesuv: 'largeSuv',
        largevan: 'largeSuv',
        van: 'largeSuv',
        highend: 'highend',
        highendsedan: 'highend',
    };
    return map[normalized] || null;
};

const normalizeMoney = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        const error = new Error(`${fieldName} must be a positive number or null`);
        error.statusCode = 422;
        throw error;
    }
    return Math.round(numeric * 100) / 100;
};

const toNumberOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

export const normalizeServicePricing = (service) => {
    const normalized = typeof service.toObject === 'function' ? service.toObject() : { ...service };
    const packageKey = getPackageKeyFromName(normalized.name);
    const canonicalPackage = packageKey ? SPF_PACKAGE_PRICING[packageKey] : null;
    const storedCatalogCard = normalized.catalogCard || {};
    const canonicalCatalogCard = canonicalPackage?.catalogCard || {};
    const pricing = {};

    VEHICLE_PRICING_KEYS.forEach((vehicleKey) => {
        const legacyKey = LEGACY_PRICE_KEYS[vehicleKey];
        const existing = normalized.pricing?.[vehicleKey] || {};
        const legacyBase = normalized.prices?.[legacyKey];
        pricing[vehicleKey] = {
            base: toNumberOrNull(existing.base ?? legacyBase),
            original: toNumberOrNull(existing.original),
            addon: toNumberOrNull(existing.addon),
        };
    });

    return {
        ...normalized,
        packageCode: canonicalPackage?.packageCode || normalized.packageCode,
        tier: canonicalPackage?.tier || normalized.tier,
        protectionYears: canonicalPackage?.protectionYears ?? normalized.protectionYears,
        durationNeedsClientVerification: canonicalPackage?.durationNeedsClientVerification
            ?? normalized.durationNeedsClientVerification
            ?? false,
        catalogVersion: canonicalPackage ? SPF_CATALOG_VERSION : normalized.catalogVersion,
        description: normalized.description || canonicalPackage?.description,
        duration: normalized.duration || canonicalPackage?.duration,
        // Poster-authoritative package metadata takes precedence over stale
        // stored badges/flags. The sync script persists this canonical shape.
        catalogCard: canonicalPackage ? canonicalCatalogCard : storedCatalogCard,
        pricing,
    };
};

const getMinimumBasePrice = (service) => {
    const values = VEHICLE_PRICING_KEYS
        .map((vehicleKey) => {
            const legacyKey = LEGACY_PRICE_KEYS[vehicleKey];
            return toNumberOrNull(service.pricing?.[vehicleKey]?.base ?? service.prices?.[legacyKey]);
        })
        .filter((value) => value !== null);

    const hasExplicitHatchbackPrice = toNumberOrNull(service.pricing?.hatchback?.base ?? service.prices?.hatchback) !== null;
    if (!hasExplicitHatchbackPrice) {
        const fallbackBase = toNumberOrNull(service.basePrice);
        if (fallbackBase !== null) values.push(fallbackBase);
    }

    return values.length > 0 ? Math.min(...values) : toNumberOrNull(service.basePrice) || 0;
};

export const getAllServices = async (req, res, next) => {
    try {
        const services = await Service.find().sort({ bookingCount: -1, createdAt: -1 }).lean();
        res.json({ success: true, data: services.map(normalizeServicePricing) });
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
        }).sort({ bookingCount: -1, createdAt: -1 }).lean();
        res.json({ success: true, data: services.map(normalizeServicePricing) });
    } catch (error) {
        next(error);
    }
};

export const getAuthoritativeCatalog = async (req, res, next) => {
    try {
        const services = await Service.find({
            status: 'Active',
            isPublished: true,
            billingGroup: 'ceramic_spf',
        }).sort({ displayOrder: 1, createdAt: 1 }).lean();

        res.json({
            success: true,
            data: {
                catalogVersion: SPF_CATALOG_VERSION,
                pricingCategories: VEHICLE_PRICING_CATEGORIES,
                packages: services.map(normalizeServicePricing),
                addOns: {
                    undercoating: {
                        pricingMode: 'additive',
                        prices: UNDERCOATING_PRICING,
                        includedInPackageCodes: ['SPF101'],
                    },
                },
                ppfFullWrapCatalog: PPF_FULL_WRAP_CATALOG,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const getBookingOptions = async (req, res, next) => {
    let pricingVehicle = null;
    try {
        const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId.trim() : '';
        if (!vehicleId) {
            return res.status(422).json({
                success: false,
                errorCode: 'VEHICLE_REQUIRED',
                message: 'Select a saved vehicle before requesting package pricing.',
            });
        }

        pricingVehicle = await Vehicle.findById(vehicleId).lean();
        if (!pricingVehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found.' });
        }
        if (isCustomerRole(req.user?.role) && String(pricingVehicle.customer) !== String(req.user.id)) {
            return res.status(403).json({ success: false, message: 'This vehicle does not belong to your account.' });
        }

        pricingVehicle = await requireVehiclePricing(pricingVehicle);

        const services = await Service.find({
            status: 'Active',
            isPublished: true,
            billingGroup: 'ceramic_spf',
        }).sort({ displayOrder: 1, createdAt: 1 });

        const packages = services.map((service) => resolveServicePricing({
            vehiclePricingCategory: pricingVehicle.pricingCategory,
            packageCode: service.packageCode,
            service,
        }));

        return res.json({
            success: true,
            data: {
                catalogVersion: SPF_CATALOG_VERSION,
                vehicle: {
                    id: String(pricingVehicle._id),
                    year: pricingVehicle.year,
                    make: pricingVehicle.make,
                    model: pricingVehicle.model,
                    vehicleType: pricingVehicle.vehicleType,
                    pricingCategory: pricingVehicle.pricingCategory,
                    pricingCategoryNeedsReview: Boolean(pricingVehicle.pricingCategoryNeedsReview),
                },
                packages,
                addOns: {
                    undercoating: {
                        price: UNDERCOATING_PRICING[pricingVehicle.pricingCategory] ?? null,
                        includedInPackageCodes: ['SPF101'],
                    },
                },
            },
        });
    } catch (error) {
        if (error instanceof ServicePricingError) {
            console.error('[pricing] Booking options configuration error', {
                errorCode: error.code,
                vehicleId: req.query?.vehicleId || null,
                make: pricingVehicle?.make || null,
                model: pricingVehicle?.model || null,
                vehicleType: pricingVehicle?.vehicleType || null,
                packageCode: error.details?.packageCode || null,
                details: error.details,
            });
            return res.status(error.statusCode).json({
                success: false,
                errorCode: error.code,
                message: error.message,
                details: error.details,
            });
        }
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

export const updateServicePricing = async (req, res, next) => {
    try {
        const serviceId = req.params.serviceId || req.params.id;
        const vehicleKey = normalizeVehicleType(req.body?.vehicleType);

        if (!vehicleKey) {
            return res.status(422).json({
                success: false,
                message: 'Invalid vehicleType. Use hatchback, sedan, midsized, suv, pickup, largeSuv, or highend.',
            });
        }

        const basePrice = normalizeMoney(req.body?.basePrice, 'basePrice');
        const originalPrice = normalizeMoney(req.body?.originalPrice, 'originalPrice');
        const addonPrice = normalizeMoney(req.body?.addonPrice, 'addonPrice');

        const service = await Service.findById(serviceId);
        if (!service) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }

        const oldBase = toNumberOrNull(service.pricing?.[vehicleKey]?.base ?? service.prices?.[LEGACY_PRICE_KEYS[vehicleKey]]);

        service.set(`pricing.${vehicleKey}.base`, basePrice);
        service.set(`pricing.${vehicleKey}.original`, originalPrice);
        service.set(`pricing.${vehicleKey}.addon`, addonPrice);
        service.set(`prices.${LEGACY_PRICE_KEYS[vehicleKey]}`, basePrice);
        service.basePrice = getMinimumBasePrice(service);
        service.lastUpdatedBy = req.user?.name || 'Admin';
        service.lastUpdatedAt = new Date();

        await service.save();

        try {
            await ActivityLog.create({
                type: 'price_override',
                title: `Price updated — ${service.name}`,
                description: `${service.name} ${VEHICLE_LABELS[vehicleKey]} price changed from ₱${(oldBase || 0).toLocaleString()} to ₱${(basePrice || 0).toLocaleString()} by ${req.user?.name || 'Admin'}`,
                userId: req.user?.id || req.user?._id || 'system',
                userName: req.user?.name || 'Admin',
                metadata: {
                    serviceId: service._id,
                    serviceName: service.name,
                    vehicleType: vehicleKey,
                    oldPrice: oldBase,
                    newPrice: basePrice,
                    originalPrice,
                    addonPrice,
                },
            });
        } catch (logErr) {
            console.warn('Activity log failed:', logErr.message);
        }

        res.json({ success: true, data: normalizeServicePricing(service) });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
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
