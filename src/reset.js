// Resetting the phone for the current chat: everything, or just what was generated.
import { changed, ctx, META_KEY, saveState, state } from './core.js';
import { updateInjection } from './inject.js';
import { resetUi, ui } from './ui/state.js';

/**
 * @param {'all'|'generated'} scope
 *   all: a brand-new phone for this chat (texts, payments, orders, posts, everything).
 *   generated: keep what really happened (texts, calls, payments, orders, your posts),
 *   clear feeds, peeks, their phones/PCs, servers, channels, inboxes, games…
 */
export function resetPhone(scope = 'all') {
    const c = ctx();
    if (scope === 'all') {
        c.chatMetadata[META_KEY] = {};
    } else {
        const st = state();
        st.items = st.items.filter(it => it.source !== 'gen');
        for (const it of st.items) {
            delete it.thread;
            delete it.comments;
        }
        st.profiles = {};
        st.feeds = {};
        st.news = { articles: [] };
        st.live = { streams: [] };
        st.shop = { query: '', results: [] };
        st.food = { restaurants: [], cart: null };
        st.spark.deck = [];
        st.spark.passed = [];
        st.devices = {};
        st.chord = { servers: [] };
        st.tg = { channels: [], reveals: 0 };
        st.velvet.creators = (st.velvet.creators ?? []).filter(x => x.subscribed).map(x => ({ ...x, posts: [] }));
        st.mail = (st.mail ?? []).filter(m => m.thread);
        delete st.games;
    }
    saveState();
    resetUi();
    Object.assign(ui, { app: 'home', view: null, params: {}, owner: null, ownerMenu: false, startMenu: false, locked: false, viewer: null, revealed: {}, homePage: 0 });
    updateInjection();
    changed();
}

/** Asks first, then resets. */
export async function confirmReset(scope = 'all') {
    const c = ctx();
    const text = scope === 'all'
        ? 'Reset the phone and PC for this chat? Every text, call, payment, order, post, note and generated feed on the device is cleared — a brand-new phone. (The chat itself is not changed.)'
        : 'Clear generated content for this chat? Feeds, peeks, characters\' phones and PCs, servers, channels, inboxes, games and comments are cleared. Your texts, calls, payments, orders, posts and notes stay.';
    const ok = await c.callGenericPopup(text, c.POPUP_TYPE.CONFIRM, '', { okButton: scope === 'all' ? 'Reset everything' : 'Clear generated' });
    if (!ok) return false;
    resetPhone(scope);
    toastr.success(scope === 'all' ? 'The phone is like new.' : 'Generated content cleared.', '📱 Phone');
    return true;
}
