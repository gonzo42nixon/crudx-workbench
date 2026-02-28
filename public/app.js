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

        // --- CRUDX WEBHOOK BUTTONS & PILLS ---
        const dataContainer = document.getElementById('data-container');
        if (dataContainer) {
            dataContainer.addEventListener('click', (e) => {
                // 1. Action Buttons (C, R, U, D, X)
                const btn = e.target.closest('.btn-crudx');
                if (btn) {
                    e.stopPropagation(); 
                    const action = btn.getAttribute('data-action');
                    const card = btn.closest('.card-kv');
                    const key = card ? card.querySelector('.pill-key')?.textContent : '';
                    const url = `https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977?action=${action}&key=${encodeURIComponent(key)}`;
                    
                    if (e.shiftKey) {
                        navigator.clipboard.writeText(url).then(() => {
                            console.log(`📋 Webhook URL copied for action '${action}'.`);
                            const originalText = btn.textContent;
                            btn.textContent = "📋";
                            setTimeout(() => btn.textContent = originalText, 1000);
                        }).catch(err => console.error("Copy failed:", err));
                    } else {
                        window.open(url, '_blank');
                    }
                    return;
                }

                // 2. Pills (Key, Label, Sys, User, Mime)
                const pill = e.target.closest('.pill');
                if (pill) {
                    e.stopPropagation();

                    if (e.shiftKey) {
                        // Shift+Click: Copy Tooltip (title) to clipboard
                        const tooltip = pill.getAttribute('title') || '';
                        navigator.clipboard.writeText(tooltip).then(() => {
                            console.log(`📋 Tooltip copied: '${tooltip}'`);
                            // Visual feedback: Flash border/glow
                            const originalTransition = pill.style.transition;
                            pill.style.transition = "all 0.2s";
                            pill.style.transform = "scale(1.1)";
                            pill.style.boxShadow = "0 0 10px #00ff00";
                            pill.style.borderColor = "#00ff00";
                            
                            setTimeout(() => {
                                pill.style.transform = "";
                                pill.style.boxShadow = "";
                                pill.style.borderColor = "";
                                setTimeout(() => pill.style.transition = originalTransition, 200);
                            }, 500);
                        }).catch(err => console.error("Copy failed:", err));
                    } else {
                        // Normal Click: Open Webhook with action=pill&pill=<content>
                        const value = pill.textContent.trim();
                        const url = `https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977?action=pill&pill=${encodeURIComponent(value)}`;
                        window.open(url, '_blank');
                    }
                }

                // 3. Value Layer (Shift+Click to Copy)
                const valueLayer = e.target.closest('.value-layer');
                if (valueLayer && e.shiftKey) {
                    e.stopPropagation();
                    const content = valueLayer.textContent;
                    navigator.clipboard.writeText(content).then(() => {
                        console.log("📋 Value copied to clipboard.");
                        
                        // Visual feedback: Flash green glow inside
                        const originalTransition = valueLayer.style.transition;
                        valueLayer.style.transition = "box-shadow 0.2s";
                        valueLayer.style.boxShadow = "inset 0 0 20px rgba(0, 255, 0, 0.6)";
                        
                        setTimeout(() => {
                            valueLayer.style.boxShadow = "";
                            setTimeout(() => valueLayer.style.transition = originalTransition, 200);
                        }, 400);
                    }).catch(err => console.error("Copy failed:", err));
                }
            });
        }

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
        bind('btn-inject', 'click', () => import(`./seed.js?t=${Date.now()}`).then(m => m.seedData(db)));

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

            for (const docSnap of snap.docs) {
                batch.delete(docSnap.ref);
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