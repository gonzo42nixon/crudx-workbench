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

    const fieldConfig = {
        integers:   ['reads', 'updates', 'executes'],
        timestamps: ['created_at', 'last_update_ts', 'last_read_ts', 'last_execute_ts'],
        arrays:     ['user_tags', 'access_control', 'white_list_read', 'white_list_update', 'white_list_delete', 'white_list_execute'],
        strings:    ['label', 'value', 'owner', 'size']
    };

    for (const [key, val] of Object.entries(input)) {
        if (key === 'key') continue;
        if (val === undefined || val === null) continue;

        if (fieldConfig.integers.includes(key)) {
            const num = parseInt(val, 10);
            if (!isNaN(num)) {
                fields[key] = { integerValue: String(num) };
            }
            continue;
        }

        if (fieldConfig.timestamps.includes(key)) {
            // Handle Firestore Timestamp objects directly
            if (val && val.toDate && typeof val.toDate === 'function') {
                fields[key] = { timestampValue: val.toDate().toISOString() };
            } else if (isValidIsoDate(val)) {
                fields[key] = { timestampValue: val };
            } else if (typeof val === 'string' && val.trim() !== "") {
                fields[key] = { stringValue: val };
            }
            continue;
        }

        if (fieldConfig.arrays.includes(key)) {
            if (Array.isArray(val)) {
                const cleanValues = val.filter(item => item && typeof item === 'string' && item.trim() !== "");
                const firestoreValues = cleanValues.map(item => ({ stringValue: item }));
                fields[key] = {
                    arrayValue: {
                        values: firestoreValues
                    }
                };
            }
            continue;
        }

        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
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