import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData, getAccessTokens } from './pagination.js';
import { auth } from './firebase.js';

let isDraggable = false;
let offsetX, offsetY;
let isFolderTreeMode = true; // Default: Tree View

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

function makeDraggable(container, handle) {
    handle.addEventListener('mousedown', (e) => {
        // Dragging nicht starten, wenn auf Buttons im Header geklickt wird
        if (e.target.closest('.close-x, #btn-refresh-tags')) return;
        
        // Snap-Klassen entfernen, um freies Bewegen zu ermöglichen
        if (container.id === 'tag-cloud-container') {
            // Position fixieren (Left/Top), bevor Snap-Klassen entfernt werden
            // Wichtig, falls es rechts angedockt war (right: 0)
            const rect = container.getBoundingClientRect();
            container.style.left = `${rect.left}px`;
            container.style.right = 'auto';
            container.classList.remove('snapped-left', 'snapped-right');
        }

        isDraggable = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
        handle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDraggable) return;
        container.style.left = `${e.clientX - offsetX}px`;
        container.style.top = `${e.clientY - offsetY}px`;
        updateSectorVisibility(container);
    });
    
    document.addEventListener('mouseup', () => {
        if (!isDraggable) return;
        isDraggable = false;
        handle.style.cursor = 'grab';
        document.body.style.userSelect = '';

        // Snap-Logik nur für die Tag-Cloud
        if (container.id === 'tag-cloud-container') {
            const finalRect = container.getBoundingClientRect();
            const snapThreshold = 20;
            if (finalRect.left < snapThreshold) {
                container.style.left = '0px';
                container.style.right = 'auto';
                container.classList.add('snapped-left');
            } else if (finalRect.right > window.innerWidth - snapThreshold) {
                container.style.left = 'auto';
                container.style.right = '0px';
                container.classList.add('snapped-right');
            }
            
            updateHandleVisibility(container);
        }
    });
}

// Helper: Baut eine verschachtelte Struktur aus Tags mit ">"
function buildTagTree(tagsWithCounts) {
    const root = {};
    
    tagsWithCounts.forEach(({ tag, count, element }) => {
        const parts = tag.split('>');
        let current = root;
        
        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = { _children: {}, _items: [] };
            }
            
            // Wenn es das letzte Element ist, speichern wir das Tag-Element
            if (index === parts.length - 1) {
                current[part]._items.push(element);
            }
            
            current = current[part]._children;
        });
    });
    return root;
}

// Helper: Rendert den Baum rekursiv
function renderTreeRecursive(node, container) {
    for (const key in node) {
        const entry = node[key];
        const hasChildren = Object.keys(entry._children).length > 0;
        const hasItems = entry._items.length > 0;

        if (hasChildren || hasItems) {
            const details = document.createElement('details');
            details.open = false; // Standardmäßig zugeklappt
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

            // Erst Items (Blätter) rendern
            entry._items.forEach(el => {
                const wrapper = document.createElement('div');
                wrapper.style.marginLeft = '15px';
                wrapper.style.marginTop = '2px';
                wrapper.appendChild(el);
                details.appendChild(wrapper);
            });

            // Dann Unterordner rendern
            renderTreeRecursive(entry._children, details);
            container.appendChild(details);
        }
    }
}

async function scanAndRenderTags(db, contentContainer) {
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

    const loadingTarget = contentContainer.querySelector('.sector-cloud .sector-content');
    if (loadingTarget) loadingTarget.innerHTML = '<div class="pill pill-sys" style="margin: 10px;">Scanning...</div>';

    const tagCounts = new Map();
    
    try {
        // HINWEIS: Dies lädt ALLE Dokumente aus der Collection, was bei großen Datenbanken
        // zu hohen Kosten und langer Ladezeit führen kann. Für eine Produktionsanwendung
        // sollte eine serverseitige Aggregation (z.B. via Cloud Functions) in Betracht gezogen werden.
        
        const user = auth.currentUser;
        const tokens = user ? getAccessTokens(user.email) : [];

        const querySnapshot = await getDocs(collection(db, "kv-store"));
        querySnapshot.forEach(doc => {
            const d = doc.data();
            
            // Access Control Filter: Zähle nur, was der User auch sehen darf
            if (user) {
                const ac = d.access_control || [];
                if (!ac.some(t => tokens.includes(t))) return;
            }

            const tags = d.user_tags;
            if (Array.isArray(tags)) {
                tags.forEach(tag => {
                    if (tag.startsWith('🛡️')) return; // System-Tags ignorieren
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                });
            }
        });

        const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'de', { sensitivity: 'base' }));
        
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

        sortedTags.forEach(([tag, count]) => {
            const item = document.createElement('div');
            item.className = 'pill pill-user';
            item.textContent = `${tag} (${count})`;
            item.style.cursor = 'pointer';
            item.id = `tag-pill-${tag.replace(/[^a-zA-Z0-9]/g, '-')}`;
            item.dataset.tagName = tag; // Wichtig für State-Tracking
            item.draggable = true;
            item.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', e.target.id));
            
            item.addEventListener('click', () => {
                const searchInput = document.getElementById('main-search');
                if (searchInput) {
                    searchInput.value = `tag:${tag}`;
                    fetchRealData();
                }
            });

            // State laden
            const savedState = JSON.parse(localStorage.getItem('crudx_tag_state') || '{}');
            let targetSector = 'cloud';

            if (savedState[tag]) {
                // Manuelle Zuweisung hat Vorrang
                targetSector = savedState[tag];
            } else {
                // Standard-Logik: Folder (>) besiegt Hidden (:)
                if (tag.includes('>')) targetSector = 'folder';
                else if (tag.includes(':')) targetSector = 'hidden';
                else targetSector = 'cloud';
            }

            // In den entsprechenden Sektor einfügen
            if (targetSector === 'folder' && folderContent) {
                if (isFolderTreeMode) {
                    folderItems.push({ tag, count, element: item });
                } else {
                    folderContent.appendChild(item);
                }
            }
            else if (targetSector === 'hidden' && hiddenContent) hiddenContent.appendChild(item);
            else if (targetSector === 'cloud' && cloudContent) cloudContent.appendChild(item);
        });

        if (isFolderTreeMode && folderItems.length > 0 && folderContent) {
            folderContent.style.display = 'block'; // Top-Level Folder untereinander anordnen
            const treeRoot = buildTagTree(folderItems);
            renderTreeRecursive(treeRoot, folderContent);
        }

    } catch (error) {
        console.error("Error scanning tags:", error);
        contentContainer.innerHTML = `<div class="pill pill-sys" style="margin: 10px; background:red;color:white;">Error: ${error.message}</div>`;
    }
}

export function refreshTagCloud(db) {
    const container = document.getElementById('tag-cloud-container');
    const contentContainer = document.getElementById('tag-cloud-content');
    if (container && contentContainer) {
        if (!container.classList.contains('active')) {
            container.classList.add('active');
            updateHandleVisibility(container);
            updateSectorVisibility(container);
        }
        scanAndRenderTags(db, contentContainer);
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

    const container = document.getElementById('tag-cloud-container');
    const contentContainer = document.getElementById('tag-cloud-content');
    const handle = container.querySelector('.modal-drag-handle');
    const closeBtn = document.getElementById('btn-close-tag-cloud');
    const refreshBtn = document.getElementById('btn-refresh-tags');
    const transBtn = document.getElementById('btn-toggle-cloud-transparency');

    makeDraggable(container, handle);
    closeBtn.addEventListener('click', () => container.classList.remove('active'));
    refreshBtn.addEventListener('click', () => scanAndRenderTags(db, contentContainer));

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
                    const savedState = JSON.parse(localStorage.getItem('crudx_tag_state') || '{}');
                    savedState[tagName] = sectorType;
                    localStorage.setItem('crudx_tag_state', JSON.stringify(savedState));
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