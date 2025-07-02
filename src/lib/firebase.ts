
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCN5awpd7WOszTuqECs118_BhUEQUmoX6k",
  authDomain: "primalcuts-1b76f.firebaseapp.com",
  projectId: "primalcuts-1b76f",
  storageBucket: "primalcuts-1b76f.firebasestorage.app",
  messagingSenderId: "471670028004",
  appId: "1:471670028004:web:d0dc0cbc9ea370d3319ef1",
  measurementId: "G-M520SF0M8M"
};

// Initialize Firebase for client side
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const analytics: Analytics | null = typeof window !== 'undefined' ? getAnalytics(app) : null;

export { app, auth, db, analytics };
