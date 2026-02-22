const themes = ['Night', 'Day', 'Arnold', 'Gaga'];
let tIdx = 0;

export function cycleTheme() {
    tIdx = (tIdx + 1) % themes.length;
    document.body.className = 'theme-' + themes[tIdx].toLowerCase();
    return themes[tIdx];
}

export function handleNativeActions(action) {
    if (action === 'share') navigator.share({ title: 'CRUDX', url: location.href });
    if (action === 'fullscreen') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
    }
    if (action === 'print') window.print();
}

export function toggleDrawer() {
    document.getElementById('drawer').classList.toggle('open');
}