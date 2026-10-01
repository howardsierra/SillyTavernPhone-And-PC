/*
 * Phone & PC — a SillyTavern extension.
 *
 * Gives {{user}} an in-story phone (or PC). Characters can text {{user}}, post on
 * X / Instagram / Reddit and search the web by emitting small tags in their replies.
 * Tags are pulled out of the chat and shown on the device. Texts and posts {{user}}
 * writes on the device are queued and only delivered when the next chat message is
 * sent, then injected into the prompt so characters know about them.
 *
 * Character feeds (search history, browsing history, social posts, music) can also be
 * generated on demand for a peek at what a character does online.
 */

const MODULE = 'st_phone';
const META_KEY = 'st_phone';
const PROMPT_KEY = 'st_phone_context';

const APP_NAMES = { x: 'X', instagram: 'Instagram', reddit: 'Reddit' };

const DEFAULT_INSTRUCTIONS = `[Phone system: {{user}} carries a smartphone. A character can text {{user}} by writing <sms from="Name">message</sms> anywhere in the reply (each line inside the tag becomes one text bubble). To send a picture, add image="what the photo shows" to the sms tag (the text inside becomes the caption). Characters can post online with <post app="x" from="Name">text</post> (app can be x, instagram or reddit; for Reddit add title="..." sub="r/..."; for Instagram, and optionally X, add image="what the photo shows"), and privately search the web with <search from="Name">query</search>. Only use these when it fits the story, e.g. when characters are apart or something is worth posting. Characters only know about texts {{user}} has actually sent them (see the phone log). Never write texts on {{user}}'s behalf.]`;

const DEFAULT_FEED_PROMPT = `[OOC: Pause the roleplay. Write a realistic snapshot of {{name}}'s personal online activity as it would appear on their devices right now. It must fit {{name}}'s personality, voice, interests, secrets and the current events of the story, including their feelings about {{user}}. Be specific, candid and in character — include things {{name}} would never say out loud. Write posts in {{name}}'s own style (slang, emoji, lowercase, typos if fitting).

Respond with ONLY a JSON object, no commentary, in exactly this shape:
{
  "handles": {"x": "@handle", "instagram": "@handle", "reddit": "u/username"},
  "bio": {"x": "short bio", "instagram": "short bio"},
  "searches": [{"query": "...", "ago": "15m"}],
  "history": [{"title": "page title", "url": "https://...", "ago": "1h"}],
  "x": [{"text": "...", "image": "optional: what an attached photo shows", "ago": "2h", "likes": 12, "reposts": 1, "replies": 3}],
  "instagram": [{"image": "detailed description of what the photo shows", "caption": "...", "ago": "1d", "likes": 87, "comments": [{"user": "@someone", "text": "..."}]}],
  "reddit": [{"type": "post", "subreddit": "r/...", "title": "...", "body": "...", "ago": "3h", "upvotes": 45, "comments": 12}, {"type": "comment", "subreddit": "r/...", "thread": "title of the thread", "body": "...", "ago": "5h", "upvotes": 8}],
  "music": [{"track": "...", "artist": "...", "ago": "20m"}]
}
Include 6-10 searches, 4-6 history entries, 3-6 X posts, 2-4 Instagram posts, 4-6 Reddit items (mix posts and comments) and 5 songs. Newest first. "ago" uses short forms like 5m, 3h, 2d.]`;

const defaultSettings = {
    enabled: true,
    showLauncher: true,
    mode: 'phone',
    theme: 'dark',
    wallpaper: 'dusk',
    notify: true,
    chatMarker: 'short',
    injectInstructions: true,
    injectTexts: true,
    maxTexts: 15,
    injectPosts: true,
    maxPosts: 4,
    injectSearches: false,
    depth: 1,
    role: 0,
    images: true,
    imageAuto: 'texts',
    imageAppearance: true,
    imagePrompt: '{{desc}}, candid smartphone photo',
    instructions: DEFAULT_INSTRUCTIONS,
    feedPrompt: DEFAULT_FEED_PROMPT,
    devicePos: null,
    launcherPos: null,
};

const WALLPAPERS = {
    dusk: 'linear-gradient(160deg, #2b1055 0%, #7597de 100%)',
    peach: 'linear-gradient(160deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%)',
    ocean: 'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    mint: 'linear-gradient(160deg, #43cea2 0%, #185a9d 100%)',
    noir: 'linear-gradient(160deg, #111 0%, #333 100%)',
};

const ui = {
    open: false,
    app: 'home',
    contact: null,
    person: null,
    drafts: {},
    busy: {},
    newContact: false,
    photoMode: false,
    scrollBottom: false,
    viewImage: null,
    imageBusy: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ctx = () => SillyTavern.getContext();

function settings() {
    const es = ctx().extensionSettings;
    if (!es[MODULE]) es[MODULE] = {};
    const s = es[MODULE];
    for (const [k, v] of Object.entries(defaultSettings)) {
        if (s[k] === undefined) s[k] = structuredClone(v);
    }
    return s;
}

function saveSettings() {
    ctx().saveSettingsDebounced();
}

function hasChat() {
    return !!ctx().getCurrentChatId?.();
}

function state() {
    const meta = ctx().chatMetadata ?? {};
    if (!meta[META_KEY] || typeof meta[META_KEY] !== 'object') {
        meta[META_KEY] = {};
    }
    const st = meta[META_KEY];
    st.items ??= [];
    st.profiles ??= {};
    st.contacts ??= [];
    st.seq ??= 0;
    st.batch ??= 0;
    return st;
}

function saveState() {
    const c = ctx();
    if (!hasChat()) return;
    if (typeof c.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
    else c.saveMetadata();
}

function nextId(st) {
    st.seq += 1;
    return `${Date.now().toString(36)}-${st.seq}`;
}

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function fmt(value) {
    return esc(value).replace(/\n/g, '<br>');
}

function norm(name) {
    return String(name ?? '').trim().toLowerCase();
}

function sameName(a, b) {
    return norm(a) === norm(b) && norm(a) !== '';
}

function userName() {
    return ctx().name1 || 'User';
}

function sub(text, extra = {}) {
    let out = String(text ?? '');
    for (const [k, v] of Object.entries(extra)) out = out.replaceAll(`{{${k}}}`, v);
    return ctx().substituteParams(out);
}

function clock(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function ago(ms) {
    const diff = Math.max(0, Date.now() - ms);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return `${Math.floor(d / 7)}w`;
}

function parseAgo(value, fallbackIndex) {
    const match = String(value ?? '').match(/(\d+(?:\.\d+)?)\s*(mo|months?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?|y|yrs?|years?)\b/i);
    if (!match) {
        if (/yesterday/i.test(String(value))) return 24 * 3600e3;
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

function toNum(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.round(value);
    const m = String(value ?? '').trim().match(/^([\d.,]+)\s*([km])?/i);
    if (!m) return 0;
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]?.toLowerCase() === 'k') n *= 1e3;
    if (m[2]?.toLowerCase() === 'm') n *= 1e6;
    return isFinite(n) ? Math.round(n) : 0;
}

function compact(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
}

function hashString(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + s.length.toString(36);
}

function colorFor(name) {
    const h = parseInt(hashString(norm(name)).slice(0, 4), 36) % 360;
    return `hsl(${h} 55% 45%)`;
}

function initials(name) {
    return String(name ?? '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() ?? '').join('') || '?';
}

function normApp(value) {
    const v = norm(value);
    if (['x', 'twitter', 'tweet', 'x/twitter'].includes(v)) return 'x';
    if (['instagram', 'ig', 'insta'].includes(v)) return 'instagram';
    if (['reddit', 'r'].includes(v)) return 'reddit';
    return 'x';
}

// ---------------------------------------------------------------------------
// Anchoring: every item that came from (or was delivered with) a chat message is
// anchored to that message's content. Swiping away, regenerating or deleting the
// message hides the item; swiping back brings it back.
// ---------------------------------------------------------------------------

const hashCache = new WeakMap();

function mesHash(message) {
    const cached = hashCache.get(message);
    if (cached && cached.mes === message.mes) return cached.hash;
    const hash = hashString(`${message.is_user ? 1 : 0}|${message.mes}`);
    hashCache.set(message, { mes: message.mes, hash });
    return hash;
}

function liveIndex() {
    const map = new Map();
    const chat = ctx().chat ?? [];
    chat.forEach((m, i) => {
        if (m && typeof m.mes === 'string') map.set(mesHash(m), i);
    });
    return map;
}

function makeAnchor(mesId) {
    const m = ctx().chat[mesId];
    return { hash: mesHash(m), mesId, swipeId: m.swipe_id ?? 0 };
}

function isLive(item, index) {
    if (!item.anchor) return true;
    const i = index.get(item.anchor.hash);
    if (i === undefined) return false;
    item.anchor.mesId = i;
    return true;
}

function liveItems() {
    const index = liveIndex();
    return state().items.filter(it => isLive(it, index));
}

/** Messages edited or continued keep their phone items. */
function reanchor(mesId) {
    const m = ctx().chat[mesId];
    if (!m || typeof m.mes !== 'string') return;
    const index = liveIndex();
    const hash = mesHash(m);
    const swipeId = m.swipe_id ?? 0;
    for (const it of state().items) {
        if (it.anchor && it.anchor.mesId === mesId && it.anchor.swipeId === swipeId && !index.has(it.anchor.hash)) {
            it.anchor.hash = hash;
        }
    }
}

// ---------------------------------------------------------------------------
// Parsing tags out of chat messages
// ---------------------------------------------------------------------------

const TAG_RE = /<(sms|text|post|search)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

function parseAttrs(s) {
    const out = {};
    const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(s))) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    return out;
}

function marker(kind, data) {
    const mode = settings().chatMarker;
    if (mode === 'none') return '';
    const user = userName();
    if (kind === 'sms') {
        const target = data.dir === 'out' ? data.contact : user;
        const photo = data.image ? `[photo: ${data.image}] ` : '';
        if (mode === 'full') return `📱 **${data.from} → ${target}:** ${photo}${data.body.replace(/\s*\n+\s*/g, ' / ')}`.trim();
        if (data.image) return `*📱 ${data.from} sent ${target} a photo.*`;
        return `*📱 ${data.from} texted ${target}.*`;
    }
    if (kind === 'post') {
        if (mode === 'full') return `📱 **${data.from} on ${APP_NAMES[data.app]}:** ${data.body.replace(/\s*\n+\s*/g, ' ')}`;
        return `*📱 ${data.from} posted on ${APP_NAMES[data.app]}.*`;
    }
    return '';
}

function hasTags(text) {
    TAG_RE.lastIndex = 0;
    const result = TAG_RE.test(text);
    TAG_RE.lastIndex = 0;
    return result;
}

/**
 * Pulls phone tags out of a chat message, stores them and rewrites the message.
 * @returns {object[]} New items
 */
function processMessage(mesId) {
    const c = ctx();
    const m = c.chat?.[mesId];
    if (!m || m.is_system || typeof m.mes !== 'string' || !hasTags(m.mes)) return [];

    const user = userName();
    const speaker = m.is_user ? user : (m.name || c.name2);
    const found = [];

    let text = m.mes.replace(TAG_RE, (_full, tag, attrStr, rawBody) => {
        const a = parseAttrs(attrStr);
        const body = String(rawBody).trim();
        tag = tag.toLowerCase();
        const image = a.image || a.photo || a.pic || a.picture || '';
        if (!body && !(image && (tag === 'sms' || tag === 'text' || tag === 'post'))) return '';

        if (tag === 'sms' || tag === 'text') {
            const from = a.from || speaker;
            const fromUser = sameName(from, user);
            const contact = fromUser ? (a.to || c.name2) : from;
            const dir = fromUser ? 'out' : 'in';
            const lines = body.split(/\n+/).map(x => x.trim()).filter(Boolean);
            if (image) {
                found.push({ kind: 'sms', from: fromUser ? user : from, contact, text: lines.shift() ?? '', image, dir, read: fromUser });
            }
            for (const line of lines) {
                found.push({ kind: 'sms', from: fromUser ? user : from, contact, text: line, dir, read: fromUser });
            }
            return marker('sms', { from: fromUser ? user : from, contact, body, dir, image });
        }

        if (tag === 'post') {
            const app = normApp(a.app || a.platform);
            const from = a.from || speaker;
            const isComment = norm(a.type || a.kind) === 'comment';
            found.push({
                kind: 'post', app, from, text: body,
                title: a.title || '', sub: a.sub || a.subreddit || '', image,
                postType: isComment ? 'comment' : 'post', parent: a.parent || a.thread || '',
                likes: 0, reposts: 0, replies: 0, upvotes: 1, commentCount: 0,
            });
            return marker('post', { from, app, body });
        }

        if (tag === 'search') {
            found.push({ kind: 'search', from: a.from || speaker, text: body });
            return '';
        }
        return '';
    });

    // Collapse repeated short markers (e.g. several texts in a row).
    text = text.replace(/(\*📱 [^*\n]+\*)(\s*\1)+/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) text = '*📱*';

    m.mes = text;
    if (Array.isArray(m.swipes) && typeof m.swipe_id === 'number' && m.swipes[m.swipe_id] !== undefined) {
        m.swipes[m.swipe_id] = text;
    }

    const anchor = makeAnchor(mesId);
    const st = state();
    const now = Date.now();
    const added = found.map((f, i) => ({
        id: nextId(st),
        time: now + i,
        source: 'story',
        status: 'sent',
        read: true,
        anchor: { ...anchor },
        ...f,
    }));
    st.items.push(...added);

    try {
        // Not rendered yet (non-streamed replies): the chat will render the cleaned text itself.
        if (document.querySelector(`#chat .mes[mesid="${mesId}"]`)) c.updateMessageBlock?.(mesId, m);
    } catch (e) {
        console.debug('[Phone] could not rerender message', e);
    }
    c.saveChat?.();
    saveState();
    return added;
}

function notifyItems(items) {
    if (!settings().notify || !items.length) return;
    const byContact = new Map();
    for (const it of items) {
        if (it.kind !== 'sms' || it.dir !== 'in') continue;
        if (ui.open && ui.app === 'thread' && sameName(ui.contact, it.contact)) continue;
        const key = norm(it.contact);
        if (!byContact.has(key)) byContact.set(key, { contact: it.contact, from: it.from, lines: [] });
        byContact.get(key).lines.push(it.image ? `📷 ${it.text || 'Photo'}` : it.text);
    }
    for (const n of byContact.values()) {
        toastr.info(n.lines.map(esc).join('<br>'), `📱 ${esc(n.from)}`, {
            timeOut: 6000,
            escapeHtml: false,
            onclick: () => openThread(n.contact),
        });
    }
    const launcher = document.getElementById('stp-launcher');
    if (launcher && items.some(x => x.kind === 'sms' && x.dir === 'in')) {
        launcher.classList.remove('stp-ring');
        void launcher.offsetWidth;
        launcher.classList.add('stp-ring');
    }
}

function autoImages(items, { fromFeed = false } = {}) {
    const s = settings();
    if (!s.images || s.imageAuto === 'off' || !imageGenAvailable()) return;
    for (const it of items) {
        if (!it.image || it.imageUrl) continue;
        if (it.kind === 'sms' || (s.imageAuto === 'all' && (it.kind === 'post' || fromFeed))) generateImage(it.id, { quiet: true });
    }
}

function scanChat() {
    const chat = ctx().chat ?? [];
    for (let i = 0; i < chat.length; i++) processMessage(i);
}

// ---------------------------------------------------------------------------
// Sending: queued items are delivered with the next chat message
// ---------------------------------------------------------------------------

function queueItem(item) {
    const st = state();
    const full = {
        id: nextId(st),
        time: Date.now(),
        source: 'user',
        status: 'pending',
        read: true,
        anchor: null,
        from: userName(),
        ...item,
    };
    st.items.push(full);
    saveState();
    refresh();
    return full;
}

function pendingItems() {
    return state().items.filter(x => x.status === 'pending');
}

function commitPending() {
    const st = state();
    const pending = pendingItems();
    if (!pending.length) return;
    const chat = ctx().chat ?? [];
    const lastId = chat.length - 1;
    const anchor = lastId >= 0 && chat[lastId]?.is_user ? makeAnchor(lastId) : null;
    st.batch += 1;
    st.lastBatchLen = chat.length;
    const now = Date.now();
    pending.forEach((it, i) => {
        it.status = 'sent';
        it.time = now + i;
        it.batch = st.batch;
        it.anchor = anchor ? { ...anchor } : null;
    });
    saveState();
}

function pruneAfterDelete(newLength) {
    const st = state();
    const index = liveIndex();
    st.items = st.items.filter(it => {
        if (!it.anchor || it.anchor.mesId < newLength) return true;
        if (it.source === 'user') {
            // The message these were sent with is gone: put them back in the outbox.
            it.status = 'pending';
            it.anchor = null;
            return true;
        }
        return false;
    });
    for (const it of st.items) {
        if (it.source === 'user' && it.status === 'sent' && it.anchor && !index.has(it.anchor.hash)) {
            it.status = 'pending';
            it.anchor = null;
        }
    }
    saveState();
}

globalThis.stPhoneGenerateInterceptor = async function (_chat, _contextSize, _abort, type) {
    try {
        if (!settings().enabled || !hasChat()) return;
        if (!type || type === 'normal') commitPending();
        updateInjection();
        refresh();
    } catch (e) {
        console.error('[Phone] interceptor failed', e);
    }
};

// ---------------------------------------------------------------------------
// Prompt injection
// ---------------------------------------------------------------------------

let feedGenerating = 0;

function updateInjection() {
    const c = ctx();
    const s = settings();
    if (!s.enabled || !hasChat()) {
        c.setExtensionPrompt(PROMPT_KEY, '', 1, Number(s.depth) || 0);
        return;
    }

    const st = state();
    const user = userName();
    const items = liveItems().filter(x => x.status === 'sent');
    const parts = [];

    if (s.injectInstructions && !feedGenerating && s.instructions.trim()) {
        parts.push(sub(s.instructions));
    }

    if (s.injectTexts) {
        const texts = items.filter(x => x.kind === 'sms').sort((a, b) => a.time - b.time).slice(-Math.max(1, Number(s.maxTexts) || 15));
        if (texts.length) {
            const chatLen = (c.chat ?? []).length;
            const justNowBatch = st.lastBatchLen !== undefined && chatLen <= st.lastBatchLen ? st.batch : -1;
            const lines = texts.map(t => {
                let suffix = '';
                if (t.dir === 'in' && !t.read) suffix = ' (unread)';
                if (t.dir === 'in' && t.read) suffix = ' (read)';
                if (t.dir === 'out' && t.batch && t.batch === justNowBatch) suffix = ' (just sent)';
                const to = t.dir === 'out' ? t.contact : user;
                const body = [t.image ? `[sends a photo: ${t.image}]` : '', t.text].filter(Boolean).join(' ');
                return `${t.from} → ${to}: ${body}${suffix}`;
            });
            parts.push(`[${user}'s phone — text messages, oldest to newest]\n${lines.join('\n')}`);
        }
    }

    if (s.injectPosts) {
        const posts = items.filter(x => x.kind === 'post').sort((a, b) => a.time - b.time).slice(-Math.max(1, Number(s.maxPosts) || 4));
        if (posts.length) {
            const lines = posts.map(p => {
                const where = p.app === 'reddit' ? `Reddit${p.sub ? ` ${p.sub}` : ''}` : APP_NAMES[p.app];
                const what = p.postType === 'comment' ? 'commented' : 'posted';
                const title = p.title ? `"${p.title}" — ` : '';
                const img = p.image ? ` [photo: ${p.image}]` : '';
                return `${p.from} ${what} on ${where}: ${title}${p.text}${img}`;
            });
            parts.push(`[Recent public social media posts]\n${lines.join('\n')}`);
        }
    }

    if (s.injectSearches) {
        const searches = items.filter(x => x.kind === 'search').sort((a, b) => a.time - b.time).slice(-8);
        if (searches.length) {
            parts.push(`[Private web searches — only the searcher knows about these]\n${searches.map(x => `${x.from} searched: ${x.text}`).join('\n')}`);
        }
    }

    c.setExtensionPrompt(PROMPT_KEY, parts.join('\n\n'), 1, Number(s.depth) || 0, false, Number(s.role) || 0);
}

// ---------------------------------------------------------------------------
// Feed generation
// ---------------------------------------------------------------------------

function parseJson(raw) {
    if (typeof raw !== 'string') return null;
    let s = raw.replace(/```(?:json)?/gi, '');
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    s = s.slice(a, b + 1);
    try {
        return JSON.parse(s);
    } catch {
        try {
            return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
        } catch {
            return null;
        }
    }
}

function arr(value) {
    return Array.isArray(value) ? value.filter(x => x && typeof x === 'object') : [];
}

async function generateFeed(name) {
    const c = ctx();
    if (ui.busy[name]) return;
    ui.busy[name] = true;
    refresh();

    try {
        const prompt = sub(settings().feedPrompt, { name });
        let forceChId = null;
        if (c.groupId) {
            const idx = c.characters.findIndex(x => sameName(x.name, name));
            if (idx >= 0) forceChId = idx;
        }

        feedGenerating++;
        updateInjection();
        let raw;
        try {
            if (c.generateQuietPrompt.length === 0) {
                raw = await c.generateQuietPrompt({ quietPrompt: prompt, skipWIAN: false, removeReasoning: true, forceChId });
            } else {
                raw = await c.generateQuietPrompt(prompt, false, false);
            }
        } finally {
            feedGenerating--;
            updateInjection();
        }

        const data = parseJson(raw);
        if (!data) {
            console.warn('[Phone] could not parse feed', raw);
            toastr.error('The model did not return usable JSON. Try again or tweak the feed prompt.', 'Phone');
            return;
        }

        const st = state();
        const now = Date.now();
        st.items = st.items.filter(x => !(x.source === 'gen' && sameName(x.from, name)));
        st.profiles[name] = {
            handles: typeof data.handles === 'object' && data.handles ? data.handles : {},
            bio: typeof data.bio === 'object' && data.bio ? data.bio : {},
            generatedAt: now,
        };

        const base = { from: name, source: 'gen', status: 'sent', read: true, anchor: null };
        const push = (list, map) => list.forEach((entry, i) => {
            const mapped = map(entry);
            if (!mapped) return;
            st.items.push({ id: nextId(st), time: now - parseAgo(entry.ago ?? entry.time, i), ...base, ...mapped });
        });

        push(arr(data.searches), e => e.query ? { kind: 'search', text: String(e.query) } : null);
        push(arr(data.history), e => (e.title || e.url) ? { kind: 'visit', title: String(e.title ?? e.url), url: String(e.url ?? '') } : null);
        push(arr(data.x), e => e.text ? { kind: 'post', app: 'x', text: String(e.text), image: typeof e.image === 'string' ? e.image : '', likes: toNum(e.likes), reposts: toNum(e.reposts ?? e.retweets), replies: toNum(e.replies) } : null);
        push(arr(data.instagram), e => (e.caption || e.image) ? {
            kind: 'post', app: 'instagram', text: String(e.caption ?? ''), image: String(e.image ?? ''), likes: toNum(e.likes),
            comments: arr(e.comments).map(x => ({ user: String(x.user ?? ''), text: String(x.text ?? '') })).slice(0, 4),
        } : null);
        push(arr(data.reddit), e => (e.body || e.title) ? {
            kind: 'post', app: 'reddit', postType: norm(e.type) === 'comment' ? 'comment' : 'post',
            sub: String(e.subreddit ?? e.sub ?? ''), title: String(e.title ?? ''), parent: String(e.thread ?? e.parent ?? ''),
            text: String(e.body ?? ''), upvotes: toNum(e.upvotes ?? e.score), commentCount: toNum(e.comments),
        } : null);
        push(arr(data.music), e => e.track ? { kind: 'music', title: String(e.track), artist: String(e.artist ?? '') } : null);

        saveState();
        updateInjection();
        autoImages(st.items.filter(x => x.source === 'gen' && sameName(x.from, name)), { fromFeed: true });
    } catch (e) {
        console.error('[Phone] feed generation failed', e);
        toastr.error(String(e?.message ?? e), 'Phone: feed generation failed');
    } finally {
        delete ui.busy[name];
        refresh();
    }
}

// ---------------------------------------------------------------------------
// Image generation (uses SillyTavern's built-in Image Generation extension)
// ---------------------------------------------------------------------------

function imageGenAvailable() {
    const c = ctx();
    return !!(c.SlashCommandParser?.commands?.imagine && c.extensionSettings?.sd);
}

function appearanceFor(name) {
    const c = ctx();
    const ch = c.characters?.find(x => sameName(x.name, name));
    const key = ch?.avatar ? ch.avatar.replace(/\.[^/.]+$/, '') : '';
    return String(c.extensionSettings?.sd?.character_prompts?.[key] ?? '').trim();
}

function imagePrompt(it) {
    const s = settings();
    const desc = String(it.image ?? '').trim();
    let appearance = '';
    if (s.imageAppearance && !sameName(it.from, userName())) {
        const mentionsSubject = /\b(selfie|mirror|myself|me|i|i'm|wearing|outfit|posing|her|him|she|he)\b/i.test(desc)
            || norm(desc).includes(norm(it.from));
        if (mentionsSubject) appearance = appearanceFor(it.from);
    }
    const out = sub(s.imagePrompt || '{{desc}}', { desc, name: it.from, appearance });
    const combined = appearance && !s.imagePrompt.includes('{{appearance}}') ? `${appearance}, ${out}` : out;
    return combined
        .replace(/[|{}"]/g, ' ')
        .split(',').map(x => x.trim()).filter(Boolean).join(', ')
        .replace(/\s+/g, ' ')
        .trim();
}

let imageChain = Promise.resolve();

function generateImage(id, { quiet = false } = {}) {
    const it = state().items.find(x => x.id === id);
    if (!it || !it.image || ui.imageBusy[id]) return;
    if (!imageGenAvailable()) {
        if (!quiet) toastr.warning('Turn on and configure SillyTavern\'s Image Generation extension to develop photos.', 'Phone');
        return;
    }
    ui.imageBusy[id] = true;
    refresh();
    const chatId = ctx().getCurrentChatId();
    imageChain = imageChain.then(async () => {
        try {
            const prompt = imagePrompt(it);
            const result = await ctx().executeSlashCommandsWithOptions(`/imagine quiet=true gallery=false ${prompt}`, {
                handleParserErrors: true,
                handleExecutionErrors: true,
            });
            const url = typeof result?.pipe === 'string' ? result.pipe.trim() : '';
            if (!url) throw new Error('No image was returned.');
            if (ctx().getCurrentChatId() !== chatId) return;
            it.imageUrl = url;
            saveState();
        } catch (e) {
            console.error('[Phone] image generation failed', e);
            if (!quiet) toastr.error(String(e?.message ?? e), 'Phone: photo failed');
        } finally {
            delete ui.imageBusy[id];
            refresh();
        }
    });
}

/** A photo: the generated image if there is one, otherwise a tappable placeholder. */
function photoHtml(it, cls = '') {
    if (it.imageUrl) {
        return `<img class="stp-photo-img ${cls}" src="${esc(it.imageUrl)}" alt="${esc(it.image)}" title="${esc(it.image)}" data-act="view-image" data-id="${esc(it.id)}">`;
    }
    const busy = ui.imageBusy[it.id];
    const canGenerate = settings().images && imageGenAvailable();
    const action = busy
        ? '<span class="stp-photo-action"><i class="fa-solid fa-spinner fa-spin"></i> developing…</span>'
        : canGenerate ? `<span class="stp-photo-action"><i class="fa-solid fa-wand-magic-sparkles"></i> tap to develop</span>` : '';
    return `<div class="stp-photo ${cls}" style="background:linear-gradient(135deg, ${colorFor(it.image)}, ${colorFor(`${it.image}!`)})" ${canGenerate && !busy ? `data-act="gen-image" data-id="${esc(it.id)}"` : ''}>
        <i class="fa-solid fa-camera"></i><span>${esc(it.image)}</span>${action}
    </div>`;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function chatCharacters() {
    const c = ctx();
    const names = [];
    if (c.groupId) {
        const group = c.groups?.find(g => g.id === c.groupId);
        for (const avatar of group?.members ?? []) {
            const ch = c.characters.find(x => x.avatar === avatar);
            if (ch && !group.disabled_members?.includes(avatar)) names.push(ch.name);
        }
    } else if (c.characterId !== undefined && c.characters[c.characterId]) {
        names.push(c.characters[c.characterId].name);
    }
    return names;
}

function people({ includeContacts = true } = {}) {
    const user = userName();
    const out = [];
    const add = n => {
        if (n && !sameName(n, user) && !out.some(x => sameName(x, n))) out.push(n);
    };
    chatCharacters().forEach(add);
    if (includeContacts) {
        const st = state();
        st.contacts.forEach(add);
        Object.keys(st.profiles).forEach(add);
        liveItems().forEach(x => add(x.kind === 'sms' ? x.contact : x.from));
    }
    return out;
}

function avatarUrl(name) {
    const c = ctx();
    const ch = c.characters?.find(x => sameName(x.name, name));
    if (ch?.avatar && ch.avatar !== 'none') return c.getThumbnailUrl('avatar', ch.avatar);
    return null;
}

function avatar(name, cls = '') {
    const url = avatarUrl(name);
    if (url) return `<img class="stp-avatar ${cls}" src="${esc(url)}" alt="">`;
    return `<div class="stp-avatar stp-avatar-letter ${cls}" style="background:${colorFor(name)}">${esc(initials(name))}</div>`;
}

function threads() {
    const map = new Map();
    for (const it of liveItems()) {
        if (it.kind !== 'sms') continue;
        const key = norm(it.contact);
        if (!map.has(key)) map.set(key, { contact: it.contact, items: [] });
        map.get(key).items.push(it);
    }
    for (const name of state().contacts) {
        if (!map.has(norm(name))) map.set(norm(name), { contact: name, items: [] });
    }
    const list = [...map.values()];
    for (const t of list) {
        t.items.sort((a, b) => (a.status === 'pending') - (b.status === 'pending') || a.time - b.time);
        t.last = t.items[t.items.length - 1];
        t.unread = t.items.filter(x => x.dir === 'in' && !x.read).length;
        t.pending = t.items.filter(x => x.status === 'pending').length;
    }
    return list.sort((a, b) => (b.last?.time ?? 0) - (a.last?.time ?? 0));
}

function unreadCount() {
    return liveItems().filter(x => x.kind === 'sms' && x.dir === 'in' && !x.read).length;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const APPS = [
    { id: 'messages', label: 'Messages', icon: 'fa-solid fa-comment', color: '#34c759' },
    { id: 'x', label: 'X', icon: 'fa-brands fa-x-twitter', color: '#000000' },
    { id: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram', color: 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)' },
    { id: 'reddit', label: 'Reddit', icon: 'fa-brands fa-reddit-alien', color: '#ff4500' },
    { id: 'browser', label: 'Browser', icon: 'fa-solid fa-compass', color: '#0a84ff' },
    { id: 'music', label: 'Music', icon: 'fa-solid fa-music', color: '#fa2d48' },
    { id: 'settings', label: 'Settings', icon: 'fa-solid fa-gear', color: '#8e8e93' },
];

function appIcon(app, badge = 0) {
    return `<button class="stp-app-icon" data-act="open-app" data-app="${app.id}" title="${esc(app.label)}">
        <span class="stp-app-glyph" style="background:${app.color}"><i class="${app.icon}"></i></span>
        ${badge ? `<span class="stp-badge-dot">${badge}</span>` : ''}
        <span class="stp-app-label">${esc(app.label)}</span>
    </button>`;
}

function viewHome() {
    const unread = unreadCount();
    const now = new Date();
    return `<div class="stp-home">
        <div class="stp-home-clock">
            <div class="stp-home-time">${esc(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</div>
            <div class="stp-home-date">${esc(now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
        </div>
        <div class="stp-home-grid">${APPS.map(a => appIcon(a, a.id === 'messages' ? unread : 0)).join('')}</div>
    </div>`;
}

function header(title, { back = true, actions = '' } = {}) {
    return `<div class="stp-header">
        ${back ? '<button class="stp-icon-btn" data-act="back" title="Back"><i class="fa-solid fa-chevron-left"></i></button>' : '<span class="stp-icon-spacer"></span>'}
        <div class="stp-header-title">${title}</div>
        <div class="stp-header-actions">${actions}</div>
    </div>`;
}

function viewMessages() {
    const list = threads();
    const user = userName();
    const rows = list.map(t => {
        const last = t.last;
        let preview = last ? (last.dir === 'out' ? `You: ${last.text}` : last.text) : 'No messages yet';
        if (t.pending) preview = `⏳ ${t.pending} queued — ${preview}`;
        return `<button class="stp-thread-row" data-act="open-thread" data-contact="${esc(t.contact)}">
            ${avatar(t.contact)}
            <div class="stp-thread-main">
                <div class="stp-thread-top"><span class="stp-thread-name">${esc(t.contact)}</span><span class="stp-thread-time">${last ? esc(clock(last.time)) : ''}</span></div>
                <div class="stp-thread-preview ${t.unread ? 'stp-bold' : ''}">${esc(preview)}</div>
            </div>
            ${t.unread ? `<span class="stp-unread">${t.unread}</span>` : ''}
        </button>`;
    }).join('');

    const suggestions = people().filter(n => !list.some(t => sameName(t.contact, n)));
    const newForm = ui.newContact ? `<div class="stp-new-contact">
            <input class="stp-input" data-draft="new-contact" list="stp-people" placeholder="Name of contact…" value="${esc(ui.drafts['new-contact'] ?? '')}">
            <datalist id="stp-people">${people().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
            <button class="stp-pill" data-act="create-contact">Start</button>
        </div>` : '';

    const quick = suggestions.length ? `<div class="stp-section-label">Contacts</div><div class="stp-chips">${suggestions.map(n => `<button class="stp-chip" data-act="open-thread" data-contact="${esc(n)}">${avatar(n, 'stp-avatar-xs')}${esc(n)}</button>`).join('')}</div>` : '';

    return `${header('Messages', { actions: `<button class="stp-icon-btn" data-act="toggle-new-contact" title="New message"><i class="fa-solid fa-pen-to-square"></i></button>` })}
        <div class="stp-scroll" data-scroll="messages">
            ${newForm}
            ${rows || `<div class="stp-empty">No texts yet. When a character texts ${esc(user)}, it shows up here.</div>`}
            ${quick}
        </div>`;
}

function viewThread() {
    const contact = ui.contact;
    const t = threads().find(x => sameName(x.contact, contact)) ?? { contact, items: [] };

    // Opening the thread reads everything in it.
    let changed = false;
    for (const it of t.items) {
        if (it.dir === 'in' && !it.read) {
            it.read = true;
            changed = true;
        }
    }
    if (changed) {
        saveState();
        updateInjection();
        updateBadge();
    }

    let lastDay = '';
    const bubbles = t.items.map(it => {
        const day = new Date(it.time).toDateString();
        const sep = day !== lastDay && it.status !== 'pending' ? `<div class="stp-day-sep">${esc(new Date(it.time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))} ${esc(clock(it.time))}</div>` : '';
        if (it.status !== 'pending') lastDay = day;
        const photo = it.image ? photoHtml(it, 'stp-bubble-photo') : '';
        const textPart = it.text ? `<div class="stp-bubble">${fmt(it.text)}</div>` : '';
        if (it.dir === 'out') {
            const pending = it.status === 'pending';
            return `${sep}<div class="stp-bubble-row stp-out ${pending ? 'stp-pending' : ''}">
                ${photo}${textPart}
                ${pending ? `<div class="stp-bubble-meta">⏳ Sends with your next reply · <a data-act="edit-pending" data-id="${esc(it.id)}">edit</a> · <a data-act="cancel-pending" data-id="${esc(it.id)}">cancel</a></div>` : ''}
            </div>`;
        }
        return `${sep}<div class="stp-bubble-row stp-in">
            <div class="stp-bubble-line">
                <div class="stp-bubble-stack">${photo}${textPart}</div>
                <button class="stp-mention" data-act="mention" data-id="${esc(it.id)}" title="Mention this text in your chat reply"><i class="fa-solid fa-reply"></i></button>
            </div>
        </div>`;
    }).join('');

    const draftKey = `thread:${norm(contact)}`;
    return `${header(`${avatar(contact, 'stp-avatar-xs')} ${esc(contact)}`, { actions: `<button class="stp-icon-btn" data-act="delete-thread" title="Delete conversation"><i class="fa-solid fa-trash-can"></i></button>` })}
        <div class="stp-scroll stp-thread" data-scroll="${esc(draftKey)}">
            ${bubbles || `<div class="stp-empty">Say something to ${esc(contact)}.</div>`}
        </div>
        ${ui.photoMode ? `<div class="stp-photo-composer">
            <i class="fa-solid fa-camera"></i>
            <input class="stp-input" data-draft="${esc(draftKey)}:image" placeholder="Describe the photo you're sending…" value="${esc(ui.drafts[`${draftKey}:image`] ?? '')}">
        </div>` : ''}
        <div class="stp-composer">
            <button class="stp-icon-btn ${ui.photoMode ? 'stp-active' : ''}" data-act="toggle-photo" title="Attach a photo"><i class="fa-solid fa-camera"></i></button>
            <textarea class="stp-input stp-textarea" rows="1" data-draft="${esc(draftKey)}" placeholder="${ui.photoMode ? 'Caption (optional)' : 'Text message'}">${esc(ui.drafts[draftKey] ?? '')}</textarea>
            <button class="stp-send" data-act="send-text" title="Queue — delivered with your next chat reply"><i class="fa-solid fa-arrow-up"></i></button>
            <button class="stp-send stp-send-now" data-act="send-text-now" title="Queue and send your chat reply now"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        <div class="stp-composer-hint">Texts are delivered when you send your next chat message.</div>`;
}

function personChips(list, { includeYou = false } = {}) {
    const user = userName();
    const all = includeYou ? [...list, user] : list;
    if (!all.length) return '';
    return `<div class="stp-chips stp-person-chips">${all.map(n => {
        const active = sameName(n, ui.person);
        const label = sameName(n, user) ? 'You' : n;
        return `<button class="stp-chip ${active ? 'stp-active' : ''}" data-act="pick-person" data-name="${esc(n)}">${avatar(n, 'stp-avatar-xs')}${esc(label)}</button>`;
    }).join('')}</div>`;
}

function ensurePerson(list, { includeYou = false } = {}) {
    const user = userName();
    const valid = n => list.some(x => sameName(x, n)) || (includeYou && sameName(n, user));
    if (!ui.person || !valid(ui.person)) ui.person = list[0] ?? (includeYou ? user : null);
}

function refreshButton(name) {
    if (!name || sameName(name, userName())) return '';
    const busy = ui.busy[name];
    return `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="gen-feed" data-name="${esc(name)}" title="Peek: generate ${esc(name)}'s latest activity" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button>`;
}

function profileMeta(name) {
    const p = state().profiles[name];
    if (ui.busy[name]) return `<div class="stp-gen-note">Peeking at ${esc(name)}'s devices…</div>`;
    if (!p) return '';
    const when = ago(p.generatedAt);
    return `<div class="stp-gen-note">Peeked ${when === 'now' ? 'just now' : `${esc(when)} ago`}</div>`;
}

function pendingBadge(it) {
    if (it.status !== 'pending') return '';
    return `<div class="stp-queued">⏳ Posts with your next reply · <a data-act="cancel-pending" data-id="${esc(it.id)}">cancel</a></div>`;
}

function renderPost(it) {
    const user = userName();
    const p = state().profiles[it.from] ?? {};
    const handle = p.handles?.[it.app] || (sameName(it.from, user) ? '' : '');
    const when = it.status === 'pending' ? 'queued' : ago(it.time);

    if (it.app === 'x') {
        return `<div class="stp-post stp-post-x">
            ${avatar(it.from)}
            <div class="stp-post-main">
                <div class="stp-post-head"><b>${esc(it.from)}</b> <span class="stp-muted">${esc(handle)} · ${esc(when)}</span></div>
                <div class="stp-post-text">${fmt(it.text)}</div>
                ${it.image ? photoHtml(it, 'stp-photo-wide') : ''}
                <div class="stp-post-stats"><span><i class="fa-regular fa-comment"></i> ${compact(it.replies)}</span><span><i class="fa-solid fa-retweet"></i> ${compact(it.reposts)}</span><span><i class="fa-regular fa-heart"></i> ${compact(it.likes)}</span></div>
                ${pendingBadge(it)}
            </div>
        </div>`;
    }

    if (it.app === 'instagram') {
        const comments = (it.comments ?? []).map(cm => `<div class="stp-ig-comment"><b>${esc(cm.user)}</b> ${esc(cm.text)}</div>`).join('');
        return `<div class="stp-post stp-post-ig">
            <div class="stp-post-head">${avatar(it.from, 'stp-avatar-xs')} <b>${esc(handle || it.from)}</b></div>
            ${photoHtml({ ...it, image: it.image || it.text || 'photo' })}
            <div class="stp-post-stats"><span><i class="fa-regular fa-heart"></i> ${compact(it.likes)} likes</span></div>
            ${it.text ? `<div class="stp-post-text"><b>${esc(handle || it.from)}</b> ${fmt(it.text)}</div>` : ''}
            ${comments}
            <div class="stp-muted stp-small">${esc(when)}</div>
            ${pendingBadge(it)}
        </div>`;
    }

    // reddit
    const uname = handle || `u/${String(it.from).replace(/\s+/g, '_').toLowerCase()}`;
    if (it.postType === 'comment') {
        return `<div class="stp-post stp-post-reddit">
            <div class="stp-muted stp-small"><b>${esc(uname)}</b> commented in <b>${esc(it.sub || 'r/all')}</b> · ${esc(when)}</div>
            ${it.parent ? `<div class="stp-reddit-parent">on "${esc(it.parent)}"</div>` : ''}
            <div class="stp-post-text">${fmt(it.text)}</div>
            ${it.image ? photoHtml(it, 'stp-photo-wide') : ''}
            <div class="stp-post-stats"><span><i class="fa-solid fa-arrow-up"></i> ${compact(it.upvotes)}</span></div>
            ${pendingBadge(it)}
        </div>`;
    }
    return `<div class="stp-post stp-post-reddit">
        <div class="stp-muted stp-small"><b>${esc(it.sub || 'r/all')}</b> · Posted by ${esc(uname)} · ${esc(when)}</div>
        ${it.title ? `<div class="stp-reddit-title">${esc(it.title)}</div>` : ''}
        <div class="stp-post-text">${fmt(it.text)}</div>
        ${it.image ? photoHtml(it, 'stp-photo-wide') : ''}
        <div class="stp-post-stats"><span><i class="fa-solid fa-arrow-up"></i> ${compact(it.upvotes)}</span><span><i class="fa-regular fa-comment"></i> ${compact(it.commentCount)}</span></div>
        ${pendingBadge(it)}
    </div>`;
}

function postComposer(app) {
    const k = `post:${app}`;
    const extra = app === 'reddit'
        ? `<input class="stp-input" data-draft="${k}:sub" placeholder="r/subreddit" value="${esc(ui.drafts[`${k}:sub`] ?? '')}">
           <input class="stp-input" data-draft="${k}:title" placeholder="Title" value="${esc(ui.drafts[`${k}:title`] ?? '')}">`
        : app === 'instagram' || app === 'x'
            ? `<input class="stp-input" data-draft="${k}:image" placeholder="${app === 'x' ? 'Attach a photo (optional) — describe it…' : 'Describe your photo…'}" value="${esc(ui.drafts[`${k}:image`] ?? '')}">`
            : '';
    const placeholder = app === 'x' ? "What's happening?" : app === 'instagram' ? 'Write a caption…' : 'Body text';
    return `<div class="stp-post-composer">
        ${extra}
        <textarea class="stp-input stp-textarea" rows="2" data-draft="${k}" placeholder="${placeholder}">${esc(ui.drafts[k] ?? '')}</textarea>
        <div class="stp-row-end"><span class="stp-muted stp-small">Goes live with your next chat reply</span><button class="stp-pill" data-act="post" data-app="${app}">Post</button></div>
    </div>`;
}

function viewSocial(app) {
    const list = people();
    ensurePerson(list, { includeYou: true });
    const name = ui.person;
    const user = userName();
    const isYou = sameName(name, user);
    const profile = state().profiles[name] ?? {};
    const posts = state().items
        .filter(x => x.status === 'pending' && x.kind === 'post' && x.app === app && isYou)
        .concat(liveItems().filter(x => x.kind === 'post' && x.app === app && x.status === 'sent' && sameName(x.from, name)))
        .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.time - a.time);

    const handle = profile.handles?.[app] ?? '';
    const bio = profile.bio?.[app] ?? '';
    const profileCard = name ? `<div class="stp-profile">
            ${avatar(name, 'stp-avatar-lg')}
            <div class="stp-profile-main">
                <div class="stp-profile-name">${esc(isYou ? user : name)}</div>
                ${handle ? `<div class="stp-muted">${esc(handle)}</div>` : ''}
                ${bio ? `<div class="stp-small">${esc(bio)}</div>` : ''}
            </div>
            ${refreshButton(name)}
        </div>${profileMeta(name)}` : '';

    const empty = isYou
        ? ''
        : `<div class="stp-empty">Nothing here yet. Tap <i class="fa-solid fa-arrows-rotate"></i> to peek at ${esc(name ?? 'someone')}'s ${APP_NAMES[app]}.</div>`;

    return `${header(APP_NAMES[app])}
        ${personChips(list, { includeYou: true })}
        <div class="stp-scroll stp-feed stp-feed-${app}" data-scroll="feed:${app}:${esc(norm(name))}">
            ${profileCard}
            ${isYou ? postComposer(app) : ''}
            ${posts.map(renderPost).join('') || empty}
        </div>`;
}

function viewBrowser() {
    const list = people();
    ensurePerson(list);
    const name = ui.person;
    const items = liveItems().filter(x => sameName(x.from, name));
    const searches = items.filter(x => x.kind === 'search').sort((a, b) => b.time - a.time);
    const visits = items.filter(x => x.kind === 'visit').sort((a, b) => b.time - a.time);
    const domain = url => {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return url;
        }
    };
    return `${header('Browser', { actions: refreshButton(name) })}
        ${personChips(list)}
        <div class="stp-scroll" data-scroll="browser:${esc(norm(name))}">
            ${name ? profileMeta(name) : ''}
            <div class="stp-searchbar"><i class="fa-solid fa-magnifying-glass"></i> ${esc(name ? `${name}'s browser` : 'Search')}</div>
            <div class="stp-section-label">Recent searches</div>
            ${searches.map(s => `<div class="stp-list-row"><i class="fa-solid fa-clock-rotate-left stp-muted"></i><span class="stp-grow">${esc(s.text)}</span><span class="stp-muted stp-small">${esc(ago(s.time))}</span></div>`).join('') || '<div class="stp-empty stp-small">No searches yet.</div>'}
            <div class="stp-section-label">History</div>
            ${visits.map(v => `<div class="stp-list-row"><i class="fa-solid fa-globe stp-muted"></i><div class="stp-grow"><div>${esc(v.title)}</div><div class="stp-muted stp-small">${esc(domain(v.url))}</div></div><span class="stp-muted stp-small">${esc(ago(v.time))}</span></div>`).join('') || '<div class="stp-empty stp-small">No history yet.</div>'}
        </div>`;
}

function viewMusic() {
    const list = people();
    ensurePerson(list);
    const name = ui.person;
    const tracks = liveItems().filter(x => x.kind === 'music' && sameName(x.from, name)).sort((a, b) => b.time - a.time);
    const now = tracks[0];
    return `${header('Music', { actions: refreshButton(name) })}
        ${personChips(list)}
        <div class="stp-scroll" data-scroll="music:${esc(norm(name))}">
            ${name ? profileMeta(name) : ''}
            ${now ? `<div class="stp-now-playing">
                <div class="stp-album" style="background:linear-gradient(135deg, ${colorFor(now.title)}, ${colorFor(now.artist)})"><i class="fa-solid fa-music"></i></div>
                <div><div class="stp-muted stp-small">${esc(name)} last played</div><div class="stp-bold">${esc(now.title)}</div><div class="stp-muted">${esc(now.artist)}</div></div>
            </div>` : ''}
            <div class="stp-section-label">Recently played</div>
            ${tracks.map(t => `<div class="stp-list-row"><div class="stp-album stp-album-sm" style="background:${colorFor(t.title)}"><i class="fa-solid fa-music"></i></div><div class="stp-grow"><div>${esc(t.title)}</div><div class="stp-muted stp-small">${esc(t.artist)}</div></div><span class="stp-muted stp-small">${esc(ago(t.time))}</span></div>`).join('') || '<div class="stp-empty stp-small">Nothing played yet.</div>'}
        </div>`;
}

function viewSettings() {
    const s = settings();
    const opt = (key, value, label) => `<button class="stp-chip ${s[key] === value ? 'stp-active' : ''}" data-act="set" data-key="${key}" data-value="${value}">${label}</button>`;
    return `${header('Settings')}
        <div class="stp-scroll" data-scroll="settings">
            <div class="stp-section-label">Device</div>
            <div class="stp-chips">${opt('mode', 'phone', '<i class="fa-solid fa-mobile-screen"></i> Phone')}${opt('mode', 'pc', '<i class="fa-solid fa-desktop"></i> PC')}</div>
            <div class="stp-section-label">Appearance</div>
            <div class="stp-chips">${opt('theme', 'dark', 'Dark')}${opt('theme', 'light', 'Light')}</div>
            <div class="stp-section-label">Wallpaper</div>
            <div class="stp-chips">${Object.keys(WALLPAPERS).map(w => `<button class="stp-swatch ${s.wallpaper === w ? 'stp-active' : ''}" style="background:${WALLPAPERS[w]}" data-act="set" data-key="wallpaper" data-value="${w}" title="${w}"></button>`).join('')}</div>
            <div class="stp-section-label">This chat</div>
            <button class="stp-pill stp-danger" data-act="wipe">Clear phone data for this chat</button>
            <div class="stp-muted stp-small stp-pad">More options live in SillyTavern's Extensions panel under “Phone &amp; PC”.</div>
        </div>`;
}

function imageViewer() {
    if (!ui.viewImage?.url) return '';
    return `<div class="stp-viewer" data-act="close-image">
        <img src="${esc(ui.viewImage.url)}" alt="">
        <div class="stp-viewer-caption">${esc(ui.viewImage.caption ?? '')}</div>
        <div class="stp-viewer-actions">
            <a class="stp-pill" href="${esc(ui.viewImage.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Open</a>
            <button class="stp-pill" data-act="regen-image" data-id="${esc(ui.viewImage.id)}"><i class="fa-solid fa-rotate"></i> Retake</button>
        </div>
    </div>`;
}

function currentView() {
    if (!hasChat()) {
        return `${header('Phone', { back: false })}<div class="stp-empty">Open a chat to use the phone.</div>`;
    }
    switch (ui.app) {
        case 'messages': return viewMessages();
        case 'thread': return viewThread();
        case 'x':
        case 'instagram':
        case 'reddit': return viewSocial(ui.app);
        case 'browser': return viewBrowser();
        case 'music': return viewMusic();
        case 'settings': return viewSettings();
        default: return viewHome();
    }
}

function render() {
    const device = document.getElementById('stp-device');
    if (!device) return;
    const s = settings();
    device.classList.toggle('stp-hidden', !ui.open || !s.enabled);
    device.classList.toggle('stp-mode-pc', s.mode === 'pc');
    device.classList.toggle('stp-mode-phone', s.mode !== 'pc');
    device.classList.toggle('stp-theme-light', s.theme === 'light');
    device.style.setProperty('--stp-wallpaper', WALLPAPERS[s.wallpaper] ?? WALLPAPERS.dusk);
    if (!ui.open) return;

    // Preserve focus, caret and scroll across re-renders.
    const active = document.activeElement;
    const focusKey = device.contains(active) ? active?.dataset?.draft : null;
    const selStart = active?.selectionStart;
    const selEnd = active?.selectionEnd;
    const scrollEl = device.querySelector('.stp-scroll');
    const scrollKey = scrollEl?.dataset.scroll;
    const scrollTop = scrollEl?.scrollTop;

    const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const view = currentView();

    if (s.mode === 'pc') {
        const unread = hasChat() ? unreadCount() : 0;
        const nav = APPS.map(a => `<button class="stp-nav-item ${ui.app === a.id || (a.id === 'messages' && ui.app === 'thread') ? 'stp-active' : ''}" data-act="open-app" data-app="${a.id}">
            <span class="stp-app-glyph stp-glyph-sm" style="background:${a.color}"><i class="${a.icon}"></i></span><span>${esc(a.label)}</span>
            ${a.id === 'messages' && unread ? `<span class="stp-unread">${unread}</span>` : ''}
        </button>`).join('');
        device.innerHTML = `<div class="stp-window">
            <div class="stp-titlebar stp-drag"><span><i class="fa-solid fa-desktop"></i> ${esc(userName())}'s PC</span>
                <span class="stp-window-btns"><button class="stp-icon-btn" data-act="toggle-mode" title="Switch to phone"><i class="fa-solid fa-mobile-screen"></i></button><button class="stp-icon-btn" data-act="close" title="Close"><i class="fa-solid fa-xmark"></i></button></span>
            </div>
            <div class="stp-pc-body">
                <nav class="stp-sidebar">${nav}</nav>
                <main class="stp-screen">${ui.app === 'home' ? viewPcDesktop() : view}${imageViewer()}</main>
            </div>
            <div class="stp-taskbar"><span><i class="fa-brands fa-windows"></i></span><span>${esc(now)}</span></div>
        </div>`;
    } else {
        device.innerHTML = `<div class="stp-frame">
            <div class="stp-statusbar stp-drag">
                <span>${esc(now)}</span>
                <span class="stp-notch"></span>
                <span class="stp-status-icons"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i><i class="fa-solid fa-battery-three-quarters"></i>
                <button class="stp-icon-btn stp-close" data-act="close" title="Close"><i class="fa-solid fa-xmark"></i></button></span>
            </div>
            <div class="stp-screen">${view}${imageViewer()}</div>
            <div class="stp-homebar" data-act="home" title="Home"></div>
        </div>`;
    }

    const newScroll = device.querySelector('.stp-scroll');
    if (newScroll) {
        if (ui.scrollBottom) {
            newScroll.scrollTop = newScroll.scrollHeight;
        } else if (scrollKey && newScroll.dataset.scroll === scrollKey) {
            newScroll.scrollTop = scrollTop;
        }
    }
    ui.scrollBottom = false;

    if (focusKey) {
        const el = [...device.querySelectorAll('[data-draft]')].find(x => x.dataset.draft === focusKey);
        if (el) {
            el.focus();
            try {
                el.setSelectionRange(selStart, selEnd);
            } catch { /* not a text input */ }
        }
    }
    autosize(device);
}

function viewPcDesktop() {
    const unread = unreadCount();
    return `<div class="stp-desktop">
        <div class="stp-home-grid">${APPS.map(a => appIcon(a, a.id === 'messages' ? unread : 0)).join('')}</div>
    </div>`;
}

function autosize(root) {
    root.querySelectorAll('textarea.stp-textarea').forEach(t => {
        t.style.height = 'auto';
        t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
    });
}

function updateBadge() {
    const launcher = document.getElementById('stp-launcher');
    if (!launcher) return;
    const s = settings();
    launcher.classList.toggle('stp-hidden', !s.enabled || !s.showLauncher);
    const n = hasChat() ? unreadCount() : 0;
    const badge = launcher.querySelector('.stp-launcher-badge');
    badge.textContent = n ? String(n) : '';
    badge.classList.toggle('stp-hidden', !n);
    const queued = hasChat() ? pendingItems().length : 0;
    launcher.classList.toggle('stp-has-queued', queued > 0);
    launcher.title = queued ? `Phone — ${queued} queued` : 'Phone';
}

function refresh() {
    render();
    updateBadge();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function open(app) {
    ui.open = true;
    if (app) ui.app = app;
    refresh();
}

function close() {
    ui.open = false;
    refresh();
}

function openThread(contact) {
    ui.open = true;
    ui.app = 'thread';
    ui.contact = contact;
    ui.scrollBottom = true;
    refresh();
}

function draftValue(key) {
    return String(ui.drafts[key] ?? '').trim();
}

function sendText(now = false) {
    const key = `thread:${norm(ui.contact)}`;
    const text = draftValue(key);
    const image = ui.photoMode ? draftValue(`${key}:image`) : '';
    if (text || image) {
        const item = queueItem({ kind: 'sms', contact: ui.contact, text, image, dir: 'out' });
        ui.drafts[key] = '';
        ui.drafts[`${key}:image`] = '';
        ui.photoMode = false;
        ui.scrollBottom = true;
        refresh();
        if (image) autoImages([item]);
    }
    if (now) triggerChatSend();
}

function triggerChatSend() {
    const button = document.getElementById('send_but');
    if (button) button.click();
}

function makePost(app) {
    const k = `post:${app}`;
    const text = draftValue(k);
    const image = draftValue(`${k}:image`);
    const title = draftValue(`${k}:title`);
    let subName = draftValue(`${k}:sub`);
    if (!text && !image && !title) return;
    if (subName && !/^r\//i.test(subName)) subName = `r/${subName}`;
    const item = queueItem({ kind: 'post', app, text, image, title, sub: subName, postType: 'post', likes: 0, reposts: 0, replies: 0, upvotes: 1, commentCount: 0 });
    if (image && settings().images && settings().imageAuto !== 'off') generateImage(item.id, { quiet: false });
    for (const key of [k, `${k}:image`, `${k}:title`, `${k}:sub`]) ui.drafts[key] = '';
    refresh();
}

function mention(id) {
    const it = state().items.find(x => x.id === id);
    const textarea = document.getElementById('send_textarea');
    if (!it || !textarea) return;
    const snippet = it.image && !it.text
        ? `*looks at the photo ${it.from} sent: ${it.image}* `
        : `*reads ${it.from}'s text: "${it.text}"* `;
    textarea.value = textarea.value ? `${textarea.value.replace(/\s*$/, '')} ${snippet}` : snippet;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
}

async function confirmPopup(text) {
    const c = ctx();
    if (c.Popup && c.POPUP_TYPE) {
        const result = await c.callGenericPopup(text, c.POPUP_TYPE.CONFIRM);
        return result === c.POPUP_RESULT.AFFIRMATIVE || result === true || result === 1;
    }
    return window.confirm(text);
}

async function handleAction(el) {
    const act = el.dataset.act;
    const st = state();
    switch (act) {
        case 'close': close(); break;
        case 'home': ui.app = 'home'; refresh(); break;
        case 'back':
            ui.app = ui.app === 'thread' ? 'messages' : 'home';
            refresh();
            break;
        case 'open-app':
            ui.app = el.dataset.app;
            ui.newContact = false;
            refresh();
            break;
        case 'toggle-mode':
            settings().mode = settings().mode === 'pc' ? 'phone' : 'pc';
            saveSettings();
            syncSettingsUi();
            applyDevicePosition();
            refresh();
            break;
        case 'open-thread': openThread(el.dataset.contact); break;
        case 'toggle-new-contact': ui.newContact = !ui.newContact; refresh(); break;
        case 'create-contact': {
            const name = draftValue('new-contact');
            if (!name) return;
            if (!st.contacts.some(x => sameName(x, name))) st.contacts.push(name);
            ui.drafts['new-contact'] = '';
            ui.newContact = false;
            saveState();
            openThread(name);
            break;
        }
        case 'send-text': sendText(false); break;
        case 'send-text-now': sendText(true); break;
        case 'cancel-pending':
            st.items = st.items.filter(x => !(x.id === el.dataset.id && x.status === 'pending'));
            saveState();
            refresh();
            break;
        case 'edit-pending': {
            const it = st.items.find(x => x.id === el.dataset.id && x.status === 'pending');
            if (!it) return;
            const key = `thread:${norm(it.contact)}`;
            ui.drafts[key] = it.text;
            st.items = st.items.filter(x => x !== it);
            saveState();
            refresh();
            document.querySelector(`#stp-device [data-draft="${CSS.escape(key)}"]`)?.focus();
            break;
        }
        case 'delete-thread': {
            if (!(await confirmPopup(`Delete your conversation with ${ui.contact}? Characters will no longer see these texts.`))) return;
            st.items = st.items.filter(x => !(x.kind === 'sms' && sameName(x.contact, ui.contact)));
            st.contacts = st.contacts.filter(x => !sameName(x, ui.contact));
            saveState();
            updateInjection();
            ui.app = 'messages';
            refresh();
            break;
        }
        case 'mention': mention(el.dataset.id); break;
        case 'toggle-photo': ui.photoMode = !ui.photoMode; refresh(); break;
        case 'gen-image': generateImage(el.dataset.id); break;
        case 'view-image': {
            const it = st.items.find(x => x.id === el.dataset.id);
            ui.viewImage = it ? { url: it.imageUrl, id: it.id, caption: it.image } : null;
            refresh();
            break;
        }
        case 'close-image': ui.viewImage = null; refresh(); break;
        case 'regen-image': {
            const it = st.items.find(x => x.id === el.dataset.id);
            if (it) {
                delete it.imageUrl;
                ui.viewImage = null;
                saveState();
                generateImage(it.id);
            }
            break;
        }
        case 'pick-person': ui.person = el.dataset.name; refresh(); break;
        case 'gen-feed': generateFeed(el.dataset.name); break;
        case 'post': makePost(el.dataset.app); break;
        case 'set':
            settings()[el.dataset.key] = el.dataset.value;
            saveSettings();
            syncSettingsUi();
            if (el.dataset.key === 'mode') applyDevicePosition();
            refresh();
            break;
        case 'wipe':
            if (!(await confirmPopup('Clear all texts, posts and feeds for this chat?'))) return;
            ctx().chatMetadata[META_KEY] = {};
            saveState();
            updateInjection();
            ui.app = 'home';
            refresh();
            break;
    }
}

// ---------------------------------------------------------------------------
// DOM setup
// ---------------------------------------------------------------------------

function makeDraggable(el, handleSelector, posKey, onClick) {
    let start = null;
    let lastTouch = 0;
    const point = e => (e.touches?.[0] ?? e.changedTouches?.[0] ?? e);

    const onDown = e => {
        const isTouch = e.type === 'touchstart';
        if (isTouch) lastTouch = Date.now();
        else if (Date.now() - lastTouch < 800) return; // emulated mouse event after a touch
        if (!isTouch && e.button !== 0) return;
        const handle = e.target.closest(handleSelector);
        if (!handle || !el.contains(handle)) return;
        if (el.id !== 'stp-launcher' && e.target.closest('button, a, input, textarea, select')) return;
        if (el.id === 'stp-device' && window.matchMedia('(max-width: 700px)').matches) return;
        const p = point(e);
        const rect = el.getBoundingClientRect();
        start = { x: p.clientX, y: p.clientY, left: rect.left, top: rect.top, moved: false };
        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', onUp);
    };

    const onMove = e => {
        if (!start) return;
        const p = point(e);
        const dx = p.clientX - start.x;
        const dy = p.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 6) return;
        start.moved = true;
        e.preventDefault();
        const left = Math.min(Math.max(0, start.left + dx), window.innerWidth - 40);
        const top = Math.min(Math.max(0, start.top + dy), window.innerHeight - 40);
        Object.assign(el.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    };

    const onUp = e => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        if (!start) return;
        if (start.moved) {
            const s = settings();
            const pos = s[posKey] ?? {};
            pos[posKey === 'devicePos' ? s.mode : 'all'] = { left: el.style.left, top: el.style.top };
            s[posKey] = pos;
            saveSettings();
        } else if (onClick) {
            if (e.type === 'touchend') e.preventDefault();
            onClick();
        }
        start = null;
    };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: true });
}

function applyDevicePosition() {
    const device = document.getElementById('stp-device');
    if (!device) return;
    const pos = settings().devicePos?.[settings().mode];
    if (pos?.left && pos?.top) {
        Object.assign(device.style, { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' });
    } else {
        Object.assign(device.style, { left: '', top: '', right: '', bottom: '' });
    }
}

function createDom() {
    const launcher = document.createElement('div');
    launcher.id = 'stp-launcher';
    launcher.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i><span class="stp-launcher-badge stp-hidden"></span>';
    document.body.appendChild(launcher);
    const lpos = settings().launcherPos?.all;
    if (lpos?.left && lpos?.top) Object.assign(launcher.style, { left: lpos.left, top: lpos.top, right: 'auto', bottom: 'auto' });
    makeDraggable(launcher, '#stp-launcher', 'launcherPos', () => (ui.open ? close() : open()));

    const device = document.createElement('div');
    device.id = 'stp-device';
    device.className = 'stp-hidden';
    document.body.appendChild(device);
    applyDevicePosition();
    makeDraggable(device, '.stp-drag', 'devicePos');

    device.addEventListener('click', e => {
        const el = e.target.closest('[data-act]');
        if (!el || !device.contains(el) || el.disabled) return;
        e.preventDefault();
        handleAction(el);
    });
    device.addEventListener('input', e => {
        const el = e.target;
        if (el.dataset?.draft) {
            ui.drafts[el.dataset.draft] = el.value;
            if (el.tagName === 'TEXTAREA') autosize(device);
        }
    });
    device.addEventListener('keydown', e => {
        const el = e.target;
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        if (el.dataset?.draft?.startsWith('thread:')) {
            e.preventDefault();
            sendText(e.ctrlKey || e.metaKey);
        } else if (el.dataset?.draft === 'new-contact') {
            e.preventDefault();
            handleAction({ dataset: { act: 'create-contact' } });
        }
    });

    // Keep the clock fresh while open.
    setInterval(() => {
        if (!ui.open) return;
        const active = document.activeElement;
        if (document.getElementById('stp-device')?.contains(active) && active.tagName !== 'BUTTON') {
            // Avoid re-rendering under the user's fingers; just patch the clock.
            const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const el = document.querySelector('#stp-device .stp-statusbar > span:first-child, #stp-device .stp-taskbar > span:last-child');
            if (el) el.textContent = t;
            return;
        }
        render();
    }, 30000);

    window.addEventListener('resize', () => {
        for (const el of [launcher, device]) {
            const rect = el.getBoundingClientRect();
            if (el.style.left && (rect.left > window.innerWidth - 40 || rect.top > window.innerHeight - 40)) {
                Object.assign(el.style, { left: '', top: '', right: '', bottom: '' });
            }
        }
    });

    const menu = document.getElementById('extensionsMenu');
    if (menu) {
        const item = document.createElement('div');
        item.id = 'stp-wand-item';
        item.className = 'list-group-item flex-container flexGap5';
        item.innerHTML = '<div class="fa-solid fa-mobile-screen-button extensionsMenuExtensionButton"></div><span>Phone / PC</span>';
        item.addEventListener('click', () => (ui.open ? close() : open()));
        menu.appendChild(item);
    }
}

// ---------------------------------------------------------------------------
// Extension settings panel
// ---------------------------------------------------------------------------

function settingsHtml() {
    return `<div id="stp-settings" class="stp-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Phone &amp; PC</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label"><input type="checkbox" data-setting="enabled"> Enabled</label>
            <label class="checkbox_label"><input type="checkbox" data-setting="showLauncher"> Show floating phone button</label>
            <label class="checkbox_label"><input type="checkbox" data-setting="notify"> Pop-up notifications for new texts</label>
            <div class="stp-settings-row">
                <label>Device</label>
                <select class="text_pole" data-setting="mode"><option value="phone">Phone</option><option value="pc">PC</option></select>
            </div>
            <div class="stp-settings-row">
                <label title="What stays in the chat message where a tag was removed">Chat marker for texts/posts</label>
                <select class="text_pole" data-setting="chatMarker">
                    <option value="short">Short (“📱 Lena texted you.”)</option>
                    <option value="full">Full (shows the text in chat)</option>
                    <option value="none">None (phone only)</option>
                </select>
            </div>
            <hr>
            <h4>Prompt injection</h4>
            <label class="checkbox_label"><input type="checkbox" data-setting="injectInstructions"> Tell the model how to text / post / search</label>
            <label class="checkbox_label"><input type="checkbox" data-setting="injectTexts"> Include recent texts</label>
            <div class="stp-settings-row"><label>Max texts</label><input class="text_pole" type="number" min="1" max="100" data-setting="maxTexts"></div>
            <label class="checkbox_label"><input type="checkbox" data-setting="injectPosts"> Include recent social posts</label>
            <div class="stp-settings-row"><label>Max posts</label><input class="text_pole" type="number" min="1" max="50" data-setting="maxPosts"></div>
            <label class="checkbox_label"><input type="checkbox" data-setting="injectSearches"> Include private searches (characters may get spoilers)</label>
            <div class="stp-settings-row"><label>Injection depth</label><input class="text_pole" type="number" min="0" max="100" data-setting="depth"></div>
            <div class="stp-settings-row">
                <label>Role</label>
                <select class="text_pole" data-setting="role"><option value="0">System</option><option value="1">User</option><option value="2">Assistant</option></select>
            </div>
            <label>Instructions <small>({{user}} / {{char}} macros work)</small></label>
            <textarea class="text_pole textarea_compact" rows="6" data-setting="instructions"></textarea>
            <div class="menu_button menu_button_icon" data-reset="instructions"><i class="fa-solid fa-rotate-left"></i> Restore default</div>
            <hr>
            <h4>Photos</h4>
            <small>Uses SillyTavern's built-in Image Generation extension — set that up first.</small>
            <label class="checkbox_label"><input type="checkbox" data-setting="images"> Enable photos</label>
            <div class="stp-settings-row">
                <label>Develop photos automatically</label>
                <select class="text_pole" data-setting="imageAuto">
                    <option value="off">Off (tap a photo to develop it)</option>
                    <option value="texts">Photos sent in texts</option>
                    <option value="all">Everything (texts, posts and feeds)</option>
                </select>
            </div>
            <label class="checkbox_label" title="Uses the per-character prompt prefix from the Image Generation extension when a photo shows the character"><input type="checkbox" data-setting="imageAppearance"> Add the character's appearance prompt to selfies</label>
            <label>Photo prompt <small>({{desc}} = photo description, {{name}} = who took it, {{appearance}} = their Image Generation character prompt)</small></label>
            <input class="text_pole" data-setting="imagePrompt">
            <div class="menu_button menu_button_icon" data-reset="imagePrompt"><i class="fa-solid fa-rotate-left"></i> Restore default</div>
            <hr>
            <h4>Peek / feed generation</h4>
            <label>Feed prompt <small>({{name}} = the character being peeked at)</small></label>
            <textarea class="text_pole textarea_compact" rows="8" data-setting="feedPrompt"></textarea>
            <div class="menu_button menu_button_icon" data-reset="feedPrompt"><i class="fa-solid fa-rotate-left"></i> Restore default</div>
            <hr>
            <div class="flex-container">
                <div class="menu_button menu_button_icon" id="stp-open-btn"><i class="fa-solid fa-mobile-screen-button"></i> Open phone</div>
                <div class="menu_button menu_button_icon" id="stp-reset-pos"><i class="fa-solid fa-up-down-left-right"></i> Reset positions</div>
            </div>
        </div>
    </div>
</div>`;
}

function syncSettingsUi() {
    const s = settings();
    document.querySelectorAll('#stp-settings [data-setting]').forEach(el => {
        const key = el.dataset.setting;
        if (el.type === 'checkbox') el.checked = !!s[key];
        else el.value = String(s[key] ?? '');
    });
}

function createSettingsPanel() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', settingsHtml());
    const root = document.getElementById('stp-settings');
    syncSettingsUi();

    root.addEventListener('input', e => {
        const el = e.target.closest('[data-setting]');
        if (!el) return;
        const key = el.dataset.setting;
        const s = settings();
        if (el.type === 'checkbox') s[key] = el.checked;
        else if (el.type === 'number' || key === 'role') s[key] = Number(el.value);
        else s[key] = el.value;
        saveSettings();
        if (key === 'mode') applyDevicePosition();
        updateInjection();
        refresh();
    });
    root.addEventListener('click', e => {
        const reset = e.target.closest('[data-reset]');
        if (reset) {
            settings()[reset.dataset.reset] = defaultSettings[reset.dataset.reset];
            saveSettings();
            syncSettingsUi();
            updateInjection();
        }
    });
    document.getElementById('stp-open-btn')?.addEventListener('click', () => open());
    document.getElementById('stp-reset-pos')?.addEventListener('click', () => {
        settings().devicePos = null;
        settings().launcherPos = null;
        saveSettings();
        applyDevicePosition();
        const launcher = document.getElementById('stp-launcher');
        if (launcher) Object.assign(launcher.style, { left: '', top: '', right: '', bottom: '' });
    });
}

function registerSlashCommand() {
    const c = ctx();
    if (!c.SlashCommandParser || !c.SlashCommand) return;
    try {
        c.SlashCommandParser.addCommandObject(c.SlashCommand.fromProps({
            name: 'phone',
            helpString: 'Open, close or toggle the in-story phone. Usage: /phone [open|close|toggle|pc|phone|messages|x|instagram|reddit|browser|music]',
            callback: (_args, value) => {
                const v = norm(value);
                if (v === 'close') close();
                else if (v === 'pc' || v === 'phone') {
                    settings().mode = v;
                    saveSettings();
                    syncSettingsUi();
                    applyDevicePosition();
                    open();
                } else if (APPS.some(a => a.id === v)) open(v);
                else if (v === 'open') open();
                else (ui.open ? close() : open());
                return '';
            },
        }));
    } catch (e) {
        console.debug('[Phone] slash command registration failed', e);
    }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function onChatChanged() {
    ui.app = ui.app === 'thread' ? 'messages' : ui.app;
    ui.contact = null;
    ui.person = null;
    ui.drafts = {};
    ui.busy = {};
    ui.imageBusy = {};
    ui.viewImage = null;
    ui.photoMode = false;
    if (hasChat()) scanChat();
    updateInjection();
    refresh();
}

function onMessage(mesId, { notify = true, reanchorAfter = true } = {}) {
    if (!settings().enabled) return;
    const id = Number(mesId);
    if (!Number.isInteger(id)) return;
    const added = processMessage(id);
    if (reanchorAfter) reanchor(id);
    if (notify) notifyItems(added);
    autoImages(added);
    updateInjection();
    refresh();
}

function registerEvents() {
    const c = ctx();
    const ev = c.eventTypes ?? c.event_types;
    const on = (name, fn) => name && c.eventSource.on(name, fn);

    on(ev.CHAT_CHANGED, onChatChanged);
    on(ev.MESSAGE_RECEIVED, id => onMessage(id));
    on(ev.CHARACTER_MESSAGE_RENDERED, id => onMessage(id));
    on(ev.MESSAGE_SENT, id => onMessage(id, { notify: false }));
    on(ev.MESSAGE_EDITED, id => onMessage(id));
    on(ev.MESSAGE_UPDATED, id => onMessage(id));
    on(ev.MESSAGE_SWIPED, id => onMessage(id, { reanchorAfter: false }));
    on(ev.MESSAGE_DELETED, newLength => {
        if (!hasChat()) return;
        pruneAfterDelete(Number(newLength));
        updateInjection();
        refresh();
    });
    on(ev.GROUP_UPDATED, () => refresh());
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

jQuery(() => {
    try {
        settings();
        createDom();
        createSettingsPanel();
        registerEvents();
        registerSlashCommand();
        onChatChanged();
    } catch (e) {
        console.error('[Phone] failed to initialise', e);
    }
});
