// Quiet-prompt generation (peeks, catalogs, feeds) with lenient JSON parsing.
import { changed, isUser, liveItems, nextId, people, promptText, saveState, state, sub } from './core.js';
import { storyContext } from './context.js';
import { llm } from './llm.js';
import { autoImages } from './images.js';
import { updateInjection } from './inject.js';
import { arr, norm, parseAgo, parseJson, sameName, str, toMoney, toNum } from './util.js';

let quietDepth = 0;
const busy = new Set();
const running = new Map();

export function isQuietGenerating() {
    return quietDepth > 0;
}

export function isBusy(key) {
    return busy.has(key);
}

/**
 * Runs one of the prompt templates as a quiet prompt and returns parsed JSON.
 * @param {string} key Prompt key
 * @param {object} vars Template variables ({{name}}, {{query}}…)
 * @param {object} opts
 * @param {string} [opts.busyKey] UI busy marker
 * @param {string} [opts.asCharacter] In group chats, generate as this member
 * @param {boolean} [opts.queue] If the same thing is already generating, wait for it and run after (instead of skipping)
 */
export async function runJson(key, vars = {}, { busyKey = key, asCharacter = null, queue = false } = {}) {
    if (busy.has(busyKey) && !queue) return null;
    while (busy.has(busyKey)) await running.get(busyKey);
    let finish;
    running.set(busyKey, new Promise(r => {
        finish = r;
    }));
    busy.add(busyKey);
    changed();
    try {
        // Card-only for chats without an intro, card + intro, or card + chat history.
        const template = promptText(key);
        const context = storyContext(asCharacter ?? vars.name ?? null);
        const prompt = sub(template.includes('{{context}}') ? template : `${template}\n\n{{context}}`, { ...vars, context });
        quietDepth++;
        updateInjection();
        let raw;
        try {
            raw = await llm(prompt, { asCharacter });
        } finally {
            quietDepth--;
            updateInjection();
        }
        const data = parseJson(raw);
        if (!data || typeof data !== 'object') {
            console.warn('[Phone] unparseable response', raw);
            toastr.error('The model didn\'t return usable data. Try again, or raise "Peek response length" in the settings.', 'Phone');
            return null;
        }
        return data;
    } catch (e) {
        console.error('[Phone] generation failed', e);
        toastr.error(String(e?.message ?? e), 'Phone: generation failed');
        return null;
    } finally {
        busy.delete(busyKey);
        running.delete(busyKey);
        finish();
        changed();
    }
}

// ---------------------------------------------------------------------------
// Mapping generated entries to phone items
// ---------------------------------------------------------------------------

/** Maps one generated social post to item fields (or null if unusable). */
export function mapPost(app, e) {
    if (app === 'x') {
        return e.text ? { kind: 'post', app: 'x', text: str(e.text), image: str(e.image), likes: toNum(e.likes), reposts: toNum(e.reposts ?? e.retweets), replies: toNum(e.replies) } : null;
    }
    if (app === 'instagram') {
        return (e.caption || e.image) ? {
            kind: 'post', app: 'instagram', text: str(e.caption), image: str(e.image) || 'a photo', likes: toNum(e.likes),
            comments: arr(e.comments).map(x => ({ user: str(x.user), text: str(x.text) })).slice(0, 4),
        } : null;
    }
    if (app === 'reddit') {
        return (e.body || e.title) ? {
            kind: 'post', app: 'reddit', postType: norm(e.type) === 'comment' ? 'comment' : 'post',
            sub: str(e.subreddit ?? e.sub), title: str(e.title), parent: str(e.thread ?? e.parent),
            text: str(e.body), image: str(e.image), upvotes: toNum(e.upvotes ?? e.score), commentCount: toNum(e.comments),
        } : null;
    }
    return null;
}

const GEN_BASE = { source: 'gen', status: 'sent', read: true, anchor: null };

/** Times for a batch: fresh batches count back from now, "load more" batches continue below the oldest item. */
function batchTime(entry, i, oldest) {
    const back = parseAgo(entry.ago ?? entry.time, i);
    if (oldest === null) return Date.now() - back;
    return oldest - Math.max(back, (i + 1) * 2 * 3600e3);
}

function oldestTime(items) {
    return items.length ? Math.min(...items.map(x => x.time)) : Date.now();
}

function alreadyThere(list, label) {
    if (!list.length) return '';
    return `These already exist — do NOT repeat them; write OLDER ${label} from before them:\n${list.slice(0, 15).map(x => `- ${String(x).replace(/\s+/g, ' ').slice(0, 110)}`).join('\n')}`;
}

function setProfile(name, patch) {
    const st = state();
    const prev = st.profiles[name] ?? {};
    st.profiles[name] = {
        ...prev,
        handles: { ...(prev.handles ?? {}), ...(patch.handles ?? {}) },
        bio: { ...(prev.bio ?? {}), ...(patch.bio ?? {}) },
        peeked: { ...(prev.peeked ?? {}), ...(patch.peeked ?? {}) },
        ...(patch.dating !== undefined ? { dating: patch.dating } : {}),
        ...(patch.generatedAt ? { generatedAt: patch.generatedAt } : {}),
    };
}

// ---------------------------------------------------------------------------
// Peeks
// ---------------------------------------------------------------------------

export const SOCIAL = {
    x: {
        name: 'X (Twitter)', count: '10-14',
        shape: '{"text": "...", "image": "optional: what an attached photo shows (or leave empty)", "ago": "2h", "likes": 12, "reposts": 1, "replies": 3}',
    },
    instagram: {
        name: 'Instagram', count: '8-10',
        shape: '{"image": "detailed description of the photo", "caption": "...", "ago": "1d", "likes": 87, "comments": [{"user": "@someone", "text": "..."}]}',
    },
    reddit: {
        name: 'Reddit', count: '10-14 (a mix of posts and comments)',
        shape: '{"type": "post or comment", "subreddit": "r/...", "title": "post title (posts only)", "thread": "thread they commented in (comments only)", "body": "...", "ago": "3h", "upvotes": 45, "comments": 12}',
    },
};

function ownPosts(name, app) {
    return liveItems().filter(x => x.kind === 'post' && x.app === app && sameName(x.from, name) && !x.stranger);
}

/**
 * Peek at one app on a character's phone. Fills their whole profile feed;
 * with `more`, appends older posts instead of replacing.
 */
export async function peekApp(name, app, { more = false } = {}) {
    if (app === 'browser') return peekBrowser(name, { more });
    if (app === 'music') return peekMusic(name, { more });
    const meta = SOCIAL[app];
    if (!meta) return peek(name);
    const existing = ownPosts(name, app).sort((a, b) => b.time - a.time);
    const data = await runJson('peekSocial', {
        name, appName: meta.name, count: meta.count, shape: meta.shape,
        more: more ? alreadyThere(existing.map(p => p.title || p.text || p.image), 'posts') : '',
    }, { busyKey: `peek:${app}:${norm(name)}`, asCharacter: name });
    if (!data) return;
    const st = state();
    const oldest = more ? oldestTime(existing) : null;
    if (!more) st.items = st.items.filter(x => !(x.source === 'gen' && x.kind === 'post' && x.app === app && sameName(x.owner ?? x.from, name) && !x.feed));
    const posts = arr(data.posts ?? data[app]);
    const added = [];
    posts.forEach((e, i) => {
        const mapped = mapPost(app, e);
        if (!mapped) return;
        const item = { id: nextId(st), time: batchTime(e, i, oldest), from: name, owner: name, ...GEN_BASE, ...mapped };
        st.items.push(item);
        added.push(item);
    });
    setProfile(name, {
        handles: data.handle ? { [app]: str(data.handle) } : {},
        bio: data.bio ? { [app]: str(data.bio) } : {},
        peeked: { [app]: Date.now() },
    });
    finish(added);
}

async function peekBrowser(name, { more = false } = {}) {
    const items = liveItems().filter(x => sameName(x.from, name));
    const searches = items.filter(x => x.kind === 'search').sort((a, b) => b.time - a.time);
    const visits = items.filter(x => x.kind === 'visit').sort((a, b) => b.time - a.time);
    const data = await runJson('peekBrowser', {
        name, more: more ? alreadyThere([...searches.map(x => x.text), ...visits.map(x => x.title)], 'searches and pages') : '',
    }, { busyKey: `peek:browser:${norm(name)}`, asCharacter: name });
    if (!data) return;
    const st = state();
    const oldest = more ? oldestTime([...searches, ...visits]) : null;
    if (!more) st.items = st.items.filter(x => !(x.source === 'gen' && (x.kind === 'search' || x.kind === 'visit') && sameName(x.owner ?? x.from, name)));
    const added = [];
    arr(data.searches).forEach((e, i) => {
        if (!e.query) return;
        const it = { id: nextId(st), time: batchTime(e, i, oldest), from: name, owner: name, ...GEN_BASE, kind: 'search', text: str(e.query) };
        st.items.push(it);
        added.push(it);
    });
    arr(data.history).forEach((e, i) => {
        if (!e.title && !e.url) return;
        const it = { id: nextId(st), time: batchTime(e, i, oldest), from: name, owner: name, ...GEN_BASE, kind: 'visit', title: str(e.title ?? e.url), url: str(e.url) };
        st.items.push(it);
        added.push(it);
    });
    setProfile(name, { peeked: { browser: Date.now() } });
    finish(added);
}

async function peekMusic(name, { more = false } = {}) {
    const tracks = liveItems().filter(x => x.kind === 'music' && sameName(x.from, name)).sort((a, b) => b.time - a.time);
    const data = await runJson('peekMusic', {
        name, more: more ? alreadyThere(tracks.map(t => `${t.title} — ${t.artist}`), 'songs') : '',
    }, { busyKey: `peek:music:${norm(name)}`, asCharacter: name });
    if (!data) return;
    const st = state();
    const oldest = more ? oldestTime(tracks) : null;
    if (!more) st.items = st.items.filter(x => !(x.source === 'gen' && x.kind === 'music' && sameName(x.owner ?? x.from, name)));
    const added = [];
    arr(data.tracks ?? data.music).forEach((e, i) => {
        if (!e.track) return;
        const it = { id: nextId(st), time: batchTime(e, i, oldest), from: name, owner: name, ...GEN_BASE, kind: 'music', title: str(e.track), artist: str(e.artist) };
        st.items.push(it);
        added.push(it);
    });
    setProfile(name, { peeked: { music: Date.now() } });
    finish(added);
}

/**
 * {{user}}'s own home timeline on a social app: story characters mixed with
 * friends, strangers, celebrities and news. `more` appends older posts.
 */
export async function generateFeed(app, { more = false } = {}) {
    const meta = SOCIAL[app];
    if (!meta) return;
    const existing = liveItems().filter(x => x.feed === app).sort((a, b) => b.time - a.time);
    const known = people();
    const data = await runJson('feed', {
        appName: meta.name,
        count: '12-16',
        shape: meta.shape.replace('{', '{"author": "display name", "handle": "@handle", '),
        people: known.length ? known.join(', ') : '(none)',
        more: more ? alreadyThere(existing.map(p => `${p.from}: ${p.title || p.text || p.image}`), 'posts') : '',
    }, { busyKey: `feed:${app}` });
    if (!data) return;
    const st = state();
    const oldest = more ? oldestTime(existing) : null;
    if (!more) st.items = st.items.filter(x => !(x.source === 'gen' && x.feed === app));
    const added = [];
    arr(data.posts ?? data.feed).forEach((e, i) => {
        const mapped = mapPost(app, e);
        if (!mapped) return;
        const author = str(e.author) || str(e.handle) || 'someone';
        const match = known.find(n => sameName(n, author) || sameName(n, str(e.author).split(/\s+/)[0]));
        if (match && isUser(match)) return;
        const item = {
            id: nextId(st), time: batchTime(e, i, oldest), ...GEN_BASE, ...mapped,
            from: match ?? author, owner: `feed:${app}`, feed: app, stranger: !match, handle: str(e.handle),
        };
        if (isUser(item.from)) return;
        st.items.push(item);
        added.push(item);
    });
    st.feeds ??= {};
    st.feeds[app] = Date.now();
    finish(added);
}

function finish(added) {
    saveState();
    updateInjection();
    changed();
    autoImages(added, { fromFeed: true });
}

/**
 * Peek at the rest of a character's phone: money, orders, location, dating
 * profile (and anything else a custom prompt returns). Only replaces the
 * sections the model actually returned.
 */
export async function peek(name) {
    const data = await runJson('peek', { name }, { busyKey: `peek:life:${norm(name)}`, asCharacter: name });
    if (!data) return;
    const st = state();
    const now = Date.now();

    const sections = {
        location: x => x.kind === 'location',
        searches: x => x.kind === 'search',
        history: x => x.kind === 'visit',
        x: x => x.kind === 'post' && x.app === 'x',
        instagram: x => x.kind === 'post' && x.app === 'instagram',
        reddit: x => x.kind === 'post' && x.app === 'reddit',
        music: x => x.kind === 'music',
        payments: x => x.kind === 'pay',
        orders: x => x.kind === 'order',
    };
    for (const [key, test] of Object.entries(sections)) {
        if (data[key] === undefined) continue;
        st.items = st.items.filter(x => !(x.source === 'gen' && !x.feed && sameName(x.owner ?? x.from, name) && test(x)));
    }

    const prev = st.profiles[name] ?? {};
    const dating = data.dating && typeof data.dating === 'object' && data.dating.onApp
        ? {
            id: prev.dating?.id ?? nextId(st),
            name,
            bio: str(data.dating.bio),
            prompts: arr(data.dating.prompts).map(p => ({ q: str(p.q), a: str(p.a) })).filter(p => p.q && p.a).slice(0, 3),
            photo: str(data.dating.photo),
            image: str(data.dating.photo),
            lookingFor: str(data.dating.lookingFor),
            imageUrl: prev.dating?.photo === str(data.dating.photo) ? prev.dating?.imageUrl : undefined,
        }
        : data.dating !== undefined ? null : prev.dating;
    setProfile(name, {
        handles: typeof data.handles === 'object' && data.handles ? data.handles : {},
        bio: typeof data.bio === 'object' && data.bio ? data.bio : {},
        generatedAt: now,
        peeked: { life: now },
        dating,
    });

    const base = { from: name, owner: name, ...GEN_BASE };
    const added = [];
    const push = (list, map) => list.forEach((entry, i) => {
        const mapped = map(entry);
        if (!mapped) return;
        const item = { id: nextId(st), time: now - parseAgo(entry.ago ?? entry.time, i), ...base, ...mapped };
        st.items.push(item);
        added.push(item);
    });

    if (data.location && typeof data.location === 'object' && data.location.place) {
        push([data.location], e => ({ kind: 'location', place: str(e.place), text: str(e.activity) }));
    }
    push(arr(data.searches), e => e.query ? { kind: 'search', text: str(e.query) } : null);
    push(arr(data.history), e => (e.title || e.url) ? { kind: 'visit', title: str(e.title ?? e.url), url: str(e.url) } : null);
    for (const app of Object.keys(SOCIAL)) push(arr(data[app]), e => mapPost(app, e));
    push(arr(data.music), e => e.track ? { kind: 'music', title: str(e.track), artist: str(e.artist) } : null);
    push(arr(data.payments), e => {
        const amount = toMoney(e.amount);
        if (!amount) return null;
        const from = str(e.from) || name;
        const to = str(e.to) || 'someone';
        if (isUser(from) || isUser(to)) return null;
        return { kind: 'pay', payType: 'pay', from, to, amount, note: str(e.note) };
    });
    push(arr(data.orders), e => e.item ? { kind: 'order', app: 'shop', from: name, recipient: name, item: str(e.item), price: toMoney(e.price), store: str(e.store) } : null);

    finish(added);
}

/** Ask where a character is right now (cheap, single field). */
export async function locate(name) {
    const data = await runJson('locate', { name }, { busyKey: `locate:${norm(name)}`, asCharacter: name });
    if (!data?.place) return;
    const st = state();
    st.items = st.items.filter(x => !(x.kind === 'location' && x.source === 'gen' && sameName(x.from, name)));
    st.items.push({
        id: nextId(st), kind: 'location', from: name, owner: name, source: 'gen', status: 'sent', read: true, anchor: null,
        place: str(data.place), text: str(data.activity), time: Date.now() - parseAgo(data.ago, 0),
    });
    saveState();
    changed();
}
