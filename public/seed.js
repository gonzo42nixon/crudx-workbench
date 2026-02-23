import { collection, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * OCR-Encoder: Transformiert eine numerische ID in eine OCR-optimierte CRUDX-Notation.
 */
function encodeOCR(id) {
    const map = { '0': 'C', '1': 'R', '6': 'U', '7': 'D', '9': 'X' };
    let raw = id.toString().padStart(15, '0'); 
    let encoded = raw.split('').map(char => map[char] || char).join('');
    let groups = encoded.match(/.{1,5}/g) || [];
    return `CRUDX-${groups.join('-')}`.toUpperCase();
}

/**
 * Injeziert Testdaten mit MIME-Typen und ALLEN System-Tags.
 */
export async function seedData(db) {
    try {
        const batch = writeBatch(db);
        const colRef = collection(db, "kv-store");

        // Definition der verschiedenen MIME-Payloads für das VALUE Element
        const payloads = [
            { type: "CSV", val: "id,item,qty,price\n101,Unit_A,50,12.99\n102,Unit_B,20,45.00" },
            { type: "HTML", val: "<article><h3>System Report</h3><p>Status: <mark>Operational</mark></p></article>" },
            { type: "JS", val: "const init = () => { console.log('CRUDX Engine Active'); }; init();" },
            { type: "PDF", val: "%PDF-1.4\n%\n1 0 obj\n<</Title (Confidential_Doc)>>\nendobj" },
            { type: "TXT", val: "Raw log data: " + new Date().toISOString() + " - System stable." }
        ];

        const userTagPool = ["dringend", "überprüfen", "archiv", "fehler", "stabil"];

        for (let i = 1; i <= 25; i++) {
            const baseId = 2000000000 + i;
            const ocrId = encodeOCR(baseId); 
            const docRef = doc(colRef, ocrId);
            const currentPayload = payloads[i % payloads.length];

            // Zufälliges Datum für 'Created' in der Vergangenheit
            const pastDate = new Date(Date.now() - Math.floor(Math.random() * 86400000 * 10)).toISOString();

            batch.set(docRef, {
                label: `${currentPayload.type} Asset #${i}`,
                value: currentPayload.val,
                
                // --- VOLLSTÄNDIGE SYSTEM-INFO TAGS (7 STÜCK) ---
                size: `${Math.floor(Math.random() * 900) + 20}KB`,
                owner: `operator_${Math.floor(Math.random() * 50)}@crudx.de`,
                reads: Math.floor(Math.random() * 5000),
                updates: Math.floor(Math.random() * 200),
                protection: ["P", "R", "W"].slice(0, Math.floor(Math.random() * 3) + 1),
                created_at: pastDate,
                last_read_ts: new Date().toISOString(),
                last_update_ts: new Date().toISOString(),
                
                // --- USER TAGS (Umgangssprachlich) ---
                user_tags: [
                    userTagPool[i % userTagPool.length], 
                    i % 2 === 0 ? "nachbearbeiten" : "fertig"
                ],

                // --- ACLs ---
                white_list_read: ["admin", "guest"],
                white_list_update: ["editor"],
                white_list_delete: ["root"]
            });
        }

        await batch.commit();
        console.log("✅ Seed mit 7 System-Tags und MIME-Typen erfolgreich.");
        alert("25 Dokumente injiziert! System-Info ist nun vollständig.");
        location.reload();
    } catch (error) {
        console.error("❌ Seed-Fehler:", error);
        alert("Fehler beim Injizieren. Prüfe die Konsole.");
    }
}