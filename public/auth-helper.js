import { getAuth, connectAuthEmulator, signInWithEmailLink, isSignInWithEmailLink } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function setupAuth(app, useEmulator = false) {
    const auth = getAuth(app);
    // Verbindet dich mit dem Emulator (Port 9099)
    if (useEmulator) {
        connectAuthEmulator(auth, "http://127.0.0.1:9099");
    }
    return auth;
}

export async function loginWithEmail(auth, email, continueUrl) {
    const actionCodeSettings = {
        url: continueUrl || window.location.href,
        handleCodeInApp: true,
    };
    try {
        const { sendSignInLinkToEmail } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
        await sendSignInLinkToEmail(auth, email, actionCodeSettings);
        window.localStorage.setItem('emailForSignIn', email);
        alert('Link sent! Check your email inbox.');
        return true;
    } catch (error) {
        console.error("Login Error:", error);
        if (error.code === 'auth/unauthorized-continue-uri') {
            alert(`⚠️ Domain Error (Production Mode)\n\nFirebase blocked the login from ${window.location.hostname}.\n\nTo fix this:\n1. Go to Firebase Console > Authentication > Settings > Authorized Domains\n2. Add "${window.location.hostname}" (without port!)\n\nOR: Switch to Emulator Mode in the Tools menu.`);
        } else {
            alert('Error: ' + error.message);
        }
        return false;
    }
}