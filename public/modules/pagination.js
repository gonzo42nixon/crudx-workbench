// modules/pagination.js
import { db, auth } from './firebase.js';
import { getAccessTokens } from './utils.js';
import { collection, query, limit, getDocs, getCountFromServer, orderBy, startAfter, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { renderDataFromDocs } from './ui.js';
import { detectMimetype } from './mime.js';
import { matchSystemTag, SYSTEM_TAG_PREFIXES } from './system-tags.js';
import * as UrlManager from './url-manager.js';

// ---------- Zustand ----------
export let currentPage = 1;

export let itemsPerPage = 9;
export let pageCursors = [];
export let sortDirection = 'asc';
let currentUnsubscribe = null;

export function unsubscribeListener() {
    if (currentUnsubscribe) {
        console.log("Unsubscribing from Firestore listener.");
        currentUnsubscribe();
        currentUnsubscribe = null;
    }
}

export function resetPagination() {
    currentPage = 1;
    pageCursors = [];
}

export function setItemsPerPage(val) {
    itemsPerPage = val;
}

// ---------- URL State Management ----------
export function loadStateFromUrl() {
    const state = UrlManager.getInitialStateFromUrl();
    
    sortDirection = state.sort;
    
    // Update UI Button
    const btnOrder = document.getElementById('btn-order');
    if (btnOrder) btnOrder.textContent = sortDirection === 'asc' ? '↑' : '↓';

    return state.view;
}

// ---------- Daten laden (aktuelle Seite) ----------
export async function fetchRealData(resetPage = false) {
    const container = document.getElementById('data-container');
    if (!container) return;
    const colRef = collection(db, "kv-store");
    const user = auth.currentUser;
    const filterOwnerOnly = document.getElementById('filter-owner-only')?.checked;
    const searchTerm = document.getElementById('main-search')?.value.trim();
    // isTagSearch: true if any part of the expression involves tag: terms
    const isTagSearch = searchTerm && (searchTerm.startsWith('tag:') || searchTerm.includes('tag:'));
    const isMimeSearch = searchTerm && searchTerm.startsWith('mime:');

    // Expression search: boolean operators (||, &&) or negation (!) applied to tag terms
    const isExpressionSearch = isTagSearch && (searchTerm.includes('||') || searchTerm.includes('&&') || searchTerm.includes('!'));
    const isSystemTagSearch = !isExpressionSearch && isTagSearch && SYSTEM_TAG_PREFIXES.some(prefix => searchTerm.substring(4).startsWith(prefix));

    // Client-seitige Filterung ist auch für Gäste nötig, wenn nach Tags gesucht wird (wegen der Firestore "one array-contains" Limitation)
    const needsClientSideFiltering = (!filterOwnerOnly && isTagSearch) || isMimeSearch || isSystemTagSearch || isExpressionSearch;

    if (resetPage) {
        currentPage = 1;
        pageCursors = [];
    }

    const clearBtn = document.getElementById('btn-clear-search');
    if (clearBtn) clearBtn.style.display = searchTerm ? 'block' : 'none';

    // URL Update bei jedem Fetch
    UrlManager.updateUrlParams(currentPage, sortDirection);

    try {
        let countQuery;
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
        } else {
            // If no user, query for public documents
            countQuery = query(colRef, where("access_control", "array-contains", "*@*"));
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
                const tokens = getAccessTokens(user ? user.email : null);
                // FIX: Firestore erlaubt nur ein "array-contains" pro Query.
                // Wenn wir nach Tags suchen, müssen wir die Access-Control client-seitig filtern.
                if (!isTagSearch) {
                    constraints.push(where("access_control", "array-contains-any", tokens));
                }
            }
        } else {
            // GAST-ZUGRIFF: Nur öffentliche Dokumente laden
            if (!isTagSearch) {
                constraints.push(where("access_control", "array-contains", "*@*"));
            }
        }
        
        if (searchTerm) {
            if (isExpressionSearch) {
                // Boolean expressions (||, &&, !) are evaluated entirely client-side — no Firestore tag constraint
            } else if (searchTerm.startsWith('tag:')) {
                const tag = searchTerm.substring(4);
                // System Tags sind virtuell, daher nicht in der DB suchen
                if (!isSystemTagSearch) {
                    constraints.push(where("user_tags", "array-contains", tag));
                }
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

        // ---- EXPRESSION SEARCH: one-shot getDocs ----------------------------------------
        // Re-subscribing onSnapshot to an identical query (query(colRef), no constraints)
        // serves the Firestore local cache without re-running the client-side filter for the
        // *new* expression.  This means "!tag:X" appears identical to "tag:X" because the
        // same snapshot and same filter result are served from cache.
        // Fix: use getDocs (always fetches / evaluates fresh) and return early.
        if (isExpressionSearch) {
            unsubscribeListener();
            const allSnap = await getDocs(query(colRef));
            const tokens = getAccessTokens(user ? user.email : null);
            let exprDocs = allSnap.docs.filter(docSnap => {
                const d = docSnap.data();
                const ac = d.access_control || [];
                if (!ac.some(t => tokens.includes(t))) return false;
                return matchTagExpression(d, searchTerm);
            });
            const filteredTotal = exprDocs.length;
            document.getElementById('result-count') && (document.getElementById('result-count').textContent = filteredTotal);
            const exprTotalPages = Math.max(1, Math.ceil(filteredTotal / currentLimit));
            document.getElementById('total-pages') && (document.getElementById('total-pages').textContent = exprTotalPages);
            const startIdx = (currentPage - 1) * currentLimit;
            const pageDocs = exprDocs.slice(startIdx, startIdx + currentLimit);
            if (pageDocs.length === 0) {
                container.innerHTML = `<div class="pill pill-sys" style="margin:20px;">No documents.</div>`;
            } else {
                pageCursors[currentPage - 1] = allSnap.docs[allSnap.docs.length - 1];
                await renderDataFromDocs(pageDocs, container);
            }
            const isAtStart2 = currentPage <= 1;
            document.getElementById('btn-first')?.classList.toggle('btn-disabled', isAtStart2);
            document.getElementById('btn-prev')?.classList.toggle('btn-disabled', isAtStart2);
            const isAtEnd2 = currentPage >= exprTotalPages || gridValue === 'list';
            document.getElementById('btn-next')?.classList.toggle('btn-disabled', isAtEnd2);
            document.getElementById('btn-last')?.classList.toggle('btn-disabled', isAtEnd2);
            const btnOrderExpr = document.getElementById('btn-order');
            if (btnOrderExpr) btnOrderExpr.title = `Current: ${sortDirection === 'asc' ? 'A-Z' : 'Z-A'}. Click to flip.`;
            return; // Expression search complete — no persistent listener needed
        }
        // ---- END EXPRESSION SEARCH ------------------------------------------------------

        // Realtime Listener statt einmaligem Fetch
        unsubscribeListener();        currentUnsubscribe = onSnapshot(q, async (snap) => {
            let docs = snap.docs;

            if (needsClientSideFiltering) {
                const tokens = getAccessTokens(user ? user.email : null);
                docs = docs.filter(doc => {
                    const d = doc.data();
                    
                    // 1. Access Control Check (Immer prüfen, auch für Gäste)
                    const ac = d.access_control || [];
                    if (!ac.some(t => tokens.includes(t))) return false;

                    // 2. Mime Type Check
                    if (isMimeSearch) {
                        const mimeType = searchTerm.substring(5);
                        if (detectMimetype(d.value).type !== mimeType) return false;
                    }

                    // 3. System Tag Check
                    if (isSystemTagSearch) {
                        if (!matchSystemTag(d, searchTerm.substring(4))) return false;
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

// ---------- Boolean Tag Expression Evaluator ----------

/**
 * Tokenizes a tag expression string into a flat token list.
 * Recognises: OR (||), AND (&&), NOT (!), LPAREN, RPAREN, TERM.
 */
function _tokenizeTagExpr(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        if (/\s/.test(expr[i])) { i++; continue; }
        if (expr[i] === '|' && i + 1 < expr.length && expr[i + 1] === '|') { tokens.push({ type: 'OR'     }); i += 2; continue; }
        if (expr[i] === '&' && i + 1 < expr.length && expr[i + 1] === '&') { tokens.push({ type: 'AND'    }); i += 2; continue; }
        if (expr[i] === '!')                                                 { tokens.push({ type: 'NOT'    }); i++;    continue; }
        if (expr[i] === '(')                                                 { tokens.push({ type: 'LPAREN' }); i++;    continue; }
        if (expr[i] === ')')                                                 { tokens.push({ type: 'RPAREN' }); i++;    continue; }
        // Scan a TERM: read until whitespace, operator, or paren
        let j = i;
        while (
            j < expr.length &&
            !/\s/.test(expr[j]) &&
            expr[j] !== '(' && expr[j] !== ')' && expr[j] !== '!' &&
            !(expr[j] === '|' && j + 1 < expr.length && expr[j + 1] === '|') &&
            !(expr[j] === '&' && j + 1 < expr.length && expr[j + 1] === '&')
        ) { j++; }
        if (j > i) tokens.push({ type: 'TERM', value: expr.slice(i, j) });
        i = Math.max(i + 1, j);
    }
    return tokens;
}

/**
 * Tests a single predicate term (tag:X, mime:X, owner:X) against a Firestore doc.
 */
function _matchSingleTerm(docData, term) {
    if (term.startsWith('tag:')) {
        const tagVal = term.substring(4);
        if (SYSTEM_TAG_PREFIXES.some(p => tagVal.startsWith(p))) return matchSystemTag(docData, tagVal);
        return (docData.user_tags || []).includes(tagVal);
    }
    if (term.startsWith('mime:')) return detectMimetype(docData.value).type === term.substring(5);
    if (term.startsWith('owner:')) return docData.owner === term.substring(6);
    // Fallback: treat as a plain tag name
    return (docData.user_tags || []).includes(term);
}

/**
 * Evaluates a full boolean tag expression against a document using a
 * recursive-descent parser.
 *
 * Grammar:
 *   or-expr  ::= and-expr ('||' and-expr)*
 *   and-expr ::= unary   ('&&' unary)*
 *   unary    ::= '!' unary | primary
 *   primary  ::= '(' or-expr ')' | TERM
 *
 * Supports: tag:X, !tag:X, mime:X, owner:X, ||, &&, ()
 * Example: "tag:alpha || (tag:beta && !tag:gamma)"
 */
function matchTagExpression(docData, expression) {
    const toks = _tokenizeTagExpr(expression);
    let pos = 0;
    const peek    = ()  => toks[pos];
    const consume = ()  => toks[pos++];

    function parseOr() {
        let left = parseAnd();
        while (peek() && peek().type === 'OR') {
            consume();
            const right = parseAnd();
            const l = left, r = right;
            left = () => l() || r();
        }
        return left;
    }
    function parseAnd() {
        let left = parseUnary();
        while (peek() && peek().type === 'AND') {
            consume();
            const right = parseUnary();
            const l = left, r = right;
            left = () => l() && r();
        }
        return left;
    }
    function parseUnary() {
        if (peek() && peek().type === 'NOT') {
            consume();
            const operand = parseUnary();
            return () => !operand();
        }
        return parsePrimary();
    }
    function parsePrimary() {
        const tok = peek();
        if (!tok) return () => true;
        if (tok.type === 'LPAREN') {
            consume();
            const inner = parseOr();
            if (peek() && peek().type === 'RPAREN') consume();
            return inner;
        }
        if (tok.type === 'TERM') {
            consume();
            const term = tok.value;
            return () => _matchSingleTerm(docData, term);
        }
        consume(); // skip unexpected token
        return () => true;
    }
    return parseOr()();
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