import { avatarUrl, changed, isUser, liveItems, people, queueItem, saveState, settings, state, userName } from '../core.js';
import { addComment, commentCount, generateComments, threadOf } from '../comments.js';
import { generateImage } from '../images.js';
import { avatar, button, empty, header, input, moreButton, peekButton, peekNote, personChips, photo, queuedBadge, shimmerCards, tabs, textarea } from '../ui/kit.js';
import { generateFeed, isBusy, peekApp } from '../gen.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { ago, compact, esc, fmt, gradientFor, norm, sameName } from '../util.js';

const META = {
    x: { label: 'X', icon: 'fa-brands fa-x-twitter', color: 'linear-gradient(180deg, #2a2a2a, #000)' },
    instagram: { label: 'Instagram', icon: 'fa-brands fa-instagram', color: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' },
    reddit: { label: 'Reddit', icon: 'fa-brands fa-reddit-alien', color: 'linear-gradient(180deg, #ff6a2b, #ff4500)' },
};

export function pickPerson(list, includeYou = false) {
    const user = userName();
    const valid = n => list.some(x => x === n) || (includeYou && n === user);
    if (!ui.params.person || !valid(ui.params.person)) ui.params.person = list[0] ?? (includeYou ? user : null);
    return ui.params.person;
}

function handleOf(name, app) {
    if (isUser(name)) return '';
    return state().profiles[name]?.handles?.[app] ?? '';
}

/** Tapping a known person's name opens their profile. */
function authorLink(it) {
    if (it.stranger || isUser(it.from)) return '';
    return `class="stp-author" data-act="open-profile" data-app="${esc(it.app)}" data-name="${esc(it.from)}"`;
}

export function renderPost(it, { detail = false } = {}) {
    const handle = it.handle || handleOf(it.from, it.app);
    // Tapping a post opens its comments (not while it's still queued, or already open).
    const open = !detail && it.status !== 'pending' ? `data-act="post-open" data-id="${esc(it.id)}"` : '';
    const comments = commentCount(it);
    const when = it.status === 'pending' ? 'queued' : ago(it.time);
    const name = isUser(it.from) ? userName() : it.from;

    if (it.app === 'x') {
        return `<article class="stp-post stp-post-x ${open ? 'stp-tappable' : ''}" ${open}>
            ${avatar(it.from, 'md')}
            <div class="stp-post-main">
                <div class="stp-post-head"><b ${authorLink(it)}>${esc(name)}</b>${!isUser(it.from) ? ' <i class="fa-solid fa-circle-check stp-verified"></i>' : ''} <span class="stp-muted">${esc(handle)} · ${esc(when)}</span></div>
                ${it.text ? `<div class="stp-post-text">${fmt(it.text)}</div>` : ''}
                ${it.image ? photo(it, 'stp-photo-wide') : ''}
                <div class="stp-post-stats">
                    <span><i class="fa-regular fa-comment"></i> ${compact(comments)}</span>
                    <span><i class="fa-solid fa-retweet"></i> ${compact(it.reposts)}</span>
                    <span><i class="fa-regular fa-heart"></i> ${compact(it.likes)}</span>
                    <span><i class="fa-solid fa-chart-simple"></i> ${compact((it.likes || 1) * 37)}</span>
                </div>
                ${queuedBadge(it, 'Posts with your next reply')}
            </div>
        </article>`;
    }

    if (it.app === 'instagram') {
        const preview = detail ? '' : threadOf(it).filter(c => !c.replyTo).slice(0, 2).map(cm => `<div class="stp-ig-comment"><b>${esc(cm.mine ? userName() : cm.handle || cm.author)}</b> ${esc(cm.text)}</div>`).join('');
        const viewAll = !detail && it.status !== 'pending' ? `<button class="stp-link-btn stp-ig-viewall" ${open}>${comments ? `View all ${compact(comments)} comments` : 'Add a comment…'}</button>` : '';
        return `<article class="stp-post stp-post-ig">
            <div class="stp-post-head stp-ig-head"><span class="stp-ig-ring">${avatar(it.from, 'sm')}</span> <b ${authorLink(it)}>${esc(handle || name)}</b><i class="fa-solid fa-ellipsis stp-muted stp-ml-auto"></i></div>
            ${photo({ ...it, image: it.image || 'a photo' }, 'stp-photo-square')}
            <div class="stp-ig-actions"><i class="fa-regular fa-heart"></i><i class="fa-regular fa-comment" ${open}></i><i class="fa-regular fa-paper-plane"></i><i class="fa-regular fa-bookmark stp-ml-auto"></i></div>
            <div class="stp-post-likes">${compact(it.likes)} likes</div>
            ${it.text ? `<div class="stp-post-text"><b>${esc(handle || name)}</b> ${fmt(it.text)}</div>` : ''}
            ${preview}
            ${viewAll}
            <div class="stp-muted stp-small">${esc(when)}</div>
            ${queuedBadge(it, 'Posts with your next reply')}
        </article>`;
    }

    const uname = handle || `u/${String(name).replace(/\s+/g, '_').toLowerCase()}`;
    if (it.postType === 'comment') {
        return `<article class="stp-post stp-post-reddit ${open ? 'stp-tappable' : ''}" ${open}>
            <div class="stp-muted stp-small"><b class="stp-reddit-sub">${esc(it.sub || 'r/all')}</b> · ${esc(uname)} commented · ${esc(when)}</div>
            ${it.parent ? `<div class="stp-reddit-parent"><i class="fa-solid fa-reply fa-flip-horizontal"></i> ${esc(it.parent)}</div>` : ''}
            <div class="stp-post-text">${fmt(it.text)}</div>
            <div class="stp-post-stats"><span class="stp-vote"><i class="fa-solid fa-circle-up"></i> ${compact(it.upvotes)} <i class="fa-regular fa-circle-down"></i></span>${comments ? `<span><i class="fa-regular fa-comment"></i> ${compact(comments)}</span>` : ''}</div>
            ${queuedBadge(it, 'Posts with your next reply')}
        </article>`;
    }
    return `<article class="stp-post stp-post-reddit ${open ? 'stp-tappable' : ''}" ${open}>
        <div class="stp-muted stp-small"><b class="stp-reddit-sub">${esc(it.sub || 'r/all')}</b> · Posted by ${esc(uname)} · ${esc(when)}</div>
        ${it.title ? `<div class="stp-reddit-title">${esc(it.title)}</div>` : ''}
        ${it.text ? `<div class="stp-post-text">${fmt(it.text)}</div>` : ''}
        ${it.image ? photo(it, 'stp-photo-wide') : ''}
        <div class="stp-post-stats"><span class="stp-vote"><i class="fa-solid fa-circle-up"></i> ${compact(it.upvotes)} <i class="fa-regular fa-circle-down"></i></span><span><i class="fa-regular fa-comment"></i> ${compact(comments)}</span><span><i class="fa-solid fa-share"></i> Share</span></div>
        ${queuedBadge(it, 'Posts with your next reply')}
    </article>`;
}

function composer(app) {
    const k = `post:${app}`;
    const extra = app === 'reddit'
        ? `<div class="stp-row-2">${input(`${k}:sub`, 'r/subreddit')}${input(`${k}:title`, 'Title')}</div>`
        : input(`${k}:image`, app === 'x' ? '📷 Attach a photo (optional) — describe it' : '📷 Describe your photo');
    const placeholder = app === 'x' ? "What's happening?" : app === 'instagram' ? 'Write a caption…' : 'Body text (optional)';
    return `<div class="stp-card stp-post-composer">
        <div class="stp-composer-who">${avatar(userName(), 'sm')}<b>${esc(userName())}</b></div>
        ${extra}
        ${textarea(k, placeholder)}
        <div class="stp-row-end"><span class="stp-muted stp-small">Goes live with your next chat reply</span><button class="stp-btn stp-btn-primary stp-btn-sm" data-act="post" data-app="${app}">Post</button></div>
    </div>`;
}

/** Profile header: a blurred, zoomed version of their picture, or a colour wash if they have none. */
function coverHtml(name, app) {
    const url = avatarUrl(name);
    const tint = app === 'x' ? gradientFor(`${name}x`) : META[app].color;
    return `<div class="stp-profile-cover ${url ? 'stp-has-photo' : ''}" style="--cover:${tint}${url ? `;--cover-img:url('${esc(url).replace(/'/g, '%27')}')` : ''}"></div>`;
}

function profileView(app, list) {
    const meta = META[app];
    const name = pickPerson(list, true);
    const you = isUser(name);
    const profile = state().profiles[name] ?? {};
    const posts = liveItems()
        .filter(x => x.kind === 'post' && x.app === app && !x.stranger && (you ? isUser(x.from) : x.from === name))
        .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.time - a.time);
    const handle = profile.handles?.[app] ?? '';
    const bio = profile.bio?.[app] ?? '';
    const busy = isBusy(`peek:${app}:${norm(name ?? '')}`);
    const card = name ? `<div class="stp-profile stp-profile-${app}">
            ${coverHtml(name, app)}
            <div class="stp-profile-row">${avatar(name, 'xl', 'stp-profile-avatar')}<div class="stp-ml-auto">${peekButton(name, { label: true, app })}</div></div>
            <div class="stp-profile-name">${esc(you ? userName() : name)}</div>
            ${handle ? `<div class="stp-muted">${esc(handle)}</div>` : ''}
            ${bio ? `<div class="stp-profile-bio">${esc(bio)}</div>` : ''}
            <div class="stp-profile-stats"><span><b>${posts.length}</b> posts</span>${you ? '' : `<span><b>${compact(Math.round(150 + (posts[0]?.likes ?? 40) * 9))}</b> followers</span>`}</div>
            ${peekNote(name, profile, app)}
        </div>` : '';
    const none = you ? '' : busy ? shimmerCards(3) : empty(meta.icon, `Nothing from ${name ?? 'them'} yet`, `Tap <b>Peek</b> to load ${esc(name ?? 'their')}'s whole ${meta.label} feed.`);
    const more = !you && posts.length ? moreButton('peek-more', busy, 'Load older posts', `data-app="${app}" data-name="${esc(name)}"`) : '';
    return `${personChips(list, name, { includeYou: true })}
        <div class="stp-scroll stp-feed stp-feed-${app}" data-scroll="profile:${app}:${esc(name ?? '')}">
            ${card}
            ${you ? composer(app) : ''}
            ${posts.map(renderPost).join('') || none}
            ${more}
        </div>`;
}

function feedView(app) {
    const meta = META[app];
    const busy = isBusy(`feed:${app}`);
    const posts = liveItems()
        .filter(x => x.kind === 'post' && x.app === app)
        .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.time - a.time);
    const loaded = state().feeds?.[app];
    const body = posts.length
        ? `${posts.map(renderPost).join('')}${moreButton('feed-more', busy, 'Load more', `data-app="${app}"`)}`
        : busy ? shimmerCards(4) : empty(meta.icon, 'Your feed is empty', 'See what everyone\'s posting — people from your story included.',
            button('Load my feed', 'feed-refresh', { icon: 'fa-solid fa-arrows-rotate', attrs: `data-app="${app}"` }));
    return `<div class="stp-scroll stp-feed stp-feed-${app}" data-scroll="feed:${app}">
            ${composer(app)}
            ${loaded && !busy ? `<div class="stp-peek-note">Updated ${ago(loaded) === 'now' ? 'just now' : `${esc(ago(loaded))} ago`}</div>` : busy && posts.length ? '<div class="stp-peek-note stp-shimmer">Refreshing your feed…</div>' : ''}
            ${body}
        </div>`;
}

// ------------------------------------------------------------------ comments

function commentRow(post, c, depth) {
    const thread = threadOf(post);
    const to = c.replyTo ? thread.find(x => x.id === c.replyTo) : null;
    const name = c.mine ? userName() : c.author;
    const link = !c.mine && c.known ? `class="stp-author" data-act="open-profile" data-app="${esc(post.app)}" data-name="${esc(c.author)}"` : '';
    return `<div class="stp-comment ${depth ? 'stp-comment-reply' : ''} ${c.mine ? 'stp-mine' : ''}">
        ${avatar(c.mine ? userName() : c.author, 'sm')}
        <div class="stp-comment-main">
            <div class="stp-comment-head"><b ${link}>${esc(name)}</b>${c.handle && !c.mine ? ` <span class="stp-muted">${esc(c.handle)}</span>` : ''}${sameName(c.author, post.from) && !c.mine ? ' <span class="stp-op">OP</span>' : ''} <span class="stp-muted">· ${esc(ago(c.time))}</span></div>
            ${to && depth ? `<div class="stp-replying">Replying to <b>${esc(to.mine ? 'you' : to.author)}</b></div>` : ''}
            <div class="stp-comment-text">${fmt(c.text)}</div>
            <div class="stp-comment-actions">
                <button data-act="comment-reply" data-id="${esc(c.id)}"><i class="fa-regular fa-comment"></i> Reply</button>
                <button data-act="comment-like" data-id="${esc(c.id)}" class="${c.liked ? 'stp-liked' : ''}"><i class="fa-${c.liked ? 'solid' : 'regular'} fa-heart"></i> ${compact((c.likes || 0) + (c.liked ? 1 : 0))}</button>
            </div>
        </div>
    </div>`;
}

/** Top-level comments in order, each followed by its whole reply chain. */
function threadHtml(post) {
    const thread = threadOf(post);
    const ids = new Set(thread.map(c => c.id));
    const children = new Map();
    for (const c of thread) {
        const parent = c.replyTo && ids.has(c.replyTo) ? c.replyTo : null;
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(c);
    }
    const out = [];
    const walk = (c, depth) => {
        out.push(commentRow(post, c, depth));
        for (const kid of (children.get(c.id) ?? []).sort((a, b) => a.time - b.time)) walk(kid, Math.min(depth + 1, 1));
    };
    for (const top of (children.get(null) ?? []).sort((a, b) => a.time - b.time)) walk(top, 0);
    return out.join('');
}

function postView(app) {
    const post = state().items.find(x => x.id === ui.params.id);
    if (!post) return `${header('Post')}${empty('fa-regular fa-comment', 'Post not found')}`;
    const busy = isBusy(`comments:${post.id}`);
    const thread = threadOf(post);
    const replyingTo = ui.params.replyTo ? thread.find(c => c.id === ui.params.replyTo) : null;
    const key = `comment:${post.id}`;
    const title = app === 'reddit' ? esc(post.sub || 'Reddit') : app === 'instagram' ? 'Comments' : 'Post';
    const list = thread.length
        ? `<div class="stp-thread-list">${threadHtml(post)}</div>${busy ? '<div class="stp-comment-typing stp-shimmer">Replies coming in…</div>' : moreButton('comments-more', busy, 'More comments', `data-id="${esc(post.id)}"`)}`
        : busy ? '<div class="stp-comment-typing stp-shimmer">Loading comments…</div>' : `<div class="stp-center stp-pad">${button('Load comments', 'comments-load', { variant: 'soft', icon: 'fa-regular fa-comments', attrs: `data-id="${esc(post.id)}"` })}</div>`;
    return `${header(title)}
        <div class="stp-scroll stp-post-detail" data-scroll="post:${esc(post.id)}">
            ${renderPost(post, { detail: true })}
            <div class="stp-section-label"><span>${thread.length ? `${thread.length} comment${thread.length === 1 ? '' : 's'}` : 'Comments'}</span></div>
            ${list}
        </div>
        ${replyingTo ? `<div class="stp-attach-bar stp-replying-bar"><i class="fa-solid fa-reply"></i><span>Replying to <b>${esc(replyingTo.mine ? 'yourself' : replyingTo.author)}</b></span><button class="stp-icon-btn" data-act="comment-cancel-reply" title="Cancel"><i class="fa-solid fa-xmark"></i></button></div>` : ''}
        <div class="stp-composer">
            ${avatar(userName(), 'sm')}
            <input class="stp-input stp-composer-input" data-draft="${esc(key)}" data-enter="comment-send" placeholder="${replyingTo ? `Reply to ${esc(replyingTo.mine ? 'yourself' : replyingTo.author)}…` : 'Add a comment…'}" value="${esc(ui.drafts[key] ?? '')}" ${busy ? 'disabled' : ''}>
            <button class="stp-send" data-act="comment-send" title="Post comment" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
        </div>
        <div class="stp-composer-hint">People reply right away</div>`;
}

function makeApp(app) {
    const meta = META[app];
    return {
        id: app,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        group: 'Social',
        back() {
            if (ui.view !== 'post') return false;
            ui.view = null;
            ui.params = ui.params.back ?? {};
            changed();
            return true;
        },
        render() {
            if (ui.view === 'post') return postView(app);
            const tab = ui.params.tab ?? 'feed';
            const busy = isBusy(`feed:${app}`);
            const refresh = tab === 'feed'
                ? `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="feed-refresh" data-app="${app}" title="Refresh feed" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button>`
                : '';
            return `${header(`<i class="${meta.icon}"></i> ${meta.label}`, { actions: refresh })}
                ${tabs([{ id: 'feed', label: app === 'reddit' ? 'Home' : 'Feed', icon: 'fa-solid fa-house' }, { id: 'profiles', label: 'Profiles', icon: 'fa-solid fa-user' }], tab)}
                ${tab === 'feed' ? feedView(app) : profileView(app, people())}`;
        },
    };
}

export const xApp = makeApp('x');
export const instagramApp = makeApp('instagram');
export const redditApp = makeApp('reddit');

function postById(id) {
    return state().items.find(x => x.id === id);
}

export const socialActions = {
    'post-open': el => {
        const post = postById(el.dataset.id);
        if (!post) return;
        const back = { ...ui.params };
        navigate(post.app, 'post', { id: post.id, back });
        if (!threadOf(post).length && settings().autoComments !== false) generateComments(post);
    },
    'comments-load': el => {
        const post = postById(el.dataset.id);
        if (post) generateComments(post);
    },
    'comments-more': el => {
        const post = postById(el.dataset.id);
        if (post) generateComments(post);
    },
    'comment-reply': el => {
        ui.params.replyTo = el.dataset.id;
        changed();
        setTimeout(() => document.querySelector(`#stp-device [data-draft^="comment:"]`)?.focus(), 30);
    },
    'comment-cancel-reply': () => {
        ui.params.replyTo = null;
        changed();
    },
    'comment-like': el => {
        const post = postById(ui.params.id);
        const c = post && threadOf(post).find(x => x.id === el.dataset.id);
        if (!c) return;
        c.liked = !c.liked;
        saveState();
        changed();
    },
    'comment-send': () => {
        const post = postById(ui.params.id);
        if (!post) return;
        const key = `comment:${post.id}`;
        const text = draft(key);
        if (!text) return;
        const replyTo = ui.params.replyTo || null;
        clearDrafts(key);
        ui.params.replyTo = null;
        ui.scrollBottom = true;
        addComment(post, text, replyTo);
    },
    'open-profile': el => {
        ui.params = { tab: 'profiles', person: el.dataset.name };
        changed();
    },
    'peek-more': el => peekApp(el.dataset.name, el.dataset.app, { more: true }),
    'feed-refresh': el => generateFeed(el.dataset.app),
    'feed-more': el => generateFeed(el.dataset.app, { more: true }),
    post: el => {
        const app = el.dataset.app;
        const k = `post:${app}`;
        const text = draft(k);
        const image = draft(`${k}:image`);
        const title = draft(`${k}:title`);
        let sub = draft(`${k}:sub`);
        if (app === 'instagram' && !image) {
            toastr.info('Describe your photo first.', 'Instagram');
            return;
        }
        if (!text && !image && !title) return;
        if (sub && !/^r\//i.test(sub)) sub = `r/${sub}`;
        const item = queueItem({ kind: 'post', app, text, image, title, sub, postType: 'post', likes: 0, reposts: 0, replies: 0, upvotes: 1, commentCount: 0 });
        clearDrafts(k, `${k}:image`, `${k}:title`, `${k}:sub`);
        if (image && settings().images && settings().imageAuto !== 'off') generateImage(item.id, { quiet: false });
        changed();
    },
};
