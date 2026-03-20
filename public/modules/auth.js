// modules/auth.js
import { auth, db } from './firebase.js';
import { fetchRealData, loadStateFromUrl } from './pagination.js';
import { applyLayout } from './layout-manager.js';
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { loadAndApplyProfile, saveProfileUpdates, applyProfilePicture, getCurrentProfile } from './user-profile.js';

// Hilfsfunktion für Event-Listener (wie in app.js)
const bind = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
};

// --- MAGIC LINK CHECKER (sofort ausführen) ---
(async function checkMagicLink() {
    // ⚠️ Capture the URL BEFORE any await — other modules call
    // window.history.replaceState() on startup and will strip query params.
    const rawUrl = window.location.href;

    // Firebase's __/auth/action redirect adds oobCode + apiKey but omits mode=signIn.
    // isSignInWithEmailLink requires all three → we synthesize the missing param.
    let magicLinkUrl = rawUrl;
    if (rawUrl.includes('oobCode=') && !rawUrl.includes('mode=')) {
        magicLinkUrl = rawUrl + '&mode=signIn';
    }

    const { signInWithEmailLink, isSignInWithEmailLink } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    if (!isSignInWithEmailLink(auth, magicLinkUrl)) return;

    // Magic link detected — show a full-screen signing-in banner immediately
    const banner = document.createElement('div');
    banner.id = 'magic-link-banner';
    banner.style.cssText = [
        'position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:rgba(5,5,15,0.97);z-index:99999;',
        'display:flex;flex-direction:column;justify-content:center;align-items:center;gap:20px;',
        'font-family:monospace;color:#80d4ff;text-align:center;padding:30px;'
    ].join('');
    banner.innerHTML = `
        <div style="font-size:3rem;">🔐</div>
        <div style="font-size:1.4rem;font-weight:bold;">Signing you in…</div>
        <div style="font-size:0.9rem;opacity:0.6;">Verifying your login link, please wait.</div>
    `;
    document.body.appendChild(banner);

    // Retrieve stored email — fall back to in-banner form if not stored
    // (window.prompt is blocked by browsers in async/module contexts)
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        // Replace banner content with an email input form
        email = await new Promise((resolve) => {
            banner.innerHTML = `
                <div style="font-size:2.5rem;">📧</div>
                <div style="font-size:1.2rem;font-weight:bold;color:#80d4ff;">Confirm your email to sign in</div>
                <input id="magic-link-email-input" type="email" placeholder="yourname@example.com"
                    autocomplete="email"
                    style="padding:12px 15px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);
                           background:rgba(255,255,255,0.07);color:#e0e0e0;font-size:1em;
                           width:100%;max-width:320px;box-sizing:border-box;text-align:center;outline:none;">
                <button id="magic-link-confirm-btn"
                    style="padding:12px 30px;background:rgba(80,140,255,0.25);color:#90c8ff;
                           border:1px solid rgba(80,140,255,0.5);border-radius:8px;
                           font-size:1em;font-weight:600;cursor:pointer;max-width:320px;width:100%;">
                    ✅ Confirm &amp; Sign In
                </button>
                <div id="magic-link-email-error" style="font-size:0.85em;color:#ff7070;min-height:18px;"></div>
            `;
            const inp = document.getElementById('magic-link-email-input');
            const btn = document.getElementById('magic-link-confirm-btn');
            const err = document.getElementById('magic-link-email-error');
            const confirm = () => {
                const val = inp?.value?.trim();
                if (!val || !val.includes('@')) { if (err) err.textContent = '⚠️ Please enter a valid email.'; return; }
                resolve(val);
            };
            if (btn) btn.addEventListener('click', confirm);
            if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
            setTimeout(() => inp?.focus(), 100);
        });
    }

    if (!email) {
        banner.remove();
        return;
    }

    // Restore "Signing you in…" banner content before the async sign-in call
    banner.innerHTML = `
        <div style="font-size:3rem;">🔐</div>
        <div style="font-size:1.4rem;font-weight:bold;">Signing you in…</div>
        <div style="font-size:0.9rem;opacity:0.6;">Verifying your login link, please wait.</div>
    `;

    try {
        await signInWithEmailLink(auth, email, magicLinkUrl);
        window.localStorage.removeItem('emailForSignIn');
        // Strip the OOB code from the URL so a refresh doesn't re-trigger this
        window.history.replaceState({}, document.title, window.location.pathname);
        console.log("✅ Magic Link verified!");
        // Banner stays visible until onAuthStateChanged hides the login modal
        banner.querySelector('div:nth-child(2)').textContent = '✅ Signed in!';
        banner.querySelector('div:nth-child(2)').style.color = '#80ffb0';
        setTimeout(() => banner.remove(), 1500);
    } catch (e) {
        console.error("❌ Link Error:", e);
        banner.remove();
        const msg = {
            'auth/invalid-action-code': '⚠️ This login link is invalid or has already been used.\n\nPlease go back to the app and request a new login link.',
            'auth/expired-action-code': '⚠️ This login link has expired (valid for 1 hour).\n\nPlease go back to the app and request a new login link.',
            'auth/invalid-email':       '⚠️ The email address does not match the one this link was sent to.',
        }[e.code] || `❌ Sign-in failed: ${e.message}`;
        alert(msg);
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

            // Mirrors the same logic as firebase.js so the UI reflects the actual mode
            const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
            const forceProd = new URLSearchParams(window.location.search).get('mode') === 'live';
            const useEmulator = isLocal && !forceProd;

            if (user) {
                console.log("✅ Access granted for:", user.email);

                // --- DEV MODE TOGGLE ---
                if (useEmulator) renderDevToggle(true);

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

                // ── Edit Profile Button ──────────────────────────────────────
                // Öffnet profile.html im CRUDX IFrame-Modal (gleicher Origin → window.parent.auth funktioniert)
                const btnOpenProfileEditor = document.getElementById('btn-open-profile-editor');
                if (btnOpenProfileEditor) {
                    btnOpenProfileEditor.onclick = (e) => {
                        e.stopPropagation();
                        // User-Popup schließen
                        if (userModal) userModal.classList.remove('active');

                        const iframeModal = document.getElementById('iframe-modal');
                        const iframe      = document.getElementById('doc-frame');
                        const iframeUrl   = document.getElementById('iframe-url');

                        if (!iframeModal || !iframe) return;

                        // profile.html wird als statische Seite geladen (kein Blob nötig).
                        // window.parent.auth.currentUser ist daher sofort verfügbar.
                        const profileUrl = '/profile.html';
                        iframe.src = profileUrl;
                        if (iframeUrl) iframeUrl.value = profileUrl;
                        iframeModal.classList.add('active');
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

                // 1. State aus URL laden (Search, Sort, View, Mine)
                const layout = loadStateFromUrl();
                if (gridSelect) gridSelect.value = layout;

                // 2. Layout anwenden (initialLoad = true verhindert Page-Reset)
                applyLayout(layout, true);

                // 3. User Profile laden (Firestore) — applies tag rules + profile picture.
                //    Dispatches "crudx:profile-loaded" so app.js can apply the user theme
                //    without circular imports.
                await loadAndApplyProfile(user.email);

                // 4. Greeting in user popup dynamisch setzen
                const greeting = document.getElementById('modal-user-greeting');
                if (greeting) {
                    const name = user.displayName || user.email.split('@')[0];
                    greeting.textContent = `Hi, ${name}!`;
                }

                // 5. Profilbild-URL-Input sync + Save-Handler
                const btnSaveProfileImage = document.getElementById('btn-save-profile-image');
                if (btnSaveProfileImage) {
                    btnSaveProfileImage.onclick = async () => {
                        const input = document.getElementById('in-profile-image-url');
                        const url   = input?.value?.trim() ?? '';
                        btnSaveProfileImage.textContent = '⏳';
                        await saveProfileUpdates({ profileImage: url });
                        applyProfilePicture(url);
                        btnSaveProfileImage.textContent = '✅';
                        setTimeout(() => { btnSaveProfileImage.textContent = '💾'; }, 2000);
                    };
                }

                // Sync profile image URL into input whenever the popup opens
                userProfile.onclick = (e) => {
                    e.stopPropagation();
                    if (modalEmail) modalEmail.textContent = user.email;
                    const rect = userProfile.getBoundingClientRect();
                    userModal.style.top  = `${rect.bottom + 10}px`;
                    userModal.style.left = `${rect.right - 280}px`;
                    // Sync current profile image URL into the input
                    const imgInput = document.getElementById('in-profile-image-url');
                    if (imgInput) imgInput.value = getCurrentProfile()?.profileImage ?? '';
                    userModal.classList.toggle('active');
                };

                // Signal to app.js that the user is authenticated so Firestore
                // listeners (theme, tag cloud) can start safely.
                window.dispatchEvent(new CustomEvent('crudx:authenticated', { detail: { user } }));

            } else {
                console.warn("🔒 Locked. Authentication required.");
                if (userProfile) userProfile.style.display = 'none';
                if (loginModal) {
                    loginModal.style.display = 'flex';
                    loginModal.classList.add('active');
                }

                // Show emulator badge only when actually using the emulator (not ?mode=live)
                if (useEmulator) renderDevToggle(true);

                // ── EMULATOR LOGIN PANEL ──────────────────────────────────────────────
                // The Auth Emulator starts empty — no real users exist.
                // Provide two options:
                //   1. "Sign in as any email" form (creates the user in the emulator)
                //   2. Switch to live production Firebase (?mode=live)
                if (useEmulator && loginModal && !document.getElementById('emulator-login-panel')) {
                    const modalContent = loginModal.querySelector('.modal-content') || loginModal;

                    // ── separator ──
                    const sep = document.createElement('div');
                    sep.style.cssText = 'margin:16px 0 8px;border-top:1px solid rgba(255,255,255,.2);padding-top:12px;font-size:11px;color:#aaa;text-align:center;letter-spacing:.05em;';
                    sep.textContent = '⚡ EMULATOR OPTIONS';
                    modalContent.appendChild(sep);

                    // ── panel wrapper ──
                    const panel = document.createElement('div');
                    panel.id = 'emulator-login-panel';
                    panel.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

                    // email input
                    const emailIn = document.createElement('input');
                    emailIn.type = 'email';
                    emailIn.placeholder = 'drueffler@gmail.com (any email)';
                    emailIn.style.cssText = 'padding:8px 10px;border-radius:5px;border:1px solid #555;background:#222;color:#fff;font-size:.9em;width:100%;box-sizing:border-box;';

                    // password input
                    const pwIn = document.createElement('input');
                    pwIn.type = 'password';
                    pwIn.placeholder = 'password (anything ≥6 chars)';
                    pwIn.value = 'devpassword123';
                    pwIn.style.cssText = emailIn.style.cssText;

                    // status line
                    const statusLine = document.createElement('div');
                    statusLine.style.cssText = 'font-size:11px;color:#f90;min-height:16px;';

                    // sign-in button
                    const signInBtn = document.createElement('button');
                    signInBtn.textContent = '⚡ Sign in (Emulator)';
                    signInBtn.style.cssText = 'padding:9px 0;background:#ff3333;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;font-size:.9em;';

                    signInBtn.onclick = async () => {
                        const email = emailIn.value.trim();
                        const pw    = pwIn.value;
                        if (!email) { statusLine.textContent = '⚠️ Enter an email first.'; return; }
                        if (pw.length < 6) { statusLine.textContent = '⚠️ Password must be ≥ 6 chars.'; return; }
                        signInBtn.disabled = true;
                        statusLine.textContent = '⏳ Signing in…';
                        try {
                            const { signInWithEmailAndPassword, createUserWithEmailAndPassword } =
                                await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                            try {
                                await signInWithEmailAndPassword(auth, email, pw);
                            } catch (err) {
                                if (['auth/user-not-found','auth/invalid-credential','auth/invalid-login-credentials'].includes(err.code)) {
                                    statusLine.textContent = '🆕 Creating emulator user…';
                                    await createUserWithEmailAndPassword(auth, email, pw);
                                } else {
                                    throw err;
                                }
                            }
                        } catch (err) {
                            console.error('Emulator login failed:', err);
                            statusLine.textContent = '❌ ' + err.message;
                            signInBtn.disabled = false;
                        }
                    };

                    // allow Enter key in password field to trigger sign-in
                    pwIn.addEventListener('keydown', e => { if (e.key === 'Enter') signInBtn.click(); });
                    emailIn.addEventListener('keydown', e => { if (e.key === 'Enter') pwIn.focus(); });

                    // ── production switch button ──
                    const prodBtn = document.createElement('button');
                    prodBtn.textContent = '🌍 Use Live / Production Firebase';
                    prodBtn.title = 'Reload with ?mode=live — uses real Google login & Magic Links';
                    prodBtn.style.cssText = 'padding:8px 0;background:transparent;color:#80bfff;border:1px solid #336699;border-radius:5px;cursor:pointer;font-size:.85em;';
                    prodBtn.onclick = () => {
                        const url = new URL(window.location.href);
                        url.searchParams.set('mode', 'live');
                        window.location.href = url.toString();
                    };

                    panel.appendChild(emailIn);
                    panel.appendChild(pwIn);
                    panel.appendChild(statusLine);
                    panel.appendChild(signInBtn);
                    panel.appendChild(prodBtn);
                    modalContent.appendChild(panel);
                }

                // Login-Button für Magic Link (Step 1 → Step 2)
                const btnLink = document.getElementById('btn-send-link');
                const btnSendAgain = document.getElementById('btn-send-again');
                const step1 = document.getElementById('login-step-1');
                const step2 = document.getElementById('login-step-2');
                const loginError = document.getElementById('login-error');
                const sentEmailDisplay = document.getElementById('sent-email-display');

                if (btnLink) {
                    btnLink.onclick = async () => {
                        const emailInput = document.getElementById('login-email');
                        const email = emailInput?.value?.trim();
                        if (!email) {
                            if (loginError) loginError.textContent = '⚠️ Please enter your email address.';
                            return;
                        }
                        if (loginError) loginError.textContent = '';
                        btnLink.textContent = 'Sending…';
                        btnLink.disabled = true;
                        const currentView = gridSelect ? gridSelect.value : '3';
                        const currentContinueUrl = `${window.location.origin}${window.location.pathname}?view=${currentView}`;
                        const { loginWithEmail } = await import('./auth-helper.js');
                        const success = await loginWithEmail(auth, email, currentContinueUrl);
                        btnLink.textContent = 'Send Login Link';
                        btnLink.disabled = false;
                        if (success) {
                            // Show Step 2: inbox check screen
                            if (sentEmailDisplay) sentEmailDisplay.textContent = email;
                            if (step1) step1.style.display = 'none';
                            if (step2) step2.style.display = 'block';
                        } else {
                            if (loginError) loginError.textContent = '❌ Failed to send link. Please try again.';
                        }
                    };
                }

                if (btnSendAgain) {
                    btnSendAgain.onclick = () => {
                        if (step2) step2.style.display = 'none';
                        if (step1) step1.style.display = 'block';
                        const emailInput = document.getElementById('login-email');
                        if (emailInput) { emailInput.value = ''; emailInput.focus(); }
                    };
                }

                // "Paste link" fallback — user copies the email link and pastes it directly
                const btnSignInWithLink = document.getElementById('btn-sign-in-with-link');
                if (btnSignInWithLink) {
                    btnSignInWithLink.onclick = async () => {
                        const pasteInput = document.getElementById('login-paste-link');
                        const pasteError = document.getElementById('paste-link-error');
                        const pastedUrl = pasteInput?.value?.trim();
                        if (!pastedUrl) {
                            if (pasteError) pasteError.textContent = '⚠️ Please paste the link first.';
                            return;
                        }
                        const emailInput = document.getElementById('login-email');
                        const storedEmail = window.localStorage.getItem('emailForSignIn');
                        // Use the email from Step 1 input or localStorage
                        const emailForLink = storedEmail || emailInput?.value?.trim();
                        if (!emailForLink) {
                            if (pasteError) pasteError.textContent = '⚠️ Could not determine your email. Please go back and re-enter it.';
                            return;
                        }
                        if (pasteError) pasteError.textContent = '';
                        btnSignInWithLink.textContent = 'Signing in…';
                        btnSignInWithLink.disabled = true;
                        try {
                            const { signInWithEmailLink, isSignInWithEmailLink } =
                                await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                            // Same fix as checkMagicLink: add mode=signIn if missing
                            let urlToUse = pastedUrl;
                            if (pastedUrl.includes('oobCode=') && !pastedUrl.includes('mode=')) {
                                urlToUse = pastedUrl + '&mode=signIn';
                            }
                            if (!isSignInWithEmailLink(auth, urlToUse)) {
                                if (pasteError) pasteError.textContent = '⚠️ This does not look like a valid sign-in link. Make sure you copied the full URL from the email.';
                                btnSignInWithLink.textContent = 'Sign in with pasted link';
                                btnSignInWithLink.disabled = false;
                                return;
                            }
                            await signInWithEmailLink(auth, emailForLink, urlToUse);
                            window.localStorage.removeItem('emailForSignIn');
                            console.log("✅ Signed in via pasted link!");
                        } catch (e) {
                            console.error("❌ Paste-link error:", e);
                            const msg = {
                                'auth/invalid-action-code': '⚠️ Link is invalid or already used — request a new one.',
                                'auth/expired-action-code': '⚠️ Link has expired — request a new one.',
                                'auth/invalid-email':       '⚠️ Email does not match the one the link was sent to.',
                            }[e.code] || `❌ ${e.message}`;
                            if (pasteError) pasteError.textContent = msg;
                            btnSignInWithLink.textContent = 'Sign in with pasted link';
                            btnSignInWithLink.disabled = false;
                        }
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

function renderDevToggle(isEmulator) {
    if (document.getElementById('emulator-badge')) return;

    if (isEmulator) {
        document.body.style.border = "4px solid #ff3333";
        const badge = document.createElement('div');
        badge.id = 'emulator-badge';
        badge.textContent = "⚠️ EMULATOR MODE";
        badge.style.cssText = "position:fixed; top:0; left:50%; transform:translateX(-50%); background:#ff3333; color:white; padding:2px 8px; font-size:11px; font-weight:bold; border-radius:0 0 6px 6px; z-index:10001; pointer-events:none;";
        document.body.appendChild(badge);
    }
}