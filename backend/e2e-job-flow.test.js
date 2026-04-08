import mongoose from 'mongoose';
import connectDB from './config/database.js';
import Order from './models/order.model.js';
import User from './models/user.model.js';
import crypto from 'crypto';

const runTest = async () => {
    try {
        console.log('Connecting to database...');
        await connectDB();
        
        console.log('\n--- 1. Testing Create Job ---');
        // Let's just create a dummy customer user to satisfy schema.
        const mockCustomerEmail = `e2e-${Date.now()}@test.com`;
        let mockUser = await User.create({ email: mockCustomerEmail, name: 'E2E Test User', role: 'customer', password: 'Password1!' });
        
        let order = new Order({
            customer: mockUser._id,
            orderNumber: `ORD-${Date.now()}`,
            customerInfo: { name: 'E2E Test User', email: mockCustomerEmail, phone: '1234567890' },
            vehicleInfo: 'Test Tesla Model 3',
            serviceName: 'Ceramic Coating',
            totalPrice: 1500,
            bookingDate: new Date(),
            bookingTime: '10:00 AM',
            status: 'pending',
            paymentStatus: 'unpaid'
        });
        await order.save();
        console.log(`Created Order with ID: ${order._id} and Number: ${order.orderNumber}`);
        
        console.log('\n--- 2. Testing Update Checklist Logic (Locking Simulation) ---');
        // Let's add some checklist
        order.operationsChecklist = {
            servicePhase: {
                steps: [
                    { name: 'Wash', isCompleted: true },
                    { name: 'Dry', isCompleted: false, isMustExplain: true }
                ]
            }
        };
        await order.save();
        console.log('Operations Checklist saved.');
        
        console.log('\n--- 3. Testing Warranty Receipt & Signature Encryption ---');
        const demoSignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
        
        // Simulating the controller logic for saving warranty receipt
        if (!order.warrantyAndReceipt) order.warrantyAndReceipt = {};
        
        const warrantyPayload = {
            amountPaid: 1500,
            paymentMethod: 'cash',
            customerSignature: crypto.randomBytes(32).toString('hex') + demoSignature, // Add a random string to simulate actual base64
            signedAt: new Date()
        };
        Object.assign(order.warrantyAndReceipt, warrantyPayload);
        
        // Simulating the certificate number generation
        if (!order.warrantyAndReceipt.certificateNumber) {
            const timestamp = Date.now().toString().slice(-4);
            const orderSuffix = order._id.toString().slice(-4);
            order.warrantyAndReceipt.certificateNumber = `W-${orderSuffix}${timestamp}`;
        }
        
        await order.save();
        console.log(`Warranty payload saved! Certificate Num: ${order.warrantyAndReceipt.certificateNumber}`);
        
        console.log('\n--- 4. Testing End-to-End Persistence and Customer Portal Fetching ---');
        const fetchedOrder = await Order.findById(order._id);
        
        if (fetchedOrder && fetchedOrder.warrantyAndReceipt) {
            console.log('Successfully fetched order.');
            // Decryption plugin should be executed correctly
            if (fetchedOrder.warrantyAndReceipt.customerSignature === warrantyPayload.customerSignature) {
                console.log('✅ SIGNATURE DECRYPTION PASSED!');
            } else {
                console.error('❌ SIGNATURE DECRYPTION FAILED!');
                console.log('Expected:', warrantyPayload.customerSignature.slice(0, 10));
                console.log('Got:', fetchedOrder.warrantyAndReceipt.customerSignature.slice(0, 10));
                process.exit(-1);
            }
        } else {
            console.error('❌ FAILED TO FETCH ORDER WITH WARRANTY DATA!');
            process.exit(-1);
        }
        
        console.log('\n--- 5. Cleanup ---');
        await Order.findByIdAndDelete(order._id);
        await User.findByIdAndDelete(mockUser._id);
        console.log('Test Order and User Cleaned up.');
        
        process.exit(0);
    } catch (err) {
        console.error('Error during E2E test:', err);
        process.exit(1);
    }
};

runTest();
