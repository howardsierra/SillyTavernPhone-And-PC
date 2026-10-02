// One place every phone generation goes through: replies to texts, peeks, feeds,
// shops… Uses SillyTavern's current connection, or a Connection Manager profile
// picked for the phone (e.g. a faster/cheaper model) with a prompt we build here.
import { PROMPT_KEY, chatCharacters, ctx, settings, userName } from './core.js';
import { cardFor } from './context.js';
import { sameName } from './util.js';

export function phoneProfiles() {
    try {
        return ctx().ConnectionManagerRequestService?.getSupportedProfiles?.() ?? [];
    } catch {
        return [];
    }
}

function stripReasoning(text) {
    return String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
}

/** Recent chat history as chat-completion messages (the chat is the phone's memory). */
function history(limit) {
    const chat = ctx().chat ?? [];
    return chat
        .filter(m => m && !m.is_system && String(m.mes ?? '').trim())
        .slice(-Math.max(1, limit))
        .map(m => ({ role: m.is_user ? 'user' : 'assistant', content: `${m.name}: ${m.mes}` }));
}

async function viaProfile(profileId, prompt, maxTokens) {
    const c = ctx();
    const s = settings();
    const cards = chatCharacters().slice(0, 4).map(cardFor).filter(Boolean);
    const persona = String(c.powerUserSettings?.persona_description ?? '').trim();
    const phone = String(c.extensionPrompts?.[PROMPT_KEY]?.value ?? '').trim();
    const system = [
        `You are continuing an interactive roleplay with ${userName()}. Write only for the other characters, never for ${userName()}. Stay in character and keep the established tone and setting.`,
        ...cards,
        persona ? `<${userName()}'s persona>\n${persona}\n</${userName()}'s persona>` : '',
        phone,
    ].filter(Boolean).join('\n\n');
    const messages = [
        { role: 'system', content: c.substituteParams(system) },
        ...history(Number(s.phoneHistory) || 30),
        { role: 'user', content: prompt },
    ];
    const service = c.ConnectionManagerRequestService;
    const built = service.constructPrompt ? service.constructPrompt(messages, profileId) : messages;
    const result = await service.sendRequest(profileId, built, maxTokens, { includePreset: true, includeInstruct: true });
    return typeof result === 'string' ? result : (result?.content ?? '');
}

/**
 * Generate text for the phone.
 * @param {string} prompt The instruction (macros already substituted)
 * @param {object} [opts]
 * @param {string} [opts.asCharacter] In group chats, generate as this member
 * @param {number} [opts.maxTokens]
 */
export async function llm(prompt, { asCharacter = null, maxTokens = null } = {}) {
    const c = ctx();
    const s = settings();
    const tokens = Number(maxTokens) || Number(s.peekTokens) || 1200;
    const profileId = s.phoneProfile;
    if (profileId && c.ConnectionManagerRequestService && phoneProfiles().some(p => p.id === profileId)) {
        return stripReasoning(await viaProfile(profileId, prompt, tokens));
    }
    let forceChId = null;
    if (c.groupId && asCharacter) {
        const idx = c.characters.findIndex(x => sameName(x.name, asCharacter));
        if (idx >= 0) forceChId = idx;
    }
    if (c.generateQuietPrompt.length === 0) {
        return stripReasoning(await c.generateQuietPrompt({
            quietPrompt: prompt,
            skipWIAN: false,
            removeReasoning: true,
            forceChId,
            responseLength: tokens,
        }));
    }
    return stripReasoning(await c.generateQuietPrompt(prompt, false, false));
}
