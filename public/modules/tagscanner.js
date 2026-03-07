import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData, getAccessTokens, applyLayout } from './pagination.js';
import { auth } from './firebase.js';
import { getTagSector, setManualTagState } from './tag-state.js';

let isDraggable = false;
let offsetX, offsetY;
let isFolderTreeMode = true; // Default: Tree View
const snapThreshold = 20;

// State für Docking
let preDockState = {
    width: '320px',
    height: '',
    top: '100px',
    left: '20px'
};

function updateHandleVisibility(container) {
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const windowCenter = window.innerWidth / 2;
    const modalCenter = rect.left + (rect.width / 2);
    
    const leftHandle = container.querySelector('.resize-handle-left');
    const rightHandle = container.querySelector('.resize-handle-right');
    
    if (modalCenter > windowCenter) {
        // Modal is on the right side -> Show left handle
        if (leftHandle) leftHandle.style.display = 'block';
        if (rightHandle) rightHandle.style.display = 'none';
    } else {
        // Modal is on the left side -> Show right handle
        if (leftHandle) leftHandle.style.display = 'none';
        if (rightHandle) rightHandle.style.display = 'block';
    }
}

function updateSectorVisibility(container) {
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    
    // Berechne Position relativ zum möglichen Verschiebebereich (0 = Linksanschlag, 1 = Rechtsanschlag)
    const maxLeft = windowWidth - rect.width;
    let ratio = 0.5;
    if (maxLeft > 0) ratio = rect.left / maxLeft;
    ratio = Math.max(0, Math.min(1, ratio)); // Clamp 0-1

    const folder = container.querySelector('.sector-folder');
    const hidden = container.querySelector('.sector-hidden');
    const cloud = container.querySelector('.sector-cloud');

    const setDisplay = (el, show) => {
        if (el) el.style.display = show ? 'flex' : 'none';
    };

    // 1. Links (0-15%): Nur Folder
    if (ratio < 0.15) {
        setDisplay(folder, true);
        setDisplay(hidden, false);
        setDisplay(cloud, false);
    }
    // 2. Links-Mitte (15-40%): Folder + Hidden
    else if (ratio < 0.40) {
        setDisplay(folder, true);
        setDisplay(hidden, true);
        setDisplay(cloud, false);
    }
    // 3. Mitte (40-60%): Alle
    else if (ratio < 0.60) {
        setDisplay(folder, true);
        setDisplay(hidden, true);
        setDisplay(cloud, true);
    }
    // 4. Mitte-Rechts (60-85%): Hidden + Cloud
    else if (ratio < 0.85) {
        setDisplay(folder, false);
        setDisplay(hidden, true);
        setDisplay(cloud, true);
    }
    // 5. Rechts (85-100%): Nur Cloud
    else {
        setDisplay(folder, false);
        setDisplay(hidden, false);
        setDisplay(cloud, true);
    }
}

function dockTagCloud(container) {
    if (container.classList.contains('docked')) return;

    // Save state before docking
    preDockState.width = container.style.width;
    preDockState.height = container.style.height;
    preDockState.top = container.style.top;
    // If top is auto (initial state), calculate it
    if (!container.style.top || container.style.top === 'auto') {
        preDockState.top = container.getBoundingClientRect().top + 'px';
    }
    preDockState.left = container.style.left;
    
    // Fix current dimensions for smooth transition
    const rect = container.getBoundingClientRect();
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;

    container.classList.add('docked');
    document.body.classList.add('ftc-docked');
    
    // Capture current selection (First Doc in Grid)
    const firstCardKey = document.querySelector('#data-container .card-kv .pill-key');
    let selectedDocId = null;
    if (firstCardKey) {
        selectedDocId = firstCardKey.textContent.trim();
    }

    // Animation Sequence: Wait for dock transition, then transform content & layout
    setTimeout(async () => {
        const db = window.currentDbInstance;
        if (db) {
            // Set search to specific doc ID if found, so tree expands correctly
            const searchInput = document.getElementById('main-search');
            if (selectedDocId && searchInput) {
                searchInput.value = selectedDocId;
                // Note: fetchRealData will be triggered by applyLayout or refreshTagCloud logic
            }

            // 1. Refresh Cloud first (Transforms Pills to Doc List & Expands Tree to selected Doc)
            await refreshTagCloud(db);
            
            // 2. Then Switch Main Grid to 1x1 (showing the selected doc)
            applyLayout('1');
        }
    }, 400); // Wait slightly longer than CSS transition (0.3s)
}

function undockTagCloud(container, mouseX, mouseY) {
    if (!container.classList.contains('docked')) return;

    container.classList.remove('docked');
    document.body.classList.remove('ftc-docked');

    // Restore dimensions
    container.style.width = preDockState.width;
    container.style.bottom = ''; // Clear bottom if it was set
    container.style.height = preDockState.height || '';
    
    if (mouseX !== undefined && mouseY !== undefined) {
        // Drag undock
        container.style.top = `${mouseY - 20}px`; 
        container.style.left = `${mouseX - 160}px`;
    } else {
        // Manual undock
        container.style.top = preDockState.top || '100px';
        container.style.left = preDockState.left || '20px';
    }

    // Restore Layout (Optional: Switch back to 3x3 or keep 1x1? User said "back to original FTC")
    applyLayout('3');

    // Trigger Re-Render to restore groups and folder state
    const db = window.currentDbInstance;
    if (db) refreshTagCloud(db);
}

function makeDraggable(container, handle) {
    handle.addEventListener('mousedown', (e) => {
        // Dragging nicht starten, wenn auf Buttons im Header geklickt wird
        if (e.target.closest('.close-x, #btn-refresh-tags')) return;
        
        const isDocked = container.classList.contains('docked');

        // Snap-Klassen entfernen, um freies Bewegen zu ermöglichen
        if (container.id === 'tag-cloud-container') {
            // Position fixieren (Left/Top), bevor Snap-Klassen entfernt werden
            // Wichtig, falls es rechts angedockt war (right: 0)
            if (!isDocked) {
                const rect = container.getBoundingClientRect();
                container.style.left = `${rect.left}px`;
                container.style.right = 'auto';
                container.classList.remove('snapped-left', 'snapped-right');
            }
        }

        // Fix position if it was bottom-aligned (initial state)
        if (container.style.top === '' || container.style.top === 'auto') {
             const rect = container.getBoundingClientRect();
             container.style.top = `${rect.top}px`;
             container.style.bottom = 'auto';
             container.style.right = 'auto'; // Switch from right-aligned to absolute left/top
        }

        container.style.transition = 'none'; // Disable transition during drag
        isDraggable = true;
        
        if (isDocked) {
            // Beim Docked-State ist der Offset relativ einfach, da left=0
            offsetX = e.clientX; 
            offsetY = e.clientY; 
        } else {
            offsetX = e.clientX - container.getBoundingClientRect().left;
            offsetY = e.clientY - container.getBoundingClientRect().top;
        }
        
        handle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDraggable) return;

        // Check Undock Condition: Dragging right while docked
        if (container.classList.contains('docked')) {
            if (e.clientX > 100) { // Threshold to undock
                undockTagCloud(container, e.clientX, e.clientY);
                // Recalculate offset for smooth continuation
                offsetX = e.clientX - container.getBoundingClientRect().left;
                offsetY = e.clientY - container.getBoundingClientRect().top;
            }
            return; // Don't move via style if docked
        }

        container.style.left = `${e.clientX - offsetX}px`;
        container.style.top = `${e.clientY - offsetY}px`;
        updateSectorVisibility(container);
        updateHandleVisibility(container);
    });
    
    document.addEventListener('mouseup', () => {
        if (!isDraggable) return;
        isDraggable = false;
        container.style.transition = ''; // Re-enable transition
        handle.style.cursor = 'grab';
        document.body.style.userSelect = '';

        // Snap-Logik nur für die Tag-Cloud
        if (container.id === 'tag-cloud-container') {
            const finalRect = container.getBoundingClientRect();
            
            // DOCKING LOGIC: Left Edge
            if (finalRect.left <= 0) {
                dockTagCloud(container);
            } else if (finalRect.right > window.innerWidth - snapThreshold) {
                // Normal Snap Right
                container.style.left = 'auto';
                container.style.right = '0px';
                container.classList.add('snapped-right');
            }
            
            updateHandleVisibility(container);
        }
    });
}

// Helper: Baut eine verschachtelte Struktur aus Tags mit ">"
function buildTagTree(items) {
    const root = {};
    
    items.forEach(({ tag, count, element, isDoc, docData }) => {
        const parts = tag.split('>');
        let current = root;
        
        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = { _children: {}, _items: [] };
            }
            
            // Wenn es das letzte Element ist, speichern wir das Tag-Element
            if (index === parts.length - 1) {
                if (isDoc) {
                    current[part]._items.push({ element, isDoc: true, docData });
                } else {
                    current[part]._items.push({ element, isDoc: false });
                }
            }
            
            current = current[part]._children;
        });
    });
    return root;
}

// Helper: Rendert den Baum rekursiv
function renderTreeRecursive(node, container, isDocked = false, activeTagPath = null, currentPathPrefix = '') {
    const keys = Object.keys(node).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true }));

    for (const key of keys) {
        const entry = node[key];
        const hasChildren = Object.keys(entry._children).length > 0;
        const hasItems = entry._items.length > 0;

        const fullPath = currentPathPrefix ? `${currentPathPrefix}>${key}` : key;

        if (hasChildren || hasItems) {
            let shouldExpand = false;
            
            // Only expand if we are on the path to the active document
            if (isDocked && activeTagPath) {
                if (activeTagPath === fullPath || activeTagPath.startsWith(fullPath + '>')) {
                    shouldExpand = true;
                }
            }

            const details = document.createElement('details');
            details.open = shouldExpand; 
            details.style.marginLeft = '10px';
            details.style.marginBottom = '2px';

            const summary = document.createElement('summary');
            summary.textContent = key;
            summary.style.cursor = 'pointer';
            summary.style.fontSize = '0.8em';
            summary.style.opacity = '0.8';
            summary.style.userSelect = 'none';
            summary.style.color = 'var(--user-text)';
            
            details.appendChild(summary);

            // Erst Items (Blätter/Dokumente) rendern
            entry._items.forEach(itemObj => {
                const wrapper = document.createElement('div');
                if (itemObj.isDoc) {
                    // Document Item styling is handled in element creation
                    wrapper.style.marginLeft = '10px';
                } else {
                    wrapper.style.marginLeft = '15px';
                    wrapper.style.marginTop = '2px';
                }
                wrapper.appendChild(itemObj.element);
                details.appendChild(wrapper);
            });

            // Dann Unterordner rendern
            renderTreeRecursive(entry._children, details, isDocked, activeTagPath, fullPath);
            container.appendChild(details);
        }
    }
}

function updateCloudSelectionState(contentContainer) {
    if (!contentContainer) return;
    const searchInput = document.getElementById('main-search');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const activeTag = searchTerm.startsWith('tag:') ? searchTerm.substring(4) : null;

    const clearBtn = document.getElementById('btn-clear-tag-filter');
    if (clearBtn) {
        clearBtn.style.display = activeTag ? 'inline' : 'none';
        clearBtn.style.color = activeTag ? '#ff5252' : '';
    }

    const pills = contentContainer.querySelectorAll('.pill-user');
    pills.forEach(pill => {
        const tag = pill.dataset.tagName;
        if (activeTag && tag !== activeTag) {
            pill.classList.add('pill-inactive');
        } else {
            pill.classList.remove('pill-inactive');
        }
    });
}

export function updateTagCloudSelection() {
    const contentContainer = document.getElementById('tag-cloud-content');
    updateCloudSelectionState(contentContainer);
}

// ---------- Hidden Grouping Logic ----------
function getHiddenGroupRules() {
    try {
        return JSON.parse(localStorage.getItem('crudx_hidden_group_rules') || '[]');
    } catch { return []; }
}

function saveHiddenGroupRules(rules) {
    localStorage.setItem('crudx_hidden_group_rules', JSON.stringify(rules));
}

function renderHiddenGroupRulesUI() {
    const container = document.getElementById('hidden-group-rules-list');
    if (!container) return;
    container.innerHTML = '';
    const rules = getHiddenGroupRules();

    rules.forEach((rule, index) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.gap = '10px';
        div.innerHTML = `
            <input type="text" value="${rule}" class="rule-input" style="flex: 1; background: #222; border: 1px solid #444; color: #ccc; padding: 4px;">
            <button class="btn-remove-rule" style="background: #500; color: #fff; border: none; cursor: pointer; padding: 0 8px;">×</button>
        `;
        div.querySelector('.btn-remove-rule').onclick = () => {
            rules.splice(index, 1);
            saveHiddenGroupRules(rules);
            renderHiddenGroupRulesUI();
        };
        div.querySelector('input').onchange = (e) => {
            rules[index] = e.target.value;
            saveHiddenGroupRules(rules);
        };
        container.appendChild(div);
    });
}

function initHiddenGroupRulesEvents() {
    const addBtn = document.getElementById('btn-add-hidden-group-rule');
    if (addBtn) {
        // Event-Listener nur einmal hinzufügen (Check via Attribut)
        if (!addBtn.dataset.hasListener) {
            addBtn.addEventListener('click', () => {
                const rules = getHiddenGroupRules();
                rules.push('');
                saveHiddenGroupRules(rules);
                renderHiddenGroupRulesUI();
            });
            addBtn.dataset.hasListener = 'true';
        }
    }

    // Hook in den Save-Button des Modals (existiert bereits für andere Regeln)
    const saveBtn = document.getElementById('btn-save-rules');
    if (saveBtn && !saveBtn.dataset.hasHiddenGroupListener) {
        saveBtn.addEventListener('click', () => {
            // Speichern passiert bereits onchange, aber hier könnte man Feedback geben oder Reload triggern
            const db = window.currentDbInstance; // Hack: DB-Instanz global verfügbar machen oder neu holen
            if (db) refreshTagCloud(db);
        });
        saveBtn.dataset.hasHiddenGroupListener = 'true';
    }

    // Beim Öffnen des Modals UI rendern
    document.addEventListener('open-tag-rules', () => {
        renderHiddenGroupRulesUI();
    });
}

async function scanAndRenderTags(db, contentContainer) {
    const isDocked = document.getElementById('tag-cloud-container')?.classList.contains('docked');

    // Struktur wiederherstellen, falls sie durch vorherige Fehler gelöscht wurde
    if (!contentContainer.querySelector('.tag-sector')) {
        contentContainer.innerHTML = `
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
    const toggleBtn = contentContainer.querySelector('#btn-toggle-folder-view');
    if (toggleBtn) {
        toggleBtn.textContent = isFolderTreeMode ? '📂' : '📝';
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            isFolderTreeMode = !isFolderTreeMode;
            scanAndRenderTags(db, contentContainer); // Re-Render
        };
    }
    
    // DB Instanz für Reload speichern
    window.currentDbInstance = db;

    const loadingTarget = contentContainer.querySelector('.sector-cloud .sector-content');
    if (loadingTarget) loadingTarget.innerHTML = '<div class="pill pill-sys" style="margin: 10px;">Scanning...</div>';

    const docsByTag = new Map(); // Tag -> Array of Docs
    const tagCounts = new Map();
    
    try {
        // HINWEIS: Dies lädt ALLE Dokumente aus der Collection, was bei großen Datenbanken
        // zu hohen Kosten und langer Ladezeit führen kann. Für eine Produktionsanwendung
        // sollte eine serverseitige Aggregation (z.B. via Cloud Functions) in Betracht gezogen werden.
        
        const user = auth.currentUser;
        const tokens = user ? getAccessTokens(user.email) : ['*@*'];

        const querySnapshot = await getDocs(collection(db, "kv-store"));
        querySnapshot.forEach(doc => {
            const d = doc.data();
            
            // Access Control Filter: Zähle nur, was der User auch sehen darf
            const ac = d.access_control || [];
            if (!ac.some(t => tokens.includes(t))) return;

            const tags = d.user_tags;
            if (Array.isArray(tags)) {
                tags.forEach(tag => {
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                    if (!docsByTag.has(tag)) docsByTag.set(tag, []);
                    docsByTag.get(tag).push({ id: doc.id, ...d });
                });
            }
        });

        const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'de', { sensitivity: 'base', numeric: true }));
        
        // Sektoren leeren, bevor sie neu befüllt werden
        const sectors = contentContainer.querySelectorAll('.sector-content');
        sectors.forEach(s => {
            s.innerHTML = '';
            s.style.display = ''; // Reset display (falls vorher block gesetzt wurde)
        });
        
        // Referenzen auf die Sektoren holen
        const folderContent = contentContainer.querySelector('.sector-folder .sector-content');
        const hiddenContent = contentContainer.querySelector('.sector-hidden .sector-content');
        const cloudContent = contentContainer.querySelector('.sector-cloud .sector-content');

        if (sortedTags.length === 0) {
            const noTags = document.createElement('div');
            noTags.className = 'pill pill-sys';
            noTags.style.margin = '10px';
            noTags.textContent = 'No user tags found.';
            if (cloudContent) cloudContent.appendChild(noTags);
            return;
        }

        const folderItems = []; // Sammelt Items für den Folder-Sektor für spätere Baum-Verarbeitung
        const hiddenItems = []; // Sammelt Items für den Hidden-Sektor
        const hiddenGroupRules = getHiddenGroupRules();

        // --- DOCKED MODE: PREPARE DOCUMENT TREE ---
        let firstDocId = null;

        sortedTags.forEach(([tag, count]) => {
            // State laden
            const targetSector = getTagSector(tag);

            if (targetSector === 'folder' && folderContent) {
                if (isDocked) {
                    // DOCKED: Create Document Items for this folder tag
                    const docs = docsByTag.get(tag) || [];
                    docs.forEach(doc => {
                        if (!firstDocId) firstDocId = doc.id; // Capture first doc

                        const docItem = document.createElement('div');
                        docItem.className = 'doc-item';
                        docItem.textContent = doc.label || doc.id;
                        docItem.title = doc.id;
                        
                        docItem.onclick = () => {
                            // Select Document
                            const searchInput = document.getElementById('main-search');
                            if (searchInput) {
                                searchInput.value = doc.id;
                                fetchRealData(true);
                                // Highlight active
                                contentContainer.querySelectorAll('.doc-item').forEach(el => el.classList.remove('active'));
                                docItem.classList.add('active');
                            }
                        };
                        
                        folderItems.push({ tag, count: 1, element: docItem, isDoc: true, docData: doc });
                    });
                } else if (isFolderTreeMode) {
                    // NORMAL TREE: Tag Pills
                    const item = createTagPill(tag, count, contentContainer);
                    folderItems.push({ tag, count, element: item });
                } else {
                    // FLAT LIST
                    const item = createTagPill(tag, count, contentContainer);
                    folderContent.appendChild(item);
                }
            }
            else if (targetSector === 'hidden' && hiddenContent) {
                if (isDocked) return; // Hide hidden sector in docked mode? Or render flat?
                const item = createTagPill(tag, count, contentContainer);
                hiddenItems.push({ tag, count, element: item });
            }
            else if (targetSector === 'cloud' && cloudContent) {
                if (isDocked) return; // Hide cloud sector in docked mode
                const item = createTagPill(tag, count, contentContainer);
                cloudContent.appendChild(item);
            }
        });

        // --- Hidden Sector Grouping ---
        if (hiddenContent && !isDocked) {
            const groups = {};
            const looseItems = [];

            hiddenItems.forEach(entry => {
                let matchedRule = null;
                for (const rule of hiddenGroupRules) {
                    if (rule && new RegExp(rule).test(entry.tag)) {
                        matchedRule = rule;
                        break;
                    }
                }

                if (matchedRule) {
                    if (!groups[matchedRule]) groups[matchedRule] = [];
                    groups[matchedRule].push(entry);
                } else {
                    looseItems.push(entry);
                }
            });

            // Render Groups
            for (const [rule, items] of Object.entries(groups)) {
                const groupPill = document.createElement('div');
                groupPill.className = 'pill pill-sys';
                groupPill.style.cursor = 'pointer';
                groupPill.style.border = '1px solid var(--sys-border)';
                groupPill.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                groupPill.textContent = `${rule} (${items.length})`;
                
                // Tooltip listing elements
                groupPill.title = `Group: ${rule}\n` + items.map(i => `- ${i.tag}`).join('\n');

                groupPill.onclick = (e) => {
                    e.stopPropagation();
                    
                    // Close any existing dropdown
                    const existing = document.querySelector('.tag-dropdown-menu');
                    if (existing) existing.remove();

                    const menu = document.createElement('div');
                    menu.className = 'tag-dropdown-menu';
                    
                    items.forEach(itemObj => {
                        const tag = itemObj.tag;
                        const item = document.createElement('div');
                        item.className = 'pill pill-user';
                        item.textContent = `${tag} (${itemObj.count})`;
                        item.style.cursor = 'pointer';
                        
                        // Highlight active state in dropdown
                        const searchInput = document.getElementById('main-search');
                        const currentSearch = searchInput ? searchInput.value.trim() : '';
                        const activeTag = currentSearch.startsWith('tag:') ? currentSearch.substring(4) : null;
                        if (activeTag) {
                            if (activeTag === tag) item.style.border = '1px solid #00ff00';
                            else item.style.opacity = '0.5';
                        }

                        item.onclick = (ev) => {
                            ev.stopPropagation();
                            if (searchInput) {
                                searchInput.value = (searchInput.value.trim() === `tag:${tag}`) ? '' : `tag:${tag}`;
                                fetchRealData(true);
                                updateCloudSelectionState(contentContainer);
                            }
                            menu.remove();
                        };
                        menu.appendChild(item);
                    });

                    document.body.appendChild(menu);

                    const rect = groupPill.getBoundingClientRect();
                    const menuRect = menu.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const topPos = (spaceBelow < menuRect.height && rect.top > menuRect.height) ? rect.top - menuRect.height - 5 : rect.bottom + 5;
                    menu.style.top = `${topPos}px`;
                    menu.style.left = `${Math.min(rect.left, window.innerWidth - menuRect.width - 10)}px`;
                };

                hiddenContent.appendChild(groupPill);
            }

            // Render Loose Items
            looseItems.forEach(i => hiddenContent.appendChild(i.element));
        }

        if (isFolderTreeMode && folderItems.length > 0 && folderContent) {
            folderContent.style.display = 'block'; // Top-Level Folder untereinander anordnen
            const treeRoot = buildTagTree(folderItems);
            
            // Determine active document ID from search input (if it's a direct ID)
            const searchInput = document.getElementById('main-search');
            let activeDocId = null;
            if (searchInput && searchInput.value.trim() && !searchInput.value.startsWith('tag:') && !searchInput.value.startsWith('mime:') && !searchInput.value.startsWith('owner:')) {
                activeDocId = searchInput.value.trim();
            }

            // Fallback: If docked but no active doc selected, pick the first one found in tree
            if (isDocked && !activeDocId && firstDocId) {
                activeDocId = firstDocId;
                if (searchInput) {
                    searchInput.value = activeDocId;
                    fetchRealData(true);
                }
            }

            // Mark active in UI & Scroll to it
            if (activeDocId) {
                setTimeout(() => {
                    const activeItem = Array.from(contentContainer.querySelectorAll('.doc-item')).find(el => el.title === activeDocId);
                    if (activeItem) {
                        activeItem.classList.add('active');
                        activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                }, 50);
            }

            // Determine the primary tag path for the active document
            let activeTagPath = null;
            if (activeDocId) {
                // Find the first occurrence of this doc in the folder items
                // folderItems is populated based on sortedTags, so this is deterministic (alphabetical first tag)
                const foundItem = folderItems.find(item => item.isDoc && item.docData.id === activeDocId);
                if (foundItem) {
                    activeTagPath = foundItem.tag;
                }
            }

            renderTreeRecursive(treeRoot, folderContent, isDocked, activeTagPath);
        }

        // Initialen Selektionsstatus anwenden
        updateCloudSelectionState(contentContainer);

    } catch (error) {
        console.error("Error scanning tags:", error);
        contentContainer.innerHTML = `<div class="pill pill-sys" style="margin: 10px; background:red;color:white;">Error: ${error.message}</div>`;
    }
}

function createTagPill(tag, count, contentContainer) {
    const item = document.createElement('div');
    item.className = 'pill pill-user';
    item.textContent = `${tag} (${count})`;
    item.style.cursor = 'pointer';
    item.id = `tag-pill-${tag.replace(/[^a-zA-Z0-9]/g, '-')}`;
    item.dataset.tagName = tag;
    item.draggable = true;
    item.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', e.target.id));
    
    item.addEventListener('click', () => {
        const searchInput = document.getElementById('main-search');
        if (searchInput) {
            const currentSearch = searchInput.value.trim();
            searchInput.value = (currentSearch === `tag:${tag}`) ? '' : `tag:${tag}`;
            fetchRealData(true);
            updateCloudSelectionState(contentContainer);
        }
    });
    return item;
}

export async function refreshTagCloud(db) {
    const container = document.getElementById('tag-cloud-container');
    const contentContainer = document.getElementById('tag-cloud-content');
    if (container && contentContainer) {
        if (!container.classList.contains('active')) {
            container.classList.add('active');
            updateHandleVisibility(container);
            updateSectorVisibility(container);
        }
        return scanAndRenderTags(db, contentContainer);
    }
}

export function initTagCloud(db) {
    // Erzwinge Neu-Initialisierung: Altes Element entfernen, falls vorhanden
    const existing = document.getElementById('tag-cloud-container');
    if (existing) {
        existing.remove();
    }

    const cloudHTML = `
        <div id="tag-cloud-container" class="floating-modal cloud-level-3">
            <div class="modal-header modal-drag-handle">
                <h3>☁️ Floating Tag Cloud</h3>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span id="btn-clear-tag-filter" title="Unselect / Clear Filter" style="cursor: pointer; font-size: 1.1em; opacity: 0.7; display: none;">🚫</span>
                    <span id="btn-open-tag-rules" title="Configure Tag Rules (Regex)" style="cursor: pointer; font-size: 1.1em; opacity: 0.7;">📏</span>
                    <span id="btn-dock-cloud" title="Dock / Undock" style="cursor: pointer; font-size: 1.1em; opacity: 0.7;">⚓</span>
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
            <div class="resize-handle resize-handle-left" title="Resize Width"></div>
            <div class="resize-handle resize-handle-right" title="Resize Width"></div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', cloudHTML);

    initHiddenGroupRulesEvents();

    const container = document.getElementById('tag-cloud-container');
    const contentContainer = document.getElementById('tag-cloud-content');
    const handle = container.querySelector('.modal-drag-handle');
    const closeBtn = document.getElementById('btn-close-tag-cloud');
    const refreshBtn = document.getElementById('btn-refresh-tags');
    const transBtn = document.getElementById('btn-toggle-cloud-transparency');
    const clearFilterBtn = document.getElementById('btn-clear-tag-filter');
    const rulesBtn = document.getElementById('btn-open-tag-rules');
    const dockBtn = document.getElementById('btn-dock-cloud');

    makeDraggable(container, handle);
    
    // Double-Click to Dock/Undock
    handle.addEventListener('dblclick', (e) => {
        // Ignore clicks on buttons inside header
        if (e.target.closest('span') || e.target.closest('.close-x')) return;

        if (container.classList.contains('docked')) {
            undockTagCloud(container);
        } else {
            dockTagCloud(container);
        }
    });

    closeBtn.addEventListener('click', () => {
        container.classList.remove('active');
        // Reset Docking State on Close
        if (container.classList.contains('docked')) {
            container.classList.remove('docked');
            document.body.classList.remove('ftc-docked');
        }
    });
    refreshBtn.addEventListener('click', () => scanAndRenderTags(db, contentContainer));
    
    rulesBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('open-tag-rules'));
    });

    dockBtn.addEventListener('click', () => {
        if (container.classList.contains('docked')) {
            undockTagCloud(container);
        } else {
            dockTagCloud(container);
        }
    });

    clearFilterBtn.addEventListener('click', () => {
        const searchInput = document.getElementById('main-search');
        if (searchInput) {
            searchInput.value = '';
            fetchRealData(true);
            updateCloudSelectionState(contentContainer);
        }
    });

    // Transparency Toggle Logic (1 -> 2 -> 3)
    let currentLevel = 3;
    transBtn.addEventListener('click', () => {
        currentLevel = (currentLevel % 3) + 1; // Cycle 1, 2, 3
        
        container.classList.remove('cloud-level-1', 'cloud-level-2', 'cloud-level-3');
        container.classList.add(`cloud-level-${currentLevel}`);
        
        // Visual Feedback on Button
        transBtn.style.opacity = currentLevel === 1 ? "1" : (currentLevel === 2 ? "0.8" : "0.5");
    });

    // Drag & Drop für Sektoren
    const sectors = container.querySelectorAll('.tag-sector');
    sectors.forEach(sector => {
        sector.addEventListener('dragover', e => {
            e.preventDefault();
            sector.classList.add('drag-over');
        });
        sector.addEventListener('dragleave', () => sector.classList.remove('drag-over'));
        sector.addEventListener('drop', e => {
            e.preventDefault();
            sector.classList.remove('drag-over');
            const id = e.dataTransfer.getData('text/plain');
            const draggableElement = document.getElementById(id);
            const dropzone = sector.querySelector('.sector-content');
            if (draggableElement && dropzone) {
                dropzone.appendChild(draggableElement);
                
                // State speichern
                const tagName = draggableElement.dataset.tagName;
                const sectorType = sector.dataset.sector; // 'folder', 'hidden', 'cloud'
                if (tagName && sectorType) {
                    setManualTagState(tagName, sectorType);
                }
            }
        });
    });

    // Custom Resize Logic for Both Handles
    const resizeHandleLeft = container.querySelector('.resize-handle-left');
    const resizeHandleRight = container.querySelector('.resize-handle-right');

    function setupResizeHandle(handle, isRight) {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation(); // Sicherstellen, dass nichts anderes funkt
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = container.offsetWidth;
            const startLeft = container.getBoundingClientRect().left;
            container.style.transition = 'none'; // Disable transition during resize
            
            function doResize(mouseEvent) {
                const dx = mouseEvent.clientX - startX;
                
                if (isRight) {
                    const newWidth = startWidth + dx;
                    container.style.width = `${Math.max(300, newWidth)}px`;
                } else {
                    const newWidth = startWidth - dx;
                    if (newWidth >= 300) {
                        container.style.width = `${newWidth}px`;
                        if (!container.classList.contains('snapped-right')) {
                            container.style.left = `${startLeft + dx}px`;
                        }
                    }
                }
                updateSectorVisibility(container);
            }
            
            function stopResize() {
                document.removeEventListener('mousemove', doResize);
                document.removeEventListener('mouseup', stopResize);
                container.style.transition = ''; // Re-enable transition
                updateHandleVisibility(container);
            }
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        });
    }

    if (resizeHandleLeft) setupResizeHandle(resizeHandleLeft, false);
    if (resizeHandleRight) setupResizeHandle(resizeHandleRight, true);
    
    updateHandleVisibility(container);
    updateSectorVisibility(container);
}