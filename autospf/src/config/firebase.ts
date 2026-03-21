import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, Auth } from "firebase/auth";
import { getAnalytics, Analytics } from "firebase/analytics";

const firebaseConfig = {
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
