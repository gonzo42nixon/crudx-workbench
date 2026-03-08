// modules/pagination.js
import { db, auth } from './firebase.js';
import { collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { renderDataFromDocs } from './ui.js';
import { detectMimetype } from './mime.js';

// ---------- Zustand ----------
export let currentPage = 1;

export function getAccessTokens(email) {
    if (!email) return [];
    const [local, domain] = email.split('@');
    return [
        email,
        `*@${domain}`,
        `${local}@*`,
        `*@*`
    ];
}

export let itemsPerPage = 9;
export let pageCursors = [];
export let sortDirection = 'asc';
let currentUnsubscribe = null;

// ---------- URL State Management ----------
export function updateUrlParams() {
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

export function loadStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    
    const s = params.get('sort');
    if (s === 'asc' || s === 'desc') sortDirection = s;
    const btnOrder = document.getElementById('btn-order');
    if (btnOrder) btnOrder.textContent = sortDirection === 'asc' ? '↑' : '↓';

    const q = params.get('search');
    const searchInput = document.getElementById('main-search');
    if (q !== null && searchInput) searchInput.value = q;

    const m = params.get('mine');
    const mineCheck = document.getElementById('filter-owner-only');
    if (mineCheck) mineCheck.checked = (m === 'true');

    const v = params.get('view');
    return (v && ['1','3','5','7','9','list'].includes(v)) ? v : '3';
}

// ---------- Layout anwenden ----------
export function applyLayout(val, initialLoad = false) {
    const dataContainer = document.getElementById('data-container');
    if (!dataContainer) return;

    // FIX: Ensure the dropdown reflects the actual layout state
    const gridSelect = document.getElementById('grid-select');
    if (gridSelect && gridSelect.value !== val) {
        gridSelect.value = val;
    }

    // Helper class on body for specific styling in 1x1 mode (e.g. Confluence Look)
    if (val === '1') document.body.classList.add('layout-grid-1');
    else document.body.classList.remove('layout-grid-1');

    dataContainer.classList.remove(
        'grid-1', 'grid-3', 'grid-4', 'grid-5', 'grid-7', 'grid-9', 'list',
        'density-compact', 'density-minimal', 'density-nano'
    );
    dataContainer.style = '';

    if (val === 'list') {
        itemsPerPage = 500;
        dataContainer.classList.add('list');
        const navi = document.querySelector('.navi-container');
        if (navi) navi.style.display = 'none';
        console.log("🚀 List mode activated.");
    } else {
        const s = parseInt(val);
        itemsPerPage = s * s;
        dataContainer.classList.add(`grid-${s}`);

        if (s >= 5) dataContainer.classList.add('density-compact');
        if (s >= 7) dataContainer.classList.add('density-minimal');
        if (s >= 9) dataContainer.classList.add('density-nano');

        const navi = document.querySelector('.navi-container');
        if (navi) navi.style.display = 'flex';
        console.log(`Square mode: ${s}x${s} grid activated.`);
    }

    if (!initialLoad) {
        currentPage = 1;
        pageCursors = [];
    }
    fetchRealData();
}

// ---------- Daten laden (aktuelle Seite) ----------
export async function fetchRealData(resetPage = false) {
    const container = document.getElementById('data-container');
    if (!container) return;
    const colRef = collection(db, "kv-store");
    const user = auth.currentUser;
    const filterOwnerOnly = document.getElementById('filter-owner-only')?.checked;
    const searchTerm = document.getElementById('main-search')?.value.trim();
    const isTagSearch = searchTerm && searchTerm.startsWith('tag:');
    const isMimeSearch = searchTerm && searchTerm.startsWith('mime:');
    const needsClientSideFiltering = (user && !filterOwnerOnly && isTagSearch) || isMimeSearch;

    if (resetPage) {
        currentPage = 1;
        pageCursors = [];
    }

    const clearBtn = document.getElementById('btn-clear-search');
    if (clearBtn) clearBtn.style.display = searchTerm ? 'block' : 'none';

    // URL Update bei jedem Fetch
    updateUrlParams();

    try {
        let countQuery = colRef;
        let mineCount = 0;

        if (user) {
            if (filterOwnerOnly) {
                countQuery = query(colRef, where("owner", "==", user.email));
            } else {
                const tokens = getAccessTokens(user.email);
                countQuery = query(colRef, where("access_control", "array-contains-any", tokens));
                // Wenn wir alle sehen, brauchen wir eine extra Abfrage für den "Mine"-Zähler
                const mineQuery = query(colRef, where("owner", "==", user.email));
                const mineSnap = await getCountFromServer(mineQuery);
                mineCount = mineSnap.data().count;
            }
        }
        const totalSnap = await getCountFromServer(countQuery);
        const totalCount = totalSnap.data().count;

        if (user && filterOwnerOnly) {
            mineCount = totalCount;
        }

        const mineCountEl = document.getElementById('mine-count');
        if (mineCountEl) {
            if (user && mineCount > 0) {
                mineCountEl.textContent = `(${mineCount})`;
                mineCountEl.title = "Number of documents owned by you";
                mineCountEl.style.fontWeight = 'bold';
                mineCountEl.style.color = filterOwnerOnly ? '#00ff00' : '#ffd700';
                mineCountEl.style.opacity = '1';
            } else {
                mineCountEl.textContent = '';
            }
        }

        // Checkbox deaktivieren, wenn keine eigenen Dokumente vorhanden sind
        const filterOwnerCheckbox = document.getElementById('filter-owner-only');
        if (filterOwnerCheckbox) {
            if (user && mineCount > 0) {
                filterOwnerCheckbox.disabled = false;
                filterOwnerCheckbox.parentElement.style.opacity = '1';
                filterOwnerCheckbox.parentElement.style.cursor = 'pointer';
            } else {
                if (filterOwnerCheckbox.checked) {
                    filterOwnerCheckbox.checked = false;
                    fetchRealData(); // Reload mit "Alle"
                    return;
                }
                filterOwnerCheckbox.disabled = true;
                filterOwnerCheckbox.parentElement.style.opacity = '0.5';
                filterOwnerCheckbox.parentElement.style.cursor = 'not-allowed';
            }
        }

        let filteredCount = totalCount;
        
        // Calculate correct filtered count for server-side searches
        if (searchTerm && !needsClientSideFiltering) {
            let searchQuery = countQuery;
            if (searchTerm.startsWith('tag:')) {
                searchQuery = query(searchQuery, where("user_tags", "array-contains", searchTerm.substring(4)));
            } else if (searchTerm.startsWith('owner:')) {
                searchQuery = query(searchQuery, where("owner", "==", searchTerm.substring(6)));
            } else {
                searchQuery = query(searchQuery, where("__name__", "==", searchTerm));
            }
            const searchSnap = await getCountFromServer(searchQuery);
            filteredCount = searchSnap.data().count;
        }

        const gridValue = document.getElementById('grid-select')?.value || "3";
        let currentLimit, totalPages;

        if (gridValue === 'list') {
            currentLimit = 500;
            totalPages = 1;
            currentPage = 1;
        } else {
            const n = parseInt(gridValue);
            currentLimit = n * n;
            totalPages = Math.max(1, Math.ceil(filteredCount / currentLimit));
        }

        document.getElementById('total-count') && (document.getElementById('total-count').textContent = totalCount);
        document.getElementById('current-page') && (document.getElementById('current-page').textContent = currentPage);

        if (needsClientSideFiltering) {
            document.getElementById('result-count') && (document.getElementById('result-count').textContent = "...");
            document.getElementById('total-pages') && (document.getElementById('total-pages').textContent = "...");
        } else {
            document.getElementById('result-count') && (document.getElementById('result-count').textContent = filteredCount);
            document.getElementById('total-pages') && (document.getElementById('total-pages').textContent = totalPages);
        }

        let constraints = [];
        if (user) {
            if (filterOwnerOnly) {
                constraints.push(where("owner", "==", user.email));
            } else {
                const tokens = getAccessTokens(user.email);
                // FIX: Firestore erlaubt nur ein "array-contains" pro Query.
                // Wenn wir nach Tags suchen, müssen wir die Access-Control client-seitig filtern.
                if (!isTagSearch) {
                    constraints.push(where("access_control", "array-contains-any", tokens));
                }
            }
        }
        
        if (searchTerm) {
            if (searchTerm.startsWith('tag:')) {
                const tag = searchTerm.substring(4);
                constraints.push(where("user_tags", "array-contains", tag));
            } else if (searchTerm.startsWith('mime:')) {
                // Client-side filtering only, no server constraint
            } else if (searchTerm.startsWith('owner:')) {
                const owner = searchTerm.substring(6);
                constraints.push(where("owner", "==", owner));
            } else {
                constraints.push(where("__name__", "==", searchTerm));
            }
        } else {
            constraints.push(orderBy("label", sortDirection));
        }

        // FIX: Bei Tag-Suche mit Client-Filterung KEIN Datenbank-Limit setzen,
        // damit wir erst filtern und dann paginieren können.
        if (!needsClientSideFiltering) {
            if (currentPage > 1 && pageCursors[currentPage - 2]) {
                constraints.push(startAfter(pageCursors[currentPage - 2]));
            }
            constraints.push(limit(currentLimit));
        }
        const q = query(colRef, ...constraints);

        // Realtime Listener statt einmaligem Fetch
        if (currentUnsubscribe) currentUnsubscribe();

        currentUnsubscribe = onSnapshot(q, async (snap) => {
            let docs = snap.docs;

            if (needsClientSideFiltering) {
                const tokens = getAccessTokens(user.email);
                docs = docs.filter(doc => {
                    const d = doc.data();
                    
                    // 1. Access Control Check (if user exists)
                    if (user) {
                        const ac = d.access_control || [];
                        if (!ac.some(t => tokens.includes(t))) return false;
                    }

                    // 2. Mime Type Check
                    if (isMimeSearch) {
                        const mimeType = searchTerm.substring(5);
                        if (detectMimetype(d.value).type !== mimeType) return false;
                    }

                    return true;
                });

                // Update Result Count & Pages based on filtered set
                const filteredTotal = docs.length;
                const resultCountEl = document.getElementById('result-count');
                if (resultCountEl) resultCountEl.textContent = filteredTotal;
                
                totalPages = Math.max(1, Math.ceil(filteredTotal / currentLimit));
                const totalPagesEl = document.getElementById('total-pages');
                if (totalPagesEl) totalPagesEl.textContent = totalPages;

                // Client-Side Pagination
                const startIndex = (currentPage - 1) * currentLimit;
                const endIndex = startIndex + currentLimit;
                docs = docs.slice(startIndex, endIndex);
            }

            if (docs.length === 0) {
                container.innerHTML = `<div class="pill pill-sys" style="margin:20px;">No documents.</div>`;
            } else {
                // Cursor muss auf dem originalen Snapshot basieren für korrekte Paginierung
                pageCursors[currentPage - 1] = snap.docs[snap.docs.length - 1];
                await renderDataFromDocs(docs, container);
            }

            // Buttons deaktivieren / aktivieren
            const btnFirst = document.getElementById('btn-first');
            const btnPrev = document.getElementById('btn-prev');
            const btnNext = document.getElementById('btn-next');
            const btnLast = document.getElementById('btn-last');
            const isAtStart = currentPage <= 1;
            btnFirst?.classList.toggle('btn-disabled', isAtStart);
            btnPrev?.classList.toggle('btn-disabled', isAtStart);
            const isAtEnd = currentPage >= totalPages || gridValue === 'list';
            btnNext?.classList.toggle('btn-disabled', isAtEnd);
            btnLast?.classList.toggle('btn-disabled', isAtEnd);

            const btnOrder = document.getElementById('btn-order');
            if (btnOrder) {
                btnOrder.title = `Current: ${sortDirection === 'asc' ? 'A-Z' : 'Z-A'}. Click to flip.`;
            }
        }, (err) => {
            console.error("🔥 Error in fetchRealData (Snapshot):", err);
            container.innerHTML = `<div class="pill pill-sys">Error: ${err.message}</div>`;
        });

    } catch (err) {
        console.error("🔥 Error in fetchRealData:", err);
        if (err.message.includes("requires an index")) {
            const link = err.message.match(/https:\/\/[^\s]+/)?.[0];
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--sys-bg);">
                    <h3>⚠️ Missing Index</h3>
                    <p>Firestore requires a composite index for this query.</p>
                    <a href="${link}" target="_blank" style="color: var(--user-bg); text-decoration: underline; font-weight: bold; cursor: pointer;">👉 Click here to create it</a>
                </div>`;
        } else {
            container.innerHTML = `<div class="pill pill-sys">Error: ${err.message}</div>`;
        }
    }
}

// ---------- Letzte Seite laden ----------
export async function fetchLastPageData() {
    const container = document.getElementById('data-container');
    if (!container) return;
    const colRef = collection(db, "kv-store");
    const user = auth.currentUser;
    const filterOwnerOnly = document.getElementById('filter-owner-only')?.checked;

    try {
        let countQuery = colRef;
        if (user) {
            if (filterOwnerOnly) {
                countQuery = query(colRef, where("owner", "==", user.email));
            } else {
                const tokens = getAccessTokens(user.email);
                countQuery = query(colRef, where("access_control", "array-contains-any", tokens));
            }
        }
        const totalSnap = await getCountFromServer(countQuery);
        const totalCount = totalSnap.data().count;
        const gridValue = document.getElementById('grid-select')?.value || "3";
        const itemsOnPage = (gridValue === 'list') ? 500 : (parseInt(gridValue) * parseInt(gridValue));
        const lastPage = Math.max(1, Math.ceil(totalCount / itemsOnPage));
        currentPage = lastPage;
        const remainder = totalCount % itemsOnPage || itemsOnPage;

        // Lade ALLE Dokumente (Achtung: nur bei überschaubaren Datenmengen)
        // Alternativ könnte man seitenweise laden, aber für die Demo reicht das
        let allDocsConstraints = [];
        if (user) {
            if (filterOwnerOnly) {
                allDocsConstraints.push(where("owner", "==", user.email));
            } else {
                const tokens = getAccessTokens(user.email);
                allDocsConstraints.push(where("access_control", "array-contains-any", tokens));
            }
        }
        allDocsConstraints.push(orderBy("label", sortDirection));
        const allDocsQuery = query(colRef, ...allDocsConstraints);
        const allSnap = await getDocs(allDocsQuery);
        const allDocs = allSnap.docs;

        // Cursor für jede Seite berechnen
        pageCursors = [];
        for (let i = 1; i < lastPage; i++) {
            const lastDocIndex = i * itemsOnPage - 1;
            if (lastDocIndex < allDocs.length) {
                pageCursors[i - 1] = allDocs[lastDocIndex];
            }
        }
        // Cursor für die letzte Seite
        if (allDocs.length > 0) {
            pageCursors[lastPage - 1] = allDocs[allDocs.length - 1];
        }

        // Statt manuell zu rendern, rufen wir fetchRealData auf.
        // Das aktiviert den onSnapshot-Listener auch für die letzte Seite!
        fetchRealData();
        
    } catch (err) {
        console.error("🔥 Error fetching last page:", err);
    }
}

// ---------- Paginierungs-Listener initialisieren ----------
export function initPaginationControls() {
    // Order-Button
    const btnOrder = document.getElementById('btn-order');
    if (btnOrder) {
        btnOrder.textContent = '↑';
        btnOrder.title = 'Ascending (A–Z). Click for descending (Z–A)';
        btnOrder.addEventListener('click', () => {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            btnOrder.textContent = sortDirection === 'asc' ? '↑' : '↓';
            fetchRealData(true);
        });
    }

    // Grid-Auswahl
    const gridSelect = document.getElementById('grid-select');
    if (gridSelect) {
        gridSelect.addEventListener('change', (e) => {
            applyLayout(e.target.value);
        });
    }

    // Owner-Only Filter Toggle
    const filterOwner = document.getElementById('filter-owner-only');
    if (filterOwner) {
        filterOwner.addEventListener('change', () => {
            fetchRealData(true);
        });
    }

    // Erste Seite
    document.getElementById('btn-first')?.addEventListener('click', () => {
        if (currentPage === 1) return;
        fetchRealData(true);
    });

    // Vorherige Seite
    document.getElementById('btn-prev')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchRealData();
        }
    });

    // Nächste Seite
    document.getElementById('btn-next')?.addEventListener('click', () => {
        currentPage++;
        fetchRealData();
    });

    // Letzte Seite
    document.getElementById('btn-last')?.addEventListener('click', async () => {
        const colRef = collection(db, "kv-store");
        let countQuery = colRef;
        if (auth.currentUser) {
            const filterOwnerOnly = document.getElementById('filter-owner-only')?.checked;
            if (filterOwnerOnly) {
                countQuery = query(colRef, where("owner", "==", auth.currentUser.email));
            } else {
                const tokens = getAccessTokens(auth.currentUser.email);
                countQuery = query(colRef, where("access_control", "array-contains-any", tokens));
            }
        }
        const totalSnap = await getCountFromServer(countQuery);
        const totalCount = totalSnap.data().count;
        const lastPage = Math.ceil(totalCount / itemsPerPage);
        if (currentPage === lastPage) return;
        currentPage = lastPage;
        fetchLastPageData();
    });
}