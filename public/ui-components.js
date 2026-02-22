// --- THEME LOGIC ---
const themes = ['Night', 'Day', 'Arnold', 'Gaga'];
let tIdx = 0;

export function cycleTheme() {
    tIdx = (tIdx + 1) % themes.length;
    document.body.className = 'theme-' + themes[tIdx].toLowerCase();
    console.log(`Theme changed to: ${themes[tIdx]}`);
}

// --- BROWSER APIs ---
export function shareApp() {
    if (navigator.share) {
        navigator.share({ title: 'CRUDX', url: window.location.href });
    } else {
        alert("Web Share not supported in this browser.");
    }
}

export function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
        document.exitFullscreen();
    }
}

// --- DRAWER ---
export function toggleDrawer() {
    const drawer = document.getElementById('drawer');
    drawer.classList.toggle('open');
}