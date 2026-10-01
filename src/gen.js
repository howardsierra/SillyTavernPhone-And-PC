// Quiet-prompt generation (peeks, catalogs, feeds) with lenient JSON parsing.
import { changed, ctx, isUser, nextId, promptText, saveState, settings, state, sub } from './core.js';
import { storyContext } from './context.js';
import { autoImages } from './images.js';
import { updateInjection } from './inject.js';
import { arr, norm, parseAgo, parseJson, sameName, str, toMoney, toNum } from './util.js';

let quietDepth = 0;
const busy = new Set();

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
 */
export async function runJson(key, vars = {}, { busyKey = key, asCharacter = null } = {}) {
    if (busy.has(busyKey)) return null;
    busy.add(busyKey);
    changed();
    const c = ctx();
    try {
        // Card-only for chats without an intro, card + intro, or card + chat history.
        const template = promptText(key);
        const context = storyContext(asCharacter ?? vars.name ?? null);
        const prompt = sub(template.includes('{{context}}') ? template : `${template}\n\n{{context}}`, { ...vars, context });
        let forceChId = null;
        if (c.groupId && asCharacter) {
            const idx = c.characters.findIndex(x => sameName(x.name, asCharacter));
            if (idx >= 0) forceChId = idx;
        }
        quietDepth++;
        updateInjection();
        let raw;
        try {
            if (c.generateQuietPrompt.length === 0) {
                raw = await c.generateQuietPrompt({
                    quietPrompt: prompt,
                    skipWIAN: false,
                    removeReasoning: true,
                    forceChId,
                    responseLength: Number(settings().peekTokens) || null,
                });
            } else {
                raw = await c.generateQuietPrompt(prompt, false, false);
            }
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
        changed();
    }
}

/** Peek into a character's phone: replaces their previous generated snapshot. */
export async function peek(name) {
    const data = await runJson('peek', { name }, { busyKey: `peek:${norm(name)}`, asCharacter: name });
    if (!data) return;
    const st = state();
    const now = Date.now();
    st.items = st.items.filter(x => !(x.source === 'gen' && sameName(x.owner ?? x.from, name)));

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
        : null;
    st.profiles[name] = {
        handles: typeof data.handles === 'object' && data.handles ? data.handles : {},
        bio: typeof data.bio === 'object' && data.bio ? data.bio : {},
        generatedAt: now,
        dating,
    };

    const base = { from: name, owner: name, source: 'gen', status: 'sent', read: true, anchor: null };
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
    push(arr(data.x), e => e.text ? { kind: 'post', app: 'x', text: str(e.text), image: str(e.image), likes: toNum(e.likes), reposts: toNum(e.reposts ?? e.retweets), replies: toNum(e.replies) } : null);
    push(arr(data.instagram), e => (e.caption || e.image) ? {
        kind: 'post', app: 'instagram', text: str(e.caption), image: str(e.image) || 'a photo', likes: toNum(e.likes),
        comments: arr(e.comments).map(x => ({ user: str(x.user), text: str(x.text) })).slice(0, 4),
    } : null);
    push(arr(data.reddit), e => (e.body || e.title) ? {
        kind: 'post', app: 'reddit', postType: norm(e.type) === 'comment' ? 'comment' : 'post',
        sub: str(e.subreddit ?? e.sub), title: str(e.title), parent: str(e.thread ?? e.parent),
        text: str(e.body), upvotes: toNum(e.upvotes ?? e.score), commentCount: toNum(e.comments),
    } : null);
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

    saveState();
    updateInjection();
    changed();
    autoImages(added, { fromFeed: true });
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
