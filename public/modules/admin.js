import { db, auth } from './firebase.js';
import { collection, getDocs, writeBatch, doc, setDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData } from './pagination.js';
import { applyAutoTags } from './utils.js';

/**
 * Recursively converts any Firestore Timestamp value ({ seconds, nanoseconds })
 * inside a document to an ISO 8601 string, so the backup JSON is clean and
 * portable (no {seconds,nanoseconds} objects that would crash on restore).
 */
function normalizeTimestamps(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeTimestamps);
    // Firestore Timestamp: has numeric `seconds` and `nanoseconds`
    if (typeof obj.seconds === 'number' && typeof obj.nanoseconds === 'number') {
        return typeof obj.toDate === 'function'
            ? obj.toDate().toISOString()
            : new Date(obj.seconds * 1000 + Math.round(obj.nanoseconds / 1e6)).toISOString();
    }
    return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, normalizeTimestamps(v)])
    );
}

export async function backupData(btnId) {
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'wait';
    }

    try {
        console.log("📦 Starting Backup...");
        const colRef = collection(db, "kv-store");
        const snap = await getDocs(colRef);
        const data = snap.docs.map(d => normalizeTimestamps({ _id: d.id, ...d.data() }));

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CRUDX-BACKUP-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`✅ Backup complete: ${data.length} records.`);
    } catch (e) {
        console.error("Backup failed:", e);
        alert("Backup failed: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    }
}

export function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                if (!Array.isArray(json)) {
                    // Detect a theme-config file and give the user a clear redirect
                    if (json && typeof json === 'object' && json.startupTheme && json.themes) {
                        alert(
                            '🎨 This looks like a Theme JSON file, not a data backup.\n\n' +
                            'To apply it, use:\n' +
                            'Menu (☰) → Settings → 🎨 Theme → 📥 Import Theme'
                        );
                    } else {
                        alert(
                            '❌ Invalid backup file format.\n\n' +
                            'Expected a JSON array of documents (the format produced by 📦 Backup Data).'
                        );
                    }
                    return;
                }

                if (!confirm(`⚠️ RESTORE WARNING\n\nThis will overwrite/add ${json.length} documents.\nExisting documents with the same ID will be replaced.\n\nContinue?`)) return;

                // ── Access-control repair ──────────────────────────────────────────
                // If a document's access_control list doesn't include the current user
                // (or the wildcard *@*), the app won't show it after restore.
                // Offer to add the current user so all documents are immediately visible.
                const currentUser = auth?.currentUser?.email;
                let addCurrentUser = false;
                if (currentUser) {
                    const restricted = json.filter(item =>
                        item.access_control &&
                        Array.isArray(item.access_control) &&
                        !item.access_control.includes(currentUser) &&
                        !item.access_control.includes('*@*')
                    );
                    if (restricted.length > 0) {
                        addCurrentUser = confirm(
                            `ℹ️ ${restricted.length} of ${json.length} document(s) have access_control` +
                            ` that doesn't include "${currentUser}".\n\n` +
                            `They will be restored but won't be visible to you.\n\n` +
                            `Add "${currentUser}" to their access_control so you can see them?`
                        );
                    }
                }

                console.log(`♻️ Restoring ${json.length} items (individually to handle large docs)...`);
                let succeeded = 0;
                let skipped = 0;
                const errors = [];

                for (const item of json) {
                    if (!item._id) { skipped++; continue; }
                    const { _id, ...data } = item;

                    // Apply auto-tag rules before restoring (e.g. HTML → edit:…)
                    if (Array.isArray(data.user_tags)) data.user_tags = applyAutoTags(data.user_tags);

                    // Optionally add current user to access_control
                    if (addCurrentUser && currentUser && Array.isArray(data.access_control)) {
                        if (!data.access_control.includes(currentUser) && !data.access_control.includes('*@*')) {
                            data.access_control = [...data.access_control, currentUser];
                        }
                    }

                    try {
                        await setDoc(doc(db, "kv-store", _id), data);
                        succeeded++;
                        console.log(`♻️ Restored: ${_id}`);
                    } catch (docErr) {
                        console.error(`❌ Failed to restore "${_id}":`, docErr.message);
                        errors.push(`${_id}: ${docErr.message}`);
                    }
                }

                console.log(`✅ Restore complete. ${succeeded} written, ${skipped} skipped, ${errors.length} failed.`);
                if (errors.length > 0) {
                    alert(
                        `✅ Restored ${succeeded} / ${json.length} documents.\n\n` +
                        `❌ ${errors.length} failed (likely too large for Firestore's 1 MB limit):\n` +
                        errors.slice(0, 5).join('\n') +
                        (errors.length > 5 ? `\n…and ${errors.length - 5} more (see console)` : '')
                    );
                } else {
                    alert(`✅ Successfully restored ${succeeded} documents.`);
                }
                fetchRealData();

            } catch (err) {
                console.error("Restore failed", err);
                alert("Error parsing backup file: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

export async function deleteByTag() {
    const tag = prompt("Enter the tag to delete documents by:");
    if (!tag) return;

    const colRef = collection(db, "kv-store");
    const q = query(colRef, where("user_tags", "array-contains", tag));
    
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            alert(`No documents found with tag "${tag}".`);
            return;
        }

        if (!confirm(`⚠️ WARNING: This will delete ${snap.size} documents with tag "${tag}".\n\nAre you sure?`)) return;

        console.log(`🗑️ Deleting ${snap.size} items with tag "${tag}"...`);
        const batchSize = 500;
        let batch = writeBatch(db);
        let count = 0;

        for (const docSnap of snap.docs) {
            batch.delete(docSnap.ref);
            count++;
            if (count % batchSize === 0) {
                await batch.commit();
                batch = writeBatch(db);
            }
        }
        if (count % batchSize !== 0) await batch.commit();

        console.log("✅ Deletion complete.");
        alert(`Successfully deleted ${count} documents.`);
        fetchRealData();
    } catch (e) {
        console.error("Delete by tag failed:", e);
        alert("Error: " + e.message);
    }
}

export async function deleteAllDocuments() {
    if (!confirm("Really delete all documents?")) return;

    const colRef = collection(db, "kv-store");
    const snap = await getDocs(colRef);

    if (snap.empty) {
        alert("Nothing to delete.");
        return;
    }

    console.log(`🗑️ Starting batch deletion of ${snap.size} documents...`);

    let count = 0;
    let batch = writeBatch(db);

    for (const docSnap of snap.docs) {
        batch.delete(docSnap.ref);
        count++;

        if (count % 500 === 0) {
            await batch.commit();
            batch = writeBatch(db);
            console.log(`📦 Progress: ${count} deleted.`);
        }
    }

    if (count % 500 !== 0) {
        await batch.commit();
    }

    console.log("✅ All documents removed.");
    fetchRealData(); // UI aktualisieren
}