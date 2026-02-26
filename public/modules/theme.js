// public/modules/theme.js

// ---------- Zustand (State) ----------
export const themeState = {
    appConfig: {
        "startupTheme": "night",
        "themes": {
            "night": {
                "canvas": { "bg": "#0a0a0a", "border": "#333333", "paddingTop": 10,"padding": 15, "opacity": 85, "blur": true },
                "card":   { "bg": "#111111", "text": "#eeeeee", "border": "#222222", "opacity": 100, "blur": false, "padding": 20 },
                "navi":   { "bg": "#0f0f0f", "text": "#cccccc", "border": "#333333", "opacity": 85, "blur": true, "bottom": 25 },
                "editor": { "bg": "#111111", "text": "#eeeeee", "border": "#333333", "opacity": 95, "blur": true },
                "search": { "bg": "#111111", "text": "#eeeeee", "border": "#333333", "opacity": 80, "blur": true },
                "burger": { "text": "#00ff00" },
                "key":    { "bg": "#aaaaaa", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
                "label":  { "bg": "#ffffff", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
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
                "key":    { "bg": "#aaaaaa", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
                "label":  { "bg": "#ffffff", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
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
                "key":    { "bg": "#aaaaaa", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
                "label":  { "bg": "#ffffff", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
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
                "key":    { "bg": "#aaaaaa", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
                "label":  { "bg": "#ffffff", "text": "#00ff00", "border": "#333333", "opacity": 80, "blur": false },
                "user":   { "bg": "#ffff00", "text": "#000000", "border": "#000000", "opacity": 100, "blur": false },
                "sys":    { "bg": "#00ffff", "text": "#000000", "border": "#000000", "opacity": 100, "blur": false }
            }
        }
    },
    currentActiveTheme: "night"
};

// ---------- Hilfsfunktionen ----------
export function hexToRgb(hex) {
    let c = hex.substring(1).split('');
    if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(', ');
}

// ---------- Theme anwenden ----------
export function applyTheme(themeName) {
    themeState.currentActiveTheme = themeName;
    const t = themeState.appConfig.themes[themeName];
    if (!t) return;

    const root = document.documentElement;

    // 1. STANDARD-SEKTIONEN (Farben, Rahmen, Glas-Effekt)
    const sections = ['canvas', 'card', 'navi', 'editor', 'search', 'key', "label", 'user', 'sys'];
    sections.forEach(s => {
        const sec = t[s];
        if (!sec) return;

        if (sec.bg !== undefined) root.style.setProperty(`--${s}-bg`, sec.bg);
        if (sec.text !== undefined) root.style.setProperty(`--${s}-text`, sec.text);
        if (sec.border !== undefined) root.style.setProperty(`--${s}-border`, sec.border);

        if (sec.bg !== undefined && sec.opacity !== undefined) {
            const rgb = hexToRgb(sec.bg);
            const alpha = (sec.opacity / 100).toFixed(2);
            root.style.setProperty(`--${s}-glass`, `rgba(${rgb}, ${alpha})`);
        }

        root.style.setProperty(`--${s}-blur`, sec.blur ? 'blur(10px)' : 'none');
    });

    // 2. SPEZIAL-EIGENSCHAFTEN (Abstände & Paddings)
    const canvasPadding = (t.canvas && typeof t.canvas.padding === 'number') ? t.canvas.padding : 15;
    root.style.setProperty('--app-padding', canvasPadding + 'px');

    const canvasPaddingTop = (t.canvas && typeof t.canvas.paddingTop === 'number') ? t.canvas.paddingTop : 10;
    root.style.setProperty('--canvas-padding-top', canvasPaddingTop + 'px');

    const naviBottom = (t.navi && typeof t.navi.bottom === 'number') ? t.navi.bottom : 25;
    root.style.setProperty('--navi-bottom', naviBottom + 'px');

    const cardPadding = (t.card && typeof t.card.padding === 'number') ? t.card.padding : 20;
    root.style.setProperty('--card-padding', cardPadding + 'px');

    // 3. BURGER-BUTTON FIX (Direkte Färbung)
    const burgerColor = t.burger?.text || '#00ff00';
    root.style.setProperty('--burger-text', burgerColor);

    const burgerBtn = document.getElementById('btn-burger');
    if (burgerBtn) {
        burgerBtn.style.color = burgerColor;
        const svg = burgerBtn.querySelector('svg');
        if (svg) svg.style.fill = burgerColor;
    }

    // 4. UI-SYNCHRONISATION
    const editThemeSelect = document.getElementById('in-edit-theme');
    if (editThemeSelect) editThemeSelect.value = themeName;

    console.log(`🎨 Theme "${themeName}" mit Card-Padding (${cardPadding}px) angewendet.`);
}

// ---------- Modal-Sync ----------
export function syncModalUI() {
    const t = themeState.appConfig.themes[themeState.currentActiveTheme];
    if (!t) return;

    const startupInput = document.getElementById('in-startup');
    if (startupInput) startupInput.value = themeState.appConfig.startupTheme;

    const editThemeInput = document.getElementById('in-edit-theme');
    if (editThemeInput) editThemeInput.value = themeState.currentActiveTheme;

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

    ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'label',  'user', 'sys'].forEach(s => sync(s, s));

    const burgerColorInput = document.getElementById('in-burger-text');
    if (burgerColorInput && t.burger && t.burger.text) {
        burgerColorInput.value = t.burger.text;
    }

    const paddingInput = document.getElementById('in-canvas-padding');
    if (paddingInput && t.canvas && typeof t.canvas.padding === 'number') {
        paddingInput.value = t.canvas.padding;
    }

    const paddingTopInput = document.getElementById('in-canvas-padding-top');
    if (paddingTopInput && t.canvas && typeof t.canvas.paddingTop === 'number') {
        paddingTopInput.value = t.canvas.paddingTop;
    }

    const naviBottomInput = document.getElementById('in-navi-bottom');
    if (naviBottomInput && t.navi && typeof t.navi.bottom === 'number') {
        naviBottomInput.value = t.navi.bottom;
    }

    const cardPaddingInput = document.getElementById('in-card-padding');
    if (cardPaddingInput && t.card && typeof t.card.padding === 'number') {
        cardPaddingInput.value = t.card.padding;
    }

    console.log("🔄 Modal UI synchronisiert auf Theme:", themeState.currentActiveTheme);
}

// ---------- Live-Editor Listener initialisieren ----------
export function initThemeEditor() {
    // Sektionen für Farben, Opacity, Blur
    ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'label', 'user', 'sys'].forEach(sec => {
        ['bg', 'text', 'border'].forEach(k => {
            const el = document.getElementById(`in-${sec}-${k}`);
            if (el) {
                el.addEventListener('input', (e) => {
                    themeState.appConfig.themes[themeState.currentActiveTheme][sec][k] = e.target.value;
                    applyTheme(themeState.currentActiveTheme);
                });
            }
        });
        const opEl = document.getElementById(`in-${sec}-opacity`);
        if (opEl) {
            opEl.addEventListener('input', (e) => {
                themeState.appConfig.themes[themeState.currentActiveTheme][sec].opacity = parseInt(e.target.value);
                applyTheme(themeState.currentActiveTheme);
            });
        }
        const blurEl = document.getElementById(`in-${sec}-blur`);
        if (blurEl) {
            blurEl.addEventListener('change', (e) => {
                themeState.appConfig.themes[themeState.currentActiveTheme][sec].blur = e.target.checked;
                applyTheme(themeState.currentActiveTheme);
            });
        }
    });

    // Burger-Farbe
    const burgerColorInput = document.getElementById('in-burger-text');
    if (burgerColorInput) {
        burgerColorInput.addEventListener('input', (e) => {
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].burger) {
                themeState.appConfig.themes[themeState.currentActiveTheme].burger = {};
            }
            themeState.appConfig.themes[themeState.currentActiveTheme].burger.text = e.target.value;
            applyTheme(themeState.currentActiveTheme);
        });
    }

    // Canvas Padding
    const paddingEl = document.getElementById('in-canvas-padding');
    if (paddingEl) {
        paddingEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas.padding = val;
                applyTheme(themeState.currentActiveTheme);
            }
        });
    }

    // Canvas Padding Top
    const paddingTopEl = document.getElementById('in-canvas-padding-top');
    if (paddingTopEl) {
        paddingTopEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas.paddingTop = val;
                document.documentElement.style.setProperty('--canvas-padding-top', val + 'px');
                console.log("📏 Padding Top live geändert auf:", val + "px");
            }
        });
    }

    // Navi Bottom
    const naviBottomEl = document.getElementById('in-navi-bottom');
    if (naviBottomEl) {
        naviBottomEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].navi.bottom = val;
                applyTheme(themeState.currentActiveTheme);
            }
        });
    }

    // Card Padding
    const cardPaddingEl = document.getElementById('in-card-padding');
    if (cardPaddingEl) {
        cardPaddingEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].card.padding = val;
                applyTheme(themeState.currentActiveTheme);
            }
        });
    }
}

// ---------- Theme-Umschaltung (Buttons) ----------
export function initThemeControls() {
    // Theme-Button (FAB)
    const btnTheme = document.getElementById('btn-theme');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            const keys = Object.keys(themeState.appConfig.themes);
            let idx = (keys.indexOf(themeState.currentActiveTheme) + 1) % keys.length;
            applyTheme(keys[idx]);
            syncModalUI();
        });
    }

    // Dropdown im Modal
    const editThemeSelect = document.getElementById('in-edit-theme');
    if (editThemeSelect) {
        editThemeSelect.addEventListener('change', (e) => {
            themeState.currentActiveTheme = e.target.value;
            applyTheme(e.target.value);
            syncModalUI();
        });
    }

    // Drawer-Button zum Öffnen des Theme-Modals
    const drawerTheme = document.getElementById('btn-drawer-theme');
    if (drawerTheme) {
        drawerTheme.addEventListener('click', () => {
            syncModalUI();
            const themeModal = document.getElementById('theme-modal');
            if (themeModal) themeModal.classList.add('active');
            const drawer = document.getElementById('drawer');
            if (drawer) drawer.classList.remove('open');
        });
    }

    // Export-Button
    const exportBtn = document.getElementById('btn-export-theme');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const exportArea = document.getElementById('export-area');
            const exportModal = document.getElementById('export-modal');
            const fullExport = {
                startupTheme: themeState.appConfig.startupTheme,
                themes: themeState.appConfig.themes
            };
            exportArea.value = JSON.stringify(fullExport, null, 4);
            exportModal.classList.add('active');
        });
    }
}