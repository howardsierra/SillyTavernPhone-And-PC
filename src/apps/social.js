import { changed, isUser, liveItems, people, queueItem, settings, state, userName } from '../core.js';
import { generateImage } from '../images.js';
import { avatar, empty, header, input, peekButton, peekNote, personChips, photo, queuedBadge, textarea } from '../ui/kit.js';
import { clearDrafts, draft, ui } from '../ui/state.js';
import { ago, compact, esc, fmt, gradientFor } from '../util.js';

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

export function renderPost(it) {
    const handle = handleOf(it.from, it.app);
    const when = it.status === 'pending' ? 'queued' : ago(it.time);
    const name = isUser(it.from) ? userName() : it.from;

    if (it.app === 'x') {
        return `<article class="stp-post stp-post-x">
            ${avatar(it.from, 'md')}
            <div class="stp-post-main">
                <div class="stp-post-head"><b>${esc(name)}</b>${!isUser(it.from) ? ' <i class="fa-solid fa-circle-check stp-verified"></i>' : ''} <span class="stp-muted">${esc(handle)} · ${esc(when)}</span></div>
                ${it.text ? `<div class="stp-post-text">${fmt(it.text)}</div>` : ''}
                ${it.image ? photo(it, 'stp-photo-wide') : ''}
                <div class="stp-post-stats">
                    <span><i class="fa-regular fa-comment"></i> ${compact(it.replies)}</span>
                    <span><i class="fa-solid fa-retweet"></i> ${compact(it.reposts)}</span>
                    <span><i class="fa-regular fa-heart"></i> ${compact(it.likes)}</span>
                    <span><i class="fa-solid fa-chart-simple"></i> ${compact((it.likes || 1) * 37)}</span>
                </div>
                ${queuedBadge(it, 'Posts with your next reply')}
            </div>
        </article>`;
    }

    if (it.app === 'instagram') {
        const comments = (it.comments ?? []).map(cm => `<div class="stp-ig-comment"><b>${esc(cm.user)}</b> ${esc(cm.text)}</div>`).join('');
        return `<article class="stp-post stp-post-ig">
            <div class="stp-post-head stp-ig-head"><span class="stp-ig-ring">${avatar(it.from, 'sm')}</span> <b>${esc(handle || name)}</b><i class="fa-solid fa-ellipsis stp-muted stp-ml-auto"></i></div>
            ${photo({ ...it, image: it.image || 'a photo' }, 'stp-photo-square')}
            <div class="stp-ig-actions"><i class="fa-regular fa-heart"></i><i class="fa-regular fa-comment"></i><i class="fa-regular fa-paper-plane"></i><i class="fa-regular fa-bookmark stp-ml-auto"></i></div>
            <div class="stp-post-likes">${compact(it.likes)} likes</div>
            ${it.text ? `<div class="stp-post-text"><b>${esc(handle || name)}</b> ${fmt(it.text)}</div>` : ''}
            ${comments}
            <div class="stp-muted stp-small">${esc(when)}</div>
            ${queuedBadge(it, 'Posts with your next reply')}
        </article>`;
    }

    const uname = handle || `u/${String(name).replace(/\s+/g, '_').toLowerCase()}`;
    if (it.postType === 'comment') {
        return `<article class="stp-post stp-post-reddit">
            <div class="stp-muted stp-small"><b class="stp-reddit-sub">${esc(it.sub || 'r/all')}</b> · ${esc(uname)} commented · ${esc(when)}</div>
            ${it.parent ? `<div class="stp-reddit-parent"><i class="fa-solid fa-reply fa-flip-horizontal"></i> ${esc(it.parent)}</div>` : ''}
            <div class="stp-post-text">${fmt(it.text)}</div>
            <div class="stp-post-stats"><span class="stp-vote"><i class="fa-solid fa-circle-up"></i> ${compact(it.upvotes)} <i class="fa-regular fa-circle-down"></i></span></div>
            ${queuedBadge(it, 'Posts with your next reply')}
        </article>`;
    }
    return `<article class="stp-post stp-post-reddit">
        <div class="stp-muted stp-small"><b class="stp-reddit-sub">${esc(it.sub || 'r/all')}</b> · Posted by ${esc(uname)} · ${esc(when)}</div>
        ${it.title ? `<div class="stp-reddit-title">${esc(it.title)}</div>` : ''}
        ${it.text ? `<div class="stp-post-text">${fmt(it.text)}</div>` : ''}
        ${it.image ? photo(it, 'stp-photo-wide') : ''}
        <div class="stp-post-stats"><span class="stp-vote"><i class="fa-solid fa-circle-up"></i> ${compact(it.upvotes)} <i class="fa-regular fa-circle-down"></i></span><span><i class="fa-regular fa-comment"></i> ${compact(it.commentCount)}</span><span><i class="fa-solid fa-share"></i> Share</span></div>
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

function makeApp(app) {
    const meta = META[app];
    return {
        id: app,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        group: 'Social',
        render() {
            const list = people();
            const name = pickPerson(list, true);
            const you = isUser(name);
            const profile = state().profiles[name] ?? {};
            const posts = liveItems()
                .filter(x => x.kind === 'post' && x.app === app && (you ? isUser(x.from) : x.from === name))
                .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.time - a.time);
            const handle = profile.handles?.[app] ?? '';
            const bio = profile.bio?.[app] ?? '';
            const count = posts.length;
            const card = name ? `<div class="stp-profile stp-profile-${app}">
                    <div class="stp-profile-cover" style="--cover:${app === 'x' ? gradientFor(`${name}x`) : META[app].color}"></div>
                    <div class="stp-profile-row">${avatar(name, 'xl', 'stp-profile-avatar')}<div class="stp-ml-auto">${peekButton(name, { label: true })}</div></div>
                    <div class="stp-profile-name">${esc(you ? userName() : name)}</div>
                    ${handle ? `<div class="stp-muted">${esc(handle)}</div>` : ''}
                    ${bio ? `<div class="stp-profile-bio">${esc(bio)}</div>` : ''}
                    <div class="stp-profile-stats"><span><b>${count}</b> posts</span>${you ? '' : `<span><b>${compact(Math.round(150 + (posts[0]?.likes ?? 40) * 9))}</b> followers</span>`}</div>
                    ${peekNote(name, profile)}
                </div>` : '';
            const none = you ? '' : empty(meta.icon, `Nothing from ${name ?? 'them'} yet`, `Tap <b>Peek</b> to see ${esc(name ?? 'their')}'s ${meta.label}.`);
            return `${header(`<i class="${meta.icon}"></i> ${meta.label}`)}
                ${personChips(list, name, { includeYou: true })}
                <div class="stp-scroll stp-feed stp-feed-${app}" data-scroll="feed:${app}:${esc(name ?? '')}">
                    ${card}
                    ${you ? composer(app) : ''}
                    ${posts.map(renderPost).join('') || none}
                </div>`;
        },
    };
}

export const xApp = makeApp('x');
export const instagramApp = makeApp('instagram');
export const redditApp = makeApp('reddit');

export const socialActions = {
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
