// c:\Users\druef\Documents\crudx-workbench\public\modules\tagcloud-rendering.js
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData } from './pagination.js';
import { getAccessTokens } from './utils.js';
import { detectMimetype, getMimeInfo } from './mime.js';
import { auth } from './firebase.js';
import { getTagSector, setManualTagState, getTagRules, setTagRules, getHiddenGroupRules, saveHiddenGroupRules, getFolderGroupRules, saveFolderGroupRules } from './tag-state.js';
import { generateSystemTags, SYSTEM_TAG_PREFIXES } from './system-tags.js';

/**
 * Enthält Rendering- und Datenverarbeitungslogik für die TagCloud.
 * Diese Methoden werden dem TagCloud.prototype zugewiesen.
 */
export function installRenderingMethods(TagCloud) {
    Object.assign(TagCloud.prototype, {
        async _scanAndRenderTags(force = false) {
            const isLeftDocked = this.dockState === 1; // Access dockState from TagCloud instance

            // Struktur wiederherstellen, falls sie durch vorherige Fehler gelöscht wurde
            if (!this.contentContainer.querySelector('.tag-sector')) {
                this.contentContainer.innerHTML = `
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
                `;
            }
            
            // Toggle Button Listener erneuern (da HTML ggf. neu gesetzt wurde)
            const toggleBtn = this.contentContainer.querySelector('#btn-toggle-folder-view');
            if (toggleBtn) {
                toggleBtn.textContent = this.isFolderTreeMode ? '📂' : '📝';
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.isFolderTreeMode = !this.isFolderTreeMode;
                    this._scanAndRenderTags(); // Re-Render
                };
            }
            
            const loadingTarget = this.contentContainer.querySelector('.sector-cloud .sector-content');
            if (loadingTarget) loadingTarget.innerHTML = '<div class="pill pill-sys" style="margin: 10px;">Scanning...</div>';

            const docsByTag = new Map(); // Tag -> Array of Docs
            const tagCounts = new Map();
            
            try {
                const user = auth.currentUser;
                const tokens = user ? getAccessTokens(user.email) : ['*@*'];

                // Helper to process docs
                const processDoc = (d, id) => {
                    const ac = d.access_control || [];
                    if (!ac.some(t => tokens.includes(t))) return;

                    const tags = d.user_tags;
                    if (Array.isArray(tags)) {
                        tags.forEach(tag => {
                            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                            if (!docsByTag.has(tag)) docsByTag.set(tag, []);
                            docsByTag.get(tag).push({ id: id, ...d });
                        });
                    }
                    
                    // Inject Mime Type as virtual tag
                    if (d.value) {
                        const mime = detectMimetype(d.value);
                        if (mime && mime.type && mime.type !== 'TXT') {
                            const tag = `mime:${mime.type}`;
                            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                            if (!docsByTag.has(tag)) docsByTag.set(tag, []);
                            docsByTag.get(tag).push({ id: id, ...d });
                        }
                    }

                    // NEU: Abstrakte System-Pills injizieren
                    const addSysTag = (tag, id, d) => {
                        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                        if (!docsByTag.has(tag)) docsByTag.set(tag, []);
                        docsByTag.get(tag).push({ id: id, ...d });
                    };
                    generateSystemTags(d, addSysTag, id);
                };

                if (force || !this.cachedQuerySnapshot) {
                    this.cachedQuerySnapshot = await getDocs(collection(this.db, "kv-store"));
                }
                const querySnapshot = this.cachedQuerySnapshot;
                querySnapshot.forEach(doc => {
                    processDoc(doc.data(), doc.id);
                });

                // --- CUSTOM SORTING LOGIC ---
                const systemTagOrder = {
                    'C: Last Hour': 10, 'C: Today': 11, 'C: Yesterday': 12, 'C: This Week': 12.5, 'C: This Month': 13, 'C: Last 3 Months': 14, 'C: This Year': 15, 'C: Beyond this Year': 16, 'C: Unknown': 17,
                    'R: Last Hour': 20, 'R: Today': 21, 'R: Yesterday': 22, 'R: This Week': 22.5, 'R: This Month': 23, 'R: Last 3 Months': 24, 'R: This Year': 25, 'R: Beyond this Year': 26, 'R-Σ: Top 5': 27, 'R-Σ: Mean': 28, 'R-Σ: Rarely': 29, 'R-Σ: Never': 29.5,
                    'U: Last Hour': 30, 'U: Today': 31, 'U: Yesterday': 32, 'U: This Week': 32.5, 'U: This Month': 33, 'U: Last 3 Months': 34, 'U: This Year': 35, 'U: Beyond this Year': 36, 'U-Σ: Top 5': 37, 'U-Σ: Mean': 38, 'U-Σ: Rarely': 39, 'U-Σ: Never': 39.5,
                    'Size: Huge': 2, 'Size: Large': 3, 'Size: Medium': 4, 'Size: Small': 5,
                    'X: Last Hour': 50, 'X: Today': 51, 'X: Yesterday': 52, 'X: This Week': 52.5, 'X: This Month': 53, 'X: Last 3 Months': 54, 'X: This Year': 55, 'X: Beyond this Year': 56, 'X-Σ: Top 5': 57, 'X-Σ: Mean': 58, 'X-Σ: Rarely': 59, 'X-Σ: Never': 59.5,
                    'WL-R: Many': 60, 'WL-R: Mean': 61, 'WL-R: Few': 62, 'WL-R: None': 62.5, 'WL-U: Many': 70, 'WL-U: Mean': 71, 'WL-U: Few': 72, 'WL-U: None': 72.5, 'WL-X: Many': 80, 'WL-X: Mean': 81, 'WL-X: Few': 82, 'WL-X: None': 82.5,
                };

                const getSortPriority = (tag) => {
                    if (systemTagOrder[tag]) return systemTagOrder[tag];
                    if (tag.startsWith('mime:')) return 1;
                    if (tag.startsWith('Owner:')) return 1.5;
                    if (SYSTEM_TAG_PREFIXES.some(p => tag.startsWith(p))) return 99;
                    return 0;
                };

                const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => {
                    const prioA = getSortPriority(a[0]);
                    const prioB = getSortPriority(b[0]);
                    if (prioA !== prioB) return prioA - prioB;
                    return a[0].localeCompare(b[0], 'de', { sensitivity: 'base', numeric: true });
                });
                
                const sectors = this.contentContainer.querySelectorAll('.sector-content');
                sectors.forEach(s => { s.innerHTML = ''; s.style.display = ''; });
                
                const folderContent = this.contentContainer.querySelector('.sector-folder .sector-content');
                const hiddenContent = this.contentContainer.querySelector('.sector-hidden .sector-content');
                const cloudContent = this.contentContainer.querySelector('.sector-cloud .sector-content');

                if (sortedTags.length === 0 && cloudContent) {
                    const noTags = document.createElement('div');
                    noTags.className = 'pill pill-sys'; noTags.style.margin = '10px'; noTags.textContent = 'No user tags found.';
                    if (cloudContent) cloudContent.appendChild(noTags);
                    return;
                }

                const folderItems = [];
                const hiddenItems = [];
                const hiddenGroupRules = getHiddenGroupRules();
                const folderGroupRules = getFolderGroupRules();

                let lastPrio = -1;
                
                sortedTags.forEach(([tag, count]) => {
                    let targetSector = getTagSector(tag);
                    if (tag.startsWith('mime:') || SYSTEM_TAG_PREFIXES.some(p => tag.startsWith(p))) targetSector = 'cloud';
                    
                    if (targetSector === 'folder' && folderContent) {
                        if (isLeftDocked) {
                            const docs = docsByTag.get(tag) || [];
                            docs.forEach(doc => {
                                const docItem = document.createElement('div');
                                docItem.className = 'doc-item'; docItem.textContent = doc.label || doc.id; docItem.title = doc.id;
                                docItem.onclick = () => {
                                    const searchInput = document.getElementById('main-search');
                                    if (searchInput) { searchInput.value = doc.id; fetchRealData(true); }
                                };
                                folderItems.push({ tag, count: 1, element: docItem, isDoc: true, docData: doc });
                            });
                        } else if (this.isFolderTreeMode) {
                            const item = this._createTagPill(tag, count);
                            folderItems.push({ tag, count, element: item });
                        } else {
                            const item = this._createTagPill(tag, count);
                            folderContent.appendChild(item);
                        }
                    } else if (targetSector === 'hidden' && hiddenContent) {
                        if (isLeftDocked) return;
                        const item = this._createTagPill(tag, count);
                        hiddenItems.push({ tag, count, element: item });
                    } else if (cloudContent && !isLeftDocked) {
                        const currentPrio = getSortPriority(tag);
                        const getBreakMargin = (pA, pB) => {
                            if ((pA <= 26 && pB >= 27) || (pA <= 36 && pB >= 37) || (pA <= 56 && pB >= 57)) return '1px 0';
                            if ((pA < 1 && pB >= 1) || (pA < 1.5 && pB >= 1.5) || (pA < 2 && pB >= 2) || (pA < 10 && pB >= 10) || (pA < 20 && pB >= 20) || (pA < 30 && pB >= 30) || (pA < 50 && pB >= 50) || (pA < 60 && pB >= 60)) return '3px 0';
                            return null;
                        };
                        const breakMargin = lastPrio !== -1 ? getBreakMargin(lastPrio, currentPrio) : null;
                        if (breakMargin) {
                            const br = document.createElement('div');
                            br.style.flexBasis = '100%'; br.style.height = '0'; br.style.margin = breakMargin;
                            cloudContent.appendChild(br);
                        }
                        const item = this._createTagPill(tag, count);
                        cloudContent.appendChild(item);
                        lastPrio = currentPrio;
                    }
                });

                // --- Hidden Sector Grouping ---
                if (hiddenContent && (this.dockState === 0 || this.dockState === 2 || this.dockState === 3)) {
                    const groups = {}; const looseItems = [];
                    hiddenItems.forEach(entry => {
                        let matchedRule = null;
                        for (const rule of hiddenGroupRules) { if (rule && new RegExp(rule).test(entry.tag)) { matchedRule = rule; break; } }
                        if (matchedRule) { if (!groups[matchedRule]) groups[matchedRule] = []; groups[matchedRule].push(entry); }
                        else { looseItems.push(entry); }
                    });
                    for (const [rule, items] of Object.entries(groups)) {
                        const groupPill = document.createElement('div');
                        groupPill.className = 'pill pill-sys summary-pill'; groupPill.style.cursor = 'pointer';
                        groupPill.style.border = '1px solid var(--sys-border)'; groupPill.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        groupPill.textContent = `${rule} (${items.length})`;
                        groupPill.draggable = true; groupPill.dataset.groupRule = rule; groupPill.dataset.groupType = 'hidden';
                        groupPill.id = `group-pill-hidden-${rule.replace(/[^a-zA-Z0-9]/g, '-')}`;
                        groupPill.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', e.target.id); });
                        groupPill.title = `Group: ${rule}\n` + items.map(i => `- ${i.tag}`).join('\n');
                        groupPill.onclick = (e) => {
                            e.stopPropagation();
                            const existing = document.querySelector('.tag-dropdown-menu'); if (existing) existing.remove();
                            const menu = document.createElement('div'); menu.className = 'tag-dropdown-menu';
                            items.forEach(itemObj => {
                                const tag = itemObj.tag; const item = document.createElement('div');
                                item.className = 'pill pill-user'; item.textContent = `${tag} (${itemObj.count})`; item.style.cursor = 'pointer';
                                const searchInput = document.getElementById('main-search');
                                const currentSearch = searchInput ? searchInput.value.trim() : '';
                                const activeTag = currentSearch.startsWith('tag:') ? currentSearch.substring(4) : null;
                                if (activeTag) { if (activeTag === tag) item.style.border = '1px solid #00ff00'; else item.style.opacity = '0.5'; }
                                item.onclick = (ev) => {
                                    ev.stopPropagation();
                                    if (searchInput) { searchInput.value = (searchInput.value.trim() === `tag:${tag}`) ? '' : `tag:${tag}`; fetchRealData(true); this._updateSelectionState(); }
                                    menu.remove();
                                };
                                menu.appendChild(item);
                            });
                            document.body.appendChild(menu);
                            const rect = groupPill.getBoundingClientRect(); const menuRect = menu.getBoundingClientRect();
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const topPos = (spaceBelow < menuRect.height && rect.top > menuRect.height) ? rect.top - menuRect.height - 5 : rect.bottom + 5;
                            menu.style.top = `${topPos}px`; menu.style.left = `${Math.min(rect.left, window.innerWidth - menuRect.width - 10)}px`;
                        };
                        hiddenContent.appendChild(groupPill);
                    }
                    looseItems.forEach(i => hiddenContent.appendChild(i.element));
                } else if (hiddenContent) { hiddenItems.forEach(i => hiddenContent.appendChild(i.element)); }

                // --- Folder Sector Grouping & Tree ---
                if (folderContent) {
                    folderContent.style.display = 'block';
                    const folderGroups = {}; const folderLooseItems = [];
                    if (this.dockState === 0 || this.dockState === 2 || this.dockState === 3) {
                        folderItems.forEach(entry => {
                            let matchedRule = null;
                            for (const rule of folderGroupRules) { if (rule && new RegExp(rule).test(entry.tag)) { matchedRule = rule; break; } }
                            if (matchedRule) { if (!folderGroups[matchedRule]) folderGroups[matchedRule] = []; folderGroups[matchedRule].push(entry); }
                            else { folderLooseItems.push(entry); }
                        });
                        for (const [rule, items] of Object.entries(folderGroups)) {
                            const groupPill = document.createElement('div');
                            groupPill.className = 'pill pill-user summary-pill'; groupPill.style.cursor = 'pointer';
                            groupPill.style.border = '1px solid var(--user-border)'; groupPill.style.backgroundColor = 'rgba(64, 196, 255, 0.1)';
                            groupPill.style.marginBottom = '4px'; groupPill.textContent = `📁 ${rule} (${items.length})`;
                            groupPill.draggable = true; groupPill.dataset.groupRule = rule; groupPill.dataset.groupType = 'folder';
                            groupPill.id = `group-pill-folder-${rule.replace(/[^a-zA-Z0-9]/g, '-')}`;
                            groupPill.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', e.target.id); });
                            groupPill.title = `Group: ${rule}\n` + items.map(i => `- ${i.tag}`).join('\n');
                            groupPill.onclick = (e) => {
                                e.stopPropagation();
                                const existing = document.querySelector('.tag-dropdown-menu'); if (existing) existing.remove();
                                const menu = document.createElement('div'); menu.className = 'tag-dropdown-menu';
                                items.forEach(itemObj => {
                                    const tag = itemObj.tag; const dropItem = document.createElement('div');
                                    dropItem.className = 'pill pill-user'; dropItem.textContent = `${tag} (${itemObj.count})`; dropItem.style.cursor = 'pointer';
                                    dropItem.onclick = (ev) => {
                                        ev.stopPropagation();
                                        const searchInput = document.getElementById('main-search');
                                        if (searchInput) { searchInput.value = `tag:${tag}`; fetchRealData(true); this._updateSelectionState(); }
                                        menu.remove();
                                    };
                                    menu.appendChild(dropItem);
                                });
                                document.body.appendChild(menu);
                                const rect = groupPill.getBoundingClientRect(); const menuRect = menu.getBoundingClientRect();
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const topPos = (spaceBelow < menuRect.height && rect.top > menuRect.height) ? rect.top - menuRect.height - 5 : rect.bottom + 5;
                                menu.style.top = `${topPos}px`; menu.style.left = `${Math.min(rect.left, window.innerWidth - menuRect.width - 10)}px`;
                            };
                            folderContent.appendChild(groupPill);
                        }
                    } else { folderItems.forEach(i => folderLooseItems.push(i)); }
                    
                    if (this.isFolderTreeMode && folderLooseItems.length > 0) {
                        const treeRoot = this._buildTagTree(folderLooseItems);
                        const searchInput = document.getElementById('main-search');
                        let activeDocId = null;
                        if (searchInput && searchInput.value.trim() && !searchInput.value.startsWith('tag:') && !searchInput.value.startsWith('mime:') && !searchInput.value.startsWith('owner:')) {
                            activeDocId = searchInput.value.trim();
                        }
                        if (activeDocId) {
                            setTimeout(() => {
                                const activeItem = Array.from(this.contentContainer.querySelectorAll('.doc-item')).find(el => el.title === activeDocId);
                                if (activeItem) { activeItem.classList.add('active'); activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
                            }, 50);
                        }
                        let activeTagPath = null;
                        if (activeDocId) {
                            const foundItem = folderLooseItems.find(item => item.isDoc && item.docData.id === activeDocId);
                            if (foundItem) { activeTagPath = foundItem.tag; }
                        }
                        let expandedSet = new Set();
                        try {
                            const savedState = JSON.parse(localStorage.getItem('crudx_tag_cloud_state') || '{}');
                            if (savedState.expandedFolders) { savedState.expandedFolders.forEach(p => expandedSet.add(p)); }
                        } catch (e) {}
                        this._renderTreeRecursive(treeRoot, folderContent, isLeftDocked, activeTagPath, '', expandedSet);
                    } else if (!this.isFolderTreeMode && folderLooseItems.length > 0) {
                        folderLooseItems.forEach(i => folderContent.appendChild(i.element));
                    }
                }
                this._updateSelectionState();
            } catch (error) {
                console.error("Error scanning tags:", error);
                this.contentContainer.innerHTML = `<div class="pill pill-sys" style="margin: 10px; background:red;color:white;">Error: ${error.message}</div>`;
            }
        },

        _createTagPill(tag, count) {
            const isMime = tag.startsWith('mime:');
            const displayTag = isMime ? tag.substring(5) : (tag.startsWith("Owner: ") ? tag.substring(7) : tag);
            const item = document.createElement('div');
            let tooltip = '';

            if (isMime) {
                item.className = 'pill pill-mime'; tooltip = 'Media/Message/Code Type';
            } else if (tag.includes(':')) {
                let sysClass = 'pill-sys'; let opacity = 1.0;
                const timeOpacityMap = { 'Last Hour': 0.9, 'Today': 0.8, 'Yesterday': 0.7, 'This Week': 0.65, 'This Month': 0.6, 'Last 3 Months': 0.5, 'This Year': 0.4, 'Beyond this Year': 0.3, 'Unknown': 0.3 };
                const counterOpacityMap = { 'Top 5': 1.0, 'Mean': 0.8, 'Rarely': 0.6, 'Never': 0.4 };
                const sizeOpacityMap = { 'Huge': 1.0, 'Large': 0.8, 'Medium': 0.6, 'Small': 0.4 };
                const whitelistOpacityMap = { 'Many': 1.0, 'Mean': 0.8, 'Few': 0.6, 'None': 0.4 };
                const parts = tag.split(': ');
                if (parts.length > 1) {
                    const category = parts[0]; const value = parts.slice(1).join(': ');
                    if (timeOpacityMap[value] && ['C', 'R', 'U', 'X'].includes(category)) opacity = timeOpacityMap[value];
                    else if (counterOpacityMap[value] && ['R-Σ', 'U-Σ', 'X-Σ'].includes(category)) opacity = counterOpacityMap[value];
                    else if (sizeOpacityMap[value] && category === 'Size') opacity = sizeOpacityMap[value];
                    else if (whitelistOpacityMap[value] && category.startsWith('WL-')) opacity = whitelistOpacityMap[value];
                }
                if (tag.startsWith('C:')) { sysClass = 'pill-sys-create'; tooltip = 'Creation Timestamp'; }
                else if (tag.startsWith('R:')) { sysClass = 'pill-sys-read'; tooltip = 'Last Read Timestamp'; }
                else if (tag.startsWith('R-Σ:')) { sysClass = 'pill-sys-read'; item.style.filter = 'brightness(0.6)'; tooltip = 'Read Counter'; }
                else if (tag.startsWith('U:')) { sysClass = 'pill-sys-update'; tooltip = 'Last Update Timestamp'; }
                else if (tag.startsWith('U-Σ:')) { sysClass = 'pill-sys-update'; item.style.filter = 'brightness(0.7) saturate(1.2)'; tooltip = 'Update Counter'; }
                else if (tag.startsWith('Size:')) { sysClass = 'pill-sys-size'; tooltip = 'Document Size'; }
                else if (tag.startsWith('X:')) { sysClass = 'pill-sys-execute'; tooltip = 'Last Execution Timestamp'; }
                else if (tag.startsWith('X-Σ:')) { sysClass = 'pill-sys-execute'; item.style.setProperty('background-color', '#ffd700', 'important'); item.style.setProperty('color', '#000000', 'important'); item.style.setProperty('border-color', '#b29400', 'important'); tooltip = 'Execution Counter'; } 
                else if (tag.startsWith('WL-')) {
                    sysClass = 'pill-sys'; item.style.setProperty('background-color', '#ffffff', 'important'); item.style.setProperty('color', '#000000', 'important'); item.style.setProperty('border-color', '#cccccc', 'important');
                    if (tag.startsWith('WL-R:')) { tooltip = 'Whitelist Count: READ'; item.style.setProperty('border-color', '#388e3c', 'important'); }
                    else if (tag.startsWith('WL-U:')) { tooltip = 'Whitelist Count: UPDATE'; item.style.setProperty('border-color', '#f57c00', 'important'); }
                    else if (tag.startsWith('WL-X:')) { tooltip = 'Whitelist Count: EXECUTE'; item.style.setProperty('border-color', '#333333', 'important'); }
                } else if (tag.startsWith('Owner:')) { sysClass = 'pill-sys-owner'; tooltip = 'Owner'; }
                else { tooltip = 'System Tag'; }
                if (SYSTEM_TAG_PREFIXES.some(p => tag.startsWith(p))) { item.className = `pill ${sysClass}`; item.style.opacity = opacity; }
                else { item.className = 'pill pill-sys'; }
            } else { item.className = 'pill pill-user'; tooltip = 'User Tag'; }
            item.textContent = `${displayTag} (${count})`; item.title = tooltip; item.style.cursor = 'pointer';
            item.id = `tag-pill-${tag.replace(/[^a-zA-Z0-9]/g, '-')}`; item.dataset.tagName = tag;
            item.draggable = true; item.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', e.target.id));
            
            if (isMime) { const info = getMimeInfo(displayTag); item.style.backgroundColor = info.color; item.style.color = ['TXT','BASE64','JSON','JS','SVG'].includes(displayTag) ? '#000' : '#fff'; }

            item.addEventListener('click', (e) => {
                // Rufe die neue Methode auf, die das Hinzufügen/Entfernen des Tags übernimmt
                this._toggleTagInSearch(tag);
                e.stopPropagation(); // Verhindert, dass der Klick auf übergeordnete Elemente durchgeht
                this._updateSelectionState(); // Aktualisiert den visuellen Auswahlzustand der Tags
            });
            return item;
        },

        _buildTagTree(items) {
            const root = {};
            items.forEach(({ tag, count, element, isDoc, docData }) => {
                const parts = tag.split('>');
                let current = root;
                parts.forEach((part, index) => {
                    if (!current[part]) { current[part] = { _children: {}, _items: [] }; }
                    if (index === parts.length - 1) {
                        if (isDoc) { current[part]._items.push({ element, isDoc: true, docData }); }
                        else { current[part]._items.push({ element, isDoc: false }); }
                    }
                    current = current[part]._children;
                });
            });
            return root;
        },

        _renderTreeRecursive(node, container, isDocked = false, activeTagPath = null, currentPathPrefix = '', expandedSet = null) {
            const keys = Object.keys(node).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true }));
            for (const key of keys) {
                const entry = node[key];
                const hasChildren = Object.keys(entry._children).length > 0;
                const hasItems = entry._items.length > 0;
                const fullPath = currentPathPrefix ? `${currentPathPrefix}>${key}` : key;
                if (hasChildren || hasItems) {
                    let shouldExpand = false;
                    if (isDocked && activeTagPath) {
                        if (activeTagPath === fullPath || activeTagPath.startsWith(fullPath + '>')) { shouldExpand = true; }
                    }
                    const details = document.createElement('details');
                    details.open = shouldExpand; details.dataset.fullPath = fullPath;
                    details.style.marginLeft = '10px'; details.style.marginBottom = '2px';
                    details.addEventListener('toggle', (e) => {});
                    const summary = document.createElement('summary');
                    summary.textContent = key; summary.style.cursor = 'pointer'; summary.style.fontSize = '0.8em';
                    summary.style.opacity = '0.8'; summary.style.userSelect = 'none'; summary.style.color = 'var(--user-text)';
                    details.appendChild(summary);
                    entry._items.forEach(itemObj => {
                        const wrapper = document.createElement('div');
                        if (itemObj.isDoc) { wrapper.style.marginLeft = '10px'; }
                        else { wrapper.style.marginLeft = '15px'; wrapper.style.marginTop = '2px'; }
                        wrapper.appendChild(itemObj.element); details.appendChild(wrapper);
                    });
                    this._renderTreeRecursive(entry._children, details, isDocked, activeTagPath, fullPath, expandedSet);
                    container.appendChild(details);
                }
            }
        },

        _updateSelectionState() {
            const searchInput = document.getElementById('main-search');
            const searchTerm = searchInput ? searchInput.value.trim() : '';
            
            let activeTags = [];
            if (searchTerm.startsWith('tag:')) {
                activeTags = searchTerm.substring(4).split(/\s*\|\|\s*|\s*\&\&\s*|[\s()!]/i).map(t => t.trim()).filter(t => t && t.length > 0);
            } else if (searchTerm.startsWith('mime:')) {
                activeTags = [searchTerm.substring(5)];
            }

            const clearBtn = document.getElementById('btn-clear-tag-filter');
            if (clearBtn) {
                clearBtn.style.display = activeTags.length > 0 ? 'inline' : 'none';
                clearBtn.style.color = activeTags.length > 0 ? '#ff5252' : '';
            }

            const pills = this.contentContainer.querySelectorAll('.pill-user, .pill-mime');
            pills.forEach(pill => {
                const tag = pill.dataset.tagName;
                if (activeTags.length > 0) {
                    if (activeTags.includes(tag)) pill.classList.remove('pill-inactive');
                    else pill.classList.add('pill-inactive');
                } else {
                    pill.classList.remove('pill-inactive');
                }
            });
        },

        _updateMiniTermVisibility() {
            const mini = document.getElementById('mini-term-editor');
            if (!mini) return;
            mini.style.display = this.container.classList.contains('active') ? 'flex' : 'none';
        },
        
        _updateMiniTermEditorUI() { // Letzte Methode, kein Komma danach
            const toggleMode = document.getElementById('toggle-expression-mode');
            const toggleOp = document.getElementById('toggle-operator');
            const opRow = document.getElementById('operator-toggle-row');

            if (toggleMode) {
                toggleMode.checked = this.expressionMode;
                // Update text content and colors dynamically
                const slider = toggleMode.nextElementSibling;
                if (slider && slider.classList.contains('slider')) {
                    slider.textContent = toggleMode.checked ? 'ON' : 'OFF';
                    slider.style.backgroundColor = toggleMode.checked ? '#4caf50' : '#f44336';
                }
            }
            
            // Show/hide operator row (includes toggle and !, () info)
            if (opRow) opRow.style.display = this.expressionMode ? 'table-row' : 'none';
            
            if (toggleOp) {
                toggleOp.checked = (this.activeOp === 'AND');
                // Update text content and colors dynamically
                const slider = toggleOp.nextElementSibling;
                if (slider && slider.classList.contains('slider')) {
                    slider.textContent = toggleOp.checked ? '&&' : '||';
                    slider.style.backgroundColor = toggleOp.checked ? '#2196f3' : '#ff9800';
                }
            }
        }
    }); // Ende von Object.assign
} // Ende von installRenderingMethods
