export function updateGrid(val) {
    const container = document.getElementById('data-container');
    container.style.gridTemplateColumns = `repeat(${val}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${val}, 1fr)`;
}

export function createCard(doc) {
    const d = doc.data();
    const date = d.created_ts ? d.created_ts.split('T')[0] : '2026-02-22';
    return `
        <div class="card-kv">
            <div class="value-layer">${d.value}</div>
            <div class="tl-group">
                <div class="pill pill-key" title="Key">${doc.id}</div>
                <div class="pill pill-label" title="Label">${d.value}</div>
            </div>
            <div class="br-group">
                <div class="tag-row">
                    <div class="pill pill-sys" title="Created">${date}</div>
                    <div class="pill pill-sys" title="Updates">U:${d.updates || 0}</div>
                    <div class="pill pill-sys" title="Reads">R:${d.reads || 0}</div>
                    <div class="pill pill-sys" title="Protection">🛡️ D</div>
                </div>
                <div class="tag-row"><div class="pill pill-user" title="Whitelist">Whitelist Read</div></div>
            </div>
        </div>`;
}