import { setupAuth } from './auth-helper.js';
import { detectMimetype } from './modules/mime.js';
import { themeState, applyTheme, syncModalUI, initThemeEditor, initThemeControls } from './modules/theme.js';
import { db, auth } from './modules/firebase.js';
import { applyLayout, initPaginationControls, fetchRealData, fetchLastPageData, loadStateFromUrl, unsubscribeListener } from './modules/pagination.js';
import { renderDataFromDocs, escapeHtml } from './modules/ui.js';
import { initTagCloud, refreshTagCloud, updateTagCloudSelection, locateDocumentInCloud, resetTagCloud } from './modules/tagscanner.js';
import { loadTagConfigFromUrl, getTagConfigForUrl, getTagRules, setTagRules } from './modules/tag-state.js';
import { initAuth } from './modules/auth.js';
import { encodeOCR, getEmailWarning, syntaxHighlight, buildFirestoreCreatePayload, isValidIsoDate } from './modules/utils.js';
import { 
    collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, deleteDoc, doc, 
    writeBatch, updateDoc, setDoc, arrayUnion, getDoc, arrayRemove, where, increment
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
        let iframeTransLevel = 0; // State for IFrame Transparency

        // --- MULTI-WINDOW EXECUTION LOGIC ---
        let executionWindowZIndex = 3500;
        let executionWindowOffset = 0;

        // --- HELPER: Generate Secure App Blob (Shared logic for X-Button and Confluence Mode) ---
        async function generateSecureAppBlob(key, d) {
            const tags = d.user_tags || [];
            let contextData = null;
            
            // 1. Build Params
            const params = new URLSearchParams();
            params.append("action", "X");
            params.append("key", key);

            if (tags.includes("app")) {
                params.set("app", key);
            }
            if (tags.includes("data")) {
                params.set("data", key);
                const xTag = tags.find(t => t.startsWith("x:"));
                if (xTag) params.set("app", xTag.substring(2));
            }
            // Aux Tags
            tags.forEach(t => {
                if (t.startsWith("s:")) params.set("settings", t.substring(2));
                if (t.startsWith("d1:")) params.set("data-1", t.substring(3));
                if (t.startsWith("d2:")) params.set("data-2", t.substring(3));
                if (t.startsWith("d3:")) params.set("data-3", t.substring(3));
            });

            if (!params.has("app")) return null; // Not an app execution

            // 2. Fetch App Content
            const appKey = params.get("app");
            let appContent = "";

            if (appKey === key) {
                appContent = d.value;
            } else {
                const appDocSnap = await getDoc(doc(db, "kv-store", appKey));
                if (appDocSnap.exists()) {
                    appContent = appDocSnap.data().value;
                } else {
                    return null; // App not found
                }
            }

            // 3. Inject Context & Data
            if (appContent && typeof appContent === 'string' && !appContent.startsWith("<h3>⚠️")) {
                let injectedData = "";
                if (params.has("data")) {
                    const safeJson = JSON.stringify(d).replace(/<\/script>/g, '<\\/script>');
                    injectedData = `<script type="application/json" id="markdown-template">${safeJson}</script>`;
                }
                
                contextData = {
                    key: params.get("data") || key, 
                    webhookUrl: "https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977",
                    action: "U",
                    label: d.label || "",
                    owner: d.owner || "",
                    documentData: d, // Pass full document data for context reconstruction
                    user_tags: d.user_tags || [],
                    white_list_read: d.white_list_read || [],
                    white_list_update: d.white_list_update || [],
                    white_list_delete: d.white_list_delete || [],
                    white_list_execute: d.white_list_execute || []
                };
                const jsonStr = JSON.stringify(contextData).replace(/<\/script>/g, '<\\/script>');
                // Inject isEmulator flag into the context
                const injectedContext = `<script>try{window.CRUDX_CONTEXT=${jsonStr}; window.CRUDX_CONTEXT.isEmulator = ${['localhost', '127.0.0.1'].includes(window.location.hostname)};}catch(e){console.error("Ctx Inj Fail",e);}</script>`;

                // FIX: Inject Context early (Head) if possible, Data late (Body)
                if (/<head>/i.test(appContent)) {
                    appContent = appContent.replace(/<head>/i, `<head>${injectedContext}`);
                    if (/<\/body>/i.test(appContent)) {
                        appContent = appContent.replace(/<\/body>/i, `${injectedData}</body>`);
                    } else {
                        appContent += injectedData;
                    }
                } else {
                    // Fallback
                    const bodyEndRegex = /<\/body>/i;
                    if (bodyEndRegex.test(appContent)) {
                        appContent = appContent.replace(bodyEndRegex, `${injectedData}${injectedContext}</body>`);
                    } else {
                        appContent += injectedData + injectedContext;
                    }
                }
            }
            return { blob: new Blob([appContent], { type: 'text/html' }), contextData };
        }

        function createExecutionWindow(targetUrl, contentValue, key) {
            executionWindowZIndex++;
            executionWindowOffset += 30;
            // Reset offset if it gets too far down/right
            if (executionWindowOffset > 150) executionWindowOffset = 30;

            const div = document.createElement('div');
            // KEIN Wrapper mehr, direkt das Fenster erstellen
            div.className = 'modal-content execution-window'; 
            if (key) div.dataset.key = key; // Store key to bridge with Update Modal
            div.style.zIndex = executionWindowZIndex;
            
            // Default dimensions
            let width = '90vw';
            let height = '90vh';
            
            // Parse dimensions from content
            if (contentValue && typeof contentValue === 'string') {
                const wMatch = contentValue.match(/width=["']?(\d+)(?:px)?["']?/i);
                const hMatch = contentValue.match(/height=["']?(\d+)(?:px)?["']?/i);
                if (wMatch && hMatch) {
                    width = `${parseInt(wMatch[1]) + 40}px`; // +40px buffer for borders/padding
                    height = `${parseInt(hMatch[1]) + 80}px`; // +80px for Header + padding
                }
            }

            // Styles direkt auf das Fenster anwenden
            div.style.width = width;
            div.style.height = height;
            div.style.position = 'absolute';
            div.style.top = `calc(50% + ${executionWindowOffset}px)`;
            div.style.left = `calc(50% + ${executionWindowOffset}px)`;
            div.style.transform = 'translate(-50%, -50%)';
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.padding = '0';
            div.style.overflow = 'hidden';
            div.style.resize = 'both';
            div.style.minWidth = '400px';
            div.style.minHeight = '300px';

            div.innerHTML = `
                    <div class="modal-drag-handle" style="padding: 10px; background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--editor-border); display: flex; justify-content: space-between; align-items: center; gap: 15px; cursor: move;">
                        <span style="font-size: 1.2rem;">🚀</span>
                        <input type="text" readonly value="${targetUrl}" style="flex: 1; background: #000; border: 1px solid #333; color: #00ff00; padding: 6px 10px; font-family: 'JetBrains Mono', monospace; font-size: 0.85em; border-radius: 4px; outline: none;">
                        <span class="btn-external" title="Open in New Tab" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">🔗</span>
                        <span class="btn-transparency" title="Toggle Transparency" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">👁️</span>
                        <span class="btn-close" title="Close" style="cursor: pointer; font-size: 1.2rem;">✕</span>
                    </div>
                    <div class="execution-iframe-container" style="position: relative; flex: 1; overflow: hidden;">
                        <iframe src="${targetUrl}" style="width: 100%; height: 100%; border: none; background: var(--canvas-bg);"></iframe>
                    </div>
            `;

            document.body.appendChild(div);

            const content = div; // Das div IST jetzt der Content
            const handle = div.querySelector('.modal-drag-handle');
            const btnClose = div.querySelector('.btn-close');
            const btnTrans = div.querySelector('.btn-transparency');
            const btnExternal = div.querySelector('.btn-external');
            const iframe = div.querySelector('iframe');
            const iframeContainer = div.querySelector('.execution-iframe-container');

            // Bring to front on click
            content.addEventListener('mousedown', () => {
                executionWindowZIndex++;
                div.style.zIndex = executionWindowZIndex;
            });

            // Open External
            btnExternal.addEventListener('click', () => {
                window.open(targetUrl, '_blank');
            });

            // Close
            btnClose.addEventListener('click', () => {
                document.body.removeChild(div);
            });

            // Transparency
            let transLevel = 0;
            btnTrans.addEventListener('click', () => {
                transLevel = (transLevel + 1) % 3;
                content.classList.remove('iframe-trans-1', 'iframe-trans-2');
                if (transLevel === 1) {
                    content.classList.add('iframe-trans-1');
                    btnTrans.style.opacity = "1";
                } else if (transLevel === 2) {
                    content.classList.add('iframe-trans-2');
                    btnTrans.style.opacity = "0.5";
                } else {
                    btnTrans.style.opacity = "0.8";
                }
            });

            // Drag Logic (Specific to this instance)
            let isDragging = false;
            let startX, startY, startTransX, startTransY;

            handle.addEventListener('mousedown', (e) => {
                if (e.target.closest('.btn-close') || e.target.closest('.btn-transparency') || e.target.tagName === 'INPUT') return;
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                const style = window.getComputedStyle(content);
                const matrix = new WebKitCSSMatrix(style.transform);
                startTransX = matrix.m41;
                startTransY = matrix.m42;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            function onMouseMove(e) {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                content.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
            }

            function onMouseUp() {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        }

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
                fetchRealData(true);
            }
        });
        bind('main-search', 'input', toggleClearBtn);

        bind('btn-clear-search', 'click', () => {
            if (searchInput) {
                searchInput.value = '';
                toggleClearBtn();
                searchInput.focus();
                fetchRealData(true);
                updateTagCloudSelection();
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

        // Tag Config aus URL laden
        loadTagConfigFromUrl();

        // Paginierung initialisieren
        initPaginationControls();

        // --- FAB-FUNKTIONEN (SHARE, FULLSCREEN, PRINT) ---
        bind('btn-share', 'click', () => {
            if (navigator.share) {
                navigator.share({ title: 'CRUDX Data View', url: window.location.href });
            } else {
                const shareUrl = `${window.location.href.split('?')[0]}?${new URLSearchParams(window.location.search).toString()}&tagConfig=${getTagConfigForUrl()}`;
                navigator.clipboard.writeText(shareUrl);
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
                    const key = card ? card.querySelector('.pill-key')?.textContent.trim() : '';
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
                        if (e.shiftKey) {
                            // Shift+Click: Copy Share Link (GET Request) for external use
                            navigator.clipboard.writeText(url).then(() => {
                                console.log(`📋 Webhook Link copied: ${url}`);
                                const originalText = btn.textContent;
                                btn.textContent = "📋 Link";
                                setTimeout(() => btn.textContent = originalText, 1000);
                            }).catch(err => console.error("Copy failed:", err));
                        } else {
                            // Normal Click: Open Pop-Out Window
                            const width = 800;
                            const height = 600;
                            const left = (window.screen.width - width) / 2;
                            const top = (window.screen.height - height) / 2;
                            const windowFeatures = `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,location=yes`;

                            const urlParams = new URLSearchParams(window.location.search);
                            const forceProd = urlParams.get('mode') === 'live';
                            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

                            if (isEmulator && key) {
                                // --- EMULATOR SDK PATH ---
                                try {
                                    const docSnap = await getDoc(doc(db, "kv-store", key));
                                    if (!docSnap.exists()) throw new Error(`Document with key "${key}" not found.`);
                                    
                                    const content = docSnap.data().value || "[No value field]";
                                    const newWindow = window.open('', '_blank', windowFeatures);
                                    newWindow.document.write(`<html><head><title>DEV: ${key}</title><style>body { background-color: #111; color: #eee; font-family: monospace; white-space: pre; }</style></head><body>${escapeHtml(content)}</body></html>`);
                                    newWindow.document.close();

                                    // Update read stats (fire and forget)
                                    updateDoc(docSnap.ref, {
                                        reads: increment(1),
                                        last_read_ts: new Date().toISOString()
                                    }).catch(err => console.error("Emulator Read-Stat Update Error:", err));
                                } catch (err) {
                                    alert("Emulator Read Error: " + err.message);
                                }
                            } else {
                                // --- PRODUCTION WEBHOOK PATH ---
                                window.open(url, '_blank', windowFeatures);
                            }
                        }
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
                        
                        let currentValue = null;

                        // Check for Iframe (Confluence Mode / Embeds)
                        const iframe = valueLayer ? valueLayer.querySelector('iframe') : null;

                        if (iframe) {
                            try {
                                // Try to get content from internal editor (e.g. Markdown Studio)
                                const iframeEditor = iframe.contentWindow.document.getElementById('editor');
                                if (iframeEditor) {
                                    currentValue = iframeEditor.value;
                                }
                            } catch (err) {
                                console.log("Iframe access skipped (likely cross-origin or no editor):", err);
                            }
                        } 

                        // Check for floating execution window (Priority over everything else)
                        // This handles the case where the user is editing in a pop-up (X) and clicks Update (U) on the card
                        const execWindow = document.querySelector(`.execution-window[data-key="${key}"]`);
                        if (execWindow) {
                            const iframe = execWindow.querySelector('iframe');
                            if (iframe) {
                                try {
                                    const iframeEditor = iframe.contentWindow.document.getElementById('editor');
                                    if (iframeEditor) {
                                        currentValue = iframeEditor.value;
                                    }
                                } catch (err) {
                                    console.log("Exec window iframe access skipped:", err);
                                }
                            }
                        }

                        // FIX: Always load from DB if we couldn't get the value from a live iframe editor.
                        // Falling back to DOM (valueLayer.textContent) is unreliable as it might be empty/truncated.
                        
                        openUpdateModal(key, currentValue, label, card, false);
                        return;
                    }

                    // --- ACTION: EXECUTE (Webapp Launcher) ---
                    if (action === 'X' && !e.shiftKey) {
                        const btn = e.target.closest('.btn-crudx');
                        const originalText = btn.textContent;

                        if (!key) {
                            alert("⚠️ Error: Could not determine Document ID (Key) from card. Please refresh.");
                            return;
                        }
                        
                        // Visual Feedback
                        btn.textContent = "🚀";
                        btn.style.cursor = "wait";

                        try {
                            // 1. Fetch latest tags to ensure logic is based on current state
                            const docSnap = await getDoc(doc(db, "kv-store", key));
                            if (!docSnap.exists()) throw new Error("Document not found");
                            
                            const d = docSnap.data();
                            const tags = d.user_tags || [];
                            
                            // Special Case: Bookmark URL -> Open in IFrame directly
                            const mime = detectMimetype(d.value);
                            if (tags.includes("bookmark") && mime.type === 'URL') {
                                createExecutionWindow(d.value, d.value, key);
                                updateDoc(doc(db, "kv-store", key), { executes: increment(1), last_execute_ts: new Date().toISOString() }).catch(console.error);
                                
                                // Reset button state and stop further execution
                                btn.textContent = originalText;
                                btn.style.cursor = "pointer";
                                return;
                            }

                            // Determine Environment
                            const urlParams = new URLSearchParams(window.location.search);
                            const forceProd = urlParams.get('mode') === 'live';
                            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

                            if (!isEmulator) {
                                // --- PROD: Use Make.com Webhook ---
                                const params = new URLSearchParams();
                                params.append("action", "X");

                                if (tags.includes("app")) params.set("app", key);
                                if (tags.includes("data")) {
                                    params.set("data", key);
                                    const xTag = tags.find(t => t.startsWith("x:"));
                                    if (xTag) params.set("app", xTag.substring(2));
                                }
                                tags.forEach(t => {
                                    if (t.startsWith("s:")) params.set("settings", t.substring(2));
                                    if (t.startsWith("d1:")) params.set("data-1", t.substring(3));
                                    if (t.startsWith("d2:")) params.set("data-2", t.substring(3));
                                    if (t.startsWith("d3:")) params.set("data-3", t.substring(3));
                                });

                                if (!params.has("app")) {
                                    alert("⚠️ Launcher Error: Missing 'app' parameter (Tag 'app' or 'x:AppKey' required).");
                                    return;
                                }

                                const baseUrl = "https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977";
                                const targetUrl = `${baseUrl}?${params.toString()}`;
                                createExecutionWindow(targetUrl, d.value, key);
                                updateDoc(doc(db, "kv-store", key), { executes: increment(1), last_execute_ts: new Date().toISOString() }).catch(console.error);
                            } else {
                                // --- EMULATOR: Client-Side Rendering (Blob) ---
                                const { blob, contextData } = await generateSecureAppBlob(key, d) || {};
                                if (blob) {
                                    let blobUrl = URL.createObjectURL(blob);
                                    if (contextData) blobUrl += `#ctx=${encodeURIComponent(JSON.stringify(contextData))}`;
                                    createExecutionWindow(blobUrl, d.value, key);
                                    updateDoc(doc(db, "kv-store", key), { executes: increment(1), last_execute_ts: new Date().toISOString() }).catch(console.error);
                                } else {
                                    alert("⚠️ Launcher Error: Could not resolve App logic. Check tags (app/data/x:...).");
                                }
                            }

                        } catch (err) {
                            console.error("Launcher Error:", err);
                            alert("Launcher failed: " + err.message);
                        } finally {
                            btn.textContent = originalText;
                            btn.style.cursor = "pointer";
                        }
                        return;
                    }

                    // --- ACTION: DELETE (Confirm & Fetch) ---
                    if (action === 'D' && !e.shiftKey) {
                        if (confirm(`⚠️ Really delete document "${key}"?`)) {
                            const urlParams = new URLSearchParams(window.location.search);
                            const forceProd = urlParams.get('mode') === 'live';
                            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

                            // Unsubscribe from any active listener BEFORE deleting the doc
                            // to prevent a race condition where the listener renders "No docs".
                            unsubscribeListener();

                            if (isEmulator) {
                                console.log(`🔧 Emulator Mode: Deleting "${key}" via SDK.`);
                                deleteDoc(doc(db, "kv-store", key))
                                    .then(() => {
                                        console.log(`✅ Document "${key}" deleted.`);
                                        fetchRealData();
                                        const gridSelect = document.getElementById('grid-select');
                                        const searchInput = document.getElementById('main-search');
                                        
                                        // If deleting the currently viewed single doc, reset to list view.
                                        if (gridSelect && gridSelect.value === '1') {
                                            console.log("Single document view deletion detected. Switching to list view.");
                                            searchInput.value = ''; // Clear search
                                            
                                            // Apply layout classes but skip the fetch to prevent race condition
                                            applyLayout('list', false, true);
                                            
                                            // Trigger the actual data fetch with a delay, ensuring the search input is cleared
                                            setTimeout(() => fetchRealData(true), 50);

                                            resetTagCloud(); // Force cloud to bottom-right (exit folder mode)
                                        } else {
                                            // Default behavior for all other cases
                                            fetchRealData();
                                        }
                                    refreshTagCloud(db, true); // Force Tag Cloud Update
                                    })
                                    .catch(err => alert("Delete failed: " + err.message));
                            } else {
                                fetch(url)
                                    .then(res => {
                                        if (res.ok) {
                                            console.log(`✅ Document "${key}" deleted via Webhook.`);
                                            setTimeout(() => fetchRealData(), 1000);
                                            setTimeout(() => {
                                                const gridSelect = document.getElementById('grid-select');
                                                const searchInput = document.getElementById('main-search');
                                                // If deleting the currently viewed single doc, reset to list view.
                                                if (gridSelect && gridSelect.value === '1') {
                                                    console.log("Single document view deletion detected. Switching to list view.");
                                                    searchInput.value = ''; // Clear search

                                                    // Apply layout classes but skip the fetch to prevent race condition
                                                    applyLayout('list', false, true);

                                                    // Trigger the actual data fetch with a delay, ensuring the search input is cleared
                                                    setTimeout(() => fetchRealData(true), 50);

                                                    resetTagCloud(); // Force cloud to bottom-right (exit folder mode)
                                                } else {
                                                    fetchRealData();
                                                }
                                            refreshTagCloud(db, true); // Force Tag Cloud Update
                                            }, 1000);
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

                    // --- NEW: CLICK ON SUMMARY PILL: Show Dropdown ---
                    if (pill.classList.contains('summary-pill')) {
                        // Close any existing dropdown
                        const existingDropdown = document.querySelector('.tag-dropdown-menu');
                        if (existingDropdown) existingDropdown.remove();

                        // Don't do anything on shift-click for summary pills
                        if (e.shiftKey) return;

                        const tagsJson = pill.dataset.tags;
                        if (!tagsJson) return;

                        const tags = JSON.parse(tagsJson);
                        if (tags.length === 0) return;

                        // Create dropdown menu
                        const menu = document.createElement('div');
                        menu.className = 'tag-dropdown-menu';
                        
                        tags.forEach(tag => {
                            const item = document.createElement('div');
                            
                            if (typeof tag === 'object' && tag !== null) {
                                // System Tag (Object)
                                item.className = 'pill pill-sys';
                                item.textContent = tag.text;
                                if (tag.title) item.title = tag.title;
                                if (tag.style) item.style.cssText = tag.style;
                                item.style.cursor = 'default';
                            } else {
                                // User Tag (String)
                                item.className = 'pill pill-user';
                                item.textContent = tag;
                                item.style.cursor = 'pointer';
                                item.onclick = () => {
                                    const searchInput = document.getElementById('main-search');
                                    if (searchInput) {
                                        const currentSearch = searchInput.value.trim();
                                        if (currentSearch === `tag:${tag}`) {
                                            searchInput.value = ''; // Abwählen
                                        } else {
                                            searchInput.value = `tag:${tag}`; // Auswählen
                                        }
                                        fetchRealData(true);
                                        updateTagCloudSelection();
                                    }
                                    menu.remove();
                                };
                            }
                            menu.appendChild(item);
                        });

                        document.body.appendChild(menu);

                        const pillRect = pill.getBoundingClientRect();
                        const menuRect = menu.getBoundingClientRect();

                        // Check vertical space: Open upwards if space below is insufficient
                        const spaceBelow = window.innerHeight - pillRect.bottom;
                        if (spaceBelow < menuRect.height && pillRect.top > menuRect.height) {
                            menu.style.top = `${pillRect.top - menuRect.height - 5}px`;
                        } else {
                            menu.style.top = `${pillRect.bottom + 5}px`;
                        }

                        // Check horizontal space
                        menu.style.left = `${Math.min(pillRect.left, window.innerWidth - menuRect.width - 10)}px`;
                        return; // IMPORTANT: Stop further execution for summary pills
                    }

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

                // --- CLICK ON LABEL: Locate in Tag Cloud ---
                if (pill.classList.contains('pill-label') && !e.shiftKey) {
                    const card = pill.closest('.card-kv');
                    const key = card ? card.querySelector('.pill-key')?.textContent.trim() : '';
                    if (key) {
                        locateDocumentInCloud(key);
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
                        // Normal Click: Filter by this tag
                        if (pill.classList.contains('pill-user')) { // Nur User-Tags sind filterbar
                            const value = pill.textContent.trim();
                            const searchInput = document.getElementById('main-search');
                            if (searchInput) {
                                const currentSearch = searchInput.value.trim();
                                if (currentSearch === `tag:${value}`) {
                                    searchInput.value = ''; // Abwählen
                                } else {
                                    searchInput.value = `tag:${value}`; // Auswählen
                                }
                                fetchRealData(true);
                                updateTagCloudSelection();
                            }
                        }
                        // Filter by MIME Type
                        else if (pill.classList.contains('pill-mime')) {
                            const value = pill.textContent.trim();
                            const searchInput = document.getElementById('main-search');
                            if (searchInput) {
                                const currentSearch = searchInput.value.trim();
                                searchInput.value = (currentSearch === `mime:${value}`) ? '' : `mime:${value}`;
                                fetchRealData(true);
                            }
                        }
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

        // Listener to close tag dropdown on outside click
        document.addEventListener('click', (e) => {
            const existingDropdown = document.querySelector('.tag-dropdown-menu');
            if (!existingDropdown) return;

            // Check if the click was on a summary pill (which would open a new one)
            const isSummaryPill = e.target.closest('.summary-pill');
            
            // Close if the click is outside the dropdown AND not on a summary pill
            if (!existingDropdown.contains(e.target) && !isSummaryPill) {
                existingDropdown.remove();
            }
        });

        // --- NAVIGATION (BURGER, DRAWER) ---
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.toggle('open'));
        bind('btn-close-drawer', 'click', () => document.getElementById('drawer').classList.remove('open'));

        // Listener für den Tag Cloud Button (jetzt im Header)
        bind('btn-show-tag-cloud', 'click', () => {
            const container = document.getElementById('tag-cloud-container');
            // Toggle Logic: Close if active, Open/Refresh if inactive
            if (container && container.classList.contains('active')) {
                const closeBtn = document.getElementById('btn-close-tag-cloud');
                if (closeBtn) closeBtn.click(); // Use internal close logic to reset state
            } else {
                refreshTagCloud(db);
            }
        });

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

        // IFrame Transparency Toggle
        bind('btn-toggle-iframe-transparency', 'click', () => {
            iframeTransLevel = (iframeTransLevel + 1) % 3;
            const content = document.querySelector('#iframe-modal .modal-content');
            const btn = document.getElementById('btn-toggle-iframe-transparency');
            
            content.classList.remove('iframe-trans-1', 'iframe-trans-2');
            
            if (iframeTransLevel === 1) {
                content.classList.add('iframe-trans-1');
                btn.style.opacity = "1";
            } else if (iframeTransLevel === 2) {
                content.classList.add('iframe-trans-2');
                btn.style.opacity = "0.5";
            } else {
                btn.style.opacity = "0.8";
            }
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
            bind('btn-inject-core', 'click', () => import(`./seed.js?t=${Date.now()}`).then(m => m.seedCoreData(db)));

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

        // --- TAG RULES MODAL INJECTION (Redesigned) ---
        const rulesModalHTML = `
        <div id="tag-rules-modal" class="modal-overlay" style="z-index: 3400;">
            <div class="modal-content" style="width: 1000px; max-width: 95vw; height: 80vh; display: flex; flex-direction: column; background: var(--editor-bg); border: 1px solid var(--editor-border); box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
                <h3 class="modal-drag-handle" style="display: flex; justify-content: space-between; align-items: center; cursor: move;" title="Move Tags from Tag Cloud to Hidden or Folder: Add a Rule">
                    <span>(.*) Tag Rules (Regex)</span>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span id="btn-toggle-rules-transparency" title="Toggle Transparency" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">👁️</span>
                        <span id="btn-close-rules-x" class="close-x" title="Close">✕</span>
                    </div>
                </h3>
                
                <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                    <!-- Column 1: Folder -->
                    <div class="rules-column" style="display: flex; flex-direction: column; gap: 20px;">
                        <div>
                            <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Add a Rule: Add/Specify a RegEx">
                                <span>(.*) FOLDER RULES</span>
                                <button id="btn-add-folder-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                            </h4>
                            <div id="folder-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                        </div>

                        <div>
                            <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Collapse multiple tags to a single one: Add a Grouping">
                                <span>(.*) FOLDER GROUPING</span>
                                <button id="btn-add-folder-group-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                            </h4>
                            <div id="folder-group-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                        </div>
                    </div>

                    <!-- Column 2: Hidden -->
                    <div class="rules-column" style="display: flex; flex-direction: column; gap: 20px;">
                        <div>
                            <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Add a Rule: Add/Specify a RegEx">
                                <span>(.*) HIDDEN RULES</span>
                                <button id="btn-add-hidden-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                            </h4>
                            <div id="hidden-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                        </div>

                        <div>
                            <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Collapse multiple tags to a single one: Add a Grouping">
                                <span>(.*) HIDDEN GROUPING</span>
                                <button id="btn-add-hidden-group-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                            </h4>
                            <div id="hidden-group-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                        </div>
                    </div>
                </div>

                <div class="modal-actions" style="padding: 20px; border-top: 1px solid var(--editor-border); display: flex; justify-content: flex-end;">
                     <button id="btn-save-rules" style="background: rgba(255,255,255,0.1); color: var(--editor-text); border: 1px solid var(--editor-border); padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Save Rules</button>
                </div>
            </div>
        </div>`;
        
        // Remove existing if any
        const existingRulesModal = document.getElementById('tag-rules-modal');
        if (existingRulesModal) existingRulesModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', rulesModalHTML);

        // --- CREATE FAB INJECTION ---
        const createFabHTML = `<div id="btn-create-card" class="fab-create" title="Create a Card">+</div>`;
        document.body.insertAdjacentHTML('beforeend', createFabHTML);

        // --- CREATE FAB DRAG LOGIC ---
        const fab = document.getElementById('btn-create-card');
        if (fab) {
            let isDragging = false;
            let hasMoved = false;
            let startX, startY, initialLeft, initialTop;

            fab.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only left click
                isDragging = true;
                hasMoved = false;
                startX = e.clientX;
                startY = e.clientY;
                
                const rect = fab.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                
                // Switch to absolute positioning based on current location
                fab.style.bottom = 'auto';
                fab.style.right = 'auto';
                fab.style.left = `${initialLeft}px`;
                fab.style.top = `${initialTop}px`;
                fab.style.transition = 'none'; // Disable transition for instant movement
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            function onMouseMove(e) {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
                fab.style.left = `${initialLeft + dx}px`;
                fab.style.top = `${initialTop + dy}px`;
            }

            function onMouseUp() {
                if (!isDragging) return;
                isDragging = false;
                fab.style.transition = ''; // Restore transition
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                // Smart Anchoring: Automatisch an die nächste Kante heften
                // Verhindert, dass der Button beim Resizen verschwindet
                const rect = fab.getBoundingClientRect();
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                
                // Horizontal: Links oder Rechts?
                if (rect.left + (rect.width / 2) > winW / 2) {
                    fab.style.left = 'auto';
                    fab.style.right = `${winW - rect.right}px`;
                } else {
                    fab.style.right = 'auto';
                    fab.style.left = `${rect.left}px`;
                }
                
                // Vertical: Oben oder Unten?
                if (rect.top + (rect.height / 2) > winH / 2) {
                    fab.style.top = 'auto';
                    fab.style.bottom = `${winH - rect.bottom}px`;
                } else {
                    fab.style.bottom = 'auto';
                    fab.style.top = `${rect.top}px`;
                }

                if (hasMoved) {
                    fab.dataset.justDragged = "true";
                    setTimeout(() => delete fab.dataset.justDragged, 50);
                }
            }
        }

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
                                renderTagsInModal(tagListContainer);
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
                            renderTagsInModal(tagListContainer);
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

        // --- INJECT INLINE TAG EDITOR CONTAINER ---
        if (updateModalContent) {
            const existingContainer = document.getElementById('update-modal-tag-editor');
            
            // FIX: Wrap editor to provide positioning context for tags (relative to editor, not modal)
            let wrapper = document.getElementById('update-editor-wrapper');
            if (!wrapper && updateEditor) {
                wrapper = document.createElement('div');
                wrapper.id = 'update-editor-wrapper';
                wrapper.style.cssText = "position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; margin-bottom: 15px;";
                updateEditor.parentNode.insertBefore(wrapper, updateEditor);
                wrapper.appendChild(updateEditor);
                updateEditor.style.marginBottom = '0';
                updateEditor.style.flex = '1';
            }

            if (!existingContainer && wrapper) {
                const div = document.createElement('div');
                div.id = 'update-modal-tag-editor';
                div.style.display = 'none';
                wrapper.appendChild(div);
            }
        }
        
        // Tag Modal Elements
        const tagModal = document.getElementById('tag-modal');
        const tagModalContent = tagModal ? tagModal.querySelector('.modal-content') : null;
        const tagListContainer = document.getElementById('tag-list-container');
        const tagModalTitle = document.getElementById('tag-modal-title');
        
        // Store current key for saving
        let currentUpdateKey = "";
        let currentIsNew = false;
        let currentLabel = "";
        let currentValue = "";
        let currentOwner = "";
        let currentSize = "";
        let currentHighlightedCard = null;
        let currentTags = []; 
        let currentWhitelists = { read: [], update: [], delete: [], execute: [] };
        let currentSystemInfo = {};

        function openUpdateModal(key, value, label, cardElement, isNew = false) {
            if (!updateModal) return;
            currentUpdateKey = key;
            currentIsNew = isNew;

            // Logic: If value is provided (string), use it. If null (e.g. unreadable iframe), wait for DB.
            if (value !== null) {
                updateEditor.value = value;
            } else {
                updateEditor.value = ""; 
                updateEditor.placeholder = "Loading content...";
            }
            
            // Initiale Werte setzen & Daten nachladen
            currentLabel = label || "";
            currentTags = []; 
            currentWhitelists = { read: [], update: [], delete: [], execute: [] }; 
            currentOwner = "";
            currentSystemInfo = {};

            if (isNew) {
                // Defaults for New Card (Initialize here so they show up in "Prepare Tags")
                if (auth.currentUser) currentOwner = auth.currentUser.email;
                if (!currentTags.includes("data")) currentTags.push("data");
                if (!currentTags.includes("🛡️ D")) currentTags.push("🛡️ D");

                // Auto-generate folder tags
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                const dateTagSuffix = `>${y}>${m}>${d}`;

                if (!currentTags.some(t => t.startsWith("Created>"))) currentTags.push(`Created${dateTagSuffix}`);
                
                currentSystemInfo = { created_at: now.toISOString(), reads: 0, updates: 0, executes: 0 };
            }
            
            getDoc(doc(db, "kv-store", key)).then(snap => {
                if (snap.exists()) {
                    const d = snap.data();
                    currentLabel = d.label || ""; 
                    currentTags = d.user_tags || [];
                    currentOwner = d.owner || "";
                    currentWhitelists = {
                        read: d.white_list_read || [],
                        update: d.white_list_update || [],
                        delete: d.white_list_delete || [],
                        execute: d.white_list_execute || []
                    };

                    // Load value from DB if we couldn't extract it from DOM (value === null)
                    if (value === null && d.value !== undefined) {
                        updateEditor.value = d.value;
                        
                        // Update Mime Badge based on loaded content
                        const mime = detectMimetype(d.value);
                        updateMimeDisplay.textContent = mime.type;
                        updateMimeDisplay.style.backgroundColor = mime.color;
                        updateMimeDisplay.style.color = (mime.type === 'TXT' || mime.type === 'BASE64') ? '#000' : '#fff';
                        if (mime.type === 'JSON' || mime.type === 'JS' || mime.type === 'SVG') updateMimeDisplay.style.color = '#000';
                        btnBeautify.style.display = (mime.type === 'JSON') ? 'inline-block' : 'none';
                    }
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
            
            // --- NEW: Inline Tag Editor for Create ---
            const btnEditTags = document.getElementById('btn-edit-tags');
            const tagEditorContainer = document.getElementById('update-modal-tag-editor');

            if (isNew) {
                if (tagEditorContainer) {
                    tagEditorContainer.style.display = 'block';
                    renderTagsInModal(tagEditorContainer);
                }
                if (btnEditTags) btnEditTags.style.display = 'none';
                updateEditor.style.paddingTop = '50px';
                updateEditor.style.paddingBottom = '50px';
            } else {
                if (tagEditorContainer) tagEditorContainer.style.display = 'none';
                if (btnEditTags) btnEditTags.style.display = 'inline-block';
                updateEditor.style.paddingTop = '15px';
                updateEditor.style.paddingBottom = '15px';
            }

            // --- Dynamic Tag Button Label ---
            if (btnEditTags) {
                btnEditTags.textContent = currentIsNew ? "Prepare Tags" : "Tags";
                btnEditTags.title = "Maintain Tags";
            }

            // --- FIX: Dynamic Button Text & ID (Robustness) ---
            let btn = document.getElementById('btn-create-update');
            if (!btn) {
                btn = document.getElementById('btn-save-update');
                if (btn) btn.id = 'btn-create-update'; // ID korrigieren, falls alt
            }
            if (btn) {
                if (currentIsNew) {
                    btn.textContent = "CREATE";
                    btn.title = "Create new Card";
                    btn.style.backgroundColor = "#00e676"; // Grün für Create
                    btn.style.setProperty('color', '#000000', 'important');
                } else {
                    btn.textContent = "UPDATE";
                    btn.title = "UPDATE Content";
                    btn.style.backgroundColor = "#ff9100"; // Orange für Update
                    btn.style.setProperty('color', '#000000', 'important');
                }
            }

            // Reset View
            updateEditor.style.display = 'block';
            
            // Mime Detection (Initial)
            if (value !== null) {
                const mime = detectMimetype(value);
                updateMimeDisplay.textContent = mime.type;
                updateMimeDisplay.style.backgroundColor = mime.color;
                updateMimeDisplay.style.color = (mime.type === 'TXT' || mime.type === 'BASE64') ? '#000' : '#fff';
                if (mime.type === 'JSON' || mime.type === 'JS' || mime.type === 'SVG') updateMimeDisplay.style.color = '#000';
                btnBeautify.style.display = (mime.type === 'JSON') ? 'inline-block' : 'none';
            } else {
                // Placeholder badge while loading
                updateMimeDisplay.textContent = "...";
                updateMimeDisplay.style.backgroundColor = "#555";
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
            
            // --- 1:1 Overlay Logic ---
            if (updateModalContent && tagModalContent) {
                // Sync dimensions and position from the underlying Update Modal
                tagModalContent.style.width = updateModalContent.style.width || getComputedStyle(updateModalContent).width;
                tagModalContent.style.height = updateModalContent.style.height || getComputedStyle(updateModalContent).height;
                tagModalContent.style.transform = updateModalContent.style.transform;
            }

            // Set Tooltip on Title
            if (tagModalTitle) {
                tagModalTitle.title = `Key: ${key}\nLabel: ${label}`;
            }

            const btnSave = document.getElementById('btn-save-tags-modal');
            if (btnSave && btnSave.parentElement) {
                btnSave.parentElement.style.justifyContent = 'flex-end'; // Ensure button is right-aligned
            }

            if (currentIsNew) {
                // New Card: Use existing in-memory state (do not reset or fetch)
                if (btnSave) {
                    btnSave.textContent = "Done";
                    btnSave.style.backgroundColor = "#00e676"; 
                    btnSave.style.color = "#000000";
                }
                renderTagsInModal(tagListContainer);
            } else {
                // Existing Card: Reset and Fetch
                if (btnSave) {
                    btnSave.textContent = "UPDATE";
                    btnSave.style.backgroundColor = "#ff9100";
                    btnSave.style.color = "#000000";
                }
                currentLabel = label;
                currentTags = [];
                currentWhitelists = { read: [], update: [], delete: [], execute: [] };
                currentSystemInfo = {};
                currentValue = "";
                currentOwner = "";
                currentSize = "";

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
                        renderTagsInModal(tagListContainer);
                    }
                });
            }

            tagModal.classList.add('active');
            document.getElementById('new-tag-input').focus();
        }

        function renderTagsInModal(targetContainer) {
            if (!targetContainer) return;
            targetContainer.innerHTML = '';
            
            // Check if we are in the Update Modal (Overlay Mode)
            const isOverlay = (targetContainer.id === 'update-modal-tag-editor');

            if (isOverlay) {
                // Z-Axis Overlay: Absolute positioning over the modal content
                targetContainer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20;";
            } else {
                // Y-Axis List: Flex column for the dedicated Tag Editor
                targetContainer.style.cssText = "position: relative; flex: 1; width: 100%; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; padding: 5px; justify-content: space-between;";
            }

            const tlGroup = document.createElement('div');
            tlGroup.className = 'tl-group';
            
            if (!isOverlay) {
                // List Mode: Relative positioning
                tlGroup.style.position = 'relative';
                tlGroup.style.top = 'auto';
                tlGroup.style.left = 'auto';
                tlGroup.style.width = '100%';
                tlGroup.style.marginBottom = '10px';
            }
            // Else Overlay Mode: Inherit CSS (absolute, top:12px, left:12px)

            const brGroup = document.createElement('div');
            brGroup.className = 'br-group';
            
            if (!isOverlay) {
                // List Mode: Relative positioning & Flex tweaks
                brGroup.style.position = 'relative';
                brGroup.style.marginTop = 'auto';
                brGroup.style.paddingTop = '15px';
                brGroup.style.flexDirection = 'row-reverse';
                brGroup.style.flexWrap = 'wrap-reverse';
                brGroup.style.justifyContent = 'flex-start';
                brGroup.style.width = '100%';
                brGroup.style.right = 'auto';
                brGroup.style.bottom = 'auto';
            }
            // Else Overlay Mode: Inherit CSS (absolute, bottom:12px, right:12px, row-reverse)

            targetContainer.appendChild(tlGroup);
            targetContainer.appendChild(brGroup);
            
            // --- KEY PILL ---
            const keyPill = document.createElement('span');
            keyPill.className = 'pill pill-key';
            keyPill.textContent = currentUpdateKey;
            keyPill.title = "Key";
            keyPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
            tlGroup.appendChild(keyPill);

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
                        renderTagsInModal(targetContainer);
                    };
                    input.addEventListener('blur', saveEdit);
                    input.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') saveEdit(); });
                    
                    labelPill.innerHTML = '';
                    labelPill.appendChild(input);
                    input.focus();
                };

                labelPill.appendChild(textSpan);
                tlGroup.appendChild(labelPill);
            }

            // --- REVERSED ORDER FOR BR-GROUP ---
            // Create a temporary container to hold elements in the desired visual order
            const brElements = [];

            // --- HELPER FOR SYSTEM PILLS ---
            const createSysPill = (text, colorStyle, tooltip = "", clickCallback = null, container = brGroup) => {
                const pill = document.createElement('span');
                pill.className = 'pill';
                pill.style.cssText = `padding: 4px 8px; font-size: 0.85em; cursor: ${clickCallback ? 'pointer' : 'default'}; ${colorStyle}`;
                if (tooltip) pill.title = tooltip;
                pill.textContent = text;
                
                if (clickCallback) {
                    pill.onclick = (e) => { e.stopPropagation(); clickCallback(); };
                }
                brElements.push(pill);
            };

            // FIX: Robust Date Formatter (handles Strings & Firestore Timestamps)
            const fmt = (ts) => {
                if (!ts) return '';
                if (typeof ts === 'string') return ts.split('T')[0];
                if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate().toISOString().split('T')[0];
                return String(ts);
            };

            // --- ORDER: SYSTEM (Right) -> MIME -> USER (Left) ---
            
            // 1. TIMESTAMPS (System)
            const styleBlue = "border: 1px solid #2979ff; color: #2979ff; background: rgba(41, 121, 255, 0.1);";
            const styleGreen = "border: 1px solid #00e676; color: #00e676; background: rgba(0, 230, 118, 0.1);";
            const styleOrange = "border: 1px solid #ff9100; color: #ff9100; background: rgba(255, 145, 0, 0.1);";
            const styleRed = "border: 1px solid #ff1744; color: #ff1744; background: rgba(255, 23, 68, 0.1);";
            const styleBlack = "border: 1px solid #555; color: #eee; background: #000;";

            if (currentSystemInfo.created_at) createSysPill(`C: ${fmt(currentSystemInfo.created_at)}`, styleBlue, `Created: ${currentSystemInfo.created_at}`);
            if (currentSystemInfo.last_read_ts) createSysPill(`R: ${fmt(currentSystemInfo.last_read_ts)}`, styleGreen, `Last Read: ${currentSystemInfo.last_read_ts}`);
            if (currentSystemInfo.last_update_ts) createSysPill(`U: ${fmt(currentSystemInfo.last_update_ts)}`, styleOrange, `Last Update: ${currentSystemInfo.last_update_ts}`);
            if (currentSystemInfo.last_execute_ts) createSysPill(`X: ${fmt(currentSystemInfo.last_execute_ts)}`, styleBlack, `Last Execute: ${currentSystemInfo.last_execute_ts}`);

            // 2. COUNTERS (System)
            createSysPill(`R: ${currentSystemInfo.reads || 0}`, styleGreen, `Reads: ${currentSystemInfo.reads}`);
            createSysPill(`U: ${currentSystemInfo.updates || 0}`, styleOrange, `Updates: ${currentSystemInfo.updates}`);
            createSysPill(`X: ${currentSystemInfo.executes || 0}`, styleBlack, `Executes: ${currentSystemInfo.executes}`);

            // 3. SIZE PILL (System)
            const sizePill = document.createElement('span');
            sizePill.className = 'pill pill-sys';
            sizePill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
            sizePill.textContent = currentSize;
            sizePill.title = "Size";
            brElements.push(sizePill);

            // 4. OWNER PILL
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
                            renderTagsInModal(targetContainer);
                        } else if (!emailRegex.test(newVal)) {
                            alert("Owner must be a valid email address.");
                            renderTagsInModal(targetContainer);
                        } else {
                            currentOwner = newVal;
                            renderTagsInModal(targetContainer);
                        }
                    };
                    
                    input.addEventListener('blur', saveEdit);
                    input.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') saveEdit(); });
                    
                    ownerPill.innerHTML = '';
                    ownerPill.appendChild(input);
                    input.focus();
                    input.select();
                };

                brElements.push(ownerPill);
            }

            // 5. WHITELIST PILLS
            // READ (Green)
            createSysPill(`R: ${currentWhitelists.read.length}`, styleGreen, "Click to edit Whitelist READ", () => {
                openWhitelistModalForTagEditor('read');
            });

            // UPDATE (Orange)
            createSysPill(`U: ${currentWhitelists.update.length}`, styleOrange, "Click to edit Whitelist UPDATE", () => {
                openWhitelistModalForTagEditor('update');
            });

            // DELETE (Red)
            createSysPill(`D: ${currentWhitelists.delete.length}`, styleRed, "Click to edit Whitelist DELETE", () => {
                openWhitelistModalForTagEditor('delete');
            });

            // EXECUTE (Black)
            createSysPill(`X: ${currentWhitelists.execute.length}`, styleBlack, "Click to edit Whitelist EXECUTE", () => {
                openWhitelistModalForTagEditor('execute');
            });

            // 6. MIME TYPE
            const mime = detectMimetype(currentValue);
            const mimePill = document.createElement('span');
            mimePill.className = 'pill pill-mime';
            mimePill.style.cssText = `padding: 4px 8px; font-size: 0.85em; cursor: default; background-color: ${mime.color}; color: ${['TXT','BASE64'].includes(mime.type)?'#000':'#fff'};`;
            if(['JSON','JS','SVG'].includes(mime.type)) mimePill.style.color = '#000';
            mimePill.textContent = mime.type;
            mimePill.title = "Mime Type";
            brElements.push(mimePill);

            // 7. USER TAGS (Last inserted -> Leftmost in Row-Reverse)
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
                        renderTagsInModal(targetContainer);
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
                    renderTagsInModal(targetContainer);
                };
                brElements.push(pill);
            });

            // Append elements to the actual DOM container (No reverse -> User Tags on Right)
            brElements.forEach(el => brGroup.appendChild(el));

            // --- ADD NEW TAG INPUT (Overlay Mode Only) ---
            if (isOverlay) {
                const addPill = document.createElement('span');
                addPill.className = 'pill pill-user';
                addPill.title = "Add Tag";
                addPill.style.cssText = "padding: 0; cursor: text; border: none; background-color: #00e676 !important; color: #ffffff !important; display: inline-flex; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3); font-weight: bold;";
                
                const addInput = document.createElement('input');
                addInput.type = 'text';
                addInput.placeholder = '+ Tag';
                addInput.style.cssText = "background: transparent; border: none; color: inherit; font-family: inherit; font-size: 0.85em; width: 60px; outline: none; padding: 4px 8px; font-weight: bold;";
                
                const submitTag = () => {
                    const val = addInput.value.trim();
                    if (val && !currentTags.includes(val)) {
                        currentTags.push(val);
                        renderTagsInModal(targetContainer);
                        // Restore focus to new input for rapid entry
                        setTimeout(() => {
                            const newInputs = targetContainer.querySelectorAll('input[placeholder="+ Tag"]');
                            if(newInputs.length > 0) newInputs[0].focus();
                        }, 10);
                    }
                };

                addInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') submitTag();
                });
                addInput.addEventListener('blur', () => {
                    if (addInput.value.trim()) submitTag();
                });

                addPill.appendChild(addInput);
                brGroup.appendChild(addPill);
            }
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
        
        // Hide Cancel Button (X is enough)
        const btnCancelTags = document.getElementById('btn-cancel-tags-modal');
        if (btnCancelTags) btnCancelTags.style.display = 'none';

        // --- HELPER: Calculate Access Control ---
        function calculateAccessControl(owner, whitelists) {
            const rawAccess = [
                owner,
                ...(whitelists.read || []),
                ...(whitelists.update || []),
                ...(whitelists.delete || []),
                ...(whitelists.execute || [])
            ].filter(item => item && typeof item === 'string' && item.trim() !== "");
            return rawAccess.length > 0 ? [...new Set(rawAccess)] : ['*@*'];
        }

        // Save Tags (Persist & Increment)
        bind('btn-save-tags-modal', 'click', async () => {
            if (currentIsNew) {
                // Just close, keep tags in memory for the main Create action
                closeTagModal();
                return;
            }

            const btn = document.getElementById('btn-save-tags-modal');
            const originalText = btn.textContent;
            btn.textContent = "Saving...";
            btn.disabled = true;

            const urlParams = new URLSearchParams(window.location.search);
            const forceProd = urlParams.get('mode') === 'live';
            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);

            // FIX: Recalculate Access Control on Tag Save
            const newAccessControl = calculateAccessControl(currentOwner, currentWhitelists);

            try {
                if (isEmulator) {
                    console.log("🔧 Emulator Mode: Updating Tags via SDK directly.");
                    await updateDoc(doc(db, "kv-store", currentUpdateKey), {
                        user_tags: currentTags,
                        label: currentLabel,
                        owner: currentOwner,
                        access_control: newAccessControl, // WICHTIG: Update Access Control
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
                            access_control: { arrayValue: { values: newAccessControl.map(v => ({ stringValue: v })) } }, // WICHTIG
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
                renderTagsInModal(tagListContainer);
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

        // --- CREATE ACTION ---
        bind('btn-create-card', 'click', async () => {
            const btn = document.getElementById('btn-create-card');
            if (btn.dataset.justDragged === "true") return; // Prevent click after drag
            const originalText = btn.textContent;
            
            // Visual Feedback & Lock
            btn.textContent = "⏳";
            btn.style.cursor = "wait";
            btn.style.pointerEvents = "none";
            
            try {
                let isUnique = false;
                let newId = "";
                let attempts = 0;
                
                // Retry loop to ensure ID uniqueness
                while (!isUnique && attempts < 5) {
                    attempts++;
                    // Generate a 15-digit number: Timestamp (13 digits) + 2 Random digits
                    const rawId = `${Date.now()}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
                    newId = encodeOCR(rawId);
                    
                    try {
                        // Check if ID already exists in Firestore
                        const docSnap = await getDoc(doc(db, "kv-store", newId));
                        if (!docSnap.exists()) isUnique = true;
                        else await new Promise(r => setTimeout(r, 10)); // Wait 10ms before retry
                    } catch (err) {
                        // If permission denied (e.g. cannot read non-existent docs), assume unique to allow creation
                        if (err.code === 'permission-denied') {
                            console.warn("Permission denied checking ID uniqueness. Assuming unique.");
                            isUnique = true;
                        } else {
                            throw err;
                        }
                    }
                }
                
                openUpdateModal(newId, "", "New Card", null, true);
            } catch (e) {
                console.error("Error generating ID:", e);
                alert("Failed to generate unique ID: " + e.message);
            } finally {
                btn.textContent = originalText;
                btn.style.cursor = "pointer";
                btn.style.pointerEvents = "auto";
            }
        });

        // Save Action (POST to Make.com)
        // FIX: Listener robust anbinden (sucht nach neuer oder alter ID)
        const saveActionBtn = document.getElementById('btn-create-update') || document.getElementById('btn-save-update');
        if (saveActionBtn) {
            saveActionBtn.id = 'btn-create-update'; // ID standardisieren
            saveActionBtn.addEventListener('click', async () => {
            const key = currentUpdateKey;
            const newValue = updateEditor.value;
            const btn = document.getElementById('btn-create-update');
            const originalText = btn.textContent;

            btn.textContent = currentIsNew ? "⏳ Creating..." : "⏳ Saving...";
            btn.disabled = true;

            const urlParams = new URLSearchParams(window.location.search);
            const forceProd = urlParams.get('mode') === 'live';
            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);
            
            // --- CREATE LOGIC DETECTION ---
            const isNew = currentIsNew;
            const action = isNew ? "C" : "U";

            if (isNew) {
                // Defaults for New Card - Allow empty owner for Make.com debugging
                if (auth.currentUser) currentOwner = auth.currentUser.email;
                if (!currentTags.includes("data")) currentTags.push("data");
                if (!currentTags.includes("🛡️ D")) currentTags.push("🛡️ D");

                // --- AUTO-GENERATE FOLDER TAGS ---
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                const dateTagSuffix = `>${y}>${m}>${d}`;

                if (!currentTags.some(t => t.startsWith("Created>"))) currentTags.push(`Created${dateTagSuffix}`);
                if (!currentTags.some(t => t.startsWith("Last Read>"))) currentTags.push(`Last Read${dateTagSuffix}`);
                if (!currentTags.some(t => t.startsWith("Last Updated>"))) currentTags.push(`Last Updated${dateTagSuffix}`);
                if (!currentTags.some(t => t.startsWith("Last Executed>"))) currentTags.push(`Last Executed${dateTagSuffix}`);
                
                const sizeBytes = new Blob([newValue]).size;
                currentSize = sizeBytes > 1024 ? `${(sizeBytes/1024).toFixed(1)}KB` : `${sizeBytes}B`;
            }

            const uniqueAccessControl = calculateAccessControl(currentOwner, currentWhitelists);

            try {
                if (isEmulator) {
                    // --- EMULATOR: SDK Update ONLY (No Webhook) ---
                    console.log(`🔧 Emulator Mode: Action=${action} via SDK directly.`);
                    
                    const docData = {
                        value: newValue,
                        // Hinzugefügt, um Label und Owner aus dem Tag-Editor mit zu speichern
                        label: currentLabel,
                        owner: currentOwner,
                        access_control: uniqueAccessControl, // WICHTIG: Damit das Dokument in der Query gefunden wird
                        user_tags: currentTags, // Für Emulator direkt als Array
                        white_list_read: currentWhitelists.read,
                        white_list_update: currentWhitelists.update,
                        white_list_delete: currentWhitelists.delete,
                        white_list_execute: currentWhitelists.execute,
                        updates: isNew ? 0 : increment(1),
                        last_update_ts: isNew ? null : new Date().toISOString()
                    };

                    if (isNew) {
                        docData.created_at = new Date().toISOString();
                        docData.reads = 0;
                        docData.executes = 0;
                        docData.last_read_ts = null;
                        docData.last_execute_ts = null;
                        docData.size = currentSize;
                    } else if (currentSystemInfo.created_at) {
                        docData.created_at = currentSystemInfo.created_at;
                    }

                    await setDoc(doc(db, "kv-store", key), docData, { merge: true });
                } else {
                    // --- PRODUCTION: Webhook Update ---
                    const inputData = {
                        key: key,
                        label: currentLabel || "",
                        value: newValue,
                        owner: currentOwner || "",
                        size: currentSize || "0B",
                        user_tags: currentTags || [],
                        access_control: uniqueAccessControl,
                        white_list_read: currentWhitelists.read || [],
                        white_list_update: currentWhitelists.update || [],
                        white_list_delete: currentWhitelists.delete || [],
                        white_list_execute: currentWhitelists.execute || []
                    };

                    if (isNew) {
                        inputData.created_at = new Date().toISOString();
                        inputData.reads = 0;
                        inputData.updates = 0;
                        inputData.executes = 0;
                    } else {
                        inputData.created_at = currentSystemInfo.created_at;
                        inputData.reads = currentSystemInfo.reads || 0;
                        inputData.updates = (currentSystemInfo.updates || 0) + 1;
                        inputData.executes = currentSystemInfo.executes || 0;
                        inputData.last_read_ts = currentSystemInfo.last_read_ts;
                        inputData.last_execute_ts = currentSystemInfo.last_execute_ts;
                        inputData.last_update_ts = new Date().toISOString();
                    }

                    const payload = buildFirestoreCreatePayload(inputData);
                    payload.action = action;

                    const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
                    
                }

                closeUpdateModal(); // Close only on success

                if (isNew) {
                    console.log(`✅ New card ${key} created. Switching to Confluence view.`);
                    // A delay is needed for the database to become consistent, especially with webhooks.
                    const delay = isEmulator ? 100 : 1500;
                    setTimeout(() => locateDocumentInCloud(key), delay);
                } else {
                    // For a regular update, just refresh the current view.
                    const delay = isEmulator ? 100 : 1500;
                    setTimeout(() => fetchRealData(), delay);
                }
            } catch (e) {
                alert("Update failed: " + e.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
        }

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

        // --- TAG RULES MODAL LOGIC ---
        const rulesModal = document.getElementById('tag-rules-modal');
        const rulesContent = rulesModal ? rulesModal.querySelector('.modal-content') : null;
        
        document.addEventListener('open-tag-rules', () => {
            if (rulesModal) {
                rulesModal.classList.add('active');
                renderRulesEditor();
            }
        });

        bind('btn-close-rules-x', 'click', () => rulesModal.classList.remove('active'));

        function renderRulesEditor() {
            const rules = getTagRules();
            const renderList = (listId, items) => {
                const container = document.getElementById(listId);
                container.innerHTML = '';
                items.forEach((rule, idx) => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.gap = '10px';
                    
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = rule;
                    input.style.cssText = "flex: 1; background: rgba(0,0,0,0.3); border: 1px solid #444; color: #eee; padding: 4px; font-family: monospace;";
                    
                    const delBtn = document.createElement('button');
                    delBtn.textContent = '✕';
                    delBtn.style.cssText = "background: #442222; border: 1px solid #663333; color: #ffaaaa; cursor: pointer;";
                    delBtn.onclick = () => {
                        items.splice(idx, 1);
                        renderRulesEditor(); // Re-render to update indices
                    };
                    
                    row.appendChild(input);
                    row.appendChild(delBtn);
                    container.appendChild(row);
                });
            };
            
            renderList('folder-rules-list', rules.folder || []);
            renderList('hidden-rules-list', rules.hidden || []);
        }

        bind('btn-add-folder-rule', 'click', () => {
            const rules = getTagRules();
            if (!rules.folder) rules.folder = [];
            rules.folder.push("");
            renderRulesEditor();
        });

        bind('btn-add-hidden-rule', 'click', () => {
            const rules = getTagRules();
            if (!rules.hidden) rules.hidden = [];
            rules.hidden.push("");
            renderRulesEditor();
        });

        bind('btn-save-rules', 'click', () => {
            const getValues = (listId) => {
                const inputs = document.querySelectorAll(`#${listId} input`);
                return Array.from(inputs).map(i => i.value).filter(v => v.trim() !== "");
            };
            
            const newRules = {
                folder: getValues('folder-rules-list'),
                hidden: getValues('hidden-rules-list')
            };
            
            setTagRules(newRules);
            rulesModal.classList.remove('active');
            fetchRealData(); // Refresh UI to apply new rules
            refreshTagCloud(db); // Refresh Cloud
        });

        // Rules Modal Transparency
        let rulesTransLevel = 0;
        bind('btn-toggle-rules-transparency', 'click', () => {
            rulesTransLevel = (rulesTransLevel + 1) % 3;
            rulesContent.classList.remove('tag-modal-trans-1', 'tag-modal-trans-2');
            const btn = document.getElementById('btn-toggle-rules-transparency');
            
            if (rulesTransLevel === 1) {
                rulesContent.classList.add('tag-modal-trans-1');
                btn.style.opacity = "1";
            } else if (rulesTransLevel === 2) {
                rulesContent.classList.add('tag-modal-trans-2');
                btn.style.opacity = "0.5";
            } else {
                btn.style.opacity = "0.8";
            }
        });

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

        // --- DRAG LOGIC FOR RULES MODAL ---
        if (rulesContent) {
            const handle = rulesContent.querySelector('.modal-drag-handle');
            if (handle) {
                handle.style.cursor = 'move';
                let isDraggingRules = false;
                let startX, startY, startTransX, startTransY;
                handle.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.close-x') || e.target.closest('#btn-toggle-rules-transparency')) return;
                    e.preventDefault(); isDraggingRules = true; startX = e.clientX; startY = e.clientY;
                    const style = window.getComputedStyle(rulesContent); const matrix = new WebKitCSSMatrix(style.transform);
                    startTransX = matrix.m41; startTransY = matrix.m42;
                    document.addEventListener('mousemove', onMouseMoveRules); document.addEventListener('mouseup', onMouseUpRules);
                });
                function onMouseMoveRules(e) {
                    if (!isDraggingRules) return;
                    const dx = e.clientX - startX; const dy = e.clientY - startY;
                    rulesContent.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
                }
                function onMouseUpRules() { isDraggingRules = false; document.removeEventListener('mousemove', onMouseMoveRules); document.removeEventListener('mouseup', onMouseUpRules); }
            }
        }

        // Global Message Listener (e.g. for Fullscreen from IFrame)
        window.addEventListener('message', (e) => {
            if (e.data === 'toggle-fullscreen') {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => console.log(err));
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
            }
        });

        // --- GLOBAL MESSAGE LISTENER FOR IFRAME COMMUNICATION ---
        // Handles save requests from sandboxed apps (e.g., Markdown Studio in Emulator mode)
        window.addEventListener('message', async (event) => {
            // Basic security: check for expected data structure
            if (event.data && event.data.type === 'CRUDX_SAVE') {
                const payload = event.data.payload;
                console.log('📬 Received save request from IFrame:', payload);

                if (!payload || !payload.key) {
                    console.error("❌ IFrame save failed: Payload is missing a key.");
                    return;
                }

                try {
                    // Reconstruct the data to be saved, similar to the Update Modal
                    const dataToSave = {
                        value: payload.value,
                        label: payload.label,
                        owner: payload.owner,
                        user_tags: payload.user_tags?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_read: payload.white_list_read?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_update: payload.white_list_update?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_delete: payload.white_list_delete?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_execute: payload.white_list_execute?.arrayValue?.values?.map(v => v.stringValue) || [],
                        updates: increment(1),
                        last_update_ts: new Date().toISOString()
                    };
                    await updateDoc(doc(db, "kv-store", payload.key), dataToSave);
                    console.log(`✅ IFrame save for [${payload.key}] successful!`);
                } catch (e) {
                    console.error(`❌ IFrame save for [${payload.key}] failed:`, e);
                }
            }
        });

        // Global ESC Key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                const isConfluenceMode = document.body.classList.contains('ftc-docked') && 
                                         document.body.classList.contains('layout-grid-1');
                if (isConfluenceMode) {
                    e.preventDefault();
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(err => console.log(err));
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen();
                    }
                }
            }

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

        // Initialisiert die Floating Tag Cloud
        initTagCloud(db);

        // --- AUTO-LAUNCHER FOR CONFLUENCE MODE (1x1) ---
        // Watches the grid and automatically upgrades Markdown cards to Secure Apps
        const gridObserver = new MutationObserver(async (mutations) => {
            const gridSelect = document.getElementById('grid-select');
            // Only active in 1x1 mode
            if (gridSelect && gridSelect.value === '1') {
                const card = document.querySelector('.card-kv');
                // Check if it's a Markdown card that hasn't been upgraded yet
                if (card && card.dataset.mime === 'MD' && !card.dataset.appLoaded) {
                    card.dataset.appLoaded = "true"; // Mark as processing to prevent loops
                    
                    const key = card.querySelector('.pill-key')?.textContent.trim();
                    if (key) {
                        try {
                            const docSnap = await getDoc(doc(db, "kv-store", key));
                            if (docSnap.exists()) {
                                const { blob, contextData } = await generateSecureAppBlob(key, docSnap.data()) || {};
                                if (blob) {
                                    let blobUrl = URL.createObjectURL(blob);
                                    if (contextData) {
                                        blobUrl += `#ctx=${encodeURIComponent(JSON.stringify(contextData))}`;
                                        console.log("🔗 Attached Context to Blob URL");
                                    }
                                    const valueLayer = card.querySelector('.value-layer');
                                    if (valueLayer) {
                                        valueLayer.innerHTML = `<iframe src="${blobUrl}" style="width:100%; height:100%; border:none;" id="editor-frame"></iframe>`;
                                        console.log("✅ Confluence Mode: Auto-Upgraded to Secure App.");
                                    }
                                }
                            }
                        } catch(e) { console.error("Auto-Launch failed", e); }
                    }
                }
            }
        });
        gridObserver.observe(document.getElementById('data-container'), { childList: true, subtree: true });

    } catch (e) {
        console.error("🔥 FATAL:", e);
    }
});