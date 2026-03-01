import { collection, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

function encodeOCR(id) {
    const map = { '0': 'C', '1': 'R', '6': 'U', '7': 'D', '9': 'X' };
    let raw = id.toString().padStart(15, '0'); 
    let encoded = raw.split('').map(char => map[char] || char).join('');
    let groups = encoded.match(/.{1,5}/g) || [];
    return `CRUDX-${groups.join('-')}`.toUpperCase();
}

const FREEMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'freenet.de', 'icloud.com'
]);

function validateGenericEmail(email) {
    const [local, domain] = email.split('@');
    if (!local || !domain) return;

    if (local === '*' && domain === '*') {
        console.warn(`⚠️ [${email}] This is unrestricted usage!`);
    } else if (local === '*' && FREEMAIL_DOMAINS.has(domain)) {
        console.warn(`⚠️ [${email}] This is a freemailer with a very large user base.`);
    } else if (domain === '*' && local !== '*') {
        console.warn(`⚠️ [${email}] Please do not specify a name addressing a natural person here, but a group, role or team.`);
    }
}

export async function seedData(db) {
    const totalRecords = 333;
    const batchSize = 500;
    const colRef = collection(db, "kv-store");
    
    // Erweiterte MIME-Typen mit großem Datenvolumen
    const payloads = [
        { type: "JSON_CONFIG", ext: ".json", val: JSON.stringify({ system: "CRUDX-OS", kernel: "v8.2", modules: Array(20).fill("MOD-SEC-X9"), logs: "Full diagnostic dump initiated..." }, null, 2) },
        { type: "LOG_EXPORT", ext: ".log", val: Array(30).fill("2026-02-23 14:00:01 [INFO] Node-Synchronicity: OK").join("\n") },
        { type: "CSV_DATA", ext: ".csv", val: "id,metric,value,unit,status\n" + Array(40).fill("1,TEMP_CORE,45.2,CELSIUS,STABLE").join("\n") },
        { type: "SOURCE_CODE", ext: ".js", val: "/**\n * CRUDX Core Engine\n */\nclass Core {\n  constructor() {\n    this.state = 'INIT';\n  }\n  " + "run() { console.log('Processing...'); }\n".repeat(15) + "}" },
        { type: "MARKDOWN_DOC", ext: ".md", val: "# CRUDX Documentation\n\n## Overview\n" + "This is a high-volume data block for stress testing the UI layout. ".repeat(20) },
        { type: "SVG_GRAPHIC", ext: ".svg", val: "<svg width='100' height='100'><circle cx='50' cy='50' r='40' stroke='green' stroke-width='4' fill='yellow' />" + "<text x='10' y='50'>DATA</text></svg>" },
        { type: "SQL_DUMP", ext: ".sql", val: "INSERT INTO system_registry (key, val, permissions) VALUES \n" + Array(15).fill("('SYS_01', 'BLOCK_DATA', '775')").join(",\n") + ";" },
        { type: "XML_SCHEMA", ext: ".xml", val: "<?xml version='1.0'?>\n<env:Envelope xmlns:env='http://www.w3.org/2003/05/soap-envelope'>\n<env:Body><data>" + "A".repeat(200) + "</data></env:Body></env:Envelope>" },
        { type: "PYTHON_SCRIPT", ext: ".py", val: "def main():\n    '''System Maintenance'''\n    items = [i for i in range(100)]\n    print(f'Cleaning {len(items)} units...')\n\nmain()" },
        { type: "CSS_THEME", ext: ".css", val: ":root {\n  --primary: #00ff00;\n  --bg: #000000;\n}\n" + ".card { border: 1px solid var(--primary); padding: 20px; }".repeat(10) },
        { type: "SVG_GRAPHIC", type: "SVG_GRAPHIC", ext: ".svg", val: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="purple" /></svg>` },
        { type: "BINARY_DATA", ext: ".bin", val: "0x43 0x52 0x55 0x44 0x58 0x20 0x42 0x49 0x4E 0x41 0x52 0x59" }
    ];

    const userTagPool = ["critical", "backup", "external", "reviewed", "legacy", "sync-pending"];
    
    // Pool an echten Ownern für Whitelist-Tests
    const realUsers = [
        "drueffler@gmail.com",
        "gonzo42nixon@gmail.com",
        "gertrud3@gmx.de"
    ];

    const genericRoles = ['info', 'admin', 'sales', 'support', 'contact', 'marketing', 'office', 'hr', 'finance', 'dev'];
    const genericPool = [
        "*@*",
        "*@gmail.com",
        "*@gmx.de",
        "drueffler@*", 
        ...genericRoles.map(r => `${r}@*`)
    ];
    const allCandidates = [...realUsers, ...genericPool];

    try {
        console.log(`🚀 Starte Injection von ${totalRecords} Dokumenten...`);
        
        for (let i = 0; i < totalRecords; i += batchSize) {
            const batch = writeBatch(db);
            const currentChunk = Math.min(batchSize, totalRecords - i);

            for (let j = 0; j < currentChunk; j++) {
                const index = i + j;
                const baseId = 3000000000 + index;
                const ocrId = encodeOCR(baseId);
                const docRef = doc(colRef, ocrId);
                const payload = payloads[index % payloads.length];
                const owner = realUsers[index % realUsers.length];

                // Helper für Whitelist-Generierung (max 50% gefüllt, Mix aus 1 oder mehreren Einträgen)
                const getWhitelist = (currentOwner) => {
                    if (Math.random() > 0.5) return []; // 50% leer (Count 0)
                    
                    const pool = allCandidates.filter(u => u !== currentOwner);
                    let selection = [];

                    if (Math.random() < 0.3) {
                        const count = Math.floor(Math.random() * 2) + 2;
                        for(let k=0; k<count; k++) selection.push(pool[Math.floor(Math.random() * pool.length)]);
                    } else {
                        selection = [pool[Math.floor(Math.random() * pool.length)]];
                    }
                    
                    const unique = [...new Set(selection)];
                    unique.forEach(validateGenericEmail);
                    return unique;
                };

                const wlRead = getWhitelist(owner);
                const wlUpdate = getWhitelist(owner);
                const wlDelete = getWhitelist(owner);
                const wlExecute = getWhitelist(owner);
                const accessControl = [...new Set([owner, ...wlRead, ...wlUpdate, ...wlDelete, ...wlExecute])];

                batch.set(docRef, {
                    label: `VOL_DATA_${index}_${payload.type}${payload.ext}`,
                    value: payload.val,
                    size: `${(Math.random() * 500 + 50).toFixed(1)}KB`,
                    owner: owner,
                    reads: Math.floor(Math.random() * 10000),
                    updates: Math.floor(Math.random() * 500),
                    executes: Math.floor(Math.random() * 100),
                    created_at: new Date(Date.now() - (index * 3600000)).toISOString(),
                    last_read_ts: new Date().toISOString(),
                    last_update_ts: new Date().toISOString(),
                    last_execute_ts: new Date().toISOString(),
                    user_tags: [userTagPool[index % userTagPool.length], "AUTO_GEN"],
                    access_control: accessControl,
                    white_list_read: wlRead,
                    white_list_update: wlUpdate,
                    white_list_delete: wlDelete,
                    white_list_execute: wlExecute
                });
            }

            await batch.commit();
            console.log(`📦 Chunk (${i + currentChunk}/${totalRecords}) committed.`);
        }

        alert(`✅ Massen-Injection (Whitelist-Fix) abgeschlossen: ${totalRecords} Records erstellt.`);
        location.reload();
    } catch (error) {
        console.error("❌ Mass-Seed Fehler:", error);
        alert("Fehler bei der Massen-Injection. Konsole prüfen.");
    }
}