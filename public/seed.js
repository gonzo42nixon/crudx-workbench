import { 
    collection, doc, setDoc, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. SEED (50 Dokumente generieren)
export async function seedData(db) {
    console.log("🚀 Starte Injektion...");
    for (let i = 1; i <= 50; i++) {
        const id = `DOC-${String(i).padStart(3, '0')}`;
        await setDoc(doc(db, "kv-store", id), {
            label: `Test Eintrag #${i}`,
            index: i,
            created: new Date().toISOString()
        });
    }
    alert("✅ 50 Dokumente erstellt!");
    window.location.reload();
}

// 2. EXPORT (Als JSON herunterladen)
export async function exportData(db) {
    const snap = await getDocs(collection(db, "kv-store"));
    const data = [];
    snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `workbench_backup.json`;
    a.click();
}

// 3. IMPORT (JSON-Datei hochladen)
export async function importData(db) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (event) => {
            const data = JSON.parse(event.target.result);
            console.log("📥 Importiere " + data.length + " Dokumente...");
            for (const item of data) {
                const { id, ...payload } = item;
                await setDoc(doc(db, "kv-store", id), payload);
            }
            alert("✅ Import erfolgreich!");
            window.location.reload();
        };
        reader.readAsText(file);
    };
    input.click();
}

// 4. CLEAR (Datenbank leeren)
export async function clearData(db) {
    if (!confirm("Alles löschen?")) return;
    const snap = await getDocs(collection(db, "kv-store"));
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    window.location.reload();
}