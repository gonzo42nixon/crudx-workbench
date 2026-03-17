import { getTagRules, setTagRules, getHiddenGroupRules, saveHiddenGroupRules, getFolderGroupRules, saveFolderGroupRules } from './tag-state.js';
import { fetchRealData } from './pagination.js';
import { refreshTagCloud } from './tagscanner.js';

export function initRulesManager() {
    // 1. Open Modal Listener
    document.addEventListener('open-tag-rules', () => {
        const modal = document.getElementById('tag-rules-modal');
        if (modal) {
            modal.classList.add('active');
            renderAllRules();
        }
    });

    // 2. Add Rule Buttons (Sector Assignment)
    document.getElementById('btn-add-folder-rule')?.addEventListener('click', () => {
        const rules = getTagRules();
        if (!rules.folder) rules.folder = [];
        rules.folder.push("");
        renderAllRules();
    });

    document.getElementById('btn-add-hidden-rule')?.addEventListener('click', () => {
        const rules = getTagRules();
        if (!rules.hidden) rules.hidden = [];
        rules.hidden.push("");
        renderAllRules();
    });

    // 3. Add Grouping Buttons (Regex Groups)
    document.getElementById('btn-add-hidden-group-rule')?.addEventListener('click', () => {
        const rules = getHiddenGroupRules();
        rules.push('');
        saveHiddenGroupRules(rules);
        renderAllRules();
    });

    document.getElementById('btn-add-folder-group-rule')?.addEventListener('click', () => {
        const rules = getFolderGroupRules();
        rules.push('');
        saveFolderGroupRules(rules);
        renderAllRules();
    });

    // 4. Save Rules logic
    document.getElementById('btn-save-rules')?.addEventListener('click', () => {
        const getSectorValues = (listId) => {
            const inputs = document.querySelectorAll(`#${listId} input`);
            return Array.from(inputs).map(i => i.value.trim()).filter(v => v !== "");
        };
        
        const newRules = {
            folder: getSectorValues('folder-rules-list'),
            hidden: getSectorValues('hidden-rules-list')
        };

        // Manuelle Tag-States löschen, die den neuen Hidden-Rules widersprechen.
        // Ohne diesen Schritt würden manuell nach "cloud" verschobene Tags dauerhaft
        // gegen die neu gespeicherten Hide-Rules immun bleiben.
        try {
            const tagState = JSON.parse(localStorage.getItem('crudx_tag_state') || '{}');
            let stateChanged = false;
            for (const [tag, sector] of Object.entries(tagState)) {
                if (sector !== 'hidden' && newRules.hidden.some(r => {
                    try { return r && new RegExp(r).test(tag); } catch { return false; }
                })) {
                    delete tagState[tag];
                    stateChanged = true;
                }
            }
            if (stateChanged) localStorage.setItem('crudx_tag_state', JSON.stringify(tagState));
        } catch (e) {
            console.warn('Could not clean up tag state on rule save:', e);
        }

        setTagRules(newRules);
        
        document.getElementById('tag-rules-modal').classList.remove('active');
        fetchRealData(); 
        refreshTagCloud(true); 
    });
}

export function renderAllRules() {
    const rules = getTagRules();
    
    const renderSectorList = (listId, items) => {
        const container = document.getElementById(listId);
        if (!container) return;
        container.innerHTML = '';
        items.forEach((rule, idx) => {
            const row = document.createElement('div');
            row.style.display = 'flex'; row.style.gap = '10px'; row.style.marginBottom = '5px';
            row.innerHTML = `<input type="text" value="${rule}" style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid #444; color: #eee; padding: 4px; font-family: monospace;">
                             <button style="background: #442222; border: 1px solid #663333; color: #ffaaaa; cursor: pointer; padding: 0 8px;">✕</button>`;
            row.querySelector('input').oninput = (e) => { items[idx] = e.target.value; };
            row.querySelector('button').onclick = () => { items.splice(idx, 1); renderAllRules(); };
            container.appendChild(row);
        });
    };

    const renderGroupList = (listId, getRulesFn, saveRulesFn) => {
        const container = document.getElementById(listId);
        if (!container) return;
        container.innerHTML = '';
        const groupRules = getRulesFn();
        groupRules.forEach((rule, index) => {
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
            div.innerHTML = `<input type="text" value="${rule}" style="flex: 1; background: #222; border: 1px solid #444; color: #ccc; padding: 4px;">
                             <button style="background: #500; color: #fff; border: none; cursor: pointer; padding: 0 8px;">×</button>`;
            div.querySelector('button').onclick = () => { groupRules.splice(index, 1); saveRulesFn(groupRules); renderAllRules(); };
            div.querySelector('input').onchange = (e) => { groupRules[index] = e.target.value; saveRulesFn(groupRules); };
            container.appendChild(div);
        });
    };

    renderSectorList('folder-rules-list', rules.folder || []);
    renderSectorList('hidden-rules-list', rules.hidden || []);
    renderGroupList('hidden-group-rules-list', getHiddenGroupRules, saveHiddenGroupRules);
    renderGroupList('folder-group-rules-list', getFolderGroupRules, saveFolderGroupRules);
}