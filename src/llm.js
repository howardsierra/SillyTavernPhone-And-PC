// One place every phone generation goes through: replies to texts, peeks, feeds,
// shops… Uses SillyTavern's current connection, or a Connection Manager profile
// picked for the phone (e.g. a faster/cheaper model) with a prompt we build here.
import { PROMPT_KEY, chatCharacters, ctx, persona as currentPersona, settings, userName } from './core.js';
import { cardFor, ignoringIntro, introMessages } from './context.js';
import { guidanceFor } from './guide.js';
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
    const intro = ignoringIntro() ? introMessages(chat) : new Set();
    return chat
        .filter(m => m && !m.is_system && !intro.has(m) && String(m.mes ?? '').trim())
        .slice(-Math.max(1, limit))
        .map(m => ({ role: m.is_user ? 'user' : 'assistant', content: `${m.name}: ${m.mes}` }));
}

/** The prompt as chat messages: who's who, the phone's state, recent chat, then the request. */
function buildMessages(prompt) {
    const c = ctx();
    const s = settings();
    const cards = chatCharacters().slice(0, 4).map(cardFor).filter(Boolean);
    const persona = currentPersona().description;
    const phone = String(c.extensionPrompts?.[PROMPT_KEY]?.value ?? '').trim();
    const system = [
        `You are continuing an interactive roleplay with ${userName()}. Write only for the other characters, never for ${userName()}. Stay in character and keep the established tone and setting.`,
        ...cards,
        persona ? `<${userName()}'s persona>\n${persona}\n</${userName()}'s persona>` : '',
        phone,
    ].filter(Boolean).join('\n\n');
    return [
        { role: 'system', content: c.substituteParams(system) },
        ...history(Number(s.phoneHistory) || 30),
        { role: 'user', content: prompt },
    ];
}

async function viaProfile(profileId, prompt, maxTokens) {
    const c = ctx();
    const messages = buildMessages(prompt);
    const service = c.ConnectionManagerRequestService;
    const built = service.constructPrompt ? service.constructPrompt(messages, profileId) : messages;
    const result = await service.sendRequest(profileId, built, maxTokens, { includePreset: true, includeInstruct: true, stream: settings().streamPhone !== false });
    return readResult(result);
}

/** A request result: plain text, { content }, or a stream to read to the end. */
async function readResult(result) {
    if (typeof result === 'function') {
        let text = '';
        for await (const chunk of result()) text = chunk?.text ?? text;
        return text;
    }
    return typeof result === 'string' ? result : (result?.content ?? '');
}

function canStream() {
    const c = ctx();
    return settings().streamPhone !== false && c.mainApi === 'openai'
        && typeof c.ChatCompletionService?.presetToGeneratePayload === 'function' && typeof c.getChatCompletionModel === 'function';
}

/**
 * Chat Completion APIs: send the request through the current connection, streamed
 * like a chat reply. SillyTavern's own quiet prompts aren't streamed, and some
 * providers and proxies drop long non-streamed requests ("Bad Gateway").
 */
async function viaStream(prompt, maxTokens) {
    const c = ctx();
    const service = c.ChatCompletionService;
    const payload = await service.presetToGeneratePayload({}, {}, {
        messages: buildMessages(prompt),
        model: c.getChatCompletionModel(),
        max_tokens: maxTokens,
        stream: true,
    });
    payload.stream = true;
    return readResult(await service.sendRequest(payload, true));
}

// SillyTavern runs one generation at a time: quiet prompts started while the chat
// (or another phone request) is generating can fail or come back empty. So phone
// requests wait their turn, one after another, and wait for the chat to finish.
let queue = Promise.resolve();

function chatGenerating() {
    const stop = document.getElementById('mes_stop');
    return !!stop && getComputedStyle(stop).display !== 'none';
}

async function waitForChat(maxMs = 180e3) {
    const start = Date.now();
    while (chatGenerating() && Date.now() - start < maxMs) await new Promise(r => setTimeout(r, 400));
}

/**
 * Generate text for the phone (queued behind other phone requests and the chat).
 * @param {string} prompt The instruction (macros already substituted)
 * @param {object} [opts]
 */
export function llm(prompt, opts = {}) {
    const run = queue.then(async () => {
        await waitForChat();
        // The user's steering (facts, a one-off direction) goes last, where it weighs most.
        const steer = guidanceFor();
        const full = steer ? `${prompt}\n\n${steer}` : prompt;
        try {
            return await withRetries(() => generate(full, opts));
        } finally {
            // A short breather between requests, so bursts (Snoop, feeds…) don't trip rate limits.
            await sleep(500);
        }
    });
    queue = run.catch(() => {});
    return run;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Errors worth another try: the API or a proxy in front of it hiccuped. */
const TRANSIENT = /bad gateway|gateway|\b50[234]\b|\b429\b|\b52[0-4]\b|time ?out|timed out|fetch failed|network|econnreset|socket|overloaded|unavailable|too many requests|rate.?limit|capacity/i;

/**
 * Retries transient failures (502 Bad Gateway, 503, 504, 429, timeouts, empty
 * answers) with a growing pause, then explains where the error comes from.
 */
async function withRetries(fn, tries = 3) {
    let last = null;
    for (let i = 0; i < tries; i++) {
        if (i > 0) await sleep(2000 * 2 ** (i - 1));
        try {
            const out = await fn();
            if (String(out ?? '').trim()) return out;
            last = new Error('The API returned an empty response');
        } catch (e) {
            last = e;
            if (!TRANSIENT.test(String(e?.message ?? e))) throw e;
            console.warn(`[Phone] request failed (try ${i + 1}/${tries}):`, e?.message ?? e);
        }
    }
    const reason = String(last?.message ?? last ?? 'Unknown error');
    throw new Error(`${reason} — tried ${tries} times. This error comes from your API connection (the provider or a proxy), not the phone. If it keeps happening, lower "Peek response length" or pick a different Connection profile for the phone in the extension settings.`);
}

/**
 * Generate text for the phone.
 * @param {string} prompt The instruction (macros already substituted)
 * @param {object} [opts]
 * @param {string} [opts.asCharacter] In group chats, generate as this member
 * @param {number} [opts.maxTokens]
 */
// True while a phone request is running through SillyTavern (the interceptor uses it).
let phoneRequest = false;
export function isPhoneRequest() {
    return phoneRequest;
}

async function generate(prompt, opts = {}) {
    phoneRequest = true;
    try {
        return await generateRaw(prompt, opts);
    } finally {
        phoneRequest = false;
    }
}

async function generateRaw(prompt, { asCharacter = null, maxTokens = null } = {}) {
    const c = ctx();
    const s = settings();
    const tokens = Number(maxTokens) || Number(s.peekTokens) || 1200;
    const profileId = s.phoneProfile;
    if (profileId && c.ConnectionManagerRequestService && phoneProfiles().some(p => p.id === profileId)) {
        return stripReasoning(await viaProfile(profileId, prompt, tokens));
    }
    if (canStream()) {
        try {
            const text = stripReasoning(await viaStream(prompt, tokens));
            if (text) return text;
            console.warn('[Phone] streamed request came back empty; trying a quiet prompt');
        } catch (e) {
            console.warn('[Phone] streamed request failed; trying a quiet prompt', e);
        }
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
