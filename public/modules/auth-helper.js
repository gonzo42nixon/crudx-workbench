import { 
    getAuth, 
    connectAuthEmulator,
    sendSignInLinkToEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function setupAuth(app, useEmulator = false) {
    const auth = getAuth(app);
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
        await sendSignInLinkToEmail(auth, email, actionCodeSettings);
        window.localStorage.setItem('emailForSignIn', email);
        return true;
    } catch (error) {
        console.error("Login Error:", error.code, error.message);
        return false;
    }
}
