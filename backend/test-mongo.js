import mongoose from 'mongoose';
import connectDB from './config/database.js';
import Product from './models/product.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const conn = await connectDB();
    console.log("DB connected");
    const products = await Product.find().limit(2);
    console.log("DB Products:", JSON.stringify(products, null, 2));
    
    if (products.length > 0) {
      const p = products[0];
      console.log("Updating product:", p._id);
      const updated = await Product.findByIdAndUpdate(p._id, { inventory: p.inventory + 1 }, { new: true });
      console.log("Updated product inventory:", updated.inventory);
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
