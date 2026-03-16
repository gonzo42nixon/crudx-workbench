// c:\Users\druef\Documents\crudx-workbench\public\modules\tagscanner.js
import { applyLayout } from './layout-manager.js';
import { fetchRealData } from './pagination.js'; // Import fetchRealData for search updates
import { db } from './firebase.js';
 
// Import the installer functions from the separated modules
import { installDomMethods } from './tagcloud-dom.js';
import { installDockingMethods } from './tagcloud-docking.js';
import { installRenderingMethods } from './tagcloud-rendering.js';

// Define the TagCloud class first
class TagCloud {
    constructor(db) {
        this.db = db;
        this.dockState = 3; // 3: bottom-right, 2: center, 1: left, 0: floating
        this.dockCycleDirection = 'forward'; // 'forward' or 'backward'
        this.isFolderTreeMode = true; // Default: Tree View
        this.isMaximized = false;
        this.preMaximizedState = {};
        this.cachedQuerySnapshot = null; // Cache für Firestore-Daten

        // Mini Term Editor State
        this.expressionMode = false;
        this.activeOp = 'OR'; // OR (||) or AND (&&)
        this.miniTransLevel = 0; // 0: 100%, 1: 90%, 2: 50%
        // WICHTIG: KEINE METHODENAUFRUFE HIER!
        // Methoden wie _createDOM, _getElements, _bindEvents werden dem Prototyp
        // *nach* dieser Klassendefinition, aber *bevor* eine Instanz erstellt wird, hinzugefügt.
        // Sie sollten *auf der Instanz* in initTagCloud aufgerufen werden, nicht im Konstruktor.
    }

    // --- PUBLIC API ---

    refresh(force = false) {
        if (!this.container.classList.contains('active')) {
            this.container.classList.add('active');
            void this.container.offsetWidth; // Force Reflow
        }
        this._updateMiniTermVisibility();
        this._scanAndRenderTags(force);
        this._updateSectorsForDockState();
    }

    updateSelection() {
        this._updateMiniTermVisibility();
        this._updateSelectionState();
    }

    reset() {
        this.dockBottomRight();
        this._updateMiniTermVisibility();
    }

    /**
     * Toggles the presence of a given tag in the main search input.
     * If the tag is present, it's removed. If not, it's added.
     * This method aims to provide a simple toggle behavior for individual tags,
     * respecting the current expression mode for how tags are joined.
     * @param {string} tagText The text of the tag to toggle (e.g., "myTag").
     */
    _toggleTagInSearch(tagText) {
        const searchInput = document.getElementById('main-search');
        if (!searchInput) return;

        let currentSearch = searchInput.value.trim();
        const tagPrefix = 'tag:';
        const fullTag = tagPrefix + tagText;

        // Determine the effective operator for joining/splitting
        const effectiveOperator = this.expressionMode ? (this.activeOp === 'AND' ? '&&' : '||') : ' ';
        // Use a regex to split by the effective operator or by one or more spaces
        const splitRegex = new RegExp(`\\s*${effectiveOperator === ' ' ? '\\s+' : effectiveOperator}\\s*`);

        let terms = currentSearch.split(splitRegex).filter(t => t !== '');
        let tagFound = false;
        let newTerms = [];

        for (const term of terms) {
            if (term.toLowerCase() === fullTag.toLowerCase()) {
                tagFound = true;
                // Do not add this term to newTerms (effectively removing it)
            } else {
                newTerms.push(term);
            }
        }

        if (!tagFound) {
            // Tag was not found, so add it
            newTerms.push(fullTag);
        }

        // Reconstruct the search string
        let newSearch = newTerms.join(` ${effectiveOperator} `).trim();

        // Clean up leading/trailing operators if they appear due to removal
        // E.g., if "tag:a && tag:b" and "tag:a" is removed, it becomes "&& tag:b". This cleans it to "tag:b".
        if (this.expressionMode) {
            newSearch = newSearch.replace(new RegExp(`^${effectiveOperator}\\s*`), '').replace(new RegExp(`\\s*${effectiveOperator}$`), '').trim();
        }
        
        searchInput.value = newSearch;
        // Trigger a search/refresh of the data, resetting pagination to page 1
        fetchRealData(true); 
    }

    locateDocument(docId) {
        const searchInput = document.getElementById('main-search');
        if (searchInput) searchInput.value = docId;
        document.body.classList.remove('no-app-view'); 

        if (this.dockState !== 1) {
            this.dockLeft(docId);
        } else {
            applyLayout('1');
            this.refresh(true);
        }
    }
}

// Jetzt alle Methoden auf den TagCloud-Prototyp installieren
// Dies muss *nach* der Klassendefinition, aber *bevor* eine Instanz erstellt wird, geschehen.
installDomMethods(TagCloud);
installDockingMethods(TagCloud);
installRenderingMethods(TagCloud);

// --- SINGLETON INSTANZ & EXPORTS ---

let tagCloudInstance = null;

export function initTagCloud(db) {
    if (!tagCloudInstance) {
        tagCloudInstance = new TagCloud(db);
        // Jetzt, da die Instanz erstellt und der Prototyp erweitert wurde,
        // können wir die Setup-Methoden sicher auf der Instanz aufrufen.
        tagCloudInstance._createDOM();
        tagCloudInstance._getElements();
        tagCloudInstance._bindEvents();
        tagCloudInstance._updateMiniTermEditorUI(); // Initialize toggle switches with text and colors
        tagCloudInstance.dockBottomRight();
        
        // HINWEIS FÜR DIE ENTWICKLUNG:
        // Die Event-Listener für die einzelnen Tag-Pillen (z.B. in tagcloud-dom.js oder tagcloud-rendering.js)
        // müssen angepasst werden, um die neue Methode _toggleTagInSearch aufzurufen.
        // Beispiel (hypothetisch, in der Datei, die die Tag-Pillen erstellt):
        // pillElement.addEventListener('click', (e) => {
        //     tagCloudInstance._toggleTagInSearch(e.target.dataset.tag); // Annahme: Tag-Text ist in data-tag gespeichert
        //     e.stopPropagation(); // Verhindert, dass Klicks auf die Karte durchgehen
        // });
        tagCloudInstance._updateSectorsForDockState();

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
