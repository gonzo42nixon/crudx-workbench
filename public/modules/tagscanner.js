import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData, getAccessTokens, applyLayout } from './pagination.js';
import { detectMimetype, getMimeInfo } from './mime.js';
import { auth, db } from './firebase.js';
import { getTagSector, setManualTagState, getTagRules, setTagRules } from './tag-state.js';

let dockState = 3; // 3: bottom-right, 2: center, 1: left, 0: floating
let dockCycleDirection = 'forward'; // 'forward' or 'backward'
let isFolderTreeMode = true; // Default: Tree View
let isMaximized = false;
let preMaximizedState = {};
let cachedQuerySnapshot = null; // Cache für Firestore-Daten

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
            setDisplay(folder, true);
            setDisplay(hidden, true);
            setDisplay(cloud, true);
            break;
    }
}

function dockTagCloudLeft(container, targetDocId = null) {
    container.classList.add('active'); // Ensure visibility before getting rect
    void container.offsetWidth; // Force reflow

    // Reset inline styles from other dock modes
    container.style.transform = '';
    container.style.top = '';
    container.style.left = '';
    container.style.bottom = '';
    container.style.right = '';
    container.style.width = '';
    container.style.height = '';
    container.style.minWidth = '';
    container.style.maxWidth = '';
    container.style.maxHeight = '';
    container.style.resize = '';

    // Set default docked width to ensure title fits
    document.documentElement.style.setProperty('--docked-width', '380px');

    // Clean up other states
    container.classList.remove('docked-center', 'docked-bottom-right', 'snapped-right');
    container.style.transform = '';
    document.body.classList.remove('ftc-docked');

    dockState = 1;
    container.classList.add('docked');
    document.body.classList.add('ftc-docked');
    updateSectorsForDockState(container); // Force sector visibility update immediately
    
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
            await refreshTagCloud(db, true); // FORCE REFRESH to find new documents immediately
            
            // 2. Then Switch Main Grid to 1x1 (showing the selected doc)
            applyLayout('1');
        }
    }, 400); // Wait slightly longer than CSS transition (0.3s)
}

function dockTagCloudCenter(container) {
    container.classList.add('active'); // Ensure visibility before getting rect
    void container.offsetWidth; // Force reflow

    // Clean up other states
    container.classList.remove('docked', 'docked-left', 'docked-bottom-right', 'snapped-right');
    document.body.classList.remove('ftc-docked');

    container.classList.add('docked-center');

    // Apply styles for centered mode
    container.style.width = window.innerWidth < 1000 ? '95vw' : '60vw';
    container.style.height = window.innerHeight < 800 ? '95vh' : '70vh';
    container.style.maxWidth = '100vw';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.style.resize = 'both';
    dockState = 2;

    // Restore main layout to 3x3 if it was 1x1
    const gridSelect = document.getElementById('grid-select');
    if (gridSelect && gridSelect.value === '1') applyLayout('3');

    // Re-render to show correct sectors
    if (window.currentDbInstance) refreshTagCloud(window.currentDbInstance);
}

function dockTagCloudBottomRight(container) {
    container.classList.add('active'); // Ensure visibility before getting rect
    void container.offsetWidth; // Force reflow

    // Clean up other states
    container.classList.remove('docked', 'docked-left', 'docked-center', 'snapped-right');
    document.body.classList.remove('ftc-docked');

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
    container.style.resize = 'both';
    dockState = 3;

    if (window.currentDbInstance) refreshTagCloud(window.currentDbInstance);
}

function setupFloatingDrag(container) {
    const handle = container.querySelector('.modal-header');
    if (!handle) return;

    let isDragging = false;
    let hasMoved = false;
    const dragThreshold = 5; // pixels
    let startX, startY;
    let offsetX, offsetY;

    handle.addEventListener('mousedown', (e) => {
        // Ignore clicks on buttons inside the header
        if (e.target.closest('span')) {
            return;
        }
        e.preventDefault();
        isDragging = true;
        hasMoved = false;

        startX = e.clientX;
        startY = e.clientY;

        const rect = container.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // --- Double-click to Maximize ---
    handle.addEventListener('dblclick', (e) => {
        // Ignore clicks on buttons
        if (e.target.closest('span')) {
            return;
        }
        e.preventDefault();

        if (!isMaximized) {
            // Save current state
            const rect = container.getBoundingClientRect();
            preMaximizedState = {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                maxWidth: container.style.maxWidth || '100vw',
                maxHeight: container.style.maxHeight || 'none'
            };

            // Apply maximized styles
            container.style.transition = 'all 0.3s ease';
            container.style.top = '2.5vh';
            container.style.left = '2.5vw';
            container.style.width = '95vw';
            container.style.height = '95vh';
            container.style.maxWidth = '100vw'; // WICHTIG: Begrenzungen aufheben
            container.style.maxHeight = '100vh'; // WICHTIG: Begrenzungen aufheben
            container.style.resize = 'none';

            isMaximized = true;
            setTimeout(() => container.style.transition = '', 300);
        } else {
            // Restore previous state
            container.style.transition = 'all 0.3s ease';
            container.style.top = `${preMaximizedState.top}px`;
            container.style.left = `${preMaximizedState.left}px`;
            container.style.width = `${preMaximizedState.width}px`;
            container.style.height = `${preMaximizedState.height}px`;
            container.style.maxWidth = preMaximizedState.maxWidth;
            container.style.maxHeight = preMaximizedState.maxHeight;
            container.style.resize = 'both';

            isMaximized = false;
            setTimeout(() => container.style.transition = '', 300);
        }
    });

    function onMouseMove(e) {
        if (!isDragging) return;

        // SICHERHEITS-CHECK: Wenn keine Maustaste gedrückt ist, Drag sofort stoppen!
        if (e.buttons === 0) {
            onMouseUp();
            return;
        }

        if (!hasMoved && (Math.abs(e.clientX - startX) > dragThreshold || Math.abs(e.clientY - startY) > dragThreshold)) {
            hasMoved = true;

            // If we start dragging from a maximized state, just un-flag it and allow resize.
            if (isMaximized) {
                isMaximized = false;
                container.style.resize = 'both';
            }

            // --- Transition to Floating State (only on first move) ---
            if (dockState !== 0) {
                dockState = 0; // Set to floating
                container.classList.remove('docked', 'docked-center', 'docked-bottom-right', 'snapped-right');
                document.body.classList.remove('ftc-docked');
                const rect = container.getBoundingClientRect();
                container.style.top = `${rect.top}px`;
                container.style.left = `${rect.left}px`;
                container.style.width = `${rect.width}px`;
                container.style.height = `${rect.height}px`;
                container.style.maxWidth = '100vw';
                container.style.maxHeight = '100vh'; // WICHTIG: 50vh Limit entfernen beim Loslösen
                container.style.transform = '';
                container.style.bottom = 'auto';
                container.style.right = 'auto';
                container.style.resize = 'both';
                updateSectorsForDockState(container);
            }
        }

        if (hasMoved) {
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
        }
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

function setupCustomResize(container) {
    const leftHandle = document.createElement('div');
    leftHandle.className = 'resize-handle resize-handle-left';
    container.appendChild(leftHandle);

    const rightHandle = document.createElement('div');
    rightHandle.className = 'resize-handle resize-handle-right';
    container.appendChild(rightHandle);

    let isResizing = false;
    let startX, startWidth, startLeft;
    let activeHandle = null;

    const onMouseDown = (e, handle) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        activeHandle = handle;
        startX = e.clientX;
        const rect = container.getBoundingClientRect();
        startWidth = rect.width;
        startLeft = rect.left;
        document.body.style.cursor = 'ew-resize';
        container.style.transition = 'none'; // Disable transitions during resize for smoothness
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    leftHandle.addEventListener('mousedown', (e) => onMouseDown(e, 'left'));
    rightHandle.addEventListener('mousedown', (e) => onMouseDown(e, 'right'));

    const onMouseMove = (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;

        if (activeHandle === 'right') {
            container.style.width = `${startWidth + dx}px`;
        } else if (activeHandle === 'left') {
            container.style.width = `${startWidth - dx}px`;
            container.style.left = `${startLeft + dx}px`;
        }
    };

    const onMouseUp = () => {
        isResizing = false;
        activeHandle = null;
        document.body.style.cursor = '';
        container.style.transition = ''; // Re-enable transitions
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    const checkProximity = () => {
        if (dockState !== 0) { // Only for floating mode
            leftHandle.style.display = 'none';
            rightHandle.style.display = 'none';
            return;
        }
        
        // Always show both handles when floating for maximum resizing flexibility
        leftHandle.style.display = 'block';
        rightHandle.style.display = 'block';
    };

    const observer = new MutationObserver(checkProximity);
    observer.observe(container, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', checkProximity);
    checkProximity();
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
            
            const details = document.createElement('details');
            details.open = shouldExpand; 
            details.dataset.fullPath = fullPath;
            details.style.marginLeft = '10px';
            details.style.marginBottom = '2px';
            
            details.addEventListener('toggle', (e) => {
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

/**
 * Setzt die Tag Cloud in den Standard-Zustand (unten rechts) zurück.
 * Wird verwendet, wenn der Confluence-Mode verlassen wird (z.B. nach Delete).
 */
export function resetTagCloud() {
    const container = document.getElementById('tag-cloud-container');
    if (container) {
        dockTagCloudBottomRight(container);
    }
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
        if (window.currentDbInstance) refreshTagCloud(window.currentDbInstance, true); // Force refresh here too
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

// Helper: Generiert abstrakte System-Tags (Klassen statt Rohwerte)
function generateAbstractSystemTags(d, addTagFn, id) {
    // 1. Zähler (Reads, Updates, Executes) -> Small (<10), Medium (<100), Large (>=100)
    const getCounterClass = (val) => {
        const v = val || 0;
        if (v === 0) return 'Never';
        if (v < 10) return 'Rarely';
        if (v < 50) return 'Mean';
        return 'Top 5';
    };
    
    // Instantiierung erzwingen (Default auf 0/Small)
    addTagFn(`Reads: ${getCounterClass(d.reads || 0)}`, id, d);
    addTagFn(`Updates: ${getCounterClass(d.updates || 0)}`, id, d);
    addTagFn(`Executes: ${getCounterClass(d.executes || 0)}`, id, d);

    // 2. Größe (Size) -> Small (<10KB), Medium (<1MB), Large (>=1MB)
    let bytes = 0;
    if (d.size) {
        const match = d.size.match(/([\d.]+)\s*([a-zA-Z]+)/);
        if (match) {
            const num = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === 'KB') bytes = num * 1024;
            else if (unit === 'MB') bytes = num * 1024 * 1024;
            else if (unit === 'GB') bytes = num * 1024 * 1024 * 1024;
            else bytes = num;
        }
    }
    let sizeClass = 'Small';
    if (bytes >= 10 * 1024 * 1024) sizeClass = 'Huge'; // > 10 MB
    else if (bytes >= 500 * 1024) sizeClass = 'Large'; // > 500 KB
    else if (bytes >= 1024) sizeClass = 'Medium'; // > few Bytes
    
    addTagFn(`Size: ${sizeClass}`, id, d);

    // 3. Zeitstempel -> Relative Klassen
    const getTimeClass = (prefix, ts) => {
        let label = 'Beyond this Year'; // Default fallback
        if (ts) {
            const date = new Date(ts);
            if (!isNaN(date.getTime())) {
                const now = new Date();
                const diffMs = now - date;
                const diffDays = diffMs / (1000 * 60 * 60 * 24);
                
                if (diffMs < 3600 * 1000) label = 'Last Hour';
                else if (now.toDateString() === date.toDateString()) label = 'Today';
                else {
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    if (yesterday.toDateString() === date.toDateString()) label = 'Yesterday';
                    else if (diffDays <= 30) label = 'Last Month';
                    else if (diffDays <= 90) label = 'Last 3 Months';
                    else if (date.getFullYear() === now.getFullYear()) label = 'This Year';
                    else label = 'Beyond this Year';
                }
            }
        }
        // Bei Create wollen wir immer einen Tag, auch wenn kein Datum da ist (Fallback)
        if (prefix === 'Created' && !ts) label = 'Unknown'; 
        
        if (label) addTagFn(`${prefix}: ${label}`, id, d);
    };

    getTimeClass('Created', d.created_at);
    getTimeClass('Read', d.last_read_ts);
    getTimeClass('Updated', d.last_update_ts);
    getTimeClass('Executed', d.last_execute_ts);
}

async function scanAndRenderTags(db, contentContainer, force = false) {
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

            // NEU: Abstrakte System-Pills injizieren
            const addSysTag = (tag, id, d) => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                if (!docsByTag.has(tag)) docsByTag.set(tag, []);
                docsByTag.get(tag).push({ id: id, ...d });
            };
            generateAbstractSystemTags(d, addSysTag, id);
        };

        if (force || !cachedQuerySnapshot) {
            cachedQuerySnapshot = await getDocs(collection(db, "kv-store"));
        }
        const querySnapshot = cachedQuerySnapshot;
        querySnapshot.forEach(doc => {
            processDoc(doc.data(), doc.id);
        });

        // --- CUSTOM SORTING LOGIC ---
        const systemTagOrder = {
            // C - Create (10-19)
            'Created: Last Hour': 10,
            'Created: Today': 11,
            'Created: Yesterday': 12,
            'Created: Last Month': 13,
            'Created: Last 3 Months': 14,
            'Created: This Year': 15,
            'Created: Beyond this Year': 16,
            'Created: Unknown': 17,

            // R - Read (20-29)
            'Read: Last Hour': 20,
            'Read: Today': 21,
            'Read: Yesterday': 22,
            'Read: Last Month': 23,
            'Read: Last 3 Months': 24,
            'Read: This Year': 25,
            'Read: Beyond this Year': 26,
            'Reads: Top 5': 27,
            'Reads: Mean': 28,
            'Reads: Rarely': 29,
            'Reads: Never': 29.5,

            // U - Update (30-49)
            'Updated: Last Hour': 30,
            'Updated: Today': 31,
            'Updated: Yesterday': 32,
            'Updated: Last Month': 33,
            'Updated: Last 3 Months': 34,
            'Updated: This Year': 35,
            'Updated: Beyond this Year': 36,
            'Updates: Top 5': 37,
            'Updates: Mean': 38,
            'Updates: Rarely': 39,
            'Updates: Never': 39.5,

            // Size (40-49)
            'Size: Huge': 40,
            'Size: Large': 41,
            'Size: Medium': 42,
            'Size: Small': 43,
            // Size (2-9) - Zwischen MIME (1) und Create (10)
            'Size: Huge': 2,
            'Size: Large': 3,
            'Size: Medium': 4,
            'Size: Small': 5,

            // X - Execute (50-59)
            'Executed: Last Hour': 50,
            'Executed: Today': 51,
            'Executed: Yesterday': 52,
            'Executed: Last Month': 53,
            'Executed: Last 3 Months': 54,
            'Executed: This Year': 55,
            'Executed: Beyond this Year': 56,
            'Executes: Top 5': 57,
            'Executes: Mean': 58,
            'Executes: Rarely': 59,
            'Executes: Never': 59.5
        };

        const getSortPriority = (tag) => {
            // System tags have a defined order from 10 upwards
            if (systemTagOrder[tag]) {
                return systemTagOrder[tag];
            }
            // Mime types come after user tags
            if (tag.startsWith('mime:')) {
                return 1;
            }
            // User tags are the top priority
            return 0;
        };

        const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => {
            const prioA = getSortPriority(a[0]);
            const prioB = getSortPriority(b[0]);
            
            if (prioA !== prioB) return prioA - prioB;
            
            return a[0].localeCompare(b[0], 'de', { sensitivity: 'base', numeric: true });
        });
        
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

        let lastPrio = -1; // For line break logic

        // --- DOCKED MODE: PREPARE DOCUMENT TREE ---
        let firstDocId = null;

        sortedTags.forEach(([tag, count]) => {
            // State laden
            let targetSector = getTagSector(tag);

            // FORCE MIME TO CLOUD: Mime types are essential navigation, not hidden metadata
            if (tag.startsWith('mime:')) targetSector = 'cloud';
            
            // FORCE GENERATED SYSTEM TAGS TO CLOUD (Right of Mime)
            const systemPrefixes = ['Created:', 'Read:', 'Reads:', 'Updated:', 'Updates:', 'Size:', 'Executed:', 'Executes:'];
            if (systemPrefixes.some(p => tag.startsWith(p))) targetSector = 'cloud';

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

                const currentPrio = getSortPriority(tag);

                // Check if a line break should be inserted before this pill
                const getBreakMargin = (pA, pB) => {
                    // Reduced margin breaks for counter groups
                    if ((pA <= 26 && pB >= 27) || (pA <= 36 && pB >= 37) || (pA <= 56 && pB >= 57)) {
                        return '1px 0';
                    }
                    // Normal margin breaks for main groups
                    if ((pA < 1 && pB >= 1) || (pA < 2 && pB >= 2) || (pA < 10 && pB >= 10) || (pA < 20 && pB >= 20) || (pA < 30 && pB >= 30) || (pA < 50 && pB >= 50)) {
                        return '3px 0';
                    }
                    return null;
                };

                const breakMargin = lastPrio !== -1 ? getBreakMargin(lastPrio, currentPrio) : null;
                if (breakMargin) {
                    const br = document.createElement('div');
                    br.style.flexBasis = '100%';
                    br.style.height = '0';
                    br.style.margin = breakMargin;
                    cloudContent.appendChild(br);
                }

                const item = createTagPill(tag, count, contentContainer);
                cloudContent.appendChild(item);
                lastPrio = currentPrio;
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
    let tooltip = ''; // Tooltip-Variable

    if (isMime) {
        item.className = 'pill pill-mime';
        tooltip = 'Media/Message/Code Type';
    } else if (tag.includes(':')) {
        // Determine System Class & Opacity
        let sysClass = 'pill-sys';
        let opacity = 1.0;

        // NEW: Granular Opacity Mapping for Timestamps
        const timeOpacityMap = {
            'Last Hour': 0.9,
            'Today': 0.8,
            'Yesterday': 0.7,
            'Last Month': 0.6,
            'Last 3 Months': 0.5,
            'This Year': 0.4,
            'Beyond this Year': 0.3,
            'Unknown': 0.3
        };

        const counterOpacityMap = {
            'Top 5': 1.0,
            'Mean': 0.8,
            'Rarely': 0.6,
            'Never': 0.4
        };

        const parts = tag.split(': ');
        if (parts.length > 1) {
            const category = parts[0];
            const value = parts.slice(1).join(': ');

            if (timeOpacityMap[value]) {
                opacity = timeOpacityMap[value];
            } else if (counterOpacityMap[value] && (category === 'Reads' || category === 'Updates' || category === 'Executes')) {
                opacity = counterOpacityMap[value];
            } else if (category === 'Size') {
                opacity = 1.0; // Size is white, needs to pop
            }
        }

        // Color Mapping
        if (tag.startsWith('Created:')) {
            sysClass = 'pill-sys-create'; // Blue
            tooltip = 'Timestamp: Document Creation';
        }
        
        else if (tag.startsWith('Read:')) {
            sysClass = 'pill-sys-read'; // Green TS
            tooltip = 'Timestamp: Last Read';
        }
        else if (tag.startsWith('Reads:')) {
            sysClass = 'pill-sys-read'; 
            item.style.filter = 'brightness(0.6)'; // **Darker Green**
            tooltip = 'Counter: Read Operations';
        }
        
        else if (tag.startsWith('Updated:')) {
            sysClass = 'pill-sys-update'; // Orange TS
            tooltip = 'Timestamp: Last Update';
        }
        else if (tag.startsWith('Updates:')) {
            sysClass = 'pill-sys-update';
            item.style.filter = 'brightness(0.7) saturate(1.2)'; // **Darker/Richer Orange**
            tooltip = 'Counter: Update Operations';
        }
        
        else if (tag.startsWith('Size:')) {
            sysClass = 'pill-sys-size'; // **White** (New Class)
            tooltip = 'Classification: Document Size';
        }
        
        else if (tag.startsWith('Executed:')) {
            sysClass = 'pill-sys-execute'; // Black TS
            tooltip = 'Timestamp: Last Execution';
        }
        else if (tag.startsWith('Executes:')) {
            sysClass = 'pill-sys-execute';
            item.style.backgroundColor = '#333333'; // **Darker Gray**
            item.style.borderColor = '#666';
            tooltip = 'Counter: Execute Operations';
        } else {
            tooltip = 'System Tag';
        }

        // Check if it's actually one of our known system tags, otherwise fallback to generic sys
        const knownPrefixes = ['Created:', 'Read:', 'Reads:', 'Updated:', 'Updates:', 'Size:', 'Executed:', 'Executes:'];
        if (knownPrefixes.some(p => tag.startsWith(p))) {
            item.className = `pill ${sysClass}`;
            item.style.opacity = opacity;
        } else {
            item.className = 'pill pill-sys'; // Generic hidden/system tags
        }
    } else {
        item.className = 'pill pill-user';
        tooltip = 'User Tag';
    }
    item.textContent = `${displayTag} (${count})`;
    item.title = tooltip;
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

export async function refreshTagCloud(db, force = false) {
    const container = document.getElementById('tag-cloud-container');
    const contentContainer = document.getElementById('tag-cloud-content');
    if (container && contentContainer) {
        if (!container.classList.contains('active')) {
            container.classList.add('active');
            // Force Reflow to ensure dimensions are correct for sector updates immediately after display:flex
            void container.offsetWidth;
        }
        await scanAndRenderTags(db, contentContainer, force);
        updateSectorsForDockState(container);
    }
}

export function initTagCloud(db) {
    window.currentDbInstance = db; // DB-Instanz sofort verfügbar machen
    // Erzwinge Neu-Initialisierung: Altes Element entfernen, falls vorhanden
    const existing = document.getElementById('tag-cloud-container');
    if (existing) {
        existing.remove();
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

    initGroupRulesEvents();
    setupFloatingDrag(document.getElementById('tag-cloud-container'));
    setupCustomResize(document.getElementById('tag-cloud-container'));

    const container = document.getElementById('tag-cloud-container');
    const contentContainer = document.getElementById('tag-cloud-content');
    const closeBtn = document.getElementById('btn-close-tag-cloud');
    const refreshBtn = document.getElementById('btn-refresh-tags');
    const transBtn = document.getElementById('btn-toggle-cloud-transparency');
    const clearFilterBtn = document.getElementById('btn-clear-tag-filter');
    const rulesBtn = document.getElementById('btn-open-tag-rules');
    const dockBtn = document.getElementById('btn-dock-cloud');

    // Context Menu for Sector Visibility
    container.querySelector('.modal-header').addEventListener('contextmenu', (e) => {
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

    closeBtn.addEventListener('click', () => {
        // Exit Confluence mode (docked left) if active
        if (dockState === 1) {
            document.body.classList.remove('ftc-docked');
        }

        // Hide the container
        container.classList.remove('active');

        // --- Reset to default DOCKED BOTTOM RIGHT state for next open ---
        container.classList.remove('docked', 'docked-left', 'docked-center', 'snapped-right');
        container.classList.add('docked-bottom-right');
        
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
        container.style.resize = 'both';

        dockState = 3; // Set state variable to default
    });
    refreshBtn.addEventListener('click', () => scanAndRenderTags(db, contentContainer, true)); // Force Refresh
    
    rulesBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('open-tag-rules'));
    });

    dockBtn.addEventListener('click', () => {
        // If it was floating, start the cycle from the default position
        if (dockState === 0) {
            dockTagCloudBottomRight(container);
            return;
        }

        // Cycle: Bottom-Right (3) -> Center (2) -> Top-Left (1) -> Center (2) -> ...
        if (dockState === 3) { // is BR
            dockTagCloudCenter(container);
            dockCycleDirection = 'forward';
        } else if (dockState === 1) { // is TL
            dockTagCloudCenter(container);
            dockCycleDirection = 'backward';
        } else if (dockState === 2) { // is Center
            if (dockCycleDirection === 'forward') {
                dockTagCloudLeft(container);
            } else { // direction is 'backward'
                dockTagCloudBottomRight(container);
            }
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
    let currentLevel = 0; // Start with 0 (opaque)
    transBtn.addEventListener('click', () => {
        currentLevel = (currentLevel + 1) % 4; // Cycle 0, 1, 2, 3
        
        container.classList.remove('cloud-level-0', 'cloud-level-1', 'cloud-level-2', 'cloud-level-3');
        if (currentLevel > 0) container.classList.add(`cloud-level-${currentLevel}`);
        
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

    // --- INITIAL STATE ---
    // Always start docked at the bottom right.
    dockTagCloudBottomRight(container);
    updateSectorsForDockState(container);
}