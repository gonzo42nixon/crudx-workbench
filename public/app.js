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
                    "sys":    { "bg": "#ff5252", "text": "#000000", "border": "#333333", "opacity": 80, "blur": false },
                    "mime":   { "bg": "#f7df1e", "text": "#000000", "border": "#ffffff", "opacity": 15, "blur": false }
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
                    "sys":    { "bg": "#cc0000", "text": "#ffffff", "border": "#aa0000", "opacity": 90, "blur": false },
                    "mime":   { "bg": "#ffcc00", "text": "#000000", "border": "#888888", "opacity": 20, "blur": false }
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
                    "sys":    { "bg": "#ff0000", "text": "#000000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "mime":   { "bg": "#ff0000", "text": "#000000", "border": "#ff0000", "opacity": 30, "blur": false }
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
                    "sys":    { "bg": "#00ffff", "text": "#000000", "border": "#000000", "opacity": 100, "blur": false },
                    "mime":   { "bg": "#ffff00", "text": "#ff00ff", "border": "#000000", "opacity": 40, "blur": true }
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
            const sections = ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys', 'mime'];
            
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

        function syncModalUI() {
            const t = appConfig.themes[currentActiveTheme];
            if(!t) return;
            document.getElementById('in-startup').value = appConfig.startupTheme;
            document.getElementById('in-edit-theme').value = currentActiveTheme;
            const sync = (sec, prefix) => {
                const s = t[sec];
                if(!s) return;
                if(document.getElementById(`in-${prefix}-bg`)) document.getElementById(`in-${prefix}-bg`).value = s.bg;
                if(document.getElementById(`in-${prefix}-text`)) document.getElementById(`in-${prefix}-text`).value = s.text;
                if(document.getElementById(`in-${prefix}-border`)) document.getElementById(`in-${prefix}-border`).value = s.border;
                if(document.getElementById(`in-${prefix}-opacity`)) document.getElementById(`in-${prefix}-opacity`).value = s.opacity;
                if(document.getElementById(`in-${prefix}-blur`)) document.getElementById(`in-${prefix}-blur`).checked = s.blur;
            };
            ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys', 'mime'].forEach(s => sync(s, s));
        }

        // --- 4. FAB-FUNKTIONEN (THEME, SHARE, FULLSCREEN, PRINT) ---
        bind('btn-theme', 'click', () => {
            const keys = Object.keys(appConfig.themes);
            let idx = (keys.indexOf(currentActiveTheme) + 1) % keys.length;
            applyTheme(keys[idx]);
            syncModalUI(); // optional, falls Modal offen ist
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

        // --- 5. NAVIGATION (BURGER, DRAWER) ---
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.add('open'));
        bind('btn-close-drawer', 'click', () => document.getElementById('drawer').classList.remove('open'));

        // --- 6. THEME MODAL (verschiebbar + schließen bei Klick außen) ---
        const themeModal = document.getElementById('theme-modal');
        const modalContent = document.querySelector('.modal-content');
        const modalTitle = modalContent?.querySelector('h3'); // Als Ziehgriff

        // Variablen für Drag
        let isDragging = false;
        let startX, startY, startTranslateX, startTranslateY;
        let currentTranslateX = 0, currentTranslateY = 0;

        // Hilfsfunktion: Aktuelle Transform-Matrix auslesen
        function getTranslateValues() {
            const style = window.getComputedStyle(modalContent);
            const transform = style.transform;
            if (transform && transform !== 'none') {
                const matrix = transform.match(/matrix.*\((.+)\)/);
                if (matrix) {
                    const values = matrix[1].split(', ');
                    // Bei matrix(scaleX, skewY, skewX, scaleY, translateX, translateY)
                    if (values.length === 6) {
                        return { x: parseFloat(values[4]), y: parseFloat(values[5]) };
                    }
                    // Bei matrix3d – ignorieren wir, nehmen vereinfacht 0
                }
            }
            return { x: 0, y: 0 };
        }

        // Drag-Start auf dem Titel
        if (modalTitle) {
            modalTitle.classList.add('modal-drag-handle');
            modalTitle.style.cursor = 'move';

            modalTitle.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Textselektion verhindern
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                // Aktuelle Translate-Werte holen
                const translate = getTranslateValues();
                startTranslateX = translate.x;
                startTranslateY = translate.y;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        function onMouseMove(e) {
            if (!isDragging) return;
            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            currentTranslateX = startTranslateX + dx;
            currentTranslateY = startTranslateY + dy;

            modalContent.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
        }

        function onMouseUp() {
            if (isDragging) {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        }

        // Schließen bei Klick außerhalb (auf das Overlay)
        themeModal.addEventListener('click', (e) => {
            if (e.target === themeModal) {
                themeModal.classList.remove('active');
                // Position zurücksetzen (wieder zentrieren)
                modalContent.style.transform = 'translate(-50%, -50%)';
                currentTranslateX = 0;
                currentTranslateY = 0;
            }
        });

        // Schließen-Button
        bind('btn-close-modal', 'click', () => {
            themeModal.classList.remove('active');
            modalContent.style.transform = 'translate(-50%, -50%)';
            currentTranslateX = 0;
            currentTranslateY = 0;
        });

        // Ermöglicht das Umschalten des Themes direkt im Editor
        bind('in-edit-theme', 'change', (e) => {
            currentActiveTheme = e.target.value; // Diese Zeile sorgt dafür, dass der Editor weiß, wer jetzt dran ist
            applyTheme(e.target.value);
            syncModalUI();
        });

        // --- THEME EXPORT LOGIK ---
        bind('btn-export-theme', 'click', () => {
            const exportArea = document.getElementById('export-area');
            const exportModal = document.getElementById('export-modal');
            
            // Wir exportieren die gesamte appConfig, damit Startup und ALLE Themes gesichert sind
            const fullExport = {
                startupTheme: appConfig.startupTheme,
                themes: appConfig.themes
            };

            exportArea.value = JSON.stringify(fullExport, null, 4);
            exportModal.classList.add('active');
        });

        // Schließen des Export-Modals
        bind('btn-close-export', 'click', () => {
            document.getElementById('export-modal').classList.remove('active');
        });

        // In die Zwischenablage kopieren
        bind('btn-copy-buffer', 'click', () => {
            const content = document.getElementById('export-area').value;
            navigator.clipboard.writeText(content).then(() => {
                const btn = document.getElementById('btn-copy-buffer');
                btn.textContent = "✅ Copied!";
                setTimeout(() => btn.textContent = "📋 Copy to Clipboard", 2000);
            });
        });

        // Als JSON Datei speichern
        bind('btn-save-json', 'click', () => {
            const content = document.getElementById('export-area').value;
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `crudx-theme-${currentActiveTheme}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
        
        // Theme-Link im Drawer
        bind('btn-drawer-theme', 'click', () => { 
            syncModalUI(); 
            themeModal.classList.add('active'); 
            document.getElementById('drawer').classList.remove('open'); 
            // Position zurücksetzen (falls vorher verschoben)
            modalContent.style.transform = 'translate(-50%, -50%)';
            currentTranslateX = 0;
            currentTranslateY = 0;
        });

        // --- 7. LIVE-EDITOR (Updated to include MIME) ---
        ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys', 'mime'].forEach(sec => {
            ['bg', 'text', 'border'].forEach(k => {
                const el = document.getElementById(`in-${sec}-${k}`);
                if (el) el.addEventListener('input', (e) => {
                    appConfig.themes[currentActiveTheme][sec][k] = e.target.value;
                    applyTheme(currentActiveTheme);
                });
            });
            const opEl = document.getElementById(`in-${sec}-opacity`);
            if (opEl) opEl.addEventListener('input', (e) => {
                appConfig.themes[currentActiveTheme][sec].opacity = parseInt(e.target.value);
                applyTheme(currentActiveTheme);
            });
            const blurEl = document.getElementById(`in-${sec}-blur`);
            if (blurEl) blurEl.addEventListener('change', (e) => {
                appConfig.themes[currentActiveTheme][sec].blur = e.target.checked;
                applyTheme(currentActiveTheme);
            });
        });

        // --- 8. DATA ACTIONS ---
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

        const fmtD = (ts) => ts ? ts.split('T')[0] : '--'; 
        const fmtT = (label, ts) => ts ? `${label}: ${ts.replace('T', ' ').substring(0, 19)}` : label;

        // --- 8. RENDER ENGINE & MIME DETECTION ---
        async function fetchRealData() {
            const colRef = collection(db, "kv-store");
            const totalSnap = await getCountFromServer(colRef);
            if(document.getElementById('total-count')) document.getElementById('total-count').textContent = totalSnap.data().count;
            if(document.getElementById('current-page')) document.getElementById('current-page').textContent = currentPage;

            let q = query(colRef, orderBy("__name__"), limit(itemsPerPage));
            if (currentPage > 1 && pageCursors[currentPage - 2]) {
                q = query(colRef, orderBy("__name__"), startAfter(pageCursors[currentPage - 2]), limit(itemsPerPage));
            }
            
            const snap = await getDocs(q);
            if(document.getElementById('result-count')) document.getElementById('result-count').textContent = snap.size;
            
            const dataContainer = document.getElementById('data-container');
            dataContainer.innerHTML = ""; 
            
            if (snap.empty) return;
            pageCursors[currentPage - 1] = snap.docs[snap.docs.length - 1];

            const fmtD = (ts) => ts ? ts.split('T')[0] : '--'; 
            const fmtT = (label, ts) => ts ? `${label}: ${ts.replace('T', ' ').substring(0, 19)}` : label;

            snap.forEach(doc => {
                const d = doc.data();
                
                // --- MIME ERKENNUNG ---
                // Wir nennen die Variable hier 'foundMime', um Kollisionen zu vermeiden
                const foundMime = detectMimetype(d.value);
                const mimePill = foundMime ? `<div class="pill pill-mime">MIME: ${foundMime.icon} ${foundMime.type}</div>` : '';

                let userTags = [];
                if (Array.isArray(d.user_tags)) {
                    d.user_tags.forEach(t => userTags.push({ k: t, h: `<div class="pill pill-user">🏷️ ${t}</div>` }));
                }
                
                ['read','update','delete'].forEach(m => {
                    const l = d[`white_list_${m}`] || [];
                    if (l.length > 0) {
                        userTags.push({ k: m, h: `<div class="pill pill-user">${m === 'read' ? '👁️' : (m === 'update' ? '✏️' : '🗑️')} ${l.length}</div>` });
                    }
                });
                userTags.sort((a, b) => a.k.localeCompare(b.k));
                const userTagsHtml = userTags.map(p => p.h).join('');

                const sysTagsHtml = `
                    <div class="pill pill-sys">💾 ${d.size || '0KB'}</div>
                    <div class="pill pill-sys">👤 ${d.owner || 'System'}</div>
                    <div class="pill pill-sys">R:${d.reads || 0}</div>
                    <div class="pill pill-sys">U:${d.updates || 0}</div>
                    <div class="pill pill-sys" title="${fmtT('Erstellt', d.created_at)}">🐣 C:${fmtD(d.created_at)}</div>
                    <div class="pill pill-sys" title="${fmtT('Letzter Read', d.last_read_ts)}">👁️ L-R:${fmtD(d.last_read_ts)}</div>
                    <div class="pill pill-sys" title="${fmtT('Letzter Update', d.last_update_ts)}">📝 L-U:${fmtD(d.last_update_ts)}</div>
                `;

                dataContainer.innerHTML += `
                    <div class="card-kv">
                        <div class="value-layer">${d.value || 'NULL'}</div>
                        <div class="tl-group">
                            <div class="pill pill-key">${doc.id}</div>
                            <div class="pill pill-label">${d.label || ''}</div>
                        </div>
                        <div class="br-group">
                            ${sysTagsHtml}
                            ${mimePill}
                            ${userTagsHtml}
                        </div>
                    </div>`;
            });
        }

function detectMimetype(value) {
    if (!value) return null;
    const v = String(value).trim();
    const vLower = v.toLowerCase();

    // Priorität 1: Inhalts-Signaturen (Magic Bytes / Header)
    if (v.startsWith('{') || v.startsWith('[')) return { type: 'JSON', icon: '📦', color: '#f7df1e' };
    if (v.startsWith('<!DOCTYPE html') || v.startsWith('<html') || v.startsWith('<body')) return { type: 'HTML', icon: '🌐', color: '#e34c26' };
    if (v.startsWith('<?xml')) return { type: 'XML', icon: '🧬', color: '#ff6600' };
    if (v.startsWith('%PDF-')) return { type: 'PDF', icon: '📕', color: '#ff0000' };
    if (v.startsWith('data:image/')) return { type: 'IMG', icon: '🖼️', color: '#40c4ff' };
    if (v.startsWith('import ') || v.startsWith('const ') || v.startsWith('let ') || v.startsWith('function ')) return { type: 'JS', icon: '📜', color: '#f7df1e' };
    if (v.startsWith('def ') || v.startsWith('@')) return { type: 'PY', icon: '🐍', color: '#3776ab' };
    if (v.startsWith('---') || v.startsWith('# ')) return { type: 'MD', icon: '📝', color: '#083fa1' };
    if (v.startsWith('INSERT INTO') || v.startsWith('SELECT ') || v.startsWith('CREATE TABLE')) return { type: 'SQL', icon: '🗄️', color: '#336791' };
    
    // Check für CSV (Muster: Headerzeile mit Komma und Newline)
    if (v.includes(',') && v.includes('\n') && v.split('\n')[0].includes(',')) return { type: 'CSV', icon: '📊', color: '#1d6f42' };

    return null; 
}


        applyTheme(currentActiveTheme); 
        applyLayout(gridSelect ? gridSelect.value : '9'); 
        fetchRealData();
    } catch (e) { console.error("🔥 FATAL:", e); }
});