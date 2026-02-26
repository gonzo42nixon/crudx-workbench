import { setupAuth } from './auth-helper.js';
import { detectMimetype } from './modules/mime.js';
import { themeState, applyTheme, syncModalUI, initThemeEditor, initThemeControls } from './modules/theme.js';
import { db, auth } from './modules/firebase.js';
import { applyLayout, initPaginationControls, fetchRealData, fetchLastPageData } from './modules/pagination.js';
import { renderDataFromDocs, escapeHtml } from './modules/ui.js';
import { initAuth } from './modules/auth.js';
import { 
    collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, deleteDoc, doc, 
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

        // --- THEME CONFIG ---
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

        // Auth initialisieren
        initAuth();

        // Paginierung initialisieren
        initPaginationControls();

        // --- FAB-FUNKTIONEN (SHARE, FULLSCREEN, PRINT) ---
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

        // --- NAVIGATION (BURGER, DRAWER) ---
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.add('open'));
        bind('btn-close-drawer', 'click', () => document.getElementById('drawer').classList.remove('open'));

        // --- THEME MODAL (verschiebbar + schließen bei Klick außen) ---
        const themeModal = document.getElementById('theme-modal');
        const modalContent = document.querySelector('.modal-content');
        const modalTitle = modalContent?.querySelector('h3');

        let isDragging = false;
        let startX, startY, startTranslateX, startTranslateY;
        let currentTranslateX = 0, currentTranslateY = 0;

        function getTranslateValues() {
            const style = window.getComputedStyle(modalContent);
            const transform = style.transform;
            if (transform && transform !== 'none') {
                const matrix = transform.match(/matrix.*\((.+)\)/);
                if (matrix) {
                    const values = matrix[1].split(', ');
                    if (values.length === 6) {
                        return { x: parseFloat(values[4]), y: parseFloat(values[5]) };
                    }
                }
            }
            return { x: 0, y: 0 };
        }

        if (modalTitle) {
            modalTitle.classList.add('modal-drag-handle');
            modalTitle.style.cursor = 'move';

            modalTitle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

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

        themeModal.addEventListener('click', (e) => {
            if (e.target === themeModal) {
                themeModal.classList.remove('active');
                modalContent.style.transform = 'translate(-50%, -50%)';
                currentTranslateX = 0;
                currentTranslateY = 0;
            }
        });

        bind('btn-close-modal', 'click', () => {
            themeModal.classList.remove('active');
            modalContent.style.transform = 'translate(-50%, -50%)';
            currentTranslateX = 0;
            currentTranslateY = 0;
        });

        // --- EXPORT MODAL ---
        bind('btn-close-export', 'click', () => {
            document.getElementById('export-modal').classList.remove('active');
        });

        bind('btn-copy-buffer', 'click', () => {
            const content = document.getElementById('export-area').value;
            navigator.clipboard.writeText(content).then(() => {
                const btn = document.getElementById('btn-copy-buffer');
                btn.textContent = "✅ Copied!";
                setTimeout(() => btn.textContent = "📋 Copy to Clipboard", 2000);
            });
        });

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

        // --- DATA ACTIONS ---
        bind('btn-inject', 'click', () => import('./seed.js').then(m => m.seedData(db)));

        bind('btn-delete', 'click', async () => {
            if (!confirm("Alle Dokumente wirklich löschen?")) return;

            const colRef = collection(db, "kv-store");
            const snap = await getDocs(colRef);

            if (snap.empty) {
                alert("Nichts zum Löschen da.");
                return;
            }

            console.log(`🗑️ Starte Batch-Löschung von ${snap.size} Dokumenten...`);

            let count = 0;
            let batch = writeBatch(db);

            for (const document of snap.docs) {
                batch.delete(document.ref);
                count++;

                if (count % 500 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                    console.log(`📦 Zwischenstand: ${count} gelöscht.`);
                }
            }

            if (count % 500 !== 0) {
                await batch.commit();
            }

            console.log("✅ Alle Dokumente entfernt.");
            fetchRealData(); // UI aktualisieren
        });

    } catch (e) {
        console.error("🔥 FATAL:", e);
    }
});