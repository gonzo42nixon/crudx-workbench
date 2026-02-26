import { setupAuth } from './auth-helper.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, query, limit, getDocs, connectFirestoreEmulator, 
    getCountFromServer, orderBy, startAfter, deleteDoc, doc, 
    writeBatch // <--- DIESE ZEILE MUSS HIER REIN!
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        // --- 1. FIREBASE SETUP ---
const app = initializeApp({ 
    apiKey: "fake-api-key-for-emulator", // HIER: Auth braucht diesen Platzhalter
    projectId: "crudx-e0599" 
});
const db = getFirestore(app); // Dann nutzen wir 'app' für die Datenbank
const auth = setupAuth(app);  // Und 'app' für den Login

// --- MAGIC LINK CHECKER ---
        const finalizeLogin = async () => {
            const { signInWithEmailLink, isSignInWithEmailLink } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
            if (isSignInWithEmailLink(auth, window.location.href)) {
                let email = window.localStorage.getItem('emailForSignIn') || window.prompt('Please provide your email for confirmation:');
                try {
                    await signInWithEmailLink(auth, email, window.location.href);
                    window.localStorage.removeItem('emailForSignIn');
                    window.history.replaceState({}, document.title, window.location.pathname);
                    console.log("✅ Magic Link verified!");
                } catch (e) { console.error("❌ Link Error:", e); }
            }
        };
        finalizeLogin();

connectFirestoreEmulator(db, '127.0.0.1', 8080);

window.db = db; 
window.auth = auth; // Damit die Konsole weiß, wer 'auth' ist

        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, fn);
        };

        

        // --- 2. THEME CONFIG (VOLLSTÄNDIG) ---

        let appConfig = {
            "startupTheme": "night",
            "themes": {
                "night": {
                    "canvas": { "bg": "#0a0a0a", "border": "#333333", "paddingTop": 10,"padding": 15, "opacity": 85, "blur": true },
                    "card":   { "bg": "#111111", "text": "#eeeeee", "border": "#222222", "opacity": 100, "blur": false, "padding": 20 },
                    "navi":   { "bg": "#0f0f0f", "text": "#cccccc", "border": "#333333", "opacity": 85, "blur": true, "bottom": 25 },
                    "editor": { "bg": "#111111", "text": "#eeeeee", "border": "#333333", "opacity": 95, "blur": true },
                    "search": { "bg": "#111111", "text": "#eeeeee", "border": "#333333", "opacity": 80, "blur": true },
                    "burger": { "text": "#00ff00" },
                    "key":    { "bg": "#000000", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
                    "user":   { "bg": "#40c4ff", "text": "#000000", "border": "#333333", "opacity": 80, "blur": false },
                    "sys":    { "bg": "#ff5252", "text": "#000000", "border": "#333333", "opacity": 80, "blur": false }
                },
                "day": {
                    "canvas": { "bg": "#0a0a0a", "border": "#333333", "paddingTop": 10,"padding": 15, "opacity": 85, "blur": true },
                    "card":   { "bg": "#ffffff", "text": "#111111", "border": "#dddddd", "opacity": 100, "blur": false, "padding": 20 },
                    "navi":   { "bg": "#eeeeee", "text": "#333333", "border": "#bbbbbb", "opacity": 90, "blur": true, "bottom": 25 },
                    "editor": { "bg": "#ffffff", "text": "#111111", "border": "#cccccc", "opacity": 98, "blur": true },
                    "search": { "bg": "#ffffff", "text": "#111111", "border": "#cccccc", "opacity": 90, "blur": true },
                    "burger": { "text": "#0077ff" },
                    "key":    { "bg": "#222222", "text": "#ffffff", "border": "#444444", "opacity": 90, "blur": false },
                    "user":   { "bg": "#0088cc", "text": "#ffffff", "border": "#0055aa", "opacity": 90, "blur": false },
                    "sys":    { "bg": "#cc0000", "text": "#ffffff", "border": "#aa0000", "opacity": 90, "blur": false }
                },
                "arnold": {
                    "canvas": { "bg": "#0a0a0a", "border": "#333333", "paddingTop": 10,"padding": 15, "opacity": 85, "blur": true },
                    "card":   { "bg": "#110000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false, "padding": 20 },
                    "navi":   { "bg": "#000000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false, "bottom": 10 },
                    "editor": { "bg": "#000000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "search": { "bg": "#000000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "burger": { "text": "#ff0000" },
                    "key":    { "bg": "#330000", "text": "#ff0000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "user":   { "bg": "#ff0000", "text": "#000000", "border": "#ff0000", "opacity": 100, "blur": false },
                    "sys":    { "bg": "#ff0000", "text": "#000000", "border": "#ff0000", "opacity": 100, "blur": false }
                },
                "gaga": {
                    "canvas": { "bg": "#0a0a0a", "border": "#333333", "paddingTop": 10, "padding": 15, "opacity": 85, "blur": true },
                    "card":   { "bg": "#ffb3ff", "text": "#000000", "border": "#000000", "opacity": 90, "blur": true, "padding": 20 },
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
        applyTheme(currentActiveTheme);

        // --- 3. THEME ENGINE HELPERS ---
        function hexToRgb(hex) {
            let c = hex.substring(1).split('');
            if(c.length === 3){ c= [c[0], c[0], c[1], c[1], c[2], c[2]]; }
            c = '0x' + c.join('');
            return [(c>>16)&255, (c>>8)&255, c&255].join(', ');
        }

        function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function applyTheme(themeName) {
    currentActiveTheme = themeName;
    const t = appConfig.themes[themeName];
    if (!t) return;
    
    const root = document.documentElement;
    
    // 1. STANDARD-SEKTIONEN (Farben, Rahmen, Glas-Effekt)
    const sections = ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys'];
    sections.forEach(s => {
        const sec = t[s];
        if (!sec) return;
        
        // Farben und Rahmen als CSS-Variablen setzen
        if (sec.bg !== undefined) root.style.setProperty(`--${s}-bg`, sec.bg);
        if (sec.text !== undefined) root.style.setProperty(`--${s}-text`, sec.text);
        if (sec.border !== undefined) root.style.setProperty(`--${s}-border`, sec.border);
        
        // Glas-Hintergrund berechnen (RGBA)
        if (sec.bg !== undefined && sec.opacity !== undefined) {
            const rgb = hexToRgb(sec.bg);
            const alpha = (sec.opacity / 100).toFixed(2);
            root.style.setProperty(`--${s}-glass`, `rgba(${rgb}, ${alpha})`);
        }
        
        // Blur-Effekt setzen
        root.style.setProperty(`--${s}-blur`, sec.blur ? 'blur(10px)' : 'none');
    });

    // 2. SPEZIAL-EIGENSCHAFTEN (Abstände & Paddings)
    
    // Canvas-Padding (Abstand zum Bildschirmrand)
    const canvasPadding = (t.canvas && typeof t.canvas.padding === 'number') ? t.canvas.padding : 15;
    root.style.setProperty('--app-padding', canvasPadding + 'px');

    const canvasPaddingTop = (t.canvas && typeof t.canvas.paddingTop === 'number') ? t.canvas.paddingTop : 10;
    root.style.setProperty('--canvas-padding-top', canvasPaddingTop + 'px');

    // Navi-Abstand (Paginator nach unten)
    const naviBottom = (t.navi && typeof t.navi.bottom === 'number') ? t.navi.bottom : 25;
    root.style.setProperty('--navi-bottom', naviBottom + 'px');

    // NEU: Card-Content Padding (Abstand Inhalt zum Kartenrand)
    const cardPadding = (t.card && typeof t.card.padding === 'number') ? t.card.padding : 20;
    root.style.setProperty('--card-padding', cardPadding + 'px');

    // 3. BURGER-BUTTON FIX (Direkte Färbung)
    const burgerColor = t.burger?.text || '#00ff00';
    root.style.setProperty('--burger-text', burgerColor);
    
    const burgerBtn = document.getElementById('btn-burger');
    if (burgerBtn) {
        burgerBtn.style.color = burgerColor;
        // Falls das Icon ein SVG ist
        const svg = burgerBtn.querySelector('svg');
        if (svg) svg.style.fill = burgerColor;
    }

    // 4. UI-SYNCHRONISATION
    const editThemeSelect = document.getElementById('in-edit-theme');
    if (editThemeSelect) editThemeSelect.value = themeName;

    console.log(`🎨 Theme "${themeName}" mit Card-Padding (${cardPadding}px) angewendet.`);
}

function syncModalUI() {
    const t = appConfig.themes[currentActiveTheme];
    if (!t) return;

    // 1. Dropdowns synchronisieren (Startup & Aktuelles Theme)
    const startupInput = document.getElementById('in-startup');
    if (startupInput) startupInput.value = appConfig.startupTheme;

    const editThemeInput = document.getElementById('in-edit-theme');
    if (editThemeInput) editThemeInput.value = currentActiveTheme;

    // 2. Standard-Sektionen (Farben, Opacity, Blur)
    const sync = (sec, prefix) => {
        const s = t[sec];
        if (!s) return;
        const fields = ['bg', 'text', 'border', 'opacity'];
        fields.forEach(f => {
            const el = document.getElementById(`in-${prefix}-${f}`);
            if (el && s[f] !== undefined) el.value = s[f];
        });
        const blurEl = document.getElementById(`in-${prefix}-blur`);
        if (blurEl && s.blur !== undefined) blurEl.checked = s.blur;
    };

    // Alle Sektionen durchlaufen
    ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys'].forEach(s => sync(s, s));

    // 3. Burger & Spezialfelder (Paddings & Abstände)
    
    // Burger-Farbe
    const burgerColorInput = document.getElementById('in-burger-text');
    if (burgerColorInput && t.burger && t.burger.text) {
        burgerColorInput.value = t.burger.text;
    }

    // Canvas Grid Padding (Seitenabstand)
    const paddingInput = document.getElementById('in-canvas-padding');
    if (paddingInput && t.canvas && typeof t.canvas.padding === 'number') {
        paddingInput.value = t.canvas.padding;
    }

    // Canvas Padding Top (Der neue Regler für den Abstand nach oben)
    const paddingTopInput = document.getElementById('in-canvas-padding-top');
    if (paddingTopInput && t.canvas && typeof t.canvas.paddingTop === 'number') {
        paddingTopInput.value = t.canvas.paddingTop;
    }

    // Navigation (Paginator) Abstand von unten
    const naviBottomInput = document.getElementById('in-navi-bottom');
    if (naviBottomInput && t.navi && typeof t.navi.bottom === 'number') {
        naviBottomInput.value = t.navi.bottom;
    }

    // Card Content Padding (Inhalt zum Kartenrand)
    const cardPaddingInput = document.getElementById('in-card-padding');
    if (cardPaddingInput && t.card && typeof t.card.padding === 'number') {
        cardPaddingInput.value = t.card.padding;
    }

    console.log("🔄 Modal UI synchronisiert auf Theme:", currentActiveTheme);
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
        ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'user', 'sys'].forEach(sec => {
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

const burgerColorInput = document.getElementById('in-burger-text');
if (burgerColorInput) {
    burgerColorInput.addEventListener('input', (e) => {
        // Wir stellen sicher, dass das Objekt 'burger' existiert, bevor wir schreiben
        if (!appConfig.themes[currentActiveTheme].burger) {
            appConfig.themes[currentActiveTheme].burger = {};
        }
        appConfig.themes[currentActiveTheme].burger.text = e.target.value;
        applyTheme(currentActiveTheme); // Das löst die sofortige Färbung aus
    });
}

        // Padding-Feld für Canvas (separat, da nicht in der sections-Schleife)
const paddingEl = document.getElementById('in-canvas-padding');
if (paddingEl) {
    paddingEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
            appConfig.themes[currentActiveTheme].canvas.padding = val;
            applyTheme(currentActiveTheme);
        }
    });
}

// --- DIESER BLOCK FEHLT DIR IN SEKTION 7 ---
const paddingTopEl = document.getElementById('in-canvas-padding-top');
if (paddingTopEl) {
    paddingTopEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
            // 1. Speichern für das aktuelle Theme
            appConfig.themes[currentActiveTheme].canvas.paddingTop = val;
            // 2. Sofort ans CSS senden (WICHTIG: + 'px'!)
            document.documentElement.style.setProperty('--canvas-padding-top', val + 'px');
            console.log("📏 Padding Top live geändert auf:", val + "px");
        }
    });
}
// --- In Sektion 7. LIVE-EDITOR nach dem paddingEl-Block einfügen ---

// Abstand für die Navigation (Paginator) nach unten
const naviBottomEl = document.getElementById('in-navi-bottom');
if (naviBottomEl) {
    naviBottomEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
            // Wert in der Config speichern
            appConfig.themes[currentActiveTheme].navi.bottom = val;
            // Theme sofort neu anwenden
            applyTheme(currentActiveTheme);
        }
    });
}

// --- In Sektion 7. LIVE-EDITOR ergänzen ---

const cardPaddingEl = document.getElementById('in-card-padding');
if (cardPaddingEl) {
    cardPaddingEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
            // 1. Wert in der Konfiguration speichern
            appConfig.themes[currentActiveTheme].card.padding = val;
            // 2. Das UI sofort aktualisieren
            applyTheme(currentActiveTheme);
        }
    });
}

        // --- 8. DATA ACTIONS ---
        bind('btn-inject', 'click', () => import('./seed.js').then(m => m.seedData(db)));
bind('btn-delete', 'click', async () => {
    if(!confirm("Alle Dokumente wirklich löschen?")) return;
    
    const colRef = collection(db, "kv-store");
    const snap = await getDocs(colRef);
    
    if (snap.empty) {
        alert("Nichts zum Löschen da.");
        return;
    }

    console.log(`🗑️ Starte Batch-Löschung von ${snap.size} Dokumenten...`);

    // Wir teilen die Arbeit in 500er Pakete auf
    let count = 0;
    let batch = writeBatch(db);

    for (const document of snap.docs) {
        batch.delete(document.ref);
        count++;

        // Wenn 500 erreicht sind, abschicken und neuen Batch starten
        if (count % 500 === 0) {
            await batch.commit();
            batch = writeBatch(db);
            console.log(`📦 Zwischenstand: ${count} gelöscht.`);
        }
    }

    // Den Rest abschicken
    if (count % 500 !== 0) {
        await batch.commit();
    }

    console.log("✅ Alle Dokumente entfernt.");
    fetchRealData(); // UI aktualisieren
});

        let currentPage = 1, itemsPerPage = 9, pageCursors = [], sortDirection = 'asc';
        const dataContainer = document.getElementById('data-container');
        const gridSelect = document.getElementById('grid-select');

function applyLayout(val) {
    const dataContainer = document.getElementById('data-container');
    if (!dataContainer) return;

    // 1. Alle Layout-Klassen sauber entfernen
    dataContainer.classList.remove('grid-3', 'grid-4', 'grid-5', 'grid-7', 'grid-9', 'list');

    // 2. Alle Inline-Styles zurücksetzen
    dataContainer.style = '';

    // 3. Logik für Listview (Infinite Scroll) oder Grid
    if (val === 'list') {
        // Wir setzen das Limit massiv hoch für das Scroll-Erlebnis
        itemsPerPage = 500; 
        dataContainer.classList.add('list');
        
        // Paginator-Leiste ausblenden (stört beim Scrollen)
        const navi = document.querySelector('.navi-container');
        if (navi) navi.style.display = 'none';
        
        console.log("🚀 List-Mode: Limit auf 500 gesetzt, Scrollen aktiviert.");
    } else {
        // Grid-Logik: Limit = Spalten * Spalten
        const s = parseInt(val);
        itemsPerPage = s * s;
        dataContainer.classList.add(`grid-${s}`);
        
        // Paginator wieder einblenden
        const navi = document.querySelector('.navi-container');
        if (navi) navi.style.display = 'flex';
        
        console.log(`Square-Mode: ${s}x${s} Grid aktiviert.`);
    }

    // 4. Seite zurücksetzen und Daten neu laden
    currentPage = 1;
    fetchRealData();
}

        bind('grid-select', 'change', (e) => { applyLayout(e.target.value); currentPage = 1; fetchRealData(); });
// --- PAGINATOR ACTIONS ---

// ORDER BUTTON LOGIK (Visual Update)
const btnOrder = document.getElementById('btn-order');
if (btnOrder) {
    // Initialer Zustand beim Laden
btnOrder.textContent = '↑'; 
btnOrder.title = 'Aufsteigend (A–Z). Klicken für absteigend (Z–A)';

btnOrder.addEventListener('click', () => {
    sortDirection = (sortDirection === 'asc') ? 'desc' : 'asc';
    btnOrder.textContent = (sortDirection === 'asc') ? '↑' : '↓'; 
    // Optional: Seite zurücksetzen, wenn du bei Sortierwechsel zu Seite 1 springen willst
    currentPage = 1;
    pageCursors = [];
    fetchRealData(); 
});
}

bind('btn-first', 'click', () => {
    if (currentPage === 1) return;
    currentPage = 1;
    pageCursors = []; 
    fetchRealData();
});

bind('btn-prev', 'click', () => {
    if (currentPage > 1) {
        currentPage--;
        fetchRealData();
    }
});

bind('btn-next', 'click', () => {
    currentPage++;
    fetchRealData();
});

bind('btn-last', 'click', async () => {
    const colRef = collection(db, "kv-store");
    const totalSnap = await getCountFromServer(colRef);
    const totalCount = totalSnap.data().count;
    const lastPage = Math.ceil(totalCount / itemsPerPage);
    
    if (currentPage === lastPage) return;
    currentPage = lastPage;
    fetchLastPageData(totalCount); 
});

        const fmtD = (ts) => ts ? ts.split('T')[0] : '--'; 
        const fmtT = (label, ts) => ts ? `${label}: ${ts.replace('T', ' ').substring(0, 19)}` : label;


 

// --- 8. RENDER ENGINE & PAGINATION LOGIC (LABEL SORTED) ---

function renderDataFromDocs(docs, container) {
    const fD = (ts) => ts ? ts.split('T')[0] : '--'; 
    const fT = (label, ts) => ts ? `${label}: ${ts.replace('T', ' ').substring(0, 19)}` : label;
    let htmlBuffer = "";

    docs.forEach(doc => {
        const d = doc.data();
        const foundMime = detectMimetype(d.value);
        
        const mimePill = foundMime ? 
            `<div class="pill pill-mime" title="Mime Type" style="background-color: ${foundMime.color} !important; color: #000 !important;">
                ${foundMime.icon} ${foundMime.type}
            </div>` : '';

        let userTags = [];
        if (Array.isArray(d.user_tags)) {
            d.user_tags.forEach(t => userTags.push(`<div class="pill pill-user" title="Memo: User">🏷️ ${t}</div>`));
        }
        
        ['read','update','delete'].forEach(m => {
            const list = d[`white_list_${m}`] || [];
            if (list.length > 0) {
                userTags.push(`<div class="pill pill-user" title="Whitelist ${m.toUpperCase()}: ${list.join(', ')}">${m === 'read' ? '👁️' : (m === 'update' ? '✏️' : '🗑️')} ${list.length}</div>`);
            }
        });

        const sysTagsHtml = `
            <div class="pill pill-sys" title="${fT('Created', d.created_at)}">🐣 C:${fD(d.created_at)}</div>
            <div class="pill pill-sys" title="${fT('Last Update', d.last_update_ts)}">📝 U:${fD(d.last_update_ts)}</div>
            <div class="pill pill-sys" title="${fT('Last Read', d.last_read_ts)}">👁️ R:${fD(d.last_read_ts)}</div>
            <div class="pill pill-sys" title="Reads">R:${d.reads || 0}</div>
            <div class="pill pill-sys" title="Updates">U:${d.updates || 0}</div>
            <div class="pill pill-sys" title="Size">💾 ${d.size || '0KB'}</div>
            <div class="pill pill-sys" title="Owner">👤 ${d.owner ? d.owner.split('@')[0] : 'Sys'}</div>
        `;

        htmlBuffer += `
            <div class="card-kv">
                <div class="tl-group">
                    <div class="pill pill-key" title="KEY">${doc.id}</div>
                    <div class="pill pill-label" title="Label">${d.label || ''}</div>
                </div>
                <div class="value-layer" title="VALUE">${escapeHtml(d.value) || 'NULL'}</div>
                <div class="br-group">
                    ${sysTagsHtml}
                    ${mimePill}
                    ${userTags.join('')}
                </div>
            </div>`;
    });
    container.innerHTML = htmlBuffer;
}

async function fetchRealData() {
    const container = document.getElementById('data-container');
    if (!container) return;
    const colRef = collection(db, "kv-store");

    try {
        // 1. DATABASE COUNTS HOLEN
        const totalSnap = await getCountFromServer(colRef);
        const totalCount = totalSnap.data().count;

        // --- LOGIK FÜR RESULT SET ---
        // Aktuell: Treffermenge = Gesamtmenge (Vorbereitung für zukünftige Filter)
        let filteredCount = totalCount; 

        // 2. DYNAMISCHE BERECHNUNG DER ITEMS & SEITEN
        const gridValue = document.getElementById('grid-select')?.value || "3";
        let currentLimit;
        let totalPages;

        if (gridValue === 'list') {
            currentLimit = 500; 
            totalPages = 1;
            currentPage = 1;
        } else {
            const n = parseInt(gridValue);
            currentLimit = n * n;
            // Berechnung basiert auf filteredCount (Result Set)
            totalPages = Math.max(1, Math.ceil(filteredCount / currentLimit));
        }

        // 3. UI AKTUALISIEREN (Page X of Y & Counts)
        if(document.getElementById('total-count')) document.getElementById('total-count').textContent = totalCount;
        if(document.getElementById('result-count')) document.getElementById('result-count').textContent = filteredCount;
        if(document.getElementById('current-page')) document.getElementById('current-page').textContent = currentPage;
        if(document.getElementById('total-pages')) document.getElementById('total-pages').textContent = totalPages;

        // 4. FIREBASE QUERY AUFBAUEN
        // Nutzt die globale Variable sortDirection ('asc' oder 'desc')
        let q = query(colRef, orderBy("label", sortDirection), limit(currentLimit));
        
        // Paginierung via Cursor anwenden
        if (currentPage > 1 && pageCursors[currentPage - 2]) {
            q = query(colRef, orderBy("label", sortDirection), startAfter(pageCursors[currentPage - 2]), limit(currentLimit));
        }
        
        const snap = await getDocs(q);
        
        // 5. DATEN RENDERN
        if (snap.empty) {
            container.innerHTML = `<div class="pill pill-sys" style="margin:20px;">Keine Dokumente in dieser Auswahl vorhanden.</div>`;
        } else {
            // Cursor für die nächste Seite speichern
            pageCursors[currentPage - 1] = snap.docs[snap.docs.length - 1];
            // Zentrale Render-Funktion nutzen
            renderDataFromDocs(snap.docs, container);
        }

        // 6. PAGINATOR-BUTTONS STEUERN (Visual Feedback & Edge Detection)
        const btnFirst = document.getElementById('btn-first');
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');
        const btnLast = document.getElementById('btn-last');
        const btnOrder = document.getElementById('btn-order');

        // Links sperren (Anfang erreicht?)
        const isAtStart = currentPage <= 1;
        btnFirst?.classList.toggle('btn-disabled', isAtStart);
        btnPrev?.classList.toggle('btn-disabled', isAtStart);

        // Rechts sperren (Ende erreicht oder List-Mode?)
        const isAtEnd = currentPage >= totalPages || gridValue === 'list';
        btnNext?.classList.toggle('btn-disabled', isAtEnd);
        btnLast?.classList.toggle('btn-disabled', isAtEnd);

        // Tooltip für Order-Button aktualisieren
        if (btnOrder) {
            btnOrder.title = `Current: ${sortDirection === 'asc' ? 'Ascending (A-Z)' : 'Descending (Z-A)'}. Click to flip sorting.`;
        }

    } catch (err) {
        console.error("🔥 Fehler in fetchRealData:", err);
        container.innerHTML = `<div class="pill pill-sys">Fehler beim Laden: ${err.message}</div>`;
    }
}

async function fetchLastPageData() {
    const container = document.getElementById('data-container');
    if (!container) return;
    const colRef = collection(db, "kv-store");

    try {
        // 1. GESAMTANZAHL UND SEITENBERECHNUNG
        const totalSnap = await getCountFromServer(colRef);
        const totalCount = totalSnap.data().count;
        
        // Rastergröße ermitteln
        const gridValue = document.getElementById('grid-select')?.value || "3";
        const itemsOnPage = (gridValue === 'list') ? 500 : (parseInt(gridValue) * parseInt(gridValue));
        
        const lastPage = Math.max(1, Math.ceil(totalCount / itemsOnPage));
        currentPage = lastPage;
        
        const remainder = totalCount % itemsOnPage || itemsOnPage;

        // 2. QUERY LOGIK (Umkehrung der aktuellen sortDirection)
        // Wenn wir ASC sortieren, müssen wir DESC anfragen, um das Ende zu finden
        const reverseDir = (sortDirection === 'asc') ? 'desc' : 'asc';
        const q = query(colRef, orderBy("label", reverseDir), limit(remainder));
        const snap = await getDocs(q);
        
        // 3. RENDERING
        // Wir drehen die Docs um, damit sie wieder in der global gewählten Richtung erscheinen
        renderDataFromDocs(snap.docs.reverse(), container);

        // UI-Counter aktualisieren
        if(document.getElementById('current-page')) document.getElementById('current-page').textContent = currentPage;
        if(document.getElementById('total-pages')) document.getElementById('total-pages').textContent = lastPage;

        // 4. BUTTON-STATUS & PFEIL-FIX
        const btnNext = document.getElementById('btn-next');
        const btnLast = document.getElementById('btn-last');
        const btnOrder = document.getElementById('btn-order');

        // Rechts sperren, da wir am Ende sind
        btnNext?.classList.add('btn-disabled');
        btnLast?.classList.add('btn-disabled');


    } catch (err) {
        console.error("🔥 Error fetching last page:", err);
    }
}

/**
 * Erkennt den Typ eines Text-Snippets anhand gewichteter Heuristiken.
 * @param {string} value - Der zu prüfende Text.
 * @returns {Object} Ein Objekt mit type, icon, color und einem Vertrauenswert (score).
 */
function detectMimetype(value) {
    if (!value || value.trim() === '') {
        return { type: 'TXT', icon: '📄', color: '#aaaaaa', score: 0 };
    }

    const text = value; // Original für manche Prüfungen
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // --- Hilfsfunktionen ---
    const startsWithWord = (str, word) => {
        const lowerStr = str.toLowerCase();
        return lowerStr.startsWith(word) && 
               (str.length === word.length || /\s|\(|\[|\{|\n/.test(str[word.length]));
    };

    const countOccurrences = (str, regex) => (str.match(regex) || []).length;

    // --- Punktesystem für jeden Kandidaten ---
    const scores = {
        JSON: 0,
        XML: 0,
        HTML: 0,
        SVG: 0,
        CSS: 0,
        SQL: 0,
        PY: 0,
        JS: 0,
        PHP: 0,
        JAVA: 0,
        CPP: 0,
        MD: 0,
        CSV: 0,
        YAML: 0,
        TOML: 0,
        URL: 0,
        BASE64: 0,
        TXT: 1 // Basis, falls nichts anderes passt
    };

    // --- 1. Strukturelle Prüfungen (hohes Gewicht) ---

    // JSON: wirklich parsen
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            JSON.parse(trimmed);
            scores.JSON += 100; // sicher erkannt
        } catch (e) {
            // kein JSON
        }
    }

    // XML: Prüfe auf wohlgeformte Tags (vereinfacht)
    const xmlTagPattern = /<([a-z][a-z0-9]*)[^>]*>.*<\/\1>/is;
    if (xmlTagPattern.test(trimmed) && trimmed.includes('<?xml')) {
        scores.XML += 80;
    } else if (xmlTagPattern.test(trimmed)) {
        scores.XML += 40; // vielleicht HTML
    }

    // HTML: Doctype oder typische Tags
    if (lower.includes('<!doctype html>') || /<html\s*>/i.test(trimmed)) {
        scores.HTML += 90;
    } else if (/<(div|span|h1|p|a|img|table|ul|ol|li|form|input)/i.test(trimmed)) {
        scores.HTML += 30;
    }

    // SVG: spezifischer Start
    if (trimmed.startsWith('<svg') || (trimmed.includes('<svg') && trimmed.includes('</svg>'))) {
        scores.SVG += 80;
    }

    // CSS: { ... : ... } oder @-Regeln
    const cssBlockPattern = /\{[^}]*:[^}]*\}/g;
    const cssBlocks = countOccurrences(trimmed, cssBlockPattern);
    if (cssBlocks > 0) {
        scores.CSS += cssBlocks * 10;
    }
    if (/@(media|keyframes|font-face|import|supports)/i.test(trimmed)) {
        scores.CSS += 20;
    }

    // --- 2. Spracherkennung über Schlüsselwörter ---

    // Python
    if (/^(def |class |import |from |@\w+)/m.test(trimmed)) scores.PY += 20;
    if (/^\s+def\s/m.test(trimmed)) scores.PY += 15;
    if (/if\s+__name__\s*==\s*['"]__main__['"]/.test(trimmed)) scores.PY += 30;
    if (/print\(|len\(|range\(/i.test(trimmed)) scores.PY += 5;

    // JavaScript
    if (/^(function|const|let|var|import|export)\s+/m.test(trimmed)) scores.JS += 20;
    if (/=>\s*{/.test(trimmed)) scores.JS += 15;
    if (/console\.log|document\.|window\.|Math\./i.test(trimmed)) scores.JS += 10;
    if (/\(\s*\)\s*=>/.test(trimmed)) scores.JS += 10;

    // PHP
    if (/<\?php/i.test(trimmed)) scores.PHP += 100;
    if (/\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/.test(trimmed)) scores.PHP += 20;
    if (/echo\s+|print\s+|function\s+\w+\s*\(/i.test(trimmed)) scores.PHP += 10;

    // Java
    if (/public\s+class\s+\w+|private\s+\w+|protected\s+\w+|static\s+void\s+main/i.test(trimmed)) scores.JAVA += 30;
    if (/import\s+java\./i.test(trimmed)) scores.JAVA += 40;
    if (/System\.out\.println/i.test(trimmed)) scores.JAVA += 20;

    // C++
    if (/#include\s*[<"][^>"]+[>"]/.test(trimmed)) scores.CPP += 40;
    if (/using\s+namespace\s+std/i.test(trimmed)) scores.CPP += 30;
    if (/int\s+main\s*\(/.test(trimmed)) scores.CPP += 20;

    // SQL
    const sqlKeywords = ['select ', 'insert ', 'update ', 'delete ', 'create ', 'drop ', 'alter '];
    for (const kw of sqlKeywords) {
        if (startsWithWord(lower, kw)) scores.SQL += 20;
    }
    if (/from\s+\w+/i.test(trimmed) && /where\s+\w+/i.test(trimmed)) scores.SQL += 15;
    if (/join\s+\w+\s+on\s+/i.test(trimmed)) scores.SQL += 10;

    // --- 3. Markdown ---
    if (/^#{1,6}\s+/m.test(trimmed)) scores.MD += 20;
    if (/^[\*\-\+]\s+/m.test(trimmed)) scores.MD += 15;
    if (/^\d+\.\s+/m.test(trimmed)) scores.MD += 15;
    if (/^```/m.test(trimmed)) scores.MD += 20;
    if (/^>\s+/m.test(trimmed)) scores.MD += 10;

    // --- 4. CSV / Tabellendaten ---
    if (lines.length >= 2) {
        const delimiters = [',', ';', '\t'];
        for (const delim of delimiters) {
            const firstCols = lines[0].split(delim).length;
            if (firstCols > 1) {
                const allSame = lines.every(line => line.split(delim).length === firstCols);
                if (allSame) {
                    scores.CSV += 20 + firstCols; // mehr Spalten = höhere Punktzahl
                }
            }
        }
    }

    // --- 5. YAML / TOML ---
    if (/^[\w\-]+\s*:\s*.+/m.test(trimmed) && !/^\s*[{\[]/.test(trimmed)) {
        scores.YAML += 25; // typische Key-Value-Paare ohne umschließende Klammern
    }
    if (/^\[[\w\-\.]+\]\s*$/m.test(trimmed)) {
        scores.TOML += 30; // TOML-Header
    }

    // --- 6. URLs (falls der ganze String eine URL ist) ---
    const urlPattern = /^(https?:\/\/|ftp:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/[^\s]*)?$/i;
    if (urlPattern.test(trimmed)) {
        scores.URL += 50;
    }

    // --- 7. Base64 (grob) ---
    const base64Pattern = /^([A-Za-z0-9+\/]{4})*([A-Za-z0-9+\/]{4}|[A-Za-z0-9+\/]{3}=|[A-Za-z0-9+\/]{2}==)$/;
    if (trimmed.length > 20 && base64Pattern.test(trimmed)) {
        scores.BASE64 += 30;
    }

    // --- 8. Bestimmung des Typs mit höchster Punktzahl ---
    let bestType = 'TXT';
    let bestScore = scores.TXT;
    for (const [type, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestType = type;
        }
    }

    // --- 9. Mapping zu Icons und Farben (wie gehabt) ---
    const typeInfo = {
        JSON: { icon: '📦', color: '#f7df1e' },
        XML:  { icon: '🧬', color: '#ff6600' },
        HTML: { icon: '🌐', color: '#e34c26' },
        SVG:  { icon: '🖼️', color: '#ffb300' },
        CSS:  { icon: '🎨', color: '#264de4' },
        SQL:  { icon: '🗄️', color: '#336791' },
        PY:   { icon: '🐍', color: '#3776ab' },
        JS:   { icon: '📜', color: '#f7df1e' },
        PHP:  { icon: '🐘', color: '#777bb3' },
        JAVA: { icon: '☕', color: '#b07219' },
        CPP:  { icon: '⚙️', color: '#00599c' },
        MD:   { icon: '📝', color: '#083fa1' },
        CSV:  { icon: '📊', color: '#1d6f42' },
        YAML: { icon: '📋', color: '#cb171e' },
        TOML: { icon: '🔧', color: '#8b4513' },
        URL:  { icon: '🔗', color: '#2c3e50' },
        BASE64: { icon: '🔐', color: '#7f8c8d' },
        TXT:  { icon: '📄', color: '#aaaaaa' }
    };

    return {
        type: bestType,
        icon: typeInfo[bestType].icon,
        color: typeInfo[bestType].color,
        score: bestScore
    };
}


// --- 9. AUTH LOGIK & START ---
(async () => {
    try {
        const { onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");

onAuthStateChanged(auth, async (user) => {
    const loginModal = document.getElementById('login-modal');
    const userProfile = document.getElementById('user-profile');
    const userEmailSpan = document.getElementById('user-email');
    const gridSelect = document.getElementById('grid-select');
    const userModal = document.getElementById('user-modal');
    const modalEmail = document.getElementById('modal-user-email');

    if (user) {
        console.log("✅ Access granted for:", user.email);
        
        if (loginModal) {
            loginModal.classList.remove('active');
            loginModal.style.display = 'none';
        }

        if (userProfile) {
            userProfile.style.display = 'flex';
            userProfile.style.cursor = 'pointer';
            
            // FEATURE FIX: Hide all wording/email from the header
            if (userEmailSpan) userEmailSpan.style.display = 'none'; 
            
            // Tooltip only shows info
            userProfile.title = `CRUDX Account\n${user.email}`;

            userProfile.onclick = (e) => {
                e.stopPropagation();
                if (modalEmail) modalEmail.textContent = user.email;
                
                // Positioning floating popup directly under the icon
                const rect = userProfile.getBoundingClientRect();
                userModal.style.top = `${rect.bottom + 10}px`;
                userModal.style.left = `${rect.right - 280}px`;
                userModal.classList.toggle('active');
            };
        }

        const btnLogoutConfirm = document.getElementById('btn-logout-confirm');
        if (btnLogoutConfirm) {
            btnLogoutConfirm.onclick = async () => {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                await signOut(auth);
                window.location.reload();
            };
        }

        const btnCloseUser = document.getElementById('btn-close-user');
        if (btnCloseUser) {
            btnCloseUser.onclick = (e) => {
                e.stopPropagation();
                userModal.classList.remove('active');
            };
        }

        // Apply 3x3 Layout from URL
        const urlParams = new URLSearchParams(window.location.search);
        const viewParam = urlParams.get('view');
        if (viewParam) {
            if (gridSelect) gridSelect.value = viewParam;
            applyLayout(viewParam); 
        } else {
            applyLayout(gridSelect ? gridSelect.value : '3');
        }

        fetchRealData(); 

    } else {
        console.warn("🔒 Locked. Authentication required.");
        if (userProfile) userProfile.style.display = 'none';
        if (loginModal) {
            loginModal.style.display = 'flex';
            loginModal.classList.add('active');
        }
        
        const btnLink = document.getElementById('btn-send-link');
        if (btnLink) {
            btnLink.onclick = async () => {
                const emailInput = document.getElementById('login-email');
                if (!emailInput || !emailInput.value) return alert("Please enter an email address.");
                const currentView = gridSelect ? gridSelect.value : '3';
                const currentContinueUrl = `${window.location.origin}${window.location.pathname}?view=${currentView}`;
                const { loginWithEmail } = await import('./auth-helper.js');
                await loginWithEmail(auth, emailInput.value, currentContinueUrl);
                const status = document.getElementById('login-status');
                if (status) status.textContent = "Check your inbox (Emulator UI)!";
            };
        }
    }
});

        // Global click to close the popup
        window.addEventListener('click', () => {
            const userModal = document.getElementById('user-modal');
            if (userModal) userModal.classList.remove('active');
        });

    } catch (err) {
        console.error("🔥 Auth Init Error:", err);
    }
})(); // These are the missing brackets that were causing the crash

    } catch (e) { console.error("🔥 FATAL:", e); }
});