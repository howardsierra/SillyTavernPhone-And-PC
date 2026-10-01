// Order card shared by Cartly and Munch.
import { isUser, liveItems, money, userName } from '../core.js';
import { ORDER_STEPS, orderStep } from '../derived.js';
import { avatar, empty, personChips, photo } from '../ui/kit.js';
import { ui } from '../ui/state.js';
import { ago, esc, sameName } from '../util.js';
import { pickPerson } from './social.js';

export function orderCard(it) {
    const app = it.app === 'food' ? 'food' : 'shop';
    const steps = ORDER_STEPS[app];
    const step = orderStep(it);
    const pending = step < 0;
    const fromYou = isUser(it.from);
    const forYou = isUser(it.recipient);
    let who;
    if (fromYou && forYou) who = 'For you';
    else if (fromYou) who = `Gift for <b>${esc(it.recipient)}</b>`;
    else if (forYou) who = `🎁 From <b>${esc(it.from)}</b>`;
    else who = sameName(it.from, it.recipient) ? `${esc(it.from)}'s order` : `${esc(it.from)} → ${esc(it.recipient)}`;
    const progress = it.source === 'gen' ? '' : `<div class="stp-track">
        ${steps.map((s, i) => `<div class="stp-track-step ${i <= step ? 'stp-done' : ''} ${i === step ? 'stp-now' : ''}"><span><i class="${s.icon}"></i></span><em>${esc(s.label)}</em></div>`).join('')}
        <div class="stp-track-line"><i style="width:${pending ? 0 : (step / (steps.length - 1)) * 100}%"></i></div>
    </div>`;
    return `<div class="stp-card stp-order ${pending ? 'stp-pending' : ''}">
        <div class="stp-order-top">
            ${it.image ? photo(it, 'stp-photo-thumb') : `<span class="stp-order-icon stp-order-${app}"><i class="${app === 'food' ? 'fa-solid fa-bowl-food' : 'fa-solid fa-bag-shopping'}"></i></span>`}
            <div class="stp-row-main">
                <div class="stp-row-title">${esc(it.item)}</div>
                <div class="stp-row-sub">${it.store ? `${esc(it.store)} · ` : ''}${esc(money(it.price))} · ${esc(ago(it.time))}</div>
                <div class="stp-row-sub">${who}</div>
            </div>
            ${!forYou || !fromYou ? avatar(fromYou ? it.recipient : it.from, 'sm') : ''}
        </div>
        ${it.note ? `<div class="stp-gift-note"><i class="fa-solid fa-quote-left"></i> ${esc(it.note)}</div>` : ''}
        ${pending ? `<div class="stp-queued"><i class="fa-regular fa-clock"></i> Places with your next reply · <a data-act="cancel-pending" data-id="${esc(it.id)}">cancel</a></div>` : progress}
    </div>`;
}

export function ordersTab(app) {
    const items = liveItems().filter(x => x.kind === 'order' && (x.app === 'food' ? 'food' : 'shop') === app);
    const others = [...new Set(items.filter(x => !isUser(x.from)).map(x => x.from))];
    ui.params.person ??= userName();
    const name = pickPerson(others, true);
    const list = (isUser(name)
        ? items.filter(x => isUser(x.from) || isUser(x.recipient))
        : items.filter(x => sameName(x.from, name)))
        .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.time - a.time);
    return `${others.length ? personChips(others, name, { includeYou: true }) : ''}
        ${list.length ? list.map(orderCard).join('') : empty(app === 'food' ? 'fa-solid fa-bowl-food' : 'fa-solid fa-box-open', 'No orders yet', isUser(name) ? `Orders ${esc(userName())} places or receives show up here.` : '')}`;
}
