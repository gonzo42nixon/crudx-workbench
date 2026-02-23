import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, query, limit, getDocs, connectFirestoreEmulator, 
    getCountFromServer, orderBy, startAfter, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    try {
        // --- 1. FIREBASE SETUP ---
        const firebaseConfig = { projectId: "crudx-e0599" };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
        window.db = db; 

        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, fn);
        };

        // --- 2. THEME CONFIG ---
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
                "day": { /* ... unverändert ... */ },
                "arnold": { /* ... unverändert ... */ },
                "gaga": { /* ... unverändert ... */ }
            }
        };

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
        }

        // --- 4. NAVIGATION & EDITOR BINDING ---
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.add('open'));
        bind('btn-close-drawer', 'click', () => document.getElementById('drawer').classList.remove('open'));
        
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

        // --- 5. DATA ACTIONS ---
        bind('btn-inject', 'click', () => import('./seed.js').then(m => m.seedData(db)));
        bind('btn-delete', 'click', async () => {
            if(!confirm("Alle Dokumente wirklich löschen?")) return;
            const snap = await getDocs(collection(db, "kv-store"));
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            fetchRealData();
        });

        let currentPage = 1, itemsPerPage = 9, pageCursors = [];
        const dataContainer = document.getElementById('data-container');
        const gridSelect = document.getElementById('grid-select');

        function applyLayout(val) {
            if (val === 'list') { itemsPerPage = 50; dataContainer.style.display = 'flex'; dataContainer.style.flexDirection = 'column'; }
            else { const s = parseInt(val); itemsPerPage = s * s; dataContainer.style.display = 'grid'; dataContainer.style.gridTemplateColumns = `repeat(${s}, 1fr)`; }
        }

        bind('grid-select', 'change', (e) => { applyLayout(e.target.value); currentPage = 1; fetchRealData(); });
        bind('btn-next', 'click', () => { currentPage++; fetchRealData(); });
        bind('btn-prev', 'click', () => { if (currentPage > 1) { currentPage--; fetchRealData(); } });

        // --- 6. FORMATIERUNGS-HELPER ---
        const fmtD = (ts) => ts ? ts.split('T')[0] : '--'; 
        const fmtT = (label, ts) => ts ? `${label}: ${ts.replace('T', ' ').substring(0, 19)}` : label;

        // --- 7. RENDER ENGINE ---
async function fetchRealData() {
    const colRef = collection(db, "kv-store");
    
    // Pagination-Stats aktualisieren
    const totalSnap = await getCountFromServer(colRef);
    if(document.getElementById('total-count')) document.getElementById('total-count').textContent = totalSnap.data().count;
    if(document.getElementById('current-page')) document.getElementById('current-page').textContent = currentPage;

    // Query mit Sortierung und Paginierung
    let q = query(colRef, orderBy("__name__"), limit(itemsPerPage));
    if (currentPage > 1 && pageCursors[currentPage - 2]) {
        q = query(colRef, orderBy("__name__"), startAfter(pageCursors[currentPage - 2]), limit(itemsPerPage));
    }
    
    const snap = await getDocs(q);
    if(document.getElementById('result-count')) document.getElementById('result-count').textContent = snap.size;
    
    dataContainer.innerHTML = ""; 
    if (snap.empty) { dataContainer.innerHTML = "<h2>Ende der Daten erreicht.</h2>"; return; }
    
    pageCursors[currentPage - 1] = snap.docs[snap.docs.length - 1];

    snap.forEach(doc => {
        const d = doc.data();
        
        // --- 1. USER TAGS GENERIEREN (Blau) ---
        let userTags = [];
        if (Array.isArray(d.user_tags)) {
            d.user_tags.forEach(t => userTags.push({ k: t, h: `<div class="pill pill-user">🏷️ ${t}</div>` }));
        }
        ['read','update','delete'].forEach(m => {
            const l = d[`white_list_${m}`] || [];
            const icon = m === 'read' ? '👁️' : (m === 'update' ? '✏️' : '🗑️');
            userTags.push({ k: m, h: `<div class="pill pill-user">${icon} ${l.length}</div>` });
        });
        userTags.sort((a, b) => a.k.localeCompare(b.k));
        const userTagsHtml = userTags.map(p => p.h).join('');

        // --- 2. SYSTEM TAGS GENERIEREN (Rot / 7 Stück) ---
        const prot = Array.isArray(d.protection) ? d.protection.join('') : 'P';
        const sysTagsHtml = `
            <div class="pill pill-sys" title="Größe">💾 ${d.size || '0KB'}</div>
            <div class="pill pill-sys" title="Besitzer">👤 ${d.owner || 'System'}</div>
            <div class="pill pill-sys" title="Reads">R:${d.reads || 0}</div>
            <div class="pill pill-sys" title="Updates">U:${d.updates || 0}</div>
            <div class="pill pill-sys" title="${fmtT('Erstellt', d.created_at)}">🐣 C:${fmtD(d.created_at)}</div>
            <div class="pill pill-sys" title="${fmtT('Lesezugriff', d.last_read_ts)}">👁️ L-R:${fmtD(d.last_read_ts)}</div>
            <div class="pill pill-sys" title="${fmtT('Letzte Änderung', d.last_update_ts)}">📝 L-U:${fmtD(d.last_update_ts)}</div>
        `;

        // --- 3. TEMPLATE IN DEN CONTAINER SCHREIBEN ---
        // TAUSCH: Erst SYS dann USER sorgt bei row-reverse für: SYS rechts, USER links.
        dataContainer.innerHTML += `
            <div class="card-kv">
                <div class="value-layer">${d.value || 'N/A'}</div>
                <div class="tl-group">
                    <div class="pill pill-key">${doc.id}</div>
                    <div class="pill pill-label">${d.label || ''}</div>
                </div>
                <div class="br-group">
                    ${sysTagsHtml}
                    ${userTagsHtml}
                </div>
            </div>`;
    });
}

        // Initialisierung
        applyTheme(currentActiveTheme); 
        applyLayout(gridSelect ? gridSelect.value : '9'); 
        fetchRealData();

    } catch (e) { console.error("🔥 FATAL ERROR:", e); }
});