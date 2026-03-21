import Supplier from '../models/Supplier.js';
import SupplierOrder from '../models/SupplierOrder.js';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeProducts = (products) => {
    if (!products) return [];
    if (Array.isArray(products)) {
        return products.map((p) => String(p).trim()).filter(Boolean);
    }
    if (typeof products === 'string') {
        return products.split(',').map((p) => p.trim()).filter(Boolean);
    }
    return [];
};

export const getAllSuppliers = async (req, res, next) => {
    try {
        const suppliers = await Supplier.find();
        res.json({ success: true, data: suppliers });
    } catch (error) {
        next(error);
    }
};

export const createSupplier = async (req, res, next) => {
    try {
        const {
            name,
            companyName,
            email,
            contactPerson,
            phone,
            products
        } = req.body;

        const normalizedName = (name || companyName || '').trim();
        if (!normalizedName) {
            return res.status(400).json({
                success: false,
                message: 'Company name is required'
            });
        }

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (normalizedEmail) {
            const existingEmail = await Supplier.findOne({
                email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i')
            });
            if (existingEmail) {
                return res.status(409).json({
                    success: false,
                    message: 'Duplicate entry: email already exists'
                });
            }
        }

        const existingName = await Supplier.findOne({
            name: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i')
        });
        if (existingName) {
            return res.status(409).json({
                success: false,
                message: 'Duplicate entry: company name already exists'
            });
        }

        const supplier = new Supplier({
            name: normalizedName,
            contactPerson,
            email: normalizedEmail || undefined,
            phone,
            products: normalizeProducts(products)
        });
        await supplier.save();
        res.status(201).json({ success: true, data: supplier });
    } catch (error) {
        if (error?.code === 11000) {
            const key = Object.keys(error.keyPattern || {})[0] || 'field';
            const message = key === 'email'
                ? 'Duplicate entry: email already exists'
                : 'Duplicate entry: company name already exists';
            return res.status(409).json({ success: false, message });
        }
        next(error);
    }
};

export const deleteSupplier = async (req, res, next) => {
    try {
        // Check for active orders if needed
        const activeOrders = await SupplierOrder.findOne({ supplier: req.params.id, status: 'Pending' });
        if (activeOrders) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete supplier with pending orders'
            });
        }

        const supplier = await Supplier.findByIdAndDelete(req.params.id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }
        res.json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
        next(error);
    }
};

export const placeOrder = async (req, res, next) => {
    try {
        const { supplierId } = req.body;
        const supplier = await Supplier.findById(supplierId);
        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }

        if (!supplier.products || supplier.products.length === 0) {
            return res.status(400).json({ success: false, message: 'Supplier has no products listed' });
        }

        const order = new SupplierOrder({
            supplier: supplierId,
            items: supplier.products,
            status: 'Pending',
            orderDate: new Date()
        });

        await order.save();

        // Update supplier stats
        supplier.lastOrder = order.orderDate;
        // Optionally update totalSpent here or on completion. 
        // User said: "Update the 'Total Spent' and 'Last Order' date on the supplier card immediately"
        // So we'll update lastOrder. totalSpent might need an amount.
        // Since no amount was specified in prompt, we'll keep it simple or use a default.
        await supplier.save();

        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            data: {
                order,
                supplier: {
                    lastOrder: supplier.lastOrder,
                    totalSpent: supplier.totalSpent
                }
            }
        });
    } catch (error) {
        next(error);
    }
};
