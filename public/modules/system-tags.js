// modules/system-tags.js

export const SYSTEM_TAG_PREFIXES = ['Reads:', 'Updates:', 'Executes:', 'Size:', 'Created:', 'Read:', 'Updated:', 'Executed:'];

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

export function getTimeLabel(ts, prefix) {
    if (!ts) {
        if (prefix === 'Created') return 'Unknown';
        return 'Beyond this Year'; 
    }
    const date = new Date(ts);
    if (isNaN(date.getTime())) {
        if (prefix === 'Created') return 'Unknown';
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
    
    if (diffDays <= 30) return 'Last Month';
    if (diffDays <= 90) return 'Last 3 Months';
    if (date.getFullYear() === now.getFullYear()) return 'This Year';
    return 'Beyond this Year';
}

export function matchSystemTag(d, searchTag) {
    const parts = searchTag.split(': ');
    if (parts.length < 2) return false;
    const key = parts[0];
    const value = parts.slice(1).join(': ');

    if (key === 'Reads') return getCounterClass(d.reads) === value;
    if (key === 'Updates') return getCounterClass(d.updates) === value;
    if (key === 'Executes') return getCounterClass(d.executes) === value;

    if (key === 'Size') return getSizeClass(d.size) === value;

    if (key === 'Created') return getTimeLabel(d.created_at, 'Created') === value;
    if (key === 'Read') return getTimeLabel(d.last_read_ts, 'Read') === value;
    if (key === 'Updated') return getTimeLabel(d.last_update_ts, 'Updated') === value;
    if (key === 'Executed') return getTimeLabel(d.last_execute_ts, 'Executed') === value;

    return false;
}

export function generateSystemTags(d, addTagFn, id) {
    addTagFn(`Reads: ${getCounterClass(d.reads)}`, id, d);
    addTagFn(`Updates: ${getCounterClass(d.updates)}`, id, d);
    addTagFn(`Executes: ${getCounterClass(d.executes)}`, id, d);
    addTagFn(`Size: ${getSizeClass(d.size)}`, id, d);

    const timeFields = { 'Created': d.created_at, 'Read': d.last_read_ts, 'Updated': d.last_update_ts, 'Executed': d.last_execute_ts };
    for (const [prefix, ts] of Object.entries(timeFields)) {
        const label = getTimeLabel(ts, prefix);
        if (label) addTagFn(`${prefix}: ${label}`, id, d);
    }
}