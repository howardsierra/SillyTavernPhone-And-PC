// Locate, Photos, Notes.
import { changed, isUser, liveItems, nextId, people, saveState, state } from '../core.js';
import { isBusy, locate } from '../gen.js';
import { avatar, empty, header, iconBtn, input, photo, tabs, textarea } from '../ui/kit.js';
import { clearDrafts, navigate, ui } from '../ui/state.js';
import { ago, esc, norm, seeded } from '../util.js';

// --------------------------------------------------------------------- Locate

function latestLocations() {
    const map = new Map();
    for (const it of liveItems().filter(x => x.kind === 'location').sort((a, b) => a.time - b.time)) map.set(norm(it.from), it);
    return map;
}

export const locateApp = {
    id: 'locate',
    label: 'Locate',
    icon: 'fa-solid fa-location-crosshairs',
    color: 'linear-gradient(160deg, #34e3a5, #0e9f6e)',
    group: 'Life',
    render() {
        const locs = latestLocations();
        const ppl = people();
        const pins = ppl.filter(n => locs.has(norm(n))).map(n => {
            const loc = locs.get(norm(n));
            const x = 12 + seeded(`${loc.place}x`) * 76;
            const y = 14 + seeded(`${loc.place}y`) * 66;
            return `<div class="stp-pin" style="left:${x}%;top:${y}%">${avatar(n, 'sm')}<span>${esc(loc.place)}</span></div>`;
        }).join('');
        const rows = ppl.map(n => {
            const loc = locs.get(norm(n));
            const busy = isBusy(`locate:${norm(n)}`);
            return `<div class="stp-row">
                ${avatar(n, 'md')}
                <div class="stp-row-main">
                    <div class="stp-row-top"><span class="stp-row-title">${esc(n)}</span><span class="stp-row-meta">${loc ? esc(ago(loc.time)) : ''}</span></div>
                    <div class="stp-row-sub">${loc ? `<i class="fa-solid fa-location-dot"></i> ${esc(loc.place)}${loc.text ? ` — ${esc(loc.text)}` : ''}` : 'Location unknown'}</div>
                </div>
                <button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="locate" data-name="${esc(n)}" title="Locate ${esc(n)}" ${busy ? 'disabled' : ''}><i class="fa-solid fa-location-crosshairs"></i></button>
            </div>`;
        }).join('');
        return `${header('Locate')}
            <div class="stp-scroll" data-scroll="locate">
                <div class="stp-map"><div class="stp-map-park"></div><div class="stp-map-water"></div><div class="stp-map-road stp-r1"></div><div class="stp-map-road stp-r2"></div><div class="stp-map-road stp-r3"></div>${pins}</div>
                ${rows ? `<div class="stp-list">${rows}</div>` : empty('fa-solid fa-location-crosshairs', 'No friends to locate')}
            </div>`;
    },
    actions: {
        locate: el => locate(el.dataset.name),
    },
};

// --------------------------------------------------------------------- Photos

export const photosApp = {
    id: 'photos',
    label: 'Photos',
    icon: 'fa-solid fa-images',
    color: 'conic-gradient(from 0deg, #ff9500, #ffcc00, #34c759, #5ac8fa, #af52de, #ff2d55, #ff9500)',
    group: 'Life',
    render() {
        const tab = ui.params.tab ?? 'all';
        let list = liveItems().filter(x => x.image && x.app !== 'rated' && x.kind !== 'search').sort((a, b) => b.time - a.time);
        if (tab === 'received') list = list.filter(x => !isUser(x.from) && x.kind === 'sms');
        if (tab === 'yours') list = list.filter(x => isUser(x.from));
        return `${header('Photos', { large: true })}
            ${tabs([{ id: 'all', label: 'All' }, { id: 'received', label: 'Received' }, { id: 'yours', label: 'Yours' }], tab)}
            <div class="stp-scroll" data-scroll="photos:${tab}">
                ${list.length ? `<div class="stp-gallery">${list.map(it => photo(it, 'stp-photo-tile')).join('')}</div>` : empty('fa-regular fa-images', 'No photos yet', 'Photos people send you and photos you post show up here.')}
            </div>`;
    },
};

// ---------------------------------------------------------------------- Notes

export const notesApp = {
    id: 'notes',
    label: 'Notes',
    icon: 'fa-solid fa-note-sticky',
    color: 'linear-gradient(180deg, #ffe36e, #ffc300)',
    group: 'Life',
    render() {
        const st = state();
        if (ui.view === 'note') {
            const note = st.notes.find(n => n.id === ui.params.id);
            if (!note) return `${header('Notes')}${empty('fa-regular fa-note-sticky', 'Note not found')}`;
            ui.drafts[`note:${note.id}:title`] ??= note.title;
            ui.drafts[`note:${note.id}:body`] ??= note.body;
            return `${header('', { actions: iconBtn('fa-regular fa-trash-can', 'note-delete', 'Delete note', `data-id="${esc(note.id)}"`) + iconBtn('fa-solid fa-check', 'note-save', 'Done', `data-id="${esc(note.id)}"`) })}
                <div class="stp-scroll stp-note-edit" data-scroll="note">
                    ${input(`note:${note.id}:title`, 'Title', { cls: 'stp-note-title' })}
                    <div class="stp-muted stp-small">${esc(new Date(note.updated).toLocaleString())}</div>
                    ${textarea(`note:${note.id}:body`, 'Start writing…', { rows: 14, cls: 'stp-note-body' })}
                </div>`;
        }
        const notes = [...st.notes].sort((a, b) => b.updated - a.updated);
        return `${header('Notes', { large: true, actions: iconBtn('fa-solid fa-pen-to-square', 'note-new', 'New note') })}
            <div class="stp-scroll" data-scroll="notes">
                <div class="stp-muted stp-small stp-pad">Private — characters never see your notes.</div>
                ${notes.length ? `<div class="stp-card stp-list-card">${notes.map(n => `<button class="stp-row stp-note-row" data-act="note-open" data-id="${esc(n.id)}">
                    <div class="stp-row-main"><div class="stp-row-title">${esc(n.title || 'New note')}</div><div class="stp-row-sub">${esc(new Date(n.updated).toLocaleDateString())} · ${esc((n.body || 'No additional text').slice(0, 60))}</div></div>
                </button>`).join('')}</div>` : empty('fa-regular fa-note-sticky', 'No notes', 'Jot down clues, plans, numbers…')}
            </div>`;
    },
    back() {
        if (ui.view === 'note') {
            saveNote(ui.params.id);
            navigate('notes');
            return true;
        }
        return false;
    },
    actions: {
        'note-new': () => {
            const st = state();
            const note = { id: nextId(st), title: '', body: '', updated: Date.now() };
            st.notes.push(note);
            saveState();
            navigate('notes', 'note', { id: note.id });
        },
        'note-open': el => navigate('notes', 'note', { id: el.dataset.id }),
        'note-save': el => {
            saveNote(el.dataset.id);
            navigate('notes');
        },
        'note-delete': el => {
            const st = state();
            st.notes = st.notes.filter(n => n.id !== el.dataset.id);
            saveState();
            navigate('notes');
        },
    },
};

function saveNote(id) {
    const note = state().notes.find(n => n.id === id);
    if (!note) return;
    const title = ui.drafts[`note:${id}:title`];
    const body = ui.drafts[`note:${id}:body`];
    if (title !== undefined) note.title = String(title);
    if (body !== undefined) note.body = String(body);
    note.updated = Date.now();
    clearDrafts(`note:${id}:title`, `note:${id}:body`);
    if (!note.title.trim() && !note.body.trim()) state().notes = state().notes.filter(n => n !== note);
    saveState();
    changed();
}

