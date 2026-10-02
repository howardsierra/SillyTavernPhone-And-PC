// "Rated" — an anonymous 18+ app where adults post photos of themselves to be rated.
// Hidden unless "Adult (18+) apps" is enabled in the settings.
import { changed, isUser, liveItems, nextId, people, queueItem, saveState, settings, state } from '../core.js';
import { deleteButton } from '../deletions.js';
import { ratedStats } from '../derived.js';
import { isBusy, runJson } from '../gen.js';
import { autoImages, generateImage } from '../images.js';
import { updateInjection } from '../inject.js';
import { button, empty, header, input, photo, shimmerCards, tabs, textarea } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { ago, arr, compact, esc, gradientFor, hashString, sameName, str, toNum } from '../util.js';

function myHandle() {
    const st = state();
    st.rated.handle ??= `anon_${hashString(`${Date.now()}`).slice(0, 5)}`;
    return st.rated.handle;
}

async function loadMore() {
    const st = state();
    const data = await runJson('rated', {}, { busyKey: 'rated' });
    if (!data) return;
    const known = people();
    const now = Date.now();
    const added = arr(data.posts).map((p, i) => {
        const secret = known.find(n => sameName(n, str(p.secretlyBy)));
        return {
            id: nextId(st), kind: 'post', app: 'rated', source: 'gen', status: 'sent', read: true, anchor: null, owner: 'rated',
            from: str(p.handle) || `anon_${i}`, handle: str(p.handle) || `anon_${i}`, age: Math.max(18, toNum(p.age) || 21),
            image: str(p.photo) || 'a photo', text: str(p.caption), rating: Math.min(10, Math.max(1, Number(p.rating) || 7)),
            votes: toNum(p.votes), secretlyBy: secret, time: now - (i + 1) * 23 * 60e3,
            comments: arr(p.comments).map(c => ({ handle: str(c.handle), text: str(c.text), rating: toNum(c.rating) })).slice(0, 6),
        };
    });
    st.items.push(...added);
    saveState();
    changed();
    autoImages(added, { fromFeed: true });
}

async function loadComments(id) {
    const it = state().items.find(x => x.id === id);
    if (!it) return;
    const data = await runJson('ratedComments', { photo: it.image, caption: it.text || '(no caption)' }, { busyKey: `rated:${id}` });
    if (!data) return;
    it.comments = arr(data.comments).map(c => ({ handle: str(c.handle), text: str(c.text), rating: toNum(c.rating) })).slice(0, 8);
    if (it.source !== 'gen' && Number(data.rating)) it.rating = Math.min(10, Math.max(1, Number(data.rating)));
    saveState();
    updateInjection();
    changed();
}

function postCard(it) {
    const stats = ratedStats(it);
    const mine = isUser(it.from);
    const handle = mine ? myHandle() : it.handle || it.from;
    const secret = it.secretlyBy && !mine;
    const reveal = settings().revealAnon;
    const busyComments = isBusy(`rated:${it.id}`);
    const pending = it.status === 'pending';
    return `<article class="stp-card stp-rated-post">
        <div class="stp-rated-head">
            <span class="stp-anon-avatar" style="background:${gradientFor(handle)}"><i class="fa-solid fa-user-secret"></i></span>
            <div class="stp-row-main"><b>${esc(handle)}</b>${it.age ? ` <span class="stp-muted">· ${esc(it.age)}</span>` : ''}<div class="stp-row-sub">${pending ? 'queued' : esc(ago(it.time))}${mine ? ' · you' : ''}</div></div>
            <div class="stp-rated-score">${pending ? '—' : stats.rating.toFixed(1)}<small>${pending ? 'not live yet' : `${compact(stats.votes)} votes`}</small></div>
            ${mine ? deleteButton(it) : ''}
        </div>
        ${secret ? `<div class="stp-rated-secret">${reveal ? `<i class="fa-solid fa-eye"></i> Secretly posted by <b>${esc(it.secretlyBy)}</b>` : '<i class="fa-solid fa-eye"></i> Something about this one looks… familiar.'}</div>` : ''}
        ${photo(it, 'stp-photo-portrait', { adult: true })}
        ${it.text ? `<div class="stp-post-text">${esc(it.text)}</div>` : ''}
        ${mine || pending ? '' : `<div class="stp-rate-row">${Array.from({ length: 10 }, (_, i) => `<button class="stp-rate ${it.myRating === i + 1 ? 'stp-active' : ''}" data-act="rated-rate" data-id="${esc(it.id)}" data-score="${i + 1}">${i + 1}</button>`).join('')}</div>`}
        ${(it.comments ?? []).slice(0, 4).map(c => `<div class="stp-rated-comment"><b>${esc(c.handle)}</b> ${c.rating ? `<span class="stp-mini-score">${esc(c.rating)}/10</span>` : ''} ${esc(c.text)}</div>`).join('')}
        ${pending ? `<div class="stp-queued"><i class="fa-regular fa-clock"></i> Goes live with your next reply · <a data-act="cancel-pending" data-id="${esc(it.id)}">cancel</a></div>`
        : `<button class="stp-link-btn ${busyComments ? 'stp-spin' : ''}" data-act="rated-comments" data-id="${esc(it.id)}" ${busyComments ? 'disabled' : ''}><i class="fa-regular fa-comments"></i> ${busyComments ? 'Loading…' : it.comments?.length ? 'Refresh comments' : 'See what people said'}</button>`}
    </article>`;
}

function renderFeed() {
    const tab = ui.params.tab ?? 'hot';
    const all = liveItems().filter(x => x.kind === 'post' && x.app === 'rated');
    let list;
    if (tab === 'mine') list = all.filter(x => isUser(x.from)).sort((a, b) => b.time - a.time);
    else if (tab === 'new') list = all.filter(x => !isUser(x.from)).sort((a, b) => b.time - a.time);
    else list = all.filter(x => !isUser(x.from)).sort((a, b) => ratedStats(b).rating - ratedStats(a).rating);
    const busy = isBusy('rated');
    const more = `<button class="stp-btn stp-btn-soft stp-btn-sm ${busy ? 'stp-spin' : ''}" data-act="rated-more" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i><span>${busy ? 'Loading…' : 'Load more'}</span></button>`;
    let body;
    if (tab === 'mine') {
        body = list.length ? list.map(postCard).join('') : empty('fa-solid fa-user-secret', 'You haven\'t posted', 'Post anonymously and see how strangers rate you.', button('Post anonymously', 'rated-compose', { icon: 'fa-solid fa-camera' }));
    } else {
        body = `${busy ? shimmerCards(2) : ''}${list.map(postCard).join('') || (busy ? '' : empty('fa-solid fa-star-half-stroke', 'Nothing to rate yet', 'Load the feed to see who\'s posting tonight.', more))}${list.length ? `<div class="stp-center stp-pad">${more}</div>` : ''}`;
    }
    return `${header('<span class="stp-brand stp-brand-rated">rated<sup>18+</sup></span>', { actions: `<button class="stp-icon-btn" data-act="rated-compose" title="Post anonymously"><i class="fa-solid fa-plus"></i></button>` })}
        ${tabs([{ id: 'hot', label: 'Hot', icon: 'fa-solid fa-fire-flame-curved' }, { id: 'new', label: 'New', icon: 'fa-solid fa-clock' }, { id: 'mine', label: 'Mine', icon: 'fa-solid fa-user-secret' }], tab)}
        <div class="stp-scroll stp-rated" data-scroll="rated:${tab}">${body}</div>`;
}

function renderCompose() {
    return `${header('Post anonymously')}
        <div class="stp-scroll stp-rated" data-scroll="rated-compose">
            <div class="stp-card stp-form">
                <div class="stp-muted stp-small">You post as <b>${esc(myHandle())}</b>. Nobody sees who you are.</div>
                <label>Your photo</label>${input('rated:photo', 'Describe the photo you\'re posting…')}
                <label>Caption</label>${textarea('rated:caption', 'be honest, rate me 👀', { rows: 2 })}
                ${button('Post', 'rated-post', { icon: 'fa-solid fa-paper-plane' })}
                <div class="stp-muted stp-small stp-center">Goes live with your next chat message. Ratings come in as the story moves on.</div>
            </div>
        </div>`;
}

export default {
    id: 'rated',
    label: 'Rated',
    icon: 'fa-solid fa-star-half-stroke',
    color: 'linear-gradient(160deg, #a23cff, #ff2e93)',
    group: 'After dark',
    adult: true,
    render() {
        return ui.view === 'compose' ? renderCompose() : renderFeed();
    },
    actions: {
        'rated-more': () => loadMore(),
        'rated-compose': () => navigate('rated', 'compose', {}),
        'rated-post': () => {
            const image = draft('rated:photo');
            if (!image) return toastr.info('Describe your photo first.', 'Rated');
            const item = queueItem({ kind: 'post', app: 'rated', handle: myHandle(), image, text: draft('rated:caption') });
            clearDrafts('rated:photo', 'rated:caption');
            if (settings().images && settings().imageAuto !== 'off') generateImage(item.id, { quiet: true });
            navigate('rated', null, { tab: 'mine' });
        },
        'rated-rate': el => {
            const it = state().items.find(x => x.id === el.dataset.id);
            if (!it) return;
            const score = Number(el.dataset.score);
            it.myRating = it.myRating === score ? undefined : score;
            saveState();
            updateInjection();
            changed();
        },
        'rated-comments': el => loadComments(el.dataset.id),
    },
};
