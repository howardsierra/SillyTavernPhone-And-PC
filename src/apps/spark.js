import { changed, chatCharacters, isChatCharacter, nextId, saveState, state, userName } from '../core.js';
import { isBusy, peek, runJson } from '../gen.js';
import { autoImages } from '../images.js';
import { updateInjection } from '../inject.js';
import { avatar, button, empty, header, input, photo, sectionLabel, shimmerCards, tabs, textarea } from '../ui/kit.js';
import { draft, navigate, ui } from '../ui/state.js';
import { arr, esc, norm, sameName, seeded, str, toNum } from '../util.js';
import { renderThread, threadRows, threads, unreadTexts } from './messages.js';

const ACCENT = 'linear-gradient(135deg, #ff5f6d, #ffc371)';

function knownProfiles() {
    const st = state();
    return Object.entries(st.profiles)
        .filter(([, p]) => p.dating)
        .map(([name, p]) => ({ ...p.dating, kind: 'dating', name, known: true }));
}

/** Profiles still waiting to be swiped: people from the story first. */
function deck() {
    const st = state();
    const seen = new Set([...st.spark.passed, ...st.spark.liked.map(norm), ...st.spark.matches.map(m => norm(m.name))]);
    const known = knownProfiles().filter(p => !seen.has(norm(p.name)) && !seen.has(p.id));
    const generated = st.spark.deck.filter(p => !seen.has(p.id) && !seen.has(norm(p.name)));
    return [...known, ...generated];
}

async function findPeople() {
    const st = state();
    const data = await runJson('spark', {}, { busyKey: 'spark' });
    if (!data) return;
    const fresh = arr(data.profiles).map(p => ({
        id: nextId(st),
        kind: 'dating',
        name: str(p.name),
        age: Math.max(18, toNum(p.age) || 25),
        distance: str(p.distance),
        job: str(p.job),
        bio: str(p.bio),
        prompts: arr(p.prompts).map(x => ({ q: str(x.q), a: str(x.a) })).filter(x => x.q && x.a).slice(0, 3),
        image: str(p.photo) || `portrait of ${str(p.name)}`,
        interest: Math.min(10, Math.max(1, Number(p.interest) || 5)),
    })).filter(p => p.name);
    st.spark.deck = [...st.spark.deck.filter(p => !st.spark.passed.includes(p.id)), ...fresh];
    saveState();
    changed();
    autoImages(fresh, { fromFeed: true });
}

function card(p, behind = false) {
    return `<div class="stp-spark-card ${behind ? 'stp-behind' : ''}">
        <div class="stp-spark-photo">${photo(p, 'stp-photo-fill')}
            <div class="stp-spark-overlay">
                <div class="stp-spark-name">${esc(p.name)}${p.age ? `, <span>${esc(p.age)}</span>` : ''}</div>
                <div class="stp-spark-sub">${p.job ? `<i class="fa-solid fa-briefcase"></i> ${esc(p.job)}` : ''}${p.distance ? ` · <i class="fa-solid fa-location-dot"></i> ${esc(p.distance)}` : ''}${p.known ? ' · <i class="fa-solid fa-user-check"></i> you know them' : ''}</div>
            </div>
        </div>
        ${behind ? '' : `<div class="stp-spark-body">
            ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
            ${p.lookingFor ? `<div class="stp-spark-tag"><i class="fa-solid fa-magnifying-glass-heart"></i> Looking for ${esc(p.lookingFor)}</div>` : ''}
            ${(p.prompts ?? []).map(x => `<div class="stp-spark-prompt"><div>${esc(x.q)}</div><b>${esc(x.a)}</b></div>`).join('')}
        </div>`}
    </div>`;
}

function renderDiscover() {
    const d = deck();
    const busy = isBusy('spark');
    if (busy) return shimmerCards(2);
    if (!d.length) {
        const checking = chatCharacters().some(n => isBusy(`peek:life:${norm(n)}`));
        return empty('fa-solid fa-fire', 'No one new around you', 'Find people nearby, or check whether anyone from your story is on Spark.',
            `${button('Find people nearby', 'spark-find', { icon: 'fa-solid fa-location-crosshairs' })}
            ${button(checking ? 'Checking…' : 'Is anyone I know on here?', 'spark-known', { variant: 'soft', icon: 'fa-solid fa-user-check', attrs: checking ? 'disabled' : '' })}`);
    }
    const [top, next] = d;
    return `<div class="stp-spark-stack">${next ? card(next, true) : ''}${card(top)}</div>
        <div class="stp-spark-buttons">
            <button class="stp-spark-btn stp-spark-pass" data-act="spark-swipe" data-dir="pass" data-id="${esc(top.id)}" data-name="${esc(top.name)}" title="Pass"><i class="fa-solid fa-xmark"></i></button>
            <button class="stp-spark-btn stp-spark-super" data-act="spark-swipe" data-dir="super" data-id="${esc(top.id)}" data-name="${esc(top.name)}" title="Super like"><i class="fa-solid fa-star"></i></button>
            <button class="stp-spark-btn stp-spark-like" data-act="spark-swipe" data-dir="like" data-id="${esc(top.id)}" data-name="${esc(top.name)}" title="Like"><i class="fa-solid fa-heart"></i></button>
        </div>`;
}

function renderMatches() {
    const st = state();
    const list = threads('spark');
    const fresh = st.spark.matches.filter(m => !list.some(t => sameName(t.contact, m.name)));
    const likes = st.spark.liked.filter(n => !st.spark.matches.some(m => sameName(m.name, n)));
    return `${fresh.length ? `${sectionLabel('New matches')}<div class="stp-match-row">${fresh.map(m => `<button class="stp-match" data-act="msg-open" data-app="spark" data-contact="${esc(m.name)}">${avatar(m.name, 'lg')}<span>${esc(m.name)}</span></button>`).join('')}</div>` : ''}
        ${likes.length ? `${sectionLabel('Likes you sent')}<div class="stp-chips">${likes.map(n => `<span class="stp-chip">${avatar(n, 'xs')}<span>${esc(n)}</span></span>`).join('')}</div>` : ''}
        ${sectionLabel('Messages')}
        ${list.length ? `<div class="stp-list">${threadRows(list, 'spark')}</div>` : '<div class="stp-muted stp-pad">Match with someone to start chatting.</div>'}`;
}

function renderProfile() {
    const me = state().spark.me;
    if (!me.id) me.id = nextId(state());
    const preview = { ...me, kind: 'dating', name: userName(), image: me.photo || '', prompts: [] };
    return `<div class="stp-card stp-form">
            ${me.photo ? photo(preview, 'stp-photo-square') : ''}
            <label>Profile photo</label>${input('spark:photo', me.photo || 'Describe your profile photo')}
            <label>Bio</label>${textarea('spark:bio', me.bio || 'A few words about you', { rows: 3 })}
            <label>Looking for</label>${input('spark:looking', me.lookingFor || 'Something casual? Long-term?')}
            ${button('Save profile', 'spark-save', { icon: 'fa-solid fa-check' })}
        </div>`;
}

function matchOverlay() {
    const m = ui.overlay?.type === 'match' ? ui.overlay : null;
    if (!m) return '';
    return `<div class="stp-overlay stp-match-overlay">
        <div class="stp-match-title">It's a Match!</div>
        <div class="stp-match-avatars">${avatar(userName(), 'xl')}${avatar(m.name, 'xl')}</div>
        <div class="stp-muted">You and ${esc(m.name)} liked each other.</div>
        ${button('Send a message', 'msg-open', { attrs: `data-app="spark" data-contact="${esc(m.name)}"`, icon: 'fa-solid fa-comment' })}
        ${button('Keep swiping', 'overlay-close', { variant: 'ghost' })}
    </div>`;
}

export default {
    id: 'spark',
    label: 'Spark',
    icon: 'fa-solid fa-fire',
    color: ACCENT,
    group: 'Social',
    badge: () => unreadTexts('spark'),
    render() {
        if (ui.view === 'thread') {
            return renderThread('spark', ui.params.contact, { accent: '#ff5f6d' });
        }
        const tab = ui.params.tab ?? 'discover';
        const body = tab === 'matches' ? renderMatches() : tab === 'profile' ? renderProfile() : renderDiscover();
        return `${header('<span class="stp-brand stp-brand-spark"><i class="fa-solid fa-fire"></i> spark</span>', { actions: tab === 'discover' && deck().length ? `<button class="stp-icon-btn" data-act="spark-find" title="Find more people"><i class="fa-solid fa-location-crosshairs"></i></button>` : '' })}
            ${tabs([{ id: 'discover', label: 'Discover', icon: 'fa-solid fa-fire' }, { id: 'matches', label: 'Matches', icon: 'fa-solid fa-comments', badge: unreadTexts('spark') || 0 }, { id: 'profile', label: 'Profile', icon: 'fa-solid fa-user' }], tab)}
            <div class="stp-scroll stp-spark" data-scroll="spark:${tab}">${body}</div>
            ${matchOverlay()}`;
    },
    back() {
        if (ui.view === 'thread') {
            navigate('spark', null, { tab: 'matches' });
            return true;
        }
        return false;
    },
    actions: {
        'spark-find': () => findPeople(),
        'spark-known': async () => {
            const names = chatCharacters();
            for (const n of names) await peek(n);
            if (!knownProfiles().length) toastr.info('Nobody you know seems to be on Spark… yet.', 'Spark');
        },
        'spark-swipe': el => {
            const st = state();
            const { dir, id, name } = el.dataset;
            const profile = deck().find(p => p.id === id) ?? { id, name };
            if (dir === 'pass') {
                st.spark.passed.push(profile.known ? norm(name) : id);
            } else if (profile.known || isChatCharacter(name)) {
                // People from the story decide for themselves; they just see the like.
                if (!st.spark.liked.some(n => sameName(n, name))) st.spark.liked.push(name);
                toastr.info(`${name} will see your ${dir === 'super' ? 'super like ⭐' : 'like'}.`, 'Spark');
            } else {
                const chance = Math.min(0.95, Math.max(0.1, (Number(profile.interest) || 5) / 10 + (dir === 'super' ? 0.2 : 0)));
                if (seeded(`${id}:match`) < chance) {
                    st.spark.matches.push({ ...profile, matchedAt: Date.now() });
                    ui.overlay = { type: 'match', name };
                } else {
                    st.spark.liked.push(name);
                }
            }
            saveState();
            updateInjection();
            changed();
        },
        'spark-save': () => {
            const me = state().spark.me;
            const photoDesc = draft('spark:photo');
            if (photoDesc && photoDesc !== me.photo) {
                me.photo = photoDesc;
                me.image = photoDesc;
                delete me.imageUrl;
            }
            me.bio = draft('spark:bio') || me.bio;
            me.lookingFor = draft('spark:looking') || me.lookingFor;
            saveState();
            toastr.success('Profile saved.', 'Spark');
            changed();
        },
        'overlay-close': () => {
            ui.overlay = null;
            changed();
        },
    },
};
