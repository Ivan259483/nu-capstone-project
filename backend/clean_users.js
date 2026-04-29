import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function cleanUsers() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    const result = await mongoose.connection.db.collection('users').deleteMany({
      email: {
        $nin: [
          "admin@test.com",
          "officeadmin@test.com",
          "customer@test.com",
          "admin@autospf.com"
        ]
      }
    });

    console.log(`Successfully deleted ${result.deletedCount} users.`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanUsers();
