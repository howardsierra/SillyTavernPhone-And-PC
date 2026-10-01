// The device: frame, home screen / desktop, routing, gestures and global actions.
import { allActions, appById, DOCK, visibleApps } from '../apps/index.js';
import { sendText } from '../apps/messages.js';
import { balance, changed, findById, hasChat, liveItems, money, onChange, pendingItems, saveSettings, saveState, settings, state, userName } from '../core.js';
import { orderStepLabel, requestStatus } from '../derived.js';
import { peek } from '../gen.js';
import { generateImage, retakeImage } from '../images.js';
import { esc, norm } from '../util.js';
import { empty, header } from './kit.js';
import { navigate, ui } from './state.js';
import { wallpaperCss } from './theme.js';

// -------------------------------------------------------------------- helpers

function nowText() {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function badgeFor(app) {
    try {
        return hasChat() && app.badge ? Number(app.badge()) || 0 : 0;
    } catch {
        return 0;
    }
}

export function totalBadge() {
    if (!hasChat()) return 0;
    return visibleApps().reduce((sum, a) => sum + badgeFor(a), 0);
}

function appIcon(app, { label = true } = {}) {
    const badge = badgeFor(app);
    return `<button class="stp-app-icon" data-act="open-app" data-app="${app.id}" title="${esc(app.label)}">
        <span class="stp-app-glyph" style="--glyph:${app.color}"><i class="${app.icon}"></i></span>
        ${badge ? `<span class="stp-badge-dot">${badge > 99 ? '99+' : badge}</span>` : ''}
        ${label ? `<span class="stp-app-label">${esc(app.label)}</span>` : ''}
    </button>`;
}

// -------------------------------------------------------------------- widgets

function widgets() {
    if (!hasChat()) return '';
    const items = liveItems();
    const unread = items.filter(x => x.kind === 'sms' && x.dir === 'in' && !x.read).sort((a, b) => b.time - a.time);
    const nextOrder = items.filter(x => x.kind === 'order' && x.source !== 'gen' && (x.recipient === userName() || x.from === userName()))
        .sort((a, b) => b.time - a.time)[0];
    const requests = items.filter(x => x.kind === 'pay' && x.payType === 'request' && x.to === userName() && x.status === 'sent' && requestStatus(x, items) === 'open');
    let glance;
    if (unread.length) {
        const u = unread[0];
        glance = `<button class="stp-widget stp-widget-glance" data-act="go" data-app="${u.app === 'spark' ? 'spark' : 'messages'}" data-view="thread" data-contact="${esc(u.contact)}">
            <div class="stp-widget-label"><i class="fa-solid fa-comment"></i> ${unread.length} new</div>
            <div class="stp-widget-title">${esc(u.contact)}</div><div class="stp-widget-text">${esc(u.image && !u.text ? '📷 Photo' : u.text)}</div></button>`;
    } else if (nextOrder) {
        glance = `<button class="stp-widget stp-widget-glance" data-act="open-app" data-app="${nextOrder.app === 'food' ? 'food' : 'shop'}">
            <div class="stp-widget-label"><i class="fa-solid fa-box"></i> ${nextOrder.app === 'food' ? 'Munch' : 'Cartly'}</div>
            <div class="stp-widget-title">${esc(orderStepLabel(nextOrder))}</div><div class="stp-widget-text">${esc(nextOrder.item)}</div></button>`;
    } else {
        glance = `<button class="stp-widget stp-widget-glance" data-act="open-app" data-app="messages">
            <div class="stp-widget-label"><i class="fa-solid fa-check"></i> All caught up</div>
            <div class="stp-widget-title">${esc(new Date().toLocaleDateString([], { weekday: 'long' }))}</div><div class="stp-widget-text">No new messages</div></button>`;
    }
    return `<div class="stp-widgets">
        ${glance}
        <button class="stp-widget stp-widget-pay" data-act="open-app" data-app="pay">
            <div class="stp-widget-label"><i class="fa-solid fa-dollar-sign"></i> Pocket${requests.length ? ` · ${requests.length} request${requests.length > 1 ? 's' : ''}` : ''}</div>
            <div class="stp-widget-money">${esc(money(balance()))}</div>
            <div class="stp-widget-text">Available</div>
        </button>
    </div>`;
}

function homeView() {
    const apps = visibleApps();
    const dock = DOCK.map(id => apps.find(a => a.id === id)).filter(Boolean);
    const grid = apps.filter(a => !DOCK.includes(a.id));
    const d = new Date();
    return `<div class="stp-home">
        <div class="stp-home-clock">
            <div class="stp-home-date">${esc(d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
            <div class="stp-home-time">${esc(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, ''))}</div>
        </div>
        ${widgets()}
        <div class="stp-home-grid">${grid.map(a => appIcon(a)).join('')}</div>
        <div class="stp-dock">${dock.map(a => appIcon(a, { label: false })).join('')}</div>
    </div>`;
}

function desktopView() {
    const apps = visibleApps();
    return `<div class="stp-desktop">
        <div class="stp-desktop-icons">${apps.map(a => appIcon(a)).join('')}</div>
        <div class="stp-desktop-widgets">
            <div class="stp-home-clock"><div class="stp-home-time">${esc(nowText().replace(/\s?[AP]M$/i, ''))}</div><div class="stp-home-date">${esc(new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))}</div></div>
            ${widgets()}
        </div>
    </div>`;
}

function bannerHtml() {
    const b = ui.banner;
    if (!b) return '';
    return `<button class="stp-banner" data-act="banner-open">
        <span class="stp-banner-icon" style="--glyph:${appById(b.app)?.color ?? '#444'}"><i class="${b.icon}"></i></span>
        <span class="stp-banner-main"><b>${esc(b.title)}</b><span>${esc(b.text)}</span></span>
        <span class="stp-banner-time">now</span>
    </button>`;
}

function viewerHtml() {
    if (!ui.viewer) return '';
    const target = findById(ui.viewer);
    if (!target?.imageUrl) return '';
    return `<div class="stp-viewer" data-act="close-viewer">
        <img src="${esc(target.imageUrl)}" alt="">
        <div class="stp-viewer-caption">${esc(target.image ?? '')}</div>
        <div class="stp-viewer-actions">
            <a class="stp-btn stp-btn-glass" href="${esc(target.imageUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i><span>Open</span></a>
            <button class="stp-btn stp-btn-glass" data-act="retake-image" data-id="${esc(target.id)}"><i class="fa-solid fa-camera-rotate"></i><span>Retake</span></button>
        </div>
    </div>`;
}

function currentView() {
    if (!hasChat()) return `${header('Phone', { back: false })}${empty('fa-solid fa-mobile-screen', 'No chat open', 'Open a chat to use the phone.')}`;
    if (ui.app === 'home') return null;
    const app = appById(ui.app);
    if (!app) {
        ui.app = 'home';
        return null;
    }
    try {
        return app.render();
    } catch (e) {
        console.error('[Phone] app render failed', e);
        return `${header(esc(app.label))}${empty('fa-solid fa-triangle-exclamation', 'Something went wrong', esc(e?.message ?? e))}`;
    }
}

// --------------------------------------------------------------------- render

let renderQueued = false;

export function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        render();
        updateLauncher();
    });
}

export function render() {
    const device = document.getElementById('stp-device');
    if (!device) return;
    const s = settings();
    const theme = s.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme;
    device.classList.toggle('stp-hidden', !ui.open || !s.enabled);
    device.classList.toggle('stp-mode-pc', s.mode === 'pc');
    device.classList.toggle('stp-mode-phone', s.mode !== 'pc');
    device.classList.toggle('stp-theme-light', theme === 'light');
    device.style.setProperty('--stp-wallpaper', wallpaperCss(s));
    if (!ui.open || !s.enabled) return;

    // Preserve focus, caret and scroll across re-renders.
    const active = document.activeElement;
    const focusKey = device.contains(active) ? active?.dataset?.draft : null;
    const selStart = active?.selectionStart;
    const selEnd = active?.selectionEnd;
    const scrollEl = device.querySelector('.stp-scroll');
    const scrollKey = scrollEl?.dataset.scroll;
    const scrollTop = scrollEl?.scrollTop;

    const view = currentView();
    const app = appById(ui.app);
    const viewKey = `${ui.app}/${ui.view ?? ''}`;
    let anim = '';
    if (viewKey !== ui.lastViewKey && ui.lastViewKey) anim = ui.app === 'home' ? 'stp-anim-home' : ui.view ? 'stp-anim-push' : 'stp-anim-open';
    ui.lastViewKey = viewKey;
    const appClass = app ? `stp-app-${app.id}` : 'stp-app-home';

    if (s.mode === 'pc') {
        const groups = {};
        for (const a of visibleApps()) (groups[a.group ?? 'Apps'] ??= []).push(a);
        const nav = Object.entries(groups).map(([g, list]) => `<div class="stp-nav-group">${esc(g)}</div>${list.map(a => {
            const badge = badgeFor(a);
            return `<button class="stp-nav-item ${ui.app === a.id ? 'stp-active' : ''}" data-act="open-app" data-app="${a.id}">
                <span class="stp-app-glyph stp-glyph-sm" style="--glyph:${a.color}"><i class="${a.icon}"></i></span><span class="stp-nav-label">${esc(a.label)}</span>
                ${badge ? `<span class="stp-count">${badge}</span>` : ''}
            </button>`;
        }).join('')}`).join('');
        device.innerHTML = `<div class="stp-window">
            <div class="stp-titlebar stp-drag">
                <span class="stp-lights"><button data-act="close" title="Close" class="stp-light stp-light-red"></button><button data-act="home" title="Desktop" class="stp-light stp-light-yellow"></button><button data-act="toggle-mode" title="Switch to phone" class="stp-light stp-light-green"></button></span>
                <span class="stp-titlebar-title">${esc(app ? app.label : `${userName()}'s PC`)}</span>
                <span class="stp-titlebar-clock">${esc(nowText())}</span>
            </div>
            <div class="stp-pc-body">
                <nav class="stp-sidebar"><button class="stp-nav-item ${ui.app === 'home' ? 'stp-active' : ''}" data-act="home"><span class="stp-app-glyph stp-glyph-sm" style="--glyph:linear-gradient(160deg,#5e5ce6,#bf5af2)"><i class="fa-solid fa-house"></i></span><span class="stp-nav-label">Desktop</span></button>${nav}</nav>
                <main class="stp-screen ${appClass}">
                    <div class="stp-view ${anim}">${view ?? desktopView()}</div>
                    ${bannerHtml()}
                    ${viewerHtml()}
                </main>
            </div>
        </div>`;
    } else {
        const onHome = view === null;
        device.innerHTML = `<div class="stp-frame">
            <span class="stp-hw stp-hw-action"></span><span class="stp-hw stp-hw-vol1"></span><span class="stp-hw stp-hw-vol2"></span><span class="stp-hw stp-hw-power"></span>
            <div class="stp-screen ${appClass} ${onHome ? 'stp-on-home' : ''}">
                <div class="stp-statusbar stp-drag">
                    <span class="stp-status-time">${esc(nowText().replace(/\s?[AP]M$/i, ''))}</span>
                    <span class="stp-island ${ui.banner ? 'stp-island-wide' : ''}"></span>
                    <span class="stp-status-icons"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i><span class="stp-battery"><i></i></span>
                    <button class="stp-close" data-act="close" title="Close phone" aria-label="Close phone"><i class="fa-solid fa-xmark"></i></button></span>
                </div>
                <div class="stp-view ${anim}">${view ?? homeView()}</div>
                ${bannerHtml()}
                ${viewerHtml()}
                <div class="stp-homebar" data-act="home" title="Home"></div>
            </div>
        </div>`;
    }

    const newScroll = device.querySelector('.stp-scroll');
    if (newScroll) {
        if (ui.scrollBottom) newScroll.scrollTop = newScroll.scrollHeight;
        else if (scrollKey && newScroll.dataset.scroll === scrollKey) newScroll.scrollTop = scrollTop;
    }
    ui.scrollBottom = false;

    if (focusKey) {
        const el = [...device.querySelectorAll('[data-draft]')].find(x => x.dataset.draft === focusKey);
        if (el) {
            el.focus();
            try {
                el.setSelectionRange(selStart, selEnd);
            } catch { /* not a text input */ }
        }
    }
    autosize(device);
}

function autosize(root) {
    root.querySelectorAll('textarea.stp-composer-input').forEach(t => {
        t.style.height = 'auto';
        t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
    });
}

export function updateLauncher() {
    const launcher = document.getElementById('stp-launcher');
    if (!launcher) return;
    const s = settings();
    launcher.classList.toggle('stp-hidden', !s.enabled || !s.showLauncher);
    const n = totalBadge();
    const badge = launcher.querySelector('.stp-launcher-badge');
    badge.textContent = n ? String(n > 99 ? '99+' : n) : '';
    badge.classList.toggle('stp-hidden', !n);
    const queued = hasChat() ? pendingItems().length : 0;
    launcher.classList.toggle('stp-has-queued', queued > 0);
    launcher.title = queued ? `Phone — ${queued} queued for your next reply` : 'Phone';
}

// -------------------------------------------------------------------- actions

export function open(app) {
    ui.open = true;
    if (app) {
        ui.app = app;
        ui.view = null;
        ui.params = {};
    }
    changed();
}

export function close() {
    ui.open = false;
    ui.viewer = null;
    changed();
}

export function toggle() {
    if (ui.open) close();
    else open();
}

function goBack() {
    const app = appById(ui.app);
    if (app?.back?.()) return;
    if (ui.view) {
        const tab = ui.params.tab;
        ui.view = null;
        ui.params = tab ? { tab } : {};
    } else {
        ui.app = 'home';
        ui.params = {};
    }
    changed();
}

const GLOBAL_ACTIONS = {
    close: () => close(),
    home: () => {
        ui.app = 'home';
        ui.view = null;
        ui.params = {};
        changed();
    },
    back: () => goBack(),
    'open-app': el => {
        ui.app = el.dataset.app;
        ui.view = null;
        ui.params = {};
        changed();
    },
    go: el => navigate(el.dataset.app, el.dataset.view || null, el.dataset.contact ? { contact: el.dataset.contact } : {}),
    tab: el => {
        ui.params.tab = el.dataset.tab;
        ui.params.person = undefined;
        changed();
    },
    'pick-person': el => {
        ui.params.person = el.dataset.name;
        changed();
    },
    peek: el => peek(el.dataset.name),
    'gen-image': el => generateImage(el.dataset.id),
    'view-image': el => {
        ui.viewer = el.dataset.id;
        changed();
    },
    reveal: el => {
        ui.revealed[el.dataset.id] = true;
        changed();
    },
    'close-viewer': () => {
        ui.viewer = null;
        changed();
    },
    'retake-image': el => {
        ui.viewer = null;
        retakeImage(el.dataset.id);
    },
    'cancel-pending': el => {
        const st = state();
        st.items = st.items.filter(x => !(x.id === el.dataset.id && x.status === 'pending'));
        saveState();
        changed();
    },
    'edit-pending': el => {
        const st = state();
        const it = st.items.find(x => x.id === el.dataset.id && x.status === 'pending');
        if (!it) return;
        const key = `thread:${it.app ?? 'messages'}:${norm(it.contact)}`;
        ui.drafts[key] = it.text;
        st.items = st.items.filter(x => x !== it);
        saveState();
        changed();
    },
    'toggle-mode': () => {
        settings().mode = settings().mode === 'pc' ? 'phone' : 'pc';
        saveSettings();
        applyDevicePosition();
        changed();
    },
    'banner-open': () => {
        const go = ui.banner?.go;
        ui.banner = null;
        if (go) go();
        else changed();
    },
};

let actionMap = null;

async function handleAction(el) {
    const act = el.dataset.act;
    actionMap ??= { ...allActions(), ...GLOBAL_ACTIONS };
    const fn = actionMap[act];
    if (!fn) return;
    try {
        await fn(el);
    } catch (e) {
        console.error(`[Phone] action ${act} failed`, e);
        toastr.error(String(e?.message ?? e), 'Phone');
    }
}

// ------------------------------------------------------------------ dragging

function makeDraggable(el, handleSelector, posKey, onClick) {
    let start = null;
    let lastTouch = 0;
    const point = e => (e.touches?.[0] ?? e.changedTouches?.[0] ?? e);

    const onDown = e => {
        const isTouch = e.type === 'touchstart';
        if (isTouch) lastTouch = Date.now();
        else if (Date.now() - lastTouch < 800) return;
        if (!isTouch && e.button !== 0) return;
        const handle = e.target.closest(handleSelector);
        if (!handle || !el.contains(handle)) return;
        if (el.id !== 'stp-launcher' && e.target.closest('button, a, input, textarea, select')) return;
        if (el.id === 'stp-device' && window.matchMedia('(max-width: 700px)').matches) return;
        const p = point(e);
        const rect = el.getBoundingClientRect();
        start = { x: p.clientX, y: p.clientY, left: rect.left, top: rect.top, moved: false };
        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', onUp);
    };

    const onMove = e => {
        if (!start) return;
        const p = point(e);
        const dx = p.clientX - start.x;
        const dy = p.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 6) return;
        start.moved = true;
        e.preventDefault();
        const left = Math.min(Math.max(0, start.left + dx), window.innerWidth - 40);
        const top = Math.min(Math.max(0, start.top + dy), window.innerHeight - 40);
        Object.assign(el.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    };

    const onUp = e => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        if (!start) return;
        if (start.moved) {
            const s = settings();
            const pos = s[posKey] ?? {};
            pos[posKey === 'devicePos' ? s.mode : 'all'] = { left: el.style.left, top: el.style.top };
            s[posKey] = pos;
            saveSettings();
        } else if (onClick) {
            if (e.type === 'touchend') e.preventDefault();
            onClick();
        }
        start = null;
    };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: true });
}

export function applyDevicePosition() {
    const device = document.getElementById('stp-device');
    if (!device) return;
    const pos = settings().devicePos?.[settings().mode];
    if (pos?.left && pos?.top) Object.assign(device.style, { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' });
    else Object.assign(device.style, { left: '', top: '', right: '', bottom: '' });
}

export function resetPositions() {
    settings().devicePos = null;
    settings().launcherPos = null;
    saveSettings();
    applyDevicePosition();
    const launcher = document.getElementById('stp-launcher');
    if (launcher) Object.assign(launcher.style, { left: '', top: '', right: '', bottom: '' });
}

// ---------------------------------------------------------------------- setup

export function createDom() {
    const launcher = document.createElement('div');
    launcher.id = 'stp-launcher';
    launcher.setAttribute('role', 'button');
    launcher.setAttribute('tabindex', '0');
    launcher.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i><span class="stp-launcher-badge stp-hidden"></span>';
    document.body.appendChild(launcher);
    const lpos = settings().launcherPos?.all;
    if (lpos?.left && lpos?.top) Object.assign(launcher.style, { left: lpos.left, top: lpos.top, right: 'auto', bottom: 'auto' });
    makeDraggable(launcher, '#stp-launcher', 'launcherPos', toggle);
    launcher.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    });

    const device = document.createElement('div');
    device.id = 'stp-device';
    device.className = 'stp-hidden';
    document.body.appendChild(device);
    applyDevicePosition();
    makeDraggable(device, '.stp-drag', 'devicePos');

    device.addEventListener('click', e => {
        const el = e.target.closest('[data-act]');
        if (!el || !device.contains(el) || el.disabled) return;
        // Clicks inside the viewer image shouldn't close it.
        if (el.dataset.act === 'close-viewer' && e.target.tagName === 'IMG') return;
        e.preventDefault();
        handleAction(el);
    });
    device.addEventListener('input', e => {
        const el = e.target;
        if (el.dataset?.draft !== undefined) {
            ui.drafts[el.dataset.draft] = el.value;
            if (el.tagName === 'TEXTAREA') autosize(device);
        }
    });
    device.addEventListener('keydown', e => {
        const el = e.target;
        if (e.key === 'Escape') {
            if (ui.viewer) {
                ui.viewer = null;
                changed();
            }
            return;
        }
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        if (el.dataset?.send) {
            e.preventDefault();
            sendText(el.dataset.send, el.dataset.contact, e.ctrlKey || e.metaKey);
        } else if (el.dataset?.enter) {
            e.preventDefault();
            handleAction({ dataset: { act: el.dataset.enter } });
        } else if (el.dataset?.draft === 'new-contact') {
            e.preventDefault();
            handleAction({ dataset: { act: 'msg-new-create' } });
        }
    });

    window.addEventListener('resize', () => {
        for (const el of [launcher, device]) {
            const rect = el.getBoundingClientRect();
            if (el.style.left && (rect.left > window.innerWidth - 40 || rect.top > window.innerHeight - 40)) {
                Object.assign(el.style, { left: '', top: '', right: '', bottom: '' });
            }
        }
    });

    // Keep the clock fresh without re-rendering under the user's fingers.
    setInterval(() => {
        if (!ui.open) return;
        const t = nowText();
        device.querySelectorAll('.stp-titlebar-clock').forEach(x => {
            x.textContent = t;
        });
        device.querySelectorAll('.stp-status-time').forEach(x => {
            x.textContent = t.replace(/\s?[AP]M$/i, '');
        });
    }, 20000);

    const menu = document.getElementById('extensionsMenu');
    if (menu) {
        const item = document.createElement('div');
        item.id = 'stp-wand-item';
        item.className = 'list-group-item flex-container flexGap5';
        item.innerHTML = '<div class="fa-solid fa-mobile-screen-button extensionsMenuExtensionButton"></div><span>Phone / PC</span>';
        item.addEventListener('click', () => toggle());
        menu.appendChild(item);
    }

    onChange(scheduleRender);
}

