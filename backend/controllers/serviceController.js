import Service from '../models/Service.js';

export const getAllServices = async (req, res, next) => {
    try {
        const services = await Service.find();
        res.json({ success: true, data: services });
    } catch (error) {
        next(error);
    }
};

export const createService = async (req, res, next) => {
    try {
        const service = new Service(req.body);
        await service.save();
        res.status(201).json({ success: true, data: service });
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
        res.json({ success: true, message: 'Service deleted successfully' });
    } catch (error) {
        next(error);
    }
};
