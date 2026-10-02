import { changed, ctx, ensureGroup, findGroup, liveItems, people, queueItem, saveState, state, userName } from '../core.js';
import { autoImages } from '../images.js';
import { isInstant, isPhoneOnly, rememberContact, sendTurn } from '../turn.js';
import { updateInjection } from '../inject.js';
import { avatar, empty, header, iconBtn, input, photo, sectionLabel } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { clock, esc, fmt, norm, sameName } from '../util.js';

/** Conversations for an app ('messages' or 'spark'). */
export function threads(app = 'messages') {
    const map = new Map();
    const items = [...liveItems()].filter(it => it.kind === 'sms' && (it.app ?? 'messages') === app);
    for (const it of items) {
        const key = norm(it.contact);
        if (!map.has(key)) map.set(key, { contact: it.contact, items: [] });
        map.get(key).items.push(it);
    }
    if (app === 'messages') {
        for (const name of state().contacts) {
            if (!map.has(norm(name))) map.set(norm(name), { contact: name, items: [] });
        }
    }
    const list = [...map.values()];
    for (const t of list) {
        t.items.sort((a, b) => (a.status === 'pending') - (b.status === 'pending') || a.time - b.time);
        t.last = t.items[t.items.length - 1];
        t.unread = t.items.filter(x => x.dir === 'in' && !x.read).length;
        t.pending = t.items.filter(x => x.status === 'pending').length;
    }
    return list.sort((a, b) => (b.last?.time ?? 0) - (a.last?.time ?? 0));
}

export function unreadTexts(app = 'messages') {
    return liveItems().filter(x => x.kind === 'sms' && (x.app ?? 'messages') === app && x.dir === 'in' && !x.read).length;
}

export function sendText(app, contact, now = false) {
    const key = `thread:${app}:${norm(contact)}`;
    const text = draft(key);
    const image = ui.params.photoMode ? draft(`${key}:image`) : '';
    const voice = !!ui.params.voiceMode;
    if (text || image) {
        rememberContact(app, contact);
        const item = queueItem({ kind: 'sms', app, contact, text, image, dir: 'out', ...(voice && text ? { voice: true } : {}), ...(findGroup(contact) ? { group: true } : {}) });
        clearDrafts(key, `${key}:image`);
        ui.params.photoMode = false;
        ui.params.voiceMode = false;
        ui.scrollBottom = true;
        if (image) autoImages([item]);
        changed();
    }
    // Instant delivery (the default) gets the reply right away; otherwise ✈ also sends the chat reply.
    if (isInstant()) sendTurn();
    else if (now) document.getElementById('send_but')?.click();
}

export function queueCall(name) {
    rememberContact('messages', name);
    queueItem({ kind: 'call', contact: name, dir: 'out', status: 'calling' });
    if (isInstant()) sendTurn();
    else toastr.info(`Your call to ${name} connects when you send your next chat message.`, '📞 Calling…', { timeOut: 4000 });
}

function previewOf(it) {
    if (!it) return 'No messages yet';
    const body = it.voice ? '🎤 Voice message' : it.image && !it.text ? '📷 Photo' : `${it.image ? '📷 ' : ''}${it.text}`;
    if (it.dir === 'out') return `You: ${body}`;
    return it.group ? `${it.from}: ${body}` : body;
}

/** Avatar for a conversation: the person, or a stack of members for a group. */
export function threadAvatar(contact, size = 'md') {
    const g = findGroup(contact);
    if (!g) return avatar(contact, size);
    const faces = g.members.slice(0, 2).map(n => avatar(n, 'sm')).join('');
    return `<span class="stp-group-avatar stp-avatar-${size}">${faces || '<i class="fa-solid fa-user-group"></i>'}</span>`;
}

export function threadRows(list, app) {
    return list.map(t => `<button class="stp-row stp-thread-row" data-act="msg-open" data-app="${app}" data-contact="${esc(t.contact)}">
        ${threadAvatar(t.contact, 'md')}
        <div class="stp-row-main">
            <div class="stp-row-top"><span class="stp-row-title">${esc(t.contact)}</span><span class="stp-row-meta">${t.last ? esc(clock(t.last.time)) : ''}</span></div>
            <div class="stp-row-sub ${t.unread ? 'stp-strong' : ''}">${t.pending ? `<span class="stp-pill-mini">⏳ ${t.pending} queued</span> ` : ''}${esc(previewOf(t.last))}</div>
        </div>
        ${t.unread ? `<span class="stp-count">${t.unread}</span>` : ''}
    </button>`).join('');
}

function renderList() {
    const list = threads('messages');
    const known = people();
    const suggestions = known.filter(n => !list.some(t => sameName(t.contact, n)));
    const newForm = ui.params.newContact ? `<div class="stp-card stp-new-contact">
            ${input('new-contact', 'Name…', { attrs: 'list="stp-people" autofocus' })}
            <datalist id="stp-people">${known.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
            <button class="stp-btn stp-btn-primary stp-btn-sm" data-act="msg-new-create">Start</button>
        </div>` : '';
    const picked = ui.params.groupMembers ?? [];
    const groupForm = ui.params.newGroup ? `<div class="stp-card stp-form">
            <label>New group</label>
            ${input('new-group', 'Group name…')}
            <div class="stp-chips">${known.map(n => `<button class="stp-chip ${picked.some(x => sameName(x, n)) ? 'stp-active' : ''}" data-act="msg-group-pick" data-name="${esc(n)}">${avatar(n, 'xs')}<span>${esc(n)}</span></button>`).join('') || '<span class="stp-muted">Add some contacts first.</span>'}</div>
            <button class="stp-btn stp-btn-primary stp-btn-sm" data-act="msg-group-create"><i class="fa-solid fa-user-group"></i><span>Create group</span></button>
        </div>` : '';
    return `${header('Messages', { large: true, actions: iconBtn('fa-solid fa-user-group', 'msg-group-toggle', 'New group') + iconBtn('fa-solid fa-pen-to-square', 'msg-new-toggle', 'New message') })}
        <div class="stp-scroll" data-scroll="messages">
            ${modeCard()}
            ${newForm}
            ${groupForm}
            ${list.length ? `<div class="stp-list">${threadRows(list, 'messages')}</div>` : empty('fa-regular fa-comments', 'No messages yet', `When someone texts ${esc(userName())}, it shows up here.`)}
            ${suggestions.length ? `${sectionLabel('Contacts')}<div class="stp-chips">${suggestions.map(n => `<button class="stp-chip" data-act="msg-open" data-app="messages" data-contact="${esc(n)}">${avatar(n, 'xs')}<span>${esc(n)}</span></button>`).join('')}</div>` : ''}
        </div>`;
}

/** Switch between telling the story in chat and roleplaying entirely through the phone. */
export function modeCard() {
    const on = isPhoneOnly();
    return `<button class="stp-mode-card ${on ? 'stp-on' : ''}" data-act="phone-only-toggle">
        <span class="stp-mode-icon"><i class="fa-solid ${on ? 'fa-mobile-screen-button' : 'fa-book-open'}"></i></span>
        <span class="stp-row-main">
            <span class="stp-row-title">${on ? 'Phone-only roleplay' : 'Roleplay through the phone'}</span>
            <span class="stp-row-sub">${on ? 'Everything happens here — texts send right away' : 'Tell the whole story by text, from this device'}</span>
        </span>
        <span class="stp-switch ${on ? 'stp-on' : ''}"><i></i></span>
    </button>`;
}

/** The conversation view, shared by Messages and Spark. */
export function renderThread(app, contact, { title = null, accent = '' } = {}) {
    const t = threads(app).find(x => sameName(x.contact, contact)) ?? { contact, items: [] };

    // Opening the conversation reads it.
    let changedRead = false;
    for (const it of t.items) {
        if (it.dir === 'in' && !it.read) {
            it.read = true;
            changedRead = true;
        }
    }
    if (changedRead) {
        saveState();
        updateInjection();
    }

    const isGroup = !!findGroup(contact);
    const instant = isInstant();
    // Reactions from the other side, by the text they reacted to.
    const reactions = new Map(liveItems().filter(x => x.kind === 'react' && x.target).map(x => [x.target, x.emoji]));
    let lastStamp = 0;
    const rows = t.items.map((it, i) => {
        const prev = t.items[i - 1];
        const next = t.items[i + 1];
        let sep = '';
        if (it.status !== 'pending' && it.time - lastStamp > 45 * 60e3) {
            sep = `<div class="stp-day-sep">${esc(new Date(it.time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(clock(it.time))}</div>`;
            lastStamp = it.time;
        }
        const groupedTop = prev && prev.dir === it.dir && !sep;
        const groupedBottom = next && next.dir === it.dir;
        const photoHtml = it.image ? photoBubble(it) : '';
        const textHtml = it.voice ? voiceBubble(it) : it.text ? `<div class="stp-bubble">${fmt(it.text)}</div>` : '';
        const cls = `${groupedTop ? 'stp-g-top' : ''} ${groupedBottom ? 'stp-g-bottom' : ''}`;
        const theirs = reactions.get(it.id);
        if (it.dir === 'out') {
            const pending = it.status === 'pending';
            const answered = t.items.slice(i + 1).some(x => x.dir === 'in');
            let meta = '';
            if (pending) {
                meta = instant
                    ? '<div class="stp-msg-meta"><i class="fa-regular fa-clock"></i> Sending…</div>'
                    : `<div class="stp-msg-meta"><i class="fa-regular fa-clock"></i> Sends with your next reply · <a data-act="edit-pending" data-id="${esc(it.id)}">edit</a> · <a data-act="cancel-pending" data-id="${esc(it.id)}">cancel</a></div>`;
            } else if (!groupedBottom && !answered) {
                meta = `<div class="stp-msg-meta">${it.seen ? 'Read' : 'Delivered'}</div>`;
            }
            return `${sep}<div class="stp-msg stp-out ${pending ? 'stp-pending' : ''} ${cls}">
                <div class="stp-react-wrap">${photoHtml}${textHtml}${theirs ? `<span class="stp-reaction stp-reaction-in" title="${esc(contact)} reacted">${esc(theirs)}</span>` : ''}</div>
                ${meta}
            </div>`;
        }
        const sender = isGroup && !groupedTop ? `<div class="stp-sender">${esc(it.from)}</div>` : '';
        const picker = ui.params.reactFor === it.id
            ? `<div class="stp-react-picker">${REACTIONS.map(e => `<button data-act="msg-react" data-id="${esc(it.id)}" data-emoji="${e}">${e}</button>`).join('')}</div>`
            : '';
        return `${sep}<div class="stp-msg stp-in ${cls} ${isGroup ? 'stp-in-group' : ''}">
            ${sender}
            <div class="stp-msg-line">
                ${isGroup ? (groupedBottom ? '<span class="stp-avatar-gap"></span>' : avatar(it.from, 'xs')) : ''}
                <div class="stp-msg-stack stp-react-wrap">${photoHtml}${textHtml}${it.myReaction ? `<span class="stp-reaction" title="You reacted">${esc(it.myReaction)}</span>` : ''}</div>
                <button class="stp-mention" data-act="msg-react-open" data-id="${esc(it.id)}" title="React"><i class="fa-regular fa-face-smile"></i></button>
                <button class="stp-mention" data-act="msg-mention" data-id="${esc(it.id)}" title="Mention this in your chat reply"><i class="fa-solid fa-reply"></i></button>
            </div>
            ${picker}
        </div>`;
    }).join('');

    const typing = ui.typing && ui.typing.app === app && sameName(ui.typing.contact, contact)
        ? `<div class="stp-msg stp-in"><div class="stp-typing" aria-label="${esc(contact)} is typing"><i></i><i></i><i></i></div></div>`
        : '';
    const key = `thread:${app}:${norm(contact)}`;
    const photoMode = ui.params.photoMode;
    const phoneOnly = isPhoneOnly();
    const group = findGroup(contact);
    const head = title ?? `<span class="stp-thread-head">${threadAvatar(contact, 'sm')}<span>${esc(contact)}</span>${group ? `<small class="stp-muted">${esc(group.members.join(', '))}</small>` : ''}</span>`;
    const actions = (app === 'messages' ? iconBtn('fa-solid fa-phone', 'msg-call', `Call ${contact}`, `data-contact="${esc(contact)}"`) : '')
        + iconBtn('fa-regular fa-trash-can', 'msg-delete-thread', 'Delete conversation', `data-app="${app}" data-contact="${esc(contact)}"`);
    return `${header(head, { actions })}
        <div class="stp-scroll stp-thread" data-scroll="${esc(key)}" ${accent ? `style="--bubble-out:${accent}"` : ''}>
            ${rows || typing ? '' : `<div class="stp-thread-intro">${avatar(contact, 'xl')}<div class="stp-thread-intro-name">${esc(contact)}</div><div class="stp-muted">Say hi 👋</div></div>`}${rows}${typing}
        </div>
        ${photoMode ? `<div class="stp-attach-bar"><i class="fa-solid fa-camera"></i>${input(`${key}:image`, 'Describe the photo you\'re sending…')}</div>` : ''}
        <div class="stp-composer" ${accent ? `style="--accent:${accent}"` : ''}>
            ${iconBtn('fa-solid fa-camera', 'msg-photo-toggle', 'Attach a photo', photoMode ? 'data-on="1"' : '')}
            ${iconBtn('fa-solid fa-microphone', 'msg-voice-toggle', 'Send as a voice message', ui.params.voiceMode ? 'data-on="1"' : '')}
            <textarea class="stp-input stp-textarea stp-composer-input" rows="1" data-draft="${esc(key)}" data-send="${app}" data-contact="${esc(contact)}" placeholder="${ui.params.voiceMode ? '🎤 What do you say? (transcript)' : photoMode ? 'Caption (optional)' : app === 'spark' ? 'Send a message' : 'iMessage'}">${esc(ui.drafts[key] ?? '')}</textarea>
            <button class="stp-send" data-act="msg-send" data-app="${app}" data-contact="${esc(contact)}" title="${instant ? 'Send' : 'Queue — delivered with your next chat reply'}"><i class="fa-solid fa-arrow-up"></i></button>
            ${instant ? '' : `<button class="stp-send stp-send-now" data-act="msg-send-now" data-app="${app}" data-contact="${esc(contact)}" title="Queue and send your chat reply now (Ctrl+Enter)"><i class="fa-solid fa-paper-plane"></i></button>`}
        </div>
        <div class="stp-composer-hint">${phoneOnly ? '<i class="fa-solid fa-mobile-screen-button"></i> Phone-only roleplay — replies come right back' : instant ? 'Replies come right back · saved in the chat as context' : 'Delivered when you send your next chat message'}</div>`;
}

function photoBubble(it) {
    return photo(it, 'stp-bubble-photo');
}

const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '😡', '🔥'];

function voiceBubble(it) {
    const bars = Array.from({ length: 22 }, (_, k) => `<i style="height:${5 + ((k * 7 + it.text.length) % 15)}px"></i>`).join('');
    const secs = Math.max(2, Math.round(it.text.split(/\s+/).length / 2.5));
    return `<div class="stp-bubble stp-voice"><span class="stp-voice-play"><i class="fa-solid fa-play"></i></span><span class="stp-voice-wave">${bars}</span><span class="stp-voice-time">0:${String(secs).padStart(2, '0')}</span></div>
        <div class="stp-voice-text">“${fmt(it.text)}”</div>`;
}

export default {
    id: 'messages',
    label: 'Messages',
    icon: 'fa-solid fa-comment',
    color: 'linear-gradient(180deg, #67f08a, #10c43f)',
    group: 'Social',
    badge: () => unreadTexts('messages'),
    render() {
        if (ui.view === 'thread') return renderThread('messages', ui.params.contact);
        return renderList();
    },
    actions: {
        'msg-open': el => navigate(el.dataset.app || 'messages', 'thread', { contact: el.dataset.contact }),
        'msg-send': el => sendText(el.dataset.app, el.dataset.contact, false),
        'msg-send-now': el => sendText(el.dataset.app, el.dataset.contact, true),
        'msg-voice-toggle': () => {
            ui.params.voiceMode = !ui.params.voiceMode;
            if (ui.params.voiceMode) ui.params.photoMode = false;
            changed();
        },
        'msg-react-open': el => {
            ui.params.reactFor = ui.params.reactFor === el.dataset.id ? null : el.dataset.id;
            changed();
        },
        'msg-react': el => {
            const it = state().items.find(x => x.id === el.dataset.id);
            if (!it) return;
            it.myReaction = it.myReaction === el.dataset.emoji ? undefined : el.dataset.emoji;
            ui.params.reactFor = null;
            saveState();
            updateInjection();
            changed();
        },
        'msg-group-toggle': () => {
            ui.params.newGroup = !ui.params.newGroup;
            ui.params.groupMembers = [];
            changed();
        },
        'msg-group-pick': el => {
            const list = ui.params.groupMembers ?? [];
            const name = el.dataset.name;
            ui.params.groupMembers = list.some(x => sameName(x, name)) ? list.filter(x => !sameName(x, name)) : [...list, name];
            changed();
        },
        'msg-group-create': () => {
            const name = draft('new-group');
            const members = ui.params.groupMembers ?? [];
            if (!name || members.length < 2) return toastr.info('Name the group and pick at least two people.', 'Messages');
            ensureGroup(name, members);
            clearDrafts('new-group');
            saveState();
            navigate('messages', 'thread', { contact: name });
        },
        'msg-photo-toggle': () => {
            ui.params.photoMode = !ui.params.photoMode;
            changed();
        },
        'msg-new-toggle': () => {
            ui.params.newContact = !ui.params.newContact;
            changed();
        },
        'msg-new-create': () => {
            const name = draft('new-contact');
            if (!name) return;
            const st = state();
            if (!st.contacts.some(x => sameName(x, name))) st.contacts.push(name);
            clearDrafts('new-contact');
            saveState();
            navigate('messages', 'thread', { contact: name });
        },
        'msg-call': el => queueCall(el.dataset.contact),
        'msg-mention': el => {
            const it = state().items.find(x => x.id === el.dataset.id);
            const box = document.getElementById('send_textarea');
            if (!it || !box) return;
            const snippet = it.image && !it.text
                ? `*looks at the photo ${it.from} sent: ${it.image}* `
                : `*reads ${it.from}'s text: "${it.text}"* `;
            box.value = box.value ? `${box.value.replace(/\s*$/, '')} ${snippet}` : snippet;
            box.dispatchEvent(new Event('input', { bubbles: true }));
            box.focus();
        },
        'msg-delete-thread': async el => {
            const { app, contact } = el.dataset;
            const c = ctx();
            const ok = await c.callGenericPopup(`Delete your conversation with ${contact}? Characters will no longer see these messages.`, c.POPUP_TYPE.CONFIRM);
            if (!ok) return;
            const st = state();
            st.items = st.items.filter(x => !(x.kind === 'sms' && (x.app ?? 'messages') === app && sameName(x.contact, contact)));
            if (app === 'messages') st.contacts = st.contacts.filter(x => !sameName(x, contact));
            saveState();
            updateInjection();
            navigate(app);
        },
    },
};
