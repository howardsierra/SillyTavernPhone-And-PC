// The "Phone & PC" drawer in SillyTavern's Extensions panel.
import { changed, ctx, saveSettings, settings } from './core.js';
import { imageProviders } from './images.js';
import { updateInjection } from './inject.js';
import { DEFAULT_PROMPTS, PROMPT_LABELS } from './prompts-default.js';
import { applyDevicePosition, open, resetPositions } from './ui/shell.js';
import { esc } from './util.js';

const NUMERIC = new Set(['maxTexts', 'maxPosts', 'depth', 'role', 'peekTokens', 'startingBalance']);

function check(key, label, title = '') {
    return `<label class="checkbox_label" ${title ? `title="${esc(title)}"` : ''}><input type="checkbox" data-setting="${key}"> ${label}</label>`;
}

function row(label, control, title = '') {
    return `<div class="stp-settings-row" ${title ? `title="${esc(title)}"` : ''}><label>${label}</label>${control}</div>`;
}

function html() {
    return `<div id="stp-settings" class="stp-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b><i class="fa-solid fa-mobile-screen-button"></i> Phone &amp; PC</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="flex-container">
                <div class="menu_button menu_button_icon" id="stp-open-btn"><i class="fa-solid fa-mobile-screen-button"></i> Open phone</div>
                <div class="menu_button menu_button_icon" id="stp-reset-pos"><i class="fa-solid fa-up-down-left-right"></i> Reset positions</div>
            </div>
            ${check('enabled', 'Enabled')}
            ${check('showLauncher', 'Show floating phone button')}
            ${check('notify', 'Pop-up notifications')}
            ${row('Device', '<select class="text_pole" data-setting="mode"><option value="phone">Phone</option><option value="pc">PC</option></select>')}
            ${row('Theme', '<select class="text_pole" data-setting="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="auto">Match system</option></select>')}
            ${row('Chat marker', `<select class="text_pole" data-setting="chatMarker">
                    <option value="short">Short (“📱 Lena texted you.”)</option>
                    <option value="full">Full (shows the text in chat)</option>
                    <option value="none">None (phone only)</option>
                </select>`, 'What stays in the chat message where a phone tag was removed')}

            <h4>Prompt injection</h4>
            ${check('injectInstructions', 'Tell the model how to use the phone (tags)')}
            ${check('injectTexts', 'Include texts and calls')}
            ${row('Max texts', '<input class="text_pole" type="number" min="1" max="100" data-setting="maxTexts">')}
            ${check('injectPosts', 'Include recent social posts')}
            ${row('Max posts', '<input class="text_pole" type="number" min="1" max="50" data-setting="maxPosts">')}
            ${check('injectMoney', 'Include payments (Pocket)')}
            ${check('injectOrders', 'Include orders &amp; deliveries')}
            ${check('injectSearches', 'Include private searches (characters may get spoilers)')}
            ${row('Injection depth', '<input class="text_pole" type="number" min="0" max="100" data-setting="depth">')}
            ${row('Role', '<select class="text_pole" data-setting="role"><option value="0">System</option><option value="1">User</option><option value="2">Assistant</option></select>')}
            ${row('Peek response length (tokens)', '<input class="text_pole" type="number" min="300" max="8000" step="100" data-setting="peekTokens">', 'Peeks return a lot of JSON. If results get cut off, raise this.')}

            <h4>Photos</h4>
            ${check('images', 'Enable photos')}
            ${row('Image generator', `<select class="text_pole" data-setting="imageProvider" id="stp-provider">${imageProviders().map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}</select>`)}
            <div data-provider="command">
                <label>Slash command <small>(<code>{{prompt}}</code> is replaced with the photo prompt; the command must return an image URL)</small></label>
                <input class="text_pole" data-setting="imageCommand" placeholder="/imagine quiet=true {{prompt}}">
            </div>
            <div data-provider="pollinations">${row('Pollinations model', '<input class="text_pole" data-setting="pollinationsModel" placeholder="flux">')}</div>
            <div data-provider="openai">
                ${row('Endpoint', '<input class="text_pole" data-setting="openaiEndpoint">')}
                ${row('API key', '<input class="text_pole" type="password" data-setting="openaiKey" autocomplete="off">', 'Stored in your SillyTavern settings file')}
                ${row('Model', '<input class="text_pole" data-setting="openaiModel" placeholder="gpt-image-1">')}
                ${row('Size', '<input class="text_pole" data-setting="openaiSize" placeholder="1024x1536">')}
            </div>
            ${row('Develop automatically', `<select class="text_pole" data-setting="imageAuto">
                    <option value="off">Off (tap a photo to develop it)</option>
                    <option value="texts">Photos sent in texts</option>
                    <option value="all">Everything (texts, posts, feeds, shops, profiles)</option>
                </select>`)}
            ${check('imageAppearance', 'Add the character\'s Image Generation prompt to photos of them', 'Uses the per-character prompt prefix from SillyTavern\'s Image Generation extension')}
            ${check('adoptChatImages', 'Use images other extensions attach to the chat message', 'If an auto image-generation extension adds a picture to the message, the phone photo uses it')}
            <label>Photo prompt <small>({{desc}}, {{name}}, {{appearance}})</small></label>
            <input class="text_pole" data-setting="imagePrompt">
            <small class="stp-settings-note">Extension authors: <code>window.stPhone.registerImageProvider(id, label, async (prompt) =&gt; url)</code> adds your generator to this list.</small>

            <h4>Pocket (money)</h4>
            ${row('Currency symbol', '<input class="text_pole" data-setting="currency" maxlength="4">')}
            ${row('Starting balance (new chats)', '<input class="text_pole" type="number" min="0" step="1" data-setting="startingBalance">')}

            <h4>Adult (18+)</h4>
            ${check('adultApps', 'Enable adult apps (Rated — anonymous photo rating)')}
            ${check('blurAdult', 'Blur 18+ photos until tapped')}
            ${check('revealAnon', 'Reveal which character is behind an anonymous post')}

            <h4>Prompts</h4>
            <select class="text_pole" id="stp-prompt-key">${Object.entries(PROMPT_LABELS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
            <textarea class="text_pole textarea_compact" rows="10" id="stp-prompt-text"></textarea>
            <small>Macros like {{user}} and {{char}} work. Peek prompts also get {{name}}; Cartly gets {{query}}.</small>
            <div class="menu_button menu_button_icon" id="stp-prompt-reset"><i class="fa-solid fa-rotate-left"></i> Restore default</div>
        </div>
    </div>
</div>`;
}

export function syncSettingsUi() {
    const root = document.getElementById('stp-settings');
    if (!root) return;
    const s = settings();
    root.querySelectorAll('[data-setting]').forEach(el => {
        const key = el.dataset.setting;
        if (el.type === 'checkbox') el.checked = !!s[key];
        else if (document.activeElement !== el) el.value = String(s[key] ?? '');
    });
    const provider = s.imageProvider;
    root.querySelectorAll('[data-provider]').forEach(el => {
        el.style.display = el.dataset.provider === provider ? '' : 'none';
    });
    const select = document.getElementById('stp-provider');
    if (select) {
        const current = select.value;
        select.innerHTML = imageProviders().map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
        select.value = provider || current;
    }
    syncPrompt();
}

function syncPrompt() {
    const key = document.getElementById('stp-prompt-key')?.value;
    const box = document.getElementById('stp-prompt-text');
    if (!key || !box || document.activeElement === box) return;
    box.value = settings().prompts[key] || DEFAULT_PROMPTS[key] || '';
}

export function createSettingsPanel() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', html());
    const root = document.getElementById('stp-settings');
    syncSettingsUi();

    root.addEventListener('change', async e => {
        const el = e.target.closest('[data-setting]');
        if (!el) return;
        const key = el.dataset.setting;
        const s = settings();
        if (key === 'adultApps' && el.checked && !s.adultApps) {
            const c = ctx();
            const ok = await c.callGenericPopup('Rated is an adult app. Only enable it if you are 18 or older and want adult content in your roleplay.', c.POPUP_TYPE.CONFIRM, '', { okButton: 'I\'m 18+, enable' });
            if (!ok) {
                el.checked = false;
                return;
            }
        }
        if (el.type === 'checkbox') s[key] = el.checked;
        else if (NUMERIC.has(key)) s[key] = Number(el.value);
        else s[key] = el.value;
        saveSettings();
        if (key === 'mode') applyDevicePosition();
        syncSettingsUi();
        updateInjection();
        changed();
    });
    root.addEventListener('input', e => {
        const el = e.target.closest('[data-setting]');
        if (!el || el.type === 'checkbox' || el.tagName === 'SELECT') return;
        const key = el.dataset.setting;
        settings()[key] = NUMERIC.has(key) ? Number(el.value) : el.value;
        saveSettings();
    });

    document.getElementById('stp-prompt-key').addEventListener('change', () => syncPrompt());
    document.getElementById('stp-prompt-text').addEventListener('input', e => {
        const key = document.getElementById('stp-prompt-key').value;
        const value = e.target.value;
        if (value.trim() && value !== DEFAULT_PROMPTS[key]) settings().prompts[key] = value;
        else delete settings().prompts[key];
        saveSettings();
        updateInjection();
    });
    document.getElementById('stp-prompt-reset').addEventListener('click', () => {
        const key = document.getElementById('stp-prompt-key').value;
        delete settings().prompts[key];
        saveSettings();
        document.getElementById('stp-prompt-text').value = DEFAULT_PROMPTS[key];
        updateInjection();
    });
    document.getElementById('stp-open-btn').addEventListener('click', () => open());
    document.getElementById('stp-reset-pos').addEventListener('click', () => resetPositions());
}

