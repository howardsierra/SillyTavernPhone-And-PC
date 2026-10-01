// Photo generation with pluggable providers.
//
// Built in: SillyTavern's Image Generation extension (/imagine), any slash command
// (works with other image extensions), Pollinations (free, no key) and any
// OpenAI-compatible images endpoint. Other extensions can register their own provider:
//
//   window.stPhone.registerImageProvider('my-id', 'My generator', async (prompt, info) => url);
//
import { changed, ctx, findById, isUser, saveState, settings, sub } from './core.js';
import { norm, sameName, seeded } from './util.js';

const external = new Map();
const busy = new Set();
let chain = Promise.resolve();

export function registerImageProvider(id, label, fn) {
    if (!id || typeof fn !== 'function') throw new Error('registerImageProvider(id, label, fn) needs an id and a function');
    external.set(String(id), { label: String(label || id), fn });
    changed();
}

export function unregisterImageProvider(id) {
    external.delete(String(id));
    changed();
}

function builtinAvailable() {
    const c = ctx();
    return !!(c.SlashCommandParser?.commands?.imagine && c.extensionSettings?.sd);
}

export function imageProviders() {
    const list = [
        { id: 'auto', label: 'Automatic (Image Generation extension if available)' },
        { id: 'builtin', label: 'SillyTavern Image Generation (/imagine)' },
        { id: 'command', label: 'Custom slash command (other image extensions)' },
        { id: 'pollinations', label: 'Pollinations.ai (free, no key — prompts are sent to pollinations.ai)' },
        { id: 'openai', label: 'OpenAI-compatible images API' },
    ];
    for (const [id, p] of external) list.push({ id: `ext:${id}`, label: `${p.label} (extension)` });
    return list;
}

function resolveProvider() {
    const s = settings();
    const id = s.imageProvider || 'auto';
    if (id === 'auto') {
        if (builtinAvailable()) return 'builtin';
        if (external.size) return `ext:${[...external.keys()][0]}`;
        return null;
    }
    if (id === 'builtin') return builtinAvailable() ? 'builtin' : null;
    if (id === 'openai') return s.openaiEndpoint && s.openaiKey ? 'openai' : null;
    if (id === 'command') return s.imageCommand?.includes('{{prompt}}') ? 'command' : null;
    if (id.startsWith('ext:')) return external.has(id.slice(4)) ? id : null;
    return id;
}

export function imageAvailable() {
    return settings().images && !!resolveProvider();
}

export function imageBusy(id) {
    return busy.has(id);
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function appearanceFor(name) {
    const c = ctx();
    const ch = c.characters?.find(x => sameName(x.name, name));
    const key = ch?.avatar ? ch.avatar.replace(/\.[^/.]+$/, '') : '';
    return String(c.extensionSettings?.sd?.character_prompts?.[key] ?? '').trim();
}

export function buildPrompt(target) {
    const s = settings();
    const desc = String(target.image ?? '').trim();
    const who = target.secretlyBy || target.from || target.name || '';
    let appearance = '';
    if (s.imageAppearance && who && !isUser(who)) {
        const showsSubject = /\b(selfie|mirror|myself|me|i|i'm|wearing|outfit|posing|her|him|she|he|body|face)\b/i.test(desc)
            || norm(desc).includes(norm(who))
            || target.kind === 'dating' || target.app === 'rated';
        if (showsSubject) appearance = appearanceFor(who);
    }
    const template = s.imagePrompt || '{{desc}}';
    const out = sub(template, { desc, name: who, appearance });
    const combined = appearance && !template.includes('{{appearance}}') ? `${appearance}, ${out}` : out;
    return combined
        .replace(/[|{}"<>]/g, ' ')
        .split(',').map(x => x.trim()).filter(Boolean).join(', ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/** Pulls a usable image URL out of whatever a command or extension returned. */
export function extractUrl(value) {
    if (!value) return '';
    if (typeof value === 'object') value = value.url ?? value.path ?? value.image ?? '';
    const text = String(value).trim();
    if (/^(?:\/|https?:\/\/|user\/|data:image\/)\S*$/i.test(text)) return text;
    const md =text.match(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/);
    if (md) return md[1];
    const img = text.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (img) return img[1];
    const url = text.match(/(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+|https?:\/\/\S+|\/?user\/images\/\S+|\/?[\w-]+\/[\w./%-]+\.(?:png|jpe?g|webp|gif|avif))/i);
    return url ? url[1].replace(/[)"'\]]+$/, '') : '';
}

async function uploadBase64(b64, format = 'png') {
    const res = await fetch('/api/images/upload', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ image: b64, format, ch_name: 'phone', filename: `phone_${Date.now()}` }),
    });
    if (!res.ok) throw new Error(`Could not save the image (${res.status})`);
    const data = await res.json();
    return data.path;
}

/** data: URLs are stored as files so chats stay small. */
async function persist(url) {
    const m = String(url).match(/^data:image\/([a-z+]+);base64,(.+)$/i);
    if (!m) return url;
    const format = m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    return uploadBase64(m[2], format);
}

function preload(url, timeout = 180000) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => reject(new Error('Image took too long to load')), timeout);
        img.onload = () => {
            clearTimeout(timer);
            resolve(url);
        };
        img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Image failed to load'));
        };
        img.src = url;
    });
}

async function runProvider(provider, prompt, target) {
    const s = settings();
    const c = ctx();
    if (provider === 'builtin' || provider === 'command') {
        const template = provider === 'builtin' ? '/imagine quiet=true gallery=false {{prompt}}' : s.imageCommand;
        const command = template.replace('{{prompt}}', prompt);
        const result = await c.executeSlashCommandsWithOptions(command, { handleParserErrors: true, handleExecutionErrors: true });
        const url = extractUrl(result?.pipe);
        if (!url) throw new Error('The image command didn\'t return an image.');
        return persist(url);
    }
    if (provider === 'pollinations') {
        const portrait = !(target.app === 'x' || target.kind === 'restaurant');
        const [w, h] = portrait ? [768, 1024] : [1024, 768];
        const seed = Math.floor(seeded(`${target.id}:${prompt}:${target.imageSeed ?? 0}`) * 1e9);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=${encodeURIComponent(s.pollinationsModel || 'flux')}`;
        return preload(url);
    }
    if (provider === 'openai') {
        const body = { model: s.openaiModel, prompt, n: 1, size: s.openaiSize || '1024x1024' };
        if (/^dall-e/i.test(s.openaiModel)) body.response_format = 'b64_json';
        const res = await fetch(s.openaiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.openaiKey}` },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || `Image API error ${res.status}`);
        const first = data?.data?.[0] ?? {};
        if (first.b64_json) return uploadBase64(first.b64_json, 'png');
        if (first.url) return first.url;
        throw new Error('The image API returned no image.');
    }
    if (provider.startsWith('ext:')) {
        const p = external.get(provider.slice(4));
        const result = await p.fn(prompt, { target: structuredClone(target), chatId: c.getCurrentChatId() });
        const url = extractUrl(result);
        if (!url) throw new Error(`${p.label} returned no image.`);
        return persist(url);
    }
    throw new Error('No image provider is configured.');
}

/**
 * Develops the photo on any object with an `image` description (texts, posts,
 * products, dating profiles…). Requests run one at a time.
 */
export function generateImage(id, { quiet = false } = {}) {
    const target = findById(id);
    if (!target || !target.image || busy.has(id)) return;
    const provider = settings().images ? resolveProvider() : null;
    if (!provider) {
        if (!quiet) toastr.warning('Pick an image provider under Extensions → Phone & PC → Photos.', 'Phone');
        return;
    }
    busy.add(id);
    changed();
    const chatId = ctx().getCurrentChatId();
    chain = chain.then(async () => {
        try {
            const url = await runProvider(provider, buildPrompt(target), target);
            if (ctx().getCurrentChatId() !== chatId) return;
            target.imageUrl = url;
            saveState();
        } catch (e) {
            console.error('[Phone] image generation failed', e);
            if (!quiet) toastr.error(String(e?.message ?? e), 'Phone: photo failed');
        } finally {
            busy.delete(id);
            changed();
        }
    });
}

export function retakeImage(id) {
    const target = findById(id);
    if (!target) return;
    delete target.imageUrl;
    target.imageSeed = (target.imageSeed ?? 0) + 1;
    saveState();
    generateImage(id);
}

/** Auto-develop according to the "Develop photos automatically" setting. */
export function autoImages(items, { fromFeed = false } = {}) {
    const s = settings();
    if (!s.images || s.imageAuto === 'off' || !imageAvailable()) return;
    for (const it of items) {
        if (!it?.image || it.imageUrl) continue;
        const isText = it.kind === 'sms';
        if (isText || (s.imageAuto === 'all' && (it.kind === 'post' || fromFeed || it.kind === 'dating' || it.kind === 'product'))) {
            generateImage(it.id, { quiet: true });
        }
    }
}

/** If another extension attached an image to the chat message, use it for the phone photo. */
export function adoptChatImage(mesId, items) {
    if (!settings().adoptChatImages) return false;
    const m = ctx().chat?.[mesId];
    const url = m?.extra?.media?.find?.(x => !x.type || x.type === 'image')?.url ?? m?.extra?.image;
    if (!url) return false;
    const target = items.find(it => it.image && !it.imageUrl && it.anchor?.mesId === mesId);
    if (!target) return false;
    target.imageUrl = url;
    saveState();
    return true;
}
