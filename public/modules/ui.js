// public/modules/ui.js
import { detectMimetype } from './mime.js';
import { auth, db } from './firebase.js';
import { getAccessTokens } from './utils.js';
import { getTagSector } from './tag-state.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export async function renderDataFromDocs(docs, container) {
    const isNano = container.classList.contains('grid-9');
    const isGrid1 = container.classList.contains('grid-1');
    const isDocked = document.body.classList.contains('ftc-docked');
    const currentUserEmail = auth.currentUser?.email;
    
    const searchInput = document.getElementById('main-search');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const activeTag = searchTerm.startsWith('tag:') ? searchTerm.substring(4) : null;
    
    const tokens = getAccessTokens(currentUserEmail);

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

    // Pre-fetch Markdown App if in Grid-1
    let mdAppTemplate = null;
    if (isGrid1 && isDocked && !document.body.classList.contains('no-app-view')) {
        const hasMd = docs.some(d => detectMimetype(d.data().value).type === 'MD');
        if (hasMd) {
            try {
                const appSnap = await getDoc(doc(db, "kv-store", "CRUDX-CORE_-_APP_-MARKD"));
                if (appSnap.exists()) {
                    mdAppTemplate = appSnap.data().value;
                }
            } catch (e) {
                console.warn("Failed to load Markdown App template", e);
            }
        }
    }

    for (const doc of docs) {
        const d = doc.data();
        const foundMime = detectMimetype(d.value);
        
        const mimePill = foundMime ? 
            `<div class="pill pill-mime" title="Mime Type" style="background-color: ${foundMime.color} !important; color: #000 !important;">
                ${foundMime.type}
            </div>` : '';

        // --- NEW TAG GROUPING LOGIC ---
        const folderTags = [];
        const hiddenTags = [];
        const cloudTags = [];

        if (Array.isArray(d.user_tags)) {
            d.user_tags.forEach(tag => {
                let targetSector = getTagSector(tag);

                if (targetSector === 'folder') folderTags.push(tag);
                else if (targetSector === 'hidden') hiddenTags.push(tag);
                else cloudTags.push(tag);
            });
        }
        
        let userTagsHtml = '';
        
        cloudTags.forEach(tag => {
            const inactiveClass = (activeTag && tag !== activeTag) ? 'pill-inactive' : '';
            userTagsHtml += `<div class="pill pill-user ${inactiveClass}" title="Memo: User">${escapeHtml(tag)}</div>`;
        });

        if (folderTags.length > 0) {
            const isInactive = activeTag && !folderTags.includes(activeTag);
            const inactiveClass = isInactive ? 'pill-inactive' : '';
            const folderTitle = `Folder Tags:\n- ${folderTags.join('\n- ')}`;
            userTagsHtml += `<div class="pill pill-user summary-pill ${inactiveClass}" data-tags='${escapeHtml(JSON.stringify(folderTags))}' title="${escapeHtml(folderTitle)}" style="background-color: #8d6e63 !important; color: #fff !important; border-color: #5d4037 !important; cursor: pointer;">📁 ${folderTags.length}</div>`;
        }

        let whitelistPills = [];
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

                whitelistPills.push(`<div class="pill pill-user" style="${style}" title="Whitelist ${m.toUpperCase()}: ${list.join(', ')}">${icon} ${list.length}</div>`);
            }
        });

        const isOwner = currentUserEmail && d.owner === currentUserEmail;
        let ownerStyle = '';
        let ownerText = `👤 ${d.owner || 'Sys'}`;
        if (isOwner) {
            ownerStyle = 'background-color: #ffd700 !important; color: #000 !important; border: 1px solid #b29400 !important; font-weight: bold;';
            ownerText = '👤 YOU';
        }

        // System Tags Data Collection
        const sysTagsData = [];
        sysTagsData.push({ text: `x:${fD(d.last_execute_ts)}`, title: fT('Last Execute', d.last_execute_ts), style: "background-color: #000000 !important; color: #ffffff !important; border-color: #333333 !important;" });
        sysTagsData.push({ text: `U:${fD(d.last_update_ts)}`, title: fT('Last Update', d.last_update_ts), style: "background-color: #fb8c00 !important; color: #fff !important; border-color: #ef6c00 !important;" });
        sysTagsData.push({ text: `R:${fD(d.last_read_ts)}`, title: fT('Last Read', d.last_read_ts), style: "background-color: #43a047 !important; color: #fff !important; border-color: #2e7d32 !important;" });
        sysTagsData.push({ text: `C:${fD(d.created_at)}`, title: fT('Created', d.created_at), style: "background-color: #1e88e5 !important; color: #fff !important; border-color: #1565c0 !important;" });
        
        sysTagsData.push({ text: `X:${d.executes || 0}`, title: "Executes", style: "background-color: #000000 !important; color: #ffffff !important; border-color: #333333 !important;" });
        sysTagsData.push({ text: `U:${d.updates || 0}`, title: "Updates", style: "background-color: #fb8c00 !important; color: #fff !important; border-color: #ef6c00 !important;" });
        sysTagsData.push({ text: `R:${d.reads || 0}`, title: "Reads", style: "background-color: #43a047 !important; color: #fff !important; border-color: #2e7d32 !important;" });
        
        sysTagsData.push({ text: d.size || '0KB', title: "Size" });
        sysTagsData.push({ text: ownerText, title: `Owner: ${d.owner || 'Sys'}`, style: ownerStyle });

        let sysTagsHtml = '';
        sysTagsData.forEach(t => {
            sysTagsHtml += `<div class="pill pill-sys" title="${escapeHtml(t.title)}" style="${t.style || ''}">${escapeHtml(t.text)}</div>`;
        });

        const checkAuth = (listName) => {
            if (isOwner) return true;
            if (!listName) return false;
            const list = d[listName] || [];
            return list.some(entry => tokens.includes(entry));
        };

        const getBtnState = (char, listName, actionName) => {
            // Protection Tag suchen (beginnt mit 🛡️), falls vorhanden
            const isProtected = d.user_tags && d.user_tags.some(t => t.startsWith('🛡️') && t.includes(char));
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

        // Special Render for Markdown in Grid-1
        if (isGrid1 && isDocked && foundMime && foundMime.type === 'MD' && mdAppTemplate) {
            // Inject subtle scrollbar styles & force Preview Mode for "Confluence Look"
            const customStyles = `
            <style>
                /* Warm Sepia Look */
                body, #app-body, #preview-section { background-color: #fdf6e3 !important; color: #3b2f20 !important; }
                .prose { color: #3b2f20 !important; }
                .prose h1, .prose h2, .prose h3, .prose h4, .prose strong { color: #2a2116 !important; }

                /* Images: Centered & Shadow */
                .prose img { display: block; margin: 20px auto; box-shadow: 0 10px 25px rgba(0,0,0,0.15); border-radius: 4px; }

                /* Headings: Fine underline, fit content */
                .prose h1, .prose h2, .prose h3 { border-bottom: 1px solid rgba(59, 47, 32, 0.2); width: fit-content; padding-bottom: 4px; }

                /* Blockquotes: Colored bar left */
                .prose blockquote { border-left: 4px solid #cb4b16 !important; padding-left: 1rem; font-style: italic; color: #584e40 !important; background: rgba(0,0,0,0.03); border-radius: 0 4px 4px 0; }

                /* Code Blocks: Dark background for readability (matches github-dark theme) */
                .prose pre { background-color: #1e1e1e !important; color: #e6e6e6 !important; border-radius: 6px; border: 1px solid rgba(0,0,0,0.1); }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(59, 47, 32, 0.2); border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(59, 47, 32, 0.4); }
            </style>
            <script>
                window.addEventListener('load', () => { if (typeof setMode === 'function') setMode('preview'); });
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'F11') {
                        e.preventDefault();
                        window.parent.postMessage('toggle-fullscreen', '*');
                    }
                });
            </script>`;

            const safeJson = JSON.stringify(d).replace(/<\/script>/g, '<\\/script>');
            const injectedDataScript = `<script type="application/json" id="markdown-template">${safeJson}</script>`;
            
            // --- CONTEXT INJECTION FOR CONFLUENCE MODE ---
            // This is crucial for the Save button to work inside the sandboxed app.
            // It mirrors the logic from app.js's generateSecureAppBlob.
            const contextData = {
                key: doc.id, 
                webhookUrl: "https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977",
                action: "U",
                documentData: d, // Pass the full document data
                isEmulator: ['localhost', '127.0.0.1'].includes(window.location.hostname)
            };
            const jsonStr = JSON.stringify(contextData).replace(/<\/script>/g, '<\\/script>');
            const injectedContext = `<script>try{window.CRUDX_CONTEXT=${jsonStr}; window.CRUDX_CONTEXT.isEmulator = ${contextData.isEmulator};}catch(e){console.error("Ctx Inj Fail",e);}</script>`;

            let appContent = mdAppTemplate;
            if (/<head>/i.test(appContent)) {
                appContent = appContent.replace(/<head>/i, `<head>${injectedContext}`);
                appContent = appContent.replace('</body>', `${customStyles}${injectedDataScript}</body>`);
            } else {
                appContent = `${injectedContext}${appContent}${customStyles}${injectedDataScript}`;
            }
            const blob = new Blob([appContent], { type: 'text/html' });
            const blobUrl = URL.createObjectURL(blob);

            htmlBuffer += `
            <div class="card-kv" data-mime="MD" style="padding:0; overflow:hidden;">
                <iframe src="${blobUrl}" allow="fullscreen" style="width:100%; height:100%; border:none; display:block;"></iframe>
                
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
            </div>`;
            continue;
        }

        htmlBuffer += `
            <div class="card-kv" data-mime="${foundMime ? foundMime.type : ''}">
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
                    ${whitelistPills.join('')}
                    ${userTagsHtml}
                </div>
            </div>`;
    }
    container.innerHTML = htmlBuffer;
}