import { balance, changed, isUser, liveItems, money, people, queueItem, saveState, settings, state, userName } from '../core.js';
import { requestStatus } from '../derived.js';
import { avatar, button, empty, header, input, peekChips, sectionLabel, tabs } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { ago, esc, sameName, toMoney } from '../util.js';

const EMOJI = ['🍕', '🍻', '☕', '🏠', '🎁', '❤️', '🚕', '🎬', '🛒', '💅'];

function txRow(p, items) {
    const user = userName();
    const fromYou = isUser(p.from);
    const toYou = isUser(p.to);
    const who = (n) => (isUser(n) ? 'You' : esc(n));
    let title;
    let amountHtml = '';
    let status = '';
    if (p.payType === 'request') {
        title = `${who(p.from)} requested from ${who(p.to)}`;
        const st = requestStatus(p, items);
        status = { open: 'Pending', paid: 'Paid', paying: 'Paying…', declined: 'Declined', declining: 'Declining…' }[st];
        amountHtml = `<span class="stp-amount">${esc(money(p.amount))}</span>`;
    } else if (p.payType === 'decline') {
        title = `You declined ${esc(p.to)}'s request`;
    } else {
        title = `${who(p.from)} paid ${who(p.to)}`;
        const sign = toYou ? '+' : fromYou ? '-' : '';
        amountHtml = `<span class="stp-amount ${sign === '+' ? 'stp-plus' : sign === '-' ? 'stp-minus' : ''}">${sign}${esc(money(p.amount))}</span>`;
    }
    if (p.status === 'pending') status = 'Queued — sends with your next reply';
    return `<div class="stp-row stp-tx">
        <div class="stp-tx-avatars">${avatar(fromYou ? user : p.from, 'md')}${!fromYou && !toYou ? avatar(p.to, 'xs', 'stp-tx-sub') : ''}</div>
        <div class="stp-row-main">
            <div class="stp-row-top"><span class="stp-row-title">${title}</span>${amountHtml}</div>
            ${p.note ? `<div class="stp-tx-note">${esc(p.note)}</div>` : ''}
            <div class="stp-row-sub">${esc(ago(p.time))}${status ? ` · ${esc(status)}` : ''}${p.status === 'pending' ? ` · <a data-act="cancel-pending" data-id="${esc(p.id)}">cancel</a>` : ''}</div>
        </div>
    </div>`;
}

function renderMain() {
    const items = liveItems();
    const pays = items.filter(x => x.kind === 'pay').sort((a, b) => b.time - a.time);
    const mine = pays.filter(p => isUser(p.from) || isUser(p.to));
    const friends = pays.filter(p => !isUser(p.from) && !isUser(p.to));
    const requests = mine.filter(p => p.payType === 'request' && isUser(p.to) && requestStatus(p, items) === 'open' && p.status === 'sent');
    const tab = ui.params.tab ?? 'activity';
    const list = tab === 'friends' ? friends : mine.filter(p => p.payType !== 'decline');

    const addCash = ui.params.addCash ? `<div class="stp-card stp-row-2">
            ${input('pay:add', 'Amount', { type: 'number', attrs: 'min="1" step="0.01"' })}
            ${button('Add', 'pay-add-cash', { small: true })}
        </div>` : '';

    return `${header('<span class="stp-brand stp-brand-pay"><i class="fa-solid fa-dollar-sign"></i> Pocket</span>', { back: true })}
        <div class="stp-scroll" data-scroll="pay:${tab}">
            <div class="stp-balance-card">
                <div class="stp-balance-label">Pocket balance</div>
                <div class="stp-balance">${esc(money(balance()))}</div>
                <div class="stp-balance-cardno">•••• ${String(Math.abs(userName().length * 1337) % 10000).padStart(4, '0')}</div>
                <div class="stp-balance-actions">
                    <button class="stp-btn stp-btn-glass" data-act="pay-open" data-mode="pay"><i class="fa-solid fa-paper-plane"></i><span>Pay</span></button>
                    <button class="stp-btn stp-btn-glass" data-act="pay-open" data-mode="request"><i class="fa-solid fa-hand-holding-dollar"></i><span>Request</span></button>
                    <button class="stp-btn stp-btn-glass" data-act="pay-add-toggle"><i class="fa-solid fa-plus"></i><span>Add cash</span></button>
                </div>
            </div>
            ${addCash}
            ${requests.length ? `${sectionLabel('Requests')}${requests.map(r => `<div class="stp-card stp-request">
                ${avatar(r.from, 'md')}
                <div class="stp-row-main"><div><b>${esc(r.from)}</b> requests <b>${esc(money(r.amount))}</b></div>${r.note ? `<div class="stp-tx-note">${esc(r.note)}</div>` : ''}</div>
                <div class="stp-request-actions">${button('Pay', 'pay-request-pay', { small: true, attrs: `data-id="${esc(r.id)}"` })}${button('Decline', 'pay-request-decline', { small: true, variant: 'soft', attrs: `data-id="${esc(r.id)}"` })}</div>
            </div>`).join('')}` : ''}
            ${tabs([{ id: 'activity', label: 'You' }, { id: 'friends', label: 'Friends' }], tab)}
            ${list.length ? `<div class="stp-list">${list.map(p => txRow(p, items)).join('')}</div>` : empty('fa-solid fa-money-bill-transfer', tab === 'friends' ? 'No public activity yet' : 'No payments yet', tab === 'friends' ? 'Peek at someone below to see who they\'ve been paying.' : 'Send or request money above.')}
            ${tab === 'friends' ? peekChips(people(), 'Peek at payments') : ''}
        </div>`;
}

function renderSend() {
    const mode = ui.params.mode === 'request' ? 'request' : 'pay';
    const to = ui.params.to;
    const ppl = people();
    return `${header(mode === 'pay' ? 'Pay' : 'Request')}
        <div class="stp-scroll stp-pay-form" data-scroll="pay-send">
            ${tabs([{ id: 'pay', label: 'Pay' }, { id: 'request', label: 'Request' }], mode, 'pay-mode')}
            ${sectionLabel('To')}
            <div class="stp-chips">${ppl.map(n => `<button class="stp-chip ${sameName(n, to) ? 'stp-active' : ''}" data-act="pay-pick" data-name="${esc(n)}">${avatar(n, 'xs')}<span>${esc(n)}</span></button>`).join('') || '<span class="stp-muted">No contacts yet.</span>'}</div>
            <div class="stp-amount-entry"><span>${esc(settings().currency)}</span>${input('pay:amount', '0', { type: 'number', cls: 'stp-amount-input', attrs: 'min="0.01" step="0.01" inputmode="decimal"' })}</div>
            ${mode === 'pay' ? `<div class="stp-muted stp-small stp-center">Balance ${esc(money(balance()))}</div>` : ''}
            ${input('pay:note', 'What\'s it for?')}
            <div class="stp-emoji-row">${EMOJI.map(e => `<button class="stp-emoji" data-act="pay-emoji" data-emoji="${e}">${e}</button>`).join('')}</div>
            ${button(mode === 'pay' ? `Pay${to ? ` ${esc(to)}` : ''}` : `Request${to ? ` from ${esc(to)}` : ''}`, 'pay-submit', { icon: mode === 'pay' ? 'fa-solid fa-paper-plane' : 'fa-solid fa-hand-holding-dollar' })}
            <div class="stp-muted stp-small stp-center">Sent when you send your next chat message.</div>
        </div>`;
}

export default {
    id: 'pay',
    label: 'Pocket',
    icon: 'fa-solid fa-dollar-sign',
    color: 'linear-gradient(160deg, #3dff8e, #00b852)',
    group: 'Money',
    badge: () => {
        const items = liveItems();
        return items.filter(p => p.kind === 'pay' && p.payType === 'request' && isUser(p.to) && p.status === 'sent' && requestStatus(p, items) === 'open').length;
    },
    render() {
        return ui.view === 'send' ? renderSend() : renderMain();
    },
    actions: {
        'pay-open': el => navigate('pay', 'send', { mode: el.dataset.mode }),
        'pay-mode': el => {
            ui.params.mode = el.dataset.tab;
            changed();
        },
        'pay-pick': el => {
            ui.params.to = el.dataset.name;
            changed();
        },
        'pay-emoji': el => {
            ui.drafts['pay:note'] = `${el.dataset.emoji} ${ui.drafts['pay:note'] ?? ''}`.trim();
            changed();
        },
        'pay-submit': () => {
            const mode = ui.params.mode === 'request' ? 'request' : 'pay';
            const to = ui.params.to;
            const amount = toMoney(draft('pay:amount'));
            if (!to) return toastr.info('Pick who to send to.', 'Pocket');
            if (!amount) return toastr.info('Enter an amount.', 'Pocket');
            if (mode === 'pay' && amount > balance()) return toastr.warning('Not enough money in your Pocket balance.', 'Pocket');
            queueItem({ kind: 'pay', payType: mode, from: userName(), to, amount, note: draft('pay:note') });
            clearDrafts('pay:amount', 'pay:note');
            navigate('pay', null, { tab: 'activity' });
        },
        'pay-request-pay': el => {
            const req = state().items.find(x => x.id === el.dataset.id);
            if (!req) return;
            if (req.amount > balance()) return toastr.warning('Not enough money in your Pocket balance.', 'Pocket');
            queueItem({ kind: 'pay', payType: 'pay', from: userName(), to: req.from, amount: req.amount, note: req.note, requestId: req.id });
        },
        'pay-request-decline': el => {
            const req = state().items.find(x => x.id === el.dataset.id);
            if (!req) return;
            queueItem({ kind: 'pay', payType: 'decline', from: userName(), to: req.from, amount: 0, note: req.note, requestId: req.id });
        },
        'pay-add-toggle': () => {
            ui.params.addCash = !ui.params.addCash;
            changed();
        },
        'pay-add-cash': () => {
            const amount = toMoney(draft('pay:add'));
            if (!amount) return;
            const st = state();
            st.wallet.topUps = (Number(st.wallet.topUps) || 0) + amount;
            clearDrafts('pay:add');
            ui.params.addCash = false;
            saveState();
            changed();
            toastr.success(`Added ${money(amount)} to your Pocket.`, 'Pocket');
        },
    },
};
