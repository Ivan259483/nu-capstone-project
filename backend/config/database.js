import mongoose from 'mongoose';
import path from 'path';

const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/autospf';
  const fallbackUri = 'mongodb://127.0.0.1:27017/autospf';

  const redactMongoUri = (uri = '') => uri.replace(/(mongodb(?:\+srv)?:\/\/)([^@]+)@/i, '$1***:***@');

  const connectWithUri = async (uri) => {
    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  };

  try {
    console.log('MongoDB URI:', redactMongoUri(primaryUri));
    return await connectWithUri(primaryUri);
  } catch (error) {
    const nodeEnv = process.env.NODE_ENV || 'development';
    console.error(`MongoDB connection failed (${nodeEnv}): ${error.message}`);

    // In development, automatically fall back to local MongoDB to keep the app usable.
    if (nodeEnv === 'development' && primaryUri !== fallbackUri) {
      try {
        console.log('Falling back to local MongoDB:', fallbackUri);
        return await connectWithUri(fallbackUri);
      } catch (fallbackError) {
        console.error(`Local MongoDB fallback failed: ${fallbackError.message}`);
      }
    }

    // Final fallback: in-memory MongoDB for local dev (no external DB required)
    if (nodeEnv === 'development') {
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        const downloadDir = path.join(process.cwd(), '.mongodb-binaries');
        const mem = await MongoMemoryServer.create({
          binary: { downloadDir, version: '7.0.14' },
          instance: { dbName: 'autospf' },
        });
        const memUri = mem.getUri();
        console.log('Starting in-memory MongoDB for development:', memUri);
        return await connectWithUri(memUri);
      } catch (memErr) {
        console.error(`In-memory MongoDB fallback failed: ${memErr.message}`);
      }
    }

    process.exit(1);
  }
};

export default connectDB;
