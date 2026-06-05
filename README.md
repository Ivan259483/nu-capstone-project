# AutoSPF+ Premium Automotive Service Management

![Build Status](https://img.shields.io/badge/Build-v1.0.0-orange)
![Security](https://img.shields.io/badge/Security-ProductionReady-brightgreen)
![Status](https://img.shields.io/badge/Status-Complete-blue)

AutoSPF+ is a high-end management platform for automotive detailing and protection services. It features real-time job tracking, smart staff assignment, and a premium customer experience dashboard.

## 🚀 Key Features

- **Admin Dashboard**: Full visibility into operations, inventory management, and smart staff allocation with built-in overbooking prevention.
- **Detailer Dashboard**: Optimized mobile-first view for staff at the shop to track timers, log inventory usage, and upload before/after photos.
- **Customer Dashboard**: Elegant portal for booking services, tracking job progress, and managing loyalty points.
- **Smart Assignment**: AI-ready logic that prevents overbooking by checking real-time staff availability.
- **Security First**: Multi-layer security including JWT authentication, password encryption (bcrypt), rate limiting, and input sanitization.

## 🛠️ Technology Stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Lucide Icons, Sonner Toasts.
- **Backend**: Node.js, Express, MongoDB Atlas (Mongoose), JWT.
- **Communications**: Brevo (Sendinblue) for OTP and notifications.

## 📋 Production Checklist Implemented

- [x] **Robust Error Boundaries**: Global and component-level crash prevention.
- [x] **Security Hardening**: Helmet.js (Strict CSP), NoSQL Sanitization, XSS Protection.
- [x] **Field-Level Encryption**: AES-256-CBC encryption for sensitive PII (Phone, Address, Plates).
- [x] **Rate Limiting**: Brute-force protection for Login and OTP routes.
- [x] **API Resilience**: Global interceptors for network errors and session timeouts.
- [x] **Type Safety**: Centralized TypeScript definitions for consistent data handling.
- [x] **Edge Ready**: Built with Vercel Edge caching and optimization in mind.
- [x] **Performance**: Gzip compression, asset optimization, and optimized React rendering.

## ⚙️ Setup Instructions

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas Account
- Brevo API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone [repository-url]
   cd AutoSPF+
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   # Create .env based on the environment variables section below
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 🔐 Environment Variables

### Backend (`/backend/.env`)
```env
PORT=3000
MONGODB_URI=your_mongodb_atlas_uri
JWT_SECRET=your_jwt_secret_key
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM=noreply@autospf.com
CORS_ORIGIN=http://localhost:5173
```

### Frontend (`/autospf/.env`)
```env
VITE_API_URL=http://localhost:3000/api
```

## 🏷️ Tags
#ProductionReady #AutoSPFv1 #AutomotiveSaaS #MERNStack #EnterpriseReady

---
© 2026 AutoSPF+ Inc. | Premium Quality Guaranteed.
