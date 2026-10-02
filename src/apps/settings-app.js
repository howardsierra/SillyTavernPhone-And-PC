import { changed, ctx, META_KEY, money, saveSettings, saveState, settings, state } from '../core.js';
import { imageAvailable, imageProviders } from '../images.js';
import { updateInjection } from '../inject.js';
import { header, input, sectionLabel } from '../ui/kit.js';
import { modeCard } from './messages.js';
import { draft, navigate, ui } from '../ui/state.js';
import { WALLPAPERS, wallpaperCss } from '../ui/theme.js';
import { esc, toMoney } from '../util.js';

function toggleRow(key, label, sub = '') {
    const on = !!settings()[key];
    return `<button class="stp-row stp-setting-row" data-act="set-toggle" data-key="${key}">
        <div class="stp-row-main"><div class="stp-row-title">${label}</div>${sub ? `<div class="stp-row-sub">${sub}</div>` : ''}</div>
        <span class="stp-switch ${on ? 'stp-on' : ''}"><i></i></span>
    </button>`;
}

function choice(key, value, label) {
    return `<button class="stp-seg ${settings()[key] === value ? 'stp-active' : ''}" data-act="set-value" data-key="${key}" data-value="${value}">${label}</button>`;
}

export default {
    id: 'settings',
    label: 'Settings',
    icon: 'fa-solid fa-gear',
    color: 'linear-gradient(180deg, #a1a1a8, #636369)',
    group: 'System',
    render() {
        const s = settings();
        const provider = imageProviders().find(p => p.id === s.imageProvider)?.label ?? s.imageProvider;
        return `${header('Settings', { large: true })}
            <div class="stp-scroll" data-scroll="settings">
                ${sectionLabel('Appearance')}
                <div class="stp-card">
                    <div class="stp-seg-row">${choice('mode', 'phone', '<i class="fa-solid fa-mobile-screen"></i> Phone')}${choice('mode', 'pc', '<i class="fa-solid fa-desktop"></i> PC')}</div>
                    <div class="stp-seg-row">${choice('theme', 'dark', 'Dark')}${choice('theme', 'light', 'Light')}${choice('theme', 'auto', 'Auto')}</div>
                    <div class="stp-swatches">${Object.keys(WALLPAPERS).map(w => `<button class="stp-swatch ${s.wallpaper === w ? 'stp-active' : ''}" style="background:${WALLPAPERS[w]}" data-act="set-value" data-key="wallpaper" data-value="${w}" title="${w}"></button>`).join('')}
                        ${s.customWallpaper ? `<button class="stp-swatch ${s.wallpaper === 'custom' ? 'stp-active' : ''}" style="background:${esc(wallpaperCss({ wallpaper: 'custom', customWallpaper: s.customWallpaper }))}" data-act="set-value" data-key="wallpaper" data-value="custom" title="Custom"></button>` : ''}
                    </div>
                    <div class="stp-row-2">${input('set:wallpaper', 'Custom wallpaper image URL')}<button class="stp-btn stp-btn-soft stp-btn-sm" data-act="set-wallpaper">Set</button></div>
                </div>
                ${sectionLabel('Photos')}
                <div class="stp-card stp-list-card">
                    ${toggleRow('images', 'Photos', imageAvailable() ? `Using ${esc(provider)}` : 'No image generator set up — configure it in Extensions → Phone & PC')}
                </div>
                ${sectionLabel('Pocket')}
                <div class="stp-card">
                    <div class="stp-row-sub">Starting balance for this chat: <b>${esc(money(state().wallet.start ?? s.startingBalance))}</b></div>
                    <div class="stp-row-2">${input('set:start', 'New starting balance', { type: 'number' })}<button class="stp-btn stp-btn-soft stp-btn-sm" data-act="set-start">Set</button></div>
                </div>
                ${sectionLabel('Apps')}
                <div class="stp-card stp-list-card">
                    ${toggleRow('adultApps', 'Adult (18+) apps', 'Shows Rated, an anonymous photo-rating app')}
                    ${s.adultApps ? toggleRow('blurAdult', 'Blur 18+ photos', 'Tap a photo to reveal it') : ''}
                    ${s.adultApps ? toggleRow('revealAnon', 'Reveal anonymous posters', 'Show which story character is behind a Rated post') : ''}
                    ${toggleRow('notify', 'Notifications', 'Pop-ups outside the phone')}
                </div>
                ${sectionLabel('This chat')}
                <div class="stp-card stp-list-card">${modeCard()}</div>
                <div class="stp-card stp-list-card">${toggleRow('focusPhoneOnly', 'Centre the device in phone-only mode', 'Dims the chat behind it')}</div>
                <div class="stp-card"><button class="stp-btn stp-btn-danger" data-act="wipe"><i class="fa-regular fa-trash-can"></i><span>Clear phone data for this chat</span></button></div>
                <div class="stp-muted stp-small stp-pad stp-center">More options: SillyTavern → Extensions → Phone &amp; PC</div>
            </div>`;
    },
    actions: {
        'set-toggle': async el => {
            const key = el.dataset.key;
            const s = settings();
            if (key === 'adultApps' && !s.adultApps) {
                const c = ctx();
                const ok = await c.callGenericPopup('Rated is an adult app. Only enable it if you are 18 or older and want adult content in your roleplay.', c.POPUP_TYPE.CONFIRM, '', { okButton: 'I\'m 18+, enable' });
                if (!ok) return;
            }
            s[key] = !s[key];
            saveSettings();
            updateInjection();
            changed();
        },
        'set-value': el => {
            settings()[el.dataset.key] = el.dataset.value;
            saveSettings();
            changed();
        },
        'set-wallpaper': () => {
            const url = draft('set:wallpaper');
            if (!url) return;
            settings().customWallpaper = url;
            settings().wallpaper = 'custom';
            saveSettings();
            changed();
        },
        'set-start': () => {
            const v = toMoney(draft('set:start'));
            state().wallet.start = v;
            saveState();
            changed();
        },
        wipe: async () => {
            const c = ctx();
            const ok = await c.callGenericPopup('Clear all texts, payments, orders, matches and feeds for this chat?', c.POPUP_TYPE.CONFIRM);
            if (!ok) return;
            c.chatMetadata[META_KEY] = {};
            saveState();
            updateInjection();
            ui.drafts = {};
            navigate('home');
        },
    },
};
