import { changed, ctx, money, persona, saveSettings, saveState, settings, state, userName } from '../core.js';
import { imageAvailable, imageProviders } from '../images.js';
import { updateInjection } from '../inject.js';
import { avatar, header, input, sectionLabel } from '../ui/kit.js';
import { modeCard } from './messages.js';
import { confirmReset } from '../reset.js';
import { fillCard } from './time.js';
import { facts, nextGuide } from '../guide.js';
import { draft } from '../ui/state.js';
import { SKINS, WALLPAPERS, wallpaperCss } from '../ui/theme.js';
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

/** Who the phone belongs to: the SillyTavern persona in use. */
function accountCard() {
    const p = persona();
    return `<div class="stp-card stp-account">
        ${avatar(userName(), 'lg')}
        <div class="stp-row-main">
            <div class="stp-row-title">${esc(p.name)}</div>
            <div class="stp-row-sub">${p.title ? `${esc(p.title)} · ` : ''}SillyTavern persona${p.description ? '' : ' · no description'}</div>
            ${p.description ? `<div class="stp-account-desc">${esc(p.description.slice(0, 140))}${p.description.length > 140 ? '…' : ''}</div>` : ''}
        </div>
        <span class="stp-account-sync" title="Follows the persona you pick in SillyTavern"><i class="fa-solid fa-arrows-rotate"></i> synced</span>
    </div>`;
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
                ${accountCard()}
                ${sectionLabel('Skin')}
                <div class="stp-skins">${SKINS.map(k => `<button class="stp-skin ${(s.skin || 'classic') === k.id ? 'stp-active' : ''}" data-act="set-value" data-key="skin" data-value="${k.id}">
                    <span class="stp-skin-dots">${k.colors.map(c => `<i style="background:${c}"></i>`).join('')}</span><span>${esc(k.label)}</span>
                </button>`).join('')}</div>
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
                    ${toggleRow('adultApps', 'Adult (18+) apps', 'Shows Rated (anonymous photo rating) and Velvet (subscriptions)')}
                    ${s.adultApps ? toggleRow('blurAdult', 'Blur 18+ photos', 'Tap a photo to reveal it') : ''}
                    ${s.adultApps ? toggleRow('revealAnon', 'Reveal anonymous posters', 'Show which story character is behind a Rated post or confession') : ''}
                    ${toggleRow('notify', 'Notifications', 'Pop-ups outside the phone')}
                    ${toggleRow('lockScreen', 'Lock screen', 'Show new notifications on a lock screen when you open the phone')}
                    ${toggleRow('spamTexts', 'Spam & scam texts', 'Now and then a sketchy text arrives from an unknown number')}
                </div>
                ${sectionLabel('Story context')}
                <button class="stp-card stp-row stp-steer-row" data-act="guide-open"><span class="stp-app-glyph stp-glyph-sm" style="--glyph:linear-gradient(160deg,#a18cd1,#5b42c8)"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div class="stp-row-main"><div class="stp-row-title">Steer what gets generated</div><div class="stp-row-sub">${facts().length ? `${facts().length} fact${facts().length === 1 ? '' : 's'} pinned` : 'Pin facts like "we\'re dating", or direct the next thing'}${nextGuide() ? ' · a direction is waiting' : ''}</div></div><i class="fa-solid fa-chevron-right stp-muted"></i></button>
                <div class="stp-card stp-list-card">${toggleRow('ignoreIntro', 'Ignore intro messages', 'Leave the greeting out of everything the phone generates')}</div>
                ${sectionLabel('This chat')}
                <div class="stp-card stp-list-card">${modeCard()}</div>
                <div class="stp-card stp-list-card">${toggleRow('focusPhoneOnly', 'Centre the device in phone-only mode', 'Dims the chat behind it')}</div>
                ${sectionLabel('Your device')}
                ${fillCard()}
                ${sectionLabel('Reset')}
                <div class="stp-card stp-reset-card">
                    <button class="stp-btn stp-btn-soft" data-act="reset-generated"><i class="fa-solid fa-broom"></i><span>Clear generated content</span></button>
                    <div class="stp-muted stp-small">Feeds, peeks, characters' phones, servers, inboxes… Your texts, payments and posts stay.</div>
                    <button class="stp-btn stp-btn-danger" data-act="reset-all"><i class="fa-solid fa-rotate-left"></i><span>Reset phone &amp; PC for this chat</span></button>
                    <div class="stp-muted stp-small">A brand-new device: everything on it is cleared. The chat itself isn't changed.</div>
                </div>
                <div class="stp-muted stp-small stp-pad stp-center">More options: SillyTavern → Extensions → Phone &amp; PC</div>
            </div>`;
    },
    actions: {
        'set-toggle': async el => {
            const key = el.dataset.key;
            const s = settings();
            if (key === 'adultApps' && !s.adultApps) {
                const c = ctx();
                const ok = await c.callGenericPopup('Rated and Velvet are adult apps. Only enable it if you are 18 or older and want adult content in your roleplay.', c.POPUP_TYPE.CONFIRM, '', { okButton: 'I\'m 18+, enable' });
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
        'reset-generated': () => confirmReset('generated'),
        'reset-all': () => confirmReset('all'),
    },
};
