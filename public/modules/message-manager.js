import { db } from './firebase.js';
import { doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { refreshTagCloud } from './tagscanner.js';

export function initMessageListeners() {
    window.addEventListener('message', async (event) => {
        // 1. Fullscreen Toggle (von IFrames getriggert)
        if (event.data === 'toggle-fullscreen') {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.log(err));
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
            return;
        }

        // 2. CRUDX Save (von sandboxed Apps im Emulator-Modus)
        if (event.data && event.data.type === 'CRUDX_SAVE') {
            const payload = event.data.payload;
            console.log('📬 Received save request from IFrame:', payload);

            if (!payload || !payload.key) {
                console.error("❌ IFrame save failed: Payload is missing a key.");
                return;
            }

            const isEmulator = ['localhost', '127.0.0.1'].includes(window.location.hostname);

            try {
                if (isEmulator) {
                    const dataToSave = {
                        value: payload.value,
                        label: payload.label,
                        owner: payload.owner,
                        user_tags: payload.user_tags?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_read: payload.white_list_read?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_update: payload.white_list_update?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_delete: payload.white_list_delete?.arrayValue?.values?.map(v => v.stringValue) || [],
                        white_list_execute: payload.white_list_execute?.arrayValue?.values?.map(v => v.stringValue) || [],
                        updates: increment(1),
                        last_update_ts: new Date().toISOString()
                    };
                    await updateDoc(doc(db, "kv-store", payload.key), dataToSave);
                    console.log(`✅ IFrame save for [${payload.key}] successful (SDK).`);
                } else {
                    // PRODUKTION: Speichern aus dem IFrame via Webhook (Make.com)
                    // Wir nutzen das Payload-Format, das das Make-Szenario erwartet.
                    const response = await fetch("https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...payload, last_update_ts: new Date().toISOString() })
                    });

                    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
                    console.log(`✅ IFrame save for [${payload.key}] successful (Webhook).`);
                }
                
                refreshTagCloud(true);
            } catch (e) {
                console.error(`❌ IFrame save for [${payload.key}] failed:`, e);
            }
        }
    });
}