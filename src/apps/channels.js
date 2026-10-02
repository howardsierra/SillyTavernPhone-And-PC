// Channels — Telegram-style broadcast channels, including an anonymous confessions
// channel where {{user}} can post secretly or pay to find out who wrote something.
import { confirmDelete, deleteButton, rememberDeleted } from '../deletions.js';
import { balance, changed, ctx, money, nextId, people, saveState, settings, state, userName } from '../core.js';
import { isBusy, runJson } from '../gen.js';
import { autoImages } from '../images.js';
import { updateInjection } from '../inject.js';
import { payFrom } from '../turn.js';
import { button, empty, header, iconBtn, moreButton, photo, shimmerCards } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { ago, arr, compact, esc, fmt, gradientFor, parseAgo, sameName, seeded, str, toNum } from '../util.js';

const REACTIONS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '🤡'];
const FAKE_NAMES = ['Mia R.', 'Jordan P.', 'Sam K.', 'Alex T.', 'Riley M.', 'Casey L.', 'Morgan D.', 'Taylor B.', 'Jamie F.', 'Quinn H.'];

function tg() {
    const st = state();
    st.tg ??= { channels: [], reveals: 0 };
    return st.tg;
}

function channelById(id) {
    return tg().channels.find(c => c.id === id) ?? null;
}

async function discover() {
    const st = state();
    const data = await runJson('tgChannels', {}, { busyKey: 'tg' });
    if (!data) return;
    const have = tg().channels;
    const fresh = arr(data.channels).map(c => ({
        id: nextId(st), name: str(c.name), emoji: str(c.emoji).slice(0, 4) || '📢', description: str(c.description),
        subscribers: toNum(c.subscribers) || 1000, anonymous: !!c.anonymous || /overheard|confess|anon/i.test(str(c.name)), posts: [],
    })).filter(c => c.name && !have.some(h => sameName(h.name, c.name)));
    have.push(...fresh);
    saveState();
    changed();
}

/** Loads posts: newest first time, then `older` keeps scrolling back. */
async function loadPosts(channel, { older = false } = {}) {
    const st = state();
    const existing = channel.posts.filter(p => !p.mine);
    const data = await runJson('tgPosts', {
        channel: channel.name,
        description: channel.description,
        count: channel.anonymous ? '8' : '6-8',
        anonRule: channel.anonymous
            ? ` — anonymous confessions sent in by readers: secrets, crushes, drama, rants about people around town. If it fits, one or two may secretly be written by people from the story (${people().join(', ') || 'none'}); put their exact name in "secretlyBy" (readers can't see it), otherwise leave it empty.`
            : '.',
        more: older && existing.length
            ? `These posts already exist — do NOT repeat them; write OLDER posts from before them:\n${existing.slice(0, 12).map(p => `- ${p.text.slice(0, 100)}`).join('\n')}`
            : existing.length ? `These were posted before — write NEWER posts that come after them:\n${existing.slice(-8).map(p => `- ${p.text.slice(0, 100)}`).join('\n')}` : '',
    }, { busyKey: `tg:${channel.id}` });
    if (!data) return;
    const known = people();
    const oldest = existing.length ? Math.min(...existing.map(p => p.time)) : Date.now();
    const added = arr(data.posts).map((p, i) => {
        const secret = str(p.secretlyBy);
        return {
            id: nextId(st), kind: 'channelPost', text: str(p.text), image: str(p.image),
            views: toNum(p.views) || Math.round(channel.subscribers * (0.1 + seeded(`${channel.id}${i}`) * 0.5)),
            reactions: typeof p.reactions === 'object' && p.reactions ? Object.fromEntries(Object.entries(p.reactions).slice(0, 5).map(([k, v]) => [k.slice(0, 4), toNum(v)])) : {},
            time: older ? oldest - (i + 1) * 3 * 3600e3 : Date.now() - parseAgo(p.ago, i),
            ...(channel.anonymous && secret ? { secretlyBy: known.find(n => sameName(n, secret)) ?? secret } : {}),
        };
    }).filter(p => p.text);
    channel.posts.push(...added);
    channel.posts.sort((a, b) => a.time - b.time);
    if (channel.posts.length > 200) channel.posts.splice(0, channel.posts.length - 200);
    if (!older) ui.scrollBottom = true;
    saveState();
    changed();
    autoImages(added.filter(p => p.image), { fromFeed: true });
}

function revealPrice() {
    return Math.round(25 * (1.6 ** (tg().reveals || 0)));
}

/** Confessions-related facts for the prompt. */
export function channelsContext() {
    const user = userName();
    const lines = [];
    for (const c of tg().channels.filter(x => x.anonymous)) {
        for (const p of c.posts.slice(-30)) {
            if (p.mine) lines.push(`An anonymous confession was posted in "${c.name}": "${p.text}" — secretly written by ${user}; nobody knows who wrote it.`);
            else if (p.revealed && p.secretlyBy && people().some(n => sameName(n, p.secretlyBy))) {
                lines.push(`${user} secretly paid to find out that ${p.secretlyBy} wrote this anonymous confession in "${c.name}": "${p.text}". ${p.secretlyBy} doesn't know ${user} knows.`);
            } else if (p.secretlyBy && people().some(n => sameName(n, p.secretlyBy))) {
                lines.push(`${p.secretlyBy} secretly posted an anonymous confession in "${c.name}": "${p.text}" (nobody knows it was them).`);
            }
        }
    }
    return lines.slice(-5);
}

function postCard(channel, p) {
    const reacts = { ...(p.reactions ?? {}) };
    if (p.myReaction) reacts[p.myReaction] = (reacts[p.myReaction] ?? 0) + 1;
    const chips = Object.entries(reacts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const showAuthor = channel.anonymous && !p.mine && (p.revealed || (settings().revealAnon && p.secretlyBy));
    const author = p.revealed ?? p.secretlyBy;
    return `<div class="stp-tg-post ${p.mine ? 'stp-mine' : ''}">
        ${channel.anonymous ? `<div class="stp-tg-anon">${p.mine ? '🤫 Your confession' : showAuthor ? `<i class="fa-solid fa-user-secret"></i> Written by <b>${esc(author)}</b>` : '<i class="fa-solid fa-user-secret"></i> Anonymous'}</div>` : ''}
        ${p.image ? photo(p, 'stp-photo-wide') : ''}
        <div class="stp-tg-text">${fmt(p.text)}</div>
        <div class="stp-tg-meta">${p.mine ? deleteButton(p, 'tg-delete') : ''}<span><i class="fa-solid fa-eye"></i> ${compact(p.mine ? Math.min(channel.subscribers, Math.round(3 + channel.subscribers * 0.05 * (1 + (Date.now() - p.time) / 3.6e6))) : p.views)}</span><span>${esc(ago(p.time))}</span></div>
        <div class="stp-tg-reactions">
            ${chips.map(([e, n]) => `<button class="stp-tg-react ${p.myReaction === e ? 'stp-active' : ''}" data-act="tg-react" data-id="${esc(p.id)}" data-emoji="${e}">${e} ${compact(n)}</button>`).join('')}
            <button class="stp-tg-react stp-tg-add" data-act="tg-react-open" data-id="${esc(p.id)}" title="React"><i class="fa-regular fa-face-smile"></i></button>
            ${channel.anonymous && !p.mine && !p.revealed ? `<button class="stp-tg-reveal" data-act="tg-reveal" data-id="${esc(p.id)}"><i class="fa-solid fa-magnifying-glass"></i> Who wrote this? ${esc(money(revealPrice()))}</button>` : ''}
        </div>
        ${ui.params.reactFor === p.id ? `<div class="stp-react-picker">${REACTIONS.map(e => `<button data-act="tg-react" data-id="${esc(p.id)}" data-emoji="${e}">${e}</button>`).join('')}</div>` : ''}
    </div>`;
}

function renderList() {
    const list = tg().channels;
    const busy = isBusy('tg');
    const rows = list.map(c => {
        const last = c.posts.at(-1);
        return `<button class="stp-row stp-thread-row" data-act="tg-open" data-id="${esc(c.id)}">
            <span class="stp-tg-avatar" style="background:${gradientFor(c.name)}">${esc(c.emoji)}</span>
            <div class="stp-row-main">
                <div class="stp-row-top"><span class="stp-row-title">${esc(c.name)}${c.anonymous ? ' <i class="fa-solid fa-user-secret stp-muted"></i>' : ''}</span><span class="stp-row-meta">${last ? esc(ago(last.time)) : ''}</span></div>
                <div class="stp-row-sub">${esc(last ? last.text : `${compact(c.subscribers)} subscribers · ${c.description}`)}</div>
            </div>
        </button>`;
    }).join('');
    const find = `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="tg-discover" title="Discover channels" ${busy ? 'disabled' : ''}><i class="fa-solid fa-${busy ? 'arrows-rotate' : 'compass'}"></i></button>`;
    return `${header('<span class="stp-brand stp-brand-tg"><i class="fa-solid fa-paper-plane"></i> Channels</span>', { actions: find })}
        <div class="stp-scroll" data-scroll="tg">
            ${list.length ? `<div class="stp-list">${rows}</div>` : busy ? shimmerCards(3) : empty('fa-solid fa-paper-plane', 'No channels yet', 'Follow local news, gossip, memes — and an anonymous confessions channel where anyone could be posting.', button('Discover channels', 'tg-discover', { icon: 'fa-solid fa-compass' }))}
        </div>`;
}

function renderChannel(channel) {
    const busy = isBusy(`tg:${channel.id}`);
    const posts = channel.posts;
    const key = `tg:${channel.id}:confess`;
    return `${header(`<span class="stp-tg-head"><span class="stp-tg-avatar stp-tg-avatar-sm" style="background:${gradientFor(channel.name)}">${esc(channel.emoji)}</span><span><b>${esc(channel.name)}</b><small>${compact(channel.subscribers)} subscribers</small></span></span>`, { actions: iconBtn('fa-solid fa-arrows-rotate', 'tg-refresh', 'New posts', busy ? 'disabled' : '') })}
        <div class="stp-scroll stp-tg-feed" data-scroll="tg:${esc(channel.id)}">
            ${posts.length ? moreButton('tg-older', busy, 'Older posts') : ''}
            ${posts.map(p => postCard(channel, p)).join('')}
            ${busy ? '<div class="stp-comment-typing stp-shimmer">Loading posts…</div>' : posts.length ? '' : empty('fa-solid fa-paper-plane', 'No posts loaded', esc(channel.description), button('Load posts', 'tg-refresh', { icon: 'fa-solid fa-arrows-rotate' }))}
        </div>
        ${channel.anonymous ? `<div class="stp-composer">
            <span class="stp-icon-btn"><i class="fa-solid fa-user-secret"></i></span>
            <input class="stp-input stp-composer-input" data-draft="${esc(key)}" data-enter="tg-confess" placeholder="Confess something anonymously…" value="${esc(ui.drafts[key] ?? '')}">
            <button class="stp-send" data-act="tg-confess" title="Post anonymously"><i class="fa-solid fa-arrow-up"></i></button>
        </div>
        <div class="stp-composer-hint">Nobody will know it was you</div>` : `<div class="stp-tg-muted-bar">You're subscribed · ${esc(channel.description)}</div>`}`;
}

export default {
    id: 'channels',
    label: 'Channels',
    icon: 'fa-solid fa-paper-plane',
    color: 'linear-gradient(160deg, #37bbfe, #007dbb)',
    group: 'Social',
    render() {
        if (ui.view === 'channel') {
            const c = channelById(ui.params.id);
            if (c) return renderChannel(c);
        }
        return renderList();
    },
    actions: {
        'tg-discover': () => discover(),
        'tg-open': el => {
            const c = channelById(el.dataset.id);
            if (!c) return;
            navigate('channels', 'channel', { id: c.id });
            ui.scrollBottom = true;
            if (!c.posts.length) loadPosts(c);
        },
        'tg-refresh': () => {
            const c = channelById(ui.params.id);
            if (c) loadPosts(c);
        },
        'tg-older': () => {
            const c = channelById(ui.params.id);
            if (c) loadPosts(c, { older: true });
        },
        'tg-react-open': el => {
            ui.params.reactFor = ui.params.reactFor === el.dataset.id ? null : el.dataset.id;
            changed();
        },
        'tg-react': el => {
            const c = channelById(ui.params.id);
            const p = c?.posts.find(x => x.id === el.dataset.id);
            if (!p) return;
            p.myReaction = p.myReaction === el.dataset.emoji ? undefined : el.dataset.emoji;
            ui.params.reactFor = null;
            saveState();
            changed();
        },
        'tg-reveal': async el => {
            const c = channelById(ui.params.id);
            const p = c?.posts.find(x => x.id === el.dataset.id);
            if (!p) return;
            const price = revealPrice();
            if (price > balance()) return toastr.warning(`Finding out costs ${money(price)} — not enough in your Pocket.`, 'Channels');
            const cx = ctx();
            const ok = await cx.callGenericPopup(`Pay ${money(price)} to find out who wrote this confession? The price goes up every time.`, cx.POPUP_TYPE.CONFIRM);
            if (!ok) return;
            payFrom(`${c.name} admins`, price, '🔍 Confession reveal');
            tg().reveals = (tg().reveals || 0) + 1;
            p.revealed = p.secretlyBy || FAKE_NAMES[Math.floor(seeded(p.id) * FAKE_NAMES.length)];
            saveState();
            updateInjection();
            changed();
        },
        'tg-delete': async el => {
            const c = channelById(ui.params.id);
            const p = c?.posts.find(x => x.id === el.dataset.id && x.mine);
            if (!p || !await confirmDelete(p)) return;
            c.posts = c.posts.filter(x => x !== p);
            rememberDeleted('channels', `${c.name} confession: ${p.text}`);
            saveState();
            updateInjection();
            changed();
        },
        'tg-confess': () => {
            const c = channelById(ui.params.id);
            if (!c) return;
            const key = `tg:${c.id}:confess`;
            const text = draft(key);
            if (!text) return;
            c.posts.push({ id: nextId(state()), kind: 'channelPost', text, mine: true, views: 1, reactions: {}, time: Date.now() });
            clearDrafts(key);
            ui.scrollBottom = true;
            saveState();
            updateInjection();
            changed();
            toastr.success('Posted anonymously. 🤫', 'Channels');
        },
    },
};
