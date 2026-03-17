import { setupAuth } from './modules/auth-helper.js';
import { detectMimetype } from './modules/mime.js';
import { themeState, applyTheme, syncModalUI, initThemeEditor, initThemeControls } from './modules/theme.js';
import { db, auth } from './modules/firebase.js';
import { applyLayout, initLayoutControls } from './modules/layout-manager.js';
import { initPaginationControls, fetchRealData } from './modules/pagination.js';
import { renderDataFromDocs } from './modules/ui.js';
import { initTagCloud, refreshTagCloud, updateTagCloudSelection, locateDocumentInCloud, resetTagCloud } from './modules/tagscanner.js';
import { loadTagConfigFromUrl, getTagConfigForUrl, getTagRules, setTagRules } from './modules/tag-state.js';
import { initAuth } from './modules/auth.js';
import { encodeOCR, getEmailWarning, syntaxHighlight, buildFirestoreCreatePayload, isValidIsoDate, escapeHtml } from './modules/utils.js';
import { 
    collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, deleteDoc, doc, 
    writeBatch, updateDoc, setDoc, arrayUnion, getDoc, arrayRemove, where, increment, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { generateSecureAppBlob, createExecutionWindow } from './modules/launcher.js';
import { backupData, restoreData, deleteByTag, deleteAllDocuments } from './modules/admin.js';
import { initCardActions } from './modules/card-actions.js';
import { initMessageListeners } from './modules/message-manager.js';
import { injectGlobalUI } from './modules/ui-injector.js';
import { initEditor, openUpdateModal } from './modules/editor.js';
import { openTagModal } from './modules/tag-manager.js';

document.addEventListener("DOMContentLoaded", async () => {
    try {
        window.db = db; 
        window.auth = auth; // Damit die Konsole weiß, wer 'auth' ist

        let currentDocData = null; // Store for JSON Modal
        let iframeTransLevel = 0; // State for IFrame Transparency

        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, fn);
        };

        // --- INJECT UI ---
        injectGlobalUI();

        // --- INIT EDITOR ---
        initEditor();

        // --- SEARCH LISTENER ---
        const searchInput = document.getElementById('main-search');
        const clearBtn = document.getElementById('btn-clear-search');

        const toggleClearBtn = () => {
            if (clearBtn && searchInput) clearBtn.style.display = searchInput.value.trim() ? 'block' : 'none';
        };

        // Debounce timer shared between keydown and input handlers
        let searchDebounceTimer = null;

        bind('main-search', 'keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchDebounceTimer); // Cancel any pending debounce
                fetchRealData(true);
                updateTagCloudSelection();
            }
        });
        // Auto-trigger search 500 ms after the user stops typing (covers live edits like adding '!')
        bind('main-search', 'input', () => {
            toggleClearBtn();
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                fetchRealData(true);
                updateTagCloudSelection();
            }, 500);
        });

        bind('btn-clear-search', 'click', () => {
            if (searchInput) {
                searchInput.value = '';
                toggleClearBtn();
                searchInput.focus();
                fetchRealData(true);
                updateTagCloudSelection();
            }
        });

        // Initial check
        toggleClearBtn();
        
        // Safety check for IFrame/Pop-Out: Check URL params immediately
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('search') && searchInput) {
            searchInput.value = urlParams.get('search');
            toggleClearBtn();
        }

        // --- THEME INITIALIZATION ---
        // 1. Load initial fallback theme from theme.js
        themeState.currentActiveTheme = themeState.appConfig.startupTheme;
        applyTheme(themeState.currentActiveTheme);

        // 2. Real-time Theme Loader (System Theme + Dynamic override)
        (() => {
            const themeOverrideKey = urlParams.get('theme');
            const systemThemeKey = "CRUDX-CORE_-DATA_-THEME";

            const processThemeSnapshot = (snap, label, key) => {
                if (snap.exists()) {
                    const data = snap.data();
                    try {
                        const config = (data.value && typeof data.value === 'string' && data.value.includes('"themes"')) 
                            ? JSON.parse(data.value) 
                            : data;

                        if (config.themes && config.startupTheme) {
                            console.log(`🎨 ${label} [${key}] applied.`);
                            themeState.appConfig = config;
                            themeState.currentActiveTheme = config.startupTheme;
                            applyTheme(themeState.currentActiveTheme);
                            syncModalUI();
                        }
                    } catch (e) {
                        console.error(`Theme parse error for ${label} [${key}]:`, e);
                    }
                } else {
                    console.warn(`Theme document for ${label} [${key}] does not exist.`);
                }
            };

            // Always listen to the global system theme
            onSnapshot(doc(db, "kv-store", systemThemeKey), (snap) => {
                processThemeSnapshot(snap, "System Theme", systemThemeKey);
            }, (err) => {
                console.warn(`System Theme listener failed:`, err);
            });

            // Override if a specific theme key is provided in the URL (and it's not the system theme)
            if (themeOverrideKey && themeOverrideKey.startsWith('CRUDX-') && themeOverrideKey !== systemThemeKey) {
                onSnapshot(doc(db, "kv-store", themeOverrideKey), (snap) => {
                    processThemeSnapshot(snap, "Dynamic Override Theme", themeOverrideKey);
                }, (err) => {
                    console.warn(`Override Theme listener failed for [${themeOverrideKey}]:`, err);
                });
            }
        })();
        initThemeEditor();
        initThemeControls();

        // Auth initialisieren
        initAuth();

        // Cross-Window Messaging initialisieren
        initMessageListeners();

        // Tag Config aus URL laden
        loadTagConfigFromUrl();

        // Paginierung initialisieren
        initPaginationControls();

        // Layout Steuerung initialisieren
        initLayoutControls();

        // --- FAB-FUNKTIONEN (SHARE, FULLSCREEN, PRINT) ---
        bind('btn-share', 'click', () => {
            if (navigator.share) {
                navigator.share({ title: 'CRUDX Data View', url: window.location.href });
            } else {
                const shareUrl = `${window.location.href.split('?')[0]}?${new URLSearchParams(window.location.search).toString()}&tagConfig=${getTagConfigForUrl()}`;
                navigator.clipboard.writeText(shareUrl).then(() => {
                    alert("Link copied to clipboard!");
                });
            }
        });

        bind('btn-fullscreen', 'click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });

        bind('btn-print', 'click', () => window.print());

        // --- CONFLUENCE MODE TOGGLE ---
        // State machine:
        //   None (no ftc-docked)                → click → Execute (ftc-docked, no ftc-read-mode)
        //   Execute (ftc-docked, no read-mode)  → click → Read    (ftc-docked + ftc-read-mode)
        //   Read   (ftc-docked + read-mode)     → click → Execute (ftc-docked, no ftc-read-mode)
        // The tag cloud stays left-docked in both Read and Execute; only auto-launch is toggled.
        const updateConfluenceTooltip = () => {
            const btn     = document.getElementById('btn-toggle-confluence');
            const readBtn = document.getElementById('vmc-read');
            const execBtn = document.getElementById('vmc-execute');
            if (!btn) return;
            const isExecute = document.body.classList.contains('ftc-docked') &&
                              !document.body.classList.contains('ftc-read-mode');
            btn.title = isExecute ? 'View Mode: Execute' : 'View Mode: Read';
            // Highlight the active player button; dim the inactive one
            if (readBtn) readBtn.classList.toggle('vmc-active', !isExecute && document.body.classList.contains('ftc-docked'));
            if (execBtn) execBtn.classList.toggle('vmc-active', isExecute);
        };

        bind('btn-toggle-confluence', 'click', () => {
            const btn = document.getElementById('btn-toggle-confluence');
            if (btn && btn.dataset.justDragged === "true") return;

            const tc = initTagCloud(db);
            const isDocked   = document.body.classList.contains('ftc-docked');
            const isReadMode = document.body.classList.contains('ftc-read-mode');

            if (isDocked && !isReadMode) {
                // Execute → Read: tag cloud stays left, just suppress auto-launch
                document.body.classList.add('ftc-read-mode');
                fetchRealData(); // Re-render raw content (auto-launch observer skips ftc-read-mode)
            } else if (isDocked && isReadMode) {
                // Read → Execute: re-enable auto-launch, re-render
                document.body.classList.remove('ftc-read-mode');
                fetchRealData();
            } else {
                // None → Execute: dock left, enforce 1x1, activate Confluence
                document.body.classList.remove('no-app-view');
                document.body.classList.remove('ftc-read-mode');
                tc.dockLeft();
            }
            updateConfluenceTooltip();
        });
        // Set initial tooltip
        updateConfluenceTooltip();

        // --- CRUDX WEBHOOK BUTTONS & PILLS ---
        const dataContainer = document.getElementById('data-container');
        if (dataContainer) {
            initCardActions(dataContainer, openUpdateModal, openTagModal);

            // --- CARD TAG CLICK → TAG CLOUD ---
            // Clicking a pill-user or pill-mime tag on a card opens the Tag Cloud
            // and activates the same filter as if the tag had been clicked inside the cloud.
            dataContainer.addEventListener('click', (e) => {
                const pill = e.target.closest('[data-tag-name]');
                if (!pill) return;
                // Only handle plain user tags and mime tags; ignore folder-summary pills
                if (pill.classList.contains('summary-pill')) return;
                if (!pill.classList.contains('pill-user') && !pill.classList.contains('pill-mime')) return;

                const tagName = pill.dataset.tagName;
                if (!tagName) return;

                e.stopPropagation(); // Don't bubble to card-action handlers

                const tc = initTagCloud(db);
                // Open the Tag Cloud if it is not already visible
                const cloudContainer = document.getElementById('tag-cloud-container');
                if (cloudContainer && !cloudContainer.classList.contains('active')) {
                    refreshTagCloud(true);
                }
                // Toggle the tag in the search bar (same logic as clicking inside the cloud)
                tc._toggleTagInSearch(tagName);
                updateTagCloudSelection();
            });
        }

        // Listener to close tag dropdown on outside click
        document.addEventListener('click', (e) => {
            const existingDropdown = document.querySelector('.tag-dropdown-menu');
            if (!existingDropdown) return;

            // Check if the click was on a summary pill (which would open a new one)
            const isSummaryPill = e.target.closest('.summary-pill');
            
            // Close if the click is outside the dropdown AND not on a summary pill
            if (!existingDropdown.contains(e.target) && !isSummaryPill) {
                existingDropdown.remove();
            }
        });

        // --- NAVIGATION (BURGER, DRAWER) ---
        bind('btn-burger', 'click', () => document.getElementById('drawer').classList.toggle('open'));
        bind('btn-close-drawer', 'click', () => document.getElementById('drawer').classList.remove('open'));

        // Listener für den Tag Cloud Button (jetzt im Header)
        bind('btn-show-tag-cloud', 'click', () => {
            const container = document.getElementById('tag-cloud-container');
            // Toggle Logic: Close if active, Open/Refresh if inactive
            if (container && container.classList.contains('active')) {
                const closeBtn = document.getElementById('btn-close-tag-cloud');
                if (closeBtn) closeBtn.click(); // Use internal close logic to reset state
            } else {
                refreshTagCloud(true); // Pass true to force refresh
            }
        });

        // --- THEME MODAL (verschiebbar + schließen bei Klick außen) ---
        const themeModal = document.getElementById('theme-modal');
        const modalContent = document.querySelector('.modal-content');
        const modalTitle = modalContent?.querySelector('h3');

        let isDragging = false;
        let startX, startY, startTranslateX, startTranslateY;
        let currentTranslateX = 0, currentTranslateY = 0;

        function getTranslateValues() {
            const style = window.getComputedStyle(modalContent);
            const transform = style.transform;
            if (transform && transform !== 'none') {
                const matrix = transform.match(/matrix.*\((.+)\)/);
                if (matrix) {
                    const values = matrix[1].split(', ');
                    if (values.length === 6) {
                        return { x: parseFloat(values[4]), y: parseFloat(values[5]) };
                    }
                }
            }
            return { x: 0, y: 0 };
        }

        if (modalTitle) {
            modalTitle.classList.add('modal-drag-handle');
            modalTitle.style.cursor = 'move';

            modalTitle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                const translate = getTranslateValues();
                startTranslateX = translate.x;
                startTranslateY = translate.y;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        function onMouseMove(e) {
            if (!isDragging) return;
            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            currentTranslateX = startTranslateX + dx;
            currentTranslateY = startTranslateY + dy;

            modalContent.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
        }

        function onMouseUp() {
            if (isDragging) {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        }

        themeModal.addEventListener('click', (e) => {
            if (e.target === themeModal) {
                themeModal.classList.remove('active');
                modalContent.style.transform = 'translate(-50%, -50%)';
                currentTranslateX = 0;
                currentTranslateY = 0;
            }
        });

        bind('btn-close-modal', 'click', () => {
            themeModal.classList.remove('active');
            modalContent.style.transform = 'translate(-50%, -50%)';
            currentTranslateX = 0;
            currentTranslateY = 0;
        });

        // --- IFRAME MODAL ---
        bind('btn-close-iframe', 'click', () => {
            const iframeModal = document.getElementById('iframe-modal');
            const iframe = document.getElementById('doc-frame');
            if (iframeModal) iframeModal.classList.remove('active');
            if (iframe) iframe.src = 'about:blank';
        });

        // --- INTEGRATED TAG TOGGLE ---
        bind('btn-toggle-tags-overlay', 'click', () => {
            const overlay = document.getElementById('update-modal-tag-editor');
            const btn = document.getElementById('btn-toggle-tags-overlay');
            const editor = document.getElementById('update-editor');
            if (!overlay || !btn) return;

            // Wenn es gerade fadet oder unsichtbar ist -> Sofort anzeigen
            if (overlay.style.display === 'none' || overlay.style.opacity === '0') {
                overlay.style.display = 'flex';
                overlay.style.opacity = '1';
                btn.style.transition = 'none'; // Snappy feedback
                btn.style.backgroundColor = 'var(--user-bg)';
                btn.style.color = 'var(--user-text)';
                if (editor) { editor.style.paddingTop = '50px'; editor.style.paddingBottom = '50px'; }
            } else {
                overlay.style.display = 'none';
                overlay.style.opacity = '0';
                btn.style.backgroundColor = '';
                btn.style.color = '';
                if (editor) { editor.style.paddingTop = '15px'; editor.style.paddingBottom = '15px'; }
            }
        });

        // IFrame Transparency Toggle
        bind('btn-toggle-iframe-transparency', 'click', () => {
            iframeTransLevel = (iframeTransLevel + 1) % 3;
            const content = document.querySelector('#iframe-modal .modal-content');
            const btn = document.getElementById('btn-toggle-iframe-transparency');
            
            content.classList.remove('iframe-trans-1', 'iframe-trans-2');
            
            if (iframeTransLevel === 1) {
                content.classList.add('iframe-trans-1');
                btn.style.opacity = "1";
            } else if (iframeTransLevel === 2) {
                content.classList.add('iframe-trans-2');
                btn.style.opacity = "0.5";
            } else {
                btn.style.opacity = "0.8";
            }
        });

        // --- EXPORT MODAL ---
        bind('btn-close-export', 'click', () => {
            document.getElementById('export-modal').classList.remove('active');
        });

        bind('btn-copy-buffer', 'click', () => {
            const content = document.getElementById('export-area').value;
            navigator.clipboard.writeText(content).then(() => {
                const btn = document.getElementById('btn-copy-buffer');
                btn.textContent = "✅ Copied!";
                setTimeout(() => btn.textContent = "📋 Copy to Clipboard", 2000);
            });
        });

        bind('btn-save-json', 'click', () => {
            const content = document.getElementById('export-area').value;
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `crudx-theme-${themeState.currentActiveTheme}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // --- DATA ACTIONS ---
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

        // Backup Tool (Available in Production & Dev)
        bind('btn-backup', 'click', () => backupData('btn-backup'));
        // Restore Tool (Available in Production & Dev)
        bind('btn-restore', 'click', restoreData);


        // JSON Modal Close
        bind('btn-close-json', 'click', () => {
            document.getElementById('json-modal').classList.remove('active');
            currentDocData = null;
        });

        // JSON Modal Forward Button
        bind('btn-forward-json', 'click', async () => {
            if (!currentDocData) return;
            const btn = document.getElementById('btn-forward-json');
            const originalText = btn.textContent;
            btn.textContent = "Sending...";
            try {
                await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(currentDocData)
                });
                btn.textContent = "✅ Sent!";
                setTimeout(() => btn.textContent = originalText, 2000);
            } catch (e) {
                alert("Error sending data: " + e.message);
                btn.textContent = "❌ Error";
                setTimeout(() => btn.textContent = originalText, 2000);
            }
        });

        // Delete by Tag Tool (Available in Production & Dev)
        bind('btn-delete-by-tag', 'click', deleteByTag);


        if (isLocal) {
            console.log("🛠️ Dev-Mode detected: Binding Injection Buttons...");
            
            bind('btn-inject', 'click', () => {
                console.log("🚀 Inject Test Data clicked");
                import(`./seed.js?t=${Date.now()}`).then(m => m.seedData(db)).catch(err => console.error("Import failed:", err));
            });

            bind('btn-inject-core', 'click', () => {
                console.log("🧬 Inject Core Data clicked");
                import(`./seed.js?t=${Date.now()}`).then(m => m.seedCoreData(db)).catch(err => console.error("Import failed:", err));
            });

            bind('btn-delete', 'click', deleteAllDocuments);
        } else {
            ['btn-inject', 'btn-inject-core', 'btn-delete'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        // Global ESC Key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                const isConfluenceMode = document.body.classList.contains('ftc-docked') && 
                                         document.body.classList.contains('layout-grid-1');
                if (isConfluenceMode) {
                    e.preventDefault();
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(err => console.log(err));
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen();
                    }
                }
            }

            if (e.key === 'Escape') {
                if (themeModal && themeModal.classList.contains('active')) themeModal.classList.remove('active');
                if (document.getElementById('json-modal').classList.contains('active')) document.getElementById('json-modal').classList.remove('active');
                
                const iframeModal = document.getElementById('iframe-modal');
                if (iframeModal && iframeModal.classList.contains('active')) {
                    iframeModal.classList.remove('active');
                    const iframe = document.getElementById('doc-frame');
                    if (iframe) iframe.src = 'about:blank';
                }
            }
        });

        // Initialisiert die Floating Tag Cloud
        initTagCloud(db);

        // --- Z-INDEX MANAGER: Click-to-bring-to-front ---
        // Floating panels (.floating-modal, #mini-term-editor) share a dynamic z-index
        // pool between 2500–2990, well below modal overlays (3000+).
        // Clicking any panel promotes it to the current maximum so it appears on top.
        (() => {
            // Panels that participate in the bring-to-front pool.
            // Selector matches any .floating-modal or the mini search-term editor.
            const PANEL_SELECTOR = '.floating-modal, #mini-term-editor';
            const Z_BASE  = 2500;   // matches the CSS default of .floating-modal
            const Z_CAP   = 2990;   // hard ceiling – never overlap modal-overlays (3000+)

            let topZ = Z_BASE;

            /**
             * Returns the "root panel" element (the direct participant) for a click target,
             * or null if the click did not land inside a managed floating panel.
             */
            const getPanel = (target) => target.closest(PANEL_SELECTOR);

            document.addEventListener('mousedown', (e) => {
                const panel = getPanel(e.target);
                if (!panel) return;

                // Don't re-apply if this panel is already on top
                const current = parseInt(panel.style.zIndex, 10) || Z_BASE;
                if (current >= topZ) return;

                topZ = Math.min(topZ + 1, Z_CAP);
                panel.style.zIndex = topZ;

                // If the cap is hit, re-normalise: reset all panels to consecutive
                // values starting at Z_BASE so topZ never drifts out of range.
                if (topZ >= Z_CAP) {
                    const panels = [...document.querySelectorAll(PANEL_SELECTOR)]
                        .filter(p => p.style.zIndex)
                        .sort((a, b) => (parseInt(a.style.zIndex) || Z_BASE) - (parseInt(b.style.zIndex) || Z_BASE));
                    panels.forEach((p, i) => { p.style.zIndex = Z_BASE + i; });
                    topZ = Z_BASE + panels.length - 1;
                }
            }, true /* capture — fires before drag handlers and internal listeners */);
        })();

        // --- TAG CLOUD BUTTON STATE (icon + tooltip reflect active/inactive) ---
        // Uses a MutationObserver on the container's class list so every open/close
        // path (header button, card tag click, docking methods, close-X) is covered.
        (() => {
            const cloudContainer = document.getElementById('tag-cloud-container');
            const updateCloudBtn = () => {
                const btn = document.getElementById('btn-show-tag-cloud');
                if (!btn || !cloudContainer) return;
                const isActive = cloudContainer.classList.contains('active');
                btn.textContent = isActive ? '🏷️' : '☁️';
                btn.title = isActive ? 'Tag Cloud: Active (click to close)' : 'Tag Cloud: Inactive (click to open)';
            };
            if (cloudContainer) {
                new MutationObserver(updateCloudBtn).observe(cloudContainer, {
                    attributes: true, attributeFilter: ['class']
                });
                updateCloudBtn(); // Set initial state
            }
        })();

        // --- AUTO-LAUNCHER FOR CONFLUENCE MODE (1x1) ---
        // Watches the grid and automatically upgrades Markdown cards to Secure Apps
        const gridObserver = new MutationObserver(async (mutations) => {
            const gridSelect = document.getElementById('grid-select');
            const isConfluenceMode = document.body.classList.contains('ftc-docked') &&
                                     !document.body.classList.contains('ftc-read-mode');
            // Only active in 1x1 mode AND Execute mode is active (not suppressed by Read mode)
            if (gridSelect && gridSelect.value === '1' && isConfluenceMode) {
                // Find the first Markdown card that needs an upgrade
                const card = Array.from(document.querySelectorAll('.card-kv')).find(c => 
                    c.dataset.mime === 'MD' && (c.dataset.appLoaded !== "true" || c.dataset.loadedKey !== c.querySelector('.pill-key')?.textContent.trim())
                );

                if (!card) return;

                const currentKey = card.querySelector('.pill-key')?.textContent.trim();
                const valueLayer = card.querySelector('.value-layer');
                
                if (!card.dataset.doc) return;

                card.dataset.appLoaded = "true"; 
                card.dataset.loadedKey = currentKey;

                if (currentKey) {
                    try {
                        const docData = JSON.parse(card.dataset.doc);
                        const isEmulator = ['localhost', '127.0.0.1'].includes(window.location.hostname);

                        if (!isEmulator) {
                            // PRODUKTION: Webhook URL für Auto-Launch (X)
                            const tags = docData.user_tags || [];
                            const appTag = tags.find(t => t.startsWith('x:'));
                            let appKey = appTag ? appTag.substring(2) : (tags.includes('app') ? currentKey : "CRUDX-CORE_-_APP_-MARKD");
                            
                            const params = new URLSearchParams();
                            params.append("action", "X");
                            params.append("key", currentKey);
                            params.set("app", appKey);
                            if (tags.includes("data") || card.dataset.mime === 'MD') params.set("data", currentKey);

                            tags.forEach(t => {
                                if (t.startsWith("s:")) params.set("settings", t.substring(2));
                                if (t.startsWith("d1:")) params.set("data-1", t.substring(3));
                                if (t.startsWith("d2:")) params.set("data-2", t.substring(3));
                                if (t.startsWith("d3:")) params.set("data-3", t.substring(3));
                            });

                            const targetUrl = `https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977?${params.toString()}`;
                            if (valueLayer) {
                                valueLayer.innerHTML = `<iframe src="${targetUrl}" style="width:100%; height:100%; border:none; display:block; background:var(--canvas-bg);"></iframe>`;
                                console.log(`✅ Confluence Mode: Upgraded to ${currentKey} via Webhook`);
                            }
                        } else {
                            // EMULATOR: Client-side Blob (SDK)
                            const { blob } = await generateSecureAppBlob(currentKey, docData) || {};
                            if (blob) {
                                const blobUrl = URL.createObjectURL(blob);
                                if (valueLayer) {
                                    const newIframe = document.createElement('iframe');
                                    newIframe.src = blobUrl;
                                    newIframe.style.cssText = "width:100%; height:100%; border:none; display:block;";
                                    valueLayer.innerHTML = '';
                                    valueLayer.appendChild(newIframe);
                                    console.log(`✅ Confluence Mode: Upgraded to ${currentKey} (Blob)`);
                                }
                            }
                        }
                    } catch(e) { console.error("Auto-Launch failed", e); }
                }
            }
        });
        gridObserver.observe(document.getElementById('data-container'), { childList: true, subtree: true });
    } catch (e) { console.error("🔥 FATAL:", e); }
});