// Small, dependency-free helpers shared by every module.

export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function fmt(value) {
    return esc(value).replace(/\n/g, '<br>');
}

export function norm(name) {
    return String(name ?? '').trim().toLowerCase();
}

export function sameName(a, b) {
    return norm(a) !== '' && norm(a) === norm(b);
}

export function str(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return fallback;
    return String(value).trim();
}

export function arr(value) {
    return Array.isArray(value) ? value.filter(x => x && typeof x === 'object') : [];
}

export function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
}

export function clock(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ago(ms) {
    const diff = Math.max(0, Date.now() - ms);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    if (d < 365) return `${Math.floor(d / 7)}w`;
    return `${Math.floor(d / 365)}y`;
}

export function parseAgo(value, fallbackIndex = 0) {
    const text = String(value ?? '');
    const match = text.match(/(\d+(?:\.\d+)?)\s*(mo|months?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?|y|yrs?|years?)\b/i);
    if (!match) {
        if (/yesterday/i.test(text)) return 24 * 3600e3;
        if (/just now|now/i.test(text)) return 30e3;
        return (fallbackIndex + 1) * 45 * 60e3;
    }
    const n = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('mo')) return n * 30 * 86400e3;
    if (unit.startsWith('s')) return n * 1e3;
    if (unit.startsWith('m')) return n * 60e3;
    if (unit.startsWith('h')) return n * 3600e3;
    if (unit.startsWith('d')) return n * 86400e3;
    if (unit.startsWith('w')) return n * 7 * 86400e3;
    if (unit.startsWith('y')) return n * 365 * 86400e3;
    return (fallbackIndex + 1) * 45 * 60e3;
}

/** Parses "1.2k", "3,400", 12 → integer. */
export function toNum(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.round(value);
    const m = String(value ?? '').trim().match(/^([\d.,]+)\s*([km])?/i);
    if (!m) return 0;
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]?.toLowerCase() === 'k') n *= 1e3;
    if (m[2]?.toLowerCase() === 'm') n *= 1e6;
    return isFinite(n) ? Math.round(n) : 0;
}

/** Parses "$1,250.50", "20", 7.5 → float with 2 decimals. */
export function toMoney(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.round(value * 100) / 100;
    const m = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!m) return 0;
    const n = parseFloat(m[0]);
    return isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : 0;
}

export function compact(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
}

export function hashString(s) {
    s = String(s ?? '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + s.length.toString(36);
}

/** Deterministic 0..1 number from a string. */
export function seeded(s) {
    let h = 2166136261;
    s = String(s ?? '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}

export function hueFor(name) {
    return Math.floor(seeded(norm(name)) * 360);
}

export function colorFor(name) {
    return `hsl(${hueFor(name)} 55% 48%)`;
}

export function gradientFor(text) {
    const h = hueFor(text);
    return `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 50) % 360} 65% 42%))`;
}

export function initials(name) {
    return String(name ?? '?').trim().split(/\s+/).slice(0, 2).map(x => Array.from(x)[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Lenient JSON parsing for LLM output: strips fences/prose, removes trailing commas,
 * and repairs output that was cut off mid-way.
 */
export function parseJson(raw) {
    if (typeof raw !== 'string') return null;
    let s = raw.replace(/```(?:json)?/gi, '');
    const start = s.search(/[{[]/);
    if (start < 0) return null;
    s = s.slice(start);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    const attempts = [];
    if (end > 0) attempts.push(s.slice(0, end + 1));
    for (const candidate of attempts) {
        const value = tryParse(candidate);
        if (value !== undefined) return value;
    }
    return repairJson(s);
}

function tryParse(s) {
    try {
        return JSON.parse(s);
    } catch { /* fall through */ }
    try {
        return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch { /* fall through */ }
    return undefined;
}

/** Cuts truncated JSON back to the last complete value and closes open brackets. */
function repairJson(s) {
    const cuts = [];
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
        else if (ch === '}' || ch === ']') {
            stack.pop();
            cuts.push({ at: i + 1, closers: stack.slice().reverse().join('') });
        }
    }
    for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 60; k--, tries++) {
        const value = tryParse(s.slice(0, cuts[k].at) + cuts[k].closers);
        if (value !== undefined) return value;
    }
    return null;
}

export function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}
