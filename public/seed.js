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
    
    // 1. Repeatable Payloads (Generic Data) - Werden wiederholt
    const repeatablePayloads = [
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

    // 2. Unique Payloads (Embeds) - Werden nur EINMAL verwendet
    const uniquePayloads = [
        { type: "YOUTUBE_EMBED", ext: ".html", val: `<iframe width="560" height="315" src="https://www.youtube.com/embed/ctI0ZHaBo1s?si=ASvO1JdW007ybU2s" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` },
        { type: "YOUTUBE_EMBED", ext: ".html", val: `<iframe width="560" height="315" src="https://www.youtube.com/embed/STxXS5lLunE?si=SUd-uP8crNYlb8_-" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` },
        { type: "YOUTUBE_EMBED", ext: ".html", val: `<iframe width="560" height="315" src="https://www.youtube.com/embed/wbVoFFC_198?si=__Xg2W7W7iLvqnn5" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` },
        { type: "MAPS_EMBED", ext: ".html", val: `<iframe src="https://www.google.com/maps/embed?pb=!4v1772640965121!6m8!1m7!1saCiO-TWx22mZ9f5DVz2xrw!2m2!1d52.51997608080355!2d13.40944226579172!3f326.08121382580805!4f2.2298753302126926!5f0.4000000000000002" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` },
        { type: "MAPS_LINK", ext: ".url", val: `https://maps.app.goo.gl/bCWtWs4Ev8Azste7A` },
        { type: "MAPS_EMBED", ext: ".html", val: `<iframe src="https://www.google.com/maps/embed?pb=!4v1772641027544!6m8!1m7!1sCAoSFkNJSE0wb2dLRUlDQWdJQ0d3OWluYkE.!2m2!1d40.79488333649915!2d-73.9569749994314!3f176.04404592153963!4f0.6500770268832383!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` },
        { type: "MAPS_EMBED", ext: ".html", val: `<iframe src="https://www.google.com/maps/embed?pb=!3m2!1sde!2sde!4v1772641896298!5m2!1sde!2sde!6m8!1m7!1syY2bm29Cvb_db6HmWQ_wwQ!2m2!1d48.85304488059972!2d2.347925722385016!3f277.11682150822566!4f-13.49372677690097!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` },
        { type: "IMGUR_EMBED", ext: ".html", val: `<blockquote class="imgur-embed-pub" lang="en" data-id="a/uSl6VfH" data-context="false" ><a href="//imgur.com/a/uSl6VfH"></a></blockquote><script async src="//s.imgur.com/min/embed.js" charset="utf-8"></script>` },
        { type: "IMGUR_EMBED", ext: ".html", val: `<blockquote class="imgur-embed-pub" lang="en" data-id="a/wg94qrA"><a href="//imgur.com/wg94qrA"></a></blockquote><script async src="//s.imgur.com/min/embed.js" charset="utf-8"></script>` },
        { type: "IMGUR_EMBED", ext: ".html", val: `<blockquote class="imgur-embed-pub" lang="en" data-id="a/iIMBdju"><a href="//imgur.com/iIMBdju"></a></blockquote><script async src="//s.imgur.com/min/embed.js" charset="utf-8"></script>` }
    ];

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
                
                // Payload-Auswahl: Erst Unique, dann Repeatable
                let payload;
                if (index < uniquePayloads.length) {
                    payload = uniquePayloads[index];
                } else {
                    const offsetIndex = index - uniquePayloads.length;
                    payload = repeatablePayloads[offsetIndex % repeatablePayloads.length];
                }

                const owner = realUsers[index % realUsers.length];

                // Helper to get random users for whitelist (excluding owner)
                const getRandomWhitelist = (currentOwner) => {
                    const pool = allCandidates.filter(u => u !== currentOwner);
                    const count = Math.floor(Math.random() * 2) + 1; // 1 to 2 users
                    const selection = [];
                    for(let k=0; k<count; k++) selection.push(pool[Math.floor(Math.random() * pool.length)]);
                    return [...new Set(selection)];
                };

                let protectionChars = [];
                const generatedWhitelists = {};

                // Helper to determine protection and whitelist status based on percentages
                const getActionState = (isHeavilyProtected) => {
                    const rand = Math.random() * 100;
                    let isProtected, hasWhitelist;

                    if (isHeavilyProtected) { // For UPDATE, DELETE (92% protected)
                        if (rand < 80)      { isProtected = true;  hasWhitelist = false; } // 80% protected by Login
                        else if (rand < 92) { isProtected = true;  hasWhitelist = true;  } // 12% protected by Whitelist
                        else if (rand < 97) { isProtected = false; hasWhitelist = false; } // 5% unprotected by Login
                        else                { isProtected = false; hasWhitelist = true;  } // 3% unprotected by Whitelist
                    } else { // For CREATE, READ, EXECUTE (8% protected)
                        if (rand < 80)      { isProtected = false; hasWhitelist = false; } // 80% unprotected by Login
                        else if (rand < 92) { isProtected = false; hasWhitelist = true;  } // 12% unprotected by Whitelist
                        else if (rand < 97) { isProtected = true;  hasWhitelist = false; } // 5% protected by Login
                        else                { isProtected = true;  hasWhitelist = true;  } // 3% protected by Whitelist
                    }
                    return { isProtected, hasWhitelist };
                };

                // Process each action based on the requested distribution
                const actions = [
                    { char: 'C', key: null,                 heavilyProtected: false }, // CREATE: 8% protected
                    { char: 'R', key: 'white_list_read',    heavilyProtected: false }, // READ: 8% protected
                    { char: 'U', key: 'white_list_update',  heavilyProtected: true  }, // UPDATE: 92% protected
                    { char: 'D', key: 'white_list_delete',  heavilyProtected: true  }, // DELETE: 92% protected
                    { char: 'X', key: 'white_list_execute', heavilyProtected: false }  // EXECUTE: 8% protected
                ];

                actions.forEach(act => {
                    const { isProtected, hasWhitelist } = getActionState(act.heavilyProtected);
                    if (isProtected) {
                        protectionChars.push(act.char);
                    }
                    // CREATE has no whitelist, so its key is null
                    if (act.key) {
                        generatedWhitelists[act.key] = hasWhitelist ? getRandomWhitelist(owner) : [];
                    }
                });

                const wlRead = generatedWhitelists['white_list_read'];
                const wlUpdate = generatedWhitelists['white_list_update'];
                const wlDelete = generatedWhitelists['white_list_delete'];
                const wlExecute = generatedWhitelists['white_list_execute'];
                const accessControl = [...new Set([owner, ...wlRead, ...wlUpdate, ...wlDelete, ...wlExecute])];

                // Sort and Build Tag
                const order = ['C', 'R', 'U', 'D', 'X'];
                protectionChars.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                const protectionTag = protectionChars.length > 0 ? "🛡️ " + protectionChars.join('') : "🛡️ -";

                // User Tags Logic
                const tags = ["AUTO_GEN", protectionTag];
                
                // Add tags for specific embed types
                if (payload.type === 'YOUTUBE_EMBED') {
                    tags.push("youtube");
                } else if (payload.type === 'MAPS_EMBED') {
                    tags.push("gmaps");
                } else if (payload.type === 'IMGUR_EMBED') {
                    tags.push("imgur");
                }

                if (Math.random() < 0.10) tags.push("backup");
                
                const vRand = Math.random();
                if (vRand < 0.08) tags.push("v1");
                else if (vRand < 0.14) tags.push("v2");
                else if (vRand < 0.18) tags.push("v3");
                else if (vRand < 0.21) tags.push("v4");
                else if (vRand < 0.23) tags.push("v5");
                
                const isEmbed = payload.type === 'YOUTUBE_EMBED' || payload.type === 'MAPS_EMBED' || payload.type === 'IMGUR_EMBED';

                if (isEmbed) {
                    // Iframes sind immer app, nie data
                    tags.push("app");
                    tags.push(`x:${ocrId}`);
                } else {
                    if (Math.random() < 0.80) {
                        tags.push("data");
                        tags.push(`x:${ocrId}`);
                    }
                    
                    if (Math.random() < 0.10) {
                        tags.push("app");
                        tags.push(`x:${ocrId}`);
                    }
                }
                
                if (Math.random() < 0.05) tags.push("example");

                // Generate consistent counters and timestamps
                const reads = Math.floor(Math.random() * 20); // 0-19
                const updates = Math.floor(Math.random() * 5); // 0-4
                const executes = Math.floor(Math.random() * 5); // 0-4

                batch.set(docRef, {
                    label: `VOL_DATA_${index}_${payload.type}${payload.ext}`,
                    value: payload.val,
                    size: `${(Math.random() * 500 + 50).toFixed(1)}KB`,
                    owner: owner,
                    reads: reads,
                    updates: updates,
                    executes: executes,
                    created_at: new Date(Date.now() - (index * 3600000)).toISOString(),
                    last_read_ts: reads > 0 ? new Date().toISOString() : null,
                    last_update_ts: updates > 0 ? new Date().toISOString() : null,
                    last_execute_ts: executes > 0 ? new Date().toISOString() : null,
                    user_tags: [...new Set(tags)],
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

        // --- LAUNCHER TEST CASES (Injection) ---
        console.log("🚀 Injecting Launcher Test Cases...");
        const launcherBatch = writeBatch(db);
        
        // 1. Reference Docs (Targets for linking)
        const refDocs = [
            { id: "CRUDX-APP00-00000-00001", label: "REF_APP_CORE", tags: ["app"], val: "App Core Logic" },
            { id: "CRUDX-SET00-00000-00001", label: "REF_SETTINGS_V1", tags: ["config"], val: "{ \"theme\": \"dark\" }" },
            { id: "CRUDX-DAT01-00000-00001", label: "REF_DATA_AUX_1", tags: ["data"], val: "Aux Data 1" },
            { id: "CRUDX-DAT02-00000-00001", label: "REF_DATA_AUX_2", tags: ["data"], val: "Aux Data 2" },
            { id: "CRUDX-DAT03-00000-00001", label: "REF_DATA_AUX_3", tags: ["data"], val: "Aux Data 3" }
        ];

        refDocs.forEach(d => {
            launcherBatch.set(doc(colRef, d.id), {
                label: d.label,
                value: d.val,
                user_tags: [...d.tags, "AUTO_GEN"],
                owner: "system@crudx.io",
                created_at: new Date().toISOString(),
                access_control: ["*@*"], // Public access
                white_list_execute: ["*@*"]
            });
        });

        // 2. Test Scenarios (The buttons you click)
        const scenarios = [
            { 
                id: "CRUDX-TEST1-00000-00001", label: "TEST_CASE_1_PURE_APP", 
                tags: ["app"], 
                desc: "MANDATORY ONLY: Self-contained App.\nExpect: app=<ThisID>" 
            },
            { 
                id: "CRUDX-TEST2-00000-00001", label: "TEST_CASE_2_DATA_TO_APP", 
                tags: ["data", "x:CRUDX-APP00-00000-00001"], 
                desc: "MANDATORY + DATA: Data doc launching App.\nExpect: app=<RefID> & data=<ThisID>" 
            },
            { 
                id: "CRUDX-TEST3-00000-00001", label: "TEST_CASE_3_APP_SETTINGS", 
                tags: ["app", "s:CRUDX-SET00-00000-00001"], 
                desc: "OPTIONAL: App with Settings.\nExpect: app=<ThisID> & settings=<RefID>" 
            },
            { 
                id: "CRUDX-TEST4-00000-00001", label: "TEST_CASE_4_DATA_APP_SET", 
                tags: ["data", "x:CRUDX-APP00-00000-00001", "s:CRUDX-SET00-00000-00001"], 
                desc: "OPTIONAL: Data launching App + Settings.\nExpect: app=<RefID>, data=<ThisID>, settings=<RefID>" 
            },
            { 
                id: "CRUDX-TEST5-00000-00001", label: "TEST_CASE_5_APP_AUX1", 
                tags: ["app", "d1:CRUDX-DAT01-00000-00001"], 
                desc: "OPTIONAL: App with Aux Data 1.\nExpect: app=<ThisID>, data-1=<RefID>" 
            },
            { 
                id: "CRUDX-TEST6-00000-00001", label: "TEST_CASE_6_FULL_HOUSE", 
                tags: ["data", "x:CRUDX-APP00-00000-00001", "s:CRUDX-SET00-00000-00001", "d1:CRUDX-DAT01-00000-00001", "d2:CRUDX-DAT02-00000-00001", "d3:CRUDX-DAT03-00000-00001"], 
                desc: "ALL OPTIONALS: Complex scenario.\nExpect: app, data, settings, data-1, data-2, data-3" 
            },
            { 
                id: "CRUDX-TEST7-00000-00001", label: "TEST_CASE_7_BROKEN_DATA", 
                tags: ["data"], 
                desc: "ERROR CASE: Data without App reference.\nExpect: Launcher Error Alert (Missing 'app')" 
            },
            { 
                id: "CRUDX-TEST8-00000-00001", label: "TEST_CASE_8_APP_D1_D2", 
                tags: ["app", "d1:CRUDX-DAT01-00000-00001", "d2:CRUDX-DAT02-00000-00001"], 
                desc: "COMBINATION: App + D1 + D2 (No Settings)." 
            },
            { 
                id: "CRUDX-TEST9-00000-00001", label: "TEST_CASE_9_DATA_SET_D3", 
                tags: ["data", "x:CRUDX-APP00-00000-00001", "s:CRUDX-SET00-00000-00001", "d3:CRUDX-DAT03-00000-00001"], 
                desc: "COMBINATION: Data + Settings + D3 (No D1/D2)." 
            }
        ];

        scenarios.forEach(s => {
            launcherBatch.set(doc(colRef, s.id), {
                label: s.label,
                value: s.desc,
                user_tags: [...s.tags, "AUTO_GEN"],
                owner: "tester@crudx.io",
                created_at: new Date().toISOString(),
                access_control: ["*@*"],
                white_list_execute: ["*@*"]
            });
        });

        await launcherBatch.commit();
        console.log("✅ Launcher Test Cases injected.");

        alert(`✅ Massen-Injection (Whitelist-Fix) abgeschlossen: ${totalRecords} Records erstellt.`);
        location.reload();
    } catch (error) {
        console.error("❌ Mass-Seed Fehler:", error);
        alert("Fehler bei der Massen-Injection. Konsole prüfen.");
    }
}