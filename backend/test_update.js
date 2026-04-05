import mongoose from 'mongoose';
import User from './models/user.model.js';

const run = async () => {
    try {
        await mongoose.connect('mongodb+srv://autosparies2025:B1P2Qc8iV6C8Eok9@autoshield.ihyid.mongodb.net/autospf?retryWrites=true&w=majority');
        
        const id = 'mr2cuXXzBXZSg5CFH6gBGTQT9DO2';
        const isObjectId = mongoose.Types.ObjectId.isValid(id) && (String(new mongoose.Types.ObjectId(id)) === String(id));
        const query = isObjectId ? { _id: id } : { firebaseUid: id };
        
        console.log("Query is:", query);
        
        const user = await User.findOneAndUpdate(
            query,
            { name: "Test User" },
            { new: true }
        );
        console.log("Result:", user);
        process.exit(0);
    } catch(e) {
        console.error("Error:", e);
        process.exit(1);
    }
}
run();
