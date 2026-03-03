// public/modules/ui.js
import { detectMimetype } from './mime.js';
import { auth } from './firebase.js';

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderDataFromDocs(docs, container) {
    const isNano = container.classList.contains('grid-9');
    const currentUserEmail = auth.currentUser?.email;
    
    const tokens = currentUserEmail ? [
        currentUserEmail,
        `*@${currentUserEmail.split('@')[1]}`,
        `${currentUserEmail.split('@')[0]}@*`,
        `*@*`
    ] : [];

    const toIso = (val) => {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
        if (val instanceof Date) return val.toISOString();
        return String(val);
    };

    const fD = (ts) => { const s = toIso(ts); return s ? s.split('T')[0] : '--'; };
    const fT = (label, ts) => { const s = toIso(ts); return s ? `${label}: ${s.replace('T', ' ').substring(0, 19)}` : label; };
    let htmlBuffer = "";

    docs.forEach(doc => {
        const d = doc.data();
        const foundMime = detectMimetype(d.value);
        
        const mimePill = foundMime ? 
            `<div class="pill pill-mime" title="Mime Type" style="background-color: ${foundMime.color} !important; color: #000 !important;">
                ${foundMime.type}
            </div>` : '';

        let userTags = [];
        let protectionLetters = "";
        if (Array.isArray(d.user_tags)) {
            d.user_tags.forEach(t => {
                userTags.push(`<div class="pill pill-user" title="Memo: User">${t}</div>`);
                if (t.includes("🛡️")) protectionLetters = t;
            });
        }

        ['execute','delete','update','read'].forEach(m => {
            const list = d[`white_list_${m}`] || [];
            if (list.length > 0) {
                let style = '';
                if (m === 'delete') style = 'background-color: #d32f2f !important; color: #fff !important; border: 1px solid #b71c1c !important;';
                else if (m === 'update') style = 'background-color: #f57c00 !important; color: #fff !important; border: 1px solid #e65100 !important;';
                else if (m === 'read') style = 'background-color: #388e3c !important; color: #fff !important; border: 1px solid #1b5e20 !important;';
                else if (m === 'execute') style = 'background-color: #000000 !important; color: #ffffff !important; border: 1px solid #333333 !important;';

                if (currentUserEmail && list.includes(currentUserEmail)) {
                    style += ' border: 2px solid #ffffff !important; box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);';
                }

                let icon = '📋';

                userTags.push(`<div class="pill pill-user" style="${style}" title="Whitelist ${m.toUpperCase()}: ${list.join(', ')}">${icon} ${list.length}</div>`);
            }
        });

        const isOwner = currentUserEmail && d.owner === currentUserEmail;
        let ownerStyle = '';
        let ownerText = `👤 ${d.owner || 'Sys'}`;
        if (isOwner) {
            ownerStyle = 'background-color: #ffd700 !important; color: #000 !important; border: 1px solid #b29400 !important; font-weight: bold;';
            ownerText = '👤 YOU';
        }

        const sysTagsHtml = `
            <div class="pill pill-sys" style="background-color: #000000 !important; color: #ffffff !important; border-color: #333333 !important;" title="${fT('Last Execute', d.last_execute_ts)}">x:${fD(d.last_execute_ts)}</div>
            <div class="pill pill-sys" style="background-color: #fb8c00 !important; color: #fff !important; border-color: #ef6c00 !important;" title="${fT('Last Update', d.last_update_ts)}">U:${fD(d.last_update_ts)}</div>
            <div class="pill pill-sys" style="background-color: #43a047 !important; color: #fff !important; border-color: #2e7d32 !important;" title="${fT('Last Read', d.last_read_ts)}">R:${fD(d.last_read_ts)}</div>
            <div class="pill pill-sys" style="background-color: #1e88e5 !important; color: #fff !important; border-color: #1565c0 !important;" title="${fT('Created', d.created_at)}">C:${fD(d.created_at)}</div>
            <div class="pill pill-sys" style="background-color: #000000 !important; color: #ffffff !important; border-color: #333333 !important;" title="Executes">X:${d.executes || 0}</div>
            <div class="pill pill-sys" style="background-color: #fb8c00 !important; color: #fff !important; border-color: #ef6c00 !important;" title="Updates">U:${d.updates || 0}</div>
            <div class="pill pill-sys" style="background-color: #43a047 !important; color: #fff !important; border-color: #2e7d32 !important;" title="Reads">R:${d.reads || 0}</div>
            <div class="pill pill-sys" title="Size">${d.size || '0KB'}</div>
            <div class="pill pill-sys" style="${ownerStyle}" title="Owner: ${d.owner || 'Sys'}">${ownerText}</div>
        `;

        const checkAuth = (listName) => {
            if (isOwner) return true;
            if (!listName) return false;
            const list = d[listName] || [];
            return list.some(entry => tokens.includes(entry));
        };

        const getBtnState = (char, listName, actionName) => {
            const isProtected = protectionLetters.includes(char);
            const isAuthorized = checkAuth(listName);
            const actionUpper = actionName.toUpperCase();
            
            if (isProtected) {
                return isAuthorized 
                    ? { style: 'style="background-color: #ffd700; color: #000 !important; border-radius: 4px;"', title: `${actionUpper} protected but authorized` }
                    : { style: 'style="background-color: #ff1744; color: #fff !important; border-radius: 4px;"', title: `${actionUpper} protected but not authorized` };
            } else {
                // Unprotected
                if (!isAuthorized) {
                    return { 
                        style: 'style="background-color: #9e9e9e; color: #e0e0e0 !important; border-radius: 4px; cursor: not-allowed;"', 
                        title: `${actionUpper} unprotected but not authorized` 
                    };
                }
                return { style: '', title: `${actionUpper} unprotected but authorized` };
            }
        };

        const btnC = getBtnState('C', null, 'Create');
        const btnR = getBtnState('R', 'white_list_read', 'Read');
        const btnU = getBtnState('U', 'white_list_update', 'Update');
        const btnD = getBtnState('D', 'white_list_delete', 'Delete');
        const btnX = getBtnState('X', 'white_list_execute', 'Execute');

        htmlBuffer += `
            <div class="card-kv">
                <div class="tr-group">
                    <button class="btn-crudx btn-c" data-action="C" title="${btnC.title}" ${btnC.style}>C</button>
                    <button class="btn-crudx btn-r" data-action="R" title="${btnR.title}" ${btnR.style}>R</button>
                    <button class="btn-crudx btn-u" data-action="U" title="${btnU.title}" ${btnU.style}>U</button>
                    <button class="btn-crudx btn-d" data-action="D" title="${btnD.title}" ${btnD.style}>D</button>
                    <button class="btn-crudx btn-x" data-action="X" title="${btnX.title}" ${btnX.style}>X</button>
                </div>
                <div class="tl-group">
                    <div class="pill pill-key" title="KEY">${doc.id}</div>
                    <div class="pill pill-label" title="Label">${d.label || ''}</div>
                </div>
                <div class="value-layer" title="VALUE">${escapeHtml(d.value) || 'NULL'}</div>
                <div class="br-group">
                    ${sysTagsHtml}
                    ${mimePill}
                    ${userTags.join('')}
                </div>
            </div>`;
    });
    container.innerHTML = htmlBuffer;
}