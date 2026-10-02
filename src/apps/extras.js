// News, Calendar, Live (streams) and the occasional spam text.
import { balance, changed, ctx, isUser, liveItems, makeAnchor, money, nextId, people, queueItem, saveState, settings, state, userName } from '../core.js';
import { isBusy, runJson } from '../gen.js';
import { autoImages } from '../images.js';
import { updateInjection } from '../inject.js';
import { notifyItems } from '../notify.js';
import { isInstant, sendTurn } from '../turn.js';
import { avatar, button, empty, header, iconBtn, input, moreButton, photo, sectionLabel, shimmerCards } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { ago, arr, compact, esc, gradientFor, hueFor, parseAgo, sameName, str, toMoney, toNum } from '../util.js';

// ======================================================================= News

async function loadNews({ more = false } = {}) {
    const st = state();
    const existing = st.news.articles;
    const data = await runJson('news', {
        more: more && existing.length ? `These headlines already exist — do NOT repeat them; write OLDER stories:\n${existing.slice(0, 15).map(a => `- ${a.headline}`).join('\n')}` : '',
    }, { busyKey: 'news' });
    if (!data) return;
    const now = Date.now();
    const oldest = existing.length ? Math.min(...existing.map(a => a.time)) : now;
    const fresh = arr(data.articles).map((a, i) => ({
        id: nextId(st), kind: 'article',
        headline: str(a.headline), source: str(a.source), category: str(a.category),
        summary: str(a.summary), body: str(a.body), image: str(a.image),
        time: more ? oldest - (i + 1) * 3 * 3600e3 : now - parseAgo(a.ago, i),
    })).filter(a => a.headline);
    st.news.articles = more ? [...existing, ...fresh] : fresh;
    st.news.at = now;
    saveState();
    changed();
    autoImages(fresh, { fromFeed: true });
}

function articleRow(a, i) {
    if (i === 0) {
        return `<button class="stp-news-top" data-act="news-open" data-id="${esc(a.id)}">
            ${a.image ? photo(a, 'stp-photo-banner', { interactive: false }) : ''}
            <div class="stp-news-cat">${esc(a.category || 'Top story')}</div>
            <div class="stp-news-headline stp-news-big">${esc(a.headline)}</div>
            <div class="stp-row-sub">${esc(a.source)} · ${esc(ago(a.time))}</div>
        </button>`;
    }
    return `<button class="stp-row stp-news-row" data-act="news-open" data-id="${esc(a.id)}">
        <div class="stp-row-main">
            <div class="stp-news-cat">${esc(a.category || 'News')}</div>
            <div class="stp-news-headline">${esc(a.headline)}</div>
            <div class="stp-row-sub">${esc(a.source)} · ${esc(ago(a.time))}</div>
        </div>
        <span class="stp-news-thumb" style="background:${gradientFor(a.headline)}"><i class="fa-solid fa-newspaper"></i></span>
    </button>`;
}

export const newsApp = {
    id: 'news',
    label: 'News',
    icon: 'fa-solid fa-newspaper',
    color: 'linear-gradient(160deg, #ff5f57, #c9184a)',
    group: 'Life',
    render() {
        const st = state();
        const busy = isBusy('news');
        if (ui.view === 'article') {
            const a = st.news.articles.find(x => x.id === ui.params.id);
            if (!a) return `${header('News')}${empty('fa-solid fa-newspaper', 'Story not found')}`;
            return `${header(esc(a.source || 'News'))}
                <div class="stp-scroll stp-article" data-scroll="article">
                    ${a.image ? photo(a, 'stp-photo-banner stp-photo-hero') : ''}
                    <div class="stp-news-cat">${esc(a.category)}</div>
                    <h2 class="stp-article-title">${esc(a.headline)}</h2>
                    <div class="stp-row-sub">${esc(a.source)} · ${esc(ago(a.time))} ago</div>
                    <p class="stp-article-lead">${esc(a.summary)}</p>
                    ${a.body ? a.body.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('') : ''}
                </div>`;
        }
        const list = [...st.news.articles].sort((a, b) => b.time - a.time);
        const refresh = `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="news-load" title="Refresh" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button>`;
        const body = list.length
            ? `<div class="stp-news-top-wrap">${articleRow(list[0], 0)}</div><div class="stp-list">${list.slice(1).map((a, i) => articleRow(a, i + 1)).join('')}</div>${moreButton('news-more', busy, 'More stories')}`
            : busy ? shimmerCards(3) : empty('fa-solid fa-newspaper', 'Catch up on the news', 'Headlines from your story\'s world — what everyone\'s talking about.', button('Load the news', 'news-load', { icon: 'fa-solid fa-arrows-rotate' }));
        return `${header('News', { large: true, actions: refresh, subtitle: st.news.at ? `Updated ${ago(st.news.at)} ago` : '' })}
            <div class="stp-scroll" data-scroll="news">${body}</div>`;
    },
    actions: {
        'news-load': () => loadNews(),
        'news-more': () => loadNews({ more: true }),
        'news-open': el => navigate('news', 'article', { id: el.dataset.id }),
    },
};

// =================================================================== Calendar

function plans() {
    return liveItems().filter(x => x.kind === 'plan').sort((a, b) => (a.done === b.done ? b.time - a.time : a.done ? 1 : -1));
}

export const calendarApp = {
    id: 'calendar',
    label: 'Calendar',
    icon: 'fa-solid fa-calendar-days',
    color: 'linear-gradient(180deg, #ffffff, #e9e9ef)',
    iconColor: '#ff3b30',
    group: 'Life',
    badge: () => 0,
    render() {
        const list = plans();
        const picked = ui.params.planWith ?? [];
        const ppl = people();
        const d = new Date();
        const form = `<div class="stp-card stp-form">
            <label>New plan</label>
            ${input('plan:title', 'What? (dinner, the heist, movie night…)')}
            ${input('plan:when', 'When? (Saturday 8pm, tomorrow…)')}
            ${ppl.length ? `<label>With</label><div class="stp-chips">${ppl.map(n => `<button class="stp-chip ${picked.some(x => sameName(x, n)) ? 'stp-active' : ''}" data-act="plan-with" data-name="${esc(n)}">${avatar(n, 'xs')}<span>${esc(n)}</span></button>`).join('')}</div>` : ''}
            ${button(picked.length ? 'Add & invite' : 'Add to calendar', 'plan-add', { icon: 'fa-solid fa-plus' })}
            ${picked.length ? '<div class="stp-muted stp-small">Invites are sent like a text — they\'ll know about it.</div>' : '<div class="stp-muted stp-small">Private — only you can see plans without people.</div>'}
        </div>`;
        const card = p => `<div class="stp-card stp-plan ${p.done ? 'stp-done' : ''} ${p.status === 'pending' ? 'stp-pending' : ''}">
            <button class="stp-plan-check" data-act="plan-done" data-id="${esc(p.id)}" title="Done">${p.done ? '<i class="fa-solid fa-check"></i>' : ''}</button>
            <div class="stp-row-main">
                <div class="stp-row-title">${esc(p.text)}</div>
                <div class="stp-row-sub">${p.when ? `<i class="fa-regular fa-clock"></i> ${esc(p.when)}` : 'Someday'}${isUser(p.from) ? '' : ` · planned by ${esc(p.from)}`}</div>
                ${p.status === 'pending' ? '<div class="stp-queued"><i class="fa-regular fa-clock"></i> Invite sends with your next message</div>' : ''}
            </div>
            <span class="stp-plan-with">${(p.with ?? []).map(n => avatar(n, 'sm')).join('')}${!isUser(p.from) ? avatar(p.from, 'sm') : ''}</span>
        </div>`;
        return `${header('Calendar', { large: true })}
            <div class="stp-scroll" data-scroll="calendar">
                <div class="stp-cal-today"><div class="stp-cal-day">${esc(d.toLocaleDateString([], { weekday: 'long' }))}</div><div class="stp-cal-date">${d.getDate()}</div><div class="stp-cal-month">${esc(d.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</div></div>
                ${form}
                ${list.length ? `${sectionLabel('Plans')}${list.map(card).join('')}` : empty('fa-regular fa-calendar', 'Nothing planned', 'Characters can add plans too when you make them in the story.')}
            </div>`;
    },
    actions: {
        'plan-with': el => {
            const list = ui.params.planWith ?? [];
            const n = el.dataset.name;
            ui.params.planWith = list.some(x => sameName(x, n)) ? list.filter(x => !sameName(x, n)) : [...list, n];
            changed();
        },
        'plan-add': () => {
            const title = draft('plan:title');
            if (!title) return toastr.info('What\'s the plan?', 'Calendar');
            const withList = ui.params.planWith ?? [];
            const plan = { kind: 'plan', text: title, when: draft('plan:when'), with: withList };
            clearDrafts('plan:title', 'plan:when');
            ui.params.planWith = [];
            if (withList.length) {
                queueItem(plan);
                if (isInstant()) sendTurn();
            } else {
                const st = state();
                st.items.push({ id: nextId(st), time: Date.now(), source: 'user', status: 'sent', read: true, anchor: null, from: userName(), ...plan });
                saveState();
                changed();
            }
        },
        'plan-done': el => {
            const p = state().items.find(x => x.id === el.dataset.id);
            if (!p) return;
            p.done = !p.done;
            saveState();
            updateInjection();
            changed();
        },
    },
};

// ======================================================================= Live

async function loadStreams() {
    const st = state();
    const data = await runJson('live', { people: people().join(', ') || '(none)' }, { busyKey: 'live' });
    if (!data) return;
    const known = people();
    st.live.streams = arr(data.streams).map(s => {
        const match = known.find(n => sameName(n, str(s.streamer)));
        return {
            id: nextId(st), kind: 'stream', streamer: match ?? str(s.streamer), known: !!match,
            title: str(s.title), category: str(s.category), viewers: toNum(s.viewers) || 100,
            image: str(s.scene) || `${str(s.streamer)} streaming ${str(s.category)}`,
        };
    }).filter(s => s.streamer);
    st.live.chats = {};
    st.live.at = Date.now();
    saveState();
    changed();
    autoImages(st.live.streams, { fromFeed: true });
}

const CHAT_COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#f06595'];

function chatOf(id) {
    const st = state();
    st.live.chats ??= {};
    st.live.chats[id] ??= [];
    return st.live.chats[id];
}

async function moreChat(stream, { queue = false } = {}) {
    const log = chatOf(stream.id);
    const recent = log.slice(-12).map(m => `${m.user}: ${m.text}`).join('\n') || '(the stream just started)';
    const mine = log.filter(m => m.mine && !m.answered);
    const data = await runJson('liveChat', {
        streamer: stream.streamer, title: stream.title, category: stream.category,
        recent, userMsgs: mine.length ? mine.map(m => `"${m.text}"${m.donation ? ` (with a ${money(m.donation)} donation)` : ''}`).join(', ') : '(nothing yet)',
    }, { busyKey: `live:${stream.id}`, asCharacter: stream.known ? stream.streamer : null, queue });
    if (!data) return;
    mine.forEach(m => {
        m.answered = true;
    });
    const hostLines = Array.isArray(data.streamer) ? data.streamer : data.streamer ? [data.streamer] : [];
    for (const line of hostLines) {
        const text = typeof line === 'string' ? line.trim() : str(line?.text);
        if (text) log.push({ user: stream.streamer, text, host: true });
    }
    for (const m of arr(data.chat)) {
        if (m.text) log.push({ user: str(m.user) || 'viewer', text: str(m.text) });
    }
    if (toNum(data.viewers)) stream.viewers = toNum(data.viewers);
    if (log.length > 120) log.splice(0, log.length - 120);
    saveState();
    ui.scrollBottom = true;
    changed();
}

function renderStream(stream) {
    const log = chatOf(stream.id);
    const busy = isBusy(`live:${stream.id}`);
    const lastHost = [...log].reverse().find(m => m.host);
    return `${header(`<span class="stp-live-dot"></span> ${esc(stream.streamer)}`)}
        <div class="stp-stream">
            <div class="stp-stream-video">
                ${photo(stream, 'stp-photo-fill', { interactive: true })}
                <span class="stp-live-badge">LIVE</span>
                <span class="stp-live-viewers"><i class="fa-solid fa-eye"></i> ${compact(stream.viewers)}</span>
                ${lastHost ? `<div class="stp-stream-caption">🎙 ${esc(lastHost.text)}</div>` : ''}
            </div>
            <div class="stp-stream-info">
                ${avatar(stream.streamer, 'sm')}
                <div class="stp-row-main"><div class="stp-row-title">${esc(stream.title)}</div><div class="stp-row-sub">${esc(stream.streamer)} · ${esc(stream.category)}</div></div>
                <button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="live-more" data-id="${esc(stream.id)}" title="Keep watching" ${busy ? 'disabled' : ''}><i class="fa-solid fa-forward"></i></button>
            </div>
        </div>
        <div class="stp-scroll stp-live-chat" data-scroll="live:${esc(stream.id)}">
            ${log.map(m => `<div class="stp-live-msg ${m.host ? 'stp-live-host' : ''} ${m.mine ? 'stp-live-mine' : ''}">
                ${m.donation ? `<span class="stp-live-dono">💸 ${esc(money(m.donation))}</span> ` : ''}<b style="color:${m.host ? 'var(--accent)' : m.mine ? '#fff' : CHAT_COLORS[hueFor(m.user) % CHAT_COLORS.length]}">${esc(m.user)}</b> ${esc(m.text)}
            </div>`).join('') || `<div class="stp-muted stp-pad stp-center">${busy ? 'Tuning in…' : 'Tap ⏩ to tune in.'}</div>`}
        </div>
        <div class="stp-composer stp-live-composer">
            ${iconBtn('fa-solid fa-hand-holding-dollar', 'live-dono-toggle', 'Donate', ui.params.dono ? 'data-on="1"' : '')}
            ${ui.params.dono ? input('live:amount', `${settings().currency}5`, { type: 'number', cls: 'stp-live-amount' }) : ''}
            <input class="stp-input stp-composer-input" data-draft="live:msg" data-enter="live-send" placeholder="Send a message" value="${esc(ui.drafts['live:msg'] ?? '')}">
            <button class="stp-send" data-act="live-send"><i class="fa-solid fa-arrow-up"></i></button>
        </div>
        <div class="stp-composer-hint">Chat with the stream · ⏩ to keep watching</div>`;
}

export const liveApp = {
    id: 'live',
    label: 'Live',
    icon: 'fa-solid fa-tower-broadcast',
    color: 'linear-gradient(160deg, #a970ff, #6441a5)',
    group: 'Social',
    render() {
        const st = state();
        if (ui.view === 'stream') {
            const stream = st.live.streams.find(s => s.id === ui.params.id);
            if (stream) return renderStream(stream);
        }
        const busy = isBusy('live');
        const list = st.live.streams;
        const refresh = `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="live-load" title="Refresh" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button>`;
        const body = list.length
            ? `<div class="stp-grid-2">${list.map(s => `<button class="stp-stream-card" data-act="live-open" data-id="${esc(s.id)}">
                <div class="stp-stream-thumb">${photo(s, 'stp-photo-wide', { interactive: false })}<span class="stp-live-badge">LIVE</span><span class="stp-live-viewers">${compact(s.viewers)}</span></div>
                <div class="stp-stream-meta">${avatar(s.streamer, 'xs')}<div class="stp-row-main"><div class="stp-ellipsis stp-strong">${esc(s.title)}</div><div class="stp-row-sub">${esc(s.streamer)}${s.known ? ' ⭐' : ''} · ${esc(s.category)}</div></div></div>
            </button>`).join('')}</div>`
            : busy ? shimmerCards(3) : empty('fa-solid fa-tower-broadcast', 'Who\'s live?', 'See who\'s streaming right now — maybe someone you know.', button('Find streams', 'live-load', { icon: 'fa-solid fa-tower-broadcast' }));
        return `${header('<span class="stp-brand stp-brand-live"><i class="fa-solid fa-tower-broadcast"></i> Live</span>', { actions: refresh })}
            <div class="stp-scroll" data-scroll="live">${list.length ? sectionLabel('Live now') : ''}${body}</div>`;
    },
    actions: {
        'live-load': () => loadStreams(),
        'live-open': el => {
            navigate('live', 'stream', { id: el.dataset.id });
            const stream = state().live.streams.find(s => s.id === el.dataset.id);
            if (stream && !chatOf(stream.id).length) moreChat(stream);
        },
        'live-more': el => {
            const stream = state().live.streams.find(s => s.id === el.dataset.id);
            if (stream) moreChat(stream);
        },
        'live-dono-toggle': () => {
            ui.params.dono = !ui.params.dono;
            changed();
        },
        'live-send': () => {
            const stream = state().live.streams.find(s => s.id === ui.params.id);
            if (!stream) return;
            const text = draft('live:msg');
            const amount = ui.params.dono ? toMoney(draft('live:amount')) : 0;
            if (!text && !amount) return;
            if (amount && amount > balance()) return toastr.warning('Not enough money in your Pocket balance.', 'Live');
            chatOf(stream.id).push({ user: userName(), text: text || 'donated!', mine: true, ...(amount ? { donation: amount } : {}) });
            if (amount) {
                // Donations are real Pocket payments; to people from the story they're delivered like any payment.
                queueItem({ kind: 'pay', payType: 'pay', to: stream.streamer, amount, note: `📺 Live donation${text ? `: ${text}` : ''}`, ...(stream.known ? {} : { stranger: true }) });
                if (stream.known && isInstant()) sendTurn();
            }
            clearDrafts('live:msg', 'live:amount');
            ui.params.dono = false;
            ui.scrollBottom = true;
            saveState();
            changed();
            moreChat(stream, { queue: true });
        },
    },
};

// ================================================================ Spam texts

const SPAM = [
    { from: '+1 (555) 014-2271', text: 'USPS: Your package is on hold due to an incomplete address. Update within 24h: usps-redeliver-help.co' },
    { from: '+1 (555) 019-8840', text: 'hey is this Mark?? its Jen from the party lol' },
    { from: '72634', text: 'Congratulations! You\'ve been selected for a $500 gift card 🎁 Claim now: bit.ly/claim-gc5' },
    { from: '+1 (555) 013-0099', text: 'ALERT: Unusual sign-in to your bank account. If this wasn\'t you, verify at secure-verify-login.net' },
    { from: '+1 (555) 017-4432', text: 'hi dear 😘 i\'m new in town and so lonely tonight… wanna chat?' },
    { from: '+1 (555) 012-7710', text: 'Your vehicle\'s extended warranty is about to expire. Reply YES to speak with an agent.' },
    { from: '+1 (555) 018-3321', text: 'Mom here!! dropped my phone in the bath, this is my new number. can you send $200 for a new one? 🙏' },
    { from: '+1 (555) 016-5508', text: 'Crypto opportunity 🚀 Turn $250 into $7,800 in 7 days. Limited spots, DM me' },
    { from: '40404', text: 'Your verification code is 482913. Do not share this code with anyone.' },
    { from: '+1 (555) 011-2290', text: 'sorry wrong number!!' },
    { from: '+1 (555) 015-6612', text: 'Hi! This is Amanda from the recruiting team. Earn $300-$500/day working from home. Interested?' },
];

/** Every so often a spam or scam text arrives from an unknown number. */
export function maybeSpam() {
    const s = settings();
    const c = ctx();
    if (!s.enabled || !s.spamTexts || (c.chat?.length ?? 0) < 4 || Math.random() > 0.06) return;
    const st = state();
    const pick = SPAM[Math.floor(Math.random() * SPAM.length)];
    const lastId = c.chat.length - 1;
    const item = {
        id: nextId(st), kind: 'sms', app: 'messages', from: pick.from, contact: pick.from, dir: 'in', read: false,
        text: pick.text, stranger: true, spam: true, source: 'story', status: 'sent', time: Date.now(),
        anchor: makeAnchor(lastId), sentAtLen: c.chat.length,
    };
    st.items.push(item);
    saveState();
    notifyItems([item]);
    changed();
}

