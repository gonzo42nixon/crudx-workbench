import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from './firebase.js';

let executionWindowZIndex = 3500;
let executionWindowOffset = 0;

// --- HELPER: Generate Secure App Blob (Shared logic for X-Button and Confluence Mode) ---
export async function generateSecureAppBlob(key, d) {
    const tags = d.user_tags || [];
    let contextData = null;
    
    // 1. Build Params
    const params = new URLSearchParams();
    params.append("action", "X");
    params.append("key", key);

    if (tags.includes("app")) {
        params.set("app", key);
    }
    if (tags.includes("data")) {
        params.set("data", key);
        const xTag = tags.find(t => t.startsWith("x:"));
        if (xTag) params.set("app", xTag.substring(2));
    }
    // Aux Tags
    tags.forEach(t => {
        if (t.startsWith("s:")) params.set("settings", t.substring(2));
        if (t.startsWith("d1:")) params.set("data-1", t.substring(3));
        if (t.startsWith("d2:")) params.set("data-2", t.substring(3));
        if (t.startsWith("d3:")) params.set("data-3", t.substring(3));
        if (t.startsWith("d4:")) params.set("data-4", t.substring(3));
    });

    if (!params.has("app")) return null; // Not an app execution

    // 2. Fetch App Content
    const appKey = params.get("app");
    let appContent = "";

    if (appKey === key) {
        appContent = d.value;
    } else {
        const appDocSnap = await getDoc(doc(db, "kv-store", appKey));
        if (appDocSnap.exists()) {
            appContent = appDocSnap.data().value;
        } else {
            return null; // App not found
        }
    }

    // 3. Inject Context & Data
    if (appContent && typeof appContent === 'string' && !appContent.startsWith("<h3>⚠️")) {
        let injectedData = "";
        if (params.has("data")) {
            const safeJson = JSON.stringify(d).replace(/<\/textarea>/g, '<\\/textarea>');
            injectedData = `<textarea id="markdown-template" style="display: none;">${safeJson}</textarea>`;
        }
        
        contextData = {
            key: params.get("data") || key, 
            webhookUrl: "https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977",
            action: "U",
            label: d.label || "",
            owner: d.owner || "",
            documentData: d, // Pass full document data for context reconstruction
            user_tags: d.user_tags || [],
            white_list_read: d.white_list_read || [],
            white_list_update: d.white_list_update || [],
            white_list_delete: d.white_list_delete || [],
            white_list_execute: d.white_list_execute || []
        };
        const jsonStr = JSON.stringify(contextData).replace(/<\/script>/g, '<\\/script>');
        // Inject isEmulator flag into the context
        const injectedContext = `<script>try{window.CRUDX_CONTEXT=${jsonStr}; window.CRUDX_CONTEXT.isEmulator = ${['localhost', '127.0.0.1'].includes(window.location.hostname)};}catch(e){console.error("Ctx Inj Fail",e);}</script>`;

        // FIX: Inject Context early (Head) if possible, Data late (Body)
        if (/<head>/i.test(appContent)) {
            appContent = appContent.replace(/<head>/i, `<head>${injectedContext}`);
            if (/<\/body>/i.test(appContent)) {
                appContent = appContent.replace(/<\/body>/i, `${injectedData}</body>`);
            } else {
                appContent += injectedData;
            }
        } else {
            // Fallback
            const bodyEndRegex = /<\/body>/i;
            if (bodyEndRegex.test(appContent)) {
                appContent = appContent.replace(bodyEndRegex, `${injectedData}${injectedContext}</body>`);
            } else {
                appContent += injectedData + injectedContext;
            }
        }
    }
    return { blob: new Blob([appContent], { type: 'text/html' }), contextData };
}

export function createExecutionWindow(targetUrl, contentValue, key) {
    executionWindowZIndex++;
    executionWindowOffset += 30;
    // Reset offset if it gets too far down/right
    if (executionWindowOffset > 150) executionWindowOffset = 30;

    const div = document.createElement('div');
    // KEIN Wrapper mehr, direkt das Fenster erstellen
    div.className = 'modal-content execution-window'; 
    if (key) div.dataset.key = key; // Store key to bridge with Update Modal
    div.style.zIndex = executionWindowZIndex;
    
    // Default dimensions
    let width = '90vw';
    let height = '90vh';
    
    // Parse dimensions from content
    if (contentValue && typeof contentValue === 'string') {
        const wMatch = contentValue.match(/width=["']?(\d+)(?:px)?["']?/i);
        const hMatch = contentValue.match(/height=["']?(\d+)(?:px)?["']?/i);
        if (wMatch && hMatch) {
            width = `${parseInt(wMatch[1]) + 40}px`; // +40px buffer for borders/padding
            height = `${parseInt(hMatch[1]) + 80}px`; // +80px for Header + padding
        }
    }

    // Styles direkt auf das Fenster anwenden
    div.style.width = width;
    div.style.height = height;
    div.style.position = 'absolute';
    div.style.top = `calc(50% + ${executionWindowOffset}px)`;
    div.style.left = `calc(50% + ${executionWindowOffset}px)`;
    div.style.transform = 'translate(-50%, -50%)';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.padding = '0';
    div.style.overflow = 'hidden';
    div.style.resize = 'both';
    div.style.minWidth = '400px';
    div.style.minHeight = '300px';

    div.innerHTML = `
            <div class="modal-drag-handle" style="padding: 10px; background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--editor-border); display: flex; justify-content: space-between; align-items: center; gap: 15px; cursor: move;">
                <span style="font-size: 1.2rem;">🚀</span>
                <input type="text" readonly value="${targetUrl}" style="flex: 1; background: #000; border: 1px solid #333; color: #00ff00; padding: 6px 10px; font-family: 'JetBrains Mono', monospace; font-size: 0.85em; border-radius: 4px; outline: none;">
                <span class="btn-external" title="Open in New Tab" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">🔗</span>
                <span class="btn-transparency" title="Toggle Transparency" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">👁️</span>
                <span class="btn-close" title="Close" style="cursor: pointer; font-size: 1.2rem;">✕</span>
            </div>
            <div class="execution-iframe-container" style="position: relative; flex: 1; overflow: hidden;">
                <iframe src="${targetUrl}" style="width: 100%; height: 100%; border: none; background: var(--canvas-bg);"></iframe>
            </div>
    `;

    document.body.appendChild(div);

    const content = div; // Das div IST jetzt der Content
    const handle = div.querySelector('.modal-drag-handle');
    const btnClose = div.querySelector('.btn-close');
    const btnTrans = div.querySelector('.btn-transparency');
    const btnExternal = div.querySelector('.btn-external');
    const iframe = div.querySelector('iframe');
    const iframeContainer = div.querySelector('.execution-iframe-container');

    // Bring to front on click
    content.addEventListener('mousedown', () => {
        executionWindowZIndex++;
        div.style.zIndex = executionWindowZIndex;
    });

    // Open External
    btnExternal.addEventListener('click', () => {
        window.open(targetUrl, '_blank');
    });

    // Close
    btnClose.addEventListener('click', () => {
        document.body.removeChild(div);
    });

    // Transparency
    let transLevel = 0;
    btnTrans.addEventListener('click', () => {
        transLevel = (transLevel + 1) % 3;
        content.classList.remove('iframe-trans-1', 'iframe-trans-2');
        if (transLevel === 1) {
            content.classList.add('iframe-trans-1');
            btnTrans.style.opacity = "1";
        } else if (transLevel === 2) {
            content.classList.add('iframe-trans-2');
            btnTrans.style.opacity = "0.5";
        } else {
            btnTrans.style.opacity = "0.8";
        }
    });

    // Drag Logic (Specific to this instance)
    let isDragging = false;
    let startX, startY, startTransX, startTransY;

    handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('.btn-close') || e.target.closest('.btn-transparency') || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const style = window.getComputedStyle(content);
        const matrix = new WebKitCSSMatrix(style.transform);
        startTransX = matrix.m41;
        startTransY = matrix.m42;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        content.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}