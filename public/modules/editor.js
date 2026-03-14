import { db, auth } from './firebase.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { detectMimetype } from './mime.js';
import { fetchRealData } from './pagination.js';
import { locateDocumentInCloud, refreshTagCloud } from './tagscanner.js';
import { buildFirestoreCreatePayload, getEmailWarning, encodeOCR, calculateAccessControl, setupModalDrag } from './utils.js';
import { getTagRules } from './tag-state.js';
import { initSecurityManager, openWhitelistEditor, closeWhitelistModal, handleSaveWhitelistEntry } from './security-manager.js';
import { openTagModal, closeTagModal, addNewTag, handleSaveTags, renderTagsInModal, syncTagManagerState, getTagManagerState } from './tag-manager.js';
import { initRulesManager } from './rules-manager.js';

// --- GLOBAL EDITOR STATE ---
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
let originalDocData = null;
let editingOrigin = null;

export function initEditor() {
    initSecurityManager();
    initRulesManager();
    // --- INIT CREATE FAB ---
    const btnCreate = document.getElementById('btn-create-card');
    if (btnCreate) {
        btnCreate.addEventListener('click', async () => {
            if (btnCreate.dataset.justDragged === "true") return; // Prevent click after drag
            const originalText = btnCreate.textContent;
            
            btnCreate.textContent = "⏳";
            btnCreate.style.cursor = "wait";
            btnCreate.style.pointerEvents = "none";
            
            try {
                let isUnique = false;
                let newId = "";
                let attempts = 0;
                while (!isUnique && attempts < 5) {
                    attempts++;
                    const rawId = `${Date.now()}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
                    newId = encodeOCR(rawId);
                    try {
                        const docSnap = await getDoc(doc(db, "kv-store", newId));
                        if (!docSnap.exists()) isUnique = true;
                        else await new Promise(r => setTimeout(r, 10));
                    } catch (err) {
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
                btnCreate.textContent = originalText;
                btnCreate.style.cursor = "pointer";
                btnCreate.style.pointerEvents = "auto";
            }
        });
    }

    // --- INIT UPDATE MODAL BUTTONS ---
    const btnCloseUpdate = document.getElementById('btn-close-update-x');
    if (btnCloseUpdate) btnCloseUpdate.addEventListener('click', closeUpdateModal);

    const btnBeautify = document.getElementById('btn-beautify');
    if (btnBeautify) {
        btnBeautify.addEventListener('click', () => {
            try {
                const updateEditor = document.getElementById('update-editor');
                const val = updateEditor.value;
                const json = JSON.parse(val);
                updateEditor.value = JSON.stringify(json, null, 4);
            } catch (e) {
                alert("Invalid JSON, cannot beautify.");
            }
        });
    }

    const btnTransparency = document.getElementById('btn-toggle-transparency');
    if (btnTransparency) {
        let transLevel = 0;
        btnTransparency.addEventListener('click', () => {
            const updateEditor = document.getElementById('update-editor');
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
    }

    const btnEditTags = document.getElementById('btn-edit-tags');
    if (btnEditTags) {
        btnEditTags.addEventListener('click', () => {
            const labelDisplay = document.getElementById('update-label-display');
            openTagModal(currentUpdateKey, labelDisplay ? labelDisplay.textContent : "");
        });
    }

    const saveActionBtn = document.getElementById('btn-create-update') || document.getElementById('btn-save-update');
    if (saveActionBtn) {
        saveActionBtn.id = 'btn-create-update';
        saveActionBtn.addEventListener('click', handleSaveAction);
    }

    // --- INIT TAG MODAL BUTTONS ---
    const btnCloseTags = document.getElementById('btn-close-tags-modal-x');
    if (btnCloseTags) btnCloseTags.addEventListener('click', closeTagModal);
    
    const btnCancelTags = document.getElementById('btn-cancel-tags-modal');
    if (btnCancelTags) {
        btnCancelTags.style.display = 'none';
        btnCancelTags.addEventListener('click', closeTagModal);
    }

    const btnSaveTags = document.getElementById('btn-save-tags-modal');
    if (btnSaveTags) btnSaveTags.addEventListener('click', handleSaveTags);

    const btnTagTrans = document.getElementById('btn-toggle-tags-transparency');
    if (btnTagTrans) {
        let tagTransLevel = 0;
        btnTagTrans.addEventListener('click', () => {
            const tagModal = document.getElementById('tag-modal');
            const tagModalContent = tagModal.querySelector('.modal-content');
            tagTransLevel = (tagTransLevel + 1) % 3;
            tagModalContent.classList.remove('tag-modal-trans-1', 'tag-modal-trans-2');
            if (tagTransLevel === 1) {
                tagModalContent.classList.add('tag-modal-trans-1');
                btnTagTrans.style.opacity = "1";
            } else if (tagTransLevel === 2) {
                tagModalContent.classList.add('tag-modal-trans-2');
                btnTagTrans.style.opacity = "0.5";
            } else {
                btnTagTrans.style.opacity = "0.8";
            }
        });
    }

    // --- INIT WHITELIST MODAL ---
    const btnCloseWl = document.getElementById('btn-close-whitelist-x');
    if (btnCloseWl) btnCloseWl.addEventListener('click', closeWhitelistModal);
    
    const btnWlDone = document.getElementById('btn-whitelist-done');
    if (btnWlDone) btnWlDone.addEventListener('click', closeWhitelistModal);

    const btnSaveWl = document.getElementById('btn-save-whitelist');
    if (btnSaveWl) btnSaveWl.addEventListener('click', () => handleSaveWhitelistEntry(editingOrigin));

    const btnWlTrans = document.getElementById('btn-toggle-wl-transparency');
    if (btnWlTrans) {
        let wlTransLevel = 0;
        btnWlTrans.addEventListener('click', () => {
            const wlModal = document.getElementById('whitelist-modal');
            const wlContent = wlModal.querySelector('.modal-content');
            wlTransLevel = (wlTransLevel + 1) % 3;
            wlContent.classList.remove('tag-modal-trans-1', 'tag-modal-trans-2');
            if (wlTransLevel === 1) {
                wlContent.classList.add('tag-modal-trans-1');
                btnWlTrans.style.opacity = "1";
            } else if (wlTransLevel === 2) {
                wlContent.classList.add('tag-modal-trans-2');
                btnWlTrans.style.opacity = "0.5";
            } else {
                btnWlTrans.style.opacity = "0.8";
            }
        });
    }

    const btnCloseRules = document.getElementById('btn-close-rules-x');
    if (btnCloseRules) btnCloseRules.addEventListener('click', () => {
        document.getElementById('tag-rules-modal').classList.remove('active');
    });

    const btnRulesTrans = document.getElementById('btn-toggle-rules-transparency');
    if (btnRulesTrans) {
        let rulesTransLevel = 0;
        btnRulesTrans.addEventListener('click', () => {
            const rulesModal = document.getElementById('tag-rules-modal');
            const rulesContent = rulesModal.querySelector('.modal-content');
            rulesTransLevel = (rulesTransLevel + 1) % 3;
            rulesContent.classList.remove('tag-modal-trans-1', 'tag-modal-trans-2');
            if (rulesTransLevel === 1) {
                rulesContent.classList.add('tag-modal-trans-1');
                btnRulesTrans.style.opacity = "1";
            } else if (rulesTransLevel === 2) {
                rulesContent.classList.add('tag-modal-trans-2');
                btnRulesTrans.style.opacity = "0.5";
            } else {
                btnRulesTrans.style.opacity = "0.8";
            }
        });
    }

    // --- DRAG HANDLERS ---
    setupModalDrag('update-modal');
    setupModalDrag('tag-modal');
    setupModalDrag('whitelist-modal');
    setupModalDrag('iframe-modal');
    setupModalDrag('tag-rules-modal');

    // Global ESC handler for these modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const updateModal = document.getElementById('update-modal');
            const tagModal = document.getElementById('tag-modal');
            if (tagModal && tagModal.classList.contains('active')) closeTagModal();
            else if (updateModal && updateModal.classList.contains('active')) closeUpdateModal();
            
            const wlModal = document.getElementById('whitelist-modal');
            if (wlModal && wlModal.style.display === 'block') wlModal.style.display = 'none';
            
            const rulesModal = document.getElementById('tag-rules-modal');
            if (rulesModal && rulesModal.classList.contains('active')) rulesModal.classList.remove('active');
        }
    });
}

// --- CORE EDITOR FUNCTIONS ---

export function openUpdateModal(key, value, label, cardElement, isNew = false) {
    const updateModal = document.getElementById('update-modal');
    const updateEditor = document.getElementById('update-editor');
    const updateLabelDisplay = document.getElementById('update-label-display');
    const updateMimeDisplay = document.getElementById('update-mime-display');
    const btnBeautify = document.getElementById('btn-beautify');
    
    if (!updateModal) return;
    currentUpdateKey = key;
    currentIsNew = isNew;

    if (value !== null) {
        updateEditor.value = value;
    } else {
        updateEditor.value = ""; 
        updateEditor.placeholder = "Loading content...";
    }
    
    currentLabel = label || "";
    currentTags = []; 
    currentWhitelists = { read: [], update: [], delete: [], execute: [] }; 
    currentOwner = "";
    currentSystemInfo = {};
    originalDocData = null;

    if (isNew) {
        if (auth.currentUser) currentOwner = auth.currentUser.email;
        if (!currentTags.includes("data")) currentTags.push("data");
        if (!currentTags.includes("🛡️ D")) currentTags.push("🛡️ D");

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const dateTagSuffix = `>${y}>${m}>${d}`;

        if (!currentTags.some(t => t.startsWith("Created>"))) currentTags.push(`Created${dateTagSuffix}`);
        currentSystemInfo = { created_at: now.toISOString(), reads: 0, updates: 0, executes: 0 };
        syncTagManagerState({ key: key, label: currentLabel || "New Card", tags: [...currentTags], owner: currentOwner, whitelists: {...currentWhitelists}, systemInfo: {...currentSystemInfo}, value: "" });
    }
    
    getDoc(doc(db, "kv-store", key)).then(snap => {
        if (snap.exists()) {
            const d = snap.data();
            originalDocData = d;
            currentLabel = d.label || ""; 
            currentTags = d.user_tags || [];
            currentOwner = d.owner || "";
            currentWhitelists = {
                read: d.white_list_read || [],
                update: d.white_list_update || [],
                delete: d.white_list_delete || [],
                execute: d.white_list_execute || []
            };

            if (value === null && d.value !== undefined) {
                updateEditor.value = d.value;
                const mime = detectMimetype(d.value);
                updateMimeDisplay.textContent = mime.type;
                updateMimeDisplay.style.backgroundColor = mime.color;
                updateMimeDisplay.style.color = (mime.type === 'TXT' || mime.type === 'BASE64') ? '#000' : '#fff';
                if (mime.type === 'JSON' || mime.type === 'JS' || mime.type === 'SVG') updateMimeDisplay.style.color = '#000';
                btnBeautify.style.display = (mime.type === 'JSON') ? 'inline-block' : 'none';
            }
            // Synchronisiere alle geladenen Daten mit dem Tag-Manager
            syncTagManagerState({ key: key, label: currentLabel, tags: [...currentTags], owner: currentOwner, whitelists: {...currentWhitelists}, systemInfo: {...currentSystemInfo}, value: d.value });
        }
    });

    if (currentHighlightedCard) currentHighlightedCard.classList.remove('card-highlight');
    if (cardElement) {
        currentHighlightedCard = cardElement;
        currentHighlightedCard.classList.add('card-highlight');
    }
    
    updateLabelDisplay.textContent = label || key;
    updateLabelDisplay.title = `CRUDX-ID: ${key}`;
    
    const btnEditTags = document.getElementById('btn-edit-tags');
    const tagEditorContainer = document.getElementById('update-modal-tag-editor');

    // Ensure wrapper exists
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
    if (!tagEditorContainer && wrapper) {
        const div = document.createElement('div');
        div.id = 'update-modal-tag-editor';
        div.style.display = 'none';
        wrapper.appendChild(div);
    }

    if (isNew) {
        const overlay = document.getElementById('update-modal-tag-editor');
        if (overlay) {
            overlay.style.display = 'block';
            renderTagsInModal(overlay);
        }
        if (btnEditTags) btnEditTags.style.display = 'none';
        updateEditor.style.paddingTop = '50px';
        updateEditor.style.paddingBottom = '50px';
    } else {
        if (document.getElementById('update-modal-tag-editor')) document.getElementById('update-modal-tag-editor').style.display = 'none';
        if (btnEditTags) btnEditTags.style.display = 'inline-block';
        updateEditor.style.paddingTop = '15px';
        updateEditor.style.paddingBottom = '15px';
    }

    if (btnEditTags) {
        btnEditTags.textContent = currentIsNew ? "Prepare Tags" : "Tags";
        btnEditTags.title = "Maintain Tags";
    }

    let btn = document.getElementById('btn-create-update');
    if (btn) {
        if (currentIsNew) {
            btn.textContent = "CREATE";
            btn.title = "Create new Card";
            btn.style.backgroundColor = "#00e676";
            btn.style.setProperty('color', '#000000', 'important');
        } else {
            btn.textContent = "UPDATE";
            btn.title = "UPDATE Content";
            btn.style.backgroundColor = "#ff9100";
            btn.style.setProperty('color', '#000000', 'important');
        }
    }

    updateEditor.style.display = 'block';
    
    if (value !== null) {
        const mime = detectMimetype(value);
        updateMimeDisplay.textContent = mime.type;
        updateMimeDisplay.style.backgroundColor = mime.color;
        updateMimeDisplay.style.color = (mime.type === 'TXT' || mime.type === 'BASE64') ? '#000' : '#fff';
        if (mime.type === 'JSON' || mime.type === 'JS' || mime.type === 'SVG') updateMimeDisplay.style.color = '#000';
        btnBeautify.style.display = (mime.type === 'JSON') ? 'inline-block' : 'none';
    } else {
        updateMimeDisplay.textContent = "...";
        updateMimeDisplay.style.backgroundColor = "#555";
    }

    updateModal.classList.add('active');
    updateEditor.focus();
}

export function closeUpdateModal() {
    const updateModal = document.getElementById('update-modal');
    if (updateModal) updateModal.classList.remove('active');
    if (currentHighlightedCard) currentHighlightedCard.classList.remove('card-highlight');
    currentHighlightedCard = null;
}

async function handleSaveAction() {
    const updateEditor = document.getElementById('update-editor');
    const key = currentUpdateKey;
    const newValue = updateEditor.value;

    // --- CRITICAL SYNC: Fetch latest metadata from Tag Manager ---
    const tagState = getTagManagerState();
    currentLabel = tagState.label;
    currentTags = tagState.tags;
    currentOwner = tagState.owner;
    currentWhitelists = tagState.whitelists;

    if (currentIsNew && (!newValue || newValue.trim() === "")) {
        alert("Request rejected: This is a Key-Value Store - If there is no value given your request is rejected - please provide a value.");
        return;
    }

    const btn = document.getElementById('btn-create-update');
    const originalText = btn.textContent;
    btn.textContent = currentIsNew ? "⏳ Creating..." : "⏳ Saving...";
    btn.disabled = true;

    const urlParams = new URLSearchParams(window.location.search);
    const forceProd = urlParams.get('mode') === 'live';
    const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    
    const isNew = currentIsNew;
    const action = isNew ? "C" : "U";

    // Größe neu berechnen falls Wert geändert
    const sizeBytes = new Blob([newValue]).size;
    currentSize = sizeBytes > 1024 ? `${(sizeBytes/1024).toFixed(1)}KB` : `${sizeBytes}B`;

    const uniqueAccessControl = calculateAccessControl(currentOwner, currentWhitelists);

    try {
        if (isEmulator) {
            console.log(`🔧 Emulator Mode: Action=${action} via SDK directly.`);
            const docData = {
                value: newValue,
                label: currentLabel,
                owner: currentOwner,
                access_control: uniqueAccessControl,
                user_tags: currentTags,
                white_list_read: currentWhitelists.read,
                white_list_update: currentWhitelists.update,
                white_list_delete: currentWhitelists.delete,
                white_list_execute: currentWhitelists.execute,
                updates: isNew ? 0 : increment(1),
                last_update_ts: new Date().toISOString()
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

            // Delta-Logik entfernt: Immer das volle Objekt senden, um Datenverlust
            // bei einfachen Webhook-Integrationen zu vermeiden.
            const payload = buildFirestoreCreatePayload(inputData);
            payload.action = action;
            const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
        }

        closeUpdateModal();
        if (isNew) {
            console.log(`✅ New card ${key} created. Switching to Confluence view.`);
            const delay = isEmulator ? 100 : 1500;
            setTimeout(() => locateDocumentInCloud(key), delay);
        } else {
            const delay = isEmulator ? 100 : 1500;
            setTimeout(() => fetchRealData(), delay);
            setTimeout(() => refreshTagCloud(true), delay); // Cache leeren und neu laden
        }
    } catch (e) {
        alert("Update failed: " + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}