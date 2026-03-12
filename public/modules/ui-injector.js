export function injectGlobalUI() {
    // --- WHITELIST MODAL INJECTION ---
    const wlModalHTML = `
    <div id="whitelist-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3300; display: none; width: 500px; max-width: 90vw;">
        <div class="modal-content" style="width: 100%; display: flex; flex-direction: column; background: var(--editor-bg); border: 1px solid var(--editor-border); box-shadow: 0 20px 50px rgba(0,0,0,0.8); backdrop-filter: none !important;">
            <h3 class="modal-drag-handle" style="display: flex; justify-content: space-between; align-items: center; cursor: move;">
                <span id="whitelist-modal-title">Edit Whitelist Entry</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span id="btn-toggle-wl-transparency" title="Toggle Transparency" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">👁️</span>
                    <span id="btn-close-whitelist-x" class="close-x" title="Close">✕</span>
                </div>
            </h3>
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <div>
                    <label style="font-size: 0.8em; opacity: 0.7; text-transform: uppercase;">Current Entries</label>
                    <div id="whitelist-chips" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; min-height: 40px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px solid #333;"></div>
                </div>

                <label style="font-size: 0.8em; opacity: 0.7; text-transform: uppercase;">Email / Pattern</label>
                <div style="position: relative; display: flex; align-items: center;">
                    <input type="text" id="whitelist-input" placeholder="e.g. *@gmail.com" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid #333; color: #fff; padding: 10px; padding-right: 40px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; outline: none;">
                    <button id="btn-save-whitelist" title="Add Entry" style="position: absolute; right: 5px; background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 30px; height: 30px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
                
                <div id="whitelist-warning" class="whitelist-warning-box">
                    <span style="font-size: 1.5em;">⚠️</span>
                    <span id="whitelist-warning-text"></span>
                </div>

                <div class="modal-actions" style="justify-content: flex-end; margin-top: 10px;">
                    <button id="btn-whitelist-done" style="border-color: #00ff00; color: #00ff00;">Done</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', wlModalHTML);

    // --- TAG RULES MODAL INJECTION ---
    const rulesModalHTML = `
    <div id="tag-rules-modal" class="modal-overlay" style="z-index: 3400;">
        <div class="modal-content" style="width: 1000px; max-width: 95vw; height: 80vh; display: flex; flex-direction: column; background: var(--editor-bg); border: 1px solid var(--editor-border); box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
            <h3 class="modal-drag-handle" style="display: flex; justify-content: space-between; align-items: center; cursor: move;" title="Move Tags from Tag Cloud to Hidden or Folder: Add a Rule">
                <span>(.*) Tag Rules (Regex)</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span id="btn-toggle-rules-transparency" title="Toggle Transparency" style="cursor: pointer; font-size: 1.2rem; opacity: 0.8;">👁️</span>
                    <span id="btn-close-rules-x" class="close-x" title="Close">✕</span>
                </div>
            </h3>
            
            <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                <!-- Column 1: Folder -->
                <div class="rules-column" style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Add a Rule: Add/Specify a RegEx">
                            <span>(.*) FOLDER RULES</span>
                            <button id="btn-add-folder-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                        </h4>
                        <div id="folder-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                    </div>

                    <div>
                        <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Collapse multiple tags to a single one: Add a Grouping">
                            <span>(.*) FOLDER GROUPING</span>
                            <button id="btn-add-folder-group-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                        </h4>
                        <div id="folder-group-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                    </div>
                </div>

                <!-- Column 2: Hidden -->
                <div class="rules-column" style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Add a Rule: Add/Specify a RegEx">
                            <span>(.*) HIDDEN RULES</span>
                            <button id="btn-add-hidden-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                        </h4>
                        <div id="hidden-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                    </div>

                    <div>
                        <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-size: 0.85em; text-transform: uppercase;" title="Collapse multiple tags to a single one: Add a Grouping">
                            <span>(.*) HIDDEN GROUPING</span>
                            <button id="btn-add-hidden-group-rule" style="background: var(--user-bg); color: #000; border: none; border-radius: 4px; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                        </h4>
                        <div id="hidden-group-rules-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                    </div>
                </div>
            </div>

            <div class="modal-actions" style="padding: 20px; border-top: 1px solid var(--editor-border); display: flex; justify-content: flex-end;">
                    <button id="btn-save-rules" style="background: rgba(255,255,255,0.1); color: var(--editor-text); border: 1px solid var(--editor-border); padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Save Rules</button>
            </div>
        </div>
    </div>`;
    
    const existingRulesModal = document.getElementById('tag-rules-modal');
    if (existingRulesModal) existingRulesModal.remove();
    document.body.insertAdjacentHTML('beforeend', rulesModalHTML);

    // --- CREATE FAB INJECTION ---
    const createFabHTML = `<div id="btn-create-card" class="fab-create" title="Create a Card">+</div>`;
    document.body.insertAdjacentHTML('beforeend', createFabHTML);

    initFabDragging();
}

function initFabDragging() {
    const fab = document.getElementById('btn-create-card');
    if (fab) {
        let isDragging = false;
        let hasMoved = false;
        let startX, startY, initialLeft, initialTop;

        fab.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only left click
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = fab.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            // Switch to absolute positioning based on current location
            fab.style.bottom = 'auto';
            fab.style.right = 'auto';
            fab.style.left = `${initialLeft}px`;
            fab.style.top = `${initialTop}px`;
            fab.style.transition = 'none'; // Disable transition for instant movement
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
            fab.style.left = `${initialLeft + dx}px`;
            fab.style.top = `${initialTop + dy}px`;
        }

        function onMouseUp() {
            if (!isDragging) return;
            isDragging = false;
            fab.style.transition = ''; // Restore transition
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Smart Anchoring
            const rect = fab.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;
            
            // Horizontal
            if (rect.left + (rect.width / 2) > winW / 2) {
                fab.style.left = 'auto';
                fab.style.right = `${winW - rect.right}px`;
            } else {
                fab.style.right = 'auto';
                fab.style.left = `${rect.left}px`;
            }
            
            // Vertical
            if (rect.top + (rect.height / 2) > winH / 2) {
                fab.style.top = 'auto';
                fab.style.bottom = `${winH - rect.bottom}px`;
            } else {
                fab.style.bottom = 'auto';
                fab.style.top = `${rect.top}px`;
            }

            if (hasMoved) {
                fab.dataset.justDragged = "true";
                setTimeout(() => delete fab.dataset.justDragged, 50);
            }
        }
    }
}