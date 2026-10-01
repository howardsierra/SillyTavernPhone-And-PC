import { balance, changed, money, nextId, people, queueItem, saveState, state, userName } from '../core.js';
import { isBusy, runJson } from '../gen.js';
import { autoImages } from '../images.js';
import { avatar, button, empty, header, input, photo, sectionLabel, shimmerCards, tabs } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { arr, esc, sameName, str, toMoney } from '../util.js';
import { ordersTab } from './orders.js';

const TIPS = [0, 15, 18, 20];

async function findRestaurants() {
    const st = state();
    const data = await runJson('food', {}, { busyKey: 'food' });
    if (!data) return;
    st.food.restaurants = arr(data.restaurants).map(r => ({
        id: nextId(st),
        kind: 'restaurant',
        name: str(r.name),
        cuisine: str(r.cuisine),
        rating: Number(r.rating) || 4.5,
        eta: str(r.eta) || '25-35 min',
        fee: toMoney(r.fee),
        image: str(r.image) || `${str(r.cuisine)} food`,
        menu: arr(r.menu).map(m => ({ id: nextId(st), name: str(m.name), price: toMoney(m.price), description: str(m.description) })).filter(m => m.name),
    })).filter(r => r.name);
    st.food.cart = null;
    saveState();
    changed();
    autoImages(st.food.restaurants, { fromFeed: true });
}

function cart() {
    const st = state();
    const c = st.food.cart;
    if (!c) return null;
    const r = st.food.restaurants.find(x => x.id === c.rid);
    if (!r) return null;
    const lines = Object.entries(c.qty).filter(([, q]) => q > 0).map(([id, q]) => ({ item: r.menu.find(m => m.id === id), q })).filter(x => x.item);
    const subtotal = lines.reduce((s, l) => s + l.item.price * l.q, 0);
    return { r, lines, subtotal, count: lines.reduce((s, l) => s + l.q, 0) };
}

function totals(c) {
    const tipPct = ui.params.tip ?? 18;
    const tip = Math.round(c.subtotal * tipPct) / 100;
    const service = Math.round(c.subtotal * 0.05 * 100) / 100;
    return { tipPct, tip, service, total: Math.round((c.subtotal + c.r.fee + tip + service) * 100) / 100 };
}

function renderList() {
    const st = state();
    const busy = isBusy('food');
    const list = st.food.restaurants;
    const refresh = `<button class="stp-btn stp-btn-soft stp-btn-sm ${busy ? 'stp-spin' : ''}" data-act="food-find" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i><span>${list.length ? 'Refresh' : 'Find food nearby'}</span></button>`;
    if (busy) return `<div class="stp-row-end">${refresh}</div>${shimmerCards(3)}`;
    if (!list.length) return empty('fa-solid fa-burger', 'Hungry?', 'Find restaurants near you — they fit your story\'s world.', refresh);
    return `<div class="stp-row-end"><span class="stp-section-label"><span>Near you</span></span>${refresh}</div>
        ${list.map(r => `<button class="stp-restaurant" data-act="food-open" data-id="${esc(r.id)}">
            ${photo(r, 'stp-photo-banner', { interactive: false })}
            <div class="stp-restaurant-meta">
                <div><div class="stp-row-title">${esc(r.name)}</div><div class="stp-row-sub">${esc(r.cuisine)} · ${esc(r.eta)} · ${r.fee ? `${esc(money(r.fee))} delivery` : 'Free delivery'}</div></div>
                <span class="stp-rating-pill">${r.rating.toFixed(1)} <i class="fa-solid fa-star"></i></span>
            </div>
        </button>`).join('')}`;
}

function cartBar() {
    const c = cart();
    if (!c?.count) return '';
    return `<button class="stp-cart-bar" data-act="food-checkout"><span class="stp-cart-count">${c.count}</span><span>View cart</span><b>${esc(money(c.subtotal))}</b></button>`;
}

function renderRestaurant() {
    const r = state().food.restaurants.find(x => x.id === ui.params.id);
    if (!r) return `${header('Munch')}${empty('fa-solid fa-store-slash', 'Restaurant not found')}`;
    const c = state().food.cart;
    const qty = id => (c?.rid === r.id ? c.qty[id] ?? 0 : 0);
    return `${header(esc(r.name))}
        <div class="stp-scroll" data-scroll="restaurant">
            ${photo(r, 'stp-photo-banner stp-photo-hero')}
            <div class="stp-restaurant-head"><div class="stp-product-title">${esc(r.name)}</div><div class="stp-row-sub">${esc(r.cuisine)} · <i class="fa-solid fa-star"></i> ${r.rating.toFixed(1)} · ${esc(r.eta)}</div></div>
            ${sectionLabel('Menu')}
            <div class="stp-list">${r.menu.map(m => `<div class="stp-row stp-menu-item">
                <div class="stp-row-main"><div class="stp-row-title">${esc(m.name)}</div>${m.description ? `<div class="stp-row-sub">${esc(m.description)}</div>` : ''}<div class="stp-menu-price">${esc(money(m.price))}</div></div>
                <div class="stp-stepper">${qty(m.id) ? `<button data-act="food-qty" data-id="${esc(m.id)}" data-d="-1"><i class="fa-solid fa-minus"></i></button><span>${qty(m.id)}</span>` : ''}<button data-act="food-qty" data-id="${esc(m.id)}" data-d="1"><i class="fa-solid fa-plus"></i></button></div>
            </div>`).join('')}</div>
        </div>
        ${cartBar()}`;
}

function renderCheckout() {
    const c = cart();
    if (!c?.count) return `${header('Cart')}${empty('fa-solid fa-basket-shopping', 'Your cart is empty')}`;
    const t = totals(c);
    const to = ui.params.to ?? userName();
    const ppl = [userName(), ...people()];
    return `${header('Checkout')}
        <div class="stp-scroll" data-scroll="checkout">
            <div class="stp-card">
                <div class="stp-row-title">${esc(c.r.name)}</div>
                ${c.lines.map(l => `<div class="stp-line"><span>${l.q}× ${esc(l.item.name)}</span><span>${esc(money(l.item.price * l.q))}</span></div>`).join('')}
            </div>
            ${sectionLabel('Deliver to')}
            <div class="stp-chips">${ppl.map(n => `<button class="stp-chip ${sameName(n, to) ? 'stp-active' : ''}" data-act="food-to" data-name="${esc(n)}">${avatar(n, 'xs')}<span>${sameName(n, userName()) ? 'Me' : esc(n)}</span></button>`).join('')}</div>
            ${input('food:note', sameName(to, userName()) ? 'Note for the driver' : '💌 Note for them (optional)')}
            ${sectionLabel('Tip')}
            <div class="stp-chips">${TIPS.map(p => `<button class="stp-chip ${t.tipPct === p ? 'stp-active' : ''}" data-act="food-tip" data-pct="${p}"><span>${p ? `${p}%` : 'None'}</span></button>`).join('')}</div>
            <div class="stp-card stp-totals">
                <div class="stp-line"><span>Subtotal</span><span>${esc(money(c.subtotal))}</span></div>
                <div class="stp-line"><span>Delivery</span><span>${esc(money(c.r.fee))}</span></div>
                <div class="stp-line"><span>Service</span><span>${esc(money(t.service))}</span></div>
                <div class="stp-line"><span>Tip</span><span>${esc(money(t.tip))}</span></div>
                <div class="stp-line stp-line-total"><span>Total</span><span>${esc(money(t.total))}</span></div>
            </div>
            ${button(`Place order · ${esc(money(t.total))}`, 'food-order', { icon: 'fa-solid fa-motorcycle' })}
            <div class="stp-muted stp-small stp-center">Balance ${esc(money(balance()))} · placed with your next chat message</div>
        </div>`;
}

export default {
    id: 'food',
    label: 'Munch',
    icon: 'fa-solid fa-burger',
    color: 'linear-gradient(160deg, #ff7a59, #ff2d55)',
    group: 'Money',
    render() {
        if (ui.view === 'restaurant') return renderRestaurant();
        if (ui.view === 'checkout') return renderCheckout();
        const tab = ui.params.tab ?? 'food';
        return `${header('<span class="stp-brand stp-brand-food"><i class="fa-solid fa-burger"></i> Munch</span>')}
            ${tabs([{ id: 'food', label: 'Restaurants', icon: 'fa-solid fa-utensils' }, { id: 'orders', label: 'Orders', icon: 'fa-solid fa-receipt' }], tab)}
            <div class="stp-scroll" data-scroll="food:${tab}">${tab === 'orders' ? ordersTab('food') : renderList()}</div>
            ${tab === 'food' ? cartBar() : ''}`;
    },
    back() {
        if (ui.view === 'checkout') {
            const c = state().food.cart;
            navigate('food', c ? 'restaurant' : null, c ? { id: c.rid } : {});
            return true;
        }
        return false;
    },
    actions: {
        'food-find': () => findRestaurants(),
        'food-open': el => navigate('food', 'restaurant', { id: el.dataset.id }),
        'food-qty': el => {
            const st = state();
            const rid = ui.params.id;
            if (!st.food.cart || st.food.cart.rid !== rid) st.food.cart = { rid, qty: {} };
            const q = (st.food.cart.qty[el.dataset.id] ?? 0) + Number(el.dataset.d);
            st.food.cart.qty[el.dataset.id] = Math.max(0, q);
            saveState();
            changed();
        },
        'food-checkout': () => navigate('food', 'checkout', {}),
        'food-to': el => {
            ui.params.to = el.dataset.name;
            changed();
        },
        'food-tip': el => {
            ui.params.tip = Number(el.dataset.pct);
            changed();
        },
        'food-order': () => {
            const c = cart();
            if (!c?.count) return;
            const t = totals(c);
            if (t.total > balance()) return toastr.warning('Not enough money in your Pocket balance.', 'Munch');
            const recipient = ui.params.to ?? userName();
            queueItem({
                kind: 'order', app: 'food', recipient,
                item: c.lines.map(l => `${l.q}× ${l.item.name}`).join(', '),
                price: t.total, store: c.r.name, note: draft('food:note'),
                image: c.r.image, imageUrl: c.r.imageUrl,
            });
            state().food.cart = null;
            clearDrafts('food:note');
            saveState();
            toastr.success('Your order is placed when you send your next chat message.', '🛵 Munch');
            navigate('food', null, { tab: 'orders' });
        },
    },
};
