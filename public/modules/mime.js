// modules/mime.js

/**
 * Erkennt den Typ eines Text-Snippets anhand gewichteter Heuristiken.
 * @param {string} value - Der zu prüfende Text.
 * @returns {Object} Ein Objekt mit type, icon, color und score.
 */
export function detectMimetype(value) {
    if (!value || value.trim() === '') {
        return { type: 'TXT', icon: '📄', color: '#aaaaaa', score: 0 };
    }

    const text = value;
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

    // --- 9. Mapping zu Icons und Farben ---
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