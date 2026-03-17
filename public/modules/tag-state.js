// modules/tag-state.js

// Standard-Regeln: Folder bei ">", Hidden bei ":"
const defaultRules = {
    folder: [">"],
    hidden: [":"]
};

export let tagRules = JSON.parse(localStorage.getItem('crudx_tag_rules') || JSON.stringify(defaultRules));

export function getTagRules() { return tagRules; }

export function setTagRules(newRules) {
    tagRules = newRules;
    localStorage.setItem('crudx_tag_rules', JSON.stringify(tagRules));
}

export function getTagSector(tag) {
    // 1. Hide-Rules haben höchste Priorität — der Nutzer hat explizit konfiguriert,
    //    welche Tags ausgeblendet werden sollen. Eine manuelle Verschiebung in "cloud"
    //    darf dies nicht dauerhaft unterbinden.
    try {
        if (tagRules.hidden && tagRules.hidden.some(r => r && new RegExp(r).test(tag))) return 'hidden';

        const hiddenGroupRules = JSON.parse(localStorage.getItem('crudx_hidden_group_rules') || '[]');
        if (hiddenGroupRules.some(r => r && new RegExp(r).test(tag))) return 'hidden';
    } catch (e) {
        console.warn("Invalid Regex in Hide Rules", e);
    }

    // 2. Manuelle Zuweisung (Drag & Drop) — gilt nur für Folder ↔ Cloud, nicht gegen Hide-Rules
    const savedState = JSON.parse(localStorage.getItem('crudx_tag_state') || '{}');
    if (savedState[tag]) return savedState[tag];

    // 3. Folder-Rules und Grouping
    try {
        if (tagRules.folder && tagRules.folder.some(r => r && new RegExp(r).test(tag))) return 'folder';

        const folderGroupRules = JSON.parse(localStorage.getItem('crudx_folder_group_rules') || '[]');
        if (folderGroupRules.some(r => r && new RegExp(r).test(tag))) return 'folder';
    } catch (e) {
        console.warn("Invalid Regex in Folder Rules", e);
    }

    // 4. Standard: Cloud
    return 'cloud';
}

export function setManualTagState(tag, sector) {
    const savedState = JSON.parse(localStorage.getItem('crudx_tag_state') || '{}');
    savedState[tag] = sector;
    localStorage.setItem('crudx_tag_state', JSON.stringify(savedState));
}

export function loadTagConfigFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const configStr = params.get('tagConfig');
    if (configStr) {
        try {
            const config = JSON.parse(atob(configStr));
            if (config.rules) setTagRules(config.rules);
            if (config.state) localStorage.setItem('crudx_tag_state', JSON.stringify(config.state));
            console.log("✅ Tag Configuration loaded from URL");
        } catch (e) {
            console.error("Failed to load tag config from URL", e);
        }
    }
}

export function getTagConfigForUrl() {
    const state = JSON.parse(localStorage.getItem('crudx_tag_state') || '{}');
    const config = {
        rules: tagRules,
        state: state
    };
    return btoa(JSON.stringify(config));
}

// ---------- Grouping Rules Persistence ----------

export function getHiddenGroupRules() {
    try {
        return JSON.parse(localStorage.getItem('crudx_hidden_group_rules') || '[]');
    } catch { return []; }
}

export function saveHiddenGroupRules(rules) {
    localStorage.setItem('crudx_hidden_group_rules', JSON.stringify(rules));
}

export function getFolderGroupRules() {
    try {
        return JSON.parse(localStorage.getItem('crudx_folder_group_rules') || '["Created>", "Last Read>", "Last Updated>", "Last Executed>"]');
    } catch { return []; }
}

export function saveFolderGroupRules(rules) {
    localStorage.setItem('crudx_folder_group_rules', JSON.stringify(rules));
}