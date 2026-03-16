import { fetchRealData } from './pagination.js';
import { getTagRules, setTagRules, getHiddenGroupRules, saveHiddenGroupRules, getFolderGroupRules, saveFolderGroupRules } from './tag-state.js';

/**
 * Enthält DOM-Erstellung, Element-Referenzen und Event-Binding für die TagCloud.
 * Diese Methoden werden dem TagCloud.prototype zugewiesen.
 */
export function installDomMethods(TagCloud) {
    Object.assign(TagCloud.prototype, {
        _createDOM() {
            // Erzwinge Neu-Initialisierung: Altes Element entfernen, falls vorhanden
            const existing = document.getElementById('tag-cloud-container');
            if (existing) {
                existing.remove();
            }

            // Remove existing mini-term-editor if present, to prevent duplicates
            const existingMiniTermEditor = document.getElementById('mini-term-editor');
            if (existingMiniTermEditor) {
                existingMiniTermEditor.remove();
            }

            const cloudHTML = `
                <div id="tag-cloud-container" class="floating-modal">
                    <div class="modal-header">
                        <h3>☁️ Tag Cloud</h3>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span id="btn-clear-tag-filter" title="Unselect / Clear Filter" style="cursor: pointer; font-size: 1.1em; opacity: 0.7; display: none;">🚫</span>
                            <span id="btn-open-tag-rules" title="Configure Tag Rules (Regex)" style="cursor: pointer; font-size: 1.1em; opacity: 0.7;">📏</span>
                            <span id="btn-dock-cloud" title="Cycle Dock Position" style="cursor: pointer; font-size: 1.1em; opacity: 0.7;">⚓</span>
                            <span id="btn-toggle-cloud-transparency" title="Toggle Transparency (3 Levels)" style="cursor: pointer; font-size: 1.1em; opacity: 0.7;">👁️</span>
                            <span id="btn-refresh-tags" title="Refresh Tags" style="cursor: pointer; font-size: 1.1em; opacity: 0.7;">🔄</span>
                            <span id="btn-close-tag-cloud" class="close-x" title="Close">✕</span>
                        </div>
                    </div>
                    <div id="tag-cloud-content" class="modal-body">
                        <div class="tag-sector sector-folder" data-sector="folder">
                            <div class="sector-header" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Folder</span>
                                <span id="btn-toggle-folder-view" title="Toggle List/Tree View" style="cursor:pointer; font-size:1.2em;">📂</span>
                            </div>
                            <div class="sector-content"></div>
                        </div>
                        <div class="tag-sector sector-hidden" data-sector="hidden">
                            <div class="sector-header">Hidden</div>
                            <div class="sector-content"></div>
                        </div>
                        <div class="tag-sector sector-cloud" data-sector="cloud">
                            <div class="sector-header">Cloud</div>
                            <div class="sector-content"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', cloudHTML);

            const miniTermEditorHTML = `
                <div id="mini-term-editor" class="mini-term-editor" title="Expression Editor">
                    <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%;">
                        <span id="mini-term-handle" class="mini-term-handle" style="margin-top: 4px;">⠿</span>
                        <table style="border-collapse: collapse; border-spacing: 0;">
                            <tr>
                                <td style="padding: 0 8px 4px 0; text-align: left; vertical-align: middle;">Expression</td>
                                <td style="padding: 0 0 4px 0; text-align: left; vertical-align: middle;">
                                    <label class="toggle-switch" title="Expression Mode: {on|off}">
                                        <input type="checkbox" id="toggle-expression-mode" data-on-text="on" data-off-text="off">
                                        <span class="slider round"></span>
                                    </label>
                                </td>
                                <td style="padding: 0 0 4px 8px; text-align: left; vertical-align: middle;">
                                    <span id="btn-mini-trans" title="Toggle Transparency" style="cursor: pointer; font-size: 1.1em; opacity: 0.7;">👁️</span>
                                </td>
                            </tr>
                            <tr id="operator-toggle-row" style="display: none;">
                                <td style="padding: 0 8px 0 0; text-align: left; vertical-align: middle;">Operator</td>
                                <td style="padding: 0; text-align: left; vertical-align: middle;">
                                    <label class="toggle-switch" title="Operator = {OR|AND} - OR: || AND: &&">
                                        <input type="checkbox" id="toggle-operator" data-and-text="&&" data-or-text="||">
                                        <span class="slider round"></span>
                                    </label>
                                </td>
                                <td id="more-info-cell" style="padding: 0 0 0 8px; text-align: left; vertical-align: middle; opacity: 0.7; font-size: 0.8em;" title="Use '!' for NOT, '()' for grouping. Example: tag:!red || (blue && green)">!, ()</td>
                            </tr>
                        </table>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', miniTermEditorHTML);
        },

        _getElements() {
            this.container = document.getElementById('tag-cloud-container');
            this.contentContainer = document.getElementById('tag-cloud-content');
            this.header = this.container.querySelector('.modal-header');
            this.closeBtn = document.getElementById('btn-close-tag-cloud');
            this.refreshBtn = document.getElementById('btn-refresh-tags');
            this.transBtn = document.getElementById('btn-toggle-cloud-transparency');
            this.clearFilterBtn = document.getElementById('btn-clear-tag-filter');
            this.rulesBtn = document.getElementById('btn-open-tag-rules');
            this.dockBtn = document.getElementById('btn-dock-cloud');
            this.folderSector = this.container.querySelector('.sector-folder');
            this.hiddenSector = this.container.querySelector('.sector-hidden');
            this.cloudSector = this.container.querySelector('.sector-cloud');

            // Mini Term Editor elements
            this.miniTermEditor = document.getElementById('mini-term-editor');
            this.toggleExpressionMode = document.getElementById('toggle-expression-mode');
            this.operatorToggleContainer = document.getElementById('operator-toggle-container');
            this.toggleOperator = document.getElementById('toggle-operator');
            this.btnMiniTrans = document.getElementById('btn-mini-trans');
            this.miniTermHandle = document.getElementById('mini-term-handle');
        },

        _bindEvents() {
            this._setupFloatingDrag(); // For the main Tag Cloud
            this._setupCustomResize(); // For the main Tag Cloud

            // Mini Term Editor Events
            if (this.toggleExpressionMode) {
                this.toggleExpressionMode.addEventListener('change', () => {
                    this.expressionMode = this.toggleExpressionMode.checked;
                    this._updateMiniTermEditorUI();
                    // If leaving expression mode, clean up search bar if it contains operators
                    if (!this.expressionMode) {
                        const searchInput = document.getElementById('main-search');
                        if (searchInput && searchInput.value.startsWith('tag:')) {
                            let val = searchInput.value.substring(4);
                            val = val.replace(/\|\|\s*|\&\&\s*/g, '').trim();
                            searchInput.value = val ? `tag:${val}` : '';
                            fetchRealData(true);
                            this._updateSelectionState();
                        }
                    }
                });
            }

            if (this.toggleOperator) {
                this.toggleOperator.addEventListener('change', () => {
                    this.activeOp = this.toggleOperator.checked ? 'AND' : 'OR';
                    this._updateMiniTermEditorUI();
                });
            }

            if (this.btnMiniTrans && this.miniTermEditor) {
                this.btnMiniTrans.addEventListener('click', () => {
                    this.miniTransLevel = (this.miniTransLevel + 1) % 3;
                    this.miniTermEditor.classList.remove('mini-trans-90', 'mini-trans-50');
                    if (this.miniTransLevel === 1) this.miniTermEditor.classList.add('mini-trans-90');
                    if (this.miniTransLevel === 2) this.miniTermEditor.classList.add('mini-trans-50');
                });
            }

            // Mini Term Editor Dragging
            if (this.miniTermHandle && this.miniTermEditor) {
                let isDraggingMini = false;
                let startX, startY, initialX, initialY;

                this.miniTermHandle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    isDraggingMini = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    const rect = this.miniTermEditor.getBoundingClientRect();
                    initialX = rect.left;
                    initialY = rect.top;
                    this.miniTermEditor.style.transform = 'none'; // Remove translate for direct top/left manipulation
                    document.body.style.userSelect = 'none';
                    document.addEventListener('mousemove', onMoveMini);
                    document.addEventListener('mouseup', onEndMini);
                });

                const onMoveMini = (e) => {
                    if (!isDraggingMini) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    this.miniTermEditor.style.left = (initialX + dx) + 'px';
                    this.miniTermEditor.style.top = (initialY + dy) + 'px';
                };

                const onEndMini = () => {
                    isDraggingMini = false;
                    document.body.style.userSelect = '';
                    document.removeEventListener('mousemove', onMoveMini);
                    document.removeEventListener('mouseup', onEndMini);
                };
            }

            // Context Menu for Sector Visibility (remains in main Tag Cloud header)
            this.header.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const existingMenu = document.querySelector('.tag-cloud-context-menu');
                if (existingMenu) existingMenu.remove();

                const menu = document.createElement('div');
                menu.className = 'tag-cloud-context-menu';
                menu.style.cssText = `
                    position: fixed; top: ${e.clientY}px; left: ${e.clientX}px;
                    background: var(--editor-bg); border: 1px solid var(--editor-border); border-radius: 6px;
                    padding: 5px; z-index: 3000; box-shadow: 0 5px 15px rgba(0,0,0,0.5);
                    display: flex; flex-direction: column; gap: 4px;
                `;

                ['Folder', 'Hidden', 'Cloud'].forEach(name => {
                    const sectorEl = this.container.querySelector(`.sector-${name.toLowerCase()}`);
                    if (!sectorEl) return;
                    const isVisible = window.getComputedStyle(sectorEl).display !== 'none';
                    const item = document.createElement('div');
                    item.innerHTML = `<span style="display: inline-block; width: 20px;">${isVisible ? '✅' : '⬜'}</span> Toggle ${name}`;
                    item.style.cssText = `padding: 6px 12px; cursor: pointer; border-radius: 4px; font-size: 0.9em; user-select: none; display: flex; align-items: center;`;
                    item.onmouseover = () => item.style.backgroundColor = 'rgba(255,255,255,0.1)';
                    item.onmouseout = () => item.style.backgroundColor = 'transparent';
                    item.onclick = () => { sectorEl.style.display = isVisible ? 'none' : 'flex'; menu.remove(); };
                    menu.appendChild(item);
                });
                document.body.appendChild(menu);
                const closeMenu = (event) => { if (!menu.contains(event.target)) { menu.remove(); window.removeEventListener('click', closeMenu, { capture: true }); } };
                window.addEventListener('click', closeMenu, { capture: true });
            });

            this.closeBtn.addEventListener('click', () => {
                if (this.dockState === 1) document.body.classList.remove('ftc-docked');
                this.container.classList.remove('active');
                this.dockState = 0; // Set dockState to floating/closed
                this._updateMiniTermVisibility(); // Hide mini-modal
            });
            this.refreshBtn.addEventListener('click', () => this.refresh(true));
            this.rulesBtn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('open-tag-rules')));

            this.dockBtn.addEventListener('click', () => {
                if (this.dockState === 0) { this.dockBottomRight(); return; }
                if (this.dockState === 3) { this.dockCenter(); this.dockCycleDirection = 'forward'; }
                else if (this.dockState === 1) { this.dockCenter(); this.dockCycleDirection = 'backward'; }
                else {
                    if (this.dockCycleDirection === 'forward') this.dockLeft();
                    else this.dockBottomRight();
                }
            });

            this.clearFilterBtn.addEventListener('click', () => {
                const searchInput = document.getElementById('main-search');
                if (searchInput) { searchInput.value = ''; fetchRealData(true); this._updateSelectionState(); }
            });

            let currentLevel = 0;
            this.transBtn.addEventListener('click', () => {
                currentLevel = (currentLevel + 1) % 4;
                this.container.classList.remove('cloud-level-0', 'cloud-level-1', 'cloud-level-2', 'cloud-level-3');
                if (currentLevel > 0) this.container.classList.add(`cloud-level-${currentLevel}`);
            });

            // Drag & Drop für Sektoren
            const sectors = this.container.querySelectorAll('.tag-sector');
            sectors.forEach(sector => {
                sector.addEventListener('dragover', e => { e.preventDefault(); sector.classList.add('drag-over'); });
                sector.addEventListener('dragleave', () => sector.classList.remove('drag-over'));
                sector.addEventListener('drop', e => {
                    e.preventDefault();
                    sector.classList.remove('drag-over');
                    const id = e.dataTransfer.getData('text/plain');
                    const draggableElement = document.getElementById(id);
                    
                    if (draggableElement && draggableElement.dataset.groupRule) {
                        const rule = draggableElement.dataset.groupRule;
                        const sourceSector = draggableElement.dataset.groupType;
                        const targetSector = sector.dataset.sector;
                        if (sourceSector === targetSector) return;
                        let changed = false;
                        const updateSectorRules = (targetSec) => {
                            const rules = getTagRules();
                            if (!rules[targetSec]) rules[targetSec] = [];
                            if (!rules[targetSec].includes(rule)) rules[targetSec].push(rule);
                            const sourceSec = (targetSec === 'folder') ? 'hidden' : 'folder';
                            if (rules[sourceSec]) {
                                const idx = rules[sourceSec].indexOf(rule);
                                if (rules[sourceSec].includes(rule)) { rules[sourceSec].splice(idx, 1); }
                            }
                            setTagRules(rules);
                        };
                        const moveRule = (rule, getSource, saveSource, getTarget, saveTarget) => {
                            const sourceList = getSource();
                            const targetList = getTarget();
                            const idx = sourceList.indexOf(rule);
                            if (idx > -1) {
                                sourceList.splice(idx, 1); saveSource(sourceList);
                                if (!targetList.includes(rule)) { targetList.push(rule); saveTarget(targetList); }
                                return true;
                            }
                            return false;
                        };
                        if (sourceSector === 'folder' && targetSector === 'hidden') {
                            if (moveRule(rule, getFolderGroupRules, saveFolderGroupRules, getHiddenGroupRules, saveHiddenGroupRules)) { updateSectorRules('hidden'); changed = true; }
                        } else if (sourceSector === 'hidden' && targetSector === 'folder') {
                            if (moveRule(rule, getHiddenGroupRules, saveHiddenGroupRules, getFolderGroupRules, saveFolderGroupRules)) { updateSectorRules('folder'); changed = true; }
                        }
                        if (changed && window.currentDbInstance) this.refresh(true); // Use this.refresh
                        return;
                    }
                    const dropzone = sector.querySelector('.sector-content');
                    if (draggableElement && dropzone) {
                        dropzone.appendChild(draggableElement);
                        const tagName = draggableElement.dataset.tagName;
                        const sectorType = sector.dataset.sector;
                        if (tagName && sectorType) { setManualTagState(tagName, sectorType); }
                    }
                });
            });
        }
    });
}
