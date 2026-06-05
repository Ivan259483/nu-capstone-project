# AutoSPF+ Premium Automotive Service Management

![Version](https://img.shields.io/badge/Version-v1.0.0-orange)
![Security](https://img.shields.io/badge/Security-Hardened-brightgreen)
![Status](https://img.shields.io/badge/Status-Portfolio_Showcase-blue)

AutoSPF+ is a full-stack automotive service management platform built for automotive detailing and protection services. It supports customer booking, POS and billing workflows, inventory monitoring, real-time service tracking, role-based dashboards, AI-assisted damage scan workflows, and secure authentication.

## Live Demo

Demo: https://autospf.shop

## Key Features

- **Admin Dashboard**: Manage users, roles, bookings, services, pricing, inventory, activity logs, and operational settings.
- **Customer Dashboard**: Customer portal for booking services, tracking vehicle progress, uploading payment proof, managing service history, and viewing loyalty points.
- **Sales / POS Dashboard**: Booking approval, billing, transaction management, customer records, and sales reporting.
- **Quality Checker / Staff Dashboard**: Shop-floor workflow for assigned jobs, service stage updates, timers, inventory usage logging, before/after photos, QC checklist, and job completion.
- **Live Service Tracking**: Real-time vehicle service progress updates powered by Socket.IO and MongoDB change streams.
- **Booking Availability Control**: Time-slot capacity checks and availability rules to help prevent overbooking.
- **AI-Assisted Workflows**: Damage scan, service estimate support, 3D/AR vehicle preview flow, and chatbot-assisted customer onboarding.
- **Security-Focused Architecture**: Firebase Auth, backend JWT sessions, bcrypt password hashing, OTP flows, rate limiting, NoSQL sanitization, Helmet security headers, and field-level encryption for sensitive data.

## Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide Icons, Sonner Toasts, Axios
- **Backend**: Node.js, Express.js, MongoDB Atlas, Mongoose, JWT, Firebase Admin SDK
- **Authentication**: Firebase Auth, backend JWT, OTP verification
- **Real-Time Updates**: Socket.IO, MongoDB Change Streams
- **Email / Notifications**: Resend for OTP emails, password setup links, and transactional emails
- **AI / Media Workflows**: Groq, Roboflow Workflows, Meshy AI, Cloudinary
- **Deployment**: Vercel for the frontend, Render for the backend API

## Production Checklist Implemented

- [x] **Error Boundaries**: Global React error boundary and component-level safeguards for complex UI areas.
- [x] **Security Hardening**: Helmet security headers, production CSP configuration, NoSQL sanitization, rate limiting, and protected API routes.
- [x] **Field-Level Encryption**: AES-256-CBC encryption for sensitive fields such as phone numbers, addresses, vehicle plates, notes, and signatures.
- [x] **Authentication Flow**: Firebase Auth integrated with backend JWT sessions, role validation, OTP verification, and secure password setup links.
- [x] **Rate Limiting**: General API and authentication route protection against repeated requests and brute-force attempts.
- [x] **API Resilience**: Axios interceptors, request timeouts, token handling, and global error handling for frontend API calls.
- [x] **Type Safety**: TypeScript-based frontend with centralized app types and role-safe UI flows.
- [x] **Real-Time Sync**: Socket.IO-powered updates for live tracking, booking status, availability, and operational changes.
- [x] **Performance**: Gzip compression, optimized Vite build configuration, asset handling, and frontend code-splitting.

## Setup Instructions

### Prerequisites

- Node.js v18+
- MongoDB Atlas account or local MongoDB
- Firebase project
- Resend API key
- Optional AI service keys for Groq, Roboflow, Meshy AI, and Cloudinary

### Installation

1. **Clone the repository**
   ```bash
   git clone [repository-url]
   cd AutoSPF+

   Backend Setup

cd backend
npm install
# Create .env based on the backend environment variables below
npm run dev
Frontend Setup

cd frontend
npm install
# Create .env based on the frontend environment variables below
npm run dev
Environment Variables
Backend (/backend/.env)
PORT=8080
NODE_ENV=development
MONGODB_URI=your_mongodb_uri

JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_32_character_encryption_key

CORS_ORIGIN=http://localhost:5173

EMAIL_PROVIDER=resend
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=verify@autospf.shop
EMAIL_REPLY_TO=support@autospf.shop
SUPPORT_EMAIL=support@autospf.shop
RESEND_API_KEY=your_resend_api_key

FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_service_account_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key

GROQ_API_KEY=your_groq_api_key
ROBOFLOW_API_KEY=your_roboflow_api_key
MESHY_API_KEY=your_meshy_api_key

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
Frontend (/frontend/.env)
VITE_API_URL=http://localhost:8080/api
VITE_BACKEND_URL=http://localhost:8080

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
If you use PORT=3000 for the backend, update both VITE_API_URL and VITE_BACKEND_URL to match.

Tags
#AutoSPFPlus #MERNStack #AutomotiveSaaS #React #TypeScript #NodeJS #ExpressJS #MongoDB #FirebaseAuth #SocketIO #Vercel #Render

© 2026 AutoSPF+ | Portfolio Showcase

