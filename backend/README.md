# Backend Structure Documentation

## 📁 Folder Structure

```
/backend
├── /config
│   ├── database.js          # MongoDB connection setup
│   └── environment.js       # Environment variables and config
├── /controllers
│   ├── authController.js    # Authentication logic (login, register)
│   ├── userController.js    # User management
│   ├── productController.js # Product management
│   ├── categoryController.js# Category management
│   ├── orderController.js   # Order management
│   ├── storeController.js   # Store management
│   └── customerController.js# Customer management
├── /middleware
│   ├── auth.js              # JWT authentication & authorization
│   ├── errorHandler.js      # Global error handling
│   └── validation.js        # Request validation
├── /models
│   ├── User.js              # User schema
│   ├── Product.js           # Product schema
│   ├── Category.js          # Category schema
│   ├── Order.js             # Order schema
│   ├── Store.js             # Store schema
│   └── Customer.js          # Customer schema
├── /routes
│   ├── auth.js              # Auth endpoints
│   ├── users.js             # User endpoints
│   ├── products.js          # Product endpoints
│   ├── categories.js        # Category endpoints
│   ├── orders.js            # Order endpoints
│   ├── stores.js            # Store endpoints
│   └── customers.js         # Customer endpoints
├── /utils
│   └── helpers.js           # Helper functions
├── server.js                # Main Express server
├── package.json             # Dependencies
├── .env.example             # Environment template
└── README.md                # This file
```

## 🏗️ Architecture Pattern: MVC (Model-View-Controller)

### Structure Overview

1. **Routes** - Define API endpoints
   - Handle incoming requests
   - Map requests to controllers
   - Define access permissions (public/private)

2. **Controllers** - Contain business logic
   - Process requests
   - Interact with models
   - Return responses

3. **Models** - Define data structure
   - MongoDB schemas
   - Data validation
   - Database operations

4. **Middleware** - Handle cross-cutting concerns
   - Authentication
   - Authorization
   - Error handling
   - Validation

5. **Config** - Centralized configuration
   - Database connection
   - Environment variables

6. **Utils** - Helper functions
   - Response formatting
   - Pagination
   - Common utilities

## 📋 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/logout` - Logout (requires auth)

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)

### Products
- `GET /api/products` - Get all products (public)
- `GET /api/products/:id` - Get product by ID (public)
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Categories
- `GET /api/categories` - Get all categories (public)
- `GET /api/categories/:id` - Get category by ID (public)
- `POST /api/categories` - Create category (admin only)
- `PUT /api/categories/:id` - Update category (admin only)
- `DELETE /api/categories/:id` - Delete category (admin only)

### Orders
- `GET /api/orders` - Get all orders (requires auth)
- `GET /api/orders/:id` - Get order by ID (requires auth)
- `POST /api/orders` - Create order (requires auth)
- `PUT /api/orders/:id` - Update order (requires auth)
- `DELETE /api/orders/:id` - Delete order (admin only)

### Stores
- `GET /api/stores` - Get all stores (public)
- `GET /api/stores/:id` - Get store by ID (public)
- `POST /api/stores` - Create store (admin only)
- `PUT /api/stores/:id` - Update store (admin or manager)
- `DELETE /api/stores/:id` - Delete store (admin only)

### Customers
- `GET /api/customers` - Get all customers (admin only)
- `GET /api/customers/:id` - Get customer by ID (requires auth)
- `POST /api/customers` - Create customer (requires auth)
- `PUT /api/customers/:id` - Update customer (requires auth)
- `DELETE /api/customers/:id` - Delete customer (admin only)

## 🚀 Getting Started

### Installation

```bash
cd backend
npm install
```

### Environment Setup

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Configuration

**`.env` file:**
```
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/autospf
JWT_SECRET=your_secret_key
CORS_ORIGIN=http://localhost:5173
```

### Running the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## 🔐 Authentication & Authorization

### JWT Token
- Issued on successful login/register
- Expires in 7 days
- Include in Authorization header: `Bearer <token>`

### Role-Based Access Control (RBAC)
- **customer** - Customer access
- **detailer** - Service provider access
- **admin** - Full system access

### Usage in Requests
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## 📊 Data Models

### User Model
```javascript
{
  name: String,
  email: String (unique),
  password: String,
  role: ['customer', 'detailer', 'admin'],
  phone: String,
  address: String,
  isActive: Boolean,
  timestamps: true
}
```

### Product Model
```javascript
{
  name: String,
  description: String,
  price: Number,
  category: ObjectId (ref: Category),
  inventory: Number,
  sku: String (unique),
  images: [String],
  isActive: Boolean,
  timestamps: true
}
```

### Order Model
```javascript
{
  orderNumber: String (unique),
  customer: ObjectId (ref: User),
  items: [{
    product: ObjectId (ref: Product),
    quantity: Number,
    price: Number
  }],
  totalAmount: Number,
  status: ['pending', 'processing', 'completed', 'cancelled'],
  shippingAddress: String,
  notes: String,
  timestamps: true
}
```

### Store Model
```javascript
{
  name: String,
  address: String,
  city: String,
  state: String,
  zipCode: String,
  phone: String,
  email: String,
  manager: ObjectId (ref: User),
  isActive: Boolean,
  timestamps: true
}
```

### Customer Model
```javascript
{
  user: ObjectId (ref: User),
  vehicles: [ObjectId (ref: Vehicle)],
  bookings: [ObjectId (ref: Booking)],
  preferredStore: ObjectId (ref: Store),
  loyaltyPoints: Number,
  timestamps: true
}
```

## 🛠️ Adding New Features

### Create a New Route

1. **Create Controller** (`/controllers/featureController.js`)
   ```javascript
   export const getFeatures = async (req, res, next) => {
     try {
       // Your logic here
     } catch (error) {
       next(error);
     }
   };
   ```

2. **Create Route** (`/routes/features.js`)
   ```javascript
   import express from 'express';
   import * as controller from '../controllers/featureController.js';
   import { authenticate } from '../middleware/auth.js';

   const router = express.Router();
   router.get('/', controller.getFeatures);
   export default router;
   ```

3. **Register Route** in `server.js`
   ```javascript
   import featureRoutes from './routes/features.js';
   app.use('/api/features', featureRoutes);
   ```

## ⚠️ Important Notes

### Security TODO
- [ ] Implement bcrypt password hashing
- [ ] Add input validation with Zod
- [ ] Implement rate limiting
- [ ] Add request logging
- [ ] Set up HTTPS in production
- [ ] Implement refresh tokens

### Performance TODO
- [ ] Add database indexing
- [ ] Implement caching (Redis)
- [ ] Add pagination to all list endpoints
- [ ] Implement query optimization

### Testing TODO
- [ ] Add unit tests (Jest)
- [ ] Add integration tests
- [ ] Add API endpoint tests

## 📚 Dependencies

- **express** - Web framework
- **mongoose** - MongoDB ODM
- **jsonwebtoken** - JWT authentication
- **cors** - CORS middleware
- **dotenv** - Environment variables
- **bcryptjs** - Password hashing
- **nodemon** - Development auto-reload

## 🐛 Error Handling

All errors are caught and formatted consistently:

```json
{
  "success": false,
  "status": 400,
  "message": "Error message",
  "stack": "..." // Only in development
}
```

## 📝 Code Examples

### Example: Fetch Products
```bash
curl -X GET http://localhost:3000/api/products
```

### Example: Create Order
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "userId",
    "items": [
      { "product": "productId", "quantity": 2, "price": 99.99 }
    ],
    "shippingAddress": "123 Main St"
  }'
```

### Example: Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

## 🔗 Frontend Integration

Connect your React frontend using the API base URL:

```javascript
const API_BASE = 'http://localhost:3000/api';

// Example API call
const response = await fetch(`${API_BASE}/products`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## Cloud cold start and keep-alive (Render, Railway, etc.)

Hobby/free tiers may **sleep** the Node process after idle time. The first browser request after sleep waits for a **cold boot** (often tens of seconds).

- **In-process `setInterval` that calls your own `/api/health` does not prevent sleep**: when the process is stopped, no timers run.
- **Do this instead**:
  1. In your host’s service settings, set the **Health check path** to `/api/health` (same route as `GET /api/health` in `server.js`).
  2. Use an **external** HTTP monitor (e.g. UptimeRobot, cron-job.org, GitHub Actions on a schedule) to `GET` `https://<your-deployed-api-host>/api/health` every **5 minutes** (or the minimum interval your plan allows). Example production host: `https://nu-capstone-project.onrender.com`. Use the same host you configure for the API (see frontend `VITE_API_URL` / `VITE_BACKEND_URL`).

The health response body is unchanged (`success`, `message`, `timestamp`); it uses a short **`Cache-Control: public, max-age=60`** so repeated probes do not fight `no-store` on the rest of the API.

## 📞 Support

For issues or questions:
1. Check the error message and logs
2. Review the route documentation
3. Check middleware configuration
4. Verify JWT token validity

---

**Last Updated:** 2026-02-04
**Version:** 1.0.0
