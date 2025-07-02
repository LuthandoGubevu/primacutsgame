import { initializeApp, getApp, getApps } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
let analytics;

if (typeof window !== 'undefined') {
  // Initialize Analytics only on the client side
  analytics = getAnalytics(app);
}

export { app, auth, db, analytics };
