// Their phone: swap the device to a story character's phone or PC and look through it.
// Texts with {{user}} are mirrored from the real conversation; everything else
// (their other conversations, calls, notes, camera roll) is generated on demand.
import { changed, chatCharacters, isUser, liveItems, nextId, people, saveState, settings, state, userName } from '../core.js';
import { isBusy, peek, runJson } from '../gen.js';
import { autoImages } from '../images.js';
import { updateInjection } from '../inject.js';
import { avatar, button, empty, header, iconBtn, peekButton, photo, sectionLabel, shimmerCards, tabs } from '../ui/kit.js';
import { navigate, ui } from '../ui/state.js';
import { splitView } from './messages.js';
import { withGuide } from '../guide.js';
import { ago, arr, clock, esc, fmt, norm, parseAgo, sameName, str } from '../util.js';

// ---------------------------------------------------------------- ownership

/** Whose device is showing: null for {{user}}'s own, or a character's name. */
export function owner() {
    return ui.owner || null;
}

/** People whose device can be opened: the chat's characters, then anyone already looked at. */
export function ownerOptions() {
    const out = [];
    for (const n of [...chatCharacters(), ...Object.keys(state().devices ?? {})]) {
        if (n && !isUser(n) && !out.some(x => sameName(x, n))) out.push(n);
    }
    return out;
}

export function setOwner(name) {
    ui.owner = name || null;
    ui.ownerMenu = false;
    ui.app = 'home';
    ui.view = null;
    ui.params = {};
    ui.homePage = 0;
    ui.viewer = null;
    // Someone else's phone greets you with their lock screen.
    ui.locked = !!name && settings().lockScreen && settings().mode !== 'pc';
    if (name) {
        const d = device(name);
        if (!d.snooped) {
            d.snooped = Date.now();
            saveState();
        }
    }
    updateInjection();
    changed();
}

export function device(name) {
    const st = state();
    st.devices ??= {};
    const key = Object.keys(st.devices).find(k => sameName(k, name)) ?? name;
    const d = (st.devices[key] ??= {});
    d.threads ??= [];
    d.calls ??= [];
    d.notes ??= [];
    d.photos ??= [];
    return d;
}

function busyKey(section, name) {
    return `dev:${section}:${norm(name)}`;
}

// ---------------------------------------------------------------- generation

function isMe(from, name) {
    return /^(me|myself|i)$/i.test(from) || sameName(from, name);
}

/** Times for messages listed oldest first: honour "ago" but keep the order. */
function messageTimes(list, end = Date.now()) {
    let t = end;
    const times = [];
    for (let i = list.length - 1; i >= 0; i--) {
        const fromAgo = list[i].ago ? end - parseAgo(list[i].ago, 0) : null;
        t = Math.min(t - 60e3, fromAgo ?? t - (4 + (i % 3) * 3) * 60e3);
        times[i] = t;
    }
    return times;
}

function mapMessages(list, name, end) {
    const st = state();
    const raw = arr(list).filter(m => str(m.text) || str(m.image));
    const times = messageTimes(raw, end);
    return raw.map((m, i) => ({
        id: nextId(st), mine: isMe(str(m.from), name), from: isMe(str(m.from), name) ? name : str(m.from),
        text: str(m.text), image: str(m.image), time: times[i],
    }));
}

export async function peekTexts(name, { more = false } = {}) {
    const d = device(name);
    const data = await runJson('devTexts', {
        name,
        count: more ? '2-3' : '4-6',
        people: people().filter(n => !sameName(n, name)).join(', ') || '(none)',
        more: more && d.threads.length ? `They already have these conversations — write DIFFERENT ones:\n${d.threads.map(t => `- ${t.contact}`).join('\n')}` : '',
    }, { busyKey: busyKey('texts', name), asCharacter: name });
    if (!data) return;
    if (str(data.userContactName)) d.userContactName = str(data.userContactName);
    const st = state();
    const fresh = [];
    arr(data.threads).forEach((t, i) => {
        const contact = str(t.contact);
        if (!contact || isUser(contact) || sameName(contact, name) || (d.userContactName && sameName(contact, d.userContactName))) return;
        const messages = mapMessages(t.messages, name, Date.now() - i * 37 * 60e3);
        if (!messages.length) return;
        const members = (Array.isArray(t.members) ? t.members : []).map(m => str(m)).filter(m => m && !sameName(m, name));
        fresh.push({ id: nextId(st), contact, members: members.length > 1 ? members : undefined, messages });
    });
    d.threads = more ? [...d.threads, ...fresh.filter(t => !d.threads.some(x => sameName(x.contact, t.contact)))] : fresh;
    d.peeked = { ...d.peeked, texts: Date.now() };
    done(fresh.flatMap(t => t.messages.filter(m => m.image)));
}

export async function continueThread(name, thread) {
    const recent = thread.messages.slice(-12).map(m => `${m.mine ? name : m.from}: ${m.text || `[photo: ${m.image}]`}`).join('\n');
    const data = await runJson('devThread', { name, contact: thread.contact, recent }, { busyKey: busyKey(`thread:${thread.id}`, name), asCharacter: name });
    if (!data) return;
    const start = Math.max(Date.now() - 10 * 60e3, (thread.messages.at(-1)?.time ?? 0) + 60e3);
    const added = mapMessages(data.messages, name, Date.now()).map((m, i) => ({ ...m, time: start + i * 50e3 }));
    thread.messages.push(...added);
    ui.scrollBottom = true;
    done(added.filter(m => m.image));
}

export async function peekCalls(name) {
    const data = await runJson('devCalls', { name }, { busyKey: busyKey('calls', name), asCharacter: name });
    if (!data) return;
    const st = state();
    const d = device(name);
    d.calls = arr(data.calls).filter(c => str(c.contact) && !isUser(str(c.contact))).map((c, i) => ({
        id: nextId(st), contact: str(c.contact), dir: /out/i.test(str(c.dir)) ? 'out' : 'in',
        status: /miss/i.test(str(c.status)) ? 'missed' : /declin/i.test(str(c.status)) ? 'declined' : 'answered',
        duration: str(c.duration), voicemail: str(c.voicemail), time: Date.now() - parseAgo(c.ago, i),
    }));
    d.peeked = { ...d.peeked, calls: Date.now() };
    done([]);
}

export async function peekNotes(name, { more = false } = {}) {
    const d = device(name);
    const data = await runJson('devNotes', {
        name, more: more && d.notes.length ? `These notes already exist — write DIFFERENT, older ones:\n${d.notes.map(n => `- ${n.title}`).join('\n')}` : '',
    }, { busyKey: busyKey('notes', name), asCharacter: name });
    if (!data) return;
    const st = state();
    const oldest = d.notes.length ? Math.min(...d.notes.map(n => n.time)) : Date.now();
    const fresh = arr(data.notes).filter(n => str(n.body) || str(n.title)).map((n, i) => ({
        id: nextId(st), title: str(n.title), body: str(n.body), time: more ? oldest - (i + 1) * 30 * 3600e3 : Date.now() - parseAgo(n.ago, i),
    }));
    d.notes = more ? [...d.notes, ...fresh] : fresh;
    d.peeked = { ...d.peeked, notes: Date.now() };
    done([]);
}

export async function peekPhotos(name, { more = false } = {}) {
    const d = device(name);
    const data = await runJson('devPhotos', {
        name, more: more && d.photos.length ? `These photos are already in the camera roll — add DIFFERENT, older ones:\n${d.photos.slice(0, 15).map(p => `- ${p.image}`).join('\n')}` : '',
    }, { busyKey: busyKey('photos', name), asCharacter: name });
    if (!data) return;
    const st = state();
    const oldest = d.photos.length ? Math.min(...d.photos.map(p => p.time)) : Date.now();
    const fresh = arr(data.photos).filter(p => str(p.image)).map((p, i) => ({
        id: nextId(st), from: name, image: str(p.image), album: albumOf(p.album), time: more ? oldest - (i + 1) * 9 * 3600e3 : Date.now() - parseAgo(p.ago, i),
    }));
    d.photos = more ? [...d.photos, ...fresh] : fresh;
    d.peeked = { ...d.peeked, photos: Date.now() };
    // The hidden album only develops when it's opened.
    done(fresh.filter(p => p.album !== 'Hidden'));
}

function albumOf(value) {
    const v = str(value).toLowerCase();
    if (v.startsWith('fav')) return 'Favorites';
    if (v.startsWith('screen')) return 'Screenshots';
    if (v.startsWith('hid') || v.startsWith('priv') || v.startsWith('secret')) return 'Hidden';
    return 'Recents';
}

function done(withImages) {
    saveState();
    updateInjection();
    changed();
    if (withImages.length) autoImages(withImages, { fromFeed: true });
}

/** Look through everything at once: texts, calls, notes, photos, then the rest of the phone. */
async function peekEverything(name) {
    ui.peekAll = name;
    changed();
    await withGuide(async () => {
    try {
        await peekTexts(name);
        await peekCalls(name);
        await peekNotes(name);
        await peekPhotos(name);
        await peek(name);
    } finally {
        ui.peekAll = null;
        changed();
    }
    });
}

// ------------------------------------------------------------------- reading

function contactNameForUser(name) {
    return device(name).userContactName || userName();
}

/** All conversations on their phone: with {{user}} (real), group chats they're in (real), and the rest (generated). */
function conversations(name) {
    const d = device(name);
    const items = liveItems().filter(x => x.kind === 'sms' && (x.app ?? 'messages') === 'messages' && x.status !== 'pending');
    const out = [];
    const direct = items.filter(x => !x.group && sameName(x.contact, name)).sort((a, b) => a.time - b.time);
    if (direct.length) {
        out.push({
            id: 'user', contact: contactNameForUser(name), real: true, isUser: true,
            messages: direct.map(it => ({ id: it.id, src: it, mine: it.dir === 'in', from: it.dir === 'in' ? name : userName(), text: it.text, image: it.image, voice: it.voice, time: it.time })),
        });
    }
    for (const g of state().groups ?? []) {
        if (!g.members?.some(m => sameName(m, name))) continue;
        const list = items.filter(x => x.group && sameName(x.contact, g.name)).sort((a, b) => a.time - b.time);
        if (!list.length) continue;
        out.push({
            id: `g:${g.name}`, contact: g.name, real: true, members: g.members,
            messages: list.map(it => {
                const from = it.dir === 'out' ? userName() : it.from;
                return { id: it.id, src: it, mine: it.dir === 'in' && sameName(it.from, name), from: isUser(from) ? contactNameForUser(name) : from, text: it.text, image: it.image, voice: it.voice, time: it.time };
            }),
        });
    }
    out.push(...d.threads);
    return out.sort((a, b) => (b.messages.at(-1)?.time ?? 0) - (a.messages.at(-1)?.time ?? 0));
}

function preview(m) {
    if (!m) return '';
    const body = m.voice ? '🎤 Voice message' : m.image && !m.text ? '📷 Photo' : `${m.image ? '📷 ' : ''}${m.text}`;
    return m.mine ? `You: ${body}` : body;
}

function threadIcon(t, size = 'md') {
    if (t.members?.length > 1) return `<span class="stp-group-avatar stp-avatar-${size}">${t.members.slice(0, 2).map(n => avatar(n, 'sm')).join('')}</span>`;
    return avatar(t.isUser ? userName() : t.contact, size);
}

/** Their phone's lock screen notifications. */
export function theirLockNotes(name) {
    return conversations(name)
        .map(t => ({ t, m: [...t.messages].reverse().find(x => !x.mine) }))
        .filter(x => x.m)
        .slice(0, 5)
        .map(({ t, m }) => ({ app: 'messages', title: t.contact, text: t.members ? `${m.from}: ${preview(m)}` : preview(m), time: m.time }));
}

/** Home screen widget on their phone. */
export function theirWidgets(name) {
    const d = device(name);
    const busy = ui.peekAll && sameName(ui.peekAll, name);
    const latest = conversations(name)[0];
    const glance = latest
        ? `<button class="stp-widget stp-widget-glance" data-act="their-thread" data-id="${esc(latest.id)}">
            <div class="stp-widget-label"><i class="fa-solid fa-comment"></i> Latest</div>
            <div class="stp-widget-title">${esc(latest.contact)}</div><div class="stp-widget-text">${esc(preview(latest.messages.at(-1)))}</div></button>`
        : `<div class="stp-widget stp-widget-glance"><div class="stp-widget-label"><i class="fa-solid fa-lock-open"></i> Unlocked</div>
            <div class="stp-widget-title">${esc(name)}'s phone</div><div class="stp-widget-text">Nothing loaded yet</div></div>`;
    const seen = Object.values(d.peeked ?? {}).length;
    return `<div class="stp-widgets">
        ${glance}
        <button class="stp-widget stp-widget-snoop ${busy ? 'stp-spin' : ''}" data-act="their-peek-all" data-name="${esc(name)}" ${busy ? 'disabled' : ''}>
            <div class="stp-widget-label"><i class="fa-solid fa-user-secret"></i> Snoop</div>
            <div class="stp-widget-title">${busy ? 'Looking…' : seen ? 'Look again' : 'Look through it'}</div>
            <div class="stp-widget-text">${busy ? 'Texts, calls, notes, photos…' : 'Load everything at once'}</div>
        </button>
    </div>`;
}

/** What {{user}} has seen on their phones, for the prompt. */
export function deviceContext() {
    const s = settings();
    if (s.injectDevice === false) return [];
    const blocks = [];
    for (const name of ownerOptions()) {
        const d = state().devices?.[Object.keys(state().devices ?? {}).find(k => sameName(k, name))];
        if (!d?.snooped) continue;
        const lines = [];
        for (const t of d.threads.slice().sort((a, b) => (b.messages.at(-1)?.time ?? 0) - (a.messages.at(-1)?.time ?? 0)).slice(0, 3)) {
            const last = t.messages.slice(-3).map(m => `${m.mine ? name : m.from}: ${m.text || `[photo: ${m.image}]`}`).join(' / ');
            lines.push(`Texts with ${t.contact}: ${last}`);
        }
        for (const n of d.notes.slice(0, 2)) lines.push(`Private note "${n.title}": ${n.body.replace(/\s+/g, ' ').slice(0, 140)}`);
        for (const m of (d.mail ?? []).slice(0, 2)) lines.push(`Email ${m.folder === 'sent' ? `to ${m.to}` : `from ${m.from}`}: "${m.subject}" — ${m.body.replace(/\s+/g, ' ').slice(0, 120)}`);
        for (const f of (d.files ?? []).slice(0, 2)) lines.push(`File on their computer, ${f.name}: ${f.content.replace(/\s+/g, ' ').slice(0, 120)}`);
        if (d.games?.games?.length) lines.push(`Most played games: ${[...d.games.games].sort((a, b) => b.hours - a.hours).slice(0, 3).map(g => `${g.title} (${g.hours}h)`).join(', ')}`);
        if (d.userContactName) lines.push(`${name} has ${userName()} saved in their contacts as "${d.userContactName}".`);
        if (!lines.length) continue;
        const known = s.snoopNoticed ? `${name} knows ${userName()} has looked through their phone.` : `${name} does NOT know ${userName()} looked through their phone.`;
        blocks.push(`[On ${name}'s own phone — things ${name} wrote and received privately. ${known}]\n${lines.join('\n')}`);
    }
    return blocks;
}

// ------------------------------------------------------------------ rendering

function peekBtn(act, name, busy, label = 'Look') {
    return `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="${act}" data-name="${esc(name)}" title="${esc(label)}" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button>`;
}

function snoopNote(name, section) {
    const at = device(name).peeked?.[section];
    return `<div class="stp-snoop-note"><i class="fa-solid fa-user-secret"></i> ${esc(name)}'s phone${at ? ` · looked ${ago(at) === 'now' ? 'just now' : `${esc(ago(at))} ago`}` : ''}</div>`;
}

function renderTheirThread(name, t) {
    const busy = !t.real && isBusy(busyKey(`thread:${t.id}`, name));
    const group = t.members?.length > 1;
    let last = 0;
    const rows = t.messages.map((m, i) => {
        const prev = t.messages[i - 1];
        const next = t.messages[i + 1];
        let sep = '';
        if (m.time - last > 45 * 60e3) {
            sep = `<div class="stp-day-sep">${esc(new Date(m.time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(clock(m.time))}</div>`;
            last = m.time;
        }
        const sameSide = x => x && x.mine === m.mine && (m.mine || x.from === m.from);
        const cls = `${sameSide(prev) && !sep ? 'stp-g-top' : ''} ${sameSide(next) ? 'stp-g-bottom' : ''}`;
        const pic = m.image ? photo(m.src ?? m, 'stp-bubble-photo') : '';
        const body = m.voice ? `<div class="stp-bubble">🎤 “${fmt(m.text)}”</div>` : m.text ? `<div class="stp-bubble">${fmt(m.text)}</div>` : '';
        if (m.mine) return `${sep}<div class="stp-msg stp-out ${cls}"><div class="stp-react-wrap">${pic}${body}</div></div>`;
        const sender = group && !(sameSide(prev) && !sep) ? `<div class="stp-sender">${esc(m.from)}</div>` : '';
        return `${sep}<div class="stp-msg stp-in ${cls} ${group ? 'stp-in-group' : ''}">${sender}
            <div class="stp-msg-line">${group ? (sameSide(next) ? '<span class="stp-avatar-gap"></span>' : avatar(m.from, 'xs')) : ''}<div class="stp-msg-stack">${pic}${body}</div></div></div>`;
    }).join('');
    const head = `<span class="stp-thread-head">${threadIcon(t, 'sm')}<span>${esc(t.contact)}</span>${group ? `<small class="stp-muted">${esc(t.members.join(', '))}</small>` : t.isUser ? `<small class="stp-muted">that's you</small>` : ''}</span>`;
    const actions = t.real ? '' : iconBtn('fa-solid fa-forward', 'their-continue', 'What happens next', `data-id="${esc(t.id)}" ${busy ? 'disabled' : ''}`);
    return `${header(head, { actions })}
        <div class="stp-scroll stp-thread" data-scroll="their:${esc(t.id)}">${rows}
            ${busy ? '<div class="stp-msg stp-in"><div class="stp-typing"><i></i><i></i><i></i></div></div>' : ''}
        </div>
        <div class="stp-snoop-bar"><i class="fa-solid fa-user-secret"></i><span>${t.real ? `You're reading this from ${esc(name)}'s side` : `Read-only · ⏩ to see what they say next`}</span></div>`;
}

function renderMessages(name) {
    const list = conversations(name);
    const open = ui.view === 'thread' ? list.find(x => x.id === ui.params.thread) : null;
    if (settings().mode === 'pc') return splitView(renderTheirList(name, list), open ? renderTheirThread(name, open) : '', 'fa-regular fa-comments', `${name}'s conversations`);
    if (open) return renderTheirThread(name, open);
    return renderTheirList(name, list);
}

function renderTheirList(name, list) {
    const busy = isBusy(busyKey('texts', name));
    const rows = list.map(t => `<button class="stp-row stp-thread-row" data-act="their-thread" data-id="${esc(t.id)}">
        ${threadIcon(t)}
        <div class="stp-row-main">
            <div class="stp-row-top"><span class="stp-row-title">${esc(t.contact)}${t.isUser ? ' <span class="stp-pill-mini">you</span>' : ''}</span><span class="stp-row-meta">${esc(clock(t.messages.at(-1)?.time ?? Date.now()))}</span></div>
            <div class="stp-row-sub">${esc(preview(t.messages.at(-1)))}</div>
        </div>
    </button>`).join('');
    const generated = device(name).threads.length;
    return `${header('Messages', { large: true, actions: peekBtn('their-peek-texts', name, busy, `Look at ${name}'s other conversations`) })}
        <div class="stp-scroll" data-scroll="their-messages">
            ${snoopNote(name, 'texts')}
            ${rows ? `<div class="stp-list">${rows}</div>` : ''}
            ${busy ? shimmerCards(3) : !generated
        ? empty('fa-regular fa-comments', `Who else does ${esc(name)} text?`, 'Their conversations with everyone else — friends, family, group chats.', button('Read their texts', 'their-peek-texts', { icon: 'fa-solid fa-user-secret', attrs: `data-name="${esc(name)}"` }))
        : `<div class="stp-more"><button class="stp-btn stp-btn-soft stp-btn-sm" data-act="their-more-texts" data-name="${esc(name)}"><i class="fa-solid fa-chevron-down"></i><span>More conversations</span></button></div>`}
        </div>`;
}

function renderCalls(name) {
    const d = device(name);
    const tab = ui.params.tab ?? 'recents';
    const busy = isBusy(busyKey('calls', name));
    // Calls with {{user}} from their side: {{user}}'s outgoing call is their incoming one.
    const withUser = liveItems().filter(x => x.kind === 'call' && sameName(x.contact, name) && x.status !== 'pending').map(c => ({
        id: c.id, contact: contactNameForUser(name), isUser: true, dir: c.dir === 'out' ? 'in' : 'out',
        status: c.status === 'missed' ? 'missed' : c.status === 'declined' ? 'declined' : 'answered', duration: c.duration, voicemail: c.dir === 'out' ? '' : c.text, time: c.time,
    }));
    const calls = [...withUser, ...d.calls].sort((a, b) => b.time - a.time);
    let body;
    if (tab === 'voicemail') {
        const vms = calls.filter(c => c.voicemail && c.dir === 'in');
        body = vms.length ? vms.map(v => `<div class="stp-card stp-voicemail">
            <div class="stp-row-top">${avatar(v.isUser ? userName() : v.contact, 'sm')}<b>${esc(v.contact)}</b><span class="stp-row-meta">${esc(ago(v.time))}</span></div>
            <div class="stp-vm-wave">${Array.from({ length: 28 }, (_, i) => `<span style="height:${6 + ((i * 37) % 19)}px"></span>`).join('')}</div>
            <div class="stp-vm-text">“${fmt(v.voicemail)}”</div></div>`).join('') : empty('fa-solid fa-voicemail', 'No voicemail');
    } else if (tab === 'contacts') {
        const names = [];
        const add = n => n && !names.some(x => sameName(x, n)) && names.push(n);
        add(contactNameForUser(name));
        conversations(name).forEach(t => add(t.contact));
        calls.forEach(c => add(c.contact));
        body = `<div class="stp-list">${names.map(n => `<div class="stp-row">${avatar(sameName(n, contactNameForUser(name)) ? userName() : n, 'md')}<div class="stp-row-main"><div class="stp-row-title">${esc(n)}</div>${sameName(n, contactNameForUser(name)) ? '<div class="stp-row-sub">that\'s you</div>' : ''}</div></div>`).join('')}</div>`;
    } else {
        body = calls.length ? `<div class="stp-list">${calls.map(c => {
            const missed = c.dir === 'in' && c.status === 'missed';
            const icon = c.dir === 'out' ? 'fa-solid fa-phone-flip' : missed ? 'fa-solid fa-phone-slash' : 'fa-solid fa-phone';
            const label = c.dir === 'out' ? 'Outgoing' : missed ? 'Missed' : c.status === 'declined' ? 'Declined' : 'Incoming';
            return `<div class="stp-row">${avatar(c.isUser ? userName() : c.contact, 'md')}
                <div class="stp-row-main"><div class="stp-row-top"><span class="stp-row-title ${missed ? 'stp-danger-text' : ''}">${esc(c.contact)}</span><span class="stp-row-meta">${esc(ago(c.time))}</span></div>
                <div class="stp-row-sub"><i class="${icon}"></i> ${esc(label)}${c.duration ? ` · ${esc(c.duration)}` : ''}${c.voicemail ? ' · <i class="fa-solid fa-voicemail"></i>' : ''}</div></div></div>`;
        }).join('')}</div>` : '';
        if (!d.calls.length) body += busy ? shimmerCards(2) : empty('fa-solid fa-phone', `Who has ${esc(name)} been calling?`, '', button('See their calls', 'their-peek-calls', { icon: 'fa-solid fa-user-secret', attrs: `data-name="${esc(name)}"` }));
    }
    return `${header('Phone', { large: true, actions: peekBtn('their-peek-calls', name, busy, 'Look at their calls') })}
        ${tabs([{ id: 'recents', label: 'Recents' }, { id: 'contacts', label: 'Contacts' }, { id: 'voicemail', label: 'Voicemail' }], tab)}
        <div class="stp-scroll" data-scroll="their-phone:${tab}">${snoopNote(name, 'calls')}${body}</div>`;
}

function renderNotes(name) {
    const d = device(name);
    const busy = isBusy(busyKey('notes', name));
    if (ui.view === 'note') {
        const n = d.notes.find(x => x.id === ui.params.id);
        if (n) {
            return `${header('Notes')}
                <div class="stp-scroll stp-note-edit" data-scroll="their-note">
                    <div class="stp-note-title stp-note-read">${esc(n.title || 'Untitled')}</div>
                    <div class="stp-muted stp-small">${esc(new Date(n.time).toLocaleString())}</div>
                    <div class="stp-note-body stp-note-read">${fmt(n.body)}</div>
                </div>`;
        }
    }
    const notes = [...d.notes].sort((a, b) => b.time - a.time);
    return `${header('Notes', { large: true, actions: peekBtn('their-peek-notes', name, busy, 'Look at their notes') })}
        <div class="stp-scroll" data-scroll="their-notes">
            ${snoopNote(name, 'notes')}
            ${notes.length ? `<div class="stp-card stp-list-card">${notes.map(n => `<button class="stp-row stp-note-row" data-act="their-note" data-id="${esc(n.id)}">
                <div class="stp-row-main"><div class="stp-row-title">${esc(n.title || 'Untitled')}</div><div class="stp-row-sub">${esc(new Date(n.time).toLocaleDateString())} · ${esc(n.body.slice(0, 60))}</div></div>
            </button>`).join('')}</div>
            <div class="stp-more"><button class="stp-btn stp-btn-soft stp-btn-sm ${busy ? 'stp-spin' : ''}" data-act="their-more-notes" data-name="${esc(name)}" ${busy ? 'disabled' : ''}><i class="fa-solid fa-chevron-down"></i><span>${busy ? 'Reading…' : 'Older notes'}</span></button></div>`
        : busy ? shimmerCards(3) : empty('fa-regular fa-note-sticky', `What does ${esc(name)} write down?`, 'Lists, reminders, drafts they never sent…', button('Read their notes', 'their-peek-notes', { icon: 'fa-solid fa-user-secret', attrs: `data-name="${esc(name)}"` }))}
        </div>`;
}

function renderPhotos(name) {
    const d = device(name);
    const busy = isBusy(busyKey('photos', name));
    const tab = ui.params.tab ?? 'Recents';
    // Photos they sent {{user}} or posted live in their camera roll too.
    const shared = liveItems().filter(x => x.image && sameName(x.from, name) && (x.kind === 'sms' || x.kind === 'post') && x.app !== 'rated')
        .map(x => ({ ...x, album: 'Recents', shared: true }));
    const all = [...d.photos, ...shared].sort((a, b) => b.time - a.time);
    const hidden = tab === 'Hidden';
    const list = tab === 'Recents' ? all.filter(p => p.album !== 'Hidden') : all.filter(p => p.album === tab);
    const locked = hidden && !ui.params.unlocked;
    const tile = p => photo(p.shared ? liveItems().find(x => x.id === p.id) ?? p : p, 'stp-photo-tile');
    const body = locked
        ? `<div class="stp-hidden-album"><i class="fa-solid fa-eye-slash"></i><b>Hidden album</b><span>${list.length ? `${list.length} item${list.length > 1 ? 's' : ''}` : 'Locked'}</span>${button('Unlock with Face ID', 'their-unlock-hidden', { variant: 'soft', icon: 'fa-solid fa-face-smile' })}</div>`
        : list.length ? `<div class="stp-gallery">${list.map(tile).join('')}</div>` : '';
    return `${header('Photos', { large: true, actions: peekBtn('their-peek-photos', name, busy, 'Look at their camera roll') })}
        ${tabs(['Recents', 'Favorites', 'Screenshots', 'Hidden'].map(id => ({ id, label: id, icon: id === 'Hidden' ? 'fa-solid fa-eye-slash' : '' })), tab)}
        <div class="stp-scroll" data-scroll="their-photos:${tab}">
            ${snoopNote(name, 'photos')}
            ${body}
            ${!d.photos.length ? (busy ? shimmerCards(2) : empty('fa-regular fa-images', `What's in ${esc(name)}'s camera roll?`, '', button('Look at their photos', 'their-peek-photos', { icon: 'fa-solid fa-user-secret', attrs: `data-name="${esc(name)}"` }))) : locked ? '' : `<div class="stp-more"><button class="stp-btn stp-btn-soft stp-btn-sm ${busy ? 'stp-spin' : ''}" data-act="their-more-photos" data-name="${esc(name)}" ${busy ? 'disabled' : ''}><i class="fa-solid fa-chevron-down"></i><span>${busy ? 'Loading…' : 'Older photos'}</span></button></div>`}
        </div>`;
}

function renderWallet(name) {
    const items = liveItems();
    const pays = items.filter(x => x.kind === 'pay' && x.payType !== 'decline' && (sameName(x.from, name) || sameName(x.to, name)) && x.status !== 'pending').sort((a, b) => b.time - a.time);
    const orders = items.filter(x => x.kind === 'order' && (sameName(x.from, name) || sameName(x.recipient, name)) && x.status !== 'pending').sort((a, b) => b.time - a.time);
    const busy = isBusy(`peek:life:${norm(name)}`);
    const who = n => (isUser(n) ? contactNameForUser(name) : n);
    const rows = pays.map(p => {
        const out = sameName(p.from, name);
        const other = out ? p.to : p.from;
        const verb = p.payType === 'request' ? (out ? 'Requested from' : 'Request from') : out ? 'Paid' : 'From';
        return `<div class="stp-row">${avatar(other, 'md')}
            <div class="stp-row-main"><div class="stp-row-top"><span class="stp-row-title">${esc(verb)} ${esc(who(other))}</span><span class="stp-row-meta">${esc(ago(p.time))}</span></div>
            <div class="stp-row-sub">${esc(p.note || '')}</div></div>
            <span class="stp-amount ${out ? 'stp-minus' : 'stp-plus'}">${out ? '−' : '+'}${esc(new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.amount))}</span></div>`;
    }).join('');
    const orderRows = orders.map(o => `<div class="stp-row"><span class="stp-order-icon"><i class="fa-solid fa-${o.app === 'food' ? 'burger' : 'box'}"></i></span>
        <div class="stp-row-main"><div class="stp-row-top"><span class="stp-row-title">${esc(o.item)}</span><span class="stp-row-meta">${esc(ago(o.time))}</span></div>
        <div class="stp-row-sub">${esc(o.store || (o.app === 'food' ? 'Munch' : 'Cartly'))}${o.recipient && !sameName(o.recipient, name) ? ` · for ${esc(who(o.recipient))}` : ''}</div></div></div>`).join('');
    return `${header('Pocket', { large: true, actions: peekButton(name, { app: 'life' }) })}
        <div class="stp-scroll" data-scroll="their-pay">
            ${snoopNote(name, 'wallet')}
            ${sectionLabel('Activity')}
            ${rows ? `<div class="stp-list">${rows}</div>` : busy ? shimmerCards(2) : empty('fa-solid fa-money-bill-transfer', 'No payments loaded', `Tap ↻ to see who ${esc(name)} pays — and what they buy.`)}
            ${orderRows ? `${sectionLabel('Orders')}<div class="stp-list">${orderRows}</div>` : ''}
        </div>`;
}

function renderDating(name) {
    const profile = state().profiles[name]?.dating;
    const busy = isBusy(`peek:life:${norm(name)}`);
    const matched = state().spark.matches.some(m => sameName(m.name, name));
    const liked = (state().spark.liked ?? []).some(n => sameName(n, name));
    const body = profile
        ? `<div class="stp-card stp-their-dating">
            ${photo(profile, 'stp-photo-portrait')}
            <div class="stp-their-dating-body">
                <div class="stp-profile-name">${esc(name)}</div>
                ${profile.bio ? `<div class="stp-profile-bio">${fmt(profile.bio)}</div>` : ''}
                ${profile.prompts?.map(p => `<div class="stp-spark-prompt"><div>${esc(p.q)}</div><b>${esc(p.a)}</b></div>`).join('') ?? ''}
                ${profile.lookingFor ? `<div class="stp-muted stp-small">Looking for: ${esc(profile.lookingFor)}</div>` : ''}
            </div>
        </div>
        ${matched ? `<div class="stp-snoop-note">💘 Matched with ${esc(contactNameForUser(name))}</div>` : liked ? `<div class="stp-snoop-note">💌 ${esc(userName())} liked them</div>` : ''}`
        : busy ? shimmerCards(1) : empty('fa-solid fa-fire', `Is ${esc(name)} on Spark?`, 'Tap ↻ to look at the rest of their phone, dating profile included.');
    return `${header('<span class="stp-brand stp-brand-spark"><i class="fa-solid fa-fire"></i> spark</span>', { actions: peekButton(name, { app: 'life' }) })}
        <div class="stp-scroll" data-scroll="their-spark">${body}</div>`;
}

function theirApp(id, label, icon, color, render) {
    return { id, label, icon, color, group: 'Private', their: true, render() {
        const name = owner();
        return name ? render(name) : '';
    } };
}

export const THEIR_APPS = [
    theirApp('messages', 'Messages', 'fa-solid fa-comment', 'linear-gradient(180deg, #67ff86, #0dc143)', renderMessages),
    theirApp('phone', 'Phone', 'fa-solid fa-phone', 'linear-gradient(180deg, #6ff08f, #17b84a)', renderCalls),
    theirApp('photos', 'Photos', 'fa-solid fa-images', 'conic-gradient(from 0deg, #ff9500, #ffcc00, #34c759, #5ac8fa, #af52de, #ff2d55, #ff9500)', renderPhotos),
    theirApp('notes', 'Notes', 'fa-solid fa-note-sticky', 'linear-gradient(180deg, #ffe36e, #ffc300)', renderNotes),
    theirApp('pay', 'Pocket', 'fa-solid fa-dollar-sign', 'linear-gradient(160deg, #00e676, #00a152)', renderWallet),
    theirApp('spark', 'Spark', 'fa-solid fa-fire', 'linear-gradient(160deg, #ff5f6d, #ffc371)', renderDating),
];

export const theirActions = {
    'owner-menu': () => {
        const options = ownerOptions();
        if (options.length === 1) return setOwner(owner() ? null : options[0]);
        ui.ownerMenu = !ui.ownerMenu;
        changed();
    },
    'owner-set': el => setOwner(el.dataset.name || null),
    'owner-close': () => {
        ui.ownerMenu = false;
        changed();
    },
    'their-peek-all': el => peekEverything(el.dataset.name),
    'their-peek-texts': el => peekTexts(el.dataset.name),
    'their-more-texts': el => peekTexts(el.dataset.name, { more: true }),
    'their-peek-calls': el => peekCalls(el.dataset.name),
    'their-peek-notes': el => peekNotes(el.dataset.name),
    'their-more-notes': el => peekNotes(el.dataset.name, { more: true }),
    'their-peek-photos': el => peekPhotos(el.dataset.name),
    'their-more-photos': el => peekPhotos(el.dataset.name, { more: true }),
    'their-thread': el => {
        navigate('messages', 'thread', { thread: el.dataset.id });
        ui.scrollBottom = true;
    },
    'their-continue': el => {
        const name = owner();
        const t = name && device(name).threads.find(x => x.id === el.dataset.id);
        if (t) continueThread(name, t);
    },
    'their-note': el => navigate('notes', 'note', { id: el.dataset.id }),
    'their-unlock-hidden': () => {
        ui.params.unlocked = true;
        const name = owner();
        if (name) autoImages(device(name).photos.filter(p => p.album === 'Hidden'), { fromFeed: true });
        changed();
    },
};
