import { db, auth } from './firebase.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { detectMimetype } from './mime.js';
import { fetchRealData } from './pagination.js';
import { locateDocumentInCloud, refreshTagCloud } from './tagscanner.js';
import { buildFirestoreCreatePayload, getEmailWarning, encodeOCR } from './utils.js';
import { getTagRules, setTagRules } from './tag-state.js';

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

// Whitelist state
let currentWhitelistDocId = null;
let currentWhitelistField = null;
let currentWhitelistItems = [];
let editingOrigin = null;

export function initEditor() {
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

    const btnAddTag = document.getElementById('btn-add-new-tag');
    if (btnAddTag) btnAddTag.addEventListener('click', addNewTag);

    const newTagInput = document.getElementById('new-tag-input');
    if (newTagInput) {
        newTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addNewTag();
        });
    }

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
    if (btnSaveWl) btnSaveWl.addEventListener('click', handleSaveWhitelist);

    const wlInput = document.getElementById('whitelist-input');
    if (wlInput) {
        wlInput.addEventListener('input', () => {
            const val = wlInput.value.trim();
            const warning = getEmailWarning(val);
            const box = document.getElementById('whitelist-warning');
            const text = document.getElementById('whitelist-warning-text');
            if (warning) {
                text.textContent = warning;
                box.classList.add('visible');
            } else {
                box.classList.remove('visible');
            }
        });
    }

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

    // --- INIT RULES MODAL ---
    // Event listener for opening is in app.js via dispatchEvent or card-actions
    // Here we handle the logic inside the modal
    document.addEventListener('open-tag-rules', () => {
        const rulesModal = document.getElementById('tag-rules-modal');
        if (rulesModal) {
            rulesModal.classList.add('active');
            renderRulesEditor();
        }
    });

    const btnCloseRules = document.getElementById('btn-close-rules-x');
    if (btnCloseRules) btnCloseRules.addEventListener('click', () => {
        document.getElementById('tag-rules-modal').classList.remove('active');
    });

    const btnAddFolderRule = document.getElementById('btn-add-folder-rule');
    if (btnAddFolderRule) btnAddFolderRule.addEventListener('click', () => {
        const rules = getTagRules();
        if (!rules.folder) rules.folder = [];
        rules.folder.push("");
        renderRulesEditor();
    });

    const btnAddHiddenRule = document.getElementById('btn-add-hidden-rule');
    if (btnAddHiddenRule) btnAddHiddenRule.addEventListener('click', () => {
        const rules = getTagRules();
        if (!rules.hidden) rules.hidden = [];
        rules.hidden.push("");
        renderRulesEditor();
    });

    const btnSaveRules = document.getElementById('btn-save-rules');
    if (btnSaveRules) btnSaveRules.addEventListener('click', () => {
        const getValues = (listId) => {
            const inputs = document.querySelectorAll(`#${listId} input`);
            return Array.from(inputs).map(i => i.value).filter(v => v.trim() !== "");
        };
        const newRules = {
            folder: getValues('folder-rules-list'),
            hidden: getValues('hidden-rules-list')
        };
        setTagRules(newRules);
        document.getElementById('tag-rules-modal').classList.remove('active');
        fetchRealData(); 
        refreshTagCloud(db); 
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
    setupModalDrag('whitelist-modal'); // Need to target inner content
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
        if (document.getElementById('update-modal-tag-editor')) {
            document.getElementById('update-modal-tag-editor').style.display = 'block';
            renderTagsInModal(document.getElementById('update-modal-tag-editor'));
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

export function openTagModal(key, label) {
    const tagModal = document.getElementById('tag-modal');
    const tagModalContent = tagModal.querySelector('.modal-content');
    const updateModalContent = document.querySelector('#update-modal .modal-content');
    const tagListContainer = document.getElementById('tag-list-container');
    const tagModalTitle = document.getElementById('tag-modal-title');

    if (!tagModal) return;
    
    if (updateModalContent && tagModalContent) {
        tagModalContent.style.width = updateModalContent.style.width || getComputedStyle(updateModalContent).width;
        tagModalContent.style.height = updateModalContent.style.height || getComputedStyle(updateModalContent).height;
        tagModalContent.style.transform = updateModalContent.style.transform;
    }

    if (tagModalTitle) {
        tagModalTitle.title = `Key: ${key}\nLabel: ${label}`;
    }

    const btnSave = document.getElementById('btn-save-tags-modal');
    if (btnSave && btnSave.parentElement) {
        btnSave.parentElement.style.justifyContent = 'flex-end';
    }

    if (currentIsNew) {
        if (btnSave) {
            btnSave.textContent = "Done";
            btnSave.style.backgroundColor = "#00e676"; 
            btnSave.style.color = "#000000";
        }
        renderTagsInModal(tagListContainer);
    } else {
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

export function closeTagModal() {
    const tagModal = document.getElementById('tag-modal');
    if (tagModal) tagModal.classList.remove('active');
}

function renderTagsInModal(targetContainer) {
    if (!targetContainer) return;
    targetContainer.innerHTML = '';
    
    const isOverlay = (targetContainer.id === 'update-modal-tag-editor');

    if (isOverlay) {
        targetContainer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20;";
    } else {
        targetContainer.style.cssText = "position: relative; flex: 1; width: 100%; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; padding: 5px; justify-content: space-between;";
    }

    const tlGroup = document.createElement('div');
    tlGroup.className = 'tl-group';
    
    if (!isOverlay) {
        tlGroup.style.position = 'relative';
        tlGroup.style.top = 'auto';
        tlGroup.style.left = 'auto';
        tlGroup.style.width = '100%';
        tlGroup.style.marginBottom = '10px';
    }

    const brGroup = document.createElement('div');
    brGroup.className = 'br-group';
    
    if (!isOverlay) {
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

    targetContainer.appendChild(tlGroup);
    targetContainer.appendChild(brGroup);
    
    // KEY PILL
    const keyPill = document.createElement('span');
    keyPill.className = 'pill pill-key';
    keyPill.textContent = currentUpdateKey;
    keyPill.title = "Key";
    keyPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
    tlGroup.appendChild(keyPill);

    // LABEL PILL
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
                    currentLabel = newVal;
                    const updateLabelDisplay = document.getElementById('update-label-display');
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

    const brElements = [];
    const createSysPill = (text, colorStyle, tooltip = "", clickCallback = null) => {
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

    const fmt = (ts) => {
        if (!ts) return '';
        if (typeof ts === 'string') return ts.split('T')[0];
        if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate().toISOString().split('T')[0];
        return String(ts);
    };

    const styleBlue = "border: 1px solid #2979ff; color: #2979ff; background: rgba(41, 121, 255, 0.1);";
    const styleGreen = "border: 1px solid #00e676; color: #00e676; background: rgba(0, 230, 118, 0.1);";
    const styleOrange = "border: 1px solid #ff9100; color: #ff9100; background: rgba(255, 145, 0, 0.1);";
    const styleRed = "border: 1px solid #ff1744; color: #ff1744; background: rgba(255, 23, 68, 0.1);";
    const styleBlack = "border: 1px solid #555; color: #eee; background: #000;";

    if (currentSystemInfo.created_at) createSysPill(`C: ${fmt(currentSystemInfo.created_at)}`, styleBlue, `Created: ${currentSystemInfo.created_at}`);
    if (currentSystemInfo.last_read_ts) createSysPill(`R: ${fmt(currentSystemInfo.last_read_ts)}`, styleGreen, `Last Read: ${currentSystemInfo.last_read_ts}`);
    if (currentSystemInfo.last_update_ts) createSysPill(`U: ${fmt(currentSystemInfo.last_update_ts)}`, styleOrange, `Last Update: ${currentSystemInfo.last_update_ts}`);
    if (currentSystemInfo.last_execute_ts) createSysPill(`X: ${fmt(currentSystemInfo.last_execute_ts)}`, styleBlack, `Last Execute: ${currentSystemInfo.last_execute_ts}`);

    createSysPill(`R: ${currentSystemInfo.reads || 0}`, styleGreen, `Reads: ${currentSystemInfo.reads}`);
    createSysPill(`U: ${currentSystemInfo.updates || 0}`, styleOrange, `Updates: ${currentSystemInfo.updates}`);
    createSysPill(`X: ${currentSystemInfo.executes || 0}`, styleBlack, `Executes: ${currentSystemInfo.executes}`);

    const sizePill = document.createElement('span');
    sizePill.className = 'pill pill-sys';
    sizePill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
    sizePill.textContent = currentSize;
    sizePill.title = "Size";
    brElements.push(sizePill);

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

    createSysPill(`R: ${currentWhitelists.read.length}`, styleGreen, "Click to edit Whitelist READ", () => openWhitelistModalForTagEditor('read'));
    createSysPill(`U: ${currentWhitelists.update.length}`, styleOrange, "Click to edit Whitelist UPDATE", () => openWhitelistModalForTagEditor('update'));
    createSysPill(`D: ${currentWhitelists.delete.length}`, styleRed, "Click to edit Whitelist DELETE", () => openWhitelistModalForTagEditor('delete'));
    createSysPill(`X: ${currentWhitelists.execute.length}`, styleBlack, "Click to edit Whitelist EXECUTE", () => openWhitelistModalForTagEditor('execute'));

    const mime = detectMimetype(currentValue);
    const mimePill = document.createElement('span');
    mimePill.className = 'pill pill-mime';
    mimePill.style.cssText = `padding: 4px 8px; font-size: 0.85em; cursor: default; background-color: ${mime.color}; color: ${['TXT','BASE64'].includes(mime.type)?'#000':'#fff'};`;
    if(['JSON','JS','SVG'].includes(mime.type)) mimePill.style.color = '#000';
    mimePill.textContent = mime.type;
    mimePill.title = "Mime Type";
    brElements.push(mimePill);

    currentTags.forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'pill pill-user';
        pill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
        
        const textSpan = document.createElement('span');
        textSpan.textContent = tag;
        textSpan.style.cursor = 'text';
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
        removeSpan.onclick = (e) => {
            e.stopPropagation();
            currentTags = currentTags.filter(t => t !== tag);
            renderTagsInModal(targetContainer);
        };

        pill.appendChild(textSpan);
        pill.appendChild(removeSpan);
        brElements.push(pill);
    });

    brElements.forEach(el => brGroup.appendChild(el));

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
                setTimeout(() => {
                    const newInputs = targetContainer.querySelectorAll('input[placeholder="+ Tag"]');
                    if(newInputs.length > 0) newInputs[0].focus();
                }, 10);
            }
        };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitTag(); });
        addInput.addEventListener('blur', () => { if (addInput.value.trim()) submitTag(); });
        addPill.appendChild(addInput);
        brGroup.appendChild(addPill);
    }
}

async function handleSaveAction() {
    const updateEditor = document.getElementById('update-editor');
    const key = currentUpdateKey;
    const newValue = updateEditor.value;

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
        if (!currentTags.some(t => t.startsWith("Last Read>"))) currentTags.push(`Last Read${dateTagSuffix}`);
        if (!currentTags.some(t => t.startsWith("Last Updated>"))) currentTags.push(`Last Updated${dateTagSuffix}`);
        if (!currentTags.some(t => t.startsWith("Last Executed>"))) currentTags.push(`Last Executed${dateTagSuffix}`);
        
        const sizeBytes = new Blob([newValue]).size;
        currentSize = sizeBytes > 1024 ? `${(sizeBytes/1024).toFixed(1)}KB` : `${sizeBytes}B`;
    }

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

            let payloadData = inputData;
            if (!isNew && originalDocData) {
                payloadData = { key: key };
                Object.keys(inputData).forEach(k => {
                    if (k === 'key') return;
                    const newVal = inputData[k];
                    const oldVal = originalDocData[k];
                    let isChanged = false;
                    if (Array.isArray(newVal)) {
                        const n = [...newVal].sort();
                        const o = Array.isArray(oldVal) ? [...oldVal].sort() : [];
                        if (JSON.stringify(n) !== JSON.stringify(o)) isChanged = true;
                    } else if (oldVal && typeof oldVal === 'object' && oldVal.toDate) {
                        if (newVal !== oldVal.toDate().toISOString()) isChanged = true;
                    } else {
                        if (newVal !== oldVal) isChanged = true;
                    }
                    if (isChanged) payloadData[k] = newVal;
                });
            }
            const payload = buildFirestoreCreatePayload(payloadData);
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

async function handleSaveTags() {
    if (currentIsNew) {
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
    const newAccessControl = calculateAccessControl(currentOwner, currentWhitelists);

    try {
        if (isEmulator) {
            console.log("🔧 Emulator Mode: Updating Tags via SDK directly.");
            await updateDoc(doc(db, "kv-store", currentUpdateKey), {
                user_tags: currentTags,
                label: currentLabel,
                owner: currentOwner,
                access_control: newAccessControl,
                white_list_read: currentWhitelists.read,
                white_list_update: currentWhitelists.update,
                white_list_delete: currentWhitelists.delete,
                white_list_execute: currentWhitelists.execute,
                updates: increment(1),
                last_update_ts: new Date().toISOString()
            });
        } else {
            const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "U_TAGS",
                    key: currentUpdateKey,
                    label: currentLabel,
                    owner: currentOwner,
                    access_control: { arrayValue: { values: newAccessControl.map(v => ({ stringValue: v })) } },
                    user_tags: { arrayValue: { values: currentTags.map(t => ({ stringValue: t })) } },
                    white_list_read: { arrayValue: { values: currentWhitelists.read.map(v => ({ stringValue: v })) } },
                    white_list_update: { arrayValue: { values: currentWhitelists.update.map(v => ({ stringValue: v })) } },
                    white_list_delete: { arrayValue: { values: currentWhitelists.delete.map(v => ({ stringValue: v })) } },
                    white_list_execute: { arrayValue: { values: currentWhitelists.execute.map(v => ({ stringValue: v })) } },
                    last_update_ts: new Date().toISOString()
                })
            });
            if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
            setTimeout(() => fetchRealData(), 1000);
            setTimeout(() => refreshTagCloud(true), 1000); // Cache leeren und neu laden
        }
        closeTagModal();
    } catch (e) {
        alert("Failed to save tags: " + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function addNewTag() {
    const input = document.getElementById('new-tag-input');
    const val = input.value.trim();
    if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        renderTagsInModal(document.getElementById('tag-list-container'));
        input.value = '';
    }
}

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

function closeWhitelistModal() {
    document.getElementById('whitelist-modal').style.display = 'none';
    editingOrigin = null;
    const btn = document.getElementById('btn-save-whitelist');
    if (btn) {
        btn.textContent = "+";
        btn.title = "Add Entry";
        btn.style.backgroundColor = "var(--user-bg)";
    }
}

async function handleSaveWhitelist() {
    const wlInput = document.getElementById('whitelist-input');
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
                await updateDoc(docRef, { [currentWhitelistField]: arrayRemove(editingOrigin) });
                await updateDoc(docRef, { [currentWhitelistField]: arrayUnion(val) });
            } else if (!editingOrigin) {
                await updateDoc(docRef, { [currentWhitelistField]: arrayUnion(val) });
            }
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                renderWhitelistChips(snap.data()[currentWhitelistField] || []);
                const type = currentWhitelistField.replace('white_list_', '');
                if (currentWhitelists[type]) {
                    currentWhitelists[type] = snap.data()[currentWhitelistField] || [];
                    renderTagsInModal(document.getElementById('tag-list-container'));
                }
            }
            wlInput.value = '';
            editingOrigin = null;
            const btn = document.getElementById('btn-save-whitelist');
            btn.textContent = "+";
            btn.title = "Add Entry";
            btn.style.backgroundColor = "var(--user-bg)";
            document.getElementById('whitelist-warning').classList.remove('visible');
            refreshTagCloud(true); // Tag Cloud aktualisieren
            fetchRealData();
        } catch (e) {
            console.error("Firestore Update Error:", e);
            alert("Update failed: " + e.message);
        }
    }
}

function renderWhitelistChips(list) {
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
            document.getElementById('whitelist-input').value = email;
            editingOrigin = email;
            const btn = document.getElementById('btn-save-whitelist');
            btn.textContent = "💾";
            btn.title = "Update Entry";
            btn.style.backgroundColor = "#ff9100";
            document.getElementById('whitelist-input').focus();
            document.getElementById('whitelist-input').dispatchEvent(new Event('input'));
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
                await updateDoc(docRef, { [currentWhitelistField]: arrayRemove(email) });
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    renderWhitelistChips(snap.data()[currentWhitelistField] || []);
                    const type = currentWhitelistField.replace('white_list_', '');
                    if (currentWhitelists[type]) {
                        currentWhitelists[type] = snap.data()[currentWhitelistField] || [];
                        renderTagsInModal(document.getElementById('tag-list-container'));
                    }
                }
                refreshTagCloud(true); // Tag Cloud aktualisieren
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
}

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
                renderRulesEditor();
            };
            row.appendChild(input);
            row.appendChild(delBtn);
            container.appendChild(row);
        });
    };
    renderList('folder-rules-list', rules.folder || []);
    renderList('hidden-rules-list', rules.hidden || []);
}

function setupModalDrag(modalId) {
    const modal = document.getElementById(modalId);
    const content = modal ? modal.querySelector('.modal-content') : null;
    if (!content) return;
    const handle = content.querySelector('.modal-drag-handle');
    if (!handle) return;
    
    handle.style.cursor = 'move';
    let isDragging = false;
    let startX, startY, startTransX, startTransY;
    
    // For whitelist modal specifically (using left/top instead of translate)
    const isWhitelist = (modalId === 'whitelist-modal');
    let startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('.close-x') || e.target.closest('button') || e.target.closest('.btn-transparency') || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        if (isWhitelist) {
            startLeft = modal.offsetLeft;
            startTop = modal.offsetTop;
        } else {
            const style = window.getComputedStyle(content);
            const matrix = new WebKitCSSMatrix(style.transform);
            startTransX = matrix.m41;
            startTransY = matrix.m42;
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        if (isWhitelist) {
            modal.style.left = `${startLeft + dx}px`;
            modal.style.top = `${startTop + dy}px`;
        } else {
            content.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
        }
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}