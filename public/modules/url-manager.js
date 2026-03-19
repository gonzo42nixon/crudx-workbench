// modules/url-manager.js

export function updateUrlParams(currentPage, sortDirection) {
    const params = new URLSearchParams();
    
    if (currentPage > 1) params.set('page', currentPage);
    if (sortDirection !== 'asc') params.set('sort', sortDirection);
    
    const gridSelect = document.getElementById('grid-select');
    if (gridSelect && gridSelect.value !== '3') params.set('view', gridSelect.value);
    
    const searchInput = document.getElementById('main-search');
    if (searchInput && searchInput.value.trim()) params.set('search', searchInput.value.trim());
    
    const mineCheck = document.getElementById('filter-owner-only');
    if (mineCheck && mineCheck.checked) params.set('mine', 'true');

    // View mode: Execute is always explicit; Read is the default and omitted from the URL.
    const isExecute = document.body.classList.contains('ftc-docked') &&
                      !document.body.classList.contains('ftc-read-mode');
    if (isExecute) params.set('mode', 'execute');
    
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
}

export function getInitialStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const state = {
        sort: 'asc',
        view: '3'
    };
    
    const s = params.get('sort');
    if (s === 'asc' || s === 'desc') state.sort = s;

    const q = params.get('search');
    const searchInput = document.getElementById('main-search');
    if (q !== null && searchInput) searchInput.value = q;

    const m = params.get('mine');
    const mineCheck = document.getElementById('filter-owner-only');
    if (mineCheck) mineCheck.checked = (m === 'true');

    const v = params.get('view');
    if (v && ['1','3','5','7','9','list'].includes(v)) state.view = v;

    // View mode: 'execute' or 'read' (default)
    const mode = params.get('mode');
    state.viewMode = (mode === 'execute') ? 'execute' : 'read';

    return state;
}

/**
 * Syncs the current view mode (Read / Execute) to the URL so it can be shared.
 * Execute is always explicit (?mode=execute); Read is the default and is omitted.
 * This function can be imported by any module that changes the view mode.
 */
export function syncViewModeToUrl() {
    const params = new URLSearchParams(window.location.search);
    const isExecute = document.body.classList.contains('ftc-docked') &&
                      !document.body.classList.contains('ftc-read-mode');
    if (isExecute) {
        params.set('mode', 'execute');
    } else {
        params.delete('mode');
    }
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}
