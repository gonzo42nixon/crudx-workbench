import { setupAuth } from './auth-helper.js';
import { detectMimetype } from './modules/mime.js';
import { themeState, applyTheme, syncModalUI, initThemeEditor, initThemeControls } from './modules/theme.js';
import { db, auth } from './modules/firebase.js';
import { applyLayout, initPaginationControls, fetchRealData, fetchLastPageData } from './modules/pagination.js';
import { renderDataFromDocs, escapeHtml } from './modules/ui.js'; // werden später vielleicht nicht mehr direkt benötigt
import { collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, deleteDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {
    try {

// --- MAGIC LINK CHECKER ---
        const finalizeLogin = async () => {
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
        };
        finalizeLogin();

window.db = db; 
window.auth = auth; // Damit die Konsole weiß, wer 'auth' ist

        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, fn);
        };

        

        // --- 2. THEME CONFIG (VOLLSTÄNDIG) ---

        const settingsBlock = document.getElementById('crudx-settings');
if (settingsBlock && settingsBlock.textContent.trim() !== "" && settingsBlock.textContent.trim() !== "{}") {
    try { 
        themeState.appConfig = { ...themeState.appConfig, ...JSON.parse(settingsBlock.textContent) }; 
    } catch (e) {}
}

// Theme initialisieren
themeState.currentActiveTheme = themeState.appConfig.startupTheme;
applyTheme(themeState.currentActiveTheme);
initThemeEditor();
initThemeControls();
initPaginationControls();

        bind('btn-share', 'click', () => {
            if (navigator.share) {
                navigator.share({ title: 'CRUDX Data View', url: window.location.href });
            } else {
                navigator.clipboard.writeText(window.location.href);
                alert("Link in Zwischenablage kopiert!");
            }
        });

        bind('btn-fullscreen', 'click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });

        bind('btn-print', 'click', () => window.print());

        // --- 5. NAVIGATION (BURGER, DRAWER) ---
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.add('open'));
        bind('btn-close-drawer', 'click', () => document.getElementById('drawer').classList.remove('open'));

        // --- 6. THEME MODAL (verschiebbar + schließen bei Klick außen) ---
        const themeModal = document.getElementById('theme-modal');
        const modalContent = document.querySelector('.modal-content');
        const modalTitle = modalContent?.querySelector('h3'); // Als Ziehgriff

        // Variablen für Drag
        let isDragging = false;
        let startX, startY, startTranslateX, startTranslateY;
        let currentTranslateX = 0, currentTranslateY = 0;

        // Hilfsfunktion: Aktuelle Transform-Matrix auslesen
        function getTranslateValues() {
            const style = window.getComputedStyle(modalContent);
            const transform = style.transform;
            if (transform && transform !== 'none') {
                const matrix = transform.match(/matrix.*\((.+)\)/);
                if (matrix) {
                    const values = matrix[1].split(', ');
                    // Bei matrix(scaleX, skewY, skewX, scaleY, translateX, translateY)
                    if (values.length === 6) {
                        return { x: parseFloat(values[4]), y: parseFloat(values[5]) };
                    }
                    // Bei matrix3d – ignorieren wir, nehmen vereinfacht 0
                }
            }
            return { x: 0, y: 0 };
        }

        // Drag-Start auf dem Titel
        if (modalTitle) {
            modalTitle.classList.add('modal-drag-handle');
            modalTitle.style.cursor = 'move';

            modalTitle.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Textselektion verhindern
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                // Aktuelle Translate-Werte holen
                const translate = getTranslateValues();
                startTranslateX = translate.x;
                startTranslateY = translate.y;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        function onMouseMove(e) {
            if (!isDragging) return;
            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            currentTranslateX = startTranslateX + dx;
            currentTranslateY = startTranslateY + dy;

            modalContent.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
        }

        function onMouseUp() {
            if (isDragging) {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        }

        // Schließen bei Klick außerhalb (auf das Overlay)
        themeModal.addEventListener('click', (e) => {
            if (e.target === themeModal) {
                themeModal.classList.remove('active');
                // Position zurücksetzen (wieder zentrieren)
                modalContent.style.transform = 'translate(-50%, -50%)';
                currentTranslateX = 0;
                currentTranslateY = 0;
            }
        });

        // Schließen-Button
        bind('btn-close-modal', 'click', () => {
            themeModal.classList.remove('active');
            modalContent.style.transform = 'translate(-50%, -50%)';
            currentTranslateX = 0;
            currentTranslateY = 0;
        });

        // Schließen des Export-Modals
        bind('btn-close-export', 'click', () => {
            document.getElementById('export-modal').classList.remove('active');
        });

        // In die Zwischenablage kopieren
        bind('btn-copy-buffer', 'click', () => {
            const content = document.getElementById('export-area').value;
            navigator.clipboard.writeText(content).then(() => {
                const btn = document.getElementById('btn-copy-buffer');
                btn.textContent = "✅ Copied!";
                setTimeout(() => btn.textContent = "📋 Copy to Clipboard", 2000);
            });
        });

        // Als JSON Datei speichern
        bind('btn-save-json', 'click', () => {
            const content = document.getElementById('export-area').value;
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `crudx-theme-${themeState.currentActiveTheme}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });


        // --- 8. DATA ACTIONS ---
        bind('btn-inject', 'click', () => import('./seed.js').then(m => m.seedData(db)));
bind('btn-delete', 'click', async () => {
    if(!confirm("Alle Dokumente wirklich löschen?")) return;
    
    const colRef = collection(db, "kv-store");
    const snap = await getDocs(colRef);
    
    if (snap.empty) {
        alert("Nichts zum Löschen da.");
        return;
    }

    console.log(`🗑️ Starte Batch-Löschung von ${snap.size} Dokumenten...`);

    // Wir teilen die Arbeit in 500er Pakete auf
    let count = 0;
    let batch = writeBatch(db);

    for (const document of snap.docs) {
        batch.delete(document.ref);
        count++;

        // Wenn 500 erreicht sind, abschicken und neuen Batch starten
        if (count % 500 === 0) {
            await batch.commit();
            batch = writeBatch(db);
            console.log(`📦 Zwischenstand: ${count} gelöscht.`);
        }
    }

    // Den Rest abschicken
    if (count % 500 !== 0) {
        await batch.commit();
    }

    console.log("✅ Alle Dokumente entfernt.");
    fetchRealData(); // UI aktualisieren
});

// --- 9. AUTH LOGIK & START ---
(async () => {
    try {
        const { onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");

onAuthStateChanged(auth, async (user) => {
    const loginModal = document.getElementById('login-modal');
    const userProfile = document.getElementById('user-profile');
    const userEmailSpan = document.getElementById('user-email');
    const gridSelect = document.getElementById('grid-select');
    const userModal = document.getElementById('user-modal');
    const modalEmail = document.getElementById('modal-user-email');

    if (user) {
        console.log("✅ Access granted for:", user.email);
        
        if (loginModal) {
            loginModal.classList.remove('active');
            loginModal.style.display = 'none';
        }

        if (userProfile) {
            userProfile.style.display = 'flex';
            userProfile.style.cursor = 'pointer';
            
            // FEATURE FIX: Hide all wording/email from the header
            if (userEmailSpan) userEmailSpan.style.display = 'none'; 
            
            // Tooltip only shows info
            userProfile.title = `CRUDX Account\n${user.email}`;

            userProfile.onclick = (e) => {
                e.stopPropagation();
                if (modalEmail) modalEmail.textContent = user.email;
                
                // Positioning floating popup directly under the icon
                const rect = userProfile.getBoundingClientRect();
                userModal.style.top = `${rect.bottom + 10}px`;
                userModal.style.left = `${rect.right - 280}px`;
                userModal.classList.toggle('active');
            };
        }

        const btnLogoutConfirm = document.getElementById('btn-logout-confirm');
        if (btnLogoutConfirm) {
            btnLogoutConfirm.onclick = async () => {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                await signOut(auth);
                window.location.reload();
            };
        }

        const btnCloseUser = document.getElementById('btn-close-user');
        if (btnCloseUser) {
            btnCloseUser.onclick = (e) => {
                e.stopPropagation();
                userModal.classList.remove('active');
            };
        }

        // Apply 3x3 Layout from URL
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
        
        const btnLink = document.getElementById('btn-send-link');
        if (btnLink) {
            btnLink.onclick = async () => {
                const emailInput = document.getElementById('login-email');
                if (!emailInput || !emailInput.value) return alert("Please enter an email address.");
                const currentView = gridSelect ? gridSelect.value : '3';
                const currentContinueUrl = `${window.location.origin}${window.location.pathname}?view=${currentView}`;
                const { loginWithEmail } = await import('./auth-helper.js');
                await loginWithEmail(auth, emailInput.value, currentContinueUrl);
                const status = document.getElementById('login-status');
                if (status) status.textContent = "Check your inbox (Emulator UI)!";
            };
        }
    }
});

        // Global click to close the popup
        window.addEventListener('click', () => {
            const userModal = document.getElementById('user-modal');
            if (userModal) userModal.classList.remove('active');
        });

    } catch (err) {
        console.error("🔥 Auth Init Error:", err);
    }
})(); // These are the missing brackets that were causing the crash

    } catch (e) { console.error("🔥 FATAL:", e); }
});