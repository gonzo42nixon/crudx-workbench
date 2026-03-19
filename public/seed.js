import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { applyAutoTags } from './modules/utils.js';

/**
 * Seeds general user data.
 */
export async function seedData(db) {
    console.log("🚀 Seeding user data...");
    // Add user data seeding logic here if needed
}

/**
 * Seeds core system documents, including the global theme configuration.
 */
export async function seedCoreData(db) {
    console.log("🧬 Core Data Injection started...");
    try {
        const coreSourceUrl = 'https://hook.eu1.make.com/p4xrgqc0o6k2h8ohsgftgdqnp8kb98qg?key=pg-f3e667e1-bd9a-4545-a58e-daceea7c2ca0';
        const response = await fetch(coreSourceUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}: External CORE data source not found`);
        const coreDocs = await response.json();
        
        for (const item of coreDocs) {
            const { _id, ...payload } = item;
            
            // Fix possible HTML entities in values or tags coming from JSON
            if (payload.value) payload.value = payload.value.replace(/&gt;/g, '>').replace(/&lt;/g, '<');
            if (payload.user_tags) {
                payload.user_tags = payload.user_tags.map(t => t.replace(/&gt;/g, '>'));
                payload.user_tags = applyAutoTags(payload.user_tags); // auto-tag rules
            }

            await setDoc(doc(db, "kv-store", _id), {
                ...payload,
                created_at: payload.created_at || serverTimestamp(),
                access_control: payload.access_control || ["*@*"]
            });
            console.log(`✅ Injected Core Object: ${_id}`);
        }
        alert(`✅ Success: ${coreDocs.length} Core documents injected into Firestore.`);
    } catch (e) {
        console.error("🧬 Injection failed:", e);
        alert("❌ Core Injection Error: " + e.message);
    }
}