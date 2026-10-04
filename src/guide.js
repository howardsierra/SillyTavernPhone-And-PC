// Steering what the phone / PC generates: facts that stay true for the chat
// ("User and Seraphina are in a committed relationship"), and a one-off nudge
// for the next thing generated ("make the feed about last night's party").
import { changed, saveState, settings, state, sub } from './core.js';
import { updateInjection } from './inject.js';
import { ui } from './ui/state.js';
import { esc } from './util.js';

function guide() {
    const st = state();
    st.guide ??= { facts: [], next: '', toStory: false };
    st.guide.facts ??= [];
    return st.guide;
}

export function facts() {
    return guide().facts;
}

export function nextGuide() {
    return guide().next || '';
}

export function hasGuidance() {
    return facts().length > 0 || !!nextGuide();
}

export function addFact(text) {
    const t = String(text ?? '').trim();
    if (!t) return;
    const g = guide();
    if (!g.facts.some(f => f.toLowerCase() === t.toLowerCase())) g.facts.push(t);
    saveState();
    updateInjection();
    changed();
}

export function removeFact(i) {
    guide().facts.splice(i, 1);
    saveState();
    updateInjection();
    changed();
}

export function setNextGuide(text) {
    guide().next = String(text ?? '').trim();
    saveState();
    changed();
}

// Batches (Snoop, Fill my phone, a time skip) keep the one-off nudge for all their requests.
let hold = 0;
let usedWhileHeld = false;

export async function withGuide(fn) {
    hold++;
    try {
        return await fn();
    } finally {
        hold--;
        if (!hold && usedWhileHeld) {
            usedWhileHeld = false;
            setNextGuide('');
        }
    }
}

/**
 * The steering block for a phone request (appended to every prompt). Uses up the
 * one-off nudge unless a batch is holding it.
 */
export function guidanceFor() {
    const g = guide();
    const parts = [];
    if (g.facts.length) {
        parts.push(`[The user has established these facts for the story — they are true now and override anything older in the chat or the cards. Everything you write must be consistent with them:\n${g.facts.map(f => `- ${f}`).join('\n')}]`);
    }
    if (g.next) {
        parts.push(`[The user's direction for this request — follow it: ${g.next}]`);
        if (hold) usedWhileHeld = true;
        else {
            g.next = '';
            saveState();
            changed();
        }
    }
    return parts.length ? sub(parts.join('\n')) : '';
}

/** Facts for the main story prompt, if the user wants them there too. */
export function storyFacts() {
    const g = guide();
    return g.toStory && g.facts.length ? `[Established facts]\n${g.facts.map(f => `- ${f}`).join('\n')}` : '';
}

// ----------------------------------------------------------------- the sheet

const EXAMPLES = ['{{user}} and {{char}} are in a committed relationship', 'It\'s the middle of winter', 'Keep everything wholesome', '{{char}} is mad at {{user}} right now', 'More drama and gossip'];

export function guideButton(cls = 'stp-guide-btn') {
    const on = hasGuidance();
    return `<button class="${cls} ${on ? 'stp-on' : ''} ${nextGuide() ? 'stp-pending' : ''}" data-act="guide-open" title="Steer what the ${settings().mode === 'pc' ? 'PC' : 'phone'} generates${on ? ` (${facts().length} fact${facts().length === 1 ? '' : 's'}${nextGuide() ? ', a direction for the next thing' : ''})` : ''}"><i class="fa-solid fa-wand-magic-sparkles"></i></button>`;
}

export function guideSheet() {
    if (!ui.guideSheet) return '';
    const g = guide();
    const device = settings().mode === 'pc' ? 'PC' : 'phone';
    return `<div class="stp-sheet-backdrop" data-act="guide-close"></div>
        <div class="stp-sheet stp-guide-sheet">
            <div class="stp-sheet-grip"></div>
            <div class="stp-sheet-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Steer the ${device}</div>
            <div class="stp-guide-section">Always true in this chat</div>
            <div class="stp-muted stp-small">Everything the ${device} generates follows these: feeds, peeks, replies, comments, time skips, their phones…</div>
            <div class="stp-guide-facts">${g.facts.map((f, i) => `<div class="stp-guide-fact"><i class="fa-solid fa-thumbtack"></i><span>${esc(f)}</span><button data-act="guide-remove" data-i="${i}" title="Remove"><i class="fa-solid fa-xmark"></i></button></div>`).join('') || '<div class="stp-muted stp-small stp-guide-none">No facts yet.</div>'}</div>
            <div class="stp-guide-add">
                <input class="stp-input" data-draft="guide:fact" data-enter="guide-add" placeholder="e.g. User and Seraphina are in a committed relationship" value="${esc(ui.drafts['guide:fact'] ?? '')}">
                <button class="stp-btn stp-btn-primary stp-btn-sm" data-act="guide-add"><i class="fa-solid fa-plus"></i></button>
            </div>
            <div class="stp-chips stp-guide-examples">${EXAMPLES.map(e => `<button class="stp-chip" data-act="guide-example" data-text="${esc(sub(e))}"><span>${esc(sub(e))}</span></button>`).join('')}</div>
            <button class="stp-row stp-setting-row" data-act="guide-to-story"><div class="stp-row-main"><div class="stp-row-title">Tell the story too</div><div class="stp-row-sub">Also add these facts to the main chat's prompt</div></div><span class="stp-switch ${g.toStory ? 'stp-on' : ''}"><i></i></span></button>
            <div class="stp-guide-section">Just for the next thing</div>
            <div class="stp-muted stp-small">A one-off direction for whatever the ${device} generates next (a feed, a reply, a peek, a time skip…), then it's cleared.</div>
            <div class="stp-guide-add">
                <input class="stp-input" data-draft="guide:next" data-enter="guide-next" placeholder="e.g. make the feed about last night's party" value="${esc(ui.drafts['guide:next'] ?? g.next ?? '')}">
                <button class="stp-btn stp-btn-primary stp-btn-sm" data-act="guide-next">${g.next ? 'Update' : 'Set'}</button>
            </div>
            ${g.next ? `<div class="stp-guide-pending"><i class="fa-solid fa-hourglass-half"></i> Waiting for the next generation: <b>${esc(g.next)}</b> <button class="stp-link-btn" data-act="guide-next-clear">clear</button></div>` : ''}
        </div>`;
}

export const guideActions = {
    'guide-open': () => {
        ui.guideSheet = true;
        ui.ownerMenu = false;
        ui.startMenu = false;
        changed();
    },
    'guide-close': () => {
        ui.guideSheet = false;
        changed();
    },
    'guide-add': () => {
        addFact(ui.drafts['guide:fact']);
        delete ui.drafts['guide:fact'];
        changed();
    },
    'guide-example': el => {
        ui.drafts['guide:fact'] = el.dataset.text;
        changed();
    },
    'guide-remove': el => removeFact(Number(el.dataset.i)),
    'guide-to-story': () => {
        guide().toStory = !guide().toStory;
        saveState();
        updateInjection();
        changed();
    },
    'guide-next': () => {
        setNextGuide(ui.drafts['guide:next']);
        delete ui.drafts['guide:next'];
        if (nextGuide()) toastr.info('The next thing the device generates will follow it.', '✨ Direction set', { timeOut: 2500 });
    },
    'guide-next-clear': () => {
        delete ui.drafts['guide:next'];
        setNextGuide('');
    },
};
