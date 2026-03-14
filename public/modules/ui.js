// public/modules/ui.js
import { detectMimetype } from './mime.js';
import { auth, db } from './firebase.js';
import { getAccessTokens, escapeHtml } from './utils.js';
import { getTagSector } from './tag-state.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

function renderSysTags(d, currentUserEmail) {
    const toIso = (val) => {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
        return String(val);
    };
    const fD = (ts) => { const s = toIso(ts); return s ? s.split('T')[0] : '--'; };
    const fT = (label, ts) => { const s = toIso(ts); return s ? `${label}: ${s.replace('T', ' ').substring(0, 19)}` : label; };

    const isOwner = currentUserEmail && d.owner === currentUserEmail;
    const ownerText = isOwner ? '👤 YOU' : `👤 ${d.owner || 'Sys'}`;
    const ownerStyle = isOwner ? 'background-color: #ffd700 !important; color: #000 !important; border: 1px solid #b29400 !important; font-weight: bold;' : '';

    const tags = [
        { text: `x:${fD(d.last_execute_ts)}`, title: fT('Last Execute', d.last_execute_ts), style: "background-color: #000000 !important; color: #ffffff !important; border-color: #333333 !important;" },
        { text: `U:${fD(d.last_update_ts)}`, title: fT('Last Update', d.last_update_ts), style: "background-color: #fb8c00 !important; color: #fff !important; border-color: #ef6c00 !important;" },
        { text: `R:${fD(d.last_read_ts)}`, title: fT('Last Read', d.last_read_ts), style: "background-color: #43a047 !important; color: #fff !important; border-color: #2e7d32 !important;" },
        { text: `C:${fD(d.created_at)}`, title: fT('Created', d.created_at), style: "background-color: #1e88e5 !important; color: #fff !important; border-color: #1565c0 !important;" },
        { text: `X:${d.executes || 0}`, title: "Executes", style: "background-color: #000000 !important; color: #ffffff !important; border-color: #333333 !important;" },
        { text: `U:${d.updates || 0}`, title: "Updates", style: "background-color: #fb8c00 !important; color: #fff !important; border-color: #ef6c00 !important;" },
        { text: `R:${d.reads || 0}`, title: "Reads", style: "background-color: #43a047 !important; color: #fff !important; border-color: #2e7d32 !important;" },
        { text: d.size || '0KB', title: "Size" },
        { text: ownerText, title: `Owner: ${d.owner || 'Sys'}`, style: ownerStyle }
    ];

    return tags.map(t => `<div class="pill pill-sys" title="${escapeHtml(t.title)}" style="${t.style || ''}">${escapeHtml(t.text)}</div>`).join('');
}

function renderWhitelistPills(d, currentUserEmail) {
    let html = '';
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
            html += `<div class="pill pill-user" style="${style}" title="Whitelist ${m.toUpperCase()}: ${list.join(', ')}">📋 ${list.length}</div>`;
        }
    });
    return html;
}

function getActionButtons(d, currentUserEmail, tokens) {
    const isOwner = currentUserEmail && d.owner === currentUserEmail;
    const checkAuth = (listName) => {
        if (isOwner) return true;
        const list = d[listName] || [];
        return list.some(entry => tokens.includes(entry));
    };

    const getBtn = (char, listName, actionName) => {
        const isProtected = d.user_tags && d.user_tags.some(t => t.startsWith('🛡️') && t.includes(char));
        const isAuthorized = checkAuth(listName);
        if (isProtected) {
            return isAuthorized 
                ? { style: 'style="background-color: #ffd700; color: #000 !important; border-radius: 4px;"', title: `${actionName} protected but authorized` }
                : { style: 'style="background-color: #ff1744; color: #fff !important; border-radius: 4px;"', title: `${actionName} protected but not authorized` };
        }
        if (!isAuthorized) return { style: 'style="background-color: #9e9e9e; color: #e0e0e0 !important; border-radius: 4px; cursor: not-allowed;"', title: `${actionName} unprotected but not authorized` };
        return { style: '', title: `${actionName} unprotected but authorized` };
    };

    const btnC = getBtn('C', null, 'Create');
    const btnR = getBtn('R', 'white_list_read', 'Read');
    const btnU = getBtn('U', 'white_list_update', 'Update');
    const btnD = getBtn('D', 'white_list_delete', 'Delete');
    const btnX = getBtn('X', 'white_list_execute', 'Execute');

    return `
        <div class="tr-group">
            <button class="btn-crudx btn-c" data-action="C" title="${btnC.title}" ${btnC.style}>C</button>
            <button class="btn-crudx btn-r" data-action="R" title="${btnR.title}" ${btnR.style}>R</button>
            <button class="btn-crudx btn-u" data-action="U" title="${btnU.title}" ${btnU.style}>U</button>
            <button class="btn-crudx btn-d" data-action="D" title="${btnD.title}" ${btnD.style}>D</button>
            <button class="btn-crudx btn-x" data-action="X" title="${btnX.title}" ${btnX.style}>X</button>
        </div>`;
}

export async function renderDataFromDocs(docs, container) {
    const isNano = container.classList.contains('grid-9');
    const isGrid1 = container.classList.contains('grid-1');
    const isDocked = document.body.classList.contains('ftc-docked');
    const isNoAppView = document.body.classList.contains('no-app-view');
    const currentUserEmail = auth.currentUser?.email;
    const isEmulator = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const webhookUrl = "https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977";

    const tokens = getAccessTokens(currentUserEmail);

    let htmlBuffer = "";
    for (const doc of docs) {
        const d = doc.data();
        const key = doc.id;
        const tags = d.user_tags || [];
        const foundMime = detectMimetype(d.value);

        const mimePill = foundMime ? 
            `<div class="pill pill-mime" title="Mime Type" style="background-color: ${foundMime.color} !important; color: #000 !important;">
                ${foundMime.type}
            </div>` : '';

        const searchInput = document.getElementById('main-search');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const activeTag = searchTerm.startsWith('tag:') ? searchTerm.substring(4) : null;

        const folderTags = [];
        const cloudTags = [];
        if (Array.isArray(d.user_tags)) {
            d.user_tags.forEach(tag => {
                if (getTagSector(tag) === 'folder') folderTags.push(tag);
                else cloudTags.push(tag);
            });
        }

        let userTagsHtml = '';
        cloudTags.forEach(tag => {
            const inactiveClass = (activeTag && tag !== activeTag) ? 'pill-inactive' : '';
            userTagsHtml += `<div class="pill pill-user ${inactiveClass}">${escapeHtml(tag)}</div>`;
        });

        if (folderTags.length > 0) {
            const inactiveClass = (activeTag && !folderTags.includes(activeTag)) ? 'pill-inactive' : '';
            userTagsHtml += `<div class="pill pill-user summary-pill ${inactiveClass}" data-tags='${escapeHtml(JSON.stringify(folderTags))}'>📁 ${folderTags.length}</div>`;
        }

        // --- CONFLUENCE MODE RENDERING (Grid-1 & Docked) ---
        let valueContent = escapeHtml(d.value) || 'NULL';
        let valueStyle = "";
        let appLoadedAttr = "";

        if (isGrid1 && isDocked && !isNoAppView) {
            const isMD = foundMime && foundMime.type === 'MD';
            const appTag = tags.find(t => t.startsWith('x:'));
            const hasApp = tags.includes('app') || appTag;

            if (isMD || hasApp) {
                let appKey = appTag ? appTag.substring(2) : (tags.includes('app') ? key : "CRUDX-CORE_-_APP_-MARKD");
                
                if (!isEmulator) {
                    // PRODUKTION: App via Make.com Scenario laden
                    const params = new URLSearchParams();
                    params.append("action", "X");
                    params.append("key", key);
                    params.set("app", appKey);
                    if (tags.includes("data") || isMD) params.set("data", key);

                    tags.forEach(t => {
                        if (t.startsWith("s:")) params.set("settings", t.substring(2));
                        if (t.startsWith("d1:")) params.set("data-1", t.substring(3));
                        if (t.startsWith("d2:")) params.set("data-2", t.substring(3));
                        if (t.startsWith("d3:")) params.set("data-3", t.substring(3));
                    });

                    const targetUrl = `${webhookUrl}?${params.toString()}`;
                    valueContent = `<iframe src="${targetUrl}" style="width:100%; height:100%; border:none; background:var(--canvas-bg);"></iframe>`;
                    valueStyle = "padding: 0 !important;";
                    appLoadedAttr = `data-app-loaded="true" data-loaded-key="${key}"`;
                }
            }
        }

        const whitelistHtml = renderWhitelistPills(d, currentUserEmail);
        const sysTagsHtml = renderSysTags(d, currentUserEmail);
        const actionButtonsHtml = getActionButtons(d, currentUserEmail, tokens);

        htmlBuffer += `
            <div class="card-kv" ${appLoadedAttr} data-mime="${foundMime ? foundMime.type : ''}" data-doc="${escapeHtml(JSON.stringify(d))}">
                ${actionButtonsHtml}
                <div class="tl-group">
                    <div class="pill pill-key" title="KEY">${doc.id}</div>
                    <div class="pill pill-label" title="Label">${d.label || ''}</div>
                </div>
                <div class="value-layer" title="VALUE" style="${valueStyle}">${valueContent}</div>
                <div class="br-group">
                    ${sysTagsHtml}
                    ${mimePill}
                    ${whitelistHtml}
                    ${userTagsHtml}
                </div>
            </div>`;
    }
    container.innerHTML = htmlBuffer;
}