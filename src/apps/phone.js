import { changed, liveItems, people, saveState } from '../core.js';
import { avatar, empty, header, iconBtn, tabs } from '../ui/kit.js';
import { navigate, ui } from '../ui/state.js';
import { ago, esc, fmt } from '../util.js';
import { queueCall } from './messages.js';

function calls() {
    return liveItems().filter(x => x.kind === 'call').sort((a, b) => b.time - a.time);
}

function missed() {
    return calls().filter(x => x.dir === 'in' && !x.read).length;
}

function callRow(c) {
    const isMissed = c.dir === 'in' && c.status === 'missed';
    const icon = c.dir === 'out' ? 'fa-solid fa-phone-flip' : isMissed ? 'fa-solid fa-phone-slash' : 'fa-solid fa-phone';
    const label = c.dir === 'out'
        ? (c.status === 'pending' ? 'Calling… (with your next reply)' : 'Outgoing')
        : isMissed ? 'Missed' : c.status === 'declined' ? 'Declined' : 'Incoming';
    return `<div class="stp-row">
        ${avatar(c.contact, 'md')}
        <div class="stp-row-main">
            <div class="stp-row-top"><span class="stp-row-title ${isMissed ? 'stp-danger-text' : ''}">${esc(c.contact)}</span><span class="stp-row-meta">${esc(ago(c.time))}</span></div>
            <div class="stp-row-sub"><i class="${icon}"></i> ${esc(label)}${c.duration ? ` · ${esc(c.duration)}` : ''}${c.text ? ' · <i class="fa-solid fa-voicemail"></i> voicemail' : ''}</div>
        </div>
        ${iconBtn('fa-solid fa-phone', 'call', `Call ${c.contact}`, `data-name="${esc(c.contact)}"`)}
    </div>`;
}

function render() {
    const tab = ui.params.tab ?? 'recents';
    const list = calls();
    if (tab === 'recents' && list.some(x => x.dir === 'in' && !x.read)) {
        list.forEach(x => {
            x.read = true;
        });
        saveState();
    }
    let body = '';
    if (tab === 'recents') {
        body = list.length ? `<div class="stp-list">${list.map(callRow).join('')}</div>` : empty('fa-solid fa-phone', 'No recent calls');
    } else if (tab === 'voicemail') {
        const vms = list.filter(x => x.text);
        body = vms.length
            ? vms.map(v => `<div class="stp-card stp-voicemail">
                <div class="stp-row-top">${avatar(v.contact, 'sm')}<b>${esc(v.contact)}</b><span class="stp-row-meta">${esc(ago(v.time))}</span></div>
                <div class="stp-vm-wave">${Array.from({ length: 28 }, (_, i) => `<span style="height:${6 + ((i * 37) % 19)}px"></span>`).join('')}</div>
                <div class="stp-vm-text">“${fmt(v.text)}”</div>
            </div>`).join('')
            : empty('fa-solid fa-voicemail', 'No voicemail');
    } else {
        const ppl = people();
        body = ppl.length
            ? `<div class="stp-list">${ppl.map(n => `<div class="stp-row">
                ${avatar(n, 'md')}
                <div class="stp-row-main"><div class="stp-row-title">${esc(n)}</div></div>
                ${iconBtn('fa-solid fa-comment', 'msg-open', `Text ${n}`, `data-app="messages" data-contact="${esc(n)}"`)}
                ${iconBtn('fa-solid fa-dollar-sign', 'pay-to', `Pay ${n}`, `data-name="${esc(n)}"`)}
                ${iconBtn('fa-solid fa-phone', 'call', `Call ${n}`, `data-name="${esc(n)}"`)}
            </div>`).join('')}</div>`
            : empty('fa-regular fa-address-book', 'No contacts yet');
    }
    return `${header('Phone', { large: true })}
        ${tabs([{ id: 'recents', label: 'Recents' }, { id: 'contacts', label: 'Contacts' }, { id: 'voicemail', label: 'Voicemail' }], tab)}
        <div class="stp-scroll" data-scroll="phone:${tab}">${body}</div>`;
}

export default {
    id: 'phone',
    label: 'Phone',
    icon: 'fa-solid fa-phone',
    color: 'linear-gradient(180deg, #6ff08f, #17b84a)',
    group: 'Social',
    badge: missed,
    render,
    actions: {
        call: el => {
            queueCall(el.dataset.name);
            changed();
        },
        'pay-to': el => navigate('pay', 'send', { to: el.dataset.name, mode: 'pay' }),
    },
};
