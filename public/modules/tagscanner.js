// c:\Users\druef\Documents\crudx-workbench\public\modules\tagscanner.js
import { applyLayout } from './layout-manager.js';
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
        tagCloudInstance.dockBottomRight();
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
