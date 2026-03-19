import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from './firebase.js';

let executionWindowZIndex = 3500;
let executionWindowOffset = 0;

// --- HELPER: Pre-process HTML to escape premature </script> closures ─────────────────────
// If an app's JavaScript contains the literal string "</script>" (e.g. as a template
// string or HTML snippet), the HTML5 parser terminates the <script> element at that
// point, truncating the JS and causing "Unexpected end of input".
// Fix: for each <script> block, treat the LAST </script> (before the next <script>
// opening) as the proper closing tag and escape every earlier occurrence as <\/script>.
// JavaScript treats <\/script> identically to </script> inside string literals.
function _fixScriptClosings(html) {
    const lc  = html.toLowerCase();
    const out = [];
    let p = 0;

    while (p < html.length) {
        const so = lc.indexOf('<script', p);
        if (so < 0) { out.push(html.slice(p)); break; }

        const oe = lc.indexOf('>', so);
        if (oe < 0) { out.push(html.slice(p)); break; }

        out.push(html.slice(p, oe + 1));   // everything up to and including opening tag
        const bs = oe + 1;

        // Collect every </script occurrence from bs onward
        const cls = [];
        for (let q = bs; ; ) {
            const ci = lc.indexOf('</script', q);
            if (ci < 0) break;
            cls.push(ci);
            q = ci + 1;
        }
        if (!cls.length) { out.push(html.slice(bs)); p = html.length; break; }

        // Only consider closes that belong to THIS script block (before the next <script>)
        const no  = lc.indexOf('<script', bs);
        const rel = no >= 0 ? cls.filter(c => c < no) : cls;
        const arr = rel.length > 0 ? rel : cls;
        const prop = arr[arr.length - 1];  // last relevant close = proper closing tag

        // Body: everything from bs to prop — escape any intermediate </script inside it
        out.push(html.slice(bs, prop).replace(/<\/script/gi, '<\\/script'));

        // Emit the proper closing tag verbatim
        const ce  = lc.indexOf('>', prop);
        const end = ce >= 0 ? ce + 1 : prop + 9;
        out.push(html.slice(prop, end));
        p = end;
    }
    return out.join('');
}

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
        // Pre-process: escape any </script literals inside the app's own <script> blocks.
        // Prevents "Unexpected end of input" caused by </script> string literals in JS code
        // (e.g. const TEMPLATE = "</script>") which the HTML5 parser misreads as an end tag.
        appContent = _fixScriptClosings(appContent);

        let injectedData = "";
        if (params.has("data")) {
            // ── Safe JSON Injection via Base64 ───────────────────────────────────────
            //
            // Injecting raw JSON directly into HTML caused parser corruption whenever
            // the document value contained angle brackets, quotes, or any sequence that
            // the HTML parser could misinterpret (e.g. </script>, </textarea>, etc.).
            //
            // Solution: Base64-encode the entire document JSON.
            //   • Base64 output contains only [A-Za-z0-9+/=] — zero HTML-special chars.
            //   • A small synchronous inline decoder script placed right after the
            //     textarea restores textarea.value to the original JSON string at
            //     parse-time, before DOMContentLoaded fires.
            //   • Existing editor apps that read textarea.value and call JSON.parse()
            //     require NO changes — they see the decoded JSON as before.
            //
            // unescape(encodeURIComponent(…)) converts the UTF-8 string to a Latin-1
            // compatible byte sequence that btoa() can handle without errors.
            const rawJson = JSON.stringify(d);
            const b64Json = btoa(unescape(encodeURIComponent(rawJson)));

            // Split '</script>' as a concatenation so this JS source itself cannot be
            // closed by that sequence if this file is ever injected into an HTML context.
            const closeTag = '<' + '/script>';
            const decoderScript =
                `<script>` +
                `(function(){` +
                    `var t=document.getElementById('markdown-template');` +
                    `if(t&&t.getAttribute('data-b64')==='1'){` +
                        `try{t.value=decodeURIComponent(escape(atob(t.value)));}` +
                        `catch(e){console.warn('CRUDX:b64-decode',e);}` +
                        `t.removeAttribute('data-b64');` +
                    `}` +
                `})();` +
                closeTag;

            injectedData =
                `<textarea id="markdown-template" data-b64="1" style="display:none;">${b64Json}</textarea>` +
                decoderScript;
        }
        const { value: _omit, ...docDataForCtx } = d;
        contextData = {
            key: params.get("data") || key, 
            webhookUrl: "https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977",
            action: "U",
            label: d.label || "",
            owner: d.owner || "",
            documentData: docDataForCtx, // value excluded – already in textarea
            user_tags: d.user_tags || [],
            white_list_read: d.white_list_read || [],
            white_list_update: d.white_list_update || [],
            white_list_delete: d.white_list_delete || [],
            white_list_execute: d.white_list_execute || []
        };
        // Also escape U+2028 / U+2029 which are valid JSON but terminate JS lines
        const jsonStr = JSON.stringify(contextData)
            .replace(/<\/script>/g, '<\\/script>')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
        // Inject isEmulator flag into the context
        const injectedContext = `<script>try{window.CRUDX_CONTEXT=${jsonStr}; window.CRUDX_CONTEXT.isEmulator = ${['localhost', '127.0.0.1'].includes(window.location.hostname)};}catch(e){console.error("Ctx Inj Fail",e);}</script>`;

        // Protective guard: if the app has an unclosed <script> anywhere before the
        // injection point, the HTML parser would be in RAWTEXT mode and would swallow
        // the textarea + decoder script as raw text rather than as HTML elements.
        // Inserting a stray </script> end tag before injectedData is harmless when no
        // script is open (the parser ignores unexpected end tags), but correctly closes
        // any unclosed <script> so the textarea lands in the normal HTML flow.
        const safeClose = '<' + '/script>';

        // Inject CRUDX_CONTEXT early (inside <head>) and data late (before </body>)
        if (/<head>/i.test(appContent)) {
            appContent = appContent.replace(/<head>/i, `<head>${injectedContext}`);
            if (/<\/body>/i.test(appContent)) {
                appContent = appContent.replace(/<\/body>/i, `${safeClose}${injectedData}</body>`);
            } else {
                appContent += safeClose + injectedData;
            }
        } else {
            // Fallback: no <head> detected
            const bodyEndRegex = /<\/body>/i;
            if (bodyEndRegex.test(appContent)) {
                appContent = appContent.replace(bodyEndRegex, `${safeClose}${injectedData}${injectedContext}</body>`);
            } else {
                appContent += safeClose + injectedData + injectedContext;
            }
        }
    }
    return { blob: new Blob([appContent], { type: 'text/html' }), contextData };
}

/**
 * Parses an init tag of the form "init:Height10%Width50%X10%Y90%".
 * X = left edge of the window in vw  (0 = viewport left,  100 = right)
 * Y = top  edge of the window in vh  (0 = viewport top,   100 = bottom)
 * All four keys are optional; missing keys fall back to the 50% preset values.
 */
function _parseInitTag(tags) {
    const tag = (tags || []).find(t => /^init:/i.test(t));
    if (!tag) return null;
    const s = tag.slice(5);
    const h = s.match(/Height(\d+(?:\.\d+)?)%/i);
    const w = s.match(/Width(\d+(?:\.\d+)?)%/i);
    const x = s.match(/X(\d+(?:\.\d+)?)%/i);
    const y = s.match(/Y(\d+(?:\.\d+)?)%/i);
    if (!h && !w && !x && !y) return null;
    return {
        heightPct: h ? parseFloat(h[1]) : null,  // % of viewport height
        widthPct:  w ? parseFloat(w[1]) : null,  // % of viewport width
        x:         x ? parseFloat(x[1]) : null,  // left edge in % of vw
        y:         y ? parseFloat(y[1]) : null,  // top  edge in % of vh
    };
}

export function createExecutionWindow(targetUrl, contentValue, key, tags = []) {
    executionWindowZIndex++;
    executionWindowOffset += 30;
    // Reset offset if it gets too far down/right
    if (executionWindowOffset > 150) executionWindowOffset = 30;

    const div = document.createElement('div');
    // KEIN Wrapper mehr, direkt das Fenster erstellen
    div.className = 'modal-content execution-window'; 
    if (key) div.dataset.key = key; // Store key to bridge with Update Modal
    div.style.zIndex = executionWindowZIndex;
    
    // Base layout styles — size/position are applied by _sizePresets below
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.padding = '0';
    div.style.overflow = 'hidden';

    div.innerHTML = `
            <div class="modal-drag-handle" style="padding: 10px; background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--editor-border); display: flex; justify-content: space-between; align-items: center; gap: 15px; cursor: move;">
                <span style="font-size: 1.2rem;">🚀</span>
                <input type="text" readonly value="${targetUrl}" style="flex: 1; background: #000; border: 1px solid #333; color: #00ff00; padding: 6px 10px; font-family: 'JetBrains Mono', monospace; font-size: 0.85em; border-radius: 4px; outline: none;">
                <span class="btn-external" title="Open in New Tab" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">🔗</span>
                <span class="btn-size" title="Toggle Window Size (50% → 100% → 20%)" style="cursor:pointer;font-size:0.75rem;font-weight:bold;opacity:0.8;padding:2px 8px;border:1px solid rgba(255,255,255,0.3);border-radius:4px;min-width:38px;text-align:center;user-select:none;">50%</span>
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
    const btnSize = div.querySelector('.btn-size');

    // ── Screen-Size Toggle ─────────────────────────────────────────────────────
    // Cycles:  50% (portrait 1:2, 90 vh, centered)
    //       → 100% (fixed full-screen)
    //       → 20% (portrait 1:2, 40 vh, centered)
    let sizeIdx = 0;
    const _sizePresets = [
        {
            label: '50%',
            apply() {
                const H = window.innerHeight * 0.9;
                const W = H * 2 / 3;
                div.style.position  = 'fixed';
                div.style.width     = `${W}px`;
                div.style.height    = `${H}px`;
                div.style.maxWidth  = '';
                div.style.maxHeight = '';
                div.style.left      = `${(window.innerWidth  - W) / 2}px`;
                div.style.top       = `${(window.innerHeight - H) / 2}px`;
                div.style.transform = 'none';
                div.style.resize    = 'both';
                div.style.minWidth  = '';
                div.style.minHeight = '';
                div.style.margin    = '';
            }
        },
        {
            label: '100%',
            apply() {
                div.style.position  = 'fixed';
                div.style.width     = '100vw';
                div.style.height    = '100vh';
                div.style.maxWidth  = '100vw';
                div.style.maxHeight = '100vh';  // override the CSS max-height: 90vh
                div.style.top       = '0';
                div.style.left      = '0';
                div.style.transform = 'none';
                div.style.resize    = 'none';
                div.style.minWidth  = '';
                div.style.minHeight = '';
                div.style.margin    = '0';
            }
        },
        {
            label: '33%',
            apply() {
                const S = window.innerHeight * 0.33;
                div.style.position  = 'fixed';
                div.style.width     = `${S}px`;
                div.style.height    = `${S}px`;
                div.style.maxWidth  = '';
                div.style.maxHeight = '';
                div.style.left      = `${(window.innerWidth  - S) / 2}px`;
                div.style.top       = `${(window.innerHeight - S) / 2}px`;
                div.style.transform = 'none';
                div.style.resize    = 'both';
                div.style.minWidth  = '';
                div.style.minHeight = '';
                div.style.margin    = '';
            }
        }
    ];

    // Apply init config from tag (if present) — otherwise fall back to the 50% preset
    const _initCfg = _parseInitTag(tags);
    if (_initCfg) {
        const iH = window.innerHeight;
        const iW = window.innerWidth;
        const initH = _initCfg.heightPct != null ? iH * _initCfg.heightPct / 100 : iH * 0.9;
        const initW = _initCfg.widthPct  != null ? iW * _initCfg.widthPct  / 100 : initH * 2 / 3;
        const initL = _initCfg.x != null ? iW * _initCfg.x / 100 : (iW - initW) / 2;
        const initT = _initCfg.y != null ? iH * _initCfg.y / 100 : (iH - initH) / 2;
        div.style.position  = 'fixed';
        div.style.width     = `${initW}px`;
        div.style.height    = `${initH}px`;
        div.style.maxWidth  = '';
        div.style.maxHeight = '';
        div.style.left      = `${initL}px`;
        div.style.top       = `${initT}px`;
        div.style.transform = 'none';
        div.style.resize    = 'both';
        div.style.minWidth  = '';
        div.style.minHeight = '';
        div.style.margin    = '0';
    } else {
        _sizePresets[0].apply();
    }

    btnSize.addEventListener('click', () => {
        sizeIdx = (sizeIdx + 1) % _sizePresets.length;
        _sizePresets[sizeIdx].apply();
        btnSize.textContent = _sizePresets[sizeIdx].label;
    });

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

    // Drag Logic — uses left/top (no transform) so resize: both works without jitter
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
        if (sizeIdx === 1) return; // no drag in full-screen mode
        if (e.target.closest('.btn-close') || e.target.closest('.btn-transparency') || e.target.closest('.btn-size') || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        isDragging = true;
        startX    = e.clientX;
        startY    = e.clientY;
        startLeft = parseFloat(div.style.left) || 0;
        startTop  = parseFloat(div.style.top)  || 0;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        div.style.left = `${startLeft + (e.clientX - startX)}px`;
        div.style.top  = `${startTop  + (e.clientY - startY)}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}