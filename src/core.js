// Settings, per-chat state, message anchoring, the outbox and people.
import { hashString, norm, sameName } from './util.js';
import { DEFAULT_PROMPTS } from './prompts-default.js';

export const MODULE = 'st_phone';
export const META_KEY = 'st_phone';
export const PROMPT_KEY = 'st_phone_context';

export const ctx = () => SillyTavern.getContext();

export const defaultSettings = {
    enabled: true,
    showLauncher: true,
    mode: 'phone',
    theme: 'dark',
    wallpaper: 'aurora',
    customWallpaper: '',
    notify: true,
    textDelivery: 'instant',
    hidePhoneInChat: true,
    replyTokens: 600,
    phoneProfile: '',
    phoneHistory: 30,
    lockScreen: true,
    skin: 'classic',
    spamTexts: true,
    focusPhoneOnly: true,
    chatMarker: 'short',
    injectInstructions: true,
    injectTexts: true,
    maxTexts: 15,
    injectPosts: true,
    maxPosts: 4,
    injectMoney: true,
    injectOrders: true,
    injectSearches: false,
    depth: 1,
    role: 0,
    peekTokens: 1800,
    injectDevice: true,
    ignoreIntro: false,
    streamPhone: true,
    snoopNoticed: false,
    // money
    currency: '$',
    startingBalance: 1250,
    // photos
    images: true,
    imageProvider: 'auto',
    imageAuto: 'texts',
    imageAppearance: true,
    imagePrompt: '{{desc}}, candid smartphone photo',
    imageCommand: '/imagine quiet=true {{prompt}}',
    adoptChatImages: true,
    pollinationsModel: 'flux',
    openaiEndpoint: 'https://api.openai.com/v1/images/generations',
    openaiKey: '',
    openaiModel: 'gpt-image-1',
    openaiSize: '1024x1536',
    // adult
    adultApps: false,
    blurAdult: true,
    revealAnon: false,
    // prompts (overrides of DEFAULT_PROMPTS, by key)
    prompts: {},
    // window positions
    devicePos: null,
    launcherPos: null,
};

export function settings() {
    const es = ctx().extensionSettings;
    if (!es[MODULE]) es[MODULE] = {};
    const s = es[MODULE];
    for (const [k, v] of Object.entries(defaultSettings)) {
        if (s[k] === undefined) s[k] = structuredClone(v);
    }
    // v0.1 stored these at the top level.
    if (typeof s.instructions === 'string' && s.instructions && !s.prompts.instructions && s.instructions !== DEFAULT_PROMPTS.instructions) {
        s.prompts.instructions = s.instructions;
    }
    if (typeof s.feedPrompt === 'string' && s.feedPrompt) delete s.feedPrompt;
    delete s.instructions;
    return s;
}

export function saveSettings() {
    ctx().saveSettingsDebounced();
}

export function promptText(key) {
    const custom = settings().prompts?.[key];
    return typeof custom === 'string' && custom.trim() ? custom : DEFAULT_PROMPTS[key] ?? '';
}

export function hasChat() {
    return !!ctx().getCurrentChatId?.();
}

export function userName() {
    return ctx().name1 || 'User';
}

// SillyTavern's persona module, for the current persona's avatar (loaded at start).
let personas = null;
export async function loadPersonaModule() {
    try {
        personas = await import('/scripts/personas.js');
    } catch {
        personas = null;
    }
}

/** The SillyTavern persona {{user}} is using right now: name, description and picture. */
export function persona() {
    const c = ctx();
    const pu = c.powerUserSettings ?? {};
    const avatarId = personas?.user_avatar
        || document.querySelector('#user_avatar_block .avatar-container.selected')?.getAttribute('data-avatar-id')
        || '';
    const desc = pu.persona_descriptions?.[avatarId] ?? {};
    return {
        name: userName(),
        avatarId,
        title: String(desc.title ?? '').trim(),
        description: String(pu.persona_description ?? desc.description ?? '').trim(),
        avatar: avatarId ? (c.getThumbnailUrl?.('persona', avatarId) ?? `User Avatars/${avatarId}`) : null,
    };
}

/**
 * Remembers the persona used in this chat. Names used earlier in the chat still
 * count as {{user}}, so switching personas doesn't hand your old texts and posts
 * to someone else. Returns the persona if it changed.
 */
export function registerPersona() {
    const meta = ctx().chatMetadata;
    if (!meta) return null;
    const st = state();
    const p = persona();
    st.personaNames ??= [];
    if (!st.personaNames.some(n => sameName(n, p.name))) st.personaNames.push(p.name);
    const prev = st.persona;
    if (prev && prev.name === p.name && prev.avatarId === p.avatarId) return null;
    st.persona = { name: p.name, avatarId: p.avatarId, at: Date.now() };
    saveState();
    return prev ? p : null;
}

export function isUser(name) {
    if (sameName(name, userName()) || norm(name) === '{{user}}' || norm(name) === 'you') return true;
    const known = ctx().chatMetadata?.[META_KEY]?.personaNames;
    return Array.isArray(known) && known.some(n => sameName(n, name));
}

/** Replaces {{extra}} keys then SillyTavern macros. */
export function sub(text, extra = {}) {
    let out = String(text ?? '');
    for (const [k, v] of Object.entries(extra)) out = out.replaceAll(`{{${k}}}`, String(v ?? ''));
    return ctx().substituteParams(out);
}

export function state() {
    const meta = ctx().chatMetadata ?? {};
    if (!meta[META_KEY] || typeof meta[META_KEY] !== 'object') meta[META_KEY] = {};
    const st = meta[META_KEY];
    st.items ??= [];
    st.profiles ??= {};
    st.contacts ??= [];
    st.notes ??= [];
    st.groups ??= [];
    st.plans ??= [];
    st.news ??= { articles: [] };
    st.live ??= { streams: [] };
    st.seq ??= 0;
    st.batch ??= 0;
    st.wallet ??= {};
    st.shop ??= { query: '', results: [] };
    st.food ??= { restaurants: [], cart: null };
    st.spark ??= {};
    st.spark.me ??= { bio: '', photo: '', lookingFor: '' };
    st.spark.deck ??= [];
    st.spark.matches ??= [];
    st.spark.passed ??= [];
    st.spark.liked ??= [];
    st.rated ??= {};
    st.chord ??= { servers: [] };
    st.tg ??= { channels: [], reveals: 0 };
    st.velvet ??= { creators: [] };
    st.velvet.me ??= { posts: [], price: 9.99, bio: '', cashedOut: 0 };
    st.devices ??= {};
    return st;
}

export function saveState() {
    if (!hasChat()) return;
    const c = ctx();
    // Whoever is using the phone right now is {{user}} for this chat, even after a persona switch.
    const st = c.chatMetadata?.[META_KEY];
    if (st && c.name1 && !(st.personaNames ??= []).some(n => sameName(n, c.name1))) st.personaNames.push(c.name1);
    if (typeof c.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
    else c.saveMetadata();
}

export function nextId(st = state()) {
    st.seq += 1;
    return `${Date.now().toString(36)}-${st.seq}`;
}

/** A group text conversation by name (case-insensitive). */
export function findGroup(name) {
    return state().groups.find(g => sameName(g.name, name)) ?? null;
}

/** Makes sure a group exists and includes these members. */
export function ensureGroup(name, members = []) {
    const st = state();
    let g = findGroup(name);
    if (!g) {
        g = { name, members: [] };
        st.groups.push(g);
    }
    for (const m of members) {
        if (m && !isUser(m) && !g.members.some(x => sameName(x, m))) g.members.push(m);
    }
    return g;
}

// ---------------------------------------------------------------------------
// Change notifications: modules call changed(); the UI subscribes.
// ---------------------------------------------------------------------------

const listeners = new Set();

export function onChange(fn) {
    listeners.add(fn);
}

export function changed() {
    for (const fn of listeners) {
        try {
            fn();
        } catch (e) {
            console.error('[Phone] listener failed', e);
        }
    }
}

// ---------------------------------------------------------------------------
// Anchoring: every item that came from (or was delivered with) a chat message is
// anchored to that message's content. Swiping away, regenerating or deleting the
// message hides the item; swiping back brings it back.
// ---------------------------------------------------------------------------

const hashCache = new WeakMap();

export function mesHash(message) {
    const cached = hashCache.get(message);
    if (cached && cached.mes === message.mes) return cached.hash;
    const hash = hashString(`${message.is_user ? 1 : 0}|${message.mes}`);
    hashCache.set(message, { mes: message.mes, hash });
    return hash;
}

export function liveIndex() {
    const map = new Map();
    (ctx().chat ?? []).forEach((m, i) => {
        if (m && typeof m.mes === 'string') map.set(mesHash(m), i);
    });
    return map;
}

export function makeAnchor(mesId) {
    const m = ctx().chat[mesId];
    return { hash: mesHash(m), mesId, swipeId: m.swipe_id ?? 0 };
}

/**
 * The intro: every character message before {{user}}'s first one (the greeting,
 * or several in a group chat). Phone traffic doesn't count as {{user}} speaking.
 * @param {object[]} chat
 * @returns {Set<object>} the intro messages
 */
export function introMessages(chat = ctx().chat ?? []) {
    const out = new Set();
    for (const m of chat) {
        if (!m || m.is_system) continue;
        if (m.is_user || m.extra?.stp_phone) break;
        out.add(m);
    }
    return out;
}

/** Chat positions of the intro, when "Ignore intro messages" is on (else empty). */
function ignoredIntroIndexes() {
    if (!settings().ignoreIntro) return null;
    const chat = ctx().chat ?? [];
    const intro = introMessages(chat);
    if (!intro.size) return null;
    const out = new Set();
    chat.forEach((m, i) => intro.has(m) && out.add(i));
    return out;
}

function isLive(item, index, ignored) {
    if (!item.anchor) return true;
    const i = index.get(item.anchor.hash);
    if (i === undefined) return false;
    item.anchor.mesId = i;
    // Texts, posts and so on written in an ignored intro don't exist for the phone.
    if (ignored?.has(i)) return false;
    return true;
}

export function liveItems() {
    const index = liveIndex();
    const ignored = ignoredIntroIndexes();
    return state().items.filter(it => isLive(it, index, ignored));
}

/** Messages edited or continued keep their phone items. */
export function reanchor(mesId) {
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

/** How many chat messages have been sent since an item happened (drives deliveries, votes…). */
export function messagesSince(item) {
    if (item.status === 'pending') return -1;
    const len = (ctx().chat ?? []).length;
    if (typeof item.sentAtLen === 'number') return Math.max(0, len - item.sentAtLen);
    if (item.anchor) return Math.max(0, len - (item.anchor.mesId + 1));
    return 99;
}

// ---------------------------------------------------------------------------
// Outbox: things {{user}} does on the device are queued and delivered with the
// next chat message.
// ---------------------------------------------------------------------------

export function queueItem(item) {
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
    changed();
    return full;
}

export function pendingItems() {
    return state().items.filter(x => x.status === 'pending');
}

export function commitPending() {
    const st = state();
    const pending = pendingItems();
    if (!pending.length) return [];
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
        it.sentAtLen = chat.length;
        it.anchor = anchor ? { ...anchor } : null;
    });
    saveState();
    return pending;
}

export function isJustSent(item) {
    const st = state();
    const len = (ctx().chat ?? []).length;
    return item.source === 'user' && item.batch && item.batch === st.batch && st.lastBatchLen !== undefined && len <= st.lastBatchLen;
}

export function pruneAfterDelete(newLength) {
    const st = state();
    const index = liveIndex();
    st.items = st.items.filter(it => {
        if (!it.anchor || it.anchor.mesId < newLength) return true;
        if (it.source === 'user') {
            // The message these were sent with is gone: put them back in the outbox.
            it.status = 'pending';
            it.anchor = null;
            delete it.sentAtLen;
            return true;
        }
        return false;
    });
    for (const it of st.items) {
        if (it.source === 'user' && it.status === 'sent' && it.anchor && !index.has(it.anchor.hash)) {
            it.status = 'pending';
            it.anchor = null;
            delete it.sentAtLen;
        }
    }
    saveState();
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function chatCharacters() {
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

/** Who to peek at: just the chat's character(s), not every side character the phone knows. */
export function cast() {
    const list = chatCharacters();
    return list.length ? list : people().slice(0, 1);
}

export function isChatCharacter(name) {
    return chatCharacters().some(n => sameName(n, name));
}

/** Everyone {{user}} knows: chat characters, saved contacts and anyone who texted, paid, called… */
export function people() {
    const out = [];
    const add = n => {
        if (n && typeof n === 'string' && !isUser(n) && !out.some(x => sameName(x, n))) out.push(n);
    };
    chatCharacters().forEach(add);
    const st = state();
    st.contacts.forEach(add);
    Object.keys(st.profiles).forEach(add);
    for (const it of liveItems()) {
        if (it.kind === 'post' && it.app === 'rated') continue;
        if (it.stranger) continue;
        if (it.kind === 'sms' && it.app === 'spark') continue;
        if (it.kind === 'sms' || it.kind === 'call') add(it.contact);
        else if (it.kind === 'pay') {
            add(it.from);
            add(it.to);
        } else if (it.kind === 'order') {
            add(it.from);
            add(it.recipient);
        } else add(it.from);
    }
    return out;
}

export function avatarUrl(name) {
    const c = ctx();
    if (isUser(name)) {
        const own = persona().avatar;
        if (own) return own;
        const chat = c.chat ?? [];
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i]?.is_user && chat[i].force_avatar) return chat[i].force_avatar;
        }
        return null;
    }
    const ch = c.characters?.find(x => sameName(x.name, name));
    if (ch?.avatar && ch.avatar !== 'none') return c.getThumbnailUrl('avatar', ch.avatar);
    const match = state().spark.matches.find(x => sameName(x.name, name));
    if (match?.imageUrl) return match.imageUrl;
    return null;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export function money(n) {
    const v = Number(n) || 0;
    const sign = v < 0 ? '-' : '';
    return `${sign}${settings().currency}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function balance() {
    const st = state();
    let b = Number(st.wallet.start ?? settings().startingBalance) || 0;
    b += Number(st.wallet.topUps ?? 0) || 0;
    for (const it of liveItems()) {
        if (it.kind === 'pay' && it.payType === 'pay') {
            if (isUser(it.to) && it.status === 'sent') b += Number(it.amount) || 0;
            if (isUser(it.from)) b -= Number(it.amount) || 0;
        }
        if (it.kind === 'order' && isUser(it.from)) b -= Number(it.price) || 0;
    }
    return Math.round(b * 100) / 100;
}

/** Find any object that can hold a generated image by id (items, catalog entries, profiles…). */
export function findById(id) {
    const st = state();
    return st.items.find(x => x.id === id)
        ?? st.shop.results.find(x => x.id === id)
        ?? st.food.restaurants.find(x => x.id === id)
        ?? st.food.restaurants.flatMap(r => r.menu ?? []).find(x => x.id === id)
        ?? st.spark.deck.find(x => x.id === id)
        ?? st.spark.matches.find(x => x.id === id)
        ?? (st.spark.me.id === id ? st.spark.me : null)
        ?? Object.values(st.profiles).map(p => p.dating).find(x => x?.id === id)
        ?? st.tg.channels.flatMap(c => c.posts ?? []).find(x => x.id === id)
        ?? st.velvet.creators.flatMap(c => [c.cover, c.pic, ...(c.posts ?? [])]).find(x => x?.id === id)
        ?? st.velvet.me.posts.find(x => x.id === id)
        ?? Object.values(st.devices).flatMap(d => [...(d.photos ?? []), ...(d.threads ?? []).flatMap(t => t.messages)]).find(x => x.id === id)
        ?? (st.games?.games ?? []).find(x => x.id === id)
        ?? Object.values(st.devices).flatMap(d => d.games?.games ?? []).find(x => x.id === id)
        ?? null;
}
