# AutoSPF+ / AutoGloss

AutoSPF+ / AutoGloss is a full-stack automotive service management platform for detailing, paint protection, billing, inventory, and customer service tracking. The system includes web dashboards, a mobile app surface, real-time updates, AI-assisted vehicle inspection workflows, and AR visualization support.

## Live Demo

Primary: https://autospf.shop  
## Features

- **Booking and scheduling**: Customer booking flow, availability handling, and service appointment management.
- **POS and billing**: Sales dashboard, billing workflows, payment records, receipts, and transaction management.
- **Inventory management**: Product, supplier, stock, and inventory usage tracking for service operations.
- **Live service tracking**: Real-time job progress updates for customers and staff using Socket.IO.
- **AI vehicle inspection**: AI-assisted damage scan and vehicle inspection workflows.
- **AR visualization**: 3D and AR vehicle preview support for visual service experiences.
- **Customer documents and waivers**: Digital waivers, service documents, proof uploads, and customer records.
- **Role-based dashboards**: Separate experiences for customers, administrators, sales, quality checking, and staff operations.

## Tech Stack

- **Web frontend**: React, Vite, TypeScript, Tailwind CSS
- **Backend API**: Node.js, Express
- **Database**: MongoDB Atlas, Mongoose
- **Mobile**: Expo React Native
- **Authentication**: Firebase Auth, backend sessions, role validation
- **Real time**: Socket.IO
- **AI/AR tools**: AI inspection services, 3D generation, AR visualization, and media storage integrations
- **Deployment**: Vercel for the frontend, Render for the backend API, Expo/EAS for mobile builds

## Screenshots

Screenshots are not required to run the project. Add production screenshots to these paths when they are available:

| Screen | Placeholder path |
| --- | --- |
| Customer dashboard | `docs/screenshots/customer-dashboard.png` |
| Admin dashboard | `docs/screenshots/admin-dashboard.png` |
| Live tracker | `docs/screenshots/live-tracker.png` |

## Project Structure

```text
backend/   Express API, MongoDB models, services, Socket.IO, and server logic
frontend/  React/Vite web app and dashboards
mobile/    Expo React Native mobile app
docs/      Architecture notes, setup guides, and screenshots
```

## Setup

### Prerequisites

- Node.js 18 or newer
- npm
- MongoDB Atlas database or a local MongoDB instance
- Firebase project for authentication
- Optional provider accounts for email, AI inspection, AR/3D generation, and media storage
- Expo CLI or `npx expo` for the mobile app

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The backend defaults to port `3000` unless `PORT` is set in `backend/.env`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The Vite app normally runs on `http://localhost:5173`. Set `VITE_API_URL` and `VITE_BACKEND_URL` to match your backend origin.

### Mobile

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

Set `EXPO_PUBLIC_API_URL` when testing against a LAN, ngrok, or deployed backend API.

## Environment Variables

Use `.env.example` files as templates. Keep all real secrets in local `.env` files or in the environment variable manager for your deployment platform.

### Backend (`backend/.env`)

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=<mongodb-connection-string>

JWT_SECRET=<long-random-jwt-secret>
ENCRYPTION_KEY=<32-character-encryption-key>
CORS_ORIGIN=http://localhost:5173

EMAIL_PROVIDER=resend
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=<verified-sender-email>
EMAIL_REPLY_TO=<support-email>
SUPPORT_EMAIL=<support-email>
RESEND_API_KEY=<resend-api-key>

FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_CLIENT_EMAIL=<firebase-service-account-email>
FIREBASE_PRIVATE_KEY="<firebase-private-key-with-escaped-newlines>"

GROQ_API_KEY=<groq-api-key>
ROBOFLOW_API_KEY=<roboflow-api-key>
MESHY_API_KEY=<meshy-api-key>

CLOUDINARY_CLOUD_NAME=<cloudinary-cloud-name>
CLOUDINARY_API_KEY=<cloudinary-api-key>
CLOUDINARY_API_SECRET=<cloudinary-api-secret>
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000/api
VITE_BACKEND_URL=http://localhost:3000

VITE_FIREBASE_API_KEY=<firebase-web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<firebase-auth-domain>
VITE_FIREBASE_PROJECT_ID=<firebase-project-id>
VITE_FIREBASE_STORAGE_BUCKET=<firebase-storage-bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<firebase-sender-id>
VITE_FIREBASE_APP_ID=<firebase-app-id>
```

### Mobile (`mobile/.env`)

```env
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000
EXPO_PUBLIC_DEV_API_PORT=3000
```

## Deployment Notes

### Vercel

- Deploy the frontend from `frontend/` or use the existing Vercel configuration.
- Set frontend environment variables in the Vercel dashboard.
- The public demo is hosted at `https://nu-capstone-project.vercel.app`.

### Render

- Deploy the backend API from `backend/`.
- Use `npm install` as the build command and `npm start` as the start command.
- Set all backend secrets in Render environment variables.
- Confirm the health endpoint after deployment: `/health` or `/api/health`.

### Expo

- Configure mobile environment variables before starting Metro or creating EAS builds.
- Use `npx expo start` for development.
- Use EAS profiles from `eas.json` or `mobile/eas.json` for preview and production builds.

## Security

Do not commit real `.env` files, database credentials, API keys, Firebase private keys, passwords, tokens, or deployment secrets. Use `.env.example` for placeholders only and store real values locally or in Vercel, Render, Expo, Firebase, or provider dashboards.

## Roadmap

- Add polished production screenshots for the main dashboards and live tracker.
- Expand automated tests for booking, billing, inventory, and service tracking flows.
- Add CI checks for linting, tests, dependency review, and secret scanning.
- Improve deployment documentation for production operations.
- Publish mobile preview and production build notes.

## License

This project is prepared for public open-source release. Add the final license text in a `LICENSE` file before accepting external contributions or redistributing the software.
