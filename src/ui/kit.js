// Reusable UI pieces. Everything returns HTML strings; all dynamic text is escaped.
import { avatarUrl, isUser, money, settings, userName } from '../core.js';
import { isBusy } from '../gen.js';
import { imageAvailable, imageBusy } from '../images.js';
import { ago, esc, gradientFor, initials, norm, sameName } from '../util.js';
import { ui } from './state.js';

export function avatar(name, size = 'md', extraClass = '') {
    const url = avatarUrl(name);
    const cls = `stp-avatar stp-avatar-${size} ${extraClass}`;
    if (url) return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="${cls} stp-avatar-letter" style="background:${gradientFor(name)}">${esc(initials(isUser(name) ? userName() : name))}</span>`;
}

export function iconBtn(icon, act, title, attrs = '') {
    return `<button class="stp-icon-btn" data-act="${act}" title="${esc(title)}" aria-label="${esc(title)}" ${attrs}><i class="${icon}"></i></button>`;
}

export function button(label, act, { variant = 'primary', icon = '', attrs = '', small = false } = {}) {
    return `<button class="stp-btn stp-btn-${variant} ${small ? 'stp-btn-sm' : ''}" data-act="${act}" ${attrs}>${icon ? `<i class="${icon}"></i>` : ''}${label ? `<span>${label}</span>` : ''}</button>`;
}

/** iOS-style navigation bar. `title` may contain HTML (pre-escaped). */
export function header(title, { back = true, actions = '', large = false, subtitle = '' } = {}) {
    return `<header class="stp-header ${large ? 'stp-header-large' : ''}">
        <div class="stp-header-bar">
            ${back ? iconBtn('fa-solid fa-chevron-left', 'back', 'Back', 'data-back') : '<span class="stp-icon-spacer"></span>'}
            <div class="stp-header-title">${large ? '' : title}</div>
            <div class="stp-header-actions">${actions}</div>
        </div>
        ${large ? `<div class="stp-large-title">${title}${subtitle ? `<div class="stp-large-sub">${subtitle}</div>` : ''}</div>` : ''}
    </header>`;
}

export function tabs(list, active, act = 'tab') {
    return `<div class="stp-tabs" role="tablist">${list.map(t => `<button class="stp-tab ${t.id === active ? 'stp-active' : ''}" data-act="${act}" data-tab="${esc(t.id)}" role="tab">
        ${t.icon ? `<i class="${t.icon}"></i>` : ''}<span>${esc(t.label)}</span>${t.badge ? `<span class="stp-tab-badge">${t.badge}</span>` : ''}
    </button>`).join('')}</div>`;
}

export function personChips(list, active, { includeYou = false, act = 'pick-person' } = {}) {
    const user = userName();
    const all = includeYou ? [...list, user] : list;
    if (!all.length) return '';
    return `<div class="stp-chips stp-chips-scroll">${all.map(n => {
        const on = sameName(n, active);
        return `<button class="stp-chip ${on ? 'stp-active' : ''}" data-act="${act}" data-name="${esc(n)}">${avatar(n, 'xs')}<span>${esc(isUser(n) ? 'You' : n)}</span></button>`;
    }).join('')}</div>`;
}

export function empty(icon, title, text = '', action = '') {
    return `<div class="stp-empty">
        <div class="stp-empty-icon"><i class="${icon}"></i></div>
        <div class="stp-empty-title">${esc(title)}</div>
        ${text ? `<div class="stp-empty-text">${text}</div>` : ''}
        ${action}
    </div>`;
}

export function sectionLabel(text, extra = '') {
    return `<div class="stp-section-label"><span>${esc(text)}</span>${extra}</div>`;
}

export function peekButton(name, { label = false } = {}) {
    if (!name || isUser(name)) return '';
    const busy = isBusy(`peek:${norm(name)}`);
    if (label) {
        return `<button class="stp-btn stp-btn-soft stp-btn-sm ${busy ? 'stp-spin' : ''}" data-act="peek" data-name="${esc(name)}" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i><span>${busy ? 'Peeking…' : 'Peek'}</span></button>`;
    }
    return `<button class="stp-icon-btn ${busy ? 'stp-spin' : ''}" data-act="peek" data-name="${esc(name)}" title="Peek into ${esc(name)}'s phone" ${busy ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i></button>`;
}

export function peekNote(name, profile) {
    if (isBusy(`peek:${norm(name)}`)) return `<div class="stp-peek-note stp-shimmer">Peeking at ${esc(name)}'s phone…</div>`;
    if (!profile?.generatedAt) return '';
    const when = ago(profile.generatedAt);
    return `<div class="stp-peek-note">Peeked ${when === 'now' ? 'just now' : `${esc(when)} ago`}</div>`;
}

export function shimmerCards(n = 3) {
    return Array.from({ length: n }, () => '<div class="stp-skeleton"><div></div><div></div><div></div></div>').join('');
}

/**
 * A photo: the generated image if there is one, otherwise a tappable placeholder
 * showing what the photo depicts.
 */
export function photo(target, cls = '', { adult = false, interactive = true } = {}) {
    const blur = adult && settings().blurAdult && !ui.revealed?.[target.id];
    if (target.imageUrl) {
        return `<div class="stp-photo-wrap ${cls} ${blur ? 'stp-blurred' : ''}">
            <img class="stp-photo-img" src="${esc(target.imageUrl)}" alt="${esc(target.image)}" title="${esc(target.image)}" loading="lazy" ${interactive ? `data-act="${blur ? 'reveal' : 'view-image'}" data-id="${esc(target.id)}"` : ''}>
            ${blur ? '<span class="stp-reveal-hint"><i class="fa-solid fa-eye-slash"></i> Tap to reveal</span>' : ''}
        </div>`;
    }
    const busy = imageBusy(target.id);
    const can = imageAvailable() && interactive;
    const action = busy
        ? '<span class="stp-photo-action"><i class="fa-solid fa-spinner fa-spin"></i> developing…</span>'
        : can ? '<span class="stp-photo-action"><i class="fa-solid fa-wand-magic-sparkles"></i> tap to develop</span>' : '';
    return `<div class="stp-photo ${cls} ${busy ? 'stp-developing' : ''}" style="--photo-bg:${gradientFor(target.image)}" ${can && !busy ? `data-act="gen-image" data-id="${esc(target.id)}"` : ''}>
        <i class="fa-solid fa-camera stp-photo-icon"></i>
        <span class="stp-photo-desc">${esc(target.image)}</span>
        ${action}
    </div>`;
}

export function amount(value, sign = '') {
    return `<span class="stp-amount ${sign === '+' ? 'stp-plus' : sign === '-' ? 'stp-minus' : ''}">${sign}${esc(money(value))}</span>`;
}

export function stars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    let out = '';
    for (let i = 1; i <= 5; i++) {
        out += r >= i ? '<i class="fa-solid fa-star"></i>' : r >= i - 0.5 ? '<i class="fa-solid fa-star-half-stroke"></i>' : '<i class="fa-regular fa-star"></i>';
    }
    return `<span class="stp-stars">${out}</span>`;
}

export function input(key, placeholder, { type = 'text', cls = '', attrs = '' } = {}) {
    return `<input class="stp-input ${cls}" type="${type}" data-draft="${esc(key)}" placeholder="${esc(placeholder)}" value="${esc(ui.drafts[key] ?? '')}" ${attrs}>`;
}

export function textarea(key, placeholder, { rows = 2, cls = '' } = {}) {
    return `<textarea class="stp-input stp-textarea ${cls}" rows="${rows}" data-draft="${esc(key)}" placeholder="${esc(placeholder)}">${esc(ui.drafts[key] ?? '')}</textarea>`;
}

export function queuedBadge(it, label = 'Sends with your next reply') {
    if (it.status !== 'pending') return '';
    return `<div class="stp-queued"><i class="fa-regular fa-clock"></i> ${esc(label)} · <a data-act="cancel-pending" data-id="${esc(it.id)}">cancel</a></div>`;
}
