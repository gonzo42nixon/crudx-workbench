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

    // Helper to escape regex special characters
    _escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }
    /**
     * Toggles a tag in the main search input.
     *
     * Uses regex-based matching instead of string splitting so that tags whose
     * values contain spaces (system tags like "Size: Medium", "C: Today", …)
     * are detected and removed correctly.
     *
     * Detection order for removal:
     *   1. Operator-bounded: "… (&& | ||) tag:X …" or "tag:X (&& | ||) …"
     *   2. Space-bounded (non-expression mode):  "… tag:X" or "tag:X …"
     *   3. Exact / only term.
     */
    _toggleTagInSearch(tagText) {
        const searchInput = document.getElementById('main-search');
        if (!searchInput) return;

        const currentSearch = searchInput.value.trim();
        const fullTag = 'tag:' + tagText;

        // ---- NON-EXPRESSION MODE: single-tag behaviour ----
        // Expression=OFF → only one tag active at a time.
        // Clicking the active tag clears the search; clicking any other tag replaces it.
        if (!this.expressionMode) {
            searchInput.value = (currentSearch === fullTag) ? '' : fullTag;
            fetchRealData(true);
            return;
        }

        // ---- EXPRESSION MODE: toggle within a boolean expression ----
        const e = this._escapeRegExp(fullTag); // regex-safe version of fullTag

        // Presence check — fullTag as a complete token (surrounded by operator, space, or boundary)
        const presenceRegex = new RegExp(
            `(?:^|\\s*(?:\\|\\||&&)\\s*)${e}(?:\\s*(?:\\|\\||&&)\\s*|\\s+|$)`
        );

        if (presenceRegex.test(currentSearch)) {
            // ---- Remove the tag ----
            let s = currentSearch;
            // Case A: preceded by operator  (… && tag:X  or  … || tag:X)
            s = s.replace(new RegExp(`\\s*(?:\\|\\||&&)\\s*${e}(?=\\s*(?:\\|\\||&&)|\\s*$)`, 'g'), '');
            // Case B: followed by operator  (tag:X &&  or  tag:X ||)
            s = s.replace(new RegExp(`${e}\\s*(?:\\|\\||&&)\\s*`), '');
            // Case C: preceded by space (space-joined remnant)
            s = s.replace(new RegExp(`\\s+${e}(?=\\s|$)`, 'g'), '');
            // Case D: followed by space (first term)
            s = s.replace(new RegExp(`^${e}\\s+`), '');
            // Case E: only term
            s = s.replace(new RegExp(`^${e}$`), '');
            searchInput.value = s.trim();
        } else {
            // ---- Add the tag ----
            const sep = this.activeOp === 'AND' ? ' && ' : ' || ';
            searchInput.value = currentSearch ? (currentSearch + sep + fullTag) : fullTag;
        }

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
