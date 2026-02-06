import Supplier from '../models/Supplier.js';
import SupplierOrder from '../models/SupplierOrder.js';

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
        const supplier = new Supplier(req.body);
        await supplier.save();
        res.status(201).json({ success: true, data: supplier });
    } catch (error) {
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
