import { getAuth, connectAuthEmulator, signInWithEmailLink, isSignInWithEmailLink } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function setupAuth(app) {
    const auth = getAuth(app);
    // Verbindet dich mit dem Emulator (Port 9099)
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    return auth;
}

export async function loginWithEmail(auth, email) {
    const actionCodeSettings = {
        url: window.location.href,
        handleCodeInApp: true,
    };
    try {
        const { sendSignInLinkToEmail } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
        await sendSignInLinkToEmail(auth, email, actionCodeSettings);
        window.localStorage.setItem('emailForSignIn', email);
        alert('Check the Emulator UI for your Login-Link!');
    } catch (error) {
        alert('Error: ' + error.message);
    }
}