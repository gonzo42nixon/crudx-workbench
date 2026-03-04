import { setupAuth } from './auth-helper.js';
import { detectMimetype } from './modules/mime.js';
import { themeState, applyTheme, syncModalUI, initThemeEditor, initThemeControls } from './modules/theme.js';
import { db, auth } from './modules/firebase.js';
import { applyLayout, initPaginationControls, fetchRealData, fetchLastPageData, loadStateFromUrl } from './modules/pagination.js';
import { renderDataFromDocs, escapeHtml } from './modules/ui.js';
import { initAuth } from './modules/auth.js';
import { 
    collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, deleteDoc, doc, 
    writeBatch, updateDoc, arrayUnion, getDoc, arrayRemove, where, increment
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

function syntaxHighlight(json) {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, undefined, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
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
        let currentDocData = null; // Store for JSON Modal

        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, fn);
        };

        // --- SEARCH LISTENER ---
        const searchInput = document.getElementById('main-search');
        const clearBtn = document.getElementById('btn-clear-search');

        const toggleClearBtn = () => {
            if (clearBtn && searchInput) clearBtn.style.display = searchInput.value.trim() ? 'block' : 'none';
        };

        bind('main-search', 'keydown', (e) => {
            if (e.key === 'Enter') {
                fetchRealData();
            }
        });
        bind('main-search', 'input', toggleClearBtn);

        bind('btn-clear-search', 'click', () => {
            if (searchInput) {
                searchInput.value = '';
                toggleClearBtn();
                searchInput.focus();
                fetchRealData();
            }
        });

        // Initial check
        toggleClearBtn();
        
        // Safety check for IFrame/Pop-Out: Check URL params immediately
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('search') && searchInput) {
            searchInput.value = urlParams.get('search');
            toggleClearBtn();
        }

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
                alert("Link copied to clipboard!");
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
                    let url = `https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977?action=${action}&key=${encodeURIComponent(key)}`;
                    
                    // --- Protection & Authorization Check ---
                    const style = window.getComputedStyle(btn);
                    const bgColor = style.backgroundColor;

                    // Case 1: Protected & Not Authorized (Red Button)
                    // Note: rgb(255, 23, 68) is #ff1744
                    if (bgColor === 'rgb(255, 23, 68)') {
                        alert("You are not authorized to perform this protected action!");
                        return;
                    }

                    // Case 2: Protected & Authorized (Yellow Button)
                    // Note: rgb(255, 215, 0) is #ffd700
                    if (bgColor === 'rgb(255, 215, 0)') {
                        if (!confirm("Do you really want to perform this action?")) {
                            return;
                        }
                    }

                    // Case 3: Unprotected & Unauthorized (Gray Button)
                    // Note: rgb(158, 158, 158) is #9e9e9e
                    if (bgColor === 'rgb(158, 158, 158)') {
                        alert("Action blocked: Unprotected but unauthorized.");
                        return;
                    }

                    // --- ACTION: READ (Open New Tab) ---
                    if (action === 'R') {
                        // Shift+Click: Copy Share Link (GET Request) for external use
                        if (e.shiftKey) {
                            navigator.clipboard.writeText(url).then(() => {
                                console.log(`📋 Webhook Link copied: ${url}`);
                                const originalText = btn.textContent;
                                btn.textContent = "📋 Link";
                                setTimeout(() => btn.textContent = originalText, 1000);
                            }).catch(err => console.error("Copy failed:", err));
                            return;
                        }

                        // Normal Click: Open Pop-Out Window with Address Bar
                        let targetUrl = url; // Default to Webhook

                        // EMULATOR FIX: Simulate Webhook-Update locally
                        // Since Make.com updates Production DB, the Emulator DB (Localhost) would never update.
                        const urlParams = new URLSearchParams(window.location.search);
                        const forceProd = urlParams.get('mode') === 'live';
                        const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

                        if (isEmulator && key) {
                            updateDoc(doc(db, "kv-store", key), {
                                reads: increment(1),
                                last_read_ts: new Date().toISOString()
                            }).catch(err => console.error("Emulator Update Error:", err));
                        }

                        const width = 800;
                        const height = 600;
                        const left = (window.screen.width - width) / 2;
                        const top = (window.screen.height - height) / 2;
                        window.open(targetUrl, '_blank', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,location=yes`);
                        return;
                    }

                    // --- ACTION: UPDATE (Shift+Click -> Copy CURL) ---
                    if (action === 'U' && e.shiftKey && auth.currentUser) {
                        try {
                            const token = await auth.currentUser.getIdToken();
                            const projectId = "crudx-e0599"; // Hardcoded or from config
                            
                            const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
                            const baseUrl = isLocal 
                                ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/kv-store/`
                                : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/kv-store/`;
                            
                            const curl = `curl -X PATCH -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"fields": {"value": {"stringValue": "NEW_VALUE"}}}' "${baseUrl}${key}"`;
                            
                            await navigator.clipboard.writeText(curl);
                            alert("📋 CURL command for PATCH copied to clipboard!");
                        } catch (err) {
                            console.error("CURL Gen Error:", err);
                            alert("Failed to generate CURL: " + err.message);
                        }
                        return;
                    }

                    // --- ACTION: UPDATE (Modal Editor) ---
                    if (action === 'U' && !e.shiftKey) {
                        const card = btn.closest('.card-kv');
                        const key = card ? card.querySelector('.pill-key')?.textContent : '';
                        const label = card ? card.querySelector('.pill-label')?.textContent : '';
                        const valueLayer = card ? card.querySelector('.value-layer') : null;
                        const currentValue = valueLayer ? valueLayer.textContent : "";
                        
                        openUpdateModal(key, currentValue, label, card);
                        return;
                    }

                    // --- ACTION: DELETE (Confirm & Fetch) ---
                    if (action === 'D' && !e.shiftKey) {
                        if (confirm(`⚠️ Really delete document "${key}"?`)) {
                            const urlParams = new URLSearchParams(window.location.search);
                            const forceProd = urlParams.get('mode') === 'live';
                            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

                            if (isEmulator) {
                                console.log(`🔧 Emulator Mode: Deleting "${key}" via SDK.`);
                                deleteDoc(doc(db, "kv-store", key))
                                    .then(() => {
                                        console.log(`✅ Document "${key}" deleted.`);
                                        fetchRealData();
                                    })
                                    .catch(err => alert("Delete failed: " + err.message));
                            } else {
                                fetch(url)
                                    .then(res => {
                                        if (res.ok) {
                                            console.log(`✅ Document "${key}" deleted via Webhook.`);
                                            setTimeout(() => fetchRealData(), 1000);
                                        } else {
                                            alert("Delete failed: " + res.statusText);
                                        }
                                    })
                                    .catch(err => alert("Error: " + err.message));
                            }
                        }
                        return;
                    }
                    
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

                    // --- CLICK ON KEY: Jump to 1x1 & Filter ---
                    if (pill.classList.contains('pill-key') && !e.shiftKey) {
                        const key = pill.textContent.trim();
                        
                        // Open in IFrame Modal (Pop-Out style) to preserve history
                        const iframeModal = document.getElementById('iframe-modal');
                        const iframe = document.getElementById('doc-frame');
                        const iframeUrl = document.getElementById('iframe-url');

                        if (iframeModal && iframe) {
                            const targetUrl = `${window.location.href.split('?')[0]}?view=1&search=${encodeURIComponent(key)}`;
                            iframe.src = targetUrl;
                            if (iframeUrl) iframeUrl.value = targetUrl;
                            iframeModal.classList.add('active');
                            return;
                        }

                        // Fallback if modal missing
                        const searchInput = document.getElementById('main-search');
                        const gridSelect = document.getElementById('grid-select');
                        
                        if (searchInput && gridSelect) {
                            searchInput.value = key;
                            gridSelect.value = '1';
                            applyLayout('1'); // Triggers fetchRealData
                            return;
                        }
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
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.toggle('open'));
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

        // --- IFRAME MODAL ---
        bind('btn-close-iframe', 'click', () => {
            const iframeModal = document.getElementById('iframe-modal');
            const iframe = document.getElementById('doc-frame');
            if (iframeModal) iframeModal.classList.remove('active');
            if (iframe) iframe.src = 'about:blank';
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

        // Backup Tool (Available in Production & Dev)
        bind('btn-backup', 'click', async () => {
            const btn = document.getElementById('btn-backup');
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'wait';
            }

            try {
                console.log("📦 Starting Backup...");
                const colRef = collection(db, "kv-store");
                const snap = await getDocs(colRef);
                const data = snap.docs.map(doc => ({ _id: doc.id, ...doc.data() }));

                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `CRUDX-BACKUP-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log(`✅ Backup complete: ${data.length} records.`);
            } catch (e) {
                console.error("Backup failed:", e);
                alert("Backup failed: " + e.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }
            }
        });

        // Restore Tool (Available in Production & Dev)
        bind('btn-restore', 'click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        if (!Array.isArray(json)) {
                            alert("Invalid backup file format.");
                            return;
                        }

                        if (!confirm(`⚠️ RESTORE WARNING\n\nThis will overwrite/add ${json.length} documents.\nExisting documents with the same ID will be replaced.\n\nContinue?`)) return;

                        console.log(`♻️ Restoring ${json.length} items...`);
                        const batchSize = 500;
                        let batch = writeBatch(db);
                        let count = 0;

                        for (const item of json) {
                            if (!item._id) continue;
                            const { _id, ...data } = item;
                            const docRef = doc(db, "kv-store", _id);
                            batch.set(docRef, data);
                            count++;

                            if (count % batchSize === 0) {
                                await batch.commit();
                                batch = writeBatch(db);
                                console.log(`📦 Restored ${count} items...`);
                            }
                        }
                        
                        if (count % batchSize !== 0) await batch.commit();
                        
                        console.log("✅ Restore complete.");
                        alert(`Successfully restored ${count} documents.`);
                        fetchRealData();

                    } catch (err) {
                        console.error("Restore failed", err);
                        alert("Error parsing backup file: " + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });

        // JSON Modal Close
        bind('btn-close-json', 'click', () => {
            document.getElementById('json-modal').classList.remove('active');
            currentDocData = null;
        });

        // JSON Modal Forward Button
        bind('btn-forward-json', 'click', async () => {
            if (!currentDocData) return;
            const btn = document.getElementById('btn-forward-json');
            const originalText = btn.textContent;
            btn.textContent = "Sending...";
            try {
                await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(currentDocData)
                });
                btn.textContent = "✅ Sent!";
                setTimeout(() => btn.textContent = originalText, 2000);
            } catch (e) {
                alert("Error sending data: " + e.message);
                btn.textContent = "❌ Error";
                setTimeout(() => btn.textContent = originalText, 2000);
            }
        });

        // Delete by Tag Tool (Available in Production & Dev)
        bind('btn-delete-by-tag', 'click', async () => {
            const tag = prompt("Enter the tag to delete documents by:");
            if (!tag) return;

            const colRef = collection(db, "kv-store");
            const q = query(colRef, where("user_tags", "array-contains", tag));
            
            try {
                const snap = await getDocs(q);
                if (snap.empty) {
                    alert(`No documents found with tag "${tag}".`);
                    return;
                }

                if (!confirm(`⚠️ WARNING: This will delete ${snap.size} documents with tag "${tag}".\n\nAre you sure?`)) return;

                console.log(`🗑️ Deleting ${snap.size} items with tag "${tag}"...`);
                const batchSize = 500;
                let batch = writeBatch(db);
                let count = 0;

                for (const docSnap of snap.docs) {
                    batch.delete(docSnap.ref);
                    count++;
                    if (count % batchSize === 0) {
                        await batch.commit();
                        batch = writeBatch(db);
                    }
                }
                if (count % batchSize !== 0) await batch.commit();

                console.log("✅ Deletion complete.");
                alert(`Successfully deleted ${count} documents.`);
                fetchRealData();
            } catch (e) {
                console.error("Delete by tag failed:", e);
                alert("Error: " + e.message);
            }
        });

        if (isLocal) {
            bind('btn-inject', 'click', () => import(`./seed.js?t=${Date.now()}`).then(m => m.seedData(db)));

            bind('btn-delete', 'click', async () => {
                if (!confirm("Really delete all documents?")) return;

                const colRef = collection(db, "kv-store");
                const snap = await getDocs(colRef);

                if (snap.empty) {
                    alert("Nothing to delete.");
                    return;
                }

                console.log(`🗑️ Starting batch deletion of ${snap.size} documents...`);

                let count = 0;
                let batch = writeBatch(db);

                for (const docSnap of snap.docs) {
                    batch.delete(docSnap.ref);
                    count++;

                    if (count % 500 === 0) {
                        await batch.commit();
                        batch = writeBatch(db);
                        console.log(`📦 Progress: ${count} deleted.`);
                    }
                }

                if (count % 500 !== 0) {
                    await batch.commit();
                }

                console.log("✅ All documents removed.");
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
        <div id="whitelist-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3300; display: none; width: 500px; max-width: 90vw;">
            <div class="modal-content" style="width: 100%; display: flex; flex-direction: column; background: var(--editor-bg); border: 1px solid var(--editor-border); box-shadow: 0 20px 50px rgba(0,0,0,0.8); backdrop-filter: none !important;">
                <h3 class="modal-drag-handle" style="display: flex; justify-content: space-between; align-items: center; cursor: move;">
                    <span id="whitelist-modal-title">Edit Whitelist Entry</span>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span id="btn-toggle-wl-transparency" title="Toggle Transparency" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">👁️</span>
                        <span id="btn-close-whitelist-x" class="close-x" title="Close">✕</span>
                    </div>
                </h3>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="font-size: 0.8em; opacity: 0.7; text-transform: uppercase;">Current Entries</label>
                        <div id="whitelist-chips" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; min-height: 40px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px solid #333;"></div>
                    </div>

                    <label style="font-size: 0.8em; opacity: 0.7; text-transform: uppercase;">Email / Pattern</label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <input type="text" id="whitelist-input" placeholder="e.g. *@gmail.com" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid #333; color: #fff; padding: 10px; padding-right: 40px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; outline: none;">
                        <button id="btn-save-whitelist" title="Add Entry" style="position: absolute; right: 5px; background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 30px; height: 30px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                    </div>
                    
                    <div id="whitelist-warning" class="whitelist-warning-box">
                        <span style="font-size: 1.5em;">⚠️</span>
                        <span id="whitelist-warning-text"></span>
                    </div>

                    <div class="modal-actions" style="justify-content: flex-end; margin-top: 10px;">
                        <button id="btn-whitelist-done" style="border-color: #00ff00; color: #00ff00;">Done</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', wlModalHTML);

        const wlModal = document.getElementById('whitelist-modal');
        const wlInput = document.getElementById('whitelist-input');
        const wlWarningBox = document.getElementById('whitelist-warning');
        const wlWarningText = document.getElementById('whitelist-warning-text');
        const wlContent = wlModal.querySelector('.modal-content');

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
                    const btn = document.getElementById('btn-save-whitelist');
                    btn.textContent = "💾";
                    btn.title = "Update Entry";
                    btn.style.backgroundColor = "#ff9100";
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
                            // Sync with Tag Editor
                            const type = currentWhitelistField.replace('white_list_', '');
                            if (currentWhitelists[type]) {
                                currentWhitelists[type] = snap.data()[currentWhitelistField] || [];
                                renderTagsInModal();
                            }
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

        const closeWhitelistModal = () => {
            wlModal.style.display = 'none';
            editingOrigin = null;
            const btn = document.getElementById('btn-save-whitelist');
            if (btn) {
                btn.textContent = "+";
                btn.title = "Add Entry";
                btn.style.backgroundColor = "var(--user-bg)";
            }
        };

        document.getElementById('btn-close-whitelist-x').addEventListener('click', closeWhitelistModal);
        document.getElementById('btn-whitelist-done').addEventListener('click', closeWhitelistModal);

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
                        // Sync with Tag Editor
                        const type = currentWhitelistField.replace('white_list_', '');
                        if (currentWhitelists[type]) {
                            currentWhitelists[type] = snap.data()[currentWhitelistField] || [];
                            renderTagsInModal();
                        }
                    }
                    wlInput.value = '';
                    editingOrigin = null;
                    const btn = document.getElementById('btn-save-whitelist');
                    btn.textContent = "+";
                    btn.title = "Add Entry";
                    btn.style.backgroundColor = "var(--user-bg)";
                    document.getElementById('whitelist-warning').classList.remove('visible');
                    fetchRealData(); // Refresh Grid to show new pill count
                } catch (e) {
                    console.error("Firestore Update Error:", e);
                    alert("Update failed: " + e.message);
                }
            }
        });

        // --- UPDATE MODAL LOGIC ---
        const updateModal = document.getElementById('update-modal');
        const updateModalContent = updateModal ? updateModal.querySelector('.modal-content') : null;
        const updateEditor = document.getElementById('update-editor');
        const updateLabelDisplay = document.getElementById('update-label-display');
        const updateMimeDisplay = document.getElementById('update-mime-display');
        const btnBeautify = document.getElementById('btn-beautify');
        const btnTransparency = document.getElementById('btn-toggle-transparency');
        
        // Tag Modal Elements
        const tagModal = document.getElementById('tag-modal');
        const tagModalContent = tagModal ? tagModal.querySelector('.modal-content') : null;
        const tagListContainer = document.getElementById('tag-list-container');
        const tagModalTitle = document.getElementById('tag-modal-title');
        
        // Store current key for saving
        let currentUpdateKey = "";
        let currentLabel = "";
        let currentValue = "";
        let currentOwner = "";
        let currentSize = "";
        let currentHighlightedCard = null;
        let currentTags = []; 
        let currentWhitelists = { read: [], update: [], delete: [], execute: [] };
        let currentSystemInfo = {};

        function openUpdateModal(key, value, label, cardElement) {
            if (!updateModal) return;
            currentUpdateKey = key;
            
            // Initiale Werte setzen & Daten nachladen, damit beim Speichern nichts überschrieben wird
            currentLabel = label || "";
            currentTags = []; // Reset, bis Daten geladen sind
            currentWhitelists = { read: [], update: [], delete: [], execute: [] }; // Reset Whitelists
            
            getDoc(doc(db, "kv-store", key)).then(snap => {
                if (snap.exists()) {
                    const d = snap.data();
                    currentTags = d.user_tags || [];
                    currentOwner = d.owner || "";
                    currentWhitelists = {
                        read: d.white_list_read || [],
                        update: d.white_list_update || [],
                        delete: d.white_list_delete || [],
                        execute: d.white_list_execute || []
                    };
                }
            });

            // Highlight Origin Card
            if (currentHighlightedCard) currentHighlightedCard.classList.remove('card-highlight');
            if (cardElement) {
                currentHighlightedCard = cardElement;
                currentHighlightedCard.classList.add('card-highlight');
            }
            
            // Title Logic: Show Label, Tooltip is Key (ID)
            updateLabelDisplay.textContent = label || key;
            updateLabelDisplay.title = `CRUDX-ID: ${key}`;
            
            // Reset View
            updateEditor.style.display = 'block';
            updateEditor.value = value;
            
            // Mime Detection für das Badge
            const mime = detectMimetype(value);
            updateMimeDisplay.textContent = mime.type;
            updateMimeDisplay.style.backgroundColor = mime.color;
            updateMimeDisplay.style.color = (mime.type === 'TXT' || mime.type === 'BASE64') ? '#000' : '#fff';
            if (mime.type === 'JSON' || mime.type === 'JS' || mime.type === 'SVG') updateMimeDisplay.style.color = '#000';

            // Beautify Button Logic
            if (mime.type === 'JSON') {
                btnBeautify.style.display = 'inline-block';
            } else {
                btnBeautify.style.display = 'none';
            }

            updateModal.classList.add('active');
            updateEditor.focus();
        }

        function closeUpdateModal() {
            updateModal.classList.remove('active');
            // Remove Highlight
            if (currentHighlightedCard) currentHighlightedCard.classList.remove('card-highlight');
            currentHighlightedCard = null;
            // Reset position on close (optional, or keep it)
            if (updateModalContent) updateModalContent.style.transform = 'translate(-50%, -50%)';
        }

        // --- NEW TAG MODAL LOGIC ---
        function openTagModal(key, label) {
            if (!tagModal) return;
            currentLabel = label;
            currentTags = [];
            currentWhitelists = { read: [], update: [], delete: [], execute: [] };
            currentSystemInfo = {};
            currentValue = "";
            currentOwner = "";
            currentSize = "";
            
            // Set Tooltip on Title
            if (tagModalTitle) {
                tagModalTitle.title = `Key: ${key}\nLabel: ${label}`;
            }

            // Fetch tags
            getDoc(doc(db, "kv-store", key)).then(snap => {
                if (snap.exists()) {
                    const d = snap.data();
                    currentValue = d.value || "";
                    currentOwner = d.owner || "";
                    currentSize = d.size || "0KB";
                    currentTags = d.user_tags || [];
                    currentWhitelists = {
                        read: d.white_list_read || [],
                        update: d.white_list_update || [],
                        delete: d.white_list_delete || [],
                        execute: d.white_list_execute || []
                    };
                    currentSystemInfo = {
                        created_at: d.created_at,
                        reads: d.reads || 0,
                        last_read_ts: d.last_read_ts,
                        updates: d.updates || 0,
                        last_update_ts: d.last_update_ts,
                        executes: d.executes || 0,
                        last_execute_ts: d.last_execute_ts
                    };
                    renderTagsInModal();
                }
            });

            tagModal.classList.add('active');
            document.getElementById('new-tag-input').focus();
        }

        function renderTagsInModal() {
            if (!tagListContainer) return;
            tagListContainer.innerHTML = '';
            tagListContainer.style.justifyContent = 'flex-end';
            
            // --- KEY PILL ---
            const keyPill = document.createElement('span');
            keyPill.className = 'pill pill-key';
            keyPill.textContent = currentUpdateKey;
            keyPill.title = "Key";
            keyPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
            tagListContainer.appendChild(keyPill);

            // --- LABEL PILL ---
            if (currentLabel) {
                const labelPill = document.createElement('span');
                labelPill.className = 'pill pill-label';
                labelPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
                
                const textSpan = document.createElement('span');
                textSpan.textContent = currentLabel;
                textSpan.style.cursor = 'text';
                textSpan.title = 'Click to edit Label';
                
                textSpan.onclick = (e) => {
                    e.stopPropagation();
                    // Fix width to prevent erratic movement
                    const rect = labelPill.getBoundingClientRect();
                    labelPill.style.width = `${rect.width}px`;
                    labelPill.style.justifyContent = 'center';

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentLabel;
                    input.style.cssText = "background: transparent; border: none; color: inherit; font-family: inherit; font-size: inherit; width: 100%; outline: none; padding: 0; text-align: center;";
                    
                    const saveEdit = () => {
                        const newVal = input.value.trim();
                        if (newVal) {
                            currentLabel = newVal; // Label darf nicht leer sein
                            // Sync with Update Modal Title immediately to keep user orientation
                            if (updateLabelDisplay) updateLabelDisplay.textContent = currentLabel;
                        }
                        renderTagsInModal();
                    };
                    input.addEventListener('blur', saveEdit);
                    input.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') saveEdit(); });
                    
                    labelPill.innerHTML = '';
                    labelPill.appendChild(input);
                    input.focus();
                };

                labelPill.appendChild(textSpan);
                tagListContainer.appendChild(labelPill);
            }

            // --- USER TAGS ---
            currentTags.forEach(tag => {
                const pill = document.createElement('span');
                pill.className = 'pill pill-user';
                pill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
                
                // Inline Edit Span
                const textSpan = document.createElement('span');
                textSpan.textContent = tag;
                textSpan.style.cursor = 'text';
                textSpan.title = 'Click to edit User Memo';
                textSpan.onclick = (e) => {
                    e.stopPropagation();
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = tag;
                    input.style.cssText = "background: #222; border: none; color: #fff; font-family: inherit; font-size: inherit; width: 80px; outline: none; padding: 0;";
                    
                    const saveEdit = () => {
                        const newVal = input.value.trim();
                        if (newVal && newVal !== tag && newVal !== "") {
                            const idx = currentTags.indexOf(tag);
                            if (idx !== -1) currentTags[idx] = newVal;
                        }
                        renderTagsInModal();
                    };
                    input.addEventListener('blur', saveEdit);
                    input.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') saveEdit(); });
                    
                    pill.innerHTML = '';
                    pill.appendChild(input);
                    input.focus();
                };

                const removeSpan = document.createElement('span');
                removeSpan.innerHTML = '✕';
                removeSpan.style.cssText = "cursor:pointer; margin-left:6px; font-weight:bold; opacity:0.6;";
                removeSpan.title = "Remove Tag";
                
                pill.appendChild(textSpan);
                pill.appendChild(removeSpan);
                
                // Remove Handler
                removeSpan.onclick = (e) => {
                    e.stopPropagation();
                    currentTags = currentTags.filter(t => t !== tag);
                    renderTagsInModal();
                };
                tagListContainer.appendChild(pill);
            });

            // --- HELPER FOR SYSTEM PILLS ---
            const createSysPill = (text, colorStyle, tooltip = "", clickCallback = null) => {
                const pill = document.createElement('span');
                pill.className = 'pill';
                pill.style.cssText = `padding: 4px 8px; font-size: 0.85em; cursor: ${clickCallback ? 'pointer' : 'default'}; ${colorStyle}`;
                if (tooltip) pill.title = tooltip;
                pill.textContent = text;
                
                if (clickCallback) {
                    pill.onclick = (e) => { e.stopPropagation(); clickCallback(); };
                }
                tagListContainer.appendChild(pill);
            };

            const fmt = (ts) => ts ? ts.split('T')[0] : '';

            // --- 3. WHITELIST PILLS (Summarized: Icon + Count) ---
            // READ (Green)
            const styleGreen = "border: 1px solid #00e676; color: #00e676; background: rgba(0, 230, 118, 0.1);";
            createSysPill(`R: ${currentWhitelists.read.length}`, styleGreen, "Click to edit Whitelist READ", () => {
                openWhitelistModalForTagEditor('read');
            });

            // UPDATE (Orange)
            const styleOrange = "border: 1px solid #ff9100; color: #ff9100; background: rgba(255, 145, 0, 0.1);";
            createSysPill(`U: ${currentWhitelists.update.length}`, styleOrange, "Click to edit Whitelist UPDATE", () => {
                openWhitelistModalForTagEditor('update');
            });

            // DELETE (Red)
            const styleRed = "border: 1px solid #ff1744; color: #ff1744; background: rgba(255, 23, 68, 0.1);";
            createSysPill(`D: ${currentWhitelists.delete.length}`, styleRed, "Click to edit Whitelist DELETE", () => {
                openWhitelistModalForTagEditor('delete');
            });

            // EXECUTE (Black)
            const styleBlack = "border: 1px solid #555; color: #eee; background: #000;";
            createSysPill(`X: ${currentWhitelists.execute.length}`, styleBlack, "Click to edit Whitelist EXECUTE", () => {
                openWhitelistModalForTagEditor('execute');
            });

            // --- 4. MIME TYPE ---
            const mime = detectMimetype(currentValue);
            const mimePill = document.createElement('span');
            mimePill.className = 'pill pill-mime';
            mimePill.style.cssText = `padding: 4px 8px; font-size: 0.85em; cursor: default; background-color: ${mime.color}; color: ${['TXT','BASE64'].includes(mime.type)?'#000':'#fff'};`;
            if(['JSON','JS','SVG'].includes(mime.type)) mimePill.style.color = '#000';
            mimePill.textContent = mime.type;
            mimePill.title = "Mime Type";
            tagListContainer.appendChild(mimePill);

            // --- OWNER PILL (Editable, No Delete, Valid Email) ---
            if (currentOwner) {
                const ownerPill = document.createElement('span');
                const isMe = auth.currentUser && auth.currentUser.email === currentOwner;

                if (isMe) {
                    ownerPill.className = 'pill';
                    ownerPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: pointer; background: #ffd700; color: #000; border: 1px solid #e6c200; font-weight: bold;";
                    ownerPill.textContent = "You";
                    ownerPill.title = `Click to edit Owner: ${currentOwner}`;
                } else {
                    ownerPill.className = 'pill pill-sys';
                    ownerPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: pointer;";
                    ownerPill.textContent = currentOwner;
                    ownerPill.title = `Click to edit Owner: ${currentOwner}`;
                }

                ownerPill.onclick = (e) => {
                    e.stopPropagation();
                    
                    // Calculate required width for the email
                    const tempSpan = document.createElement('span');
                    tempSpan.style.visibility = 'hidden';
                    tempSpan.style.position = 'absolute';
                    tempSpan.style.whiteSpace = 'nowrap';
                    tempSpan.style.font = window.getComputedStyle(ownerPill).font;
                    tempSpan.textContent = currentOwner;
                    document.body.appendChild(tempSpan);
                    const width = tempSpan.getBoundingClientRect().width;
                    document.body.removeChild(tempSpan);

                    ownerPill.style.width = `${width + 25}px`;
                    ownerPill.style.justifyContent = 'center';
                    
                    // Reset style for editing (neutral look)
                    ownerPill.className = 'pill pill-user';
                    ownerPill.style.background = '';
                    ownerPill.style.color = '';
                    ownerPill.style.border = '';
                    ownerPill.style.fontWeight = 'normal';

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentOwner;
                    input.style.cssText = "background: transparent; border: none; color: inherit; font-family: inherit; font-size: inherit; width: 100%; outline: none; padding: 0; text-align: center;";
                    
                    const saveEdit = () => {
                        const newVal = input.value.trim();
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        
                        if (!newVal) {
                            alert("Owner cannot be empty.");
                            renderTagsInModal();
                        } else if (!emailRegex.test(newVal)) {
                            alert("Owner must be a valid email address.");
                            renderTagsInModal();
                        } else {
                            currentOwner = newVal;
                            renderTagsInModal();
                        }
                    };
                    
                    input.addEventListener('blur', saveEdit);
                    input.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') saveEdit(); });
                    
                    ownerPill.innerHTML = '';
                    ownerPill.appendChild(input);
                    input.focus();
                    input.select();
                };

                tagListContainer.appendChild(ownerPill);
            }

            // --- SIZE PILL (Read-Only) ---
            const sizePill = document.createElement('span');
            sizePill.className = 'pill pill-sys';
            sizePill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
            sizePill.textContent = currentSize;
            sizePill.title = "Size";
            tagListContainer.appendChild(sizePill);

            // --- 5. COUNTERS (Reads, Updates, Executes) ---
            createSysPill(`R: ${currentSystemInfo.reads || 0}`, styleGreen, `Reads: ${currentSystemInfo.reads}`);
            createSysPill(`U: ${currentSystemInfo.updates || 0}`, styleOrange, `Updates: ${currentSystemInfo.updates}`);
            createSysPill(`X: ${currentSystemInfo.executes || 0}`, styleBlack, `Executes: ${currentSystemInfo.executes}`);

            // --- 6. TIMESTAMPS ---
            const styleBlue = "border: 1px solid #2979ff; color: #2979ff; background: rgba(41, 121, 255, 0.1);";
            if (currentSystemInfo.created_at) createSysPill(`C: ${fmt(currentSystemInfo.created_at)}`, styleBlue, `Created: ${currentSystemInfo.created_at}`);
            if (currentSystemInfo.last_read_ts) createSysPill(`R: ${fmt(currentSystemInfo.last_read_ts)}`, styleGreen, `Last Read: ${currentSystemInfo.last_read_ts}`);
            if (currentSystemInfo.last_update_ts) createSysPill(`U: ${fmt(currentSystemInfo.last_update_ts)}`, styleOrange, `Last Update: ${currentSystemInfo.last_update_ts}`);
            if (currentSystemInfo.last_execute_ts) createSysPill(`X: ${fmt(currentSystemInfo.last_execute_ts)}`, styleBlack, `Last Execute: ${currentSystemInfo.last_execute_ts}`);
        }

        // Helper to open Whitelist Modal from Tag Editor
        function openWhitelistModalForTagEditor(type) {
            currentWhitelistDocId = currentUpdateKey;
            currentWhitelistField = `white_list_${type}`;
            renderWhitelistChips(currentWhitelists[type]);
            
            const modal = document.getElementById('whitelist-modal');
            const input = document.getElementById('whitelist-input');
            if (modal && input) {
                const titleEl = document.getElementById('whitelist-modal-title');
                if (titleEl) {
                    const map = { read: 'R', update: 'U', delete: 'D', execute: 'X' };
                    const tooltipMap = { read: 'READ', update: 'UPDATE', delete: 'DELETE', execute: 'EXECUTE' };
                    titleEl.textContent = `${map[type] || '?'}: Edit Whitelist Entry`;
                    titleEl.title = tooltipMap[type] || '';
                }
                modal.style.display = 'block';
                input.value = '';
                editingOrigin = null;
                input.focus();
                document.getElementById('whitelist-warning').classList.remove('visible');
            }
        }

        // Close Buttons
        bind('btn-close-update-x', 'click', closeUpdateModal);
        
        // Open Tag Modal
        bind('btn-edit-tags', 'click', () => {
            const label = document.getElementById('update-label-display').textContent;
            openTagModal(currentUpdateKey, label);
        });

        // Close Tag Modal
        const closeTagModal = () => {
            if (tagModal) tagModal.classList.remove('active');
        };
        bind('btn-close-tags-modal-x', 'click', closeTagModal);
        bind('btn-cancel-tags-modal', 'click', closeTagModal);

        // Save Tags (Persist & Increment)
        bind('btn-save-tags-modal', 'click', async () => {
            const btn = document.getElementById('btn-save-tags-modal');
            const originalText = btn.textContent;
            btn.textContent = "Saving...";
            btn.disabled = true;

            const urlParams = new URLSearchParams(window.location.search);
            const forceProd = urlParams.get('mode') === 'live';
            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

            try {
                if (isEmulator) {
                    console.log("🔧 Emulator Mode: Updating Tags via SDK directly.");
                    await updateDoc(doc(db, "kv-store", currentUpdateKey), {
                        user_tags: currentTags,
                        label: currentLabel,
                        owner: currentOwner,
                        white_list_read: currentWhitelists.read,
                        white_list_update: currentWhitelists.update,
                        white_list_delete: currentWhitelists.delete,
                        white_list_execute: currentWhitelists.execute,
                        updates: increment(1),
                        last_update_ts: new Date().toISOString()
                    });
                } else {
                    // Production: Webhook Update
                    const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "U_TAGS",
                            key: currentUpdateKey,
                            label: currentLabel,
                            owner: currentOwner,
                            user_tags: {
                                arrayValue: {
                                    values: currentTags.map(t => ({ stringValue: t }))
                                }
                            },
                            white_list_read: { arrayValue: { values: currentWhitelists.read.map(v => ({ stringValue: v })) } },
                            white_list_update: { arrayValue: { values: currentWhitelists.update.map(v => ({ stringValue: v })) } },
                            white_list_delete: { arrayValue: { values: currentWhitelists.delete.map(v => ({ stringValue: v })) } },
                            white_list_execute: { arrayValue: { values: currentWhitelists.execute.map(v => ({ stringValue: v })) } },
                            last_update_ts: new Date().toISOString()
                        })
                    });

                    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
                    setTimeout(() => fetchRealData(), 1000);
                }
                
                closeTagModal();
            } catch (e) {
                alert("Failed to save tags: " + e.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });

        // Add Tag Logic
        const addNewTag = () => {
            const input = document.getElementById('new-tag-input');
            const val = input.value.trim();
            if (val && !currentTags.includes(val)) {
                currentTags.push(val);
                renderTagsInModal();
                input.value = '';
            }
        };
        bind('btn-add-new-tag', 'click', addNewTag);
        document.getElementById('new-tag-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addNewTag();
        });

        // Beautify Action
        bind('btn-beautify', 'click', () => {
            try {
                const val = updateEditor.value;
                const json = JSON.parse(val);
                updateEditor.value = JSON.stringify(json, null, 4);
            } catch (e) {
                alert("Invalid JSON, cannot beautify.");
            }
        });

        // Transparency Toggle Logic (3 Levels)
        let transLevel = 0; // 0: Opaque, 1: Trans, 2: Very Trans
        bind('btn-toggle-transparency', 'click', () => {
            transLevel = (transLevel + 1) % 3;
            updateEditor.classList.remove('editor-trans-1', 'editor-trans-2');
            
            if (transLevel === 1) {
                updateEditor.classList.add('editor-trans-1');
                btnTransparency.style.opacity = "1";
            } else if (transLevel === 2) {
                updateEditor.classList.add('editor-trans-2');
                btnTransparency.style.opacity = "0.5";
            } else {
                btnTransparency.style.opacity = "0.8";
            }
        });

        // Tag Modal Transparency
        let tagTransLevel = 0;
        bind('btn-toggle-tags-transparency', 'click', () => {
            tagTransLevel = (tagTransLevel + 1) % 3;
            tagModalContent.classList.remove('tag-modal-trans-1', 'tag-modal-trans-2');
            const btn = document.getElementById('btn-toggle-tags-transparency');
            
            if (tagTransLevel === 1) {
                tagModalContent.classList.add('tag-modal-trans-1');
                btn.style.opacity = "1";
            } else if (tagTransLevel === 2) {
                tagModalContent.classList.add('tag-modal-trans-2');
                btn.style.opacity = "0.5";
            } else {
                btn.style.opacity = "0.8";
            }
        });

        // Whitelist Modal Transparency
        let wlTransLevel = 0;
        bind('btn-toggle-wl-transparency', 'click', () => {
            wlTransLevel = (wlTransLevel + 1) % 3;
            wlContent.classList.remove('tag-modal-trans-1', 'tag-modal-trans-2'); // Reuse existing classes
            const btn = document.getElementById('btn-toggle-wl-transparency');
            
            if (wlTransLevel === 1) {
                wlContent.classList.add('tag-modal-trans-1');
                btn.style.opacity = "1";
            } else if (wlTransLevel === 2) {
                wlContent.classList.add('tag-modal-trans-2');
                btn.style.opacity = "0.5";
            } else {
                btn.style.opacity = "0.8";
            }
        });

        // Save Action (POST to Make.com)
        bind('btn-save-update', 'click', async () => {
            const key = currentUpdateKey;
            const newValue = updateEditor.value;
            const btn = document.getElementById('btn-save-update');
            const originalText = btn.textContent;

            btn.textContent = "⏳ Sending...";
            btn.disabled = true;

            const urlParams = new URLSearchParams(window.location.search);
            const forceProd = urlParams.get('mode') === 'live';
            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

            try {
                if (isEmulator) {
                    // --- EMULATOR: SDK Update ONLY (No Webhook) ---
                    console.log("🔧 Emulator Mode: Updating via SDK directly.");
                    await updateDoc(doc(db, "kv-store", key), {
                        value: newValue,
                        // Hinzugefügt, um Label und Owner aus dem Tag-Editor mit zu speichern
                        label: currentLabel,
                        owner: currentOwner,
                        user_tags: currentTags, // Für Emulator direkt als Array
                        white_list_read: currentWhitelists.read,
                        white_list_update: currentWhitelists.update,
                        white_list_delete: currentWhitelists.delete,
                        white_list_execute: currentWhitelists.execute,
                        updates: increment(1),
                        last_update_ts: new Date().toISOString()
                    });
                } else {
                    // --- PRODUCTION: Webhook Update ---
                    // Fix: Escape quotes/backslashes to prevent breaking the JSON structure in Make.com
                    const safeValue = JSON.stringify(newValue).slice(1, -1);

                    const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "U",
                            key: key,
                            value: safeValue,
                            // Hinzugefügt, um Label und Owner aus dem Tag-Editor mit zu speichern
                            label: currentLabel,
                            owner: currentOwner,
                            // User Tags ebenfalls mitsenden (Firestore JSON Format für Make.com)
                            user_tags: {
                                arrayValue: {
                                    values: (currentTags || []).map(t => ({ stringValue: t }))
                                }
                            },
                            white_list_read: { arrayValue: { values: (currentWhitelists.read || []).map(v => ({ stringValue: v })) } },
                            white_list_update: { arrayValue: { values: (currentWhitelists.update || []).map(v => ({ stringValue: v })) } },
                            white_list_delete: { arrayValue: { values: (currentWhitelists.delete || []).map(v => ({ stringValue: v })) } },
                            white_list_execute: { arrayValue: { values: (currentWhitelists.execute || []).map(v => ({ stringValue: v })) } }
                        })
                    });

                    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
                    
                    // Optional: Kurz warten, damit Make.com Zeit hat zu schreiben, dann Refresh
                    setTimeout(() => fetchRealData(), 1000);
                }

                closeUpdateModal();
            } catch (e) {
                alert("Update failed: " + e.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });

        // --- DRAG LOGIC FOR UPDATE MODAL ---
        if (updateModalContent) {
            const handle = updateModalContent.querySelector('.modal-drag-handle');
            if (handle) {
                handle.style.cursor = 'move';
                let isDraggingUpdate = false;
                let startX, startY, startTransX, startTransY;

                handle.addEventListener('mousedown', (e) => {
                    // Prevent dragging when clicking buttons inside header
                    if (e.target.closest('.close-x') || e.target.closest('#btn-beautify')) return;
                    
                    e.preventDefault();
                    isDraggingUpdate = true;
                    startX = e.clientX;
                    startY = e.clientY;

                    const style = window.getComputedStyle(updateModalContent);
                    const matrix = new WebKitCSSMatrix(style.transform);
                    startTransX = matrix.m41;
                    startTransY = matrix.m42;

                    document.addEventListener('mousemove', onMouseMoveUpdate);
                    document.addEventListener('mouseup', onMouseUpUpdate);
                });

                function onMouseMoveUpdate(e) {
                    if (!isDraggingUpdate) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    updateModalContent.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
                }

                function onMouseUpUpdate() {
                    isDraggingUpdate = false;
                    document.removeEventListener('mousemove', onMouseMoveUpdate);
                    document.removeEventListener('mouseup', onMouseUpUpdate);
                }
            }
        }

        // --- DRAG LOGIC FOR TAG MODAL ---
        if (tagModalContent) {
            const handle = tagModalContent.querySelector('.modal-drag-handle');
            if (handle) {
                handle.style.cursor = 'move';
                let isDraggingTag = false;
                let startX, startY, startTransX, startTransY;

                handle.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.close-x') || e.target.closest('#btn-toggle-tags-transparency')) return;
                    
                    e.preventDefault();
                    isDraggingTag = true;
                    startX = e.clientX;
                    startY = e.clientY;

                    const style = window.getComputedStyle(tagModalContent);
                    const matrix = new WebKitCSSMatrix(style.transform);
                    startTransX = matrix.m41;
                    startTransY = matrix.m42;

                    document.addEventListener('mousemove', onMouseMoveTag);
                    document.addEventListener('mouseup', onMouseUpTag);
                });

                function onMouseMoveTag(e) {
                    if (!isDraggingTag) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    tagModalContent.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
                }

                function onMouseUpTag() {
                    isDraggingTag = false;
                    document.removeEventListener('mousemove', onMouseMoveTag);
                    document.removeEventListener('mouseup', onMouseUpTag);
                }
            }
        }

        // --- DRAG LOGIC FOR IFRAME MODAL ---
        const iframeModal = document.getElementById('iframe-modal');
        const iframeContent = iframeModal ? iframeModal.querySelector('.modal-content') : null;
        if (iframeContent) {
            const handle = iframeContent.querySelector('.modal-drag-handle');
            if (handle) {
                handle.style.cursor = 'move';
                let isDraggingIframe = false;
                let startX, startY, startTransX, startTransY;

                handle.addEventListener('mousedown', (e) => {
                    // Prevent dragging when interacting with inputs or close button
                    if (e.target.closest('.close-x') || e.target.tagName === 'INPUT') return;
                    
                    e.preventDefault();
                    isDraggingIframe = true;
                    startX = e.clientX;
                    startY = e.clientY;

                    const style = window.getComputedStyle(iframeContent);
                    const matrix = new WebKitCSSMatrix(style.transform);
                    startTransX = matrix.m41;
                    startTransY = matrix.m42;

                    document.addEventListener('mousemove', onMouseMoveIframe);
                    document.addEventListener('mouseup', onMouseUpIframe);
                });

                function onMouseMoveIframe(e) {
                    if (!isDraggingIframe) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    iframeContent.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
                }

                function onMouseUpIframe() {
                    isDraggingIframe = false;
                    document.removeEventListener('mousemove', onMouseMoveIframe);
                    document.removeEventListener('mouseup', onMouseUpIframe);
                }
            }
        }

        // --- DRAG LOGIC FOR WHITELIST MODAL ---
        if (wlContent) {
            const handle = wlContent.querySelector('.modal-drag-handle');
            if (handle) {
                let isDraggingWl = false;
                let startX, startY, startLeft, startTop;

                handle.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.close-x') || e.target.closest('#btn-toggle-wl-transparency')) return;
                    e.preventDefault();
                    isDraggingWl = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    startLeft = wlModal.offsetLeft;
                    startTop = wlModal.offsetTop;
                    document.addEventListener('mousemove', onMouseMoveWl);
                    document.addEventListener('mouseup', onMouseUpWl);
                });
                function onMouseMoveWl(e) {
                    if (!isDraggingWl) return;
                    wlModal.style.left = `${startLeft + (e.clientX - startX)}px`;
                    wlModal.style.top = `${startTop + (e.clientY - startY)}px`;
                }
                function onMouseUpWl() { isDraggingWl = false; document.removeEventListener('mousemove', onMouseMoveWl); document.removeEventListener('mouseup', onMouseUpWl); }
            }
        }

        // Global ESC Key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (tagModal && tagModal.classList.contains('active')) {
                    closeTagModal();
                } else if (updateModal && updateModal.classList.contains('active')) {
                    closeUpdateModal();
                }
                // Auch andere Modals schließen, falls offen
                if (themeModal && themeModal.classList.contains('active')) themeModal.classList.remove('active');
                if (document.getElementById('json-modal').classList.contains('active')) document.getElementById('json-modal').classList.remove('active');
                if (document.getElementById('whitelist-modal') && document.getElementById('whitelist-modal').style.display === 'block') document.getElementById('whitelist-modal').style.display = 'none';
                
                const iframeModal = document.getElementById('iframe-modal');
                if (iframeModal && iframeModal.classList.contains('active')) {
                    iframeModal.classList.remove('active');
                    const iframe = document.getElementById('doc-frame');
                    if (iframe) iframe.src = 'about:blank';
                }
            }
        });

    } catch (e) {
        console.error("🔥 FATAL:", e);
    }
});