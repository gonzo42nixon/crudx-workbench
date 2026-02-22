import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. DATEN ERSTELLEN (SEED)
export async function seedData(db) {
    console.log("🚀 Starte Daten-Injektion...");
    try {
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
    } catch (error) {
        alert("Fehler: " + error.message);
    }
}

// 2. DATEN LÖSCHEN (CLEAR)
export async function clearData(db) {
    if (!confirm("Alles löschen?")) return;
    const snap = await getDocs(collection(db, "kv-store"));
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    alert("🗑️ Datenbank geleert!");
    window.location.reload();
}

// 3. DATEN EXPORTIEREN (EXPORT)
export async function exportData(db) {
    const snap = await getDocs(collection(db, "kv-store"));
    const data = [];
    snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

    if (data.length === 0) return alert("Keine Daten da!");

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}