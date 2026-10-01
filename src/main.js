// Wires everything together: SillyTavern events, the generation interceptor,
// the slash command and the public API for other extensions.
import { ALL_APPS } from './apps/index.js';
import { changed, commitPending, ctx, hasChat, pruneAfterDelete, reanchor, settings, state } from './core.js';
import { checkDeliveries } from './derived.js';
import { adoptChatImage, autoImages, generateImage, registerImageProvider, unregisterImageProvider } from './images.js';
import { updateInjection } from './inject.js';
import { notifyItems } from './notify.js';
import { processMessage, scanChat } from './parse.js';
import { createSettingsPanel, syncSettingsUi } from './settings-panel.js';
import { applyDevicePosition, close, createDom, open, toggle } from './ui/shell.js';
import { navigate, resetUi, ui } from './ui/state.js';
import { norm } from './util.js';

function onChatChanged() {
    resetUi();
    if (hasChat()) scanChat();
    updateInjection();
    changed();
}

function onMessage(mesId, { notify = true, reanchorAfter = true } = {}) {
    if (!settings().enabled || !hasChat()) return;
    const id = Number(mesId);
    if (!Number.isInteger(id)) return;
    const added = processMessage(id);
    if (reanchorAfter) reanchor(id);
    if (added.length) {
        adoptChatImage(id, added);
        if (notify) notifyItems(added);
        autoImages(added);
    } else {
        // Another extension may have attached an image after we parsed the message.
        adoptChatImage(id, state().items);
    }
    checkDeliveries();
    updateInjection();
    changed();
}

globalThis.stPhoneGenerateInterceptor = async function (_chat, _contextSize, _abort, type) {
    try {
        if (!settings().enabled || !hasChat()) return;
        if (!type || type === 'normal') commitPending();
        updateInjection();
        changed();
    } catch (e) {
        console.error('[Phone] interceptor failed', e);
    }
};

function registerEvents() {
    const c = ctx();
    const ev = c.eventTypes ?? c.event_types;
    const on = (name, fn) => name && c.eventSource.on(name, fn);
    on(ev.CHAT_CHANGED, onChatChanged);
    on(ev.MESSAGE_RECEIVED, id => onMessage(id));
    on(ev.CHARACTER_MESSAGE_RENDERED, id => onMessage(id));
    on(ev.MESSAGE_SENT, id => onMessage(id, { notify: false }));
    on(ev.MESSAGE_EDITED, id => onMessage(id));
    on(ev.MESSAGE_UPDATED, id => onMessage(id));
    on(ev.MESSAGE_SWIPED, id => onMessage(id, { reanchorAfter: false }));
    on(ev.MESSAGE_DELETED, newLength => {
        if (!hasChat()) return;
        pruneAfterDelete(Number(newLength));
        updateInjection();
        changed();
    });
    on(ev.GROUP_UPDATED, () => changed());
    on(ev.SETTINGS_UPDATED, () => syncSettingsUi());
}

function registerSlashCommand() {
    const c = ctx();
    if (!c.SlashCommandParser || !c.SlashCommand) return;
    try {
        c.SlashCommandParser.addCommandObject(c.SlashCommand.fromProps({
            name: 'phone',
            helpString: `Open, close or toggle the in-story phone, or jump to an app. Usage: /phone [open|close|toggle|pc|phone|${ALL_APPS.map(a => a.id).join('|')}]`,
            callback: (_args, value) => {
                const v = norm(value);
                if (v === 'close') close();
                else if (v === 'pc' || v === 'phone') {
                    settings().mode = v;
                    applyDevicePosition();
                    syncSettingsUi();
                    open();
                } else if (ALL_APPS.some(a => a.id === v)) navigate(v);
                else if (v === 'open') open();
                else toggle();
                return '';
            },
        }));
    } catch (e) {
        console.debug('[Phone] slash command registration failed', e);
    }
}

function exposeApi() {
    const api = {
        version: '0.2.0',
        registerImageProvider: (id, label, fn) => {
            registerImageProvider(id, label, fn);
            syncSettingsUi();
        },
        unregisterImageProvider,
        generateImage,
        open,
        close,
        navigate,
        get state() {
            return state();
        },
        get ui() {
            return ui;
        },
    };
    globalThis.stPhone = api;
    document.dispatchEvent(new CustomEvent('stphone-ready', { detail: api }));
}

export function init() {
    settings();
    createDom();
    createSettingsPanel();
    registerEvents();
    registerSlashCommand();
    exposeApi();
    onChatChanged();
}
