import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, query, limit, getDocs, connectFirestoreEmulator, 
    getCountFromServer, orderBy, startAfter, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    try {
        // --- 1. FIREBASE SETUP ---
        const db = getFirestore(initializeApp({ projectId: "crudx-e0599" }));
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
        window.db = db; 

        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, fn);
        };

        // --- 2. THEME CONFIG (VOLLSTÄNDIG) ---
        let appConfig = {
            "startupTheme": "night",
            "themes": {
                "night": {
                    "canvas": { "bg": "#0a0a0a", "text": "#eeeeee", "border": "#333333", "padding": 15, "opacity": 85, "blur": true },
                    "card":   { "bg": "#111111", "text": "#eeeeee", "border": "#222222", "opacity": 100, "blur": false },
                    "navi":   { "bg": "#0f0f0f", "text": "#cccccc", "border": "#333333", "opacity": 85, "blur": true, "bottom": 25 },
                    "editor": { "bg": "#111111", "text": "#eeeeee", "border": "#333333", "opacity": 95, "blur": true },
                    "search": { "bg": "#111111", "text": "#eeeeee", "border": "#333333", "opacity": 80, "blur": true },
                    "burger": { "text": "#00ff00" },
                    "key":    { "bg": "#000000", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
                    "user":   { "bg": "#40c4ff", "text": "#000000", "border": "#333333", "opacity": 80, "blur": false },
                    "sys":    { "bg": "#ff5252", "text": "#000000", "border": "#333333", "opacity": 80, "blur": false }
                },
                "day": {
                    "canvas": { "bg": "#f5f5f5", "text": "#111111", "border": "#cccccc", "padding": 15, "opacity": 90, "blur": true },
                    "card":   { "bg": "#ffffff", "text": "#111111", "border": "#dddddd", "opacity": 100, "blur": false },
                    "navi":   { "bg": "#eeeeee", "text": "#333333", "border": "#bbbbbb", "opacity": 90, "blur": true, "bottom": 25 },
                    "editor": { "bg": "#ffffff", "text": "#111111", "border": "#cccccc", "opacity": 98, "blur": true },
                    "search": { "bg": "#ffffff", "text": "#111111", "border": "#cccccc", "opacity": 90, "blur": true },
                    "burger": { "text": "#0077ff" },
                    "key":    { "bg": "#222222", "text": "#ffffff", "border": "#444444", "opacity": 90, "blur": false },
                    "user":   { "bg": "#0088cc", "text": "#ffffff", "border": "#0055aa", "opacity": 90, "blur": false },
                    "sys":    { "bg": "#cc0000", "text": "#ffffff", "border": "#aa0000", "opacity": 90, "blur": false }
                },
                "arnold": {
                    "canvas": { "bg": "#000000", "text": "#ff0000", "border": "#ff0000", "padding": 20, "opacity": 95, "blur": false },
                    "card":   { "bg": "#110000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "navi":   { "bg": "#000000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false, "bottom": 10 },
                    "editor": { "bg": "#000000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "search": { "bg": "#000000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "burger": { "text": "#ff0000" },
                    "key":    { "bg": "#330000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "user":   { "bg": "#ff0000", "text": "#000000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "sys":    { "bg": "#ff0000", "text": "#000000", "border": "#ff0000", "opacity": 100, "blur": false }
                },
                "gaga": {
                    "canvas": { "bg": "#ff00ff", "text": "#000000", "border": "#000000", "padding": 10, "opacity": 70, "blur": true },
                    "card":   { "bg": "#ffb3ff", "text": "#000000", "border": "#000000", "opacity": 90, "blur": true },
                    "navi":   { "bg": "#ffff00", "text": "#000000", "border": "#000000", "opacity": 80, "blur": true, "bottom": 40 },
                    "editor": { "bg": "#00ffff", "text": "#000000", "border": "#000000", "opacity": 90, "blur": true },
                    "search": { "bg": "#ffffff", "text": "#000000", "border": "#000000", "opacity": 95, "blur": true },
                    "burger": { "text": "#ff00ff" },
                    "key":    { "bg": "#000000", "text": "#ffff00", "border": "#000000", "opacity": 100, "blur": false },
                    "user":   { "bg": "#ffff00", "text": "#000000", "border": "#000000", "opacity": 100, "blur": false },
                    "sys":    { "bg": "#00ffff", "text": "#000000", "border": "#000000", "opacity": 100, "blur": false }
                }
            }
        };

        const settingsBlock = document.getElementById('crudx-settings');
        if (settingsBlock && settingsBlock.textContent.trim() !== "" && settingsBlock.textContent.trim() !== "{}") {
            try { appConfig = { ...appConfig, ...JSON.parse(settingsBlock.textContent) }; } catch (e) {}
        }

        let currentActiveTheme = appConfig.startupTheme;

        // --- 3. THEME ENGINE HELPERS ---
        function hexToRgb(hex) {
            let c = hex.substring(1).split('');
            if(c.length === 3){ c= [c[0], c[0], c[1], c[1], c[2], c[2]]; }
            c = '0x' + c.join('');
            return [(c>>16)&255, (c>>8)&255, c&255].join(', ');
        }

        function applyTheme(themeName) {
            currentActiveTheme = themeName;
            const t = appConfig.themes[themeName];
            if(!t) return;
            const root = document.documentElement;
            const sections = ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys'];
            
            sections.forEach(s => {
                const sec = t[s];
                if (!sec) return;
                root.style.setProperty(`--${s}-bg`, sec.bg);
                root.style.setProperty(`--${s}-text`, sec.text);
                root.style.setProperty(`--${s}-border`, sec.border);
                const rgb = hexToRgb(sec.bg);
                const alpha = (sec.opacity / 100).toFixed(2);
                root.style.setProperty(`--${s}-glass`, `rgba(${rgb}, ${alpha})`);
                root.style.setProperty(`--${s}-blur`, sec.blur ? 'blur(10px)' : 'none');
            });
            root.style.setProperty('--app-padding', t.canvas.padding + 'px');
            root.style.setProperty('--navi-bottom', t.navi.bottom + 'px');
            root.style.setProperty('--burger-text', t.burger.text);
            
            if(document.getElementById('in-edit-theme')) document.getElementById('in-edit-theme').value = themeName;
        }

        // --- 4. NAVIGATION, FABs & MODAL EVENTS ---
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.add('open'));
        bind('btn-close-drawer', 'click', () => document.getElementById('drawer').classList.remove('open'));
        
        bind('btn-theme', 'click', () => {
            const keys = Object.keys(appConfig.themes);
            let idx = (keys.indexOf(currentActiveTheme) + 1) % keys.length;
            applyTheme(keys[idx]);
            syncModalUI();
        });

        bind('btn-share', 'click', () => {
            if (navigator.share) {
                navigator.share({ title: 'CRUDX Data View', url: window.location.href });
            } else {
                navigator.clipboard.writeText(window.location.href);
                alert("Link in Zwischenablage kopiert!");
            }
        });

        bind('btn-fullscreen', 'click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });

        bind('btn-print', 'click', () => window.print());

        const themeModal = document.getElementById('theme-modal');
        function syncModalUI() {
            const t = appConfig.themes[currentActiveTheme];
            if(!t) return;
            document.getElementById('in-startup').value = appConfig.startupTheme;
            document.getElementById('in-edit-theme').value = currentActiveTheme;
            const sync = (sec, prefix) => {
                const s = t[sec];
                if(!s) return;
                document.getElementById(`in-${prefix}-bg`).value = s.bg;
                document.getElementById(`in-${prefix}-text`).value = s.text;
                if(document.getElementById(`in-${prefix}-border`)) document.getElementById(`in-${prefix}-border`).value = s.border;
                if(document.getElementById(`in-${prefix}-opacity`)) document.getElementById(`in-${prefix}-opacity`).value = s.opacity;
                if(document.getElementById(`in-${prefix}-blur`)) document.getElementById(`in-${prefix}-blur`).checked = s.blur;
                if(sec === 'canvas') document.getElementById(`in-canvas-padding`).value = s.padding;
                if(sec === 'navi') document.getElementById(`in-navi-bottom`).value = s.bottom;
            };
            ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys'].forEach(s => sync(s, s));
            document.getElementById('in-burger-text').value = t.burger.text;
        }

        bind('btn-drawer-theme', 'click', () => { 
            syncModalUI(); 
            themeModal.classList.add('active'); 
            document.getElementById('drawer').classList.remove('open'); 
        });

        bind('in-edit-theme', 'change', (e) => {
            applyTheme(e.target.value);
            syncModalUI();
        });

        bind('btn-close-modal', 'click', () => themeModal.classList.remove('active'));

        // --- 5. BINDING LIVE EDITOR ---
        const bindConfig = (id, sec, key, type = 'text') => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', (e) => {
                let val = type === 'number' ? parseInt(e.target.value) || 0 : (type === 'checkbox' ? e.target.checked : e.target.value);
                appConfig.themes[currentActiveTheme][sec][key] = val;
                applyTheme(currentActiveTheme);
            });
        };

        ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys'].forEach(sec => {
            ['bg', 'text', 'border'].forEach(k => bindConfig(`in-${sec}-${k}`, sec, k));
            bindConfig(`in-${sec}-opacity`, sec, 'opacity', 'number');
            bindConfig(`in-${sec}-blur`, sec, 'blur', 'checkbox');
        });
        bindConfig('in-canvas-padding', 'canvas', 'padding', 'number');
        bindConfig('in-navi-bottom', 'navi', 'bottom', 'number');
        bindConfig('in-burger-text', 'burger', 'text');

        bind('btn-export-theme', 'click', () => {
            const str = `<script id="crudx-settings" type="application/json">\n${JSON.stringify(appConfig, null, 4)}\n</script>`;
            navigator.clipboard.writeText(str).then(() => {
                const b = document.getElementById('btn-export-theme');
                b.textContent = "Copied!";
                setTimeout(() => b.innerHTML = "&lt;/&gt; Export", 2000);
            });
        });

        // --- 6. TOOLS & DATA ---
        bind('btn-inject', 'click', () => import('./seed.js').then(m => m.seedData(db)));

        // INLINE LÖSCHFUNKTION
        const nukeDatabase = async () => {
            if (!confirm("Alle Dokumente in 'kv-store' wirklich löschen?")) return;
            try {
                const colRef = collection(db, "kv-store");
                const snap = await getDocs(colRef);
                if (snap.empty) return alert("Datenbank ist bereits leer.");
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
                currentPage = 1;
                fetchRealData(); 
            } catch (e) { console.error("Löschfehler:", e); }
        };
        bind('btn-delete', 'click', nukeDatabase);

        let currentPage = 1, itemsPerPage = 9, pageCursors = []; 
        const dataContainer = document.getElementById('data-container'), gridSelect = document.getElementById('grid-select');

        function applyLayout(val) {
            if (val === 'list') { itemsPerPage = 50; dataContainer.style.display = 'flex'; dataContainer.style.flexDirection = 'column'; }
            else { const s = parseInt(val); itemsPerPage = s * s; dataContainer.style.display = 'grid'; dataContainer.style.gridTemplateColumns = `repeat(${s}, 1fr)`; }
        }

        bind('grid-select', 'change', (e) => { applyLayout(e.target.value); currentPage = 1; fetchRealData(); });
        bind('btn-next', 'click', () => { currentPage++; fetchRealData(); });
        bind('btn-prev', 'click', () => { if (currentPage > 1) { currentPage--; fetchRealData(); } });

        async function fetchRealData() {
            const colRef = collection(db, "kv-store");
            const totalSnap = await getCountFromServer(colRef);
            document.getElementById('total-count').textContent = totalSnap.data().count;
            let q = query(colRef, orderBy("__name__"), limit(itemsPerPage));
            if (currentPage > 1 && pageCursors[currentPage - 2]) q = query(colRef, orderBy("__name__"), startAfter(pageCursors[currentPage - 2]), limit(itemsPerPage));
            const snap = await getDocs(q);
            document.getElementById('result-count').textContent = snap.size;
            document.getElementById('current-page').textContent = currentPage;
            if (snap.empty) { dataContainer.innerHTML = "<h2>End.</h2>"; return; }
            pageCursors[currentPage - 1] = snap.docs[snap.docs.length - 1];
            dataContainer.innerHTML = ""; 
            snap.forEach(doc => {
                const d = doc.data();
                let userTags = [];
                if (Array.isArray(d.user_tags)) d.user_tags.forEach(t => userTags.push({ k: t, h: `<div class="pill pill-user">🏷️ ${t}</div>` }));
                ['read','update','delete'].forEach(m => {
                    const l = d[`white_list_${m}`] || [];
                    userTags.push({ k: m, h: `<div class="pill pill-user">${m === 'read' ? '👁️' : (m === 'update' ? '✏️' : '🗑️')} ${l.length}</div>` });
                });

                // Alphabetische Sortierung der User-Tags
                userTags.sort((a, b) => a.k.localeCompare(b.k));

                const sysTags = `
                    <div class="pill pill-sys">💾 ${d.size || '0KB'}</div>
                    <div class="pill pill-sys">👤 ${d.owner || 'System'}</div>
                    <div class="pill pill-sys">R:${d.reads || 0}</div>
                `;

                // *** NEUE STRUKTUR: getrennte Container für rote und blaue Pills ***
                const sysDiv = `<div class="sys-pills">${sysTags}</div>`;
                const userDiv = `<div class="user-pills">${userTags.map(p => p.h).join('')}</div>`;

                dataContainer.innerHTML += `
                    <div class="card-kv">
                        <div class="value-layer">${d.value || 'N/A'}</div>
                        <div class="tl-group">
                            <div class="pill pill-key">${doc.id}</div>
                            <div class="pill pill-label">${d.label || ''}</div>
                        </div>
                        <div class="br-group">
                            ${sysDiv}   <!-- Rote Pills (unten) -->
                            ${userDiv}  <!-- Blaue Pills (oben) -->
                        </div>
                    </div>`;
            });
        }

        applyTheme(currentActiveTheme); applyLayout(gridSelect.value); fetchRealData();
    } catch (e) { console.error("🔥 FATAL:", e); }
});