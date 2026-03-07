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
    // 1. Manuelle Zuweisung hat Vorrang
    const savedState = JSON.parse(localStorage.getItem('crudx_tag_state') || '{}');
    if (savedState[tag]) return savedState[tag];

    // 2. Regex Regeln prüfen
    try {
        // Hidden Rules
        if (tagRules.hidden && tagRules.hidden.some(r => r && new RegExp(r).test(tag))) return 'hidden';
        
        // Hidden Grouping Rules (Implicit Sector Assignment)
        const hiddenGroupRules = JSON.parse(localStorage.getItem('crudx_hidden_group_rules') || '[]');
        if (hiddenGroupRules.some(r => r && new RegExp(r).test(tag))) return 'hidden';

        // Folder Rules
        if (tagRules.folder && tagRules.folder.some(r => r && new RegExp(r).test(tag))) return 'folder';

        // Folder Grouping Rules (Implicit Sector Assignment)
        const folderGroupRules = JSON.parse(localStorage.getItem('crudx_folder_group_rules') || '[]');
        if (folderGroupRules.some(r => r && new RegExp(r).test(tag))) return 'folder';
    } catch (e) {
        console.warn("Invalid Regex in Tag Rules", e);
    }
    
    // 3. Standard: Cloud
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