// Pulls phone tags out of chat messages, stores them and rewrites the message.
import { ctx, isUser, makeAnchor, money, nextId, saveState, settings, state, userName } from './core.js';
import { wrapPlainReply } from './turn.js';
import { hashString, norm, str, toMoney } from './util.js';

const TAGS = 'sms|text|call|post|anon|search|pay|request|order|location';
const TAG_RE = new RegExp(`<(${TAGS})\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/\\1\\s*>)`, 'gi');

export const APP_NAMES = { x: 'X', instagram: 'Instagram', reddit: 'Reddit', rated: 'Rated' };

function parseAttrs(s) {
    const out = {};
    const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
    let m;
    while ((m = re.exec(s))) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    return out;
}

export function hasTags(text) {
    TAG_RE.lastIndex = 0;
    const result = TAG_RE.test(String(text ?? ''));
    TAG_RE.lastIndex = 0;
    return result;
}

function normApp(value) {
    const v = norm(value);
    if (['x', 'twitter', 'tweet', 'x/twitter'].includes(v)) return 'x';
    if (['instagram', 'ig', 'insta'].includes(v)) return 'instagram';
    if (['reddit', 'r'].includes(v)) return 'reddit';
    if (['rated', 'anon', 'anonymous'].includes(v)) return 'rated';
    return 'x';
}

function orderApp(value) {
    return ['food', 'eats', 'munch', 'delivery', 'takeout', 'restaurant'].includes(norm(value)) ? 'food' : 'shop';
}

function oneLine(text) {
    return String(text).replace(/\s*\n+\s*/g, ' / ');
}

function marker(kind, d) {
    // Phone-only roleplay reads like a transcript, so it always shows the full text.
    const mode = state().phoneOnly ? 'full' : settings().chatMarker;
    if (mode === 'none') return '';
    const user = userName();
    const full = mode === 'full';
    switch (kind) {
        case 'sms': {
            const target = d.dir === 'out' ? d.contact : user;
            const photo = d.image ? `[photo: ${d.image}] ` : '';
            if (full) return `📱 **${d.from} → ${target}:** ${photo}${oneLine(d.body)}`.trim();
            if (d.app === 'spark') return `*📱 ${d.from} messaged ${target} on Spark.*`;
            return d.image ? `*📱 ${d.from} sent ${target} a photo.*` : `*📱 ${d.from} texted ${target}.*`;
        }
        case 'call':
            if (d.status === 'missed') return `*📱 Missed call from ${d.from}.*`;
            if (d.status === 'declined') return `*📱 ${d.from} declined the call.*`;
            return `*📱 ${d.from} is calling ${d.contact === d.from ? user : d.contact}.*`;
        case 'post':
            if (full) return `📱 **${d.from} on ${APP_NAMES[d.app]}:** ${oneLine(d.body)}`;
            return `*📱 ${d.from} posted on ${APP_NAMES[d.app]}.*`;
        case 'pay':
            return d.payType === 'request'
                ? `*📱 ${d.from} requested ${money(d.amount)} from ${isUser(d.to) ? user : d.to}.*`
                : `*📱 ${d.from} sent ${isUser(d.to) ? user : d.to} ${money(d.amount)}.*`;
        case 'order':
            if (isUser(d.recipient)) return `*📱 ${d.from} ordered something for ${user}.*`;
            return '';
        default:
            return '';
    }
}

/**
 * @returns {object[]} New items
 */
export function processMessage(mesId) {
    const c = ctx();
    const m = c.chat?.[mesId];
    if (!m || m.is_system || typeof m.mes !== 'string') return [];
    wrapPlainReply(m, mesId);
    if (!hasTags(m.mes)) return [];

    const user = userName();
    const speaker = m.is_user ? user : (m.name || c.name2);
    const adult = settings().adultApps;
    const found = [];

    let text = m.mes.replace(TAG_RE, (full, rawTag, attrStr, rawBody) => {
        const a = parseAttrs(attrStr);
        const body = String(rawBody ?? '').trim();
        const tag = rawTag.toLowerCase();
        const from = a.from || speaker;
        const image = a.image || a.photo || a.pic || a.picture || '';

        switch (tag) {
            case 'sms':
            case 'text': {
                if (!body && !image) return '';
                const fromUser = isUser(from);
                const contact = fromUser ? (a.to || c.name2) : from;
                const dir = fromUser ? 'out' : 'in';
                const app = ['spark', 'dating'].includes(norm(a.app)) ? 'spark' : 'messages';
                const lines = body.split(/\n+/).map(x => x.trim()).filter(Boolean);
                const base = { kind: 'sms', app, from: fromUser ? user : from, contact, dir, read: fromUser };
                if (image) found.push({ ...base, text: lines.shift() ?? '', image });
                for (const line of lines) found.push({ ...base, text: line });
                return marker('sms', { from: base.from, contact, body, dir, image, app });
            }
            case 'call': {
                const fromUser = isUser(from);
                const contact = fromUser ? (a.to || c.name2) : from;
                const status = ['missed', 'declined', 'answered'].includes(norm(a.status)) ? norm(a.status) : 'missed';
                found.push({ kind: 'call', from: fromUser ? user : from, contact, dir: fromUser ? 'out' : 'in', status, text: body, duration: str(a.duration), read: fromUser || status !== 'missed' });
                return marker('call', { from, contact, status });
            }
            case 'post':
            case 'anon': {
                const app = tag === 'anon' ? 'rated' : normApp(a.app || a.platform);
                if (app === 'rated' && !adult) return '';
                if (!body && !image) return '';
                const isComment = norm(a.type || a.kind) === 'comment';
                const item = {
                    kind: 'post', app, from, text: body,
                    title: a.title || '', sub: a.sub || a.subreddit || '', image,
                    postType: isComment ? 'comment' : 'post', parent: a.parent || a.thread || '',
                    likes: 0, reposts: 0, replies: 0, upvotes: 1, commentCount: 0,
                };
                if (app === 'rated') {
                    item.secretlyBy = isUser(from) ? undefined : from;
                    item.handle = a.handle || `anon_${hashString(`${from}${body}`).slice(0, 5)}`;
                    item.age = str(a.age);
                    item.image = image || 'a photo of themselves';
                    found.push(item);
                    return '';
                }
                found.push(item);
                return marker('post', { from, app, body });
            }
            case 'search':
                if (body) found.push({ kind: 'search', from, text: body });
                return '';
            case 'pay':
            case 'request': {
                const amount = toMoney(a.amount ?? a.value ?? body);
                if (!amount) return '';
                const payType = tag === 'request' || norm(a.type) === 'request' ? 'request' : 'pay';
                const to = a.to || (isUser(from) ? c.name2 : user);
                const note = a.note || (/^\D/.test(body) ? body : '');
                found.push({ kind: 'pay', payType, from, to, amount, note, read: !isUser(to) });
                return marker('pay', { from, to, amount, payType });
            }
            case 'order': {
                const item = a.item || a.name || body;
                if (!item) return '';
                const recipient = a.for || a.to || a.recipient || from;
                found.push({
                    kind: 'order', app: orderApp(a.app), from, recipient: isUser(recipient) ? user : recipient,
                    item, price: toMoney(a.price ?? a.amount), store: a.store || a.restaurant || '', note: a.item ? body : '',
                    image: a.image || '',
                });
                return marker('order', { from, recipient });
            }
            case 'location':
                if (!a.place && !body) return '';
                found.push({ kind: 'location', from, place: a.place || body, text: a.place ? body : '' });
                return '';
            default:
                return '';
        }
    });

    // Collapse repeated short markers (e.g. several texts in a row).
    text = text.replace(/(\*📱 [^*\n]+\*)(\s*\1)+/g, '$1').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
        sentAtLen: mesId + 1,
        ...f,
    }));
    st.items.push(...added);

    try {
        // Not rendered yet (non-streamed replies): the chat renders the cleaned text itself.
        if (document.querySelector(`#chat .mes[mesid="${mesId}"]`)) c.updateMessageBlock?.(mesId, m);
    } catch (e) {
        console.debug('[Phone] could not rerender message', e);
    }
    c.saveChat?.();
    saveState();
    return added;
}

export function scanChat() {
    const chat = ctx().chat ?? [];
    for (let i = 0; i < chat.length; i++) processMessage(i);
}

