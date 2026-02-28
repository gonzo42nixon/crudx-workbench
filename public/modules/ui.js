// public/modules/ui.js
import { detectMimetype } from './mime.js';

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
    const labelCreated = isNano ? 'C:' : 'Created:';

    const fD = (ts) => ts ? ts.split('T')[0] : '--'; 
    const fT = (label, ts) => ts ? `${label}: ${ts.replace('T', ' ').substring(0, 19)}` : label;
    let htmlBuffer = "";

    docs.forEach(doc => {
        const d = doc.data();
        const foundMime = detectMimetype(d.value);
        
        const mimePill = foundMime ? 
            `<div class="pill pill-mime" title="Mime Type" style="background-color: ${foundMime.color} !important; color: #000 !important;">
                ${foundMime.icon} ${foundMime.type}
            </div>` : '';

        let userTags = [];
        if (Array.isArray(d.user_tags)) {
            d.user_tags.forEach(t => userTags.push(`<div class="pill pill-user" title="Memo: User">🏷️ ${t}</div>`));
        }
        
        ['read','update','delete'].forEach(m => {
            const list = d[`white_list_${m}`] || [];
            if (list.length > 0) {
                userTags.push(`<div class="pill pill-user" title="Whitelist ${m.toUpperCase()}: ${list.join(', ')}">${m === 'read' ? '👁️' : (m === 'update' ? '✏️' : '🗑️')} ${list.length}</div>`);
            }
        });

        const sysTagsHtml = `
            <div class="pill pill-sys" title="${fT('Created', d.created_at)}">🐣 ${labelCreated}${fD(d.created_at)}</div>
            <div class="pill pill-sys" title="${fT('Last Update', d.last_update_ts)}">📝 U:${fD(d.last_update_ts)}</div>
            <div class="pill pill-sys" title="${fT('Last Read', d.last_read_ts)}">👁️ R:${fD(d.last_read_ts)}</div>
            <div class="pill pill-sys" title="Reads">R:${d.reads || 0}</div>
            <div class="pill pill-sys" title="Updates">U:${d.updates || 0}</div>
            <div class="pill pill-sys" title="Size">💾 ${d.size || '0KB'}</div>
            <div class="pill pill-sys" title="Owner">👤 ${d.owner || 'Sys'}</div>
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