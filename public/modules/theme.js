// modules/theme.js
/**
 * Theme-Modul – verwaltet die Theme-Konfiguration, das Anwenden von Themes
 * und die Live-Bearbeitung im Editor.
 */

// ---------- Standard-Theme-Konfiguration (optimiert) ----------
export const themeState = {
    appConfig: {
        startupTheme: "night",
        themes: {
            night: {
                canvas: { bg: "#0a0a0a", text: "#eeeeee", border: "#333333", paddingTop: 10, padding: 15, opacity: 85, blur: true },
                card: { bg: "#111111", text: "#eeeeee", border: "#222222", opacity: 100, blur: false, padding: 20 },
                navi: { bg: "#0f0f0f", text: "#cccccc", border: "#333333", opacity: 85, blur: false, bottom: 25 },
                editor: { bg: "#111111", text: "#eeeeee", border: "#333333", opacity: 95, blur: true },
                search: { bg: "#111111", text: "#eeeeee", border: "#333333", opacity: 80, blur: false },
                burger: { text: "#00ff00" },
                key: { bg: "#1a1a1a", text: "#cccccc", border: "#333333", opacity: 80, blur: false },
                label: { bg: "#ffaa00", text: "#000000", border: "#cc8800", opacity: 90, blur: false },
                user: { bg: "#40c4ff", text: "#000000", border: "#333333", opacity: 80, blur: false },
                sys: { bg: "#ff5252", text: "#000000", border: "#333333", opacity: 80, blur: false }
            },
            day: {
                canvas: { bg: "#0a0a0a", text: "#111111", border: "#333333", paddingTop: 10, padding: 15, opacity: 85, blur: true },
                card: { bg: "#ffffff", text: "#111111", border: "#dddddd", opacity: 100, blur: false, padding: 20 },
                navi: { bg: "#eeeeee", text: "#333333", border: "#bbbbbb", opacity: 90, blur: false, bottom: 25 },
                editor: { bg: "#ffffff", text: "#111111", border: "#cccccc", opacity: 98, blur: true },
                search: { bg: "#ffffff", text: "#111111", border: "#cccccc", opacity: 90, blur: false },
                burger: { text: "#0077ff" },
                key: { bg: "#2a2a2a", text: "#cccccc", border: "#444444", opacity: 90, blur: false },
                label: { bg: "#ffaa00", text: "#000000", border: "#cc8800", opacity: 95, blur: false },
                user: { bg: "#0088cc", text: "#ffffff", border: "#0055aa", opacity: 90, blur: false },
                sys: { bg: "#cc0000", text: "#ffffff", border: "#aa0000", opacity: 90, blur: false }
            },
            arnold: {
                canvas: { bg: "#0a0a0a", text: "#ff0000", border: "#333333", paddingTop: 10, padding: 15, opacity: 85, blur: true },
                card: { bg: "#110000", text: "#ff0000", border: "#ff0000", opacity: 100, blur: false, padding: 20 },
                navi: { bg: "#000000", text: "#ff0000", border: "#ff0000", opacity: 80, blur: false, bottom: 10 },
                editor: { bg: "#000000", text: "#ff0000", border: "#ff0000", opacity: 100, blur: false },
                search: { bg: "#000000", text: "#ff0000", border: "#ff0000", opacity: 80, blur: false },
                burger: { text: "#ff0000" },
                key: { bg: "#220000", text: "#ff5555", border: "#550000", opacity: 80, blur: false },
                label: { bg: "#ff0000", text: "#ffffff", border: "#ff0000", opacity: 95, blur: false },
                user: { bg: "#ff0000", text: "#000000", border: "#ff0000", opacity: 80, blur: false },
                sys: { bg: "#ff0000", text: "#000000", border: "#ff0000", opacity: 80, blur: false }
            },
            gaga: {
                canvas: { bg: "#0a0a0a", text: "#000000", border: "#333333", paddingTop: 10, padding: 15, opacity: 85, blur: true },
                card: { bg: "#ffb3ff", text: "#000000", border: "#000000", opacity: 90, blur: true, padding: 20 },
                navi: { bg: "#ffff00", text: "#000000", border: "#000000", opacity: 80, blur: false, bottom: 40 },
                editor: { bg: "#00ffff", text: "#000000", border: "#000000", opacity: 90, blur: true },
                search: { bg: "#ffffff", text: "#000000", border: "#000000", opacity: 95, blur: false },
                burger: { text: "#ff00ff" },
                key: { bg: "#222222", text: "#ffff00", border: "#444444", opacity: 80, blur: false },
                label: { bg: "#ff00ff", text: "#ffffff", border: "#aa00aa", opacity: 95, blur: false },
                user: { bg: "#ffff00", text: "#000000", border: "#000000", opacity: 80, blur: false },
                sys: { bg: "#00ffff", text: "#000000", border: "#000000", opacity: 80, blur: false }
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
    const sections = ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'label', 'user', 'sys'];

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

    // Spezielle Abstände
    const canvasPadding = (t.canvas && typeof t.canvas.padding === 'number') ? t.canvas.padding : 15;
    root.style.setProperty('--app-padding', canvasPadding + 'px');

    const canvasPaddingTop = (t.canvas && typeof t.canvas.paddingTop === 'number') ? t.canvas.paddingTop : 10;
    root.style.setProperty('--canvas-padding-top', canvasPaddingTop + 'px');

    const naviBottom = (t.navi && typeof t.navi.bottom === 'number') ? t.navi.bottom : 25;
    root.style.setProperty('--navi-bottom', naviBottom + 'px');

    const cardPadding = (t.card && typeof t.card.padding === 'number') ? t.card.padding : 20;
    root.style.setProperty('--card-padding', cardPadding + 'px');

    // Burger-Button
    const burgerColor = t.burger?.text || '#00ff00';
    root.style.setProperty('--burger-text', burgerColor);

    const burgerBtn = document.getElementById('btn-burger');
    if (burgerBtn) {
        burgerBtn.style.color = burgerColor;
        const svg = burgerBtn.querySelector('svg');
        if (svg) svg.style.fill = burgerColor;
    }

    // Dropdown im Modal synchronisieren
    const editThemeSelect = document.getElementById('in-edit-theme');
    if (editThemeSelect) editThemeSelect.value = themeName;

    console.log(`🎨 Theme "${themeName}" angewendet.`);
}

// ---------- Modal-UI synchronisieren ----------
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

    ['canvas', 'card', 'navi', 'editor', 'search', 'key', 'label', 'user', 'sys'].forEach(s => sync(s, s));

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
}

// ---------- Live-Editor initialisieren ----------
export function initThemeEditor() {
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

    const burgerInput = document.getElementById('in-burger-text');
    if (burgerInput) {
        burgerInput.addEventListener('input', (e) => {
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].burger) {
                themeState.appConfig.themes[themeState.currentActiveTheme].burger = {};
            }
            themeState.appConfig.themes[themeState.currentActiveTheme].burger.text = e.target.value;
            applyTheme(themeState.currentActiveTheme);
        });
    }

    const paddingEl = document.getElementById('in-canvas-padding');
    if (paddingEl) {
        paddingEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas.padding = val;
                applyTheme(themeState.currentActiveTheme);
            }
        });
    }

    const paddingTopEl = document.getElementById('in-canvas-padding-top');
    if (paddingTopEl) {
        paddingTopEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas.paddingTop = val;
                document.documentElement.style.setProperty('--canvas-padding-top', val + 'px');
            }
        });
    }

    const naviBottomEl = document.getElementById('in-navi-bottom');
    if (naviBottomEl) {
        naviBottomEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].navi.bottom = val;
                applyTheme(themeState.currentActiveTheme);
            }
        });
    }

    const cardPaddingEl = document.getElementById('in-card-padding');
    if (cardPaddingEl) {
        cardPaddingEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].card.padding = val;
                applyTheme(themeState.currentActiveTheme);
            }
        });
    }
}

// ---------- Hilfsfunktion für Import-Validierung ----------
function validateAndApplyTheme(imported) {
    if (!imported.startupTheme || !imported.themes) {
        alert('Ungültiges Theme-JSON: "startupTheme" oder "themes" fehlen.');
        return false;
    }
    themeState.appConfig = imported;
    themeState.currentActiveTheme = imported.startupTheme;
    applyTheme(themeState.currentActiveTheme);
    syncModalUI();
    console.log('✅ Theme importiert:', imported);
    return true;
}

// ---------- Theme-Umschaltung initialisieren ----------
export function initThemeControls() {
    const btnTheme = document.getElementById('btn-theme');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            const keys = Object.keys(themeState.appConfig.themes);
            let idx = (keys.indexOf(themeState.currentActiveTheme) + 1) % keys.length;
            applyTheme(keys[idx]);
            syncModalUI();
        });
    }

    const editThemeSelect = document.getElementById('in-edit-theme');
    if (editThemeSelect) {
        editThemeSelect.addEventListener('change', (e) => {
            themeState.currentActiveTheme = e.target.value;
            applyTheme(e.target.value);
            syncModalUI();
        });
    }

    const drawerTheme = document.getElementById('btn-drawer-theme');
    if (drawerTheme) {
        drawerTheme.addEventListener('click', () => {
            syncModalUI();
            document.getElementById('theme-modal').classList.add('active');
            document.getElementById('drawer').classList.remove('open');
        });
    }

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

    // X-Button zum Schließen
    const closeX = document.getElementById('btn-close-modal-x');
    if (closeX) {
        closeX.addEventListener('click', () => {
            document.getElementById('theme-modal').classList.remove('active');
        });
    }

    // ----- Import Modal Logic -----
    const importBtn = document.getElementById('btn-import-theme');
    const importModal = document.getElementById('import-modal');
    const importConfirm = document.getElementById('btn-import-confirm');
    const importCancel = document.getElementById('btn-import-cancel');
    const importFileInput = document.getElementById('import-file');
    const importArea = document.getElementById('import-area');

    if (importBtn && importModal) {
        importBtn.addEventListener('click', () => {
            // Textarea und File-Input zurücksetzen
            if (importArea) importArea.value = '';
            if (importFileInput) importFileInput.value = '';
            importModal.classList.add('active');
        });
    }

    if (importConfirm) {
        importConfirm.addEventListener('click', () => {
            // 1. Versuche aus der Textarea zu lesen
            if (importArea && importArea.value.trim() !== '') {
                try {
                    const imported = JSON.parse(importArea.value);
                    if (validateAndApplyTheme(imported)) {
                        importModal.classList.remove('active');
                    }
                } catch (error) {
                    alert('Ungültiges JSON: ' + error.message);
                }
            }
            // 2. Sonst: Versuche aus der Datei zu lesen
            else if (importFileInput && importFileInput.files.length > 0) {
                const file = importFileInput.files[0];
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const imported = JSON.parse(e.target.result);
                        if (validateAndApplyTheme(imported)) {
                            importModal.classList.remove('active');
                        }
                    } catch (error) {
                        alert('Fehler beim Lesen der Datei: ' + error.message);
                    }
                };
                reader.readAsText(file);
            } else {
                alert('Bitte JSON in das Textfeld einfügen oder eine Datei auswählen.');
            }
        });
    }

    if (importCancel) {
        importCancel.addEventListener('click', () => {
            importModal.classList.remove('active');
        });
    }

    // Option: Bei Dateiauswahl den Inhalt in die Textarea laden (zur Kontrolle)
    if (importFileInput) {
        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (importArea) {
                        importArea.value = e.target.result;
                    }
                };
                reader.readAsText(file);
            }
        });
    }
}