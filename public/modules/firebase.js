// public/modules/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { setupAuth } from '../auth-helper.js';

const app = initializeApp({ 
    apiKey: "fake-api-key-for-emulator",
    projectId: "crudx-e0599" 
});
const db = getFirestore(app);
const auth = setupAuth(app);

connectFirestoreEmulator(db, '127.0.0.1', 8080);

export { db, auth };