// Time Skip: move the story forward and see what landed on the phone meanwhile.
// Also "Fill my phone / PC": generate {{user}}'s whole device in one go.
import { changed, chatCharacters, ctx, ensureGroup, isUser, nextId, people, promptText, saveSettings, saveState, settings, state, sub, userName } from '../core.js';
import { peekApp, runJson } from '../gen.js';
import { updateInjection } from '../inject.js';
import { llm } from '../llm.js';
import { pushMessage, speakerFor } from '../turn.js';
import { button, header, input, sectionLabel } from '../ui/kit.js';
import { clearDrafts, draft, ui } from '../ui/state.js';
import { arr, esc, parseAgo, sameName, str } from '../util.js';
import { loadGames, loadInbox } from './desktop.js';

const H = 3600e3;
export const SKIPS = [
    { id: '1h', label: 'An hour', ms: H },
    { id: '4h', label: 'A few hours', ms: 4 * H },
    { id: 'night', label: 'Overnight', ms: 10 * H },
    { id: '1d', label: 'A day', ms: 24 * H },
    { id: '3d', label: 'A few days', ms: 72 * H },
    { id: '1w', label: 'A week', ms: 168 * H },
    { id: '2w', label: 'Two weeks', ms: 336 * H },
    { id: '1mo', label: 'A month', ms: 720 * H },
];

/** "3 days", "2h", "a week"… → milliseconds (0 if it can't tell). */
export function parseDuration(text) {
    const t = String(text ?? '').trim().toLowerCase();
    if (!t) return 0;
    const preset = SKIPS.find(s => s.id === t || s.label.toLowerCase() === t);
    if (preset) return preset.ms;
    const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, few: 3, couple: 2, several: 4 };
    const m = t.match(/(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|few|couple|several)?\s*(?:of\s+)?(min|minutes?|h|hrs?|hours?|d|days?|nights?|w|wks?|weeks?|mo|months?|y|years?)\b/);
    if (!m) return 0;
    const n = m[1] ? (Number(m[1]) || words[m[1]] || 1) : 1;
    const u = m[2];
    if (u.startsWith('min')) return n * 60e3;
    if (u.startsWith('mo')) return n * 720 * H;
    if (u.startsWith('h')) return n * H;
    if (u.startsWith('d') || u.startsWith('night')) return n * 24 * H;
    if (u.startsWith('w')) return n * 168 * H;
    if (u.startsWith('y')) return n * 8760 * H;
    return 0;
}

function describe(ms) {
    const preset = SKIPS.find(s => s.ms === ms);
    if (preset) return preset.label.toLowerCase();
    if (ms < H) return `${Math.round(ms / 60e3)} minutes`;
    if (ms < 48 * H) return `${Math.round(ms / H)} hours`;
    if (ms < 14 * 24 * H) return `${Math.round(ms / 24 / H)} days`;
    return `${Math.round(ms / 168 / H)} weeks`;
}

/** Everything already on the device moves back in time by the skip. */
function shiftTimes(node, ms, seen = new Set()) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const [k, v] of Object.entries(node)) {
        if ((k === 'time' || k === 'updated') && typeof v === 'number' && v > 1e12) node[k] = v - ms;
        else if (v && typeof v === 'object') shiftTimes(v, ms, seen);
    }
}

/**
 * Skips time: shifts the device's clock, asks the model what happened on the phone
 * meanwhile (as phone tags, delivered like a reply), and notes the skip in the chat.
 */
export async function timeSkip(ms, { note = '', chatNote = true } = {}) {
    if (!ms || ui.skipping) return;
    const st = state();
    const label = describe(ms);
    ui.skipping = label;
    ui.skipResult = null;
    changed();
    try {
        shiftTimes(st, ms);
        st.skips = [...(st.skips ?? []), { ms, label, at: Date.now() }].slice(-10);
        saveState();
        const known = chatCharacters();
        const prompt = sub(promptText('timeskip'), {
            duration: label,
            note: note ? ` Meanwhile: ${note}` : '',
            people: [...known, ...people().filter(n => !known.some(k => sameName(k, n)))].slice(0, 8).join(', ') || '(none)',
        });
        const raw = String(await llm(prompt, { maxTokens: Math.max(900, Number(settings().replyTokens) || 600) * 2 }) ?? '');
        const summary = str(raw.match(/<timeskip>([\s\S]*?)<\/timeskip>/i)?.[1]).replace(/\s+/g, ' ');
        const tags = raw.replace(/<timeskip>[\s\S]*?<\/timeskip>/gi, '').trim();

        // The skip itself, visible in the chat for the story.
        if (chatNote) {
            const line = `⏩ *${label.charAt(0).toUpperCase()}${label.slice(1)} later.*${summary ? ` ${summary}` : ''}`;
            await ctx().executeSlashCommandsWithOptions(`/sys ${line.replace(/\|/g, '/').replace(/\{\{/g, '{ {')}`);
        }
        const before = new Set(st.items.map(x => x.id));
        if (tags) await pushMessage({ ...speakerFor(known[0] ?? ''), is_user: false, mes: `📱 ⏩ ${label} later:\n${tags}`, extra: { stp_timeskip: label } });

        // Spread what arrived across the skipped time.
        const added = state().items.filter(x => !before.has(x.id)).sort((a, b) => a.time - b.time);
        const now = Date.now();
        added.forEach((it, i) => {
            it.time = now - ms + Math.round(((i + 1) / (added.length + 1)) * ms);
            if (it.kind === 'sms' || it.kind === 'call') it.read = false;
        });
        saveState();
        updateInjection();
        const count = k => added.filter(x => x.kind === k).length;
        ui.skipResult = { label, summary, texts: count('sms'), calls: count('call'), posts: count('post'), money: count('pay'), other: added.length - count('sms') - count('call') - count('post') - count('pay') };
        if (!added.length) toastr.info(`${label.charAt(0).toUpperCase()}${label.slice(1)} later — a quiet stretch, nothing on the phone.`, '⏩ Time skip');
    } catch (e) {
        console.error('[Phone] time skip failed', e);
        toastr.error(String(e?.message ?? e), '⏩ Time skip');
    } finally {
        ui.skipping = null;
        changed();
    }
}

// ------------------------------------------------------------ fill my device

const FILL_STEPS = {
    phone: [
        ['Texts', fillTexts], ['Calls', fillCalls], ['Photos', fillPhotos], ['Notes', fillNotes],
        ['X', () => peekApp(userName(), 'x')], ['Instagram', () => peekApp(userName(), 'instagram')], ['Reddit', () => peekApp(userName(), 'reddit')],
        ['Music', () => peekApp(userName(), 'music')], ['Browser', () => peekApp(userName(), 'browser')],
    ],
    pc: [
        ['Mail', () => loadInbox()], ['Games', () => loadGames()], ['Documents', fillNotes], ['Browser', () => peekApp(userName(), 'browser')],
        ['Music', () => peekApp(userName(), 'music')], ['X', () => peekApp(userName(), 'x')], ['Reddit', () => peekApp(userName(), 'reddit')],
    ],
};

const GEN = { source: 'gen', status: 'sent', read: true, anchor: null };

function isMe(from) {
    return /^(me|myself|i)$/i.test(from) || isUser(from);
}

async function fillTexts() {
    const main = chatCharacters();
    const data = await runJson('devTexts', {
        name: userName(), count: '4-6', more: '',
        people: `people from ${userName()}'s own life — NOT ${main.join(' or ') || 'the main characters'} (those conversations already exist)`,
    }, { busyKey: 'fill:texts' });
    if (!data) return;
    const st = state();
    arr(data.threads).forEach((t, ti) => {
        const contact = str(t.contact);
        if (!contact || isUser(contact) || main.some(n => sameName(n, contact))) return;
        const members = (Array.isArray(t.members) ? t.members : []).map(m => str(m)).filter(m => m && !isUser(m));
        const group = members.length > 1;
        if (group) ensureGroup(contact, members);
        const msgs = arr(t.messages).filter(m => str(m.text) || str(m.image));
        const end = Date.now() - ti * 3 * H;
        msgs.forEach((m, i) => {
            const mine = isMe(str(m.from));
            st.items.push({
                id: nextId(st), ...GEN, kind: 'sms', app: 'messages', contact, dir: mine ? 'out' : 'in',
                from: mine ? userName() : (str(m.from) || contact), text: str(m.text), image: str(m.image),
                time: end - (msgs.length - i) * 6 * 60e3, ...(group ? { group: true } : {}),
            });
        });
        if (!group && !st.contacts.some(n => sameName(n, contact))) st.contacts.push(contact);
    });
}

async function fillCalls() {
    const data = await runJson('devCalls', { name: userName() }, { busyKey: 'fill:calls' });
    if (!data) return;
    const st = state();
    arr(data.calls).forEach((c, i) => {
        const contact = str(c.contact);
        if (!contact || isUser(contact)) return;
        st.items.push({
            id: nextId(st), ...GEN, kind: 'call', contact, dir: /out/i.test(str(c.dir)) ? 'out' : 'in',
            status: /miss/i.test(str(c.status)) ? 'missed' : /declin/i.test(str(c.status)) ? 'declined' : 'answered',
            duration: str(c.duration), text: str(c.voicemail), time: Date.now() - parseAgo(c.ago, i),
        });
    });
}

async function fillNotes() {
    const data = await runJson('devNotes', { name: userName(), more: '' }, { busyKey: 'fill:notes' });
    if (!data) return;
    const st = state();
    arr(data.notes).filter(n => str(n.body) || str(n.title)).forEach((n, i) => {
        st.notes.push({ id: nextId(st), title: str(n.title), body: str(n.body), updated: Date.now() - parseAgo(n.ago, i) });
    });
}

async function fillPhotos() {
    const data = await runJson('devPhotos', { name: userName(), more: '' }, { busyKey: 'fill:photos' });
    if (!data) return;
    const st = state();
    arr(data.photos).filter(p => str(p.image)).forEach((p, i) => {
        st.items.push({ id: nextId(st), ...GEN, kind: 'photo', from: userName(), image: str(p.image), album: str(p.album), time: Date.now() - parseAgo(p.ago, i) });
    });
}

/** Generates {{user}}'s whole phone (or PC) from their persona and the story. */
export async function fillDevice(kind = settings().mode === 'pc' ? 'pc' : 'phone') {
    if (ui.filling) return;
    const steps = FILL_STEPS[kind];
    ui.filling = { kind, step: 0, total: steps.length, label: steps[0][0] };
    changed();
    try {
        for (let i = 0; i < steps.length; i++) {
            ui.filling = { kind, step: i, total: steps.length, label: steps[i][0] };
            changed();
            try {
                await steps[i][1]();
            } catch (e) {
                console.warn(`[Phone] filling ${steps[i][0]} failed`, e);
            }
            saveState();
        }
        updateInjection();
        toastr.success(`Your ${kind === 'pc' ? 'PC' : 'phone'} is all set up.`, kind === 'pc' ? '🖥️ PC' : '📱 Phone');
    } finally {
        ui.filling = null;
        changed();
    }
}

/** Progress / button for filling the device (also used in Settings). */
export function fillCard() {
    const pc = settings().mode === 'pc';
    const f = ui.filling;
    if (f) {
        return `<div class="stp-card stp-fill-card stp-busy">
            <div class="stp-row-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Setting up your ${f.kind === 'pc' ? 'PC' : 'phone'}…</div>
            <div class="stp-progress"><span style="width:${Math.round(((f.step + 0.5) / f.total) * 100)}%"></span></div>
            <div class="stp-muted stp-small">${esc(f.label)} · ${f.step + 1} of ${f.total}</div>
        </div>`;
    }
    return `<div class="stp-card stp-fill-card">
        <div class="stp-row-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Fill my ${pc ? 'PC' : 'phone'}</div>
        <div class="stp-muted stp-small">${pc ? 'Your inbox, games, documents, browsing history, music and posts' : 'Texts with people in your life, calls, photos, notes, posts, music and browsing history'} — all generated from ${esc(userName())}'s persona and the story. It takes a few requests.</div>
        ${button(`Fill my ${pc ? 'PC' : 'phone'}`, 'fill-device', { icon: 'fa-solid fa-wand-magic-sparkles', small: true })}
    </div>`;
}

// ---------------------------------------------------------------------- app

function render() {
    const busy = ui.skipping;
    const r = ui.skipResult;
    const result = r ? `<div class="stp-card stp-skip-result">
            <div class="stp-row-title">⏩ ${esc(r.label.charAt(0).toUpperCase() + r.label.slice(1))} later</div>
            ${r.summary ? `<div class="stp-muted">${esc(r.summary)}</div>` : ''}
            <div class="stp-skip-counts">
                ${r.texts ? `<button data-act="open-app" data-app="messages"><b>${r.texts}</b><span>new text${r.texts === 1 ? '' : 's'}</span></button>` : ''}
                ${r.calls ? `<button data-act="open-app" data-app="phone"><b>${r.calls}</b><span>call${r.calls === 1 ? '' : 's'}</span></button>` : ''}
                ${r.posts ? `<button data-act="open-app" data-app="x"><b>${r.posts}</b><span>post${r.posts === 1 ? '' : 's'}</span></button>` : ''}
                ${r.money ? `<button data-act="open-app" data-app="pay"><b>${r.money}</b><span>payment${r.money === 1 ? '' : 's'}</span></button>` : ''}
                ${r.other ? `<div><b>${r.other}</b><span>other</span></div>` : ''}
                ${!r.texts && !r.calls && !r.posts && !r.money && !r.other ? '<div><span>A quiet stretch — nothing new.</span></div>' : ''}
            </div>
        </div>` : '';
    const skips = (state().skips ?? []).slice(-3).reverse();
    return `${header('Time Skip', { large: true })}
        <div class="stp-scroll stp-time" data-scroll="timeskip">
            ${busy ? `<div class="stp-card stp-skip-busy"><div class="stp-skip-clock"><i class="fa-solid fa-forward"></i></div><b>Skipping ${esc(busy)}…</b><span class="stp-muted stp-small">Seeing what happened on your phone meanwhile</span></div>` : result}
            ${sectionLabel('How much time passes?')}
            <div class="stp-skip-grid">${SKIPS.map(s => `<button class="stp-skip-btn" data-act="skip" data-ms="${s.ms}" ${busy ? 'disabled' : ''}>${esc(s.label)}</button>`).join('')}</div>
            <div class="stp-card stp-form">
                ${input('skip:custom', 'Or type it: "3 days", "2 weeks", "until Friday (4 days)"…')}
                ${input('skip:note', 'What happens meanwhile? (optional, e.g. "User is away on a trip")')}
                <button class="stp-row stp-setting-row" data-act="skip-chat-note"><div class="stp-row-main"><div class="stp-row-title">Note it in the chat</div><div class="stp-row-sub">Adds "⏩ A day later." so the story moves on too</div></div><span class="stp-switch ${settings().skipChatNote === false ? '' : 'stp-on'}"><i></i></span></button>
                ${button('Skip ahead', 'skip-custom', { icon: 'fa-solid fa-forward', small: true, attrs: busy ? 'disabled' : '' })}
            </div>
            <div class="stp-muted stp-small stp-pad">Everything already on the device moves back in time, and texts, missed calls, posts and payments from while you were away come in.</div>
            ${sectionLabel('Your device')}
            ${fillCard()}
            ${skips.length ? `${sectionLabel('Recent skips')}<div class="stp-card stp-list-card">${skips.map(s => `<div class="stp-row stp-row-tight"><i class="fa-solid fa-forward stp-muted"></i><span class="stp-grow">${esc(s.label)}</span><span class="stp-row-meta">${esc(new Date(s.at).toLocaleDateString())}</span></div>`).join('')}</div>` : ''}
        </div>`;
}

export const timeApp = {
    id: 'timeskip',
    label: 'Time Skip',
    icon: 'fa-solid fa-forward',
    color: 'linear-gradient(160deg, #a18cd1, #5b42c8)',
    group: 'System',
    render,
    actions: {
        skip: el => timeSkip(Number(el.dataset.ms), { note: draft('skip:note'), chatNote: settings().skipChatNote !== false }),
        'skip-custom': () => {
            const ms = parseDuration(draft('skip:custom'));
            if (!ms) return toastr.info('Try something like "3 days" or "2 weeks".', '⏩ Time skip');
            const note = draft('skip:note');
            clearDrafts('skip:custom', 'skip:note');
            timeSkip(ms, { note, chatNote: settings().skipChatNote !== false });
        },
        'skip-chat-note': () => {
            settings().skipChatNote = settings().skipChatNote === false;
            saveSettings();
            changed();
        },
        'fill-device': () => fillDevice(),
    },
};
