import Product from '../models/Product.js';

/**
 * Get all products
 */
export const getAllProducts = async (req, res, next) => {
  try {
    const { category, skip = 0, limit = 10 } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const products = await Product.find(query)
      .populate('category')
      .populate('supplier')
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        skip: parseInt(skip),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get product by ID
 */
export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category')
      .populate('supplier');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create product
 */
export const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, category, supplier, inventory, minLevel, sku } = req.body;

    // Prevent Cast to ObjectId errors by setting empty strings to null
    const isValidId = (id) => id && id.length === 24 && /^[0-9a-fA-F]+$/.test(id);

    const product = new Product({
      name,
      description,
      price,
      category: isValidId(category) ? category : null,
      supplier: isValidId(supplier) ? supplier : null,
      inventory,
      minLevel,
      sku,
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update product
 */
export const updateProduct = async (req, res, next) => {
  try {
    // Prevent Cast to ObjectId errors in body
    const isValidId = (id) => id && id.length === 24 && /^[0-9a-fA-F]+$/.test(id);
    const updateData = { ...req.body };
    
    if (updateData.category === "") updateData.category = null;
    else if (updateData.category && !isValidId(updateData.category)) delete updateData.category;

    if (updateData.supplier === "") updateData.supplier = null;
    else if (updateData.supplier && !isValidId(updateData.supplier)) delete updateData.supplier;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete product
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
