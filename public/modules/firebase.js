// public/modules/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { setupAuth } from '../auth-helper.js';

// Configuration for Production (Paste your real keys here)
const firebaseConfig = {
    apiKey: "AIzaSyDaEMhzeKaYJEV2INM-pRtUBNW0ZS2LHwE",
    authDomain: "crudx-e0599.firebaseapp.com",
    projectId: "crudx-e0599",
    storageBucket: "crudx-e0599.appspot.com",
    messagingSenderId: "1089339729021",
    appId: "1:703506618799:web:b78d31c1ae570d3b5c375a"
};

// Configuration for Emulator (Localhost)
const emulatorConfig = {
    apiKey: "fake-api-key-for-emulator",
    projectId: "crudx-e0599",
    authDomain: "http://127.0.0.1:9099"
};

// Toggle this to switch environments
// SAFETY: Only allow emulator if we are actually on localhost/127.0.0.1
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const storedEnv = localStorage.getItem('useEmulator');
const useEmulator = isLocal && (storedEnv === 'true' || storedEnv === null);

console.log(`%c🔥 FIREBASE MODE: ${useEmulator ? 'EMULATOR' : 'PRODUCTION'}`, 'color: white; background: #ff3333; font-size: 16px; padding: 4px; border-radius: 4px;');

const app = initializeApp(useEmulator ? emulatorConfig : firebaseConfig);
const db = getFirestore(app);
const auth = setupAuth(app, useEmulator);

if (useEmulator) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export { db, auth };