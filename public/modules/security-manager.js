import { db } from './firebase.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData } from './pagination.js';
import { refreshTagCloud } from './tagscanner.js';
import { getEmailWarning } from './utils.js';

let currentDocId = null;
let currentField = null;
let currentWhitelistsRef = null; // Referenz auf den State im Editor
let onUpdateCallback = null;     // Callback um die Tags im Editor-Modal zu refreshen

export function initSecurityManager() {
    const wlInput = document.getElementById('whitelist-input');
    if (wlInput) {
        wlInput.addEventListener('input', () => {
            const warning = getEmailWarning(wlInput.value.trim());
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
}

export function openWhitelistEditor(docId, type, currentWhitelists, refreshCallback) {
    currentDocId = docId;
    currentField = `white_list_${type}`;
    currentWhitelistsRef = currentWhitelists;
    onUpdateCallback = refreshCallback;

    renderWhitelistChips(currentWhitelists[type]);

    const modal = document.getElementById('whitelist-modal');
    const titleEl = document.getElementById('whitelist-modal-title');
    if (titleEl) {
        const map = { read: 'R', update: 'U', delete: 'D', execute: 'X' };
        titleEl.textContent = `${map[type] || '?'}: Edit Whitelist Entry`;
    }
    
    if (modal) modal.style.display = 'block';
    const input = document.getElementById('whitelist-input');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('whitelist-warning')?.classList.remove('visible');
}

export function closeWhitelistModal() {
    const modal = document.getElementById('whitelist-modal');
    if (modal) modal.style.display = 'none';
}

export async function handleSaveWhitelistEntry(editingOrigin = null) {
    const wlInput = document.getElementById('whitelist-input');
    const val = wlInput.value.trim();
    if (!val || !currentDocId || !currentField) return;

    const urlParams = new URLSearchParams(window.location.search);
    const forceProd = urlParams.get('mode') === 'live';
    const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const type = currentField.replace('white_list_', '');

    try {
        if (isEmulator) {
            const docRef = doc(db, "kv-store", currentDocId);
            if (editingOrigin && editingOrigin !== val) {
                await updateDoc(docRef, { [currentField]: arrayRemove(editingOrigin) });
                await updateDoc(docRef, { [currentField]: arrayUnion(val) });
            } else {
                await updateDoc(docRef, { [currentField]: arrayUnion(val) });
            }

            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const newList = snap.data()[currentField] || [];
                currentWhitelistsRef[type] = newList;
                renderWhitelistChips(newList);
                if (onUpdateCallback) onUpdateCallback();
            }
            refreshTagCloud(true);
            fetchRealData();
        } else {
            // PRODUKTION: Nur lokaler State-Update. Die Persistenz erfolgt über den 
            // "UPDATE"-Button im übergeordneten Tag-Modal (handleSaveTags), welcher den Webhook nutzt.
            let list = currentWhitelistsRef[type] || [];
            if (editingOrigin) {
                list = list.filter(e => e !== editingOrigin);
            }
            if (!list.includes(val)) list.push(val);
            currentWhitelistsRef[type] = list;
            renderWhitelistChips(list);
            if (onUpdateCallback) onUpdateCallback();
        }
        wlInput.value = '';
    } catch (e) {
        alert("Update failed: " + e.message);
    }
}

function renderWhitelistChips(list) {
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
        textSpan.onclick = () => {
            const input = document.getElementById('whitelist-input');
            if (input) {
                input.value = email;
                input.focus();
                // Triggering handle with origin logic would be next step
            }
        };

        const closeSpan = document.createElement('span');
        closeSpan.textContent = "×";
        closeSpan.style.cursor = "pointer";
        closeSpan.onclick = async () => {
            if (!confirm(`Remove "${email}"?`)) return;

            const urlParams = new URLSearchParams(window.location.search);
            const forceProd = urlParams.get('mode') === 'live';
            const isEmulator = !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);
            const type = currentField.replace('white_list_', '');

            if (isEmulator) {
                const docRef = doc(db, "kv-store", currentDocId);
                await updateDoc(docRef, { [currentField]: arrayRemove(email) });
                const snap = await getDoc(docRef);
                const newList = snap.data()[currentField] || [];
                currentWhitelistsRef[type] = newList;
                renderWhitelistChips(newList);
                if (onUpdateCallback) onUpdateCallback();
                refreshTagCloud(true);
                fetchRealData();
            } else {
                // PRODUKTION: Nur lokaler State-Update.
                const newList = (currentWhitelistsRef[type] || []).filter(e => e !== email);
                currentWhitelistsRef[type] = newList;
                renderWhitelistChips(newList);
                if (onUpdateCallback) onUpdateCallback();
            }
        };

        chip.appendChild(textSpan);
        chip.appendChild(closeSpan);
        container.appendChild(chip);
    });
}