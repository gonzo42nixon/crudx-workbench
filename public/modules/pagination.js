// public/modules/pagination.js
import { db } from './firebase.js'; // wir müssen firebase.js noch erstellen, siehe unten
import { collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { renderDataFromDocs } from './ui.js'; // werden wir später erstellen, erstmal aus app.js übernehmen

// ---------- Zustand ----------
export let currentPage = 1;
export let itemsPerPage = 9;
export let pageCursors = [];
export let sortDirection = 'asc';

// ---------- Layout anwenden ----------
export function applyLayout(val) {
    const dataContainer = document.getElementById('data-container');
    if (!dataContainer) return;

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
        console.log("🚀 List-Mode aktiviert.");
    } else {
        const s = parseInt(val);
        itemsPerPage = s * s;
        dataContainer.classList.add(`grid-${s}`);

        if (s >= 5) dataContainer.classList.add('density-compact');
        if (s >= 7) dataContainer.classList.add('density-minimal');
        if (s >= 9) dataContainer.classList.add('density-nano');

        const navi = document.querySelector('.navi-container');
        if (navi) navi.style.display = 'flex';
        console.log(`Square-Mode: ${s}x${s} Grid aktiviert.`);
    }

    currentPage = 1;
    pageCursors = [];
    fetchRealData();
}

// ---------- Daten laden (aktuelle Seite) ----------
export async function fetchRealData() {
    const container = document.getElementById('data-container');
    if (!container) return;
    const colRef = collection(db, "kv-store");

    try {
        const totalSnap = await getCountFromServer(colRef);
        const totalCount = totalSnap.data().count;
        let filteredCount = totalCount;

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
        document.getElementById('result-count') && (document.getElementById('result-count').textContent = filteredCount);
        document.getElementById('current-page') && (document.getElementById('current-page').textContent = currentPage);
        document.getElementById('total-pages') && (document.getElementById('total-pages').textContent = totalPages);

        let q = query(colRef, orderBy("label", sortDirection), limit(currentLimit));
        if (currentPage > 1 && pageCursors[currentPage - 2]) {
            q = query(colRef, orderBy("label", sortDirection), startAfter(pageCursors[currentPage - 2]), limit(currentLimit));
        }

        const snap = await getDocs(q);
        if (snap.empty) {
            container.innerHTML = `<div class="pill pill-sys" style="margin:20px;">Keine Dokumente.</div>`;
        } else {
            pageCursors[currentPage - 1] = snap.docs[snap.docs.length - 1];
            renderDataFromDocs(snap.docs, container);
        }

        // Buttons deaktivieren
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
    } catch (err) {
        console.error("🔥 Fehler in fetchRealData:", err);
        container.innerHTML = `<div class="pill pill-sys">Fehler: ${err.message}</div>`;
    }
}

// ---------- Letzte Seite laden ----------
export async function fetchLastPageData() {
    const container = document.getElementById('data-container');
    if (!container) return;
    const colRef = collection(db, "kv-store");

    try {
        const totalSnap = await getCountFromServer(colRef);
        const totalCount = totalSnap.data().count;
        const gridValue = document.getElementById('grid-select')?.value || "3";
        const itemsOnPage = (gridValue === 'list') ? 500 : (parseInt(gridValue) * parseInt(gridValue));
        const lastPage = Math.max(1, Math.ceil(totalCount / itemsOnPage));
        currentPage = lastPage;
        const remainder = totalCount % itemsOnPage || itemsOnPage;

        const reverseDir = (sortDirection === 'asc') ? 'desc' : 'asc';
        const q = query(colRef, orderBy("label", reverseDir), limit(remainder));
        const snap = await getDocs(q);
        renderDataFromDocs(snap.docs.reverse(), container);

        document.getElementById('current-page') && (document.getElementById('current-page').textContent = currentPage);
        document.getElementById('total-pages') && (document.getElementById('total-pages').textContent = lastPage);

        document.getElementById('btn-next')?.classList.add('btn-disabled');
        document.getElementById('btn-last')?.classList.add('btn-disabled');
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
        btnOrder.title = 'Aufsteigend (A–Z). Klicken für absteigend (Z–A)';
        btnOrder.addEventListener('click', () => {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            btnOrder.textContent = sortDirection === 'asc' ? '↑' : '↓';
            currentPage = 1;
            pageCursors = [];
            fetchRealData();
        });
    }

    // Grid-Auswahl
    const gridSelect = document.getElementById('grid-select');
    if (gridSelect) {
        gridSelect.addEventListener('change', (e) => {
            applyLayout(e.target.value);
        });
    }

    // Erste Seite
    document.getElementById('btn-first')?.addEventListener('click', () => {
        if (currentPage === 1) return;
        currentPage = 1;
        pageCursors = [];
        fetchRealData();
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
        const totalSnap = await getCountFromServer(colRef);
        const totalCount = totalSnap.data().count;
        const lastPage = Math.ceil(totalCount / itemsPerPage);
        if (currentPage === lastPage) return;
        currentPage = lastPage;
        fetchLastPageData();
    });
}