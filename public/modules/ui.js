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

    const fD = (ts) => ts ? ts.split('T')[0] : '--'; 
    const fT = (label, ts) => ts ? `${label}: ${ts.replace('T', ' ').substring(0, 19)}` : label;
    let htmlBuffer = "";

    docs.forEach(doc => {
        const d = doc.data();
        const foundMime = detectMimetype(d.value);
        
        const mimePill = foundMime ? 
            `<div class="pill pill-mime" title="Mime Type" style="background-color: ${foundMime.color} !important; color: #000 !important;">
                ${foundMime.type}
            </div>` : '';

        let userTags = [];
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

        if (Array.isArray(d.user_tags)) {
            d.user_tags.forEach(t => userTags.push(`<div class="pill pill-user" title="Memo: User">${t}</div>`));
        }

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

        htmlBuffer += `
            <div class="card-kv">
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