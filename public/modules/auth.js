// modules/auth.js
import { auth } from './firebase.js';
import { applyLayout, fetchRealData } from './pagination.js';

// Hilfsfunktion für Event-Listener (wie in app.js)
const bind = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
};

// --- MAGIC LINK CHECKER (sofort ausführen) ---
(async function checkMagicLink() {
    const { signInWithEmailLink, isSignInWithEmailLink } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn') || window.prompt('Please provide your email for confirmation:');
        try {
            await signInWithEmailLink(auth, email, window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState({}, document.title, window.location.pathname);
            console.log("✅ Magic Link verified!");
        } catch (e) { console.error("❌ Link Error:", e); }
    }
})();

// --- AUTH STATE LISTENER & UI-SETUP ---
export function initAuth() {
    import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js").then(({ onAuthStateChanged, signOut }) => {
        onAuthStateChanged(auth, async (user) => {
            const loginModal = document.getElementById('login-modal');
            const userProfile = document.getElementById('user-profile');
            const userEmailSpan = document.getElementById('user-email');
            const gridSelect = document.getElementById('grid-select');
            const userModal = document.getElementById('user-modal');
            const modalEmail = document.getElementById('modal-user-email');

            if (user) {
                console.log("✅ Access granted for:", user.email);

                // Login-Modal ausblenden
                if (loginModal) {
                    loginModal.classList.remove('active');
                    loginModal.style.display = 'none';
                }

                // Benutzer-Profil einblenden
                if (userProfile) {
                    userProfile.style.display = 'flex';
                    userProfile.style.cursor = 'pointer';
                    if (userEmailSpan) userEmailSpan.style.display = 'none';
                    userProfile.title = `CRUDX Account\n${user.email}`;

                    // Klick auf Profil öffnet das User-Popup
                    userProfile.onclick = (e) => {
                        e.stopPropagation();
                        if (modalEmail) modalEmail.textContent = user.email;
                        const rect = userProfile.getBoundingClientRect();
                        userModal.style.top = `${rect.bottom + 10}px`;
                        userModal.style.left = `${rect.right - 280}px`;
                        userModal.classList.toggle('active');
                    };
                }

                // Logout-Button
                const btnLogoutConfirm = document.getElementById('btn-logout-confirm');
                if (btnLogoutConfirm) {
                    btnLogoutConfirm.onclick = async () => {
                        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                        await signOut(auth);
                        window.location.reload();
                    };
                }

                // Schließen-Button im Popup
                const btnCloseUser = document.getElementById('btn-close-user');
                if (btnCloseUser) {
                    btnCloseUser.onclick = (e) => {
                        e.stopPropagation();
                        userModal.classList.remove('active');
                    };
                }

                // Layout aus URL oder Standard
                const urlParams = new URLSearchParams(window.location.search);
                const viewParam = urlParams.get('view');
                if (viewParam) {
                    if (gridSelect) gridSelect.value = viewParam;
                    applyLayout(viewParam);
                } else {
                    applyLayout(gridSelect ? gridSelect.value : '3');
                }

                fetchRealData();

            } else {
                console.warn("🔒 Locked. Authentication required.");
                if (userProfile) userProfile.style.display = 'none';
                if (loginModal) {
                    loginModal.style.display = 'flex';
                    loginModal.classList.add('active');
                }

                // Login-Button für Magic Link
                const btnLink = document.getElementById('btn-send-link');
                if (btnLink) {
                    btnLink.onclick = async () => {
                        const emailInput = document.getElementById('login-email');
                        if (!emailInput || !emailInput.value) return alert("Please enter an email address.");
                        const currentView = gridSelect ? gridSelect.value : '3';
                        const currentContinueUrl = `${window.location.origin}${window.location.pathname}?view=${currentView}`;
                        const { loginWithEmail } = await import('../auth-helper.js');
                        await loginWithEmail(auth, emailInput.value, currentContinueUrl);
                        const status = document.getElementById('login-status');
                        if (status) status.textContent = "Check your inbox (Emulator UI)!";
                    };
                }
            }
        });
    });

    // Globaler Klick zum Schließen des User-Popups
    window.addEventListener('click', () => {
        const userModal = document.getElementById('user-modal');
        if (userModal) userModal.classList.remove('active');
    });
}