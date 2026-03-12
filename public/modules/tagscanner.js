import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData, getAccessTokens, applyLayout } from './pagination.js';
import { detectMimetype, getMimeInfo } from './mime.js';
import { auth, db } from './firebase.js';
import { getTagSector, setManualTagState, getTagRules, setTagRules } from './tag-state.js';
import { generateSystemTags, SYSTEM_TAG_PREFIXES } from './system-tags.js';

class TagCloud {
    constructor(db) {
        this.db = db;
        this.dockState = 3; // 3: bottom-right, 2: center, 1: left, 0: floating
        this.dockCycleDirection = 'forward'; // 'forward' or 'backward'
        this.isFolderTreeMode = true; // Default: Tree View
        this.isMaximized = false;
        this.preMaximizedState = {};
        this.cachedQuerySnapshot = null; // Cache für Firestore-Daten

        this._createDOM();
        this._getElements();
        this._bindEvents();

        // Initial state
        this.dockBottomRight();
        this._updateSectorsForDockState();
    }

    // --- PUBLIC API ---

    refresh(force = false) {
        if (!this.container.classList.contains('active')) {
            this.container.classList.add('active');
            void this.container.offsetWidth; // Force Reflow
        }
        this._scanAndRenderTags(force);
        this._updateSectorsForDockState();
    }

    updateSelection() {
        this._updateSelectionState();
    }

    reset() {
        this.dockBottomRight();
    }

    locateDocument(docId) {
        const searchInput = document.getElementById('main-search');
        if (searchInput) searchInput.value = docId;

        if (this.dockState !== 1) {
            this.dockLeft(docId);
        } else {
            applyLayout('1');
            this.refresh(true);
        }
    }

    // --- DOCKING & STATE ---

    _updateSectorsForDockState() {
        const setDisplay = (el, show) => {
            if (el) el.style.display = show ? 'flex' : 'none';
        };

        switch (this.dockState) {
            case 1: // Left (Folder Explorer)
                setDisplay(this.folderSector, true);
                setDisplay(this.hiddenSector, false);
                setDisplay(this.cloudSector, false);
                break;
            case 2: // Center (Config)
                setDisplay(this.folderSector, true);
                setDisplay(this.hiddenSector, true);
                setDisplay(this.cloudSector, true);
                break;
            case 3: // Bottom-Right (Cloud Viewer)
                setDisplay(this.folderSector, false);
                setDisplay(this.hiddenSector, false);
                setDisplay(this.cloudSector, true);
                break;
            default: // 0: Floating
                setDisplay(this.folderSector, true);
                setDisplay(this.hiddenSector, true);
                setDisplay(this.cloudSector, true);
                break;
        }
    }

    _updateHeaderTooltip() {
        let tooltip = "";
        switch (this.dockState) {
            case 3: tooltip = "1/3 Bottom/Right - Tag Cloud - 50% x 50% y"; break;
            case 2: tooltip = "2/3 Center - Config - 85% x 85% y"; break;
            case 1: tooltip = "3/3 Top/Left - Folder - 20% x 100% y"; break;
            default: tooltip = "Floating - User Defined"; break;
        }
        if (this.header) this.header.title = tooltip;
    }

    dockLeft(targetDocId = null) {
        this.container.classList.add('active');
        this._updateHeaderTooltip();
        void this.container.offsetWidth;

        this._resetInlineStyles();
        document.documentElement.style.setProperty('--docked-width', '380px');
        this.container.classList.remove('docked-center', 'docked-bottom-right', 'snapped-right');
        document.body.classList.remove('ftc-docked');

        this.dockState = 1;
        this.container.classList.add('docked');
        document.body.classList.add('ftc-docked');
        this._updateSectorsForDockState();
        this._updateHeaderTooltip();

        const firstCardKey = document.querySelector('#data-container .card-kv .pill-key');
        let selectedDocId = targetDocId || (firstCardKey ? firstCardKey.textContent.trim() : null);

        setTimeout(async () => {
            const searchInput = document.getElementById('main-search');
            if (selectedDocId && searchInput) {
                searchInput.value = selectedDocId;
            }
            await this.refresh(true);
            applyLayout('1');
        }, 400);
    }

    dockCenter() {
        this.container.classList.add('active');
        void this.container.offsetWidth;

        this.container.classList.remove('docked', 'docked-left', 'docked-bottom-right', 'snapped-right');
        document.body.classList.remove('ftc-docked');
        this.container.classList.add('docked-center');

        this.container.style.width = '85vw';
        this.container.style.height = '85vh';
        this._updateHeaderTooltip();
        this.container.style.maxWidth = '100vw';
        this.container.style.maxHeight = '100vh'; // FIX: CSS max-height: 70vh überschreiben
        this.container.style.top = '50%';
        this.container.style.left = '50%';
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.right = 'auto';
        this.container.style.bottom = 'auto';
        this.container.style.resize = 'both';
        this.dockState = 2;

        const gridSelect = document.getElementById('grid-select');
        if (gridSelect && gridSelect.value === '1') applyLayout('3');

        this._updateHeaderTooltip();
        this.refresh();
    }

    dockBottomRight() {
        this.container.classList.add('active');
        void this.container.offsetWidth;

        this.container.classList.remove('docked', 'docked-left', 'docked-center', 'snapped-right');
        document.body.classList.remove('ftc-docked');
        this.container.classList.add('docked-bottom-right');
        this._updateHeaderTooltip();
        this.container.style.top = 'auto';
        this.container.style.left = 'auto';
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        this.container.style.transform = '';
        this.container.style.width = 'auto';
        this.container.style.height = 'auto';
        this.container.style.minWidth = '500px';
        this.container.style.maxWidth = '50vw';
        this.container.style.maxHeight = '50vh';
        this.container.style.resize = 'both';
        this.dockState = 3;

        this._updateHeaderTooltip();
        this.refresh();
    }

    // --- UI & EVENT HANDLING ---

    _setupFloatingDrag() {
        let isDragging = false, hasMoved = false;
        const dragThreshold = 5;
        let startX, startY, offsetX, offsetY;

        this.header.addEventListener('mousedown', (e) => {
        // Ignore clicks on buttons inside the header
        if (e.target.closest('span')) {
            return;
        }
        e.preventDefault();
        isDragging = true;
        hasMoved = false;

        startX = e.clientX;
        startY = e.clientY;

        const rect = this.container.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        
        document.addEventListener('mousemove', this._onDragMouseMove);
        document.addEventListener('mouseup', this._onDragMouseUp);
    });

    // --- Double-click to Maximize ---
        this.header.addEventListener('dblclick', (e) => {
        // Ignore clicks on buttons
        if (e.target.closest('span')) {
            return;
        }
        e.preventDefault();

            if (!this.isMaximized) {
            // Save current state
                const rect = this.container.getBoundingClientRect();
                this.preMaximizedState = {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                    maxWidth: this.container.style.maxWidth || '100vw',
                    maxHeight: this.container.style.maxHeight || 'none'
            };

            // Apply maximized styles
                this.container.style.transition = 'all 0.3s ease';
                this.container.style.top = '2.5vh';
                this.container.style.left = '2.5vw';
                this.container.style.width = '95vw';
                this.container.style.height = '95vh';
                this.container.style.maxWidth = '100vw';
                this.container.style.maxHeight = '100vh';
                this.container.style.resize = 'none';
                this.container.style.transform = ''; // FIX: Zentrierungs-Transform entfernen, sonst fliegt es raus

                this.isMaximized = true;
                setTimeout(() => this.container.style.transition = '', 300);
        } else {
            // Restore previous state
                this.container.style.transition = 'all 0.3s ease';
                this.container.style.top = `${this.preMaximizedState.top}px`;
                this.container.style.left = `${this.preMaximizedState.left}px`;
                this.container.style.width = `${this.preMaximizedState.width}px`;
                this.container.style.height = `${this.preMaximizedState.height}px`;
                this.container.style.maxWidth = this.preMaximizedState.maxWidth;
                this.container.style.maxHeight = this.preMaximizedState.maxHeight;
                this.container.style.resize = 'both';
                this.container.style.transform = ''; // FIX: Sicherstellen, dass keine alten Transforms stören

                this.isMaximized = false;
                setTimeout(() => this.container.style.transition = '', 300);
        }
    });

        this._onDragMouseMove = (e) => {
            if (!isDragging) return;
            if (e.buttons === 0) { this._onDragMouseUp(); return; }

            if (!hasMoved && (Math.abs(e.clientX - startX) > dragThreshold || Math.abs(e.clientY - startY) > dragThreshold)) {
                hasMoved = true;
                if (this.isMaximized) {
                    this.isMaximized = false;
                    this.container.style.resize = 'both';
                }
                if (this.dockState !== 0) {
                    this.dockState = 0;
                    this._updateHeaderTooltip();
                    this.container.classList.remove('docked', 'docked-center', 'docked-bottom-right', 'snapped-right');
                    document.body.classList.remove('ftc-docked');
                    const rect = this.container.getBoundingClientRect();
                    this.container.style.top = `${rect.top}px`;
                    this.container.style.left = `${rect.left}px`;
                    this.container.style.width = `${rect.width}px`;
                    this.container.style.height = `${rect.height}px`;
                    this.container.style.maxWidth = '100vw';
                    this.container.style.maxHeight = '100vh';
                    this.container.style.transform = '';
                    this.container.style.bottom = 'auto';
                    this.container.style.right = 'auto';
                    this.container.style.resize = 'both';
                    this._updateSectorsForDockState();
                    this._updateHeaderTooltip();
                }
            }

            if (hasMoved) {
                this.container.style.left = `${e.clientX - offsetX}px`;
                this.container.style.top = `${e.clientY - offsetY}px`;
            }
        };

        this._onDragMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', this._onDragMouseMove);
            document.removeEventListener('mouseup', this._onDragMouseUp);
        };
    }

    _setupCustomResize() {
    const leftHandle = document.createElement('div');
    leftHandle.className = 'resize-handle resize-handle-left';
        this.container.appendChild(leftHandle);

    const rightHandle = document.createElement('div');
    rightHandle.className = 'resize-handle resize-handle-right';
        this.container.appendChild(rightHandle);

    let isResizing = false;
    let startX, startWidth, startLeft;
    let activeHandle = null;

    const onMouseDown = (e, handle) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        activeHandle = handle;
        startX = e.clientX;
        const rect = this.container.getBoundingClientRect();
        startWidth = rect.width;
        startLeft = rect.left;
        document.body.style.cursor = 'ew-resize';
        this.container.style.transition = 'none';
        document.addEventListener('mousemove', onMouseMove); // These can be local
        document.addEventListener('mouseup', onMouseUp);
    };

    leftHandle.addEventListener('mousedown', (e) => onMouseDown(e, 'left'));
    rightHandle.addEventListener('mousedown', (e) => onMouseDown(e, 'right'));

    const onMouseMove = (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;

        if (activeHandle === 'right') {
            this.container.style.width = `${startWidth + dx}px`;
        } else if (activeHandle === 'left') {
            this.container.style.width = `${startWidth - dx}px`;
            this.container.style.left = `${startLeft + dx}px`;
        }
    };

    const onMouseUp = () => {
        isResizing = false;
        activeHandle = null;
        document.body.style.cursor = '';
        this.container.style.transition = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    const checkProximity = () => {
        if (this.dockState !== 0) { // Only for floating mode
            leftHandle.style.display = 'none';
            rightHandle.style.display = 'none';
            return;
        }
        
        // Always show both handles when floating for maximum resizing flexibility
        leftHandle.style.display = 'block';
        rightHandle.style.display = 'block';
    };

    const observer = new MutationObserver(checkProximity);
    observer.observe(this.container, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', checkProximity);
    checkProximity();
}

    // --- DATA PROCESSING & RENDERING ---

    _buildTagTree(items) {
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

    _renderTreeRecursive(node, container, isDocked = false, activeTagPath = null, currentPathPrefix = '', expandedSet = null) {
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
            this._renderTreeRecursive(entry._children, details, isDocked, activeTagPath, fullPath, expandedSet);
            container.appendChild(details);
        }
    }
}

    _updateSelectionState() {
    const searchInput = document.getElementById('main-search');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    
    let activeFilter = null;
    if (searchTerm.startsWith('tag:')) activeFilter = searchTerm.substring(4);
        else if (searchTerm.startsWith('mime:')) activeFilter = searchTerm;

    const clearBtn = document.getElementById('btn-clear-tag-filter');
    if (clearBtn) {
        clearBtn.style.display = activeFilter ? 'inline' : 'none';
        clearBtn.style.color = activeFilter ? '#ff5252' : '';
    }

    const pills = this.contentContainer.querySelectorAll('.pill-user, .pill-mime');
    pills.forEach(pill => {
        const tag = pill.dataset.tagName;
        if (activeFilter && tag !== activeFilter) {
            pill.classList.add('pill-inactive');
        } else {
            pill.classList.remove('pill-inactive');
        }
    });
}

    _renderGroupRulesUI() {
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
                this._renderGroupRulesUI();
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

    _initGroupRulesEvents() {
    const addBtn = document.getElementById('btn-add-hidden-group-rule');
    if (addBtn) {
        // Event-Listener nur einmal hinzufügen (Check via Attribut)
        if (!addBtn.dataset.hasListener) {
            addBtn.addEventListener('click', () => {
                const rules = getHiddenGroupRules();
                rules.push('');
                saveHiddenGroupRules(rules);
                this._renderGroupRulesUI();
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
                this._renderGroupRulesUI();
            });
            addFolderBtn.dataset.hasListener = 'true';
        }
    }

    // Hook in den Save-Button des Modals (existiert bereits für andere Regeln)
    const saveBtn = document.getElementById('btn-save-rules');
    if (saveBtn && !saveBtn.dataset.hasHiddenGroupListener) {
        saveBtn.addEventListener('click', () => {
            this.refresh();
        });
        saveBtn.dataset.hasHiddenGroupListener = 'true';
    }

    // Beim Öffnen des Modals UI rendern
    document.addEventListener('open-tag-rules', () => {
        this._renderGroupRulesUI();
    });
}

    async _scanAndRenderTags(force = false) {
        const isLeftDocked = this.dockState === 1;

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
            // C - Create (10-19)
            'C: Last Hour': 10,
            'C: Today': 11,
            'C: Yesterday': 12,
            'C: This Week': 12.5,
            'C: This Month': 13,
            'C: Last 3 Months': 14,
            'C: This Year': 15,
            'C: Beyond this Year': 16,
            'C: Unknown': 17,

            // R - Read (20-29)
            'R: Last Hour': 20,
            'R: Today': 21,
            'R: Yesterday': 22,
            'R: This Week': 22.5,
            'R: This Month': 23,
            'R: Last 3 Months': 24,
            'R: This Year': 25,
            'R: Beyond this Year': 26,
            'R-Σ: Top 5': 27,
            'R-Σ: Mean': 28,
            'R-Σ: Rarely': 29,
            'R-Σ: Never': 29.5,

            // U - Update (30-49)
            'U: Last Hour': 30,
            'U: Today': 31,
            'U: Yesterday': 32,
            'U: This Week': 32.5,
            'U: This Month': 33,
            'U: Last 3 Months': 34,
            'U: This Year': 35,
            'U: Beyond this Year': 36,
            'U-Σ: Top 5': 37,
            'U-Σ: Mean': 38,
            'U-Σ: Rarely': 39,
            'U-Σ: Never': 39.5,

            // Size (2-9) - Zwischen MIME (1) und Create (10)
            'Size: Huge': 2,
            'Size: Large': 3,
            'Size: Medium': 4,
            'Size: Small': 5,

            // X - Execute (50-59)
            'X: Last Hour': 50,
            'X: Today': 51,
            'X: Yesterday': 52,
            'X: This Week': 52.5,
            'X: This Month': 53,
            'X: Last 3 Months': 54,
            'X: This Year': 55,
            'X: Beyond this Year': 56,
            'X-Σ: Top 5': 57,
            'X-Σ: Mean': 58,
            'X-Σ: Rarely': 59,
            'X-Σ: Never': 59.5,

            // Whitelists (60-89)
            'WL-R: Many': 60,
            'WL-R: Mean': 61,
            'WL-R: Few': 62,
            'WL-R: None': 62.5,
            'WL-U: Many': 70,
            'WL-U: Mean': 71,
            'WL-U: Few': 72,
            'WL-U: None': 72.5,
            'WL-X: Many': 80,
            'WL-X: Mean': 81,
            'WL-X: Few': 82,
            'WL-X: None': 82.5,
        };

        const getSortPriority = (tag) => {
            // 1. Defined System Order
            if (systemTagOrder[tag]) {
                return systemTagOrder[tag];
            }
            // 2. Mime types (Anchor at 1)
            if (tag.startsWith('mime:')) {
                return 1;
            }
            // 3. Owner tags (Right of Mime)
            if (tag.startsWith('Owner:')) {
                return 1.5;
            }
            // 4. Fallback for any other System Tag (Right of Mime)
            if (SYSTEM_TAG_PREFIXES.some(p => tag.startsWith(p))) {
                return 99;
            }
            
            // 5. User tags (Leftmost)
            return 0;
        };

        const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => {
            const prioA = getSortPriority(a[0]);
            const prioB = getSortPriority(b[0]);
            
            if (prioA !== prioB) return prioA - prioB;
            
            return a[0].localeCompare(b[0], 'de', { sensitivity: 'base', numeric: true });
        });
        
        // Sektoren leeren, bevor sie neu befüllt werden
        const sectors = this.contentContainer.querySelectorAll('.sector-content');
        sectors.forEach(s => {
            s.innerHTML = '';
            s.style.display = ''; // Reset display (falls vorher block gesetzt wurde)
        });
        
        // Referenzen auf die Sektoren holen
        const folderContent = this.contentContainer.querySelector('.sector-folder .sector-content');
        const hiddenContent = this.contentContainer.querySelector('.sector-hidden .sector-content');
        const cloudContent = this.contentContainer.querySelector('.sector-cloud .sector-content');


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
            if (SYSTEM_TAG_PREFIXES.some(p => tag.startsWith(p))) targetSector = 'cloud';

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
                                this.contentContainer.querySelectorAll('.doc-item').forEach(el => el.classList.remove('active'));
                                docItem.classList.add('active');
                            }
                        };
                        
                        folderItems.push({ tag, count: 1, element: docItem, isDoc: true, docData: doc });
                    });
                } else if (this.isFolderTreeMode) {
                    // NORMAL TREE: Tag Pills (this refers to the class instance)
                    const item = this._createTagPill(tag, count);
                    folderItems.push({ tag, count, element: item });
                } else {
                    // FLAT LIST
                    const item = this._createTagPill(tag, count);
                    folderContent.appendChild(item);
                }
            }
            else if (targetSector === 'hidden' && hiddenContent) {
                if (isLeftDocked) return;
                const item = this._createTagPill(tag, count);
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
                    // User(0) -> Mime(1) -> Owner(1.5) -> Size(2) -> Create(10) ...
                    if ((pA < 1 && pB >= 1) ||      // User -> Mime
                        (pA < 1.5 && pB >= 1.5) ||  // Mime -> Owner
                        (pA < 2 && pB >= 2) ||      // Owner -> Size
                        (pA < 10 && pB >= 10) ||    // Size -> Create
                        (pA < 20 && pB >= 20) ||    // Create -> Read
                        (pA < 30 && pB >= 30) ||    // Read -> Update
                        (pA < 50 && pB >= 50) ||    // Update -> Execute
                        (pA < 60 && pB >= 60)) {    // Execute -> Whitelists
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

                const item = this._createTagPill(tag, count);
                cloudContent.appendChild(item);
                lastPrio = currentPrio;
            }
        });

        // --- Hidden Sector Grouping ---
        if (hiddenContent && (this.dockState === 0 || this.dockState === 2)) {
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
                                this._updateSelectionState();
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
            if (this.dockState === 0 || this.dockState === 2) {
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
                                    this._updateSelectionState();
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
            if (this.isFolderTreeMode && folderLooseItems.length > 0) {
                const treeRoot = this._buildTagTree(folderLooseItems);
                
                // Determine active document ID from search input (if it's a direct ID)
                const searchInput = document.getElementById('main-search');
                let activeDocId = null;
                if (searchInput && searchInput.value.trim() && !searchInput.value.startsWith('tag:') && !searchInput.value.startsWith('mime:') && !searchInput.value.startsWith('owner:')) {
                    activeDocId = searchInput.value.trim();
                }

                // Mark active in UI & Scroll to it
                if (activeDocId) {
                    setTimeout(() => {
                        const activeItem = Array.from(this.contentContainer.querySelectorAll('.doc-item')).find(el => el.title === activeDocId);
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

                this._renderTreeRecursive(treeRoot, folderContent, isLeftDocked, activeTagPath, '', expandedSet);
            } else if (!this.isFolderTreeMode && folderLooseItems.length > 0) {
                // Flat List for loose items
                folderLooseItems.forEach(i => folderContent.appendChild(i.element));
            }
        }

        // Initialen Selektionsstatus anwenden
        this._updateSelectionState();

    } catch (error) {
        console.error("Error scanning tags:", error);
        this.contentContainer.innerHTML = `<div class="pill pill-sys" style="margin: 10px; background:red;color:white;">Error: ${error.message}</div>`;
    }
}

    _createTagPill(tag, count) {
    const isMime = tag.startsWith('mime:');
        const displayTag = isMime ? tag.substring(5) : (tag.startsWith("Owner: ") ? tag.substring(7) : tag);
    
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
            'This Week': 0.65,
            'This Month': 0.6,
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

        const sizeOpacityMap = {
            'Huge': 1.0,
            'Large': 0.8,
            'Medium': 0.6,
            'Small': 0.4
        };

        const whitelistOpacityMap = {
            'Many': 1.0,
            'Mean': 0.8,
            'Few': 0.6,
            'None': 0.4
        };

        const parts = tag.split(': ');
        if (parts.length > 1) {
            const category = parts[0];
            const value = parts.slice(1).join(': ');

            if (timeOpacityMap[value] && ['C', 'R', 'U', 'X'].includes(category)) {
                opacity = timeOpacityMap[value];
            } else if (counterOpacityMap[value] && ['R-Σ', 'U-Σ', 'X-Σ'].includes(category)) {
                opacity = counterOpacityMap[value];
            } else if (sizeOpacityMap[value] && category === 'Size') {
                opacity = sizeOpacityMap[value];
            } else if (whitelistOpacityMap[value] && category.startsWith('WL-')) {
                opacity = whitelistOpacityMap[value];
            }
        }

        // Color Mapping
        if (tag.startsWith('C:')) {
            sysClass = 'pill-sys-create'; // Blue
            tooltip = 'Creation Timestamp';
        }
        
        else if (tag.startsWith('R:')) {
            sysClass = 'pill-sys-read'; // Green TS
            tooltip = 'Last Read Timestamp';
        }
        else if (tag.startsWith('R-Σ:')) {
            sysClass = 'pill-sys-read'; 
            item.style.filter = 'brightness(0.6)'; // **Darker Green**
            tooltip = 'Read Counter';
        }
        
        else if (tag.startsWith('U:')) {
            sysClass = 'pill-sys-update'; // Orange TS
            tooltip = 'Last Update Timestamp';
        }
        else if (tag.startsWith('U-Σ:')) {
            sysClass = 'pill-sys-update';
            item.style.filter = 'brightness(0.7) saturate(1.2)'; // **Darker/Richer Orange**
            tooltip = 'Update Counter';
        }
        
        else if (tag.startsWith('Size:')) {
            sysClass = 'pill-sys-size'; // **White** (New Class)
            tooltip = 'Document Size';
        }
        
        else if (tag.startsWith('X:')) {
            sysClass = 'pill-sys-execute'; // Black TS
            tooltip = 'Last Execution Timestamp';
        }
        else if (tag.startsWith('X-Σ:')) {
            sysClass = 'pill-sys-execute';
            item.style.setProperty('background-color', '#ffd700', 'important'); // **Gold**
            item.style.setProperty('color', '#000000', 'important');
            item.style.setProperty('border-color', '#b29400', 'important');
            tooltip = 'Execution Counter';
        } 
        else if (tag.startsWith('WL-')) {
            // Whitelist Pills: White
            sysClass = 'pill-sys'; // Base class
            item.style.setProperty('background-color', '#ffffff', 'important');
            item.style.setProperty('color', '#000000', 'important');
            item.style.setProperty('border-color', '#cccccc', 'important');
            
            if (tag.startsWith('WL-R:')) {
                tooltip = 'Whitelist Count: READ';
                item.style.setProperty('border-color', '#388e3c', 'important'); // Green hint border
            } else if (tag.startsWith('WL-U:')) {
                tooltip = 'Whitelist Count: UPDATE';
                item.style.setProperty('border-color', '#f57c00', 'important'); // Orange hint border
            } else if (tag.startsWith('WL-X:')) {
                tooltip = 'Whitelist Count: EXECUTE';
                item.style.setProperty('border-color', '#333333', 'important'); // Black/Dark hint border
            }
        } else if (tag.startsWith('Owner:')) {
            sysClass = 'pill-sys-owner';
            tooltip = 'Owner';
        } else {
            tooltip = 'System Tag';
        }

        // Check if it's actually one of our known system tags, otherwise fallback to generic sys
        if (SYSTEM_TAG_PREFIXES.some(p => tag.startsWith(p))) {
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
            this._updateSelectionState();
        }
    });
    return item;
}

    _resetInlineStyles() {
        this.container.style.transform = '';
        this.container.style.top = '';
        this.container.style.left = '';
        this.container.style.bottom = '';
        this.container.style.right = '';
        this.container.style.width = '';
        this.container.style.height = '';
        this.container.style.minWidth = '';
        this.container.style.maxWidth = '';
        this.container.style.maxHeight = '';
        this.container.style.resize = '';
    }
}

// ---------- Hidden Grouping Logic (Module Scope) ----------
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


// --- SINGLETON INSTANCE & EXPORTS ---

let tagCloudInstance = null;

/**
 * Initializes the singleton TagCloud component.
 * @param {object} db - The Firestore database instance.
 * @returns {TagCloud} The singleton instance.
 */
export function initTagCloud(db) {
    if (!tagCloudInstance) {
        tagCloudInstance = new TagCloud(db);
    }
    return tagCloudInstance;
}

export function refreshTagCloud(force = false) {
    if (tagCloudInstance) tagCloudInstance.refresh(force);
}

export function updateTagCloudSelection() {
    if (tagCloudInstance) tagCloudInstance.updateSelection();
}

export function resetTagCloud() {
    if (tagCloudInstance) tagCloudInstance.reset();
}

export function locateDocumentInCloud(docId) {
    if (tagCloudInstance) tagCloudInstance.locateDocument(docId);
}

function _createDOM() {
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
}

function _getElements() {
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
}

function _bindEvents() {
    this._initGroupRulesEvents();
    this._setupFloatingDrag();
    this._setupCustomResize();

    // Context Menu for Sector Visibility
    this.header.addEventListener('contextmenu', (e) => {
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
            const sectorEl = this.container.querySelector(`.sector-${name.toLowerCase()}`);
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

    this.closeBtn.addEventListener('click', () => {
        // Exit Confluence mode (docked left) if active
        if (this.dockState === 1) {
            document.body.classList.remove('ftc-docked');
        }

        // Hide the container
        this.container.classList.remove('active');

        // --- Reset to default DOCKED BOTTOM RIGHT state for next open ---
        this.container.classList.remove('docked', 'docked-left', 'docked-center', 'snapped-right');
        this.container.classList.add('docked-bottom-right');
        
        this.container.style.top = 'auto';
        this.container.style.left = 'auto';
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        this.container.style.transform = '';
        this.container.style.width = 'auto';
        this.container.style.height = 'auto';
        this.container.style.minWidth = '250px';
        this.container.style.maxWidth = '40vw';
        this.container.style.maxHeight = '50vh';
        this.container.style.resize = 'both';

        this.dockState = 3; // Set state variable to default
    });
    this.refreshBtn.addEventListener('click', () => this.refresh(true));
    
    this.rulesBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('open-tag-rules'));
    });

    this.dockBtn.addEventListener('click', () => {
        // If it was floating, start the cycle from the default position
        if (this.dockState === 0) {
            this.dockBottomRight();
            return;
        }

        // Cycle: Bottom-Right (3) -> Center (2) -> Top-Left (1) -> Center (2) -> ...
        if (this.dockState === 3) { // is BR
            this.dockCenter();
            this.dockCycleDirection = 'forward';
        } else if (this.dockState === 1) { // is TL
            this.dockCenter();
            this.dockCycleDirection = 'backward';
        } else if (this.dockState === 2) { // is Center
            if (this.dockCycleDirection === 'forward') {
                this.dockLeft();
            } else { // direction is 'backward'
                this.dockBottomRight();
            }
        }
    });

    this.clearFilterBtn.addEventListener('click', () => {
        const searchInput = document.getElementById('main-search');
        if (searchInput) {
            searchInput.value = '';
            fetchRealData(true);
            this._updateSelectionState();
        }
    });

    // Transparency Toggle Logic (1 -> 2 -> 3)
    let currentLevel = 0; // Start with 0 (opaque)
    this.transBtn.addEventListener('click', () => {
        currentLevel = (currentLevel + 1) % 4; // Cycle 0, 1, 2, 3
        
        this.container.classList.remove('cloud-level-0', 'cloud-level-1', 'cloud-level-2', 'cloud-level-3');
        if (currentLevel > 0) this.container.classList.add(`cloud-level-${currentLevel}`);
        
        // Visual Feedback on Button
        this.transBtn.style.opacity = currentLevel === 1 ? "1" : (currentLevel === 2 ? "0.8" : "0.5");
    });

    // Drag & Drop für Sektoren
    const sectors = this.container.querySelectorAll('.tag-sector');
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
}

// Assign methods to the class prototype
Object.assign(TagCloud.prototype, { _createDOM, _getElements, _bindEvents });