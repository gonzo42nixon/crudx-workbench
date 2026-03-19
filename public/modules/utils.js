/**
 * Applies system-wide automatic tag rules to a tag array.
 * Idempotent: if the auto-tag already exists it is not duplicated.
 *
 * Current rules:
 *   • "HTML"  →  "edit:CRUDX-CORE_-_APP_-HTML_"
 */
export function applyAutoTags(tags = []) {
    const result = [...tags];
    if (result.includes('HTML') && !result.includes('edit:CRUDX-CORE_-_APP_-HTML_')) {
        result.push('edit:CRUDX-CORE_-_APP_-HTML_');
    }
    return result;
}

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function encodeOCR(id) {
    const map = { '0': 'C', '1': 'R', '6': 'U', '7': 'D', '9': 'X' };
    let raw = id.toString().padStart(15, '0'); 
    let encoded = raw.split('').map(char => map[char] || char).join('');
    let groups = encoded.match(/.{1,5}/g) || [];
    return `CRUDX-${groups.join('-')}`.toUpperCase();
}

export function getAccessTokens(email) {
    if (!email) return ["*@*"]; // Fallback für öffentliche Dokumente
    const [local, domain] = email.split('@');
    return [
        email,
        `*@${domain}`,
        `${local}@*`,
        `*@*`
    ];
}

export function calculateAccessControl(owner, whitelists) {
    const rawAccess = [
        owner,
        ...(whitelists.read || []),
        ...(whitelists.update || []),
        ...(whitelists.delete || []),
        ...(whitelists.execute || [])
    ].filter(item => item && typeof item === 'string' && item.trim() !== "");
    return rawAccess.length > 0 ? [...new Set(rawAccess)] : ['*@*'];
}

export function getEmailWarning(email) {
    const FREEMAIL_DOMAINS = new Set([
        'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
        'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'freenet.de', 'icloud.com'
    ]);
    const [local, domain] = email.split('@');
    if (!local || !domain) return null;

    if (local === '*' && domain === '*') {
        return "⚠️ This is unrestricted usage!";
    } else if (local === '*' && FREEMAIL_DOMAINS.has(domain)) {
        return "⚠️ This is a freemailer with a very large user base.";
    } else if (domain === '*' && local !== '*') {
        return "⚠️ Please do not specify a name addressing a natural person here, but a group, role or team.";
    }
    return null;
}

export function syntaxHighlight(json) {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, undefined, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

export function isValidIsoDate(str) {
    if (typeof str !== 'string') return false;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    return isoRegex.test(str) && !isNaN(Date.parse(str));
}

/**
 * Konvertiert ein flaches JS-Objekt in einen Firestore REST API Body String.
 */
export function buildFirestoreCreatePayload(input) {
    if (!input || typeof input !== 'object') {
        throw new Error("Input must be a valid object.");
    }

    const docKey = input.key || "";
    const fields = {};

    const timestamps = ['created_at', 'last_update_ts', 'last_read_ts', 'last_execute_ts'];
    const integers = ['reads', 'updates', 'executes'];

    for (const [key, val] of Object.entries(input)) {
        if (key === 'key') continue;
        if (val === undefined || val === null) continue;

        // 1. Arrays verarbeiten
        if (Array.isArray(val)) {
            const firestoreValues = val
                .filter(item => item !== null && item !== undefined)
                .map(item => ({ stringValue: String(item) }));
            fields[key] = { arrayValue: { values: firestoreValues } };
            continue;
        }

        // 2. Bekannte Integers oder Zahlen verarbeiten
        if (integers.includes(key) || typeof val === 'number') {
            fields[key] = { integerValue: String(Math.floor(Number(val))) };
            continue;
        }

        // 3. Timestamps (Bekannte Keys oder ISO Strings)
        if (timestamps.includes(key) || (typeof val === 'string' && isValidIsoDate(val))) {
            const ts = (val && val.toDate) ? val.toDate().toISOString() : val;
            fields[key] = { timestampValue: ts };
            continue;
        }

        // 4. Booleans
        if (typeof val === 'boolean') {
            fields[key] = { booleanValue: val };
            continue;
        }

        if (typeof val === 'string') {
            fields[key] = { stringValue: String(val) };
        }
    }

    const finalFirestoreBody = { fields: fields };
    const bodyRawString = JSON.stringify(finalFirestoreBody);

    return {
        key: docKey,
        body_raw: bodyRawString
    };
}

export function setupModalDrag(modalId) {
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

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        if (isWhitelist) {
            modal.style.left = `${startLeft + dx}px`;
            modal.style.top = `${startTop + dy}px`;
        } else {
            content.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
        }
    };

    const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
}