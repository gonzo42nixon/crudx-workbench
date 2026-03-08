import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData, getAccessTokens, applyLayout } from './pagination.js';
import { detectMimetype, getMimeInfo } from './mime.js';
import { auth, db } from './firebase.js';
import { getTagSector, setManualTagState, getTagRules, setTagRules } from './tag-state.js';

let dockState = 0; // 0: floating, 1: left, 2: center, 3: right-bottom
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

// --- STATE PERSISTENCE ---
function saveTagCloudState() {
    const container = document.getElementById('tag-cloud-container');
    if (!container) return;
    
    // Collect expanded folders
    const expandedFolders = [];
    const openDetails = container.querySelectorAll('details[open]');
    openDetails.forEach(el => {
        if (el.dataset.fullPath) expandedFolders.push(el.dataset.fullPath);
    });

    const state = {
        dockState,
        preDockState,
        isActive: container.classList.contains('active'),
        dockedWidth: document.documentElement.style.getPropertyValue('--docked-width'),
        isFolderTreeMode,
        expandedFolders,
        visibleSectors: {
            folder: container.querySelector('.sector-folder')?.style.display !== 'none',
            hidden: container.querySelector('.sector-hidden')?.style.display !== 'none',
            cloud: container.querySelector('.sector-cloud')?.style.display !== 'none'
        },
        rect: (dockState === 0) ? {
            top: container.style.top,
            left: container.style.left,
            width: container.style.width,
            height: container.style.height
        } : null
    };
    localStorage.setItem('crudx_tag_cloud_state', JSON.stringify(state));
}

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

function updateSectorsForDockState(container) {
    if (!container) return;

    const folder = container.querySelector('.sector-folder');
    const hidden = container.querySelector('.sector-hidden');
    const cloud = container.querySelector('.sector-cloud');

    const setDisplay = (el, show) => {
        if (el) el.style.display = show ? 'flex' : 'none';
    };

    switch (dockState) {
        case 1: // Left (Folder Explorer)
            setDisplay(folder, true);
            setDisplay(hidden, false);
            setDisplay(cloud, false);
            break;
        case 2: // Center (Config)
            setDisplay(folder, true);
            setDisplay(hidden, true);
            setDisplay(cloud, true);
            break;
        case 3: // Bottom-Right (Cloud Viewer)
            setDisplay(folder, false);
            setDisplay(hidden, false);
            setDisplay(cloud, true);
            break;
        default: // 0: Floating
            updateSectorVisibility(container); // Use the old logic based on position
            break;
    }
}

function dockTagCloudLeft(container, targetDocId = null) {
    if (container.classList.contains('docked')) return;

    // Save state before docking
    preDockState.width = container.style.width;
    preDockState.height = container.style.height;
    preDockState.top = container.style.top;
    // If top is auto (initial state), calculate it
    const rect = container.getBoundingClientRect();
    if (!container.style.top || container.style.top === 'auto') preDockState.top = rect.top + 'px';
    preDockState.left = container.style.left;
    
    // Fix current dimensions for smooth transition
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;

    // Set default docked width to ensure title fits
    document.documentElement.style.setProperty('--docked-width', '380px');

    // Clean up other states
    container.classList.remove('docked-center', 'docked-bottom-right', 'snapped-right');
    container.style.transform = '';
    container.style.bottom = 'auto';
    container.style.right = 'auto';

    dockState = 1;
    container.classList.add('docked');
    container.classList.add('active'); // Ensure visibility immediately
    document.body.classList.add('ftc-docked');
    updateSectorsForDockState(container); // Force sector visibility update immediately
    saveTagCloudState();
    
    // Capture current selection (First Doc in Grid)
    const firstCardKey = document.querySelector('#data-container .card-kv .pill-key');
    let selectedDocId = targetDocId;
    if (!selectedDocId && firstCardKey) {
        selectedDocId = firstCardKey.textContent.trim();
    }

    // Animation Sequence: Wait for dock transition, then transform content & layout
    setTimeout(async () => {
        const db = window.currentDbInstance || window.db; // Use global/window db as fallback
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

function dockTagCloudCenter(container) {
    // Save state before docking, only if coming from floating
    if (dockState === 0) {
        const rect = container.getBoundingClientRect();
        preDockState.width = `${rect.width}px`;
        preDockState.height = `${rect.height}px`;
        preDockState.top = `${rect.top}px`;
        preDockState.left = `${rect.left}px`;
    }

    // Clean up other states
    container.classList.remove('docked', 'docked-left', 'docked-bottom-right', 'snapped-right');
    document.body.classList.remove('ftc-docked');

    dockState = 2;
    container.classList.add('docked-center');

    // Apply styles for centered mode
    container.style.width = window.innerWidth < 1000 ? '95vw' : '60vw';
    container.style.height = window.innerHeight < 800 ? '95vh' : '70vh';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.right = 'auto';
    container.style.bottom = 'auto';

    // Restore main layout to 3x3 if it was 1x1
    const gridSelect = document.getElementById('grid-select');
    if (gridSelect && gridSelect.value === '1') applyLayout('3');

    // Re-render to show correct sectors
    if (window.currentDbInstance) refreshTagCloud(window.currentDbInstance);
    saveTagCloudState();
}

function dockTagCloudBottomRight(container) {
    // Save state before docking, only if coming from floating
    if (dockState === 0) {
        const rect = container.getBoundingClientRect();
        preDockState.width = `${rect.width}px`;
        preDockState.height = `${rect.height}px`;
        preDockState.top = `${rect.top}px`;
        preDockState.left = `${rect.left}px`;
    }

    // Clean up other states
    container.classList.remove('docked', 'docked-left', 'docked-center', 'snapped-right');
    document.body.classList.remove('ftc-docked');

    dockState = 3;
    container.classList.add('docked-bottom-right');

    // Apply styles
    container.style.top = 'auto';
    container.style.left = 'auto';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.transform = '';
    container.style.width = 'auto';
    container.style.height = 'auto';
    container.style.minWidth = '250px';
    container.style.maxWidth = '40vw';
    container.style.maxHeight = '50vh';

    if (window.currentDbInstance) refreshTagCloud(window.currentDbInstance);
    saveTagCloudState();
}

function undockTagCloud(container, mouseX, mouseY) {
    if (dockState === 0) return; // Already floating

    const wasLeftDocked = (dockState === 1);
    dockState = 0; // Set to floating state

    container.classList.remove('docked', 'docked-left', 'docked-center', 'docked-bottom-right', 'snapped-right');
    document.body.classList.remove('ftc-docked');

    // Restore dimensions
    container.style.width = preDockState.width;
    container.style.height = preDockState.height || '';
    container.style.bottom = '';
    container.style.right = 'auto';
    container.style.transform = '';
    container.style.minWidth = '';
    container.style.maxWidth = '';
    container.style.maxHeight = '';
    
    if (mouseX !== undefined && mouseY !== undefined) {
        // Drag undock
        container.style.top = `${mouseY - 20}px`; 
        container.style.left = `${mouseX - 160}px`;
    } else {
        // Manual undock
        container.style.top = preDockState.top || '100px';
        container.style.left = preDockState.left || '20px';
    }

    // If we were left-docked, restore the main layout
    if (wasLeftDocked) applyLayout('3');

    const db = window.currentDbInstance;
    if (db) refreshTagCloud(db);
    saveTagCloudState();
}

function makeDraggable(container, handle) {
    handle.addEventListener('mousedown', (e) => {
        // Dragging nicht starten, wenn auf Buttons im Header geklickt wird
        if (e.target.closest('.close-x, #btn-refresh-tags')) return;
        
        const isFixed = dockState !== 0;

        // Snap-Klassen entfernen, um freies Bewegen zu ermöglichen
        if (container.id === 'tag-cloud-container') {
            // Position fixieren (Left/Top), bevor Snap-Klassen entfernt werden
            if (!isFixed) {
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
        
        if (isFixed) {
            // For fixed states, calculate offset relative to the click,
            // because we will be setting left/top on the element after undocking.
            const rect = container.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
        } else {
            offsetX = e.clientX - container.getBoundingClientRect().left;
            offsetY = e.clientY - container.getBoundingClientRect().top;
        }
        
        handle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDraggable) return;

        // Check Undock Condition: Dragging from a fixed state
        if (dockState !== 0) {
            undockTagCloud(container, e.clientX, e.clientY);
            // After undocking, dockState is 0. Recalculate offset for smooth continuation.
            offsetX = e.clientX - container.getBoundingClientRect().left;
            offsetY = e.clientY - container.getBoundingClientRect().top;
        }

        // Only move if floating
        if (dockState === 0) {
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
            updateSectorsForDockState(container);
            updateHandleVisibility(container);
        }
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
                dockTagCloudLeft(container);
            } else if (finalRect.right > window.innerWidth - snapThreshold) {
                // Normal Snap Right
                container.style.left = 'auto';
                container.style.right = '0px';
                container.classList.add('snapped-right');
            }
            
            updateHandleVisibility(container);
            saveTagCloudState();
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
function renderTreeRecursive(node, container, isDocked = false, activeTagPath = null, currentPathPrefix = '', expandedSet = null) {
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
            
            if (expandedSet && expandedSet.has(fullPath)) {
                shouldExpand = true;
            }

            const details = document.createElement('details');
            details.open = shouldExpand; 
            details.dataset.fullPath = fullPath;
            details.style.marginLeft = '10px';
            details.style.marginBottom = '2px';
            
            details.addEventListener('toggle', (e) => {
                e.stopPropagation();
                saveTagCloudState();
            });

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
            renderTreeRecursive(entry._children, details, isDocked, activeTagPath, fullPath, expandedSet);
            container.appendChild(details);
        }
    }
}

function updateCloudSelectionState(contentContainer) {
    if (!contentContainer) return;
    const searchInput = document.getElementById('main-search');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    
    let activeFilter = null;
    if (searchTerm.startsWith('tag:')) activeFilter = searchTerm.substring(4);
    else if (searchTerm.startsWith('mime:')) activeFilter = 'mime:' + searchTerm.substring(5);

    const clearBtn = document.getElementById('btn-clear-tag-filter');
    if (clearBtn) {
        clearBtn.style.display = activeFilter ? 'inline' : 'none';
        clearBtn.style.color = activeFilter ? '#ff5252' : '';
    }

    const pills = contentContainer.querySelectorAll('.pill-user, .pill-mime');
    pills.forEach(pill => {
        const tag = pill.dataset.tagName;
        if (activeFilter && tag !== activeFilter) {
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

export function locateDocumentInCloud(docId) {
    const container = document.getElementById('tag-cloud-container');
    if (!container) return;

    const searchInput = document.getElementById('main-search');
    if (searchInput) searchInput.value = docId;

    if (dockState !== 1) {
        dockTagCloudLeft(container, docId);
    } else {
        // Already docked, just refresh to update tree selection
        applyLayout('1');
        if (window.currentDbInstance) refreshTagCloud(window.currentDbInstance);
    }
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

function getFolderGroupRules() {
    try {
        return JSON.parse(localStorage.getItem('crudx_folder_group_rules') || '["Created>", "Last Read>", "Last Updated>", "Last Executed>"]');
    } catch { return []; }
}

function saveFolderGroupRules(rules) {
    localStorage.setItem('crudx_folder_group_rules', JSON.stringify(rules));
}

function renderGroupRulesUI() {
    const renderList = (containerId, getRulesFn, saveRulesFn) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const rules = getRulesFn();

        rules.forEach((rule, index) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.gap = '10px';
        div.style.marginBottom = '5px';
        div.innerHTML = `
            <input type="text" value="${rule}" class="rule-input" style="flex: 1; background: #222; border: 1px solid #444; color: #ccc; padding: 4px;">
            <button class="btn-remove-rule" style="background: #500; color: #fff; border: none; cursor: pointer; padding: 0 8px;">×</button>
        `;
        div.querySelector('.btn-remove-rule').onclick = () => {
            rules.splice(index, 1);
            saveRulesFn(rules);
            renderGroupRulesUI();
        };
        div.querySelector('input').onchange = (e) => {
            rules[index] = e.target.value;
            saveRulesFn(rules);
        };
        container.appendChild(div);
    });
    };

    renderList('hidden-group-rules-list', getHiddenGroupRules, saveHiddenGroupRules);
    renderList('folder-group-rules-list', getFolderGroupRules, saveFolderGroupRules);
}

function initGroupRulesEvents() {
    const addBtn = document.getElementById('btn-add-hidden-group-rule');
    if (addBtn) {
        // Event-Listener nur einmal hinzufügen (Check via Attribut)
        if (!addBtn.dataset.hasListener) {
            addBtn.addEventListener('click', () => {
                const rules = getHiddenGroupRules();
                rules.push('');
                saveHiddenGroupRules(rules);
                renderGroupRulesUI();
            });
            addBtn.dataset.hasListener = 'true';
        }
    }

    const addFolderBtn = document.getElementById('btn-add-folder-group-rule');
    if (addFolderBtn) {
        if (!addFolderBtn.dataset.hasListener) {
            addFolderBtn.addEventListener('click', () => {
                const rules = getFolderGroupRules();
                rules.push('');
                saveFolderGroupRules(rules);
                renderGroupRulesUI();
            });
            addFolderBtn.dataset.hasListener = 'true';
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
        renderGroupRulesUI();
    });
}

async function scanAndRenderTags(db, contentContainer) {
    const isLeftDocked = dockState === 1;

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
            saveTagCloudState();
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
        };

        const querySnapshot = await getDocs(collection(db, "kv-store"));
        querySnapshot.forEach(doc => {
            processDoc(doc.data(), doc.id);
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
        const folderGroupRules = getFolderGroupRules();

        // --- DOCKED MODE: PREPARE DOCUMENT TREE ---
        let firstDocId = null;

        sortedTags.forEach(([tag, count]) => {
            // State laden
            const targetSector = getTagSector(tag);

            if (targetSector === 'folder' && folderContent) {
                if (isLeftDocked) {
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
                if (isLeftDocked) return;
                const item = createTagPill(tag, count, contentContainer);
                hiddenItems.push({ tag, count, element: item });
            }
            else if (targetSector === 'cloud' && cloudContent) {
                if (isLeftDocked) return;
                const item = createTagPill(tag, count, contentContainer);
                cloudContent.appendChild(item);
            }
        });

        // --- Hidden Sector Grouping ---
        if (hiddenContent && (dockState === 0 || dockState === 2)) {
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
                
                groupPill.draggable = true;
                groupPill.dataset.groupRule = rule;
                groupPill.dataset.groupType = 'hidden';
                groupPill.id = `group-pill-hidden-${rule.replace(/[^a-zA-Z0-9]/g, '-')}`;
                groupPill.addEventListener('dragstart', e => {
                    e.dataTransfer.setData('text/plain', e.target.id);
                });
                
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
        } else if (hiddenContent) {
            hiddenItems.forEach(i => hiddenContent.appendChild(i.element));
        }

        // --- Folder Sector Grouping & Tree ---
        if (folderContent) {
            folderContent.style.display = 'block'; // Top-Level Folder untereinander anordnen
            
            const folderGroups = {};
            const folderLooseItems = [];

            // 1. Grouping Logic (ähnlich Hidden)
            if (dockState === 0 || dockState === 2) {
                folderItems.forEach(entry => {
                    let matchedRule = null;
                    for (const rule of folderGroupRules) {
                        if (rule && new RegExp(rule).test(entry.tag)) {
                            matchedRule = rule;
                            break;
                        }
                    }

                    if (matchedRule) {
                        if (!folderGroups[matchedRule]) folderGroups[matchedRule] = [];
                        folderGroups[matchedRule].push(entry);
                    } else {
                        folderLooseItems.push(entry);
                    }
                });

                // Render Folder Groups (Summary Pills)
                for (const [rule, items] of Object.entries(folderGroups)) {
                    const groupPill = document.createElement('div');
                    groupPill.className = 'pill pill-user'; // User style for folders
                    groupPill.style.cursor = 'pointer';
                    groupPill.style.border = '1px solid var(--user-border)';
                    groupPill.style.backgroundColor = 'rgba(64, 196, 255, 0.1)';
                    groupPill.style.marginBottom = '4px';
                    groupPill.textContent = `📁 ${rule} (${items.length})`;
                    
                    groupPill.draggable = true;
                    groupPill.dataset.groupRule = rule;
                    groupPill.dataset.groupType = 'folder';
                    groupPill.id = `group-pill-folder-${rule.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    groupPill.addEventListener('dragstart', e => {
                        e.dataTransfer.setData('text/plain', e.target.id);
                    });

                    groupPill.title = `Group: ${rule}\n` + items.map(i => `- ${i.tag}`).join('\n');

                    groupPill.onclick = (e) => {
                        e.stopPropagation();
                        // Dropdown Logic
                        const existing = document.querySelector('.tag-dropdown-menu');
                        if (existing) existing.remove();

                        const menu = document.createElement('div');
                        menu.className = 'tag-dropdown-menu';
                        items.forEach(itemObj => {
                            const tag = itemObj.tag;
                            const dropItem = document.createElement('div');
                            dropItem.className = 'pill pill-user';
                            dropItem.textContent = `${tag} (${itemObj.count})`;
                            dropItem.style.cursor = 'pointer';
                            
                            dropItem.onclick = (ev) => {
                                ev.stopPropagation();
                                const searchInput = document.getElementById('main-search');
                                if (searchInput) {
                                    searchInput.value = `tag:${tag}`;
                                    fetchRealData(true);
                                    updateCloudSelectionState(contentContainer);
                                }
                                menu.remove();
                            };
                            menu.appendChild(dropItem);
                        });
                        
                        document.body.appendChild(menu);
                        const rect = groupPill.getBoundingClientRect();
                        const menuRect = menu.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const topPos = (spaceBelow < menuRect.height && rect.top > menuRect.height) ? rect.top - menuRect.height - 5 : rect.bottom + 5;
                        menu.style.top = `${topPos}px`;
                        menu.style.left = `${Math.min(rect.left, window.innerWidth - menuRect.width - 10)}px`;
                    };
                    folderContent.appendChild(groupPill);
                }
            } else {
                // In Docked mode, we skip grouping for now or treat everything as loose
                folderItems.forEach(i => folderLooseItems.push(i));
            }
            
            // 2. Render Remaining Items as Tree or List
            if (isFolderTreeMode && folderLooseItems.length > 0) {
                const treeRoot = buildTagTree(folderLooseItems);
                
                // Determine active document ID from search input (if it's a direct ID)
                const searchInput = document.getElementById('main-search');
                let activeDocId = null;
                if (searchInput && searchInput.value.trim() && !searchInput.value.startsWith('tag:') && !searchInput.value.startsWith('mime:') && !searchInput.value.startsWith('owner:')) {
                    activeDocId = searchInput.value.trim();
                }

                // Fallback: If docked but no active doc selected, pick the first one found in tree
                if (isLeftDocked && !activeDocId && firstDocId) {
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
                    const foundItem = folderLooseItems.find(item => item.isDoc && item.docData.id === activeDocId);
                    if (foundItem) {
                        activeTagPath = foundItem.tag;
                    }
                }

                // Load expanded state
                let expandedSet = new Set();
                try {
                    const savedState = JSON.parse(localStorage.getItem('crudx_tag_cloud_state') || '{}');
                    if (savedState.expandedFolders) {
                        savedState.expandedFolders.forEach(p => expandedSet.add(p));
                    }
                } catch (e) {}

                renderTreeRecursive(treeRoot, folderContent, isLeftDocked, activeTagPath, '', expandedSet);
            } else if (!isFolderTreeMode && folderLooseItems.length > 0) {
                // Flat List for loose items
                folderLooseItems.forEach(i => folderContent.appendChild(i.element));
            }
        }

        // Initialen Selektionsstatus anwenden
        updateCloudSelectionState(contentContainer);

    } catch (error) {
        console.error("Error scanning tags:", error);
        contentContainer.innerHTML = `<div class="pill pill-sys" style="margin: 10px; background:red;color:white;">Error: ${error.message}</div>`;
    }
}

function createTagPill(tag, count, contentContainer) {
    const isMime = tag.startsWith('mime:');
    const displayTag = isMime ? tag.substring(5) : tag;

    const item = document.createElement('div');
    item.className = isMime ? 'pill pill-mime' : 'pill pill-user';
    item.textContent = `${displayTag} (${count})`;
    item.style.cursor = 'pointer';
    item.id = `tag-pill-${tag.replace(/[^a-zA-Z0-9]/g, '-')}`;
    item.dataset.tagName = tag;
    item.draggable = true;
    item.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', e.target.id));
    
    if (isMime) {
        const info = getMimeInfo(displayTag);
        item.style.backgroundColor = info.color;
        item.style.color = ['TXT','BASE64','JSON','JS','SVG'].includes(displayTag) ? '#000' : '#fff';
    }

    item.addEventListener('click', () => {
        const searchInput = document.getElementById('main-search');
        if (searchInput) {
            const currentSearch = searchInput.value.trim();
            const searchVal = isMime ? `mime:${displayTag}` : `tag:${displayTag}`;
            searchInput.value = (currentSearch === searchVal) ? '' : searchVal;
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
        }
        await scanAndRenderTags(db, contentContainer);
        updateHandleVisibility(container);
        updateSectorsForDockState(container);
        saveTagCloudState();
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

    // --- RESTORE STATE ---
    try {
        const saved = JSON.parse(localStorage.getItem('crudx_tag_cloud_state'));
        if (saved) {
            const container = document.getElementById('tag-cloud-container');
            const contentContainer = document.getElementById('tag-cloud-content');
            
            if (saved.preDockState) preDockState = saved.preDockState;
            if (saved.dockedWidth) document.documentElement.style.setProperty('--docked-width', saved.dockedWidth);
            if (typeof saved.isFolderTreeMode !== 'undefined') isFolderTreeMode = saved.isFolderTreeMode;

            // Restore Geometry (important for transitions)
            const rect = saved.rect || saved.preDockState;
            if (rect) {
                if (rect.top) container.style.top = rect.top;
                if (rect.left) container.style.left = rect.left;
                if (rect.width) container.style.width = rect.width;
                if (rect.height) container.style.height = rect.height;
            }

            // Restore Dock State
            if (saved.dockState === 1) dockTagCloudLeft(container);
            else if (saved.dockState === 2) dockTagCloudCenter(container);
            else if (saved.dockState === 3) dockTagCloudBottomRight(container);
            
            // Restore Visibility & Content
            if (saved.isActive) {
                container.classList.add('active');
                // We need to render tags immediately if active
                if (db) {
                    window.currentDbInstance = db;
                    scanAndRenderTags(db, contentContainer);
                }
            }

            // Restore Sector Visibility (Overrides default dock logic)
            if (saved.visibleSectors) {
                const folder = container.querySelector('.sector-folder');
                const hidden = container.querySelector('.sector-hidden');
                const cloud = container.querySelector('.sector-cloud');
                if (folder) folder.style.display = saved.visibleSectors.folder ? 'flex' : 'none';
                if (hidden) hidden.style.display = saved.visibleSectors.hidden ? 'flex' : 'none';
                if (cloud) cloud.style.display = saved.visibleSectors.cloud ? 'flex' : 'none';
            }
        }
    } catch(e) { console.error("Failed to restore Tag Cloud state", e); }

    initGroupRulesEvents();

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
    
    // Context Menu for Sector Visibility
    handle.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        // Remove any existing menu
        const existingMenu = document.querySelector('.tag-cloud-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'tag-cloud-context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${e.clientY}px;
            left: ${e.clientX}px;
            background: var(--editor-bg);
            border: 1px solid var(--editor-border);
            border-radius: 6px;
            padding: 5px;
            z-index: 3000;
            box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        ['Folder', 'Hidden', 'Cloud'].forEach(name => {
            const sectorEl = container.querySelector(`.sector-${name.toLowerCase()}`);
            if (!sectorEl) return;

            const isVisible = window.getComputedStyle(sectorEl).display !== 'none';

            const item = document.createElement('div');
            item.innerHTML = `<span style="display: inline-block; width: 20px;">${isVisible ? '✅' : '⬜'}</span> Toggle ${name}`;
            item.style.cssText = `padding: 6px 12px; cursor: pointer; border-radius: 4px; font-size: 0.9em; user-select: none; display: flex; align-items: center;`;
            item.onmouseover = () => item.style.backgroundColor = 'rgba(255,255,255,0.1)';
            item.onmouseout = () => item.style.backgroundColor = 'transparent';

            item.onclick = () => {
                sectorEl.style.display = isVisible ? 'none' : 'flex';
                saveTagCloudState();
                menu.remove();
            };
            menu.appendChild(item);
        });

        document.body.appendChild(menu);

        const closeMenu = (event) => {
            if (!menu.contains(event.target)) { menu.remove(); window.removeEventListener('click', closeMenu, { capture: true }); }
        };
        window.addEventListener('click', closeMenu, { capture: true });
    });

    // Double-Click to Dock/Undock
    handle.addEventListener('dblclick', (e) => {
        // Ignore clicks on buttons inside header
        if (e.target.closest('span') || e.target.closest('.close-x')) return;

        if (dockState !== 0) {
            undockTagCloud(container);
        } else {
            dockTagCloudLeft(container); // Default double-click action
        }
    });

    closeBtn.addEventListener('click', () => {
        container.classList.remove('active');
        // Reset Docking State on Close
        if (dockState !== 0) {
            // Restore floating state properties so it opens correctly next time
            container.classList.remove('docked', 'docked-left', 'docked-center', 'docked-bottom-right', 'snapped-right');
            document.body.classList.remove('ftc-docked');
            
            container.style.width = preDockState.width;
            container.style.height = preDockState.height || '';
            container.style.top = preDockState.top || '100px';
            container.style.left = preDockState.left || '20px';
            container.style.bottom = '';
            container.style.right = 'auto';
            container.style.transform = '';
            container.style.minWidth = '';
            container.style.maxWidth = '';
            container.style.maxHeight = '';

            dockState = 0;
            
            // Refresh to revert special views (like Markdown App) if in 1x1
            if (document.getElementById('grid-select')?.value === '1') {
                fetchRealData();
            }
            saveTagCloudState();
        }
    });
    refreshBtn.addEventListener('click', () => scanAndRenderTags(db, contentContainer));
    
    rulesBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('open-tag-rules'));
    });

    dockBtn.addEventListener('click', () => {
        // Cycle through states: 0->1, 1->2, 2->3, 3->1
        if (dockState === 0) dockState = 1;
        else dockState = (dockState % 3) + 1;

        switch (dockState) {
            case 1:
                dockTagCloudLeft(container);
                break;
            case 2:
                dockTagCloudCenter(container);
                break;
            case 3:
                dockTagCloudBottomRight(container);
                break;
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
            
            // Group Pill Logic (Move Regex Rule)
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
                        if (idx > -1) rules[sourceSec].splice(idx, 1);
                    }
                    setTagRules(rules);
                };

                const moveRule = (rule, getSource, saveSource, getTarget, saveTarget) => {
                    const sourceList = getSource();
                    const targetList = getTarget();
                    const idx = sourceList.indexOf(rule);
                    if (idx > -1) {
                        sourceList.splice(idx, 1);
                        saveSource(sourceList);
                        if (!targetList.includes(rule)) {
                            targetList.push(rule);
                            saveTarget(targetList);
                        }
                        return true;
                    }
                    return false;
                };

                if (sourceSector === 'folder' && targetSector === 'hidden') {
                    if (moveRule(rule, getFolderGroupRules, saveFolderGroupRules, getHiddenGroupRules, saveHiddenGroupRules)) {
                        updateSectorRules('hidden');
                        changed = true;
                    }
                }
                else if (sourceSector === 'hidden' && targetSector === 'folder') {
                    if (moveRule(rule, getHiddenGroupRules, saveHiddenGroupRules, getFolderGroupRules, saveFolderGroupRules)) {
                        updateSectorRules('folder');
                        changed = true;
                    }
                }

                if (changed && window.currentDbInstance) refreshTagCloud(window.currentDbInstance);
                return;
            }

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
                    const clampedWidth = Math.max(300, newWidth);
                    
                    if (container.classList.contains('docked')) {
                        document.documentElement.style.setProperty('--docked-width', `${clampedWidth}px`);
                    } else {
                        container.style.width = `${clampedWidth}px`;
                    }
                } else {
                    const newWidth = startWidth - dx;
                    if (newWidth >= 300) {
                        if (!container.classList.contains('docked')) {
                            container.style.width = `${newWidth}px`;
                            if (!container.classList.contains('snapped-right')) {
                                container.style.left = `${startLeft + dx}px`;
                            }
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
                saveTagCloudState();
            }
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        });
    }

    if (resizeHandleLeft) setupResizeHandle(resizeHandleLeft, false);
    if (resizeHandleRight) setupResizeHandle(resizeHandleRight, true);
    
    updateHandleVisibility(container);
    updateSectorsForDockState(container);
}