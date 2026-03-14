// modules/layout-manager.js
import { fetchRealData, resetPagination, setItemsPerPage } from './pagination.js';

export function initLayoutControls() {
    const gridSelect = document.getElementById('grid-select');
    if (gridSelect) {
        gridSelect.addEventListener('change', (e) => {
            applyLayout(e.target.value);
        });
    }
}

export function applyLayout(val, initialLoad = false, skipFetch = false) {
    const dataContainer = document.getElementById('data-container');
    if (!dataContainer) return;

    const gridSelect = document.getElementById('grid-select');
    if (gridSelect && gridSelect.value !== val) {
        gridSelect.value = val;
    }

    // Helper class on body for specific styling in 1x1 mode
    if (val === '1') document.body.classList.add('layout-grid-1');
    else document.body.classList.remove('layout-grid-1');

    dataContainer.classList.remove(
        'grid-1', 'grid-3', 'grid-4', 'grid-5', 'grid-7', 'grid-9', 'list',
        'density-compact', 'density-minimal', 'density-nano'
    );
    dataContainer.style = '';

    if (val === 'list') {
        setItemsPerPage(500);
        dataContainer.classList.add('list');
        const navi = document.querySelector('.navi-container');
        if (navi) navi.style.display = 'none';
    } else {
        const s = parseInt(val);
        setItemsPerPage(s * s);
        dataContainer.classList.add(`grid-${s}`);

        if (s >= 5) dataContainer.classList.add('density-compact');
        if (s >= 7) dataContainer.classList.add('density-minimal');
        if (s >= 9) dataContainer.classList.add('density-nano');

        const navi = document.querySelector('.navi-container');
        if (navi) navi.style.display = 'flex';
    }

    if (!initialLoad) {
        resetPagination();
    }
    if (!skipFetch) {
        fetchRealData();
    }
}