// Delivering what {{user}} does on the phone.
//
// "Instant" (default): sending a text stores it in the chat as a (hidden) message,
// generates the reply right away and stores that too — the chat is the phone's
// memory, so this works even in an empty chat. "Next message": everything waits
// for {{user}}'s next chat message instead.
//
// Phone-only roleplay always delivers instantly and asks the model to keep the
// whole story on the phone.
import { changed, chatCharacters, commitPending, ctx, findGroup, isUser, money, pendingItems, promptText, saveState, settings, state, sub, userName } from './core.js';
import { updateInjection } from './inject.js';
import { llm } from './llm.js';
import { APP_NAMES, hasTags } from './parse.js';
import { ui } from './ui/state.js';
import { sameName } from './util.js';

export function isPhoneOnly() {
    return !!state().phoneOnly;
}

export function isInstant() {
    return isPhoneOnly() || settings().textDelivery !== 'next';
}

/** SillyTavern is busy generating a reply. */
export function isGenerating() {
    const stop = document.getElementById('mes_stop');
    return delivering || (!!stop && getComputedStyle(stop).display !== 'none');
}

export function setPhoneOnly(on) {
    const st = state();
    st.phoneOnly = !!on;
    if (on) st.phoneOnlySince = (ctx().chat ?? []).length;
    saveState();
    changed();
}

/** Who the conversation is with right now (last person {{user}} texted, or the character). */
export function currentContact() {
    const st = state();
    if (st.lastContact?.contact) return st.lastContact;
    const name = chatCharacters()[0] ?? ctx().name2;
    return name ? { app: 'messages', contact: name } : null;
}

export function rememberContact(app, contact) {
    state().lastContact = { app, contact };
}

// ---------------------------------------------------------------------------
// Transcript lines (what goes into the chat)
// ---------------------------------------------------------------------------

function textLine(it) {
    const user = userName();
    const target = findGroup(it.contact) ? `«${it.contact}» (group)` : it.contact;
    const where = it.app === 'spark' ? ' (Spark)' : '';
    const kind = it.voice ? '[voice message] ' : '';
    const photo = it.image ? `[photo: ${it.image}] ` : '';
    return `📱 **${user} → ${target}${where}:** ${kind}${photo}${it.text ?? ''}`.trim();
}

/** One transcript line per queued action, as it appears in the chat log. */
export function outboxTranscript(items = pendingItems()) {
    const user = userName();
    const lines = [];
    for (const it of items) {
        switch (it.kind) {
            case 'sms':
                lines.push(textLine(it));
                break;
            case 'call':
                lines.push(`📱 *${user} calls ${it.contact}…*`);
                break;
            case 'pay':
                if (it.payType === 'decline') lines.push(`📱 *${user} declines ${it.to}'s money request.*`);
                else if (it.payType === 'request') lines.push(`📱 *${user} requests ${money(it.amount)} from ${it.to} on Pocket${it.note ? ` (${it.note})` : ''}.*`);
                else lines.push(`📱 *${user} sends ${it.to} ${money(it.amount)} on Pocket${it.note ? ` (${it.note})` : ''}.*`);
                break;
            case 'order': {
                const forWhom = isUser(it.recipient) ? '' : ` for ${it.recipient}`;
                lines.push(`📱 *${user} orders ${it.item}${forWhom} on ${it.app === 'food' ? 'Munch' : 'Cartly'}${it.note ? ` — note: "${it.note}"` : ''}.*`);
                break;
            }
            case 'post':
                // Anonymous posts stay anonymous.
                if (it.app !== 'rated') lines.push(`📱 *${user} posts on ${APP_NAMES[it.app] ?? it.app}:* ${it.title ? `"${it.title}" ` : ''}${it.text ?? ''}${it.image ? ` [photo: ${it.image}]` : ''}`.trim());
                break;
            case 'plan':
                lines.push(`📱 *${user} adds to the calendar: ${it.text} (${it.when})${it.with?.length ? ` — with ${it.with.join(', ')}` : ''}.*`);
                break;
            default:
                break;
        }
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

function userAvatar() {
    const c = ctx();
    const chat = c.chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i]?.is_user && chat[i].force_avatar) return chat[i].force_avatar;
    }
    const personas = c.powerUserSettings?.personas ?? {};
    const key = Object.keys(personas).find(k => personas[k] === c.name1);
    return key ? c.getThumbnailUrl('persona', key) : undefined;
}

/** Appends a message to the chat like SillyTavern does, flagged as phone traffic. */
async function pushMessage(message) {
    const c = ctx();
    const ev = c.eventTypes ?? c.event_types;
    const full = {
        send_date: new Date().toISOString(),
        is_system: false,
        ...message,
        extra: { ...(message.extra ?? {}), stp_phone: true },
    };
    c.chat.push(full);
    const id = c.chat.length - 1;
    if (full.is_user) {
        await c.eventSource.emit(ev.MESSAGE_SENT, id);
        c.addOneMessage(full);
        await c.eventSource.emit(ev.USER_MESSAGE_RENDERED, id);
    } else {
        await c.eventSource.emit(ev.MESSAGE_RECEIVED, id, 'extension');
        c.addOneMessage(full);
        await c.eventSource.emit(ev.CHARACTER_MESSAGE_RENDERED, id, 'extension');
    }
    await c.saveChat();
    applyChatHiding();
    return id;
}

/** The chat character a reply is filed under (group chats need a real member). */
function speakerFor(contact) {
    const c = ctx();
    const members = chatCharacters();
    const member = members.find(n => sameName(n, contact));
    const name = member ?? members[0] ?? c.name2 ?? contact;
    const ch = c.characters?.find(x => sameName(x.name, name));
    const extra = {};
    if (c.groupId && ch) {
        extra.original_avatar = ch.avatar;
        extra.force_avatar = c.getThumbnailUrl('avatar', ch.avatar);
    }
    return { name, ...extra };
}

/** Phone messages stay in the chat (they're the context) but can be hidden from view. */
export function applyChatHiding() {
    const hide = settings().enabled && settings().hidePhoneInChat;
    const chat = ctx().chat ?? [];
    document.querySelectorAll('#chat .mes[mesid]').forEach(el => {
        const m = chat[Number(el.getAttribute('mesid'))];
        el.classList.toggle('stp-phone-mes', !!(hide && m?.extra?.stp_phone));
    });
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

/** Who should answer what was just sent. */
function replyTarget(items) {
    for (const it of [...items].reverse()) {
        if ((it.kind === 'sms' || it.kind === 'call') && it.contact) return { app: it.app ?? 'messages', contact: it.contact };
    }
    for (const it of [...items].reverse()) {
        if (it.kind === 'pay' && !isUser(it.to)) return { app: 'messages', contact: it.to };
        if (it.kind === 'order' && !isUser(it.recipient)) return { app: 'messages', contact: it.recipient };
        if (it.kind === 'plan' && it.with?.length) return { app: 'messages', contact: it.with[0] };
    }
    return null;
}

/** Turns the model's answer into phone tags (wrapping plain text as texts). */
function normaliseReply(raw, target) {
    let text = String(raw ?? '').trim();
    if (!text) return { silent: true, mes: '' };
    const group = findGroup(target.contact);
    if (/<silent\s*\/?>/i.test(text) && !hasTags(text.replace(/<silent\s*\/?>/gi, ''))) return { silent: true, mes: '' };
    text = text.replace(/<silent\s*\/?>/gi, '').trim();
    if (hasTags(text)) return { silent: false, mes: text };
    // No tags: the whole answer is a text from whoever was messaged.
    let body = text.replace(/\*[^*\n]+\*/g, ' ').replace(/^["“”\s]+|["“”\s]+$/gm, '')
        .split('\n').map(x => x.replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('\n');
    if (!body) body = text;
    body = body.replace(/</g, '‹').replace(/>/g, '›');
    const from = group ? (group.members[0] ?? target.contact) : target.contact;
    const chatAttr = group ? ` chat="${group.name.replace(/"/g, '')}"` : '';
    const app = target.app === 'spark' ? ' app="spark"' : '';
    return { silent: false, mes: `<sms from="${from.replace(/"/g, '')}"${chatAttr}${app}>${body}</sms>` };
}

let delivering = false;

/**
 * Delivers everything queued right now and gets the reply.
 * @returns {Promise<boolean>} true if something was sent
 */
export async function deliverNow() {
    if (!pendingItems().length) return false;
    if (isGenerating()) {
        toastr.info('Wait for the current reply — your message is queued.', '📱 Phone');
        return false;
    }
    delivering = true;
    let target = null;
    try {
        const pending = pendingItems();
        const transcript = outboxTranscript(pending) || '📱';
        const avatar = userAvatar();
        await pushMessage({ name: userName(), is_user: true, mes: transcript, ...(avatar ? { force_avatar: avatar } : {}) });
        const committed = commitPending();
        updateInjection();
        target = replyTarget(committed);
        if (!target) return true;

        ui.typing = target;
        changed();
        const group = findGroup(target.contact);
        const prompt = sub(promptText(group ? 'replyGroup' : 'reply'), {
            contact: target.contact,
            members: group ? group.members.join(', ') : '',
            what: outboxTranscript(committed).replace(/\*\*/g, ''),
        });
        const raw = await llm(prompt, { asCharacter: group ? null : target.contact, maxTokens: Number(settings().replyTokens) || 600 });
        const reply = normaliseReply(raw, target);
        const outgoing = committed.filter(x => x.kind === 'sms' && sameName(x.contact, target.contact));
        outgoing.forEach(x => {
            x.seen = true;
        });
        if (reply.silent) {
            saveState();
            return true;
        }
        ui.typing = null;
        await pushMessage({ ...speakerFor(group ? (group.members[0] ?? target.contact) : target.contact), is_user: false, mes: reply.mes, extra: { stp_reply: target } });
        return true;
    } catch (e) {
        console.error('[Phone] delivery failed', e);
        toastr.error(String(e?.message ?? e), '📱 Couldn\'t get a reply');
        return true;
    } finally {
        delivering = false;
        ui.typing = null;
        saveState();
        updateInjection();
        changed();
    }
}

/**
 * Sends {{user}}'s turn now. Instant delivery (or phone-only) answers on the phone;
 * otherwise the queued actions go into the chat box and SillyTavern generates.
 */
export function sendTurn() {
    if (!pendingItems().length) return false;
    if (isInstant()) {
        deliverNow();
        return true;
    }
    if (isGenerating()) {
        toastr.info('Wait for the reply — your message is queued and goes out with your next send.', '📱 Phone');
        return false;
    }
    const box = document.getElementById('send_textarea');
    const button = document.getElementById('send_but');
    if (!box || !button) return false;
    const transcript = outboxTranscript() || '📱';
    const typed = String(box.value ?? '').trim();
    box.value = typed ? `${typed}\n${transcript}` : transcript;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    return true;
}

/**
 * In phone-only mode a story reply without any phone tags is turned into texts
 * from whoever {{user}} was talking to, so the conversation stays on the phone.
 */
export function wrapPlainReply(message, mesId) {
    const st = state();
    if (!st.phoneOnly || message.is_user || message.is_system || message.extra?.stp_phone) return false;
    if (mesId < (st.phoneOnlySince ?? 0)) return false;
    const text = String(message.mes ?? '');
    if (!text.trim() || text.includes('📱') || hasTags(text)) return false;
    const target = currentContact() ?? { app: 'messages', contact: message.name };
    message.mes = normaliseReply(text, target).mes;
    return true;
}
