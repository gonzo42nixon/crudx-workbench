import { db, auth } from './firebase.js';
import { getDoc, doc, updateDoc, deleteDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml } from './ui.js';
import { detectMimetype } from './mime.js';
import { createExecutionWindow, generateSecureAppBlob } from './launcher.js';
import { fetchRealData, applyLayout, unsubscribeListener } from './pagination.js';
import { locateDocumentInCloud, resetTagCloud, refreshTagCloud, updateTagCloudSelection } from './tagscanner.js';

export function initCardActions(dataContainer, openUpdateModal, openTagModal) {
    if (!dataContainer) return;

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
                // Skip generic confirmation for Delete, as it has a specific one later
                if (action !== 'D') {
                    if (!confirm("Do you really want to perform this action?")) {
                        return;
                    }
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

                // Call the callback provided by app.js
                if (openUpdateModal) {
                    openUpdateModal(key, currentValue, label, card, false);
                }
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
                    unsubscribeListener();

                    if (isEmulator) {
                        console.log(`🔧 Emulator Mode: Deleting "${key}" via SDK.`);
                        deleteDoc(doc(db, "kv-store", key))
                            .then(() => {
                                console.log(`✅ Document "${key}" deleted.`);
                                const gridSelect = document.getElementById('grid-select');
                                const searchInput = document.getElementById('main-search');
                                
                                if (gridSelect && gridSelect.value === '1') {
                                    console.log("Single document view deletion detected. Switching to list view.");
                                    searchInput.value = ''; 
                                    applyLayout('list', false, true);
                                    setTimeout(() => fetchRealData(true), 50);
                                    resetTagCloud(); 
                                } else {
                                    fetchRealData();
                                }
                                refreshTagCloud(db, true);
                            })
                            .catch(err => alert("Delete failed: " + err.message));
                    } else {
                        fetch(url)
                            .then(res => {
                                if (res.ok) {
                                    console.log(`✅ Document "${key}" deleted via Webhook.`);
                                    // Wait for webhook to process, then refresh UI with correct logic
                                    setTimeout(() => {
                                        const gridSelect = document.getElementById('grid-select');
                                        const searchInput = document.getElementById('main-search');
                                        if (gridSelect && gridSelect.value === '1') {
                                            console.log("Single document view deletion detected. Switching to list view.");
                                            searchInput.value = ''; 
                                            applyLayout('list', false, true);
                                            setTimeout(() => fetchRealData(true), 50); // Small delay for UI to clear
                                            resetTagCloud();
                                        } else {
                                            fetchRealData();
                                        }
                                        refreshTagCloud(db, true);
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
        
        // --- Helper to extract card data ---
        const getCardData = (element) => {
            const card = element.closest('.card-kv');
            if (!card) return null;
            const key = card.querySelector('.pill-key')?.textContent.trim();
            const label = card.querySelector('.pill-label')?.textContent.trim();
            const valueLayer = card.querySelector('.value-layer');
            
            let currentValue = null;
            // Try to get content from IFrame editors (e.g. Markdown Studio)
            const iframe = valueLayer ? valueLayer.querySelector('iframe') : null;
            if (iframe) {
                try {
                    const iframeEditor = iframe.contentWindow.document.getElementById('editor');
                    if (iframeEditor) currentValue = iframeEditor.value;
                } catch (e) { /* ignore cross-origin */ }
            }

            return { card, key, label, currentValue };
        };

        // 2. Value Layer Click (Open Update Modal)
        const valueLayer = e.target.closest('.value-layer');
        if (valueLayer) {
            const data = getCardData(valueLayer);
            if (data && openUpdateModal) {
                // Check for execution window content priority
                const execWindow = document.querySelector(`.execution-window[data-key="${data.key}"]`);
                if (execWindow) {
                    try {
                        const iframe = execWindow.querySelector('iframe');
                        if (iframe && iframe.contentWindow.document.getElementById('editor')) {
                            data.currentValue = iframe.contentWindow.document.getElementById('editor').value;
                        }
                    } catch (e) {}
                }
                openUpdateModal(data.key, data.currentValue, data.label, data.card, false);
            }
            return;
        }

        // 3. Label Pill Click (Switch to Confluence Mode / 1x1 View)
        const labelPill = e.target.closest('.pill-label');
        if (labelPill) {
            const data = getCardData(labelPill);
            if (data && data.key) {
                document.body.classList.remove('no-app-view'); // App-View erlauben (falls MD)
                locateDocumentInCloud(data.key);
            }
            return;
        }

        // 4. Key Pill Click (Switch to Confluence Mode / 1x1 Raw View)
        const keyPill = e.target.closest('.pill-key');
        if (keyPill) {
            const data = getCardData(keyPill);
            if (data && data.key) {
                document.body.classList.add('no-app-view'); // App-View unterdrücken (Raw Mode)
                locateDocumentInCloud(data.key);
            }
            return;
        }
    });
}