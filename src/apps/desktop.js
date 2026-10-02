// PC-only apps: Mail, Files and Games. On a character's PC they show that
// character's own inbox, files and game library.
import { changed, isUser, liveItems, nextId, people, saveState, state, userName } from '../core.js';
import { isBusy, runJson } from '../gen.js';
import { autoImages } from '../images.js';
import { updateInjection } from '../inject.js';
import { notify } from '../notify.js';
import { avatar, button, empty, iconBtn, input, photo, shimmerCards, textarea } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { ago, arr, compact, esc, fmt, gradientFor, norm, parseAgo, sameName, str, toNum } from '../util.js';
import { device, owner } from './theirs.js';

// =================================================================== Mail

function mailbox() {
    const who = owner();
    if (who) return device(who).mail ??= [];
    const st = state();
    st.mail ??= [];
    return st.mail;
}

function myAddress() {
    return `${norm(userName()).replace(/[^a-z0-9]+/g, '.') || 'me'}@mail.com`;
}

function addressFor(name) {
    return `${norm(name).replace(/[^a-z0-9]+/g, '.') || 'someone'}@mail.com`;
}

async function loadInbox({ more = false } = {}) {
    const who = owner();
    const list = mailbox();
    const data = who
        ? await runJson('devMail', { name: who }, { busyKey: `mail:${norm(who)}`, asCharacter: who })
        : await runJson('mailInbox', {
            count: more ? '5-6' : '8-10',
            people: people().join(', ') || '(none)',
            more: more && list.length ? `Already in the inbox (do NOT repeat; write OLDER emails):\n${list.slice(0, 12).map(m => `- ${m.from}: ${m.subject}`).join('\n')}` : '',
        }, { busyKey: 'mail' });
    if (!data) return;
    const st = state();
    const known = people();
    const oldest = list.length ? Math.min(...list.map(m => m.time)) : Date.now();
    const fresh = arr(data.emails).filter(e => str(e.subject) || str(e.body)).map((e, i) => {
        const from = str(e.from) || 'Unknown';
        const match = known.find(n => sameName(n, from));
        const folder = /sent/i.test(str(e.folder)) ? 'sent' : /spam|junk/i.test(str(e.folder)) ? 'spam' : 'inbox';
        return {
            id: nextId(st), from: match ?? from, to: str(e.to), address: str(e.address) || addressFor(from), subject: str(e.subject) || '(no subject)',
            body: str(e.body), folder, known: !!match, read: false,
            time: more ? oldest - (i + 1) * 7 * 3600e3 : Date.now() - parseAgo(e.ago, i),
        };
    });
    if (who) device(who).mail = more ? [...list, ...fresh] : fresh;
    else st.mail = more ? [...list, ...fresh] : [...list.filter(m => m.mine || m.thread), ...fresh];
    saveState();
    updateInjection();
    changed();
}

async function sendMail() {
    const to = draft('mail:to');
    const subject = draft('mail:subject') || '(no subject)';
    const body = draft('mail:body');
    if (!to || !body) return toastr.info('Add a recipient and a message.', 'Mail');
    const st = state();
    const known = people().find(n => sameName(n, to) || sameName(addressFor(n), to));
    const sent = { id: nextId(st), from: userName(), to: known ?? to, address: myAddress(), subject, body, folder: 'sent', mine: true, read: true, time: Date.now(), known: !!known, thread: true };
    mailbox().push(sent);
    clearDrafts('mail:to', 'mail:subject', 'mail:body');
    ui.params = { folder: 'sent', open: sent.id };
    saveState();
    updateInjection();
    changed();
    toastr.success(`Sent to ${known ?? to}.`, 'Mail');
    if (!known) return;
    // People from the story write back.
    const earlier = mailbox().filter(m => m !== sent && (sameName(m.from, known) || sameName(m.to, known))).slice(-4)
        .map(m => `${m.mine ? userName() : m.from}: ${m.subject} — ${m.body.slice(0, 200)}`).join('\n') || '(none)';
    const data = await runJson('mailReply', { name: known, subject, body, earlier }, { busyKey: `mail:reply:${sent.id}`, asCharacter: known, queue: true });
    if (!data || data.reply === false || !str(data.body)) return;
    const reply = { id: nextId(st), from: known, address: addressFor(known), subject: str(data.subject) || `Re: ${subject}`, body: str(data.body), folder: 'inbox', known: true, read: false, thread: true, time: Date.now() };
    mailbox().push(reply);
    saveState();
    updateInjection();
    changed();
    notify({ app: 'mail', icon: 'fa-solid fa-envelope', title: known, text: reply.subject, go: () => navigate('mail', null, { folder: 'inbox', open: reply.id }) });
}

/** Emails with people from the story, for the prompt. */
export function mailContext(limit = 4) {
    const user = userName();
    return (state().mail ?? []).filter(m => m.known && m.thread).sort((a, b) => a.time - b.time).slice(-limit)
        .map(m => m.mine ? `${user} emailed ${m.to}: "${m.subject}" — ${m.body.replace(/\s+/g, ' ').slice(0, 160)}` : `${m.from} emailed ${user}: "${m.subject}" — ${m.body.replace(/\s+/g, ' ').slice(0, 160)}`);
}

function unreadMail() {
    return (state().mail ?? []).filter(m => m.folder === 'inbox' && !m.read).length;
}

function renderMail() {
    const who = owner();
    const list = mailbox();
    const folder = ui.params.folder ?? 'inbox';
    const busy = isBusy(who ? `mail:${norm(who)}` : 'mail');
    const folders = [['inbox', 'fa-solid fa-inbox', 'Inbox'], ['sent', 'fa-solid fa-paper-plane', 'Sent'], ...(who ? [] : [['spam', 'fa-solid fa-ban', 'Spam']])];
    const items = list.filter(m => m.folder === folder).sort((a, b) => b.time - a.time);
    const open = ui.params.open ? list.find(m => m.id === ui.params.open) : null;
    if (open && !open.read) {
        open.read = true;
        saveState();
    }
    const nav = `<nav class="stp-mail-nav">
        ${who ? '' : `<button class="stp-btn stp-btn-primary stp-btn-sm stp-mail-compose" data-act="mail-compose"><i class="fa-solid fa-pen"></i><span>Compose</span></button>`}
        ${folders.map(([id, icon, label]) => {
        const n = id === 'inbox' ? list.filter(m => m.folder === 'inbox' && !m.read).length : 0;
        return `<button class="stp-mail-folder ${folder === id ? 'stp-active' : ''}" data-act="mail-folder" data-folder="${id}"><i class="${icon}"></i><span>${label}</span>${n ? `<b>${n}</b>` : ''}</button>`;
    }).join('')}
        <div class="stp-mail-account">${avatar(who ?? userName(), 'xs')}<span>${esc(who ? addressFor(who) : myAddress())}</span></div>
    </nav>`;
    const rows = items.map(m => `<button class="stp-mail-row ${m.read ? '' : 'stp-unread'} ${open?.id === m.id ? 'stp-active' : ''}" data-act="mail-open" data-id="${esc(m.id)}">
        <div class="stp-mail-row-top"><b>${esc(m.folder === 'sent' ? `To: ${m.to || '?'}` : m.from)}</b>${m.known ? ' <i class="fa-solid fa-star stp-mail-star"></i>' : ''}<span>${esc(ago(m.time))}</span></div>
        <div class="stp-mail-subject">${esc(m.subject)}</div>
        <div class="stp-mail-snippet">${esc(m.body.replace(/\s+/g, ' ').slice(0, 90))}</div>
    </button>`).join('');
    const listPane = `<div class="stp-mail-list">
        <div class="stp-mail-list-head"><b>${folders.find(f => f[0] === folder)?.[2] ?? ''}</b>
            <button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="mail-refresh" title="${who ? `Read ${esc(who)}'s email` : 'Check mail'}" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button></div>
        <div class="stp-scroll" data-scroll="mail:${folder}">
            ${rows || (busy ? shimmerCards(3) : empty('fa-regular fa-envelope', list.length ? 'Nothing here' : who ? `${esc(who)}'s inbox` : 'No mail yet', '', list.length ? '' : button(who ? 'Read their email' : 'Check mail', 'mail-refresh', { icon: 'fa-solid fa-arrows-rotate' })))}
            ${rows && !who ? `<div class="stp-more"><button class="stp-btn stp-btn-soft stp-btn-sm" data-act="mail-more" ${busy ? 'disabled' : ''}><i class="fa-solid fa-chevron-down"></i><span>Older mail</span></button></div>` : ''}
        </div>
    </div>`;
    let reader;
    if (ui.params.compose && !who) {
        reader = `<div class="stp-mail-read stp-mail-composer">
            <div class="stp-mail-read-head"><b>New message</b>${iconBtn('fa-solid fa-xmark', 'mail-compose-close', 'Discard')}</div>
            ${input('mail:to', 'To (a name or address)', { attrs: 'list="stp-mail-people"' })}
            <datalist id="stp-mail-people">${people().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
            ${input('mail:subject', 'Subject')}
            ${textarea('mail:body', 'Write your email…', { rows: 10 })}
            <div class="stp-row-end"><span class="stp-muted stp-small">People from your story write back</span>${button('Send', 'mail-send', { icon: 'fa-solid fa-paper-plane', small: true })}</div>
        </div>`;
    } else if (open) {
        reader = `<div class="stp-mail-read">
            <div class="stp-mail-read-head"><h3>${esc(open.subject)}</h3>
                ${!who && open.folder !== 'sent' ? iconBtn('fa-solid fa-reply', 'mail-reply', 'Reply', `data-id="${esc(open.id)}"`) : ''}</div>
            <div class="stp-mail-from">${avatar(open.mine ? userName() : open.from, 'md')}<div><b>${esc(open.mine ? userName() : open.from)}</b> <span class="stp-muted">&lt;${esc(open.address)}&gt;</span>
                <div class="stp-muted stp-small">to ${esc(open.folder === 'sent' ? open.to : who ? who : 'me')} · ${esc(new Date(open.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</div></div></div>
            <div class="stp-scroll stp-mail-body" data-scroll="mail-body:${esc(open.id)}">${fmt(open.body)}</div>
            ${isBusy(`mail:reply:${open.id}`) ? '<div class="stp-comment-typing stp-shimmer">Waiting for a reply…</div>' : ''}
        </div>`;
    } else {
        reader = `<div class="stp-mail-read stp-mail-empty"><i class="fa-regular fa-envelope-open"></i><span>Select an email to read</span></div>`;
    }
    return `<div class="stp-mail">${nav}${listPane}${reader}</div>`;
}

export const mailApp = {
    id: 'mail',
    label: 'Mail',
    icon: 'fa-solid fa-envelope',
    color: 'linear-gradient(160deg, #4facfe, #1565d8)',
    group: 'Work',
    pc: true,
    badge: () => (owner() ? 0 : unreadMail()),
    render: renderMail,
    actions: {
        'mail-folder': el => {
            ui.params = { folder: el.dataset.folder };
            changed();
        },
        'mail-open': el => {
            ui.params.open = el.dataset.id;
            ui.params.compose = false;
            changed();
        },
        'mail-refresh': () => loadInbox(),
        'mail-more': () => loadInbox({ more: true }),
        'mail-compose': () => {
            ui.params.compose = true;
            changed();
        },
        'mail-compose-close': () => {
            ui.params.compose = false;
            changed();
        },
        'mail-reply': el => {
            const m = mailbox().find(x => x.id === el.dataset.id);
            if (!m) return;
            ui.drafts['mail:to'] = m.from;
            ui.drafts['mail:subject'] = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
            ui.params.compose = true;
            changed();
        },
        'mail-send': () => sendMail(),
    },
};

// ================================================================== Files

const FILE_ICONS = [
    [/\.(docx?|odt|rtf|pages)$/i, 'fa-solid fa-file-word', '#2b7cd3'],
    [/\.(xlsx?|csv|numbers|ods)$/i, 'fa-solid fa-file-excel', '#21a366'],
    [/\.(pptx?|key)$/i, 'fa-solid fa-file-powerpoint', '#d35230'],
    [/\.pdf$/i, 'fa-solid fa-file-pdf', '#e5252a'],
    [/\.(png|jpe?g|gif|webp|heic)$/i, 'fa-solid fa-file-image', '#a259ff'],
    [/\.(mp3|wav|flac|m4a)$/i, 'fa-solid fa-file-audio', '#ff7a00'],
    [/\.(mp4|mov|mkv|avi)$/i, 'fa-solid fa-file-video', '#ff3d71'],
    [/\.(zip|rar|7z)$/i, 'fa-solid fa-file-zipper', '#c7a000'],
    [/\/$|^[^.]+$/, 'fa-solid fa-folder', '#f2b33d'],
];

function fileIcon(name) {
    const hit = FILE_ICONS.find(([re]) => re.test(name));
    return hit ? `<i class="${hit[1]}" style="color:${hit[2]}"></i>` : '<i class="fa-solid fa-file-lines" style="color:#8e8e93"></i>';
}

async function loadTheirFiles(name) {
    const data = await runJson('devFiles', { name }, { busyKey: `files:${norm(name)}`, asCharacter: name });
    if (!data) return;
    const st = state();
    device(name).files = arr(data.files).filter(f => str(f.name)).map((f, i) => ({
        id: nextId(st), name: str(f.name), folder: /down/i.test(str(f.folder)) ? 'Downloads' : /desk/i.test(str(f.folder)) ? 'Desktop' : 'Documents',
        size: str(f.size), content: str(f.content), time: Date.now() - parseAgo(f.ago, i),
    }));
    device(name).peeked = { ...device(name).peeked, files: Date.now() };
    saveState();
    updateInjection();
    changed();
}

/** Files on this PC, by folder. {{user}}'s are built from what's already on the device. */
function filesOf(folder) {
    const who = owner();
    if (who) {
        if (folder === 'Pictures') {
            const d = device(who);
            return [...d.photos.filter(p => p.album !== 'Hidden'), ...liveItems().filter(x => x.image && sameName(x.from, who) && x.kind === 'post')]
                .map(p => ({ id: p.id, name: `IMG_${String(Math.abs(Math.round(p.time / 1000)) % 10000).padStart(4, '0')}.jpg`, photo: p, time: p.time }));
        }
        return (device(who).files ?? []).filter(f => f.folder === folder);
    }
    if (folder === 'Documents') {
        return state().notes.map(n => ({ id: n.id, name: `${(n.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '').slice(0, 40)}.txt`, note: true, size: `${Math.max(1, Math.round((n.body || '').length / 1024))} KB`, time: n.updated }));
    }
    if (folder === 'Pictures') {
        return liveItems().filter(x => x.image && x.app !== 'rated' && x.kind !== 'search')
            .map(p => ({ id: p.id, name: `IMG_${String(Math.abs(Math.round(p.time / 1000)) % 10000).padStart(4, '0')}.jpg`, photo: p, time: p.time }));
    }
    if (folder === 'Downloads') {
        return liveItems().filter(x => x.kind === 'order' && (isUser(x.from) || x.source === 'user'))
            .map(o => ({ id: o.id, name: `Receipt_${(o.store || (o.app === 'food' ? 'Munch' : 'Cartly')).replace(/\s+/g, '')}_${(o.item || 'order').replace(/[^\w]+/g, '_').slice(0, 24)}.pdf`, size: '86 KB', content: `${o.item}${o.price ? ` — ${o.price}` : ''}${o.recipient && !isUser(o.recipient) ? `\nShipped to ${o.recipient}` : ''}${o.note ? `\nGift note: ${o.note}` : ''}`, time: o.time }));
    }
    return [];
}

function renderFiles() {
    const who = owner();
    const folder = ui.params.folder ?? (who ? 'Documents' : 'Documents');
    const folders = who ? ['Desktop', 'Documents', 'Downloads', 'Pictures'] : ['Documents', 'Downloads', 'Pictures'];
    const busy = who && isBusy(`files:${norm(who)}`);
    const list = filesOf(folder).sort((a, b) => b.time - a.time);
    const open = ui.params.open ? list.find(f => f.id === ui.params.open) : null;
    const side = `<nav class="stp-files-side">
        <div class="stp-files-side-label">${esc(who ? `${who}'s PC` : 'This PC')}</div>
        ${folders.map(f => `<button class="stp-mail-folder ${folder === f ? 'stp-active' : ''}" data-act="files-folder" data-folder="${f}"><i class="fa-solid fa-${f === 'Pictures' ? 'image' : f === 'Downloads' ? 'download' : f === 'Desktop' ? 'desktop' : 'folder'}"></i><span>${f}</span></button>`).join('')}
    </nav>`;
    let main;
    if (folder === 'Pictures') {
        main = list.length ? `<div class="stp-gallery stp-files-gallery">${list.map(f => `<figure>${photo(f.photo, 'stp-photo-tile')}<figcaption>${esc(f.name)}</figcaption></figure>`).join('')}</div>`
            : empty('fa-regular fa-image', 'No pictures');
    } else {
        main = list.length ? `<div class="stp-files-table">
            <div class="stp-files-row stp-files-headrow"><span>Name</span><span>Modified</span><span>Size</span></div>
            ${list.map(f => `<button class="stp-files-row ${open?.id === f.id ? 'stp-active' : ''}" data-act="files-open" data-id="${esc(f.id)}"><span class="stp-files-name">${fileIcon(f.name)}${esc(f.name)}</span><span>${esc(new Date(f.time).toLocaleDateString())}</span><span>${esc(f.size || '—')}</span></button>`).join('')}
        </div>` : busy ? shimmerCards(3) : empty('fa-regular fa-folder-open', who ? `What's on ${esc(who)}'s computer?` : folder === 'Documents' ? 'No documents' : 'No downloads',
            who ? '' : folder === 'Documents' ? 'Notes you write show up here as documents.' : 'Receipts from your orders land here.',
            who ? button('Look through their files', 'files-load', { icon: 'fa-solid fa-user-secret' }) : folder === 'Documents' ? button('New document', 'files-new', { icon: 'fa-solid fa-plus' }) : '');
    }
    const preview = open && !open.photo && !open.note ? `<aside class="stp-files-preview">
            <div class="stp-files-preview-icon">${fileIcon(open.name)}</div>
            <b>${esc(open.name)}</b><span class="stp-muted stp-small">${esc(open.size || '')} · ${esc(ago(open.time))} ago</span>
            <div class="stp-files-preview-body">${fmt(open.content || '(empty)')}</div>
        </aside>` : '';
    const tools = `${who ? `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="files-load" title="Look again" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button>` : folder === 'Documents' ? iconBtn('fa-solid fa-plus', 'files-new', 'New document') : ''}`;
    return `<div class="stp-files">${side}
        <div class="stp-files-main">
            <div class="stp-files-path"><i class="fa-solid fa-chevron-left stp-muted"></i><i class="fa-solid fa-chevron-right stp-muted"></i><span>${esc(who ? `${who}'s PC` : 'This PC')} › ${esc(folder)}</span>${tools}</div>
            <div class="stp-scroll" data-scroll="files:${folder}">${main}</div>
        </div>
        ${preview}
    </div>`;
}

export const filesApp = {
    id: 'files',
    label: 'Files',
    icon: 'fa-solid fa-folder',
    color: 'linear-gradient(160deg, #ffd25e, #f2a400)',
    group: 'Work',
    pc: true,
    render: renderFiles,
    actions: {
        'files-folder': el => {
            ui.params = { folder: el.dataset.folder };
            changed();
        },
        'files-open': el => {
            const f = filesOf(ui.params.folder ?? 'Documents').find(x => x.id === el.dataset.id);
            if (f?.note) return navigate('notes', 'note', { id: f.id });
            ui.params.open = ui.params.open === el.dataset.id ? null : el.dataset.id;
            changed();
        },
        'files-load': () => owner() && loadTheirFiles(owner()),
        'files-new': () => {
            const st = state();
            const note = { id: nextId(st), title: '', body: '', updated: Date.now() };
            st.notes.push(note);
            saveState();
            navigate('notes', 'note', { id: note.id });
        },
    },
};

// ================================================================== Games

function library() {
    const who = owner();
    if (who) return device(who).games ??= null;
    return state().games ?? null;
}

async function loadGames() {
    const who = owner();
    const data = await runJson('games', {
        who: who ? `${userName()} snoops through ${who}'s PC and` : userName(),
        whose: who ? `${who}'s` : `${userName()}'s`,
        people: people().filter(n => !sameName(n, who ?? '')).join(', ') || '(none)',
    }, { busyKey: `games:${norm(who ?? 'me')}`, asCharacter: who });
    if (!data) return;
    const st = state();
    const lib = {
        games: arr(data.games).filter(g => str(g.title)).map((g, i) => ({
            id: nextId(st), title: str(g.title), genre: str(g.genre), hours: toNum(g.hours), image: str(g.cover) || `${str(g.title)} game cover art`,
            kind: 'product', time: Date.now() - parseAgo(g.lastPlayed, i),
        })),
        friends: arr(data.friends).filter(f => str(f.name)).map(f => ({ name: str(f.name), status: str(f.status) || 'Online' })),
        loaded: Date.now(),
    };
    if (who) device(who).games = lib;
    else st.games = { ...lib, playing: st.games?.playing ?? null };
    saveState();
    updateInjection();
    changed();
    autoImages(lib.games, { fromFeed: true });
}

/** What {{user}} is playing, for the prompt. */
export function gamesContext() {
    const g = state().games;
    if (!g?.playing) return [];
    return [`${userName()} is playing ${g.playing} on their PC right now.`];
}

function renderGames() {
    const who = owner();
    const lib = library();
    const busy = isBusy(`games:${norm(who ?? 'me')}`);
    if (!lib) {
        return `<div class="stp-games stp-games-empty">${busy ? shimmerCards(3) : empty('fa-solid fa-gamepad', who ? `What does ${esc(who)} play?` : 'Your game library', who ? 'Their library, hours played — and friends online.' : 'Your games and what your friends are playing.', button(who ? 'Look at their library' : 'Open library', 'games-load', { icon: 'fa-solid fa-gamepad' }))}</div>`;
    }
    const games = [...lib.games].sort((a, b) => b.time - a.time);
    const total = games.reduce((s, g) => s + (g.hours || 0), 0);
    const playing = !who && state().games?.playing;
    const statusColor = s => (/^playing/i.test(s) ? '#5ac85a' : /online/i.test(s) ? '#57cbde' : /away/i.test(s) ? '#f2b33d' : '#6b6b72');
    return `<div class="stp-games">
        <div class="stp-games-main stp-scroll" data-scroll="games">
            <div class="stp-games-head"><b>${esc(who ? `${who}'s library` : 'Library')}</b><span class="stp-muted">${games.length} games · ${compact(total)} hours</span>
                <button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="games-load" title="Refresh" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button></div>
            ${playing ? `<div class="stp-games-now"><i class="fa-solid fa-circle-play"></i> Now playing <b>${esc(playing)}</b><button class="stp-btn stp-btn-soft stp-btn-sm" data-act="games-stop">Quit game</button></div>` : ''}
            <div class="stp-games-grid">${games.map(g => `<div class="stp-game-card" style="--game:${gradientFor(g.title)}">
                <div class="stp-game-cover">${photo(g, 'stp-photo-portrait', { interactive: !!g.imageUrl })}</div>
                <div class="stp-game-meta"><b>${esc(g.title)}</b><span>${esc(g.genre)}</span><span>${compact(g.hours)} h · ${esc(ago(g.time))} ago</span></div>
                ${who ? '' : `<button class="stp-game-play ${playing === g.title ? 'stp-on' : ''}" data-act="games-play" data-id="${esc(g.id)}"><i class="fa-solid fa-play"></i> ${playing === g.title ? 'Playing' : 'Play'}</button>`}
            </div>`).join('')}</div>
        </div>
        <aside class="stp-games-friends">
            <div class="stp-games-friends-head">Friends <span class="stp-muted">${lib.friends.filter(f => !/^offline/i.test(f.status)).length} online</span></div>
            ${playing ? `<div class="stp-games-friend">${avatar(userName(), 'sm')}<div><b>${esc(userName())}</b><span style="color:#5ac85a">Playing ${esc(playing)}</span></div></div>` : ''}
            ${lib.friends.map(f => `<div class="stp-games-friend">${avatar(f.name, 'sm')}<div><b>${esc(f.name)}</b><span style="color:${statusColor(f.status)}">${esc(f.status)}</span></div></div>`).join('')}
        </aside>
    </div>`;
}

export const gamesApp = {
    id: 'games',
    label: 'Games',
    icon: 'fa-solid fa-gamepad',
    color: 'linear-gradient(160deg, #2a475e, #171a21)',
    group: 'Play',
    pc: true,
    render: renderGames,
    actions: {
        'games-load': () => loadGames(),
        'games-play': el => {
            const g = state().games?.games.find(x => x.id === el.dataset.id);
            if (!g) return;
            state().games.playing = state().games.playing === g.title ? null : g.title;
            g.time = Date.now();
            saveState();
            updateInjection();
            changed();
        },
        'games-stop': () => {
            if (state().games) state().games.playing = null;
            saveState();
            updateInjection();
            changed();
        },
    },
};
