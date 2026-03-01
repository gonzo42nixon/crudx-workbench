import { setupAuth } from './auth-helper.js';
import { detectMimetype } from './modules/mime.js';
import { themeState, applyTheme, syncModalUI, initThemeEditor, initThemeControls } from './modules/theme.js';
import { db, auth } from './modules/firebase.js';
import { applyLayout, initPaginationControls, fetchRealData, fetchLastPageData } from './modules/pagination.js';
import { renderDataFromDocs, escapeHtml } from './modules/ui.js';
import { initAuth } from './modules/auth.js';
import { 
    collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, deleteDoc, doc, 
    writeBatch, updateDoc, arrayUnion, getDoc, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const FREEMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'freenet.de', 'icloud.com'
]);

function getEmailWarning(email) {
    const [local, domain] = email.split('@');
    if (!local || !domain) return null;

    if (local === '*' && domain === '*') {
        return "⚠️ This is unrestricted usage!";
    } else if (local === '*' && FREEMAIL_DOMAINS.has(domain)) {
        return "⚠️ This is a freemailer with a very large user base.";
    } else if (domain === '*' && local !== '*') {
        return "⚠️ Please do not specify a name addressing a natural person here, but a group, role or team.";
    }
    return null;
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        window.db = db; 
        window.auth = auth; // Damit die Konsole weiß, wer 'auth' ist

        // State for Whitelist Modal Context
        let currentWhitelistDocId = null;
        let currentWhitelistField = null;
        let currentWhitelistItems = [];
        let editingOrigin = null;

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
            dataContainer.addEventListener('click', async (e) => {
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

                    // --- NEW: Whitelist Edit Mode ---
                    if (pill.classList.contains('pill-user') && pill.title.startsWith('Whitelist')) {
                        const card = pill.closest('.card-kv');
                        if (card) {
                            currentWhitelistDocId = card.querySelector('.pill-key').textContent.trim();
                            // Extract type from title "Whitelist READ: ..." -> "read"
                            const type = pill.title.split(':')[0].replace('Whitelist', '').trim().toLowerCase();
                            currentWhitelistField = `white_list_${type}`;

                            // Load existing data for chips
                            const docRef = doc(db, "kv-store", currentWhitelistDocId);
                            try {
                                const snap = await getDoc(docRef);
                                if (snap.exists()) {
                                    renderWhitelistChips(snap.data()[currentWhitelistField] || []);
                                }
                            } catch (e) {
                                console.error("Error fetching whitelist:", e);
                            }
                        }
                        const modal = document.getElementById('whitelist-modal');
                        const input = document.getElementById('whitelist-input');
                        if (modal && input) {
                            modal.classList.add('active');
                            input.value = ''; // Reset input for new entry
                            editingOrigin = null;
                            document.getElementById('btn-save-whitelist').textContent = "Add Entry";
                            input.focus();
                            document.getElementById('whitelist-warning').classList.remove('visible');
                        }
                        return;
                    }

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
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

        if (isLocal) {
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
        } else {
            const btnInject = document.getElementById('btn-inject');
            if (btnInject) btnInject.style.display = 'none';
            const btnDelete = document.getElementById('btn-delete');
            if (btnDelete) btnDelete.style.display = 'none';
        }

        // --- WHITELIST MODAL INJECTION ---
        const wlModalHTML = `
        <div id="whitelist-modal" class="modal-overlay">
            <div class="modal-content" style="width: 500px; max-width: 90vw;">
                <h3 class="modal-drag-handle">Edit Whitelist Entry</h3>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="font-size: 0.8em; opacity: 0.7; text-transform: uppercase;">Current Entries</label>
                        <div id="whitelist-chips" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; min-height: 40px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px solid #333;"></div>
                    </div>

                    <label style="font-size: 0.8em; opacity: 0.7; text-transform: uppercase;">Email / Pattern</label>
                    <input type="text" id="whitelist-input" placeholder="e.g. *@gmail.com" style="background: rgba(0,0,0,0.3); border: 1px solid #333; color: #fff; padding: 10px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; outline: none;">
                    
                    <div id="whitelist-warning" class="whitelist-warning-box">
                        <span style="font-size: 1.5em;">⚠️</span>
                        <span id="whitelist-warning-text"></span>
                    </div>

                    <div class="modal-actions">
                        <button id="btn-cancel-whitelist" style="border-color: #555;">Close</button>
                        <button id="btn-save-whitelist" style="border-color: #00ff00; color: #00ff00;">Add Entry</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', wlModalHTML);

        const wlModal = document.getElementById('whitelist-modal');
        const wlInput = document.getElementById('whitelist-input');
        const wlWarningBox = document.getElementById('whitelist-warning');
        const wlWarningText = document.getElementById('whitelist-warning-text');

        const renderWhitelistChips = (list) => {
            currentWhitelistItems = list || [];
            const container = document.getElementById('whitelist-chips');
            if (!container) return;
            container.innerHTML = '';
            
            if (!list || list.length === 0) {
                container.innerHTML = '<span style="opacity:0.5; font-size:0.8em; font-style:italic; padding: 4px;">No entries.</span>';
                return;
            }

            list.forEach(email => {
                const chip = document.createElement('div');
                chip.className = 'pill pill-user';
                chip.style.cssText = "cursor: default; border-color: #ff5252; color: #ff5252; background: rgba(255, 82, 82, 0.1); display: inline-flex; gap: 6px; align-items: center;";
                
                const textSpan = document.createElement('span');
                textSpan.textContent = email;
                textSpan.style.cursor = "pointer";
                textSpan.title = "Click to edit";
                textSpan.onclick = (e) => {
                    e.stopPropagation();
                    wlInput.value = email;
                    editingOrigin = email;
                    document.getElementById('btn-save-whitelist').textContent = "Update Entry";
                    wlInput.focus();
                    wlInput.dispatchEvent(new Event('input')); // Trigger warning check
                };

                const closeSpan = document.createElement('span');
                closeSpan.textContent = "×";
                closeSpan.style.fontWeight = "900";
                closeSpan.style.cursor = "pointer";
                closeSpan.title = "Remove entry";
                closeSpan.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Remove "${email}" from whitelist?`)) return;
                    try {
                        const docRef = doc(db, "kv-store", currentWhitelistDocId);
                        await updateDoc(docRef, {
                            [currentWhitelistField]: arrayRemove(email)
                        });
                        const snap = await getDoc(docRef);
                        if (snap.exists()) {
                            renderWhitelistChips(snap.data()[currentWhitelistField] || []);
                        }
                        fetchRealData(); 
                    } catch (e) {
                        console.error("Removal failed:", e);
                        alert(e.message);
                    }
                };
                chip.appendChild(textSpan);
                chip.appendChild(closeSpan);
                container.appendChild(chip);
            });
        };
        
        wlInput.addEventListener('input', () => {
            const val = wlInput.value.trim();
            const warning = getEmailWarning(val);
            if (warning) {
                wlWarningText.textContent = warning;
                wlWarningBox.classList.add('visible');
            } else {
                wlWarningBox.classList.remove('visible');
            }
        });

        document.getElementById('btn-cancel-whitelist').addEventListener('click', () => {
            wlModal.classList.remove('active');
            editingOrigin = null;
            document.getElementById('btn-save-whitelist').textContent = "Add Entry";
        });

        document.getElementById('btn-save-whitelist').addEventListener('click', async () => {
            const val = wlInput.value.trim();
            if (!val) return;

            if (currentWhitelistItems.includes(val) && val !== editingOrigin) {
                alert("This entry is already in the whitelist.");
                return;
            }

            if (currentWhitelistDocId && currentWhitelistField) {
                try {
                    const docRef = doc(db, "kv-store", currentWhitelistDocId);
                    
                    if (editingOrigin && editingOrigin !== val) {
                        // Update Mode: Remove old, add new
                        await updateDoc(docRef, { [currentWhitelistField]: arrayRemove(editingOrigin) });
                        await updateDoc(docRef, { [currentWhitelistField]: arrayUnion(val) });
                    } else if (!editingOrigin) {
                        // Add Mode
                        await updateDoc(docRef, { [currentWhitelistField]: arrayUnion(val) });
                    }
                    // If editingOrigin === val, no change needed (just refresh UI)
                    
                    // Refresh list and clear input
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        renderWhitelistChips(snap.data()[currentWhitelistField] || []);
                    }
                    wlInput.value = '';
                    editingOrigin = null;
                    document.getElementById('btn-save-whitelist').textContent = "Add Entry";
                    document.getElementById('whitelist-warning').classList.remove('visible');
                    fetchRealData(); // Refresh Grid to show new pill count
                } catch (e) {
                    console.error("Firestore Update Error:", e);
                    alert("Update failed: " + e.message);
                }
            }
        });

    } catch (e) {
        console.error("🔥 FATAL:", e);
    }
});