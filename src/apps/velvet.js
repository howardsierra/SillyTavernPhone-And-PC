// Velvet — an 18+ subscription content app. Hidden unless "Adult (18+) apps" is on.
// Subscribe to creators (maybe someone from the story), tip them, or run your own page.
import { balance, changed, isUser, messagesSince, money, nextId, people, saveState, state, userName } from '../core.js';
import { isBusy, runJson } from '../gen.js';
import { autoImages, generateImage } from '../images.js';
import { updateInjection } from '../inject.js';
import { payFrom } from '../turn.js';
import { avatar, button, empty, header, input, moreButton, photo, shimmerCards, tabs, textarea } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { ago, arr, compact, esc, fmt, parseAgo, sameName, seeded, str, toMoney, toNum } from '../util.js';

const TIPS = [5, 10, 25, 50];

export function velvet() {
    const st = state();
    st.velvet ??= { creators: [] };
    st.velvet.me ??= { posts: [], price: 9.99, bio: '', cashedOut: 0 };
    return st.velvet;
}

function creatorById(id) {
    return velvet().creators.find(c => c.id === id) ?? null;
}

async function findCreators() {
    const st = state();
    const data = await runJson('velvetCreators', { people: people().join(', ') || '(none)' }, { busyKey: 'velvet' });
    if (!data) return;
    const known = people();
    const fresh = arr(data.creators).map(c => {
        const match = known.find(n => sameName(n, str(c.name)));
        return {
            id: nextId(st), name: match ?? str(c.name), known: !!match, handle: str(c.handle), bio: str(c.bio),
            price: toMoney(c.price) || 9.99, postCount: toNum(c.posts) || 30, subscribed: false, posts: [],
            cover: { id: nextId(st), kind: 'cover', image: str(c.cover) || `${str(c.name)} glamour photo` },
            pic: { id: nextId(st), kind: 'dating', from: match ?? str(c.name), image: str(c.avatar) || `portrait of ${str(c.name)}` },
        };
    }).filter(c => c.name && !velvet().creators.some(x => sameName(x.name, c.name)));
    velvet().creators.push(...fresh);
    saveState();
    changed();
    autoImages(fresh.map(c => c.cover), { fromFeed: true });
}

async function loadPosts(creator, { more = false } = {}) {
    const st = state();
    const data = await runJson('velvetPosts', {
        name: creator.name, bio: creator.bio, count: '6',
        more: more && creator.posts.length ? `These are already posted — do NOT repeat them; write OLDER posts:\n${creator.posts.slice(0, 10).map(p => `- ${p.caption || p.image}`).join('\n')}` : '',
    }, { busyKey: `velvet:${creator.id}`, asCharacter: creator.known ? creator.name : null });
    if (!data) return;
    const oldest = creator.posts.length ? Math.min(...creator.posts.map(p => p.time)) : Date.now();
    const added = arr(data.posts).map((p, i) => ({
        id: nextId(st), kind: 'post', app: 'velvet', from: creator.name, image: str(p.image) || 'a photo', caption: str(p.caption),
        likes: toNum(p.likes), time: more ? oldest - (i + 1) * 20 * 3600e3 : Date.now() - parseAgo(p.ago, i),
    }));
    creator.posts.push(...added);
    creator.posts.sort((a, b) => b.time - a.time);
    saveState();
    changed();
    autoImages(added, { fromFeed: true });
}

/** Your own page: subscribers grow as the story goes on and with every post. */
function myStats() {
    const me = velvet().me;
    if (!me.open) return { subs: 0, earned: 0, available: 0 };
    const progress = messagesSince({ sentAtLen: me.openedAtLen, status: 'sent' });
    const subs = Math.floor(2 + me.posts.length * (3 + seeded(`${me.openedAtLen}`) * 4) + progress * 0.7);
    const tips = me.posts.reduce((s, p, i) => s + Math.round(seeded(p.id) * 12) * (i < 6 ? 1 : 0.5), 0);
    const earned = Math.round((subs * me.price * 0.8 + tips) * 100) / 100;
    return { subs, earned, available: Math.max(0, Math.round((earned - (me.cashedOut || 0)) * 100) / 100) };
}

/** What the story should know: who {{user}} pays, and {{user}}'s own page. */
export function velvetContext() {
    const user = userName();
    const v = velvet();
    const lines = v.creators.filter(c => c.known && c.subscribed).map(c => `${user} is a paying subscriber to ${c.name}'s Velvet page (${c.name} can see this).`);
    for (const c of v.creators.filter(x => !x.known && x.subscribed).slice(-2)) lines.push(`${user} subscribes to the Velvet creator ${c.name} (a stranger).`);
    if (v.me.open) {
        const stats = myStats();
        lines.push(`${user} secretly runs a Velvet page${v.me.bio ? ` ("${v.me.bio}")` : ''} with ${stats.subs} subscribers at ${money(v.me.price)}/month.`);
        for (const p of v.me.posts.slice(0, 2)) lines.push(`${user} recently posted on Velvet: [photo: ${p.image}]${p.caption ? ` "${p.caption}"` : ''}`);
    }
    return lines;
}

function creatorCard(c) {
    return `<button class="stp-velvet-card" data-act="velvet-open" data-id="${esc(c.id)}">
        <div class="stp-velvet-cover">${photo(c.cover, 'stp-photo-banner', { interactive: false, adult: true })}</div>
        <div class="stp-velvet-card-body">
            ${c.known ? avatar(c.name, 'lg', 'stp-velvet-avatar') : `<span class="stp-velvet-avatar">${photo(c.pic, 'stp-photo-thumb', { interactive: false, adult: true })}</span>`}
            <div class="stp-row-main"><div class="stp-row-title">${esc(c.name)}${c.known ? ' <i class="fa-solid fa-star stp-velvet-known" title="From your story"></i>' : ''}</div><div class="stp-row-sub">${esc(c.handle)} · ${compact(c.postCount)} posts</div></div>
            <span class="stp-velvet-price ${c.subscribed ? 'stp-on' : ''}">${c.subscribed ? '<i class="fa-solid fa-check"></i> Subscribed' : `${esc(money(c.price))}/mo`}</span>
        </div>
        ${c.bio ? `<div class="stp-velvet-bio">${esc(c.bio)}</div>` : ''}
    </button>`;
}

function renderDiscover(subscribedOnly) {
    const busy = isBusy('velvet');
    const list = velvet().creators.filter(c => !subscribedOnly || c.subscribed);
    if (!list.length) {
        if (subscribedOnly) return empty('fa-solid fa-lock-open', 'No subscriptions yet', 'Subscribe to a creator to unlock their posts.');
        return busy ? shimmerCards(3) : empty('fa-solid fa-gem', 'Discover creators', 'Exclusive content from adult creators — maybe even someone you know.', button('Find creators', 'velvet-find', { icon: 'fa-solid fa-magnifying-glass' }));
    }
    return `${list.map(creatorCard).join('')}${subscribedOnly ? '' : moreButton('velvet-find', busy, 'Find more creators')}`;
}

function renderCreator(c) {
    const busy = isBusy(`velvet:${c.id}`);
    const posts = c.posts.map(p => c.subscribed
        ? `<div class="stp-velvet-post">${photo(p, 'stp-photo-portrait', { adult: true })}
            ${p.caption ? `<div class="stp-post-text">${fmt(p.caption)}</div>` : ''}
            <div class="stp-velvet-post-meta"><button data-act="velvet-like" data-id="${esc(p.id)}" class="${p.liked ? 'stp-liked' : ''}"><i class="fa-${p.liked ? 'solid' : 'regular'} fa-heart"></i> ${compact((p.likes || 0) + (p.liked ? 1 : 0))}</button><span>${esc(ago(p.time))}</span></div>
        </div>`
        : `<div class="stp-velvet-locked"><i class="fa-solid fa-lock"></i><span>${esc(p.caption ? p.caption.slice(0, 40) : 'Exclusive post')}…</span><small>Subscribe to unlock</small></div>`).join('');
    const lockedPreview = !c.posts.length && !c.subscribed
        ? Array.from({ length: 4 }, () => '<div class="stp-velvet-locked"><i class="fa-solid fa-lock"></i><small>Subscribe to unlock</small></div>').join('')
        : '';
    return `${header(esc(c.handle || c.name))}
        <div class="stp-scroll stp-velvet-page" data-scroll="velvet:${esc(c.id)}">
            <div class="stp-velvet-hero">${photo(c.cover, 'stp-photo-banner', { adult: true })}</div>
            <div class="stp-velvet-profile">
                ${c.known ? avatar(c.name, 'xl', 'stp-velvet-avatar') : `<span class="stp-velvet-avatar stp-velvet-avatar-xl">${photo(c.pic, 'stp-photo-thumb', { adult: true })}</span>`}
                <div class="stp-profile-name">${esc(c.name)}</div>
                <div class="stp-muted">${esc(c.handle)} · ${compact(c.postCount)} posts</div>
                ${c.bio ? `<div class="stp-profile-bio">${esc(c.bio)}</div>` : ''}
                <div class="stp-velvet-actions">
                    ${c.subscribed
        ? '<span class="stp-velvet-price stp-on"><i class="fa-solid fa-check"></i> Subscribed</span>'
        : button(`Subscribe · ${esc(money(c.price))}/mo`, 'velvet-sub', { icon: 'fa-solid fa-lock-open', attrs: `data-id="${esc(c.id)}"` })}
                    <button class="stp-btn stp-btn-soft stp-btn-sm" data-act="velvet-tip-toggle"><i class="fa-solid fa-gift"></i><span>Tip</span></button>
                </div>
                ${ui.params.tip ? `<div class="stp-chips stp-velvet-tips">${TIPS.map(a => `<button class="stp-chip" data-act="velvet-tip" data-id="${esc(c.id)}" data-amount="${a}"><span>${esc(money(a))}</span></button>`).join('')}</div>` : ''}
                ${c.known ? `<div class="stp-muted stp-small">${esc(c.name)} will see that it's you.</div>` : ''}
            </div>
            <div class="stp-velvet-grid">${posts}${lockedPreview}</div>
            ${busy ? shimmerCards(2) : c.subscribed ? moreButton('velvet-more', busy, c.posts.length ? 'Older posts' : 'Load posts', `data-id="${esc(c.id)}"`) : ''}
        </div>`;
}

function renderMe() {
    const me = velvet().me;
    if (!me.open) {
        return `<div class="stp-card stp-form">
            <label>Start your own page</label>
            <div class="stp-muted stp-small">Post exclusive photos for subscribers and earn Pocket money. Only you know it's you — unless you tell someone.</div>
            ${input('velvet:price', `Monthly price (${money(me.price)})`, { type: 'number' })}
            ${textarea('velvet:bio', 'Bio — what your page is about', { rows: 2 })}
            ${button('Open my page', 'velvet-open-me', { icon: 'fa-solid fa-gem' })}
        </div>`;
    }
    const stats = myStats();
    return `<div class="stp-velvet-stats">
            <div><b>${compact(stats.subs)}</b><span>subscribers</span></div>
            <div><b>${esc(money(me.price))}</b><span>per month</span></div>
            <div><b>${esc(money(stats.earned))}</b><span>earned</span></div>
        </div>
        ${button(stats.available ? `Cash out ${esc(money(stats.available))} to Pocket` : 'Nothing to cash out yet', 'velvet-cashout', { variant: stats.available ? 'primary' : 'soft', icon: 'fa-solid fa-money-bill-transfer', attrs: stats.available ? '' : 'disabled' })}
        <div class="stp-card stp-form">
            <label>New post</label>
            ${input('velvet:post-photo', 'Describe your photo…')}
            ${textarea('velvet:post-caption', 'Caption', { rows: 2 })}
            ${button('Post to subscribers', 'velvet-post', { icon: 'fa-solid fa-paper-plane' })}
        </div>
        <div class="stp-velvet-grid">${me.posts.map(p => `<div class="stp-velvet-post">${photo(p, 'stp-photo-portrait', { adult: true })}${p.caption ? `<div class="stp-post-text">${fmt(p.caption)}</div>` : ''}<div class="stp-velvet-post-meta"><span><i class="fa-solid fa-heart"></i> ${compact(Math.round(stats.subs * (0.3 + seeded(p.id) * 0.5)))}</span><span>${esc(ago(p.time))}</span></div></div>`).join('')}</div>`;
}

export default {
    id: 'velvet',
    label: 'Velvet',
    icon: 'fa-solid fa-gem',
    color: 'linear-gradient(160deg, #3b0d2e, #b0125b)',
    group: 'After dark',
    adult: true,
    render() {
        if (ui.view === 'creator') {
            const c = creatorById(ui.params.id);
            if (c) return renderCreator(c);
        }
        const tab = ui.params.tab ?? 'discover';
        const body = tab === 'me' ? renderMe() : renderDiscover(tab === 'subs');
        return `${header('<span class="stp-brand stp-brand-velvet">velvet<sup>18+</sup></span>')}
            ${tabs([{ id: 'discover', label: 'Discover', icon: 'fa-solid fa-gem' }, { id: 'subs', label: 'Subscribed', icon: 'fa-solid fa-lock-open' }, { id: 'me', label: 'My page', icon: 'fa-solid fa-user' }], tab)}
            <div class="stp-scroll stp-velvet" data-scroll="velvet:${tab}">${body}</div>`;
    },
    actions: {
        'velvet-find': () => findCreators(),
        'velvet-open': el => {
            const c = creatorById(el.dataset.id);
            if (!c) return;
            navigate('velvet', 'creator', { id: c.id, back: { ...ui.params } });
        },
        'velvet-sub': el => {
            const c = creatorById(el.dataset.id);
            if (!c || c.subscribed) return;
            if (c.price > balance()) return toastr.warning('Not enough money in your Pocket balance.', 'Velvet');
            payFrom(c.name, c.price, '🔒 Velvet subscription', { known: c.known });
            c.subscribed = true;
            saveState();
            updateInjection();
            changed();
            if (!c.posts.length) loadPosts(c);
        },
        'velvet-tip-toggle': () => {
            ui.params.tip = !ui.params.tip;
            changed();
        },
        'velvet-tip': el => {
            const c = creatorById(el.dataset.id);
            const amount = Number(el.dataset.amount);
            if (!c || !amount) return;
            if (amount > balance()) return toastr.warning('Not enough money in your Pocket balance.', 'Velvet');
            payFrom(c.name, amount, '💝 Velvet tip', { known: c.known });
            ui.params.tip = false;
            toastr.success(`Sent ${c.name} a ${money(amount)} tip.`, 'Velvet');
            updateInjection();
            changed();
        },
        'velvet-more': el => {
            const c = creatorById(el.dataset.id);
            if (c) loadPosts(c, { more: c.posts.length > 0 });
        },
        'velvet-like': el => {
            const c = creatorById(ui.params.id);
            const p = c?.posts.find(x => x.id === el.dataset.id);
            if (!p) return;
            p.liked = !p.liked;
            saveState();
            changed();
        },
        'velvet-open-me': () => {
            const me = velvet().me;
            me.price = toMoney(draft('velvet:price')) || me.price;
            me.bio = draft('velvet:bio');
            me.open = true;
            me.openedAtLen = (SillyTavern.getContext().chat ?? []).length;
            clearDrafts('velvet:price', 'velvet:bio');
            saveState();
            updateInjection();
            changed();
        },
        'velvet-post': () => {
            const me = velvet().me;
            const image = draft('velvet:post-photo');
            if (!image) return toastr.info('Describe your photo first.', 'Velvet');
            const post = { id: nextId(state()), kind: 'post', app: 'velvet', from: userName(), image, caption: draft('velvet:post-caption'), time: Date.now() };
            me.posts.unshift(post);
            clearDrafts('velvet:post-photo', 'velvet:post-caption');
            saveState();
            updateInjection();
            changed();
            generateImage(post.id, { quiet: true });
        },
        'velvet-cashout': () => {
            const st = state();
            const stats = myStats();
            if (!stats.available) return;
            st.wallet.topUps = (Number(st.wallet.topUps) || 0) + stats.available;
            velvet().me.cashedOut = (velvet().me.cashedOut || 0) + stats.available;
            saveState();
            updateInjection();
            changed();
            toastr.success(`${money(stats.available)} moved to your Pocket.`, 'Velvet');
        },
    },
};
