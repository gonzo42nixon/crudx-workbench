export function updateGrid(val) {
    const container = document.getElementById('data-container');
    container.style.gridTemplateColumns = `repeat(${val}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${val}, 1fr)`;
}

export function renderCard(doc) {
    const d = doc.data();
    const dateOnly = d.created_ts ? d.created_ts.split('T')[0] : '2026-02-22';

    return `
        <div class="card-kv">
            <div class="value-layer">${d.value}</div>
            <div class="pill-group top-left">
                <div class="pill pill-key" title="Key: OCR Validated">${doc.id}</div>
                <div class="pill pill-label" title="Label: User Defined">${d.value}</div>
            </div>
            <div class="pill-group bottom-right">
                <div class="pill pill-sys" title="Created Date">${dateOnly}</div>
                <div class="pill pill-sys" title="Updates">U:${d.updates || 0}</div>
                <div class="pill pill-sys" title="Reads">R:${d.reads || 0}</div>
                <div class="pill pill-sys" title="Protection">🛡️ ${d.protection || 'D'}</div>
                <div class="pill pill-user" title="Whitelist Access">Whitelist Read</div>
            </div>
        </div>`;
}