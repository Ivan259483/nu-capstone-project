import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, Auth } from "firebase/auth";
import { getAnalytics, Analytics } from "firebase/analytics";

export const firebaseConfig = {
    apiKey: 'AIzaSyCO203nx1fifBUyn9-KuAE1AfqflxPaQ5M',
    authDomain: 'autospf-plus.firebaseapp.com',
    projectId: 'autospf-plus',
    storageBucket: 'autospf-plus.firebasestorage.app',
    messagingSenderId: '227724962432',
    appId: '1:227724962432:web:fddb58f76cf6b348ee5465',
    measurementId: 'G-NDN8GHWJWB'
};

// Initialize Firebase with safety check
let app: FirebaseApp;
let auth: Auth;
let analytics: Analytics;
let googleProvider: GoogleAuthProvider;
let facebookProvider: FacebookAuthProvider;
let isFirebaseInitialized = false;

try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    analytics = getAnalytics(app);
    googleProvider = new GoogleAuthProvider();
    facebookProvider = new FacebookAuthProvider();
    facebookProvider.addScope('email');
    facebookProvider.addScope('public_profile');

    // Optional: Explicitly set the App ID if needed, though usually handled by Firebase Console configuration
    const fbAppId = import.meta.env.VITE_FACEBOOK_APP_ID;
    if (fbAppId) {
        facebookProvider.setCustomParameters({
            'display': 'popup',
            'app_id': fbAppId
        });
    }

    isFirebaseInitialized = true;
} catch (error) {
    console.warn('⚠️ Firebase Initialization Failed:', error);
    // Mock objects to prevent crash
    app = {} as any;
    auth = {
        currentUser: null,
        onAuthStateChanged: (cb: any) => () => { },
        signOut: async () => { }
    } as unknown as Auth;
    analytics = {} as unknown as Analytics;
    googleProvider = new GoogleAuthProvider();
    facebookProvider = new FacebookAuthProvider();
    isFirebaseInitialized = false;
}

// Initialize Firestore
import { getFirestore, Firestore } from "firebase/firestore";
let db: Firestore;
try {
    if (app && isFirebaseInitialized) {
        db = getFirestore(app);
    } else {
        db = {} as Firestore;
    }
} catch (e) {
    console.warn('Firestore init failed', e);
    db = {} as Firestore;
}

export { auth, db, googleProvider, facebookProvider, analytics, isFirebaseInitialized };
export { getAuth, GoogleAuthProvider, FacebookAuthProvider, getAnalytics };

import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";

/**
 * Creates a new Firebase Auth user without signing out the current user (e.g., Admin)
 */
export const createSecondaryUser = async (email: string, password: string, sendInvite: boolean = false) => {
    try {
        const secondaryAppName = "SecondaryApp";
        let secondaryApp: FirebaseApp;

        // Ensure we don't recreate the app repeatedly
        const apps = getApps();
        const existingApp = apps.find(a => a.name === secondaryAppName);
        if (existingApp) {
            secondaryApp = existingApp;
        } else {
            secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
        }

        const secondaryAuth = getAuth(secondaryApp);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

        if (sendInvite && userCredential.user) {
            await sendEmailVerification(userCredential.user);
        }

        // Extremely important: Sign out to ensure the secondary instance is clean
        await secondaryAuth.signOut();

        return userCredential.user;
    } catch (error: any) {
        console.error("Secondary user creation failed:", error);
        throw error;
    }
};
