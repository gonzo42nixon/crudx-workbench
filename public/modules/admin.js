import { db } from './firebase.js';
import { collection, getDocs, writeBatch, doc, setDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { fetchRealData } from './pagination.js';

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
                    alert("Invalid backup file format.");
                    return;
                }

                if (!confirm(`⚠️ RESTORE WARNING\n\nThis will overwrite/add ${json.length} documents.\nExisting documents with the same ID will be replaced.\n\nContinue?`)) return;

                console.log(`♻️ Restoring ${json.length} items...`);
                const batchSize = 500;
                let batch = writeBatch(db);
                let count = 0;

                for (const item of json) {
                    if (!item._id) continue;
                    const { _id, ...data } = item;
                    const docRef = doc(db, "kv-store", _id);
                    batch.set(docRef, data);
                    count++;

                    if (count % batchSize === 0) {
                        await batch.commit();
                        batch = writeBatch(db);
                        console.log(`📦 Restored ${count} items...`);
                    }
                }
                
                if (count % batchSize !== 0) await batch.commit();
                
                console.log("✅ Restore complete.");
                alert(`Successfully restored ${count} documents.`);
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