// modules/system-tags.js

export const SYSTEM_TAG_PREFIXES = ['Owner:', 'Size:', 'C:', 'R:', 'U:', 'X:', 'R-Σ:', 'U-Σ:', 'X-Σ:', 'WL-R:', 'WL-U:', 'WL-X:'];

export function getCounterClass(val) {
    const v = val || 0;
    if (v === 0) return 'Never';
    if (v < 10) return 'Rarely';
    if (v < 50) return 'Mean';
    return 'Top 5';
}

export function getSizeClass(sizeStr) {
    let bytes = 0;
    if (sizeStr) {
        const match = sizeStr.match(/([\d.]+)\s*([a-zA-Z]+)/);
        if (match) {
            const num = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === 'KB') bytes = num * 1024;
            else if (unit === 'MB') bytes = num * 1024 * 1024;
            else if (unit === 'GB') bytes = num * 1024 * 1024 * 1024;
            else bytes = num;
        }
    }
    if (bytes >= 10 * 1024 * 1024) return 'Huge'; // > 10 MB
    else if (bytes >= 500 * 1024) return 'Large'; // > 500 KB
    else if (bytes >= 1024) return 'Medium'; // > few Bytes
    return 'Small';
}

export function getWhitelistClass(val) {
    const v = val || 0;
    if (v === 0) return 'None';
    if (v <= 2) return 'Few';
    if (v <= 5) return 'Mean';
    return 'Many';
}

export function getTimeLabel(ts, prefix) {
    if (!ts) {
        if (prefix === 'C') return 'Unknown';
        return 'Beyond this Year'; 
    }
    const date = new Date(ts);
    if (isNaN(date.getTime())) {
        if (prefix === 'C') return 'Unknown';
        return 'Beyond this Year';
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffMs < 3600 * 1000) return 'Last Hour';
    if (now.toDateString() === date.toDateString()) return 'Today';
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (yesterday.toDateString() === date.toDateString()) return 'Yesterday';
    
    if (diffDays <= 7) return 'This Week';
    if (diffDays <= 30) return 'This Month';
    if (diffDays <= 90) return 'Last 3 Months';
    if (date.getFullYear() === now.getFullYear()) return 'This Year';
    return 'Beyond this Year';
}

export function matchSystemTag(d, searchTag) {
    const parts = searchTag.split(': ');
    if (parts.length < 2) return false;
    const key = parts[0];
    const value = parts.slice(1).join(': ');

    if (key === 'R-Σ') return getCounterClass(d.reads) === value;
    if (key === 'U-Σ') return getCounterClass(d.updates) === value;
    if (key === 'X-Σ') return getCounterClass(d.executes) === value;

    if (key === 'Owner') return d.owner === value;

    if (key === 'Size') return getSizeClass(d.size) === value;

    if (key === 'WL-R') return getWhitelistClass(d.white_list_read?.length) === value;
    if (key === 'WL-U') return getWhitelistClass(d.white_list_update?.length) === value;
    if (key === 'WL-X') return getWhitelistClass(d.white_list_execute?.length) === value;

    if (key === 'C') return getTimeLabel(d.created_at, 'C') === value;
    if (key === 'R') return getTimeLabel(d.last_read_ts, 'R') === value;
    if (key === 'U') return getTimeLabel(d.last_update_ts, 'U') === value;
    if (key === 'X') return getTimeLabel(d.last_execute_ts, 'X') === value;

    return false;
}

export function generateSystemTags(d, addTagFn, id) {
    addTagFn(`R-Σ: ${getCounterClass(d.reads)}`, id, d);
    addTagFn(`U-Σ: ${getCounterClass(d.updates)}`, id, d);
    addTagFn(`X-Σ: ${getCounterClass(d.executes)}`, id, d);
    addTagFn(`Size: ${getSizeClass(d.size)}`, id, d);

    addTagFn(`WL-R: ${getWhitelistClass(d.white_list_read?.length)}`, id, d);
    addTagFn(`WL-U: ${getWhitelistClass(d.white_list_update?.length)}`, id, d);
    addTagFn(`WL-X: ${getWhitelistClass(d.white_list_execute?.length)}`, id, d);

    if (d.owner) addTagFn(`Owner: ${d.owner}`, id, d);

    const timeFields = { 'C': d.created_at, 'R': d.last_read_ts, 'U': d.last_update_ts, 'X': d.last_execute_ts };
    for (const [prefix, ts] of Object.entries(timeFields)) {
        const label = getTimeLabel(ts, prefix);
        if (label) addTagFn(`${prefix}: ${label}`, id, d);
    }
}