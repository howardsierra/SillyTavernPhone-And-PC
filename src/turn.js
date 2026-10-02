// Phone-only roleplay: the whole roleplay happens on the device. Sending from the
// phone sends {{user}}'s turn right away, written into the chat as a transcript line.
import { changed, chatCharacters, ctx, isUser, money, pendingItems, saveState, state, userName } from './core.js';
import { APP_NAMES } from './parse.js';
import { sameName } from './util.js';

export function isPhoneOnly() {
    return !!state().phoneOnly;
}

/** SillyTavern is busy generating a reply. */
export function isGenerating() {
    const stop = document.getElementById('mes_stop');
    return !!stop && getComputedStyle(stop).display !== 'none';
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

/** One transcript line per queued action, as it appears in the chat log. */
export function outboxTranscript(items = pendingItems()) {
    const user = userName();
    const lines = [];
    for (const it of items) {
        switch (it.kind) {
            case 'sms': {
                const photo = it.image ? `[photo: ${it.image}] ` : '';
                const where = it.app === 'spark' ? ' (Spark)' : '';
                lines.push(`📱 **${user} → ${it.contact}${where}:** ${photo}${it.text ?? ''}`.trim());
                break;
            }
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
            default:
                break;
        }
    }
    return lines.join('\n');
}

/**
 * Sends {{user}}'s turn now: everything queued goes into the chat as a transcript
 * line (after anything already typed in the chat box) and SillyTavern generates.
 */
export function sendTurn() {
    if (!pendingItems().length) return false;
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
 * In phone-only mode a reply without any phone tags is turned into texts from
 * whoever {{user}} was talking to, so the conversation stays on the phone.
 */
export function wrapPlainReply(message, mesId) {
    const st = state();
    if (!st.phoneOnly || message.is_user || message.is_system) return false;
    if (mesId < (st.phoneOnlySince ?? 0)) return false;
    const text = String(message.mes ?? '');
    if (!text.trim() || text.includes('📱')) return false;

    const speaker = message.name || ctx().name2;
    const last = st.lastContact;
    const lastIsCharacter = last && chatCharacters().some(n => sameName(n, last.contact));
    const contact = last && !lastIsCharacter ? last.contact : speaker;
    const app = last && sameName(last.contact, contact) ? last.app : 'messages';

    // Texts don't carry *actions* or quote marks.
    let body = text.replace(/\*[^*\n]+\*/g, ' ').replace(/^["“”\s]+|["“”\s]+$/gm, '').split('\n').map(x => x.replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('\n');
    if (!body) body = text.trim();
    const safe = body.replace(/</g, '‹').replace(/>/g, '›');
    message.mes = `<sms from="${contact.replace(/"/g, '')}"${app === 'spark' ? ' app="spark"' : ''}>${safe}</sms>`;
    return true;
}

