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

/** Normalize key text from .env (quotes, escaped newlines, BOM). */
function normalizePrivateKey(raw) {
    let k = String(raw).trim();
    if (k.charCodeAt(0) === 0xfeff) k = k.slice(1);
    if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
        k = k.slice(1, -1);
    }
    return k.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

/** Reject truncated keys and .env.example-style placeholders before OpenSSL runs. */
function looksLikeCompleteServiceAccountKey(k) {
    if (!k || k.length < 400) return false;
    const hasBegin = k.includes('BEGIN PRIVATE KEY') || k.includes('BEGIN RSA PRIVATE KEY');
    const hasEnd = k.includes('END PRIVATE KEY') || k.includes('END RSA PRIVATE KEY');
    return hasBegin && hasEnd && !k.includes('...');
}

let firebaseAdmin = null;
let firebaseTokenVerifier = null;

const isPlaceholder = (v) => !v || v.startsWith('<') || v === 'null' || v === 'undefined';
const getDefaultApp = () => admin.apps.find((app) => app.name === '[DEFAULT]') || null;

if (!getDefaultApp()) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

    // Detect missing OR placeholder values (e.g. <your-firebase-project-id>)
    if (isPlaceholder(FIREBASE_PROJECT_ID) || isPlaceholder(FIREBASE_CLIENT_EMAIL) || isPlaceholder(FIREBASE_PRIVATE_KEY)) {
        console.warn(
            '[FirebaseAdmin] ⚠️  Firebase credentials are not configured.\n' +
            '                    Firebase Admin features (e.g., deleteAccount) will be unavailable until these are set.\n' +
            '                    See backend/config/firebaseAdmin.js for setup instructions.'
        );
        firebaseAdmin = null;
    } else {
        const privateKey = normalizePrivateKey(FIREBASE_PRIVATE_KEY);
        if (!looksLikeCompleteServiceAccountKey(privateKey)) {
            console.warn(
                '[FirebaseAdmin] ⚠️  FIREBASE_PRIVATE_KEY looks incomplete (missing END marker, too short, or contains "...").\n' +
                '                    Paste the full `private_key` value from your Firebase service account JSON (see firebaseAdmin.js).'
            );
            firebaseAdmin = null;
        } else {
            try {
                firebaseAdmin = admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: FIREBASE_PROJECT_ID,
                        clientEmail: FIREBASE_CLIENT_EMAIL,
                        privateKey,
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
    }
} else {
    firebaseAdmin = getDefaultApp();
}

// ID-token verification only needs a project ID and Google's public signing
// keys, so it remains available without privileged service-account credentials.
try {
    if (firebaseAdmin) {
        firebaseTokenVerifier = firebaseAdmin.auth();
    } else if (!isPlaceholder(process.env.FIREBASE_PROJECT_ID)) {
        const verifierAppName = 'autospf-token-verifier';
        const verifierApp = admin.apps.find((app) => app.name === verifierAppName)
            || admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }, verifierAppName);
        firebaseTokenVerifier = verifierApp.auth();
    }
} catch (err) {
    console.warn('[FirebaseAdmin] Firebase ID-token verifier is unavailable:', err.message);
    firebaseTokenVerifier = null;
}

export { admin, firebaseTokenVerifier };
export default firebaseAdmin;
