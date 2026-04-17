/**
 * Firebase Admin SDK initialization
 * Used for server-side Firebase operations (e.g., deleting a Firebase Auth user).
 *
 * SETUP REQUIRED:
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" → download the JSON file
 *   3. Copy the values into your .env file:
 *      FIREBASE_PROJECT_ID=<projectId>
 *      FIREBASE_CLIENT_EMAIL=<client_email>
 *      FIREBASE_PRIVATE_KEY="<private_key>"   ← include the quotes
 */

import admin from 'firebase-admin';

let firebaseAdmin;

if (!admin.apps.length) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

    // Detect missing OR placeholder values (e.g. <your-firebase-project-id>)
    const isPlaceholder = (v) => !v || v.startsWith('<') || v === 'null' || v === 'undefined';

    if (isPlaceholder(FIREBASE_PROJECT_ID) || isPlaceholder(FIREBASE_CLIENT_EMAIL) || isPlaceholder(FIREBASE_PRIVATE_KEY)) {
        console.warn(
            '[FirebaseAdmin] ⚠️  Firebase credentials are not configured.\n' +
            '                    Firebase Admin features (e.g., deleteAccount) will be unavailable until these are set.\n' +
            '                    See backend/config/firebaseAdmin.js for setup instructions.'
        );
        firebaseAdmin = null;
    } else {
        try {
            firebaseAdmin = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: FIREBASE_PROJECT_ID,
                    clientEmail: FIREBASE_CLIENT_EMAIL,
                    // Replace escaped newlines from env var
                    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
        } catch (err) {
            console.warn(
                '[FirebaseAdmin] ⚠️  Failed to initialize Firebase Admin SDK:', err.message,
                '\n                    Firebase Admin features will be unavailable. Check your FIREBASE_* env vars.'
            );
            firebaseAdmin = null;
        }
    }
} else {
    firebaseAdmin = admin.apps[0];
}

export { admin };
export default firebaseAdmin;
