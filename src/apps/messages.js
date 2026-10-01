import { changed, ctx, liveItems, people, queueItem, saveState, state, userName } from '../core.js';
import { autoImages } from '../images.js';
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
    if (text || image) {
        const item = queueItem({ kind: 'sms', app, contact, text, image, dir: 'out' });
        clearDrafts(key, `${key}:image`);
        ui.params.photoMode = false;
        ui.scrollBottom = true;
        if (image) autoImages([item]);
        changed();
    }
    if (now) document.getElementById('send_but')?.click();
}

export function queueCall(name) {
    queueItem({ kind: 'call', contact: name, dir: 'out', status: 'calling' });
    toastr.info(`Your call to ${name} connects when you send your next chat message.`, '📞 Calling…', { timeOut: 4000 });
}

function previewOf(it) {
    if (!it) return 'No messages yet';
    const body = it.image && !it.text ? '📷 Photo' : `${it.image ? '📷 ' : ''}${it.text}`;
    return it.dir === 'out' ? `You: ${body}` : body;
}

export function threadRows(list, app) {
    return list.map(t => `<button class="stp-row stp-thread-row" data-act="msg-open" data-app="${app}" data-contact="${esc(t.contact)}">
        ${avatar(t.contact, 'md')}
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
    return `${header('Messages', { large: true, actions: iconBtn('fa-solid fa-pen-to-square', 'msg-new-toggle', 'New message') })}
        <div class="stp-scroll" data-scroll="messages">
            ${newForm}
            ${list.length ? `<div class="stp-list">${threadRows(list, 'messages')}</div>` : empty('fa-regular fa-comments', 'No messages yet', `When someone texts ${esc(userName())}, it shows up here.`)}
            ${suggestions.length ? `${sectionLabel('Contacts')}<div class="stp-chips">${suggestions.map(n => `<button class="stp-chip" data-act="msg-open" data-app="messages" data-contact="${esc(n)}">${avatar(n, 'xs')}<span>${esc(n)}</span></button>`).join('')}</div>` : ''}
        </div>`;
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
        const textHtml = it.text ? `<div class="stp-bubble">${fmt(it.text)}</div>` : '';
        const cls = `${groupedTop ? 'stp-g-top' : ''} ${groupedBottom ? 'stp-g-bottom' : ''}`;
        if (it.dir === 'out') {
            const pending = it.status === 'pending';
            return `${sep}<div class="stp-msg stp-out ${pending ? 'stp-pending' : ''} ${cls}">
                ${photoHtml}${textHtml}
                ${pending ? `<div class="stp-msg-meta"><i class="fa-regular fa-clock"></i> Sends with your next reply · <a data-act="edit-pending" data-id="${esc(it.id)}">edit</a> · <a data-act="cancel-pending" data-id="${esc(it.id)}">cancel</a></div>` : !groupedBottom && it.batch ? '<div class="stp-msg-meta">Delivered</div>' : ''}
            </div>`;
        }
        return `${sep}<div class="stp-msg stp-in ${cls}">
            <div class="stp-msg-line">
                <div class="stp-msg-stack">${photoHtml}${textHtml}</div>
                <button class="stp-mention" data-act="msg-mention" data-id="${esc(it.id)}" title="Mention this in your chat reply"><i class="fa-solid fa-reply"></i></button>
            </div>
        </div>`;
    }).join('');

    const key = `thread:${app}:${norm(contact)}`;
    const photoMode = ui.params.photoMode;
    const head = title ?? `<span class="stp-thread-head">${avatar(contact, 'sm')}<span>${esc(contact)}</span></span>`;
    const actions = (app === 'messages' ? iconBtn('fa-solid fa-phone', 'msg-call', `Call ${contact}`, `data-contact="${esc(contact)}"`) : '')
        + iconBtn('fa-regular fa-trash-can', 'msg-delete-thread', 'Delete conversation', `data-app="${app}" data-contact="${esc(contact)}"`);
    return `${header(head, { actions })}
        <div class="stp-scroll stp-thread" data-scroll="${esc(key)}" ${accent ? `style="--bubble-out:${accent}"` : ''}>
            ${rows || `<div class="stp-thread-intro">${avatar(contact, 'xl')}<div class="stp-thread-intro-name">${esc(contact)}</div><div class="stp-muted">Say hi 👋</div></div>`}
        </div>
        ${photoMode ? `<div class="stp-attach-bar"><i class="fa-solid fa-camera"></i>${input(`${key}:image`, 'Describe the photo you\'re sending…')}</div>` : ''}
        <div class="stp-composer" ${accent ? `style="--accent:${accent}"` : ''}>
            ${iconBtn('fa-solid fa-camera', 'msg-photo-toggle', 'Attach a photo', photoMode ? 'data-on="1"' : '')}
            <textarea class="stp-input stp-textarea stp-composer-input" rows="1" data-draft="${esc(key)}" data-send="${app}" data-contact="${esc(contact)}" placeholder="${photoMode ? 'Caption (optional)' : app === 'spark' ? 'Send a message' : 'iMessage'}">${esc(ui.drafts[key] ?? '')}</textarea>
            <button class="stp-send" data-act="msg-send" data-app="${app}" data-contact="${esc(contact)}" title="Queue — delivered with your next chat reply"><i class="fa-solid fa-arrow-up"></i></button>
            <button class="stp-send stp-send-now" data-act="msg-send-now" data-app="${app}" data-contact="${esc(contact)}" title="Queue and send your chat reply now (Ctrl+Enter)"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        <div class="stp-composer-hint">Delivered when you send your next chat message</div>`;
}

function photoBubble(it) {
    return photo(it, 'stp-bubble-photo');
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
