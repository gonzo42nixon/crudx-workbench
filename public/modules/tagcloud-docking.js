import { applyLayout } from './layout-manager.js';
import { fetchRealData } from './pagination.js';

/**
 * Enthält Docking- und Größenänderungslogik für die TagCloud.
 * Diese Methoden werden dem TagCloud.prototype zugewiesen.
 */
export function installDockingMethods(TagCloud) {
    Object.assign(TagCloud.prototype, {
        _updateSectorsForDockState() {
            const folderSector = this.container.querySelector('.sector-folder');
            const hiddenSector = this.container.querySelector('.sector-hidden');
            const cloudSector = this.container.querySelector('.sector-cloud');

            if (this.dockState === 1) { // Left Docked
                folderSector.style.display = 'flex';
                hiddenSector.style.display = 'none';
                cloudSector.style.display = 'none';
            } else { // Floating, Center, Bottom-Right
                folderSector.style.display = 'flex';
                hiddenSector.style.display = 'flex';
                cloudSector.style.display = 'flex';
            }
        },

        _updateHeaderTooltip() {
            let tooltip = "";
            switch (this.dockState) {
                case 3: tooltip = "1/3 Bottom/Right - Tag Cloud - 50% x 50% y"; break;
                case 2: tooltip = "2/3 Center - Config - 85% x 85% y"; break;
                case 1: tooltip = "3/3 Top/Left - Folder - 20% x 100% y"; break;
                default: tooltip = "Floating - User Defined"; break;
            }
            if (this.header) this.header.title = tooltip;
        },

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
            this._updateMiniTermVisibility(); // Sync visibility

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
        },

        dockCenter() {
            this.container.classList.add('active');
            void this.container.offsetWidth;

            this._resetInlineStyles();
            this.container.classList.remove('docked', 'docked-left', 'docked-bottom-right', 'snapped-right');
            document.body.classList.remove('ftc-docked');
            this.container.classList.add('docked-center');

            this.container.style.width = '85vw';
            this.container.style.height = '85vh';
            this.container.style.maxWidth = '100vw';
            this.container.style.maxHeight = '100vh';
            this.container.style.top = '50%';
            this.container.style.left = '50%';
            this.container.style.transform = 'translate(-50%, -50%)';
            this.container.style.right = 'auto';
            this.container.style.bottom = 'auto';
            this.container.style.resize = 'both';
            this.container.style.position = 'fixed';
            this.dockState = 2;

            this._updateMiniTermVisibility(); // Sync visibility
            const gridSelect = document.getElementById('grid-select');
            if (gridSelect && gridSelect.value === '1') applyLayout('3');

            this._updateHeaderTooltip();
            this.refresh();
        },

        dockBottomRight() {
            this.container.classList.add('active');
            void this.container.offsetWidth;

            this._resetInlineStyles();
            this.container.classList.remove('docked', 'docked-left', 'docked-center', 'snapped-right');
            document.body.classList.remove('ftc-docked');
            this.container.classList.add('docked-bottom-right');

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
            this.container.style.position = 'fixed';
            this.dockState = 3;
            this._updateMiniTermVisibility(); // Sync visibility

            this._updateHeaderTooltip();
            this.refresh();
        },

        _resetInlineStyles() {
            Object.assign(this.container.style, {
                transform: '', top: '', left: '', bottom: '', right: '',
                width: '', height: '', minWidth: '', maxWidth: '', maxHeight: '', resize: ''
            });
        },

        _setupFloatingDrag() {
            let isDragging = false, hasMoved = false;
            const dragThreshold = 5;
            let startX, startY, offsetX, offsetY;

            this.header.addEventListener('mousedown', (e) => {
                if (e.target.closest('span')) return;
                e.preventDefault();
                isDragging = true;
                hasMoved = false;
                startX = e.clientX;
                startY = e.clientY;
                const rect = this.container.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                this.container.style.position = 'fixed';
                document.addEventListener('mousemove', this._onDragMouseMove);
                document.addEventListener('mouseup', this._onDragMouseUp);
            });

            this._onDragMouseMove = (e) => {
                if (!isDragging) return;
                if (e.buttons === 0) { this._onDragMouseUp(); return; }
                if (!hasMoved && (Math.abs(e.clientX - startX) > dragThreshold || Math.abs(e.clientY - startY) > dragThreshold)) {
                    hasMoved = true;
                    if (this.isMaximized) { this.isMaximized = false; this.container.style.resize = 'both'; }
                    if (this.dockState !== 0) {
                        this.dockState = 0; this._updateHeaderTooltip();
                        this.container.classList.remove('docked', 'docked-center', 'docked-bottom-right', 'snapped-right');
                        document.body.classList.remove('ftc-docked');
                        const rect = this.container.getBoundingClientRect();
                        Object.assign(this.container.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`, maxWidth: '100vw', maxHeight: '100vh', transform: '', bottom: 'auto', right: 'auto', resize: 'both', position: 'fixed' });
                        this._updateSectorsForDockState(); this._updateHeaderTooltip();
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
        },

        _setupCustomResize() {
            const leftHandle = document.createElement('div');
            leftHandle.className = 'resize-handle resize-handle-left';
            leftHandle.style.display = 'none';
            this.container.appendChild(leftHandle);

            const rightHandle = document.createElement('div');
            rightHandle.className = 'resize-handle resize-handle-right';
            rightHandle.style.display = 'none';
            this.container.appendChild(rightHandle);

            let isResizing = false;
            let startX, startWidth, startLeft;
            let activeHandle = null;

            const onMouseDown = (e, handle) => {
                e.preventDefault(); e.stopPropagation();
                isResizing = true; activeHandle = handle;
                startX = e.clientX;
                const rect = this.container.getBoundingClientRect();
                startWidth = rect.width; startLeft = rect.left;
                document.body.style.cursor = 'ew-resize';
                this.container.style.transition = 'none';
                document.addEventListener('mousemove', onMouseMove);
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
                isResizing = false; activeHandle = null;
                document.body.style.cursor = '';
                this.container.style.transition = '';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            const checkProximity = () => {
                if (this.dockState !== 0) { leftHandle.style.display = 'none'; rightHandle.style.display = 'none'; return; }
                leftHandle.style.display = 'block'; rightHandle.style.display = 'block';
            };

            const observer = new MutationObserver(checkProximity);
            observer.observe(this.container, { attributes: true, attributeFilter: ['style', 'class'] });
            window.addEventListener('resize', checkProximity);
            checkProximity();
        }
    });
}