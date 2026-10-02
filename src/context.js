// Tells quiet generations (peeks, shops, feeds…) what to base themselves on:
// - "fresh": the chat has no intro message → only the character card, nothing else
// - "intro": only the intro message so far → the card plus that intro
// - "story": an ongoing chat → the card plus the chat so far
import { chatCharacters, ctx, isUser, userName } from './core.js';
import { sameName } from './util.js';

const CARD_LIMIT = 2000;

/** Which stage the current chat is at. Only the selected swipe of each message counts. */
export function chatStage() {
    const chat = ctx().chat ?? [];
    const real = chat.filter(m => m && !m.is_system && String(m.mes ?? '').trim());
    if (!real.length) return 'fresh';
    if (!real.some(m => m.is_user) && real.length === 1) return 'intro';
    return 'story';
}

function clip(text, limit = CARD_LIMIT) {
    const t = String(text ?? '').trim();
    return t.length > limit ? `${t.slice(0, limit)}…` : t;
}

/** Card fields for a character (never the first message or alternate greetings). */
export function cardFor(name) {
    const c = ctx();
    const chid = c.characters?.findIndex(x => sameName(x.name, name));
    if (chid === undefined || chid < 0) return null;
    let fields = null;
    try {
        fields = c.getCharacterCardFields?.({ chid });
    } catch { /* older SillyTavern */ }
    const ch = c.characters[chid];
    const description = fields?.description ?? ch.description ?? ch.data?.description ?? '';
    const personality = fields?.personality ?? ch.personality ?? ch.data?.personality ?? '';
    const scenario = fields?.scenario ?? ch.scenario ?? ch.data?.scenario ?? '';
    const parts = [
        description && `Description: ${clip(description)}`,
        personality && `Personality: ${clip(personality, 800)}`,
        scenario && `Scenario: ${clip(scenario, 800)}`,
    ].filter(Boolean);
    return parts.length ? `<${ch.name}'s character card>\n${parts.join('\n')}\n</${ch.name}'s character card>` : null;
}

/**
 * The context block added to every quiet generation.
 * @param {string|null} focus The character being peeked at, if any
 */
/** {{user}}'s persona, for generating {{user}}'s own posts, searches and music. */
function personaFor() {
    const persona = clip(ctx().powerUserSettings?.persona_description ?? '', 1500);
    return `[This is about ${userName()} — the user's own character, not one of the story's characters. Base it on ${userName()}'s persona${persona ? ' below' : ' (no persona description is set: infer who they are from how they act in the story)'} and on what ${userName()} has said and done in the story so far. Stay true to them and don't invent big new facts about their life.${persona ? `\n<${userName()}'s persona>\n${persona}\n</${userName()}'s persona>` : ''}]`;
}

export function storyContext(focus = null) {
    const base = storyBase(focus);
    return focus && isUser(focus) ? `${personaFor()}\n${base}` : base;
}

function storyBase(focus) {
    const stage = chatStage();
    if (stage === 'story') {
        return '[Story context: use the character card(s) and everything that has happened in the chat so far, especially the most recent events.]';
    }
    if (stage === 'intro') {
        return '[Story context: the story is just beginning. The only scene so far is the intro message in the chat. Base everything on the character card(s) and that intro message — nothing else has happened yet.]';
    }

    // No intro message: rely on the card alone, and say so explicitly.
    const names = [];
    if (focus && cardFor(focus)) names.push(focus);
    for (const n of chatCharacters()) {
        if (!names.some(x => sameName(x, n))) names.push(n);
    }
    const cards = names.slice(0, 3).map(cardFor).filter(Boolean);
    const npc = focus && !isUser(focus) && !cardFor(focus)
        ? `\n${focus} has no character card: invent them so they fit the setting of the card(s) below.`
        : '';
    return `[Story context: this chat has no intro message — the story hasn't started yet. Base everything ONLY on the character card information below. Do not use, assume or invent any opening scene, greeting or shared history with {{user}} beyond what the card itself says.${npc}
${cards.join('\n') || '(No character card information is available — keep everything generic.)'}]`;
}
