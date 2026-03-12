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

    return state;
}