import { collection, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * OCR-Encoder: Transformiert eine numerische ID in eine OCR-optimierte CRUDX-Notation.
 * Regeln: 
 * - Fixes Präfix "CRUDX-"
 * - Ersetzung kritischer Zeichen: 0->C, 1->R, 6->U, 7->D, 9->X
 * - Gruppierung in 5er Blöcke mit Bindestrich
 */
function encodeOCR(id) {
    const map = { '0': 'C', '1': 'R', '6': 'U', '7': 'D', '9': 'X' };
    
    // Sicherstellen, dass wir eine 15-stellige Basis haben (für 3 Blöcke à 5 Zeichen)
    let raw = id.toString().padStart(15, '0'); 
    
    // Zeichenersetzung basierend auf dem OCR-Schlüssel
    let encoded = raw.split('').map(char => map[char] || char).join('');
    
    // Aufteilung in 5er Gruppen
    let groups = encoded.match(/.{1,5}/g) || [];
    
    // Finales Format: CRUDX-XXXXX-XXXXX-XXXXX
    return `CRUDX-${groups.join('-')}`.toUpperCase();
}

/**
 * Injeziert Testdaten mit OCR-konformen IDs in die Firestore.
 */
export async function seedData(db) {
    try {
        const batch = writeBatch(db);
        const colRef = collection(db, "kv-store");

        // Wir generieren 25 Test-Assets
        for (let i = 1; i <= 25; i++) {
            // Wir nutzen einen Offset (1.000.000.000), um interessante Zahlenkombinationen zu provozieren
            const baseId = 1000000000 + i;
            const ocrId = encodeOCR(baseId); 
            
            const docRef = doc(colRef, ocrId);

            batch.set(docRef, {
                label: `Module Asset #${i}`,
                value: i % 2 === 0 
                    ? `This is the core payload for Module ${i}. It now fully supports the new Array architecture.`
                    : `Alternative payload for Module ${i}. Optimized for OCR processing and high-speed data retrieval.`,
                size: `${Math.floor(Math.random() * 200) + 10}KB`,
                owner: "admin@crudx.com",
                protection: ["P", "R", "W"],
                reads: Math.floor(Math.random() * 1000),
                updates: Math.floor(Math.random() * 100),
                last_read_ts: new Date().toISOString(),
                last_update_ts: new Date().toISOString(),
                // User Tags für die blauen Pills
                user_tags: ["bug", "feature", "pinned", "urgent", "stable"].slice(0, Math.floor(Math.random() * 4) + 1),
                // Zugriffskontrolllisten für die automatischen Tags
                white_list_read: ["user_alpha", "user_beta"],
                white_list_update: ["admin_user"],
                white_list_delete: ["system_root"],
                card_settings: i % 5 === 0 ? ["archive"] : []
            });
        }

        await batch.commit();
        console.log("✅ OCR-konforme Testdaten erfolgreich injiziert.");
        alert("Daten injiziert! Die Seite wird nun neu geladen.");
        location.reload();
    } catch (error) {
        console.error("❌ Fehler beim Injizieren der Daten:", error);
        alert("Fehler beim Injezieren der Daten. Details in der Konsole.");
    }
}

/**
 * Löscht alle Dokumente in der Collection (Hilfsfunktion).
 */
export async function clearData(db) {
    // Hinweis: In einer echten Firebase-Umgebung sollte dies über die CLI oder 
    // eine Cloud Function geschehen, da Client-seitiges Löschen ganzer Collections nicht performant ist.
    alert("Bitte löschen Sie die Daten manuell im Emulator UI oder nutzen Sie die CLI.");
}