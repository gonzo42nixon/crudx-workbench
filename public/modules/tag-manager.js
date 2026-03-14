import { db, auth } from './firebase.js';
import { doc, getDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { detectMimetype } from './mime.js';
import { fetchRealData } from './pagination.js';
import { refreshTagCloud } from './tagscanner.js';
import { calculateAccessControl, escapeHtml, buildFirestoreCreatePayload } from './utils.js';
import { openWhitelistEditor } from './security-manager.js';

let currentDocId = "";
let currentIsNew = false;
let localState = {
    label: "",
    tags: [],
    whitelists: { read: [], update: [], delete: [], execute: [] },
    owner: "",
    value: "",
    size: "0KB",
    systemInfo: {}
};

export function openTagModal(key, label, isNew = false, docData = null) {
    currentDocId = key;
    currentIsNew = isNew;
    
    const tagModal = document.getElementById('tag-modal');
    const tagListContainer = document.getElementById('tag-list-container');
    if (!tagModal) return;

    const btnSave = document.getElementById('btn-save-tags-modal');
    if (btnSave) {
        btnSave.textContent = isNew ? "Done" : "UPDATE";
        btnSave.style.backgroundColor = isNew ? "#00e676" : "#ff9100";
        btnSave.style.color = "#000000";
    }

    if (isNew) {
        // Bei Neuanlage übernehmen wir den State vom Editor (der bereits vorbereitet wurde)
        localState.label = label;
        // Tags/Whitelists werden hier direkt aus dem Editor-Context geladen, 
        // den wir über docData erhalten könnten, oder wir nutzen den globalen editor state.
        // Einfacher: Wir mappen docData falls vorhanden.
        if (docData) {
            localState.tags = docData.user_tags || [];
            localState.owner = docData.owner || "";
            localState.whitelists = docData.whitelists || localState.whitelists;
            localState.systemInfo = docData.systemInfo || {};
        }
        renderTagsInModal(tagListContainer);
    } else {
        // Existierendes Dokument frisch laden
        getDoc(doc(db, "kv-store", key)).then(snap => {
            if (snap.exists()) {
                const d = snap.data();
                localState = {
                    label: d.label || "",
                    value: d.value || "",
                    owner: d.owner || "",
                    size: d.size || "0KB",
                    tags: d.user_tags || [],
                    whitelists: {
                        read: d.white_list_read || [],
                        update: d.white_list_update || [],
                        delete: d.white_list_delete || [],
                        execute: d.white_list_execute || []
                    },
                    systemInfo: {
                        created_at: d.created_at,
                        reads: d.reads || 0,
                        last_read_ts: d.last_read_ts,
                        updates: d.updates || 0,
                        last_update_ts: d.last_update_ts,
                        executes: d.executes || 0,
                        last_execute_ts: d.last_execute_ts
                    }
                };
                renderTagsInModal(tagListContainer);
            }
        });
    }

    tagModal.classList.add('active');
    document.getElementById('new-tag-input')?.focus();
}

export function closeTagModal() {
    document.getElementById('tag-modal')?.classList.remove('active');
}

export function addNewTag() {
    const input = document.getElementById('new-tag-input');
    const val = input?.value.trim();
    if (val && !localState.tags.includes(val)) {
        localState.tags.push(val);
        renderTagsInModal(document.getElementById('tag-list-container'));
        input.value = '';
    }
}

export async function handleSaveTags() {
    if (currentIsNew) {
        closeTagModal();
        return;
    }
    const btn = document.getElementById('btn-save-tags-modal');
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;

    const isEmulator = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const newAccessControl = calculateAccessControl(localState.owner, localState.whitelists);

    try {
        if (isEmulator) {
            await updateDoc(doc(db, "kv-store", currentDocId), {
                user_tags: localState.tags,
                label: localState.label,
                owner: localState.owner,
                access_control: newAccessControl,
                white_list_read: localState.whitelists.read,
                white_list_update: localState.whitelists.update,
                white_list_delete: localState.whitelists.delete,
                white_list_execute: localState.whitelists.execute,
                updates: increment(1),
                last_update_ts: new Date().toISOString()
            });
        } else {
            const payload = buildFirestoreCreatePayload({
                key: currentDocId,
                label: localState.label,
                value: localState.value,
                owner: localState.owner,
                access_control: newAccessControl,
                user_tags: localState.tags,
                white_list_read: localState.whitelists.read,
                white_list_update: localState.whitelists.update,
                white_list_delete: localState.whitelists.delete,
                white_list_execute: localState.whitelists.execute,
                size: localState.size,
                last_update_ts: new Date().toISOString()
            });
            payload.action = "U_TAGS";

            const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
            setTimeout(() => fetchRealData(), 1000);
            setTimeout(() => refreshTagCloud(true), 1000);
        }
        closeTagModal();
    } catch (e) {
        alert("Failed to save tags: " + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

export function renderTagsInModal(targetContainer) {
    if (!targetContainer) return;
    targetContainer.innerHTML = '';
    
    const isOverlay = (targetContainer.id === 'update-modal-tag-editor');
    targetContainer.style.cssText = isOverlay 
        ? "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20;"
        : "position: relative; flex: 1; width: 100%; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; padding: 5px; justify-content: space-between;";

    const tlGroup = document.createElement('div');
    tlGroup.className = 'tl-group';
    if (!isOverlay) {
        Object.assign(tlGroup.style, { position: 'relative', top: 'auto', left: 'auto', width: '100%', marginBottom: '10px' });
    } else {
        tlGroup.style.pointerEvents = 'auto'; // Ermöglicht Klicks auf Key/Label im Overlay
    }

    const brGroup = document.createElement('div');
    brGroup.className = 'br-group';
    if (!isOverlay) {
        Object.assign(brGroup.style, { position: 'relative', marginTop: 'auto', paddingTop: '15px', flexDirection: 'row-reverse', flexWrap: 'wrap-reverse', justifyContent: 'flex-start', width: '100%', right: 'auto', bottom: 'auto' });
    } else {
        brGroup.style.pointerEvents = 'auto'; // Ermöglicht Klicks auf Tags im Overlay
    }

    targetContainer.appendChild(tlGroup);
    targetContainer.appendChild(brGroup);
    
    // --- TOP LEFT: Key & Label ---
    const keyPill = document.createElement('span');
    keyPill.className = 'pill pill-key';
    keyPill.textContent = currentDocId;
    keyPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
    tlGroup.appendChild(keyPill);

    const labelPill = document.createElement('span');
    labelPill.className = 'pill pill-label';
    labelPill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: pointer; min-width: 80px; display: inline-flex; align-items: center; justify-content: center;";
    const textSpan = document.createElement('span');
    textSpan.textContent = localState.label || "(Set Label)";
    if (!localState.label) { textSpan.style.fontStyle = "italic"; textSpan.style.opacity = "0.6"; }
    
    labelPill.onclick = (e) => {
        if (e.target.tagName === 'INPUT') return; // FIX: Prevent loop when clicking inside the input
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = localState.label;
        input.style.cssText = "background: transparent; border: none; color: inherit; font-family: inherit; font-size: inherit; width: 100%; outline: none; padding: 0; text-align: center;";
        const save = () => { 
            localState.label = input.value.trim(); 
            const display = document.getElementById('update-label-display');
            if (display) display.textContent = localState.label || currentDocId || "New Card";
            renderTagsInModal(targetContainer); 
        };
        input.onblur = save;
        input.onkeydown = (ev) => { if (ev.key === 'Enter') save(); };
        labelPill.innerHTML = ''; 
        labelPill.appendChild(input); 
        input.focus();
    };
    labelPill.appendChild(textSpan);
    tlGroup.appendChild(labelPill);

    // --- BOTTOM RIGHT: System & User Tags ---
    const fmt = (ts) => ts ? (typeof ts === 'string' ? ts.split('T')[0] : ts.toDate().toISOString().split('T')[0]) : '';
    const createSysPill = (text, style, title, cb = null) => {
        const p = document.createElement('span');
        p.className = 'pill';
        p.style.cssText = `padding: 4px 8px; font-size: 0.85em; cursor: ${cb ? 'pointer' : 'default'}; ${style}`;
        p.textContent = text; p.title = title;
        if (cb) p.onclick = cb;
        brGroup.appendChild(p);
    };

    const sBlue = "border: 1px solid #2979ff; color: #2979ff; background: rgba(41, 121, 255, 0.1);";
    const sGreen = "border: 1px solid #00e676; color: #00e676; background: rgba(0, 230, 118, 0.1);";
    const sOrange = "border: 1px solid #ff9100; color: #ff9100; background: rgba(255, 145, 0, 0.1);";
    const sRed = "border: 1px solid #ff1744; color: #ff1744; background: rgba(255, 23, 68, 0.1);";
    const sBlack = "border: 1px solid #555; color: #eee; background: #000;";

    if (localState.systemInfo.created_at) createSysPill(`C: ${fmt(localState.systemInfo.created_at)}`, sBlue, `Created: ${localState.systemInfo.created_at}`);
    if (localState.systemInfo.last_read_ts) createSysPill(`R: ${fmt(localState.systemInfo.last_read_ts)}`, sGreen, `Last Read: ${localState.systemInfo.last_read_ts}`);
    if (localState.systemInfo.last_update_ts) createSysPill(`U: ${fmt(localState.systemInfo.last_update_ts)}`, sOrange, `Last Update: ${localState.systemInfo.last_update_ts}`);
    if (localState.systemInfo.last_execute_ts) createSysPill(`X: ${fmt(localState.systemInfo.last_execute_ts)}`, sBlack, `Last Execute: ${localState.systemInfo.last_execute_ts}`);

    createSysPill(`R: ${localState.systemInfo.reads || 0}`, sGreen, "Reads");
    createSysPill(`U: ${localState.systemInfo.updates || 0}`, sOrange, "Updates");
    createSysPill(`X: ${localState.systemInfo.executes || 0}`, sBlack, "Executes");

    createSysPill(localState.size, "border: 1px solid #555;", "Size");

    if (localState.owner) {
        const isMe = auth.currentUser?.email === localState.owner;
        const style = isMe ? "background: #ffd700; color: #000; border: 1px solid #e6c200; font-weight: bold;" : "";
        createSysPill(isMe ? "You" : localState.owner, style, `Owner: ${localState.owner}`, () => {
            const input = document.createElement('input');
            input.value = localState.owner;
            input.style.cssText = "background: #222; border: 1px solid #444; color: #fff; width: 120px;";
            input.onblur = () => { if(input.value.includes('@')) localState.owner = input.value.trim(); renderTagsInModal(targetContainer); };
            brGroup.innerHTML = ''; brGroup.appendChild(input); input.focus();
        });
    }

    // Whitelist Bridges
    createSysPill(`R: ${localState.whitelists.read.length}`, sGreen, "Edit READ", () => openWhitelistEditor(currentDocId, 'read', localState.whitelists, () => renderTagsInModal(targetContainer)));
    createSysPill(`U: ${localState.whitelists.update.length}`, sOrange, "Edit UPDATE", () => openWhitelistEditor(currentDocId, 'update', localState.whitelists, () => renderTagsInModal(targetContainer)));
    createSysPill(`D: ${localState.whitelists.delete.length}`, sRed, "Edit DELETE", () => openWhitelistEditor(currentDocId, 'delete', localState.whitelists, () => renderTagsInModal(targetContainer)));
    createSysPill(`X: ${localState.whitelists.execute.length}`, sBlack, "Edit EXECUTE", () => openWhitelistEditor(currentDocId, 'execute', localState.whitelists, () => renderTagsInModal(targetContainer)));

    const mime = detectMimetype(localState.value);
    createSysPill(mime.type, `background-color: ${mime.color}; color: #000;`, "Mime Type");

    // User Tags
    localState.tags.forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'pill pill-user';
        pill.style.cssText = "padding: 4px 8px; font-size: 0.85em; cursor: default;";
        
        const textSpan = document.createElement('span');
        textSpan.textContent = tag;
        textSpan.style.cursor = 'text';
        textSpan.onclick = () => {
            const input = document.createElement('input');
            input.value = tag; input.style.cssText = "background: #222; border: none; color: #fff; width: 80px;";
            input.onblur = () => {
                const val = input.value.trim();
                if (val) localState.tags[localState.tags.indexOf(tag)] = val;
                renderTagsInModal(targetContainer);
            };
            pill.innerHTML = ''; pill.appendChild(input); input.focus();
        };

        const remove = document.createElement('span');
        remove.innerHTML = '✕'; remove.style.cssText = "cursor:pointer; margin-left:6px; opacity:0.6;";
        remove.onclick = () => { localState.tags = localState.tags.filter(t => t !== tag); renderTagsInModal(targetContainer); };

        pill.appendChild(textSpan); pill.appendChild(remove);
        brGroup.appendChild(pill);
    });

    // Add Tag Input (New)
    if (isOverlay) {
        const addPill = document.createElement('span');
        addPill.className = 'pill pill-user';
        addPill.style.cssText = "padding: 0; background-color: #00e676 !important; color: #fff !important;";
        const addInput = document.createElement('input');
        addInput.placeholder = '+ Tag';
        addInput.style.cssText = "background: transparent; border: none; color: inherit; width: 60px; padding: 4px 8px;";
        addInput.onkeydown = (e) => { if (e.key === 'Enter') {
            const val = addInput.value.trim();
            if (val && !localState.tags.includes(val)) {
                localState.tags.push(val); renderTagsInModal(targetContainer);
                setTimeout(() => targetContainer.querySelectorAll('input[placeholder="+ Tag"]')[0]?.focus(), 10);
            }
        }};
        addPill.appendChild(addInput); brGroup.appendChild(addPill);
    }
}

/**
 * Ermöglicht dem Editor, den State an den Tag-Manager zu pushen (z.B. bei Neuanlage)
 */
export function syncTagManagerState(data) {
    if (data.key) currentDocId = data.key;
    localState = { ...localState, ...data };
}

export function getTagManagerState() {
    return localState;
}