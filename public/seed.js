import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { applyAutoTags } from './modules/utils.js';
import { themeState } from './modules/theme.js';

// The Firestore document key for the global system theme configuration.
const SYSTEM_THEME_KEY = "CRUDX-CORE_-DATA_-THEME";

/**
 * Seeds the system theme document from hardcoded defaults.
 * Used as a fallback when the external core data source is unreachable,
 * and also as part of the basic test-data seed so a fresh emulator is
 * immediately fully operational without requiring a network call.
 */
async function seedThemeDocument(db) {
    const config = {
        startupTheme: themeState.appConfig.startupTheme,
        themes: themeState.appConfig.themes
    };
    await setDoc(doc(db, "kv-store", SYSTEM_THEME_KEY), {
        value: JSON.stringify(config, null, 4),
        created_at: serverTimestamp(),
        access_control: ["*@*"]
    }, { merge: true });
    console.log(`✅ System Theme document [${SYSTEM_THEME_KEY}] seeded from hardcoded defaults.`);
}

/**
 * Seeds general user data.
 * Also ensures the system theme document exists so the app loads
 * without the "Theme document does not exist" warning on a fresh emulator.
 */
export async function seedData(db) {
    console.log("🚀 Seeding user data...");
    try {
        await seedThemeDocument(db);
    } catch (e) {
        console.warn("⚠️ Could not seed system theme document:", e);
    }
    // Add further user data seeding logic here if needed
}

/**
 * Seeds core system documents, including the global theme configuration.
 * Fetches from the external production source; falls back to hardcoded
 * theme defaults if the source is unreachable or returns unexpected data.
 */
export async function seedCoreData(db) {
    console.log("🧬 Core Data Injection started...");
    try {
        const coreSourceUrl = 'https://hook.eu1.make.com/p4xrgqc0o6k2h8ohsgftgdqnp8kb98qg?key=pg-f3e667e1-bd9a-4545-a58e-daceea7c2ca0';
        const response = await fetch(coreSourceUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}: External CORE data source not found`);
        const coreDocs = await response.json();

        // ── Shape detection ────────────────────────────────────────────────────
        // The webhook may return either:
        //   A) A JSON array  → inject each element as a Firestore document
        //   B) A theme-config object (has startupTheme + themes keys)
        //      → write it directly as the CRUDX-CORE_-DATA_-THEME document
        //   C) Anything else → throw so the fallback can handle it
        if (!Array.isArray(coreDocs)) {
            if (
                coreDocs && typeof coreDocs === 'object' &&
                coreDocs.startupTheme && coreDocs.themes
            ) {
                // Case B: single theme config object
                await setDoc(doc(db, "kv-store", SYSTEM_THEME_KEY), {
                    value: JSON.stringify(coreDocs, null, 4),
                    created_at: serverTimestamp(),
                    access_control: ["*@*"]
                }, { merge: true });
                console.log(`✅ Injected Core Theme from webhook: ${SYSTEM_THEME_KEY}`);
                alert(`✅ Success: System Theme document seeded from webhook.`);
                return;
            }
            // Case C: unexpected shape
            throw new Error(
                `Expected JSON array from CORE source, got ${typeof coreDocs}: ` +
                JSON.stringify(coreDocs).substring(0, 120)
            );
        }

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
        console.error("🧬 External injection failed:", e);
        // ── LOCAL FALLBACK ──────────────────────────────────────────────────────
        // The external webhook is unreachable or returned unexpected data.
        // Seed the system theme document from the hardcoded defaults so the app
        // no longer warns "Theme document does not exist" on the next page load.
        console.warn("🧬 Falling back to local theme seed...");
        try {
            await seedThemeDocument(db);
            alert(
                `⚠️ External data source unreachable or returned unexpected data.\n` +
                `✅ Fallback: System Theme document seeded from hardcoded defaults.\n\n` +
                `Error detail: ${e.message}`
            );
        } catch (fallbackErr) {
            console.error("❌ Fallback seed also failed:", fallbackErr);
            alert(`❌ Core Injection Error: ${e.message}\n\nFallback also failed: ${fallbackErr.message}`);
        }
    }
}
