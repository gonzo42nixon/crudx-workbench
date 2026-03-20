// modules/user-profile.js
/**
 * User Profile — persists per-user settings to Firestore (kv-store/<email>).
 *
 * Document key  = user e-mail (e.g. "drueffler@gmail.com")
 * Document value = JSON string with:
 *   {
 *     version:      1,
 *     tagRules:     { folder, hidden, hiddenGroup, folderGroup },
 *     theme:        { startupTheme, themes } | null,
 *     profileImage: "<url>" | ""
 *   }
 *
 * NOTE: This module deliberately does NOT import theme.js to avoid
 * circular dependencies.  Theme application from the profile is done by
 * app.js which listens to the "crudx:profile-loaded" CustomEvent.
 */
import { db } from './firebase.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { setTagRules, saveHiddenGroupRules, saveFolderGroupRules } from './tag-state.js';
import { buildFirestoreCreatePayload } from './utils.js';

const COLLECTION   = 'kv-store';
const WEBHOOK_URL  = 'https://hook.eu1.make.com/b3hs8e2k03wr68gh6yv88n1ybem87977';

/** true when running against the local Firebase Emulator */
function _isEmulator() {
    const forceProd = new URLSearchParams(window.location.search).get('mode') === 'live';
    return !forceProd && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

let _email   = null;   // currently signed-in user
let _profile = null;   // in-memory profile copy

// ---------- Defaults (bootstraps from existing localStorage values) ----------
function _defaultProfile() {
    const localRules  = JSON.parse(localStorage.getItem('crudx_tag_rules')          || 'null');
    const localHidden = JSON.parse(localStorage.getItem('crudx_hidden_group_rules') || 'null');
    const localFolder = JSON.parse(localStorage.getItem('crudx_folder_group_rules') || 'null');

    return {
        version:      1,
        tagRules: {
            folder:      localRules?.folder  ?? [">"],
            hidden:      localRules?.hidden  ?? [":"],
            hiddenGroup: localHidden         ?? [],
            folderGroup: localFolder         ?? ["Created>", "Last Read>", "Last Updated>", "Last Executed>"]
        },
        theme:        null,   // null = use global CRUDX-CORE_-DATA_-THEME
        profileImage: ''
    };
}

// ---------- Public API ----------

/** Returns the currently loaded profile (may be null before first login). */
export function getCurrentProfile() { return _profile; }

/** Returns the e-mail of the currently signed-in user. */
export function getCurrentEmail()   { return _email; }

/**
 * Returns true if the profile contains a user-specific theme configuration.
 * Used by app.js to suppress global system-theme snapshots when a user theme is active.
 */
export function hasUserTheme() {
    return !!(_profile?.theme?.themes && _profile?.theme?.startupTheme);
}

/**
 * Loads (or creates) the user profile from Firestore.
 * - Applies tag rules and profile picture immediately.
 * - Dispatches "crudx:profile-loaded" with { detail: profile } so app.js
 *   can apply the user's saved theme without a circular import.
 */
export async function loadAndApplyProfile(email) {
    if (!email) return null;
    _email = email;

    try {
        const docRef = doc(db, COLLECTION, email);
        const snap   = await getDoc(docRef);

        if (snap.exists()) {
            try {
                _profile = JSON.parse(snap.data().value);
                console.log(`👤 User profile loaded for ${email}`);
            } catch (e) {
                console.warn('⚠️ Invalid profile JSON – resetting to defaults:', e);
                _profile = _defaultProfile();
                await _persist();
            }
        } else {
            // First visit → initialise from localStorage and create in Firestore
            _profile = _defaultProfile();
            await _persist();
            console.log(`🆕 User profile created for ${email}`);
        }

        _applyRulesAndPicture();

        // Let app.js apply the theme without a circular import
        window.dispatchEvent(new CustomEvent('crudx:profile-loaded', { detail: _profile }));

    } catch (err) {
        console.error('❌ Failed to load user profile:', err);
    }

    return _profile;
}

/**
 * Shallowly merges `updates` into the current profile and persists to Firestore.
 * Typical call: saveProfileUpdates({ tagRules: {...} }) or ({ theme: {...} }) etc.
 */
export async function saveProfileUpdates(updates) {
    if (!_email) { console.warn('⚠️ saveProfileUpdates: no user logged in'); return; }
    _profile = _profile
        ? { ..._profile, ...updates }
        : { ..._defaultProfile(), ...updates };
    await _persist();
    console.log('💾 User profile updated:', Object.keys(updates));
}

/**
 * Renders the profile picture in the header icon (#user-icon)
 * and in the large avatar inside the user popup (.user-avatar-large).
 * Exported so auth.js can call it after the user saves a new URL.
 */
export function applyProfilePicture(url) {
    const imgTag = (size) => url?.trim()
        ? `<img src="${url.trim()}" alt="👤" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;">`
        : '👤';

    const headerIcon = document.getElementById('user-icon');
    if (headerIcon) headerIcon.innerHTML = imgTag(36);

    const avatarLarge = document.querySelector('.user-avatar-large');
    if (avatarLarge) {
        avatarLarge.innerHTML = url?.trim()
            ? `<img src="${url.trim()}" alt="👤" style="width:64px;height:64px;border-radius:50%;object-fit:cover;display:block;margin:0 auto;">`
            : '👤';
    }
}

// ---------- Internal helpers ----------

async function _persist() {
    const payload = {
        value:          JSON.stringify(_profile, null, 2),
        label:          'User Profile',
        owner:          _email,
        last_update_ts: new Date().toISOString()
    };

    if (_isEmulator()) {
        // Emulator: direkt in Firestore schreiben
        const docRef = doc(db, COLLECTION, _email);
        await setDoc(docRef, payload, { merge: true });
        console.log(`💾 User profile saved to emulator Firestore (${_email})`);
    } else {
        // Production: über Webhook schreiben (direkte Firestore-Writes sind durch Security Rules gesperrt)
        const webhookPayload = buildFirestoreCreatePayload({ key: _email, ...payload });
        webhookPayload.action = 'U';   // "U" = Update/Upsert
        const resp = await fetch(WEBHOOK_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(webhookPayload)
        });
        if (!resp.ok) throw new Error(`Webhook error: ${resp.status} ${resp.statusText}`);
        console.log(`💾 User profile saved via webhook (${_email})`);
    }
}

function _applyRulesAndPicture() {
    if (!_profile) return;

    // Tag Rules → update in-memory state + localStorage
    if (_profile.tagRules) {
        setTagRules({
            folder: _profile.tagRules.folder ?? [">"],
            hidden: _profile.tagRules.hidden ?? [":"]
        });
        if (Array.isArray(_profile.tagRules.hiddenGroup))
            saveHiddenGroupRules(_profile.tagRules.hiddenGroup);
        if (Array.isArray(_profile.tagRules.folderGroup))
            saveFolderGroupRules(_profile.tagRules.folderGroup);
    }

    // Profile picture
    applyProfilePicture(_profile.profileImage);
}
