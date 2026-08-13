import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, Auth, createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import type { Analytics } from "firebase/analytics";

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
let db: Firestore;
let googleProvider: GoogleAuthProvider;
let facebookProvider: FacebookAuthProvider;
let isFirebaseInitialized = false;

// Analytics is lazily initialized to avoid blocking the initial page parse.
// It is only needed after the app mounts and the user interacts.
let _analytics: Analytics | null = null;

try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    // Analytics intentionally NOT initialized here — see getFirebaseAnalytics() below.
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
    db = {} as Firestore;
    googleProvider = new GoogleAuthProvider();
    facebookProvider = new FacebookAuthProvider();
    isFirebaseInitialized = false;
}

/**
 * Lazily initialize Firebase Analytics on first call.
 * This keeps analytics out of the initial parse / module evaluation cost,
 * which was contributing to main-thread blocking on /login.
 */
export function getFirebaseAnalytics(): Analytics | null {
    if (!isFirebaseInitialized || !app) return null;
    if (_analytics) return _analytics;
    try {
        // Fallback: import asynchronously on first call
        import('firebase/analytics').then(({ getAnalytics: ga }) => {
            if (!_analytics) _analytics = ga(app);
        }).catch(() => { /* analytics unavailable — non-critical */ });
        return null;
    } catch {
        return null;
    }
}

/** @deprecated Use getFirebaseAnalytics() instead — analytics is now lazily initialized. */
export const analytics = new Proxy({} as Analytics, {
    get(_target, prop) {
        const a = getFirebaseAnalytics();
        if (a && prop in a) return (a as any)[prop];
        return undefined;
    }
});

export { auth, db, googleProvider, facebookProvider, isFirebaseInitialized };
export { getAuth, GoogleAuthProvider, FacebookAuthProvider };

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
