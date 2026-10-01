// Toasts outside the phone and banners inside it.
import { changed, isUser, money, settings } from './core.js';
import { navigate, ui } from './ui/state.js';
import { esc, norm, sameName } from './util.js';

let bannerTimer = null;

function showBanner(banner) {
    ui.banner = banner;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
        ui.banner = null;
        changed();
    }, 4500);
}

function ring() {
    const launcher = document.getElementById('stp-launcher');
    if (!launcher) return;
    launcher.classList.remove('stp-ring');
    void launcher.offsetWidth;
    launcher.classList.add('stp-ring');
}

/** Turns newly received items into notifications. */
export function notifyItems(items) {
    if (!items.length) return;
    const notes = [];
    const texts = new Map();
    for (const it of items) {
        if (it.kind === 'sms' && it.dir === 'in') {
            const app = it.app === 'spark' ? 'spark' : 'messages';
            if (ui.open && ui.view === 'thread' && sameName(ui.params.contact, it.contact) && ui.app === app) continue;
            const key = `${app}:${norm(it.contact)}`;
            if (!texts.has(key)) texts.set(key, { app, contact: it.contact, lines: [] });
            texts.get(key).lines.push(it.image ? `📷 ${it.text || 'Photo'}` : it.text);
        } else if (it.kind === 'call' && it.dir === 'in') {
            notes.push({ app: 'phone', icon: 'fa-solid fa-phone', title: it.contact, text: it.status === 'missed' ? `Missed call${it.text ? ' · voicemail' : ''}` : 'Called you', go: () => navigate('phone') });
        } else if (it.kind === 'pay' && isUser(it.to) && !isUser(it.from)) {
            const text = it.payType === 'request' ? `requested ${money(it.amount)}` : `sent you ${money(it.amount)}`;
            notes.push({ app: 'pay', icon: 'fa-solid fa-dollar-sign', title: it.from, text: `${text}${it.note ? ` · ${it.note}` : ''}`, go: () => navigate('pay') });
        } else if (it.kind === 'order' && isUser(it.recipient) && !isUser(it.from)) {
            notes.push({ app: it.app === 'food' ? 'food' : 'shop', icon: 'fa-solid fa-gift', title: it.from, text: `ordered something for you${it.app === 'food' ? ' 🍔' : ' 🎁'}`, go: () => navigate(it.app === 'food' ? 'food' : 'shop', null, { tab: 'orders' }) });
        }
    }
    for (const t of texts.values()) {
        notes.unshift({ app: t.app, icon: t.app === 'spark' ? 'fa-solid fa-fire' : 'fa-solid fa-comment', title: t.contact, text: t.lines.join('\n'), go: () => navigate(t.app, 'thread', { contact: t.contact }) });
    }
    if (!notes.length) return;
    ring();
    if (ui.open) showBanner(notes[0]);
    if (!settings().notify) return;
    for (const n of notes) {
        toastr.info(esc(n.text).replace(/\n/g, '<br>'), `📱 ${esc(n.title)}`, {
            timeOut: 6000,
            escapeHtml: false,
            onclick: n.go,
        });
    }
}

/** Generic notification (deliveries, matches…). */
export function notify(note) {
    ring();
    if (ui.open) showBanner(note);
    else if (settings().notify) {
        toastr.info(esc(note.text), `📱 ${esc(note.title)}`, { timeOut: 5000, escapeHtml: false, onclick: note.go });
    }
    changed();
}
