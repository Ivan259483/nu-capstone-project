import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    console.log("URI being used:", process.env.MONGODB_URI);
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
