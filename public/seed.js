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

export async function seedCoreData(db) {
    console.log("🚀 Injecting Core Data...");
    const batch = writeBatch(db);
    const colRef = collection(db, "kv-store");
    
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateTagSuffix = `>${y}>${m}>${d}`;

    // Core Info Document
    batch.set(doc(colRef, "CRUDX-CORE_-DATA_-INFO"), {
        label: "CRUDX Info",
        value: "# CRUDX Workbench\n\n**CRUDX** is a versatile Key-Value Store interface designed for rapid data management and visualization.\n\n## The CRUDX Model\n* **C**reate: Instantiate new data records.\n* **R**ead: Visualize data (Markdown, Code, JSON, Media).\n* **U**pdate: Modify values and metadata tags.\n* **D**elete: Remove obsolete records.\n* **eX**ecute: Launch applications or scripts directly from data.\n\n## Key Features\n* **Floating Tag Cloud**: Multidimensional navigation.\n* **Dynamic Grid**: 1x1 to 9x9 views.\n* **Granular Security**: Per-action Whitelists.\n\n*Data is the Application.*",
        owner: "info@https://crudx-e0599.web.app/",
        user_tags: [
            "Info", "CRUDX", "v1", "🛡️ D", "data", "x:CRUDX-CORE_-_APP_-MARKD",
            `Created${dateTagSuffix}`,
            `Last Read${dateTagSuffix}`,
            `Last Updated${dateTagSuffix}`,
            `Last Executed${dateTagSuffix}`
        ],
        access_control: ["*@*"],
        white_list_read: ["*@*"],
        white_list_update: ["drueffler@gmail.com"],
        white_list_delete: [],
        white_list_execute: ["*@*"],
        created_at: now.toISOString(),
        last_read_ts: now.toISOString(),
        last_update_ts: now.toISOString(),
        last_execute_ts: now.toISOString(),
        updates: 1, reads: 1, executes: 1,
        size: "1KB"
    });

    // Core App: Markdown Studio
    batch.set(doc(colRef, "CRUDX-CORE_-_APP_-MARKD"), {
        label: "Pro Markdown Studio.html",
        value: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pro Markdown Studio v4.1</title>
    
    <!-- UI & Styling -->
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    
    <!-- Markdown Parser -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    
    <!-- Code Highlighting -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    
    <!-- Math (KaTeX) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    
    <!-- Diagrams & Charts (Mermaid) -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js"></script>
    
    <!-- Music (ABCjs) -->
    <script src="https://cdn.jsdelivr.net/npm/abcjs@6.2.2/dist/abcjs-basic-min.js"></script>

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code&display=swap');
        
        body { font-family: 'Inter', sans-serif; background-color: #0f172a; margin: 0; padding: 0; }
        .font-mono { font-family: 'Fira Code', monospace; }
        
        /* High Contrast Preview */
        .prose { color: #1e293b !important; max-width: none; }
        .prose h1, .prose h2, .prose h3 { color: #0f172a !important; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; margin-top: 1.5em; }
        .prose blockquote { border-left-color: #6366f1; background-color: #f8fafc; padding: 1rem; font-style: italic; border-left-width: 4px; }
        .prose table { border-collapse: collapse; width: 100%; border: 1px solid #e2e8f0; margin: 1.5em 0; }
        .prose th, .prose td { border: 1px solid #e2e8f0; padding: 10px 14px; }
        .prose th { background-color: #f8fafc; font-weight: 700; }
        
        /* Layout Modes */
        .mode-split #editor-section { width: 50%; display: flex; }
        .mode-split #preview-section { width: 50%; display: flex; }
        .mode-editor #editor-section { width: 100%; display: flex; }
        .mode-editor #preview-section { display: none; }
        .mode-preview #editor-section { display: none; }
        .mode-preview #preview-section { width: 100%; display: flex; }

        /* Floating Nav */
        #floating-nav {
            position: fixed;
            top: 1.5rem;
            right: 1.5rem;
            z-index: 100;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .preview-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; }

        /* Video Container */
        .video-wrapper { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; border-radius: 8px; margin: 1.5rem 0; }
        .video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    </style>
</head>
<body class="h-screen flex flex-col overflow-hidden text-slate-200 mode-preview" id="app-body">

    <!-- Floating Navigation (EDIT, SPLIT, VIEW) -->
    <nav id="floating-nav" title="Mode" class="flex bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-2xl">
        <button onclick="saveDocument()" id="btn-save" title="Save to Cloud (Ctrl+S)" class="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tighter transition-all bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 mr-1">SAVE</button>
        <button onclick="setMode('editor')" id="btn-editor" title="Markdown editing" class="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tighter transition-all text-slate-400 hover:text-white">EDIT</button>
        <button onclick="setMode('split')" id="btn-split" title="Edit and view markdown simultaneously" class="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tighter transition-all text-slate-400 hover:text-white mx-1">SPLIT</button>
        <button onclick="setMode('preview')" id="btn-preview" title="View rendered markdown" class="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tighter transition-all bg-indigo-600 text-white shadow-lg">VIEW</button>
    </nav>

    <main class="flex-1 flex overflow-hidden">
        <!-- Editor Section -->
        <section id="editor-section" class="flex flex-col border-r border-slate-800">
            <textarea 
                id="editor" 
                class="flex-1 w-full p-8 bg-slate-950 text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none custom-scrollbar"
                spellcheck="false"
                placeholder="Start typing your masterpiece..."
            ></textarea>
        </section>

        <!-- Preview Section -->
        <section id="preview-section" class="flex flex-col bg-white">
            <div id="preview-container" class="flex-1 overflow-y-auto p-12 lg:p-20 preview-scroll">
                <div id="preview-content" class="prose prose-slate prose-pre:p-0">
                    <!-- Markdown rendered here -->
                </div>
            </div>
        </section>
    </main>

    <script>
        const editor = document.getElementById('editor');
        const previewContent = document.getElementById('preview-content');
        const appBody = document.getElementById('app-body');

        // Initialize Mermaid for Diagrams
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });

        // Configure Markdown Parser
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-',
            breaks: true,
            gfm: true,
            headerIds: true,
            mangle: false
        });

        // Toggle View Modes
        function setMode(mode) {
            appBody.classList.remove('mode-split', 'mode-editor', 'mode-preview');
            appBody.classList.add('mode-' + mode);
            ['editor', 'split', 'preview'].forEach(m => {
                const btn = document.getElementById('btn-' + m);
                if (m === mode) {
                    btn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg');
                    btn.classList.remove('text-slate-400');
                } else {
                    btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg');
                    btn.classList.add('text-slate-400');
                }
            });
            if (mode !== 'editor') updatePreview();
        }

        // Main Rendering Logic
        async function updatePreview() {
            const rawText = editor.value;
            
            // 1. Basic Markdown Rendering
            previewContent.innerHTML = marked.parse(rawText);

            // 2. Math (KaTeX) - Block & Inline
            renderMathInElement(previewContent, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                ],
                throwOnError : false
            });

            // 3. Music (ABCjs)
            const abcBlocks = previewContent.querySelectorAll('pre code.language-abc');
            abcBlocks.forEach((block, index) => {
                const container = document.createElement('div');
                const id = 'abc-' + index;
                container.id = id;
                container.className = 'my-8 p-4 bg-white rounded border border-slate-100 shadow-sm';
                block.parentElement.replaceWith(container);
                ABCJS.renderAbc(id, block.textContent, { responsive: 'resize' });
            });

            // 4. Diagrams & Charts (Mermaid)
            const mermaidBlocks = previewContent.querySelectorAll('pre code.language-mermaid');
            for (let i = 0; i < mermaidBlocks.length; i++) {
                const block = mermaidBlocks[i];
                const code = block.textContent;
                const container = document.createElement('div');
                container.className = 'mermaid flex justify-center my-10';
                container.textContent = code;
                block.parentElement.replaceWith(container);
            }
            
            if (previewContent.querySelectorAll('.mermaid').length > 0) {
                try {
                    await mermaid.run();
                } catch (err) { console.error("Mermaid error:", err); }
            }
        }

        window.onload = () => {
            const template = document.getElementById('markdown-template');
            if (template && template.textContent) {
                try {
                    // Pre-check for a context injected by the calling environment (app.js)
                    const preInjectedKey = window.CRUDX_CONTEXT ? window.CRUDX_CONTEXT.key : null;

                    // 1. Parse the full document data from the template script
                    const docData = JSON.parse(template.textContent.trim());
                    
                    // 2. Determine the document key. Prioritize the pre-injected key,
                    // as blob URLs in the emulator won't have URL parameters.
                    const urlParams = new URLSearchParams(window.location.search);
                    const docKey = preInjectedKey || urlParams.get('data') || urlParams.get('key') || "UNKNOWN_KEY";

                    // 3. Build/rebuild the global context in the structure this app expects.
                    window.CRUDX_CONTEXT = {
                        ...(window.CRUDX_CONTEXT || {}),
                        key: docKey,
                        action: "U",
                        webhookUrl: "https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977",
                        documentData: docData 
                    };

                    console.log("✅ Context successfully loaded/rebuilt:", window.CRUDX_CONTEXT);

                    // 4. Inject ONLY the Markdown value into the editor
                    if (docData.value) {
                        editor.value = docData.value;
                    }
                    updatePreview();
                } catch (e) {
                    console.error("❌ Failed to parse injected JSON. Is it valid JSON?", e);
                    editor.value = "# Error loading data\\nCould not parse the injected data.";
                }
            }
        };

        // Debounced Input
        let timeout;
        editor.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(updatePreview, 400);
        });

        // Tab Support for Indentation
        editor.addEventListener('keydown', function(e) {
            if (e.key == 'Tab') {
                e.preventDefault();
                var start = this.selectionStart;
                var end = this.selectionEnd;
                this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
            }
        });

        // --- CRUDX CLOUD SAVE ---
        async function saveDocument() {
            const btn = document.getElementById('btn-save');
            const originalText = btn.innerText;
            
            const ctx = window.CRUDX_CONTEXT;

            if (!ctx || !ctx.key || ctx.key === "UNKNOWN_KEY") {
                console.error("❌ Missing Context.", ctx);
                alert("⚠️ No Context: Cannot save (Key missing).\\nPlease ensure the app was opened with the ?data= parameter.");
                return;
            }

            const docData = ctx.documentData;

            // SAFETY LOCK: Prevent saving in Fallback Mode (missing metadata) to avoid wiping tags/permissions.
            if (!docData || !docData.user_tags) {
                alert("⚠️ Safety Lock: Edit Mode Unavailable.\\nReason: Metadata missing.");
                return;
            }

            // --- EMULATOR-SPECIFIC SAVE LOGIC ---
            // In the emulator, the app runs in a sandboxed blob and cannot access the parent's
            // Firestore instance directly. Instead of calling the webhook, it sends the data
            // to the parent window (app.js), which then handles the database update.
            if (ctx.isEmulator) {
                console.log("🔧 Emulator Mode: Sending save request to parent window.");
                const payload = {
                    action: "U",
                    key: ctx.key,
                    value: editor.value,
                    label: docData.label || "",
                    owner: docData.owner || "",
                    user_tags: { arrayValue: { values: (docData.user_tags || []).map(v => ({ stringValue: v })) } },
                    white_list_read: { arrayValue: { values: (docData.white_list_read || []).map(v => ({ stringValue: v })) } },
                    white_list_update: { arrayValue: { values: (docData.white_list_update || []).map(v => ({ stringValue: v })) } },
                    white_list_delete: { arrayValue: { values: (docData.white_list_delete || []).map(v => ({ stringValue: v })) } },
                    white_list_execute: { arrayValue: { values: (docData.white_list_execute || []).map(v => ({ stringValue: v })) } },
                };
                window.parent.postMessage({ type: 'CRUDX_SAVE', payload: payload }, '*');
                btn.innerText = "✅";
                setTimeout(() => btn.innerText = originalText, 2000);
                return; // Stop execution here, do not proceed to webhook.
            }

            btn.innerText = "⏳";
            btn.classList.add('animate-pulse');

            try {
                // Construct the base payload
                const payload = {
                    action: ctx.action || "U",
                    key: ctx.key,
                    value: editor.value // Take the modified text from the editor
                };

                // Reconstruct the array structure Make.com expects
                const wrapArray = (arr) => ({ arrayValue: { values: (arr || []).map(v => ({ stringValue: v })) } });
                
                payload.user_tags = wrapArray(docData.user_tags);
                payload.white_list_read = wrapArray(docData.white_list_read);
                payload.white_list_update = wrapArray(docData.white_list_update);
                payload.white_list_delete = wrapArray(docData.white_list_delete);
                payload.white_list_execute = wrapArray(docData.white_list_execute);
                
                payload.label = docData.label || "";
                payload.owner = docData.owner || "";

                const response = await fetch(ctx.webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    btn.innerText = "✅";
                    setTimeout(() => btn.innerText = originalText, 2000);
                } else {
                    throw new Error(response.statusText);
                }
            } catch (e) {
                console.error(e);
                btn.innerText = "❌";
                alert("Save failed: " + e.message);
                setTimeout(() => btn.innerText = originalText, 2000);
            } finally {
                btn.classList.remove('animate-pulse');
            }
        }

        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveDocument();
            }
        });
    </script>
</body>
</html>`,
        owner: "info@https://crudx-e0599.web.app/",
        user_tags: [
            "app", "CRUDX", "🛡️ D",
            `Created${dateTagSuffix}`,
            `Last Read${dateTagSuffix}`,
            `Last Updated${dateTagSuffix}`,
            `Last Executed${dateTagSuffix}`
        ],
        access_control: ["info@https://crudx-e0599.web.app/", "*@*"],
        white_list_read: ["*@*"],
        white_list_update: ["drueffler@gmail.com"],
        white_list_delete: [],
        white_list_execute: ["*@*"],
        created_at: now.toISOString(),
        last_read_ts: now.toISOString(),
        last_update_ts: now.toISOString(),
        last_execute_ts: now.toISOString(),
        updates: 1, reads: 1, executes: 1,
        size: "15KB"
    });

    // Core Data: Markdown Template
    batch.set(doc(colRef, "CRUDX-CORE_-DATA_-MARKD"), {
        label: "Markdown Template.html",
        value: `# Advanced Markdown Studio v4.1

Explore the restored examples for Math, UML, and Music below.

---

## 1. Mathematics & Formulas (KaTeX)
The standard form of a quadratic equation is $ax^2 + bx + c = 0$. 

The solution for $x$ is given by the quadratic formula:
$$ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} $$

The Einstein field equations:
$$ G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\kappa T_{\\mu\\nu} $$

---

## 2. UML & Diagrams (Mermaid)
You can create Sequence diagrams, Flowcharts, and UML Class diagrams.

### UML Sequence Diagram
\`\`\`mermaid
sequenceDiagram
    participant User
    participant Editor
    participant Parser
    User->>Editor: Types Markdown
    Editor->>Parser: Sends raw text
    Parser-->>Editor: Returns HTML
    Editor->>User: Shows Preview
\`\`\`

### Flowchart
\`\`\`mermaid
graph LR
    A[Start] --> B{Is it Math?}
    B -- Yes --> C[Render KaTeX]
    B -- No --> D{Is it UML?}
    D -- Yes --> E[Render Mermaid]
    D -- No --> F[Standard Markdown]
\`\`\`

---

## 3. Music Notation (ABCjs)
\`\`\`abc
X:1
T:Restored Example
M:4/4
L:1/8
K:D
|:D2DE F2FA | G2FG E2CE | D2DE F2FA | GFEG F2D2 :|
\`\`\`

---

## 4. Charts & Data
\`\`\`mermaid
pie title Project Effort Distribution
    "Writing" : 40
    "Debugging" : 30
    "Designing" : 20
    "Music Practice" : 10
\`\`\`

---

## 5. Media & HTML
### Embedded Video
<div class="video-wrapper">
  <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>
</div>

### Responsive Image
!Placeholder Landscape

---

## 6. Table & Quotes
| Format | Tool | Status |
| :--- | :--- | :--- |
| **Math** | KaTeX | Active |
| **UML** | Mermaid | Active |
| **Notes** | ABCjs | Active |

> "The only way to do great work is to love what you do."
> — *Steve Jobs*

\`\`\`javascript
console.log("Everything is back in place!");
\`\`\``,
        owner: "info@https://crudx-e0599.web.app/",
        user_tags: [
            "data", "CRUDX", "🛡️ D", "x:CRUDX-CORE_-_APP_-MARKD",
            `Created${dateTagSuffix}`,
            `Last Read${dateTagSuffix}`,
            `Last Updated${dateTagSuffix}`,
            `Last Executed${dateTagSuffix}`
        ],
        access_control: ["info@https://crudx-e0599.web.app/", "*@*"],
        white_list_read: ["*@*"],
        white_list_update: [],
        white_list_delete: [],
        white_list_execute: ["*@*"],
        created_at: now.toISOString(),
        last_read_ts: now.toISOString(),
        last_update_ts: now.toISOString(),
        last_execute_ts: now.toISOString(),
        updates: 1, reads: 1, executes: 1,
        size: "4KB"
    });

    // Cleanup Legacy
    batch.delete(doc(colRef, "CRUDX-INFO"));
    batch.delete(doc(colRef, "CRUDX-CORE_-DATA_-INFO_"));

    await batch.commit();
    alert("✅ Core Data injected.");
    location.reload();
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
        { type: "SVG_GRAPHIC", ext: ".svg", val: "<svg width='100' height='100'><circle cx='50' cy='50' r='40' stroke='green' stroke-width='4' fill='yellow' />" + "<text x='10' y='50'>DATA</text></svg>" },
        { type: "SQL_DUMP", ext: ".sql", val: "INSERT INTO system_registry (key, val, permissions) VALUES \n" + Array(15).fill("('SYS_01', 'BLOCK_DATA', '775')").join(",\n") + ";" },
        { type: "XML_SCHEMA", ext: ".xml", val: "<?xml version='1.0'?>\n<env:Envelope xmlns:env='http://www.w3.org/2003/05/soap-envelope'>\n<env:Body><data>" + "A".repeat(200) + "</data></env:Body></env:Envelope>" },
        { type: "PYTHON_SCRIPT", ext: ".py", val: "def main():\n    '''System Maintenance'''\n    items = [i for i in range(100)]\n    print(f'Cleaning {len(items)} units...')\n\nmain()" },
        { type: "CSS_THEME", ext: ".css", val: ":root {\n  --primary: #00ff00;\n  --bg: #000000;\n}\n" + ".card { border: 1px solid var(--primary); padding: 20px; }".repeat(10) },
        { type: "SVG_GRAPHIC", ext: ".svg", val: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="purple" /></svg>` },
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
        { type: "IMGUR_EMBED", ext: ".html", val: `<blockquote class="imgur-embed-pub" lang="en" data-id="a/iIMBdju"><a href="//imgur.com/iIMBdju"></a></blockquote><script async src="//s.imgur.com/min/embed.js" charset="utf-8"></script>` },
        { type: "URL_LINK", ext: ".url", val: "https://www.fiverr.com/gonzo42nixon/buying?source=avatar_menu_profile" },
        { type: "URL_LINK", ext: ".url", val: "https://mail.google.com/mail/u/0/#inbox" },
        { type: "URL_LINK", ext: ".url", val: "https://www.youtube.com/" },
        { type: "URL_LINK", ext: ".url", val: "https://hook.eu1.make.com/r1hoz4qb1gorj6silab1hm6m74eqj1he?operator=GET&RecordID=pg-e7c30581-d0c0-4231-8b4e-b48f88d1d6ae" },
        { type: "URL_LINK", ext: ".url", val: "https://de.wikipedia.org/wiki/Wikipedia:Hauptseite" },
        { type: "URL_LINK", ext: ".url", val: "https://github.com/gonzo42nixon/crudx-workbench" },
        { type: "URL_LINK", ext: ".url", val: "https://chatgpt.com/c/69aae532-46b8-8395-a91c-d612665ab05b" },
        { type: "URL_LINK", ext: ".url", val: "https://archive.org/" },
        { type: "URL_LINK", ext: ".url", val: "https://stackedit.io/app" },
        { type: "URL_LINK", ext: ".url", val: "https://jsfiddle.net/" },
        { type: "URL_LINK", ext: ".url", val: "https://ourworldindata.org/" },
        { type: "URL_LINK", ext: ".url", val: "https://worldpopulationreview.com/" },
        { type: "URL_LINK", ext: ".url", val: "https://motherfuckingwebsite.com/" }
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

                let owner = realUsers[index % realUsers.length];
                if (payload.type === 'URL_LINK' || payload.type === 'MAPS_LINK') {
                    owner = "drueffler@gmail.com";
                }

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

                // Damit die Test-URLs für jeden sichtbar sind (Public Read)
                if (payload.type === 'URL_LINK' || payload.type === 'MAPS_LINK') {
                    if (!wlRead.includes('*@*')) wlRead.push('*@*');
                }

                // Ensure public execute access for all generated items
                if (!wlExecute.includes('*@*')) {
                    wlExecute.push('*@*');
                }

                const accessControl = [...new Set([owner, ...wlRead, ...wlUpdate, ...wlDelete, ...wlExecute])];

                // Sort and Build Tag
                const order = ['C', 'R', 'U', 'D', 'X'];
                protectionChars.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                const protectionTag = protectionChars.length > 0 ? "🛡️ " + protectionChars.join('') : "🛡️ -";

                // Generate consistent counters and timestamps FIRST
                const reads = Math.floor(Math.random() * 20); // 0-19
                const updates = Math.floor(Math.random() * 5); // 0-4
                const executes = Math.floor(Math.random() * 5); // 0-4
                // Calculate Date Tag (Folder Logic)
                // Mix 2025 dates for testing (every 5th record)
                let createdDate = new Date(Date.now() - (index * 3600000));
                if (index % 5 === 0) {
                    createdDate.setFullYear(2025);
                }

                const fmtDateTag = (prefix, dateObj) => {
                    if (!dateObj) return null;
                    const y = dateObj.getFullYear();
                    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const d = String(dateObj.getDate()).padStart(2, '0');
                    return `${prefix}>${y}>${m}>${d}`;
                };

                // New Format: Created>YYYY>MM>DD
                const folderTag = fmtDateTag("Created", createdDate);

                // User Tags Logic
                const tags = ["AUTO_GEN", protectionTag, folderTag];

                // Generate random dates for Read/Update based on Created
                let lastReadDate = null;
                let lastUpdateDate = null;

                // Add Last Read / Last Updated Folder Tags
                if (reads > 0) {
                    // Random date between createdDate and createdDate + 60 days
                    lastReadDate = new Date(createdDate.getTime() + Math.floor(Math.random() * 60 * 24 * 3600 * 1000));
                    tags.push(fmtDateTag("Last Read", lastReadDate));
                }
                if (updates > 0) {
                    // Random date between createdDate and createdDate + 60 days
                    lastUpdateDate = new Date(createdDate.getTime() + Math.floor(Math.random() * 60 * 24 * 3600 * 1000));
                    tags.push(fmtDateTag("Last Updated", lastUpdateDate));
                }
                
                if (executes > 0) {
                    const lastExecuteDate = new Date(createdDate.getTime() + Math.floor(Math.random() * 60 * 24 * 3600 * 1000));
                    tags.push(fmtDateTag("Last Executed", lastExecuteDate));
                }
                
                // Add tags for specific embed types
                if (payload.type === 'YOUTUBE_EMBED') {
                    tags.push("youtube");
                } else if (payload.type === 'MAPS_EMBED') {
                    tags.push("gmaps");
                } else if (payload.type === 'IMGUR_EMBED') {
                    tags.push("imgur");
                } else if (payload.type === 'URL_LINK' || payload.type === 'MAPS_LINK') {
                    tags.push("bookmark");
                    tags.push(`x:${ocrId}`);
                }

                if (Math.random() < 0.10) tags.push("backup");
                
                const vRand = Math.random();
                if (vRand < 0.08) tags.push("v1");
                else if (vRand < 0.14) tags.push("v2");
                else if (vRand < 0.18) tags.push("v3");
                else if (vRand < 0.21) tags.push("v4");
                else if (vRand < 0.23) tags.push("v5");
                
                const isEmbed = payload.type === 'YOUTUBE_EMBED' || payload.type === 'MAPS_EMBED' || payload.type === 'IMGUR_EMBED' || payload.type === 'URL_LINK' || payload.type === 'MAPS_LINK';

                if (isEmbed) {
                    // Iframes und URLs sind immer app, nie data
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

                batch.set(docRef, {
                    label: `VOL_DATA_${index}_${payload.type}${payload.ext}`,
                    value: payload.val,
                    size: `${(Math.random() * 500 + 50).toFixed(1)}KB`,
                    owner: owner,
                    reads: reads,
                    updates: updates,
                    executes: executes,
                    created_at: createdDate.toISOString(),
                    last_read_ts: lastReadDate ? lastReadDate.toISOString() : null,
                    last_update_ts: lastUpdateDate ? lastUpdateDate.toISOString() : null,
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