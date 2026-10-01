import { balance, changed, money, nextId, people, queueItem, saveState, state, userName } from '../core.js';
import { isBusy, runJson } from '../gen.js';
import { autoImages } from '../images.js';
import { avatar, button, empty, header, input, photo, shimmerCards, stars, tabs } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { arr, compact, esc, sameName, str, toMoney, toNum } from '../util.js';
import { ordersTab } from './orders.js';

const SUGGESTIONS = ['Gift ideas', 'Flowers', 'Jewelry', 'Chocolate', 'Cozy hoodie', 'Books', 'Tech gadgets', 'Date night'];

async function search(query) {
    query = String(query || '').trim();
    if (!query) return;
    const st = state();
    st.shop.query = query;
    st.shop.results = [];
    changed();
    const data = await runJson('shop', { query }, { busyKey: 'shop' });
    if (!data) return;
    st.shop.results = arr(data.products).map(p => ({
        id: nextId(st),
        kind: 'product',
        name: str(p.name),
        price: toMoney(p.price),
        store: str(p.store),
        rating: Number(p.rating) || 4.5,
        reviews: toNum(p.reviews),
        description: str(p.description),
        image: str(p.image) || str(p.name),
    })).filter(p => p.name);
    saveState();
    changed();
    autoImages(st.shop.results, { fromFeed: true });
}

function renderShop() {
    const st = state();
    const busy = isBusy('shop');
    const results = st.shop.results;
    return `<div class="stp-searchbar stp-searchbar-input"><i class="fa-solid fa-magnifying-glass"></i>${input('shop:q', 'Search Cartly', { attrs: 'data-enter="shop-search"' })}${button('', 'shop-search', { small: true, icon: 'fa-solid fa-arrow-right' })}</div>
        <div class="stp-chips stp-chips-scroll">${SUGGESTIONS.map(s => `<button class="stp-chip" data-act="shop-suggest" data-q="${esc(s)}"><span>${esc(s)}</span></button>`).join('')}</div>
        ${st.shop.query ? `<div class="stp-section-label"><span>Results for “${esc(st.shop.query)}”</span></div>` : ''}
        ${busy ? `<div class="stp-grid-2">${shimmerCards(4)}</div>` : results.length ? `<div class="stp-grid-2">${results.map(p => `<button class="stp-product" data-act="shop-open" data-id="${esc(p.id)}">
                ${photo(p, 'stp-photo-square', { interactive: false })}
                <div class="stp-product-name">${esc(p.name)}</div>
                <div class="stp-product-price">${esc(money(p.price))}</div>
                <div class="stp-product-rating">${stars(p.rating)} <span>${compact(p.reviews)}</span></div>
            </button>`).join('')}</div>` : empty('fa-solid fa-bag-shopping', 'What are you shopping for?', 'Search for anything — results fit your story\'s world.')}`;
}

function renderProduct() {
    const p = state().shop.results.find(x => x.id === ui.params.id);
    if (!p) return `${header('Cartly')}${empty('fa-solid fa-box-open', 'Item not found')}`;
    const to = ui.params.to ?? userName();
    const ppl = [userName(), ...people()];
    return `${header('<span class="stp-brand stp-brand-shop"><i class="fa-solid fa-cart-shopping"></i> Cartly</span>')}
        <div class="stp-scroll" data-scroll="product">
            ${photo(p, 'stp-photo-hero')}
            <div class="stp-product-detail">
                <div class="stp-muted stp-small">${esc(p.store)}</div>
                <div class="stp-product-title">${esc(p.name)}</div>
                <div class="stp-product-rating">${stars(p.rating)} <span>${p.rating.toFixed(1)} · ${compact(p.reviews)} reviews</span></div>
                <div class="stp-product-bigprice">${esc(money(p.price))}</div>
                <p>${esc(p.description)}</p>
                <div class="stp-section-label"><span>Deliver to</span></div>
                <div class="stp-chips">${ppl.map(n => `<button class="stp-chip ${sameName(n, to) ? 'stp-active' : ''}" data-act="shop-to" data-name="${esc(n)}">${avatar(n, 'xs')}<span>${sameName(n, userName()) ? 'Me' : esc(n)}</span></button>`).join('')}</div>
                ${sameName(to, userName()) ? '' : input('shop:note', '🎁 Gift note (optional)')}
                <div class="stp-buy-bar">
                    <div><div class="stp-muted stp-small">Balance</div><b>${esc(money(balance()))}</b></div>
                    ${button(`Buy now · ${esc(money(p.price))}`, 'shop-buy', { icon: 'fa-solid fa-bolt' })}
                </div>
            </div>
        </div>`;
}

export default {
    id: 'shop',
    label: 'Cartly',
    icon: 'fa-solid fa-cart-shopping',
    color: 'linear-gradient(160deg, #ffc94d, #ff8a00)',
    group: 'Money',
    render() {
        if (ui.view === 'product') return renderProduct();
        const tab = ui.params.tab ?? 'shop';
        return `${header('<span class="stp-brand stp-brand-shop"><i class="fa-solid fa-cart-shopping"></i> Cartly</span>')}
            ${tabs([{ id: 'shop', label: 'Shop', icon: 'fa-solid fa-store' }, { id: 'orders', label: 'Orders', icon: 'fa-solid fa-box' }], tab)}
            <div class="stp-scroll" data-scroll="shop:${tab}">${tab === 'orders' ? ordersTab('shop') : renderShop()}</div>`;
    },
    actions: {
        'shop-search': () => search(draft('shop:q')),
        'shop-suggest': el => {
            ui.drafts['shop:q'] = el.dataset.q;
            search(el.dataset.q);
        },
        'shop-open': el => navigate('shop', 'product', { id: el.dataset.id }),
        'shop-to': el => {
            ui.params.to = el.dataset.name;
            changed();
        },
        'shop-buy': () => {
            const p = state().shop.results.find(x => x.id === ui.params.id);
            if (!p) return;
            if (p.price > balance()) return toastr.warning('Not enough money in your Pocket balance.', 'Cartly');
            const recipient = ui.params.to ?? userName();
            queueItem({
                kind: 'order', app: 'shop', recipient, item: p.name, price: p.price, store: p.store,
                note: sameName(recipient, userName()) ? '' : draft('shop:note'), image: p.image, imageUrl: p.imageUrl,
            });
            clearDrafts('shop:note');
            toastr.success(`${p.name} — order places with your next chat message.`, '🛒 Cartly');
            navigate('shop', null, { tab: 'orders' });
        },
    },
};
