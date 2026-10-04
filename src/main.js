// Wires everything together: SillyTavern events, the generation interceptor,
// the slash command and the public API for other extensions.
import { ALL_APPS } from './apps/index.js';
import { changed, commitPending, ctx, hasChat, loadPersonaModule, pruneAfterDelete, reanchor, registerPersona, settings, state } from './core.js';
import { checkDeliveries } from './derived.js';
import { adoptChatImage, autoImages, generateImage, registerImageProvider, unregisterImageProvider } from './images.js';
import { updateInjection } from './inject.js';
import { notifyItems } from './notify.js';
import { processMessage, scanChat } from './parse.js';
import { createSettingsPanel, syncSettingsUi } from './settings-panel.js';
import { applyDevicePosition, close, createDom, open, toggle } from './ui/shell.js';
import { navigate, resetUi, ui } from './ui/state.js';
import { setOwner } from './apps/theirs.js';
import { commentsOnMyPost } from './comments.js';
import { confirmReset } from './reset.js';
import { ignoringIntro, introMessages } from './context.js';
import { isPhoneRequest } from './llm.js';
import { fillDevice, parseDuration, timeSkip } from './apps/time.js';
import { addFact, setNextGuide } from './guide.js';
import { applyChatHiding, currentContact, isPhoneOnly, setPhoneOnly } from './turn.js';
import { maybeSpam } from './apps/extras.js';
import { debounce, norm, sameName } from './util.js';

function onChatChanged() {
    resetUi();
    ui.typing = null;
    if (hasChat()) registerPersona();
    if (hasChat()) scanChat();
    updateInjection();
    // Phone-only chats open straight into the conversation.
    if (hasChat() && isPhoneOnly() && settings().enabled) {
        const c = currentContact();
        if (c) navigate(c.app, 'thread', { contact: c.contact });
    }
    changed();
}

/** Switching personas signs the phone in as the new one. */
function onPersonaChanged() {
    if (!hasChat()) return;
    // SillyTavern updates the name a moment after the event.
    setTimeout(() => {
        const now = registerPersona();
        if (now && ui.open && settings().enabled) toastr.info(`Signed in as ${now.name}${now.title ? ` · ${now.title}` : ''}`, '📱 Phone', { timeOut: 2500 });
        updateInjection();
        changed();
    }, 50);
}

function stopTyping() {
    if (!ui.typing) return;
    ui.typing = null;
    changed();
}

function onMessage(mesId, { notify = true, reanchorAfter = true } = {}) {
    if (!settings().enabled || !hasChat()) return;
    const id = Number(mesId);
    if (!Number.isInteger(id)) return;
    const added = processMessage(id);
    if (added.some(x => x.kind === 'sms' && ui.view === 'thread' && sameName(x.contact, ui.params.contact))) ui.scrollBottom = true;
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

globalThis.stPhoneGenerateInterceptor = async function (chat, _contextSize, _abort, type) {
    try {
        if (!settings().enabled || !hasChat()) return;
        // Phone requests can leave the intro message out (this prompt only; the chat is untouched).
        if (type === 'quiet' && isPhoneRequest() && ignoringIntro() && Array.isArray(chat)) {
            const intro = introMessages(chat);
            for (let i = chat.length - 1; i >= 0; i--) if (intro.has(chat[i])) chat.splice(i, 1);
            return;
        }
        const committed = !type || type === 'normal' ? commitPending() : [];
        // Show "typing…" in the conversation that's waiting for an answer.
        const lastText = [...committed].reverse().find(x => x.kind === 'sms' || x.kind === 'call');
        if (lastText) ui.typing = { app: lastText.app ?? 'messages', contact: lastText.contact };
        else if (isPhoneOnly() && !['quiet', 'impersonate'].includes(type)) ui.typing = currentContact();
        updateInjection();
        changed();
    } catch (e) {
        console.error('[Phone] interceptor failed', e);
    }
};

/** Phone traffic stays in the chat as context but is hidden from view (optional). */
function watchChat() {
    const hide = debounce(applyChatHiding, 50);
    const chat = document.getElementById('chat');
    if (chat) new MutationObserver(hide).observe(chat, { childList: true });
    hide();
}

/** Posts that went out with the last chat reply get their comments now. */
function commentOnPostedItems() {
    if (!hasChat()) return;
    for (const it of state().items) {
        if (it.wantsComments && it.status === 'sent') {
            delete it.wantsComments;
            if (settings().autoComments !== false) commentsOnMyPost(it);
        }
    }
}

function registerEvents() {
    const c = ctx();
    const ev = c.eventTypes ?? c.event_types;
    const on = (name, fn) => name && c.eventSource.on(name, fn);
    on(ev.CHAT_CHANGED, onChatChanged);
    on(ev.PERSONA_CHANGED, onPersonaChanged);
    on(ev.MESSAGE_RECEIVED, (id, type) => {
        ui.typing = null;
        onMessage(id);
        commentOnPostedItems();
        if (type !== 'extension' && type !== 'first_message') maybeSpam();
    });
    on(ev.GENERATION_ENDED, stopTyping);
    on(ev.GENERATION_STOPPED, stopTyping);
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
            helpString: `Open, close or toggle the in-story phone, jump to an app, or switch this chat to phone-only roleplay (only) and back (story). /phone reset gives this chat a brand-new phone; /phone clear removes generated content only. Usage: /phone [open|close|toggle|pc|phone|only|story|reset|clear|timeskip <how long>|fill|fact <text>|guide <text>|steer|${ALL_APPS.map(a => a.id).join('|')}]`,
            callback: (_args, value) => {
                const v = norm(value);
                const raw = String(value ?? '').trim();
                if (v.startsWith('fact ')) {
                    addFact(raw.replace(/^fact\s+/i, ''));
                    toastr.success('Pinned. Everything the phone generates will follow it.', '✨ Fact');
                } else if (v.startsWith('guide ') || v.startsWith('steer ')) {
                    setNextGuide(raw.replace(/^(guide|steer)\s+/i, ''));
                    toastr.info('The next thing the phone generates will follow it.', '✨ Direction set');
                } else if (v === 'guide' || v === 'steer') {
                    open();
                    ui.guideSheet = true;
                    changed();
                } else if (v.startsWith('timeskip') || v.startsWith('skip')) {
                    const ms = parseDuration(v.replace(/^(timeskip|skip)\s*/, '') || '1 day');
                    if (ms) timeSkip(ms, { chatNote: settings().skipChatNote !== false });
                    else toastr.info('Usage: /phone timeskip 3 days', '⏩ Time skip');
                } else if (v === 'fill' || v === 'fill phone' || v === 'fill pc') {
                    fillDevice(v === 'fill pc' ? 'pc' : v === 'fill phone' ? 'phone' : undefined);
                } else if (v === 'reset' || v === 'reset all') {
                    confirmReset('all');
                } else if (v === 'reset generated' || v === 'clear') {
                    confirmReset('generated');
                } else if (v === 'only' || v === 'phone-only') {
                    setPhoneOnly(true);
                    updateInjection();
                    const ct = currentContact();
                    if (ct) navigate(ct.app, 'thread', { contact: ct.contact });
                } else if (v === 'story' || v === 'exit') {
                    setPhoneOnly(false);
                    updateInjection();
                } else if (v === 'close') close();
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
        version: '0.9.3',
        registerImageProvider: (id, label, fn) => {
            registerImageProvider(id, label, fn);
            syncSettingsUi();
        },
        unregisterImageProvider,
        generateImage,
        open,
        close,
        navigate,
        /** Show a character's phone/PC (or {{user}}'s own with no name). */
        setOwner,
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

export async function init() {
    settings();
    await loadPersonaModule();
    createDom();
    createSettingsPanel();
    registerEvents();
    watchChat();
    registerSlashCommand();
    exposeApi();
    onChatChanged();
}
