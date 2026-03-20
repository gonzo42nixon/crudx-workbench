// modules/theme.js
import { db } from './firebase.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { buildFirestoreCreatePayload } from './utils.js';

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
                card: { bg: "#111111", text: "#eeeeee", border: "#222222", opacity: 100, blur: false, padding: 30 },
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
                canvas: { bg: "#ffffff", text: "#111111", border: "#dddddd", paddingTop: 10, padding: 15, opacity: 85, blur: true },
                card: { bg: "#ffffff", text: "#111111", border: "#dddddd", opacity: 100, blur: false, padding: 30 },
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
                card: { bg: "#110000", text: "#ff0000", border: "#ff0000", opacity: 100, blur: false, padding: 30 },
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
                card: { bg: "#ffb3ff", text: "#000000", border: "#000000", opacity: 90, blur: true, padding: 30 },
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

    const canvasPaddingTop = (t.canvas && typeof t.canvas.paddingTop === 'number') ? t.canvas.paddingTop : 0;
    root.style.setProperty('--canvas-padding-top', canvasPaddingTop + 'px');

    const naviBottom = (t.navi && typeof t.navi.bottom === 'number') ? t.navi.bottom : 25;
    root.style.setProperty('--navi-bottom', naviBottom + 'px');

    const cardPadding = (t.card && typeof t.card.padding === 'number') ? t.card.padding : 20;
    root.style.setProperty('--card-padding', cardPadding + 'px');

    const cardPaddingTop = (t.card && typeof t.card.paddingTop === 'number') ? t.card.paddingTop : 40;
    root.style.setProperty('--card-padding-top', cardPaddingTop + 'px');

    // Canvas background image layer — a dedicated fixed div (z-index: -1) so we can
    // apply opacity and filter independently of child elements.
    const bgImage = t.canvas?.backgroundImage;
    let bgLayer = document.getElementById('canvas-bg-layer');
    if (bgImage && bgImage.trim()) {
        if (!bgLayer) {
            bgLayer = document.createElement('div');
            bgLayer.id = 'canvas-bg-layer';
            bgLayer.style.cssText = [
                'position:fixed', 'inset:0', 'z-index:-1',
                'pointer-events:none',
                'background-size:cover',
                'background-position:center center',
                'background-attachment:fixed',
                'background-repeat:no-repeat',
                'transition:opacity 0.4s ease, filter 0.4s ease'
            ].join(';');
            document.body.prepend(bgLayer);
        }
        bgLayer.style.backgroundImage = `url('${bgImage.trim()}')`;
        const dim    = Math.max(0, Math.min(100, t.canvas?.backgroundImageDim  ?? 0));
        const sat    = Math.max(0, Math.min(100, t.canvas?.backgroundImageSat  ?? 100));
        const blurPc = Math.max(0, Math.min(100, t.canvas?.backgroundImageBlur ?? 0));
        const blurPx = (blurPc * 0.5).toFixed(1);  // 100 % → 50 px
        bgLayer.style.opacity = ((100 - dim) / 100).toFixed(2);
        bgLayer.style.filter  = `saturate(${sat}%) blur(${blurPx}px)`;
    } else if (bgLayer) {
        bgLayer.style.backgroundImage = '';
        bgLayer.style.opacity = '1';
        bgLayer.style.filter  = '';
    }

    // Card background image — setzt CSS-Variablen für das ::before-Pseudo-Element
    const cardBgImage = t.card?.backgroundImage;
    if (cardBgImage && cardBgImage.trim()) {
        const cardDim    = Math.max(0, Math.min(100, t.card?.backgroundImageDim  ?? 0));
        const cardSat    = Math.max(0, Math.min(100, t.card?.backgroundImageSat  ?? 100));
        const cardBlurPc = Math.max(0, Math.min(100, t.card?.backgroundImageBlur ?? 0));
        const cardBlurPx = (cardBlurPc * 0.5).toFixed(1);  // 100 % → 50 px
        root.style.setProperty('--card-bg-image', `url('${cardBgImage.trim()}')`);
        root.style.setProperty('--card-bg-image-opacity', ((100 - cardDim) / 100).toFixed(2));
        root.style.setProperty('--card-bg-image-filter',  `saturate(${cardSat}%) blur(${cardBlurPx}px)`);
    } else {
        root.style.setProperty('--card-bg-image', 'none');
        root.style.setProperty('--card-bg-image-opacity', '1');
        root.style.setProperty('--card-bg-image-filter',  'none');
    }

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

    // Update theme toggle button tooltip
    const btnTheme = document.getElementById('btn-theme');
    if (btnTheme) btnTheme.title = `Theme: ${themeName}`;

    console.log(`🎨 Theme "${themeName}" applied.`);
}

/**
 * Lädt die Theme-Konfiguration (Core Data) direkt aus dem Firestore.
 */
export async function loadThemeFromFirestore() {
    const urlParams = new URLSearchParams(window.location.search);
    // FIX: Nutze 'theme' statt 'search', um Kollisionen mit Dokumenten-Inhalten (HTML) zu vermeiden.
    const targetId = urlParams.get('theme') || "CRUDX-CORE_-DATA_-THEME";
    
    try {
        const docRef = doc(db, "kv-store", targetId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            // Sicherstellen, dass es sich um einen validen JSON-String handelt, der Theme-Daten enthält
            if (data.value && typeof data.value === 'string' && data.value.trim().startsWith('{')) {
                const config = JSON.parse(data.value);
                if (config.themes) {
                    validateAndApplyTheme(config);
                    console.log(`✅ Core Theme Data [${targetId}] successfully loaded from Firestore.`);
                }
            }
        }
    } catch (err) {
        console.warn("⚠️ Could not load Core Theme from Firestore, using hardcoded defaults:", err);
    }
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

    const cardPaddingTopInput = document.getElementById('in-card-padding-top');
    if (cardPaddingTopInput && t.card && typeof t.card.paddingTop === 'number') {
        cardPaddingTopInput.value = t.card.paddingTop;
    }

    const bgImageInput = document.getElementById('in-canvas-bg-image');
    if (bgImageInput) bgImageInput.value = t.canvas?.backgroundImage || '';

    const bgDimInput = document.getElementById('in-canvas-bg-dim');
    if (bgDimInput) bgDimInput.value = t.canvas?.backgroundImageDim ?? 0;

    const bgSatInput = document.getElementById('in-canvas-bg-sat');
    if (bgSatInput) bgSatInput.value = t.canvas?.backgroundImageSat ?? 100;

    const bgBlurInput = document.getElementById('in-canvas-bg-blur');
    if (bgBlurInput) bgBlurInput.value = t.canvas?.backgroundImageBlur ?? 0;

    const cardBgImageInput = document.getElementById('in-card-bg-image');
    if (cardBgImageInput) cardBgImageInput.value = t.card?.backgroundImage || '';

    const cardBgDimInput = document.getElementById('in-card-bg-dim');
    if (cardBgDimInput) cardBgDimInput.value = t.card?.backgroundImageDim ?? 0;

    const cardBgSatInput = document.getElementById('in-card-bg-sat');
    if (cardBgSatInput) cardBgSatInput.value = t.card?.backgroundImageSat ?? 100;

    const cardBgBlurInput = document.getElementById('in-card-bg-blur');
    if (cardBgBlurInput) cardBgBlurInput.value = t.card?.backgroundImageBlur ?? 0;
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
                console.log(`🎨 UI Feedback: Canvas Padding Top set to ${val}px`);
                applyTheme(themeState.currentActiveTheme);
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

    const cardPaddingTopEl = document.getElementById('in-card-padding-top');
    if (cardPaddingTopEl) {
        cardPaddingTopEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val)) {
                themeState.appConfig.themes[themeState.currentActiveTheme].card.paddingTop = val;
                applyTheme(themeState.currentActiveTheme);
            }
        });
    }

    const bgImageEl = document.getElementById('in-canvas-bg-image');
    if (bgImageEl) {
        bgImageEl.addEventListener('input', (e) => {
            const url = e.target.value.trim();
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].canvas) {
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas = {};
            }
            themeState.appConfig.themes[themeState.currentActiveTheme].canvas.backgroundImage = url || '';
            applyTheme(themeState.currentActiveTheme);
        });
    }

    const bgDimEl = document.getElementById('in-canvas-bg-dim');
    if (bgDimEl) {
        bgDimEl.addEventListener('input', (e) => {
            const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].canvas)
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas = {};
            themeState.appConfig.themes[themeState.currentActiveTheme].canvas.backgroundImageDim = val;
            applyTheme(themeState.currentActiveTheme);
        });
    }

    const bgSatEl = document.getElementById('in-canvas-bg-sat');
    if (bgSatEl) {
        bgSatEl.addEventListener('input', (e) => {
            const val = Math.max(0, Math.min(100, parseInt(e.target.value) ?? 100));
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].canvas)
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas = {};
            themeState.appConfig.themes[themeState.currentActiveTheme].canvas.backgroundImageSat = val;
            applyTheme(themeState.currentActiveTheme);
        });
    }

    const bgBlurEl = document.getElementById('in-canvas-bg-blur');
    if (bgBlurEl) {
        bgBlurEl.addEventListener('input', (e) => {
            const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].canvas)
                themeState.appConfig.themes[themeState.currentActiveTheme].canvas = {};
            themeState.appConfig.themes[themeState.currentActiveTheme].canvas.backgroundImageBlur = val;
            applyTheme(themeState.currentActiveTheme);
        });
    }

    // ---- Card Background Image ----
    const cardBgImageEl = document.getElementById('in-card-bg-image');
    if (cardBgImageEl) {
        cardBgImageEl.addEventListener('input', (e) => {
            const url = e.target.value.trim();
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].card)
                themeState.appConfig.themes[themeState.currentActiveTheme].card = {};
            themeState.appConfig.themes[themeState.currentActiveTheme].card.backgroundImage = url || '';
            applyTheme(themeState.currentActiveTheme);
        });
    }

    const cardBgDimEl = document.getElementById('in-card-bg-dim');
    if (cardBgDimEl) {
        cardBgDimEl.addEventListener('input', (e) => {
            const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].card)
                themeState.appConfig.themes[themeState.currentActiveTheme].card = {};
            themeState.appConfig.themes[themeState.currentActiveTheme].card.backgroundImageDim = val;
            applyTheme(themeState.currentActiveTheme);
        });
    }

    const cardBgSatEl = document.getElementById('in-card-bg-sat');
    if (cardBgSatEl) {
        cardBgSatEl.addEventListener('input', (e) => {
            const val = Math.max(0, Math.min(100, parseInt(e.target.value) ?? 100));
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].card)
                themeState.appConfig.themes[themeState.currentActiveTheme].card = {};
            themeState.appConfig.themes[themeState.currentActiveTheme].card.backgroundImageSat = val;
            applyTheme(themeState.currentActiveTheme);
        });
    }

    const cardBgBlurEl = document.getElementById('in-card-bg-blur');
    if (cardBgBlurEl) {
        cardBgBlurEl.addEventListener('input', (e) => {
            const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
            if (!themeState.appConfig.themes[themeState.currentActiveTheme].card)
                themeState.appConfig.themes[themeState.currentActiveTheme].card = {};
            themeState.appConfig.themes[themeState.currentActiveTheme].card.backgroundImageBlur = val;
            applyTheme(themeState.currentActiveTheme);
        });
    }
}

// ---------- Hilfsfunktion für Import-Validierung ----------
function validateAndApplyTheme(imported) {
    if (!imported.startupTheme || !imported.themes) {
        alert('Invalid Theme JSON: "startupTheme" or "themes" missing.');
        return false;
    }
    themeState.appConfig = imported;
    themeState.currentActiveTheme = imported.startupTheme;
    applyTheme(themeState.currentActiveTheme);
    syncModalUI();
    console.log('✅ Theme imported:', imported);
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

    // ----- Cloud Save Logic (CRUDX Core) -----
    const saveCloudBtn = document.getElementById('btn-save-theme-cloud');
    if (saveCloudBtn) {
        saveCloudBtn.addEventListener('click', async () => {
            const originalText = saveCloudBtn.textContent;
            saveCloudBtn.textContent = "⏳ Saving...";
            saveCloudBtn.disabled = true;

            try {
                // Pre-save sync: explicitly read bg-image inputs from the DOM
                // so their values are guaranteed to be in the theme state even if
                // an input event was missed (e.g. paste, auto-fill, type="url" quirks).
                const activeCanvas = themeState.appConfig.themes[themeState.currentActiveTheme]?.canvas;
                console.group('🎨 Theme Save — Debug');
                console.log('active theme  :', themeState.currentActiveTheme);
                console.log('canvas before :', JSON.parse(JSON.stringify(activeCanvas ?? {})));
                if (activeCanvas) {
                    const bgImgEl  = document.getElementById('in-canvas-bg-image');
                    const bgDimEl  = document.getElementById('in-canvas-bg-dim');
                    const bgSatEl  = document.getElementById('in-canvas-bg-sat');
                    const bgBlurEl = document.getElementById('in-canvas-bg-blur');
                    console.log('DOM bgImgEl found:', !!bgImgEl, '  value:', bgImgEl?.value);
                    console.log('DOM bgDimEl found:', !!bgDimEl, '  value:', bgDimEl?.value);
                    console.log('DOM bgSatEl found:', !!bgSatEl, '  value:', bgSatEl?.value);
                    console.log('DOM bgBlurEl found:', !!bgBlurEl, '  value:', bgBlurEl?.value);
                    if (bgImgEl)  activeCanvas.backgroundImage    = bgImgEl.value.trim();
                    if (bgDimEl)  activeCanvas.backgroundImageDim  = Math.max(0, Math.min(100, parseInt(bgDimEl.value) || 0));
                    if (bgSatEl)  activeCanvas.backgroundImageSat  = Math.max(0, Math.min(100, parseInt(bgSatEl.value) ?? 100));
                    if (bgBlurEl) activeCanvas.backgroundImageBlur = Math.max(0, Math.min(100, parseInt(bgBlurEl.value) || 0));
                    console.log('canvas after  :', JSON.parse(JSON.stringify(activeCanvas)));
                } else {
                    console.warn('⚠️ activeCanvas is undefined — theme key may be wrong');
                }

                // Pre-save sync for card background image fields
                const activeCard = themeState.appConfig.themes[themeState.currentActiveTheme]?.card;
                if (activeCard) {
                    const cardBgImgEl  = document.getElementById('in-card-bg-image');
                    const cardBgDimEl  = document.getElementById('in-card-bg-dim');
                    const cardBgSatEl  = document.getElementById('in-card-bg-sat');
                    const cardBgBlurEl = document.getElementById('in-card-bg-blur');
                    if (cardBgImgEl)  activeCard.backgroundImage    = cardBgImgEl.value.trim();
                    if (cardBgDimEl)  activeCard.backgroundImageDim  = Math.max(0, Math.min(100, parseInt(cardBgDimEl.value) || 0));
                    if (cardBgSatEl)  activeCard.backgroundImageSat  = Math.max(0, Math.min(100, parseInt(cardBgSatEl.value) ?? 100));
                    if (cardBgBlurEl) activeCard.backgroundImageBlur = Math.max(0, Math.min(100, parseInt(cardBgBlurEl.value) || 0));
                }

                const config = {
                    startupTheme: themeState.appConfig.startupTheme,
                    themes: themeState.appConfig.themes
                };
                
                const urlParamsDbg = new URLSearchParams(window.location.search);
                const targetIdDbg  = urlParamsDbg.get('theme') || "CRUDX-CORE_-DATA_-THEME";
                console.log('target Firestore doc:', targetIdDbg);
                console.log('config.themes[' + themeState.currentActiveTheme + '].canvas:', JSON.parse(JSON.stringify(config.themes[themeState.currentActiveTheme]?.canvas ?? {})));
                console.groupEnd();
                
                const urlParams = new URLSearchParams(window.location.search);
                const targetId = urlParams.get('theme') || "CRUDX-CORE_-DATA_-THEME";

                const isEmulator = ['localhost', '127.0.0.1'].includes(window.location.hostname);

                if (isEmulator) {
                    // Local Mode: Direct Firestore Write
                    await setDoc(doc(db, "kv-store", targetId), {
                        value: JSON.stringify(config, null, 4),
                        last_update_ts: new Date().toISOString()
                    }, { merge: true });
                } else {
                    // Production Mode: Route through Webhook
                    const payloadData = {
                        key: targetId,
                        value: JSON.stringify(config, null, 4),
                        last_update_ts: new Date().toISOString()
                    };
                    const payload = buildFirestoreCreatePayload(payloadData);
                    payload.action = "U";

                    const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) throw new Error(`Webhook Error: ${response.statusText}`);
                }

                saveCloudBtn.textContent = "✅ Saved!";
                setTimeout(() => {
                    saveCloudBtn.textContent = originalText;
                    saveCloudBtn.disabled = false;
                }, 2000);
            } catch (err) {
                console.error("Cloud Save Error:", err);
                alert("Save failed: " + err.message);
                saveCloudBtn.textContent = originalText;
                saveCloudBtn.disabled = false;
            }
        });
    }

    // Ensure changes to the startup theme selector are captured in state
    const startupSelect = document.getElementById('in-startup');
    if (startupSelect) {
        startupSelect.addEventListener('change', (e) => {
            themeState.appConfig.startupTheme = e.target.value;
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
                    alert('Invalid JSON: ' + error.message);
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
                        alert('Error reading file: ' + error.message);
                    }
                };
                reader.readAsText(file);
            } else {
                alert('Please paste JSON into the text field or select a file.');
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