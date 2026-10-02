import { liveItems, people, state } from '../core.js';
import { isBusy } from '../gen.js';
import { empty, header, moreButton, peekButton, peekNote, personChips, sectionLabel, shimmerCards } from '../ui/kit.js';
import { ago, esc, gradientFor, norm } from '../util.js';
import { pickPerson } from './social.js';

function domain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url || '';
    }
}

export const browserApp = {
    id: 'browser',
    label: 'Browser',
    icon: 'fa-solid fa-compass',
    color: 'linear-gradient(180deg, #5ac8fa, #0a7aff)',
    group: 'Life',
    render() {
        const list = people();
        const name = pickPerson(list);
        const items = liveItems().filter(x => x.from === name);
        const searches = items.filter(x => x.kind === 'search').sort((a, b) => b.time - a.time);
        const visits = items.filter(x => x.kind === 'visit').sort((a, b) => b.time - a.time);
        const body = !name
            ? empty('fa-solid fa-compass', 'Nobody to peek at yet')
            : `${peekNote(name, state().profiles[name], 'browser')}
            <div class="stp-searchbar"><i class="fa-solid fa-lock"></i><span>${esc(name)}'s browser · private</span></div>
            ${sectionLabel('Recent searches')}
            <div class="stp-card stp-list-card">${searches.map(s => `<div class="stp-row stp-row-tight"><i class="fa-solid fa-magnifying-glass stp-muted"></i><span class="stp-grow">${esc(s.text)}</span><span class="stp-row-meta">${esc(ago(s.time))}</span></div>`).join('') || `<div class="stp-muted stp-pad">${isBusy(`peek:browser:${norm(name)}`) ? 'Peeking…' : 'No searches yet — tap Peek.'}</div>`}</div>
            ${sectionLabel('History')}
            <div class="stp-card stp-list-card">${visits.map(v => `<div class="stp-row stp-row-tight"><span class="stp-favicon" style="background:${gradientFor(domain(v.url))}">${esc(domain(v.url).slice(0, 1).toUpperCase())}</span><div class="stp-grow"><div class="stp-ellipsis">${esc(v.title)}</div><div class="stp-muted stp-small">${esc(domain(v.url))}</div></div><span class="stp-row-meta">${esc(ago(v.time))}</span></div>`).join('') || '<div class="stp-muted stp-pad">No history yet.</div>'}</div>`;
        const more = name && (searches.length || visits.length) ? moreButton('peek-more', isBusy(`peek:browser:${norm(name)}`), 'Load older history', `data-app="browser" data-name="${esc(name)}"`) : '';
        return `${header('Browser', { actions: peekButton(name, { app: 'browser' }) })}
            ${personChips(list, name)}
            <div class="stp-scroll" data-scroll="browser:${esc(name ?? '')}">${body}${more}</div>`;
    },
};

export const musicApp = {
    id: 'music',
    label: 'Music',
    icon: 'fa-solid fa-music',
    color: 'linear-gradient(180deg, #ff5f7e, #fa233b)',
    group: 'Life',
    render() {
        const list = people();
        const name = pickPerson(list);
        const tracks = liveItems().filter(x => x.kind === 'music' && x.from === name).sort((a, b) => b.time - a.time);
        const now = tracks[0];
        const busy = name && isBusy(`peek:music:${norm(name)}`);
        const body = !name ? empty('fa-solid fa-music', 'Nobody to peek at yet') : `${peekNote(name, state().profiles[name], 'music')}
            ${now ? `<div class="stp-now-playing" style="--np:${gradientFor(`${now.title}${now.artist}`)}">
                <div class="stp-album stp-album-lg" style="background:${gradientFor(`${now.title}${now.artist}`)}"><i class="fa-solid fa-music"></i></div>
                <div class="stp-np-meta"><div class="stp-np-label"><span class="stp-eq"><i></i><i></i><i></i></span> ${esc(name)} is listening</div><div class="stp-np-title">${esc(now.title)}</div><div class="stp-np-artist">${esc(now.artist)}</div></div>
                <div class="stp-np-bar"><span style="width:${30 + (now.title.length * 7) % 60}%"></span></div>
            </div>` : busy ? shimmerCards(2) : empty('fa-solid fa-headphones', 'Nothing played yet', 'Tap Peek to see what they\'re listening to.')}
            ${tracks.length > 1 ? sectionLabel('Recently played') : ''}
            <div class="stp-list">${tracks.slice(1).map(t => `<div class="stp-row stp-row-tight"><div class="stp-album" style="background:${gradientFor(`${t.title}${t.artist}`)}"><i class="fa-solid fa-music"></i></div><div class="stp-grow"><div class="stp-ellipsis">${esc(t.title)}</div><div class="stp-muted stp-small">${esc(t.artist)}</div></div><span class="stp-row-meta">${esc(ago(t.time))}</span></div>`).join('')}</div>`;
        const more = tracks.length ? moreButton('peek-more', busy, 'Load more songs', `data-app="music" data-name="${esc(name)}"`) : '';
        return `${header('Music', { actions: peekButton(name, { app: 'music' }) })}
            ${personChips(list, name)}
            <div class="stp-scroll" data-scroll="music:${esc(name ?? '')}">${body}${more}</div>`;
    },
};
