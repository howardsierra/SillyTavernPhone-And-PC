// Deleting posts. Your own deleted posts are remembered for a while: people may
// have seen them before they came down, and the story can pick up on that.
import { changed, ctx, isUser, saveState, state, userName } from './core.js';
import { updateInjection } from './inject.js';
import { APP_NAMES } from './parse.js';
import { ui } from './ui/state.js';
import { esc } from './util.js';

/** A small trash button for a post card. */
export function deleteButton(it, act = 'post-delete') {
    const mine = isUser(it.from) || it.mine;
    return `<button class="stp-post-del" data-act="${act}" data-id="${esc(it.id)}" title="${mine ? 'Delete post' : 'Remove from your feed'}" aria-label="${mine ? 'Delete post' : 'Remove from your feed'}"><i class="fa-regular fa-trash-can"></i></button>`;
}

/** Asks before deleting (own, already-posted posts) and returns whether to go ahead. */
export async function confirmDelete(it) {
    const mine = isUser(it.from) || it.mine;
    if (!mine || it.status === 'pending') return true;
    const c = ctx();
    return !!await c.callGenericPopup('Delete this post? People who already saw it might remember it.', c.POPUP_TYPE.CONFIRM, '', { okButton: 'Delete' });
}

/** Remembers that {{user}} took a post down (for the prompt). */
export function rememberDeleted(app, text) {
    const st = state();
    st.deletedPosts = [...(st.deletedPosts ?? []), { app, text: String(text ?? '').slice(0, 160), atLen: (ctx().chat ?? []).length }].slice(-5);
}

/** Deletes a post item (X, Instagram, Reddit, Rated). */
export async function deletePostItem(id) {
    const st = state();
    const it = st.items.find(x => x.id === id);
    if (!it) return;
    if (!await confirmDelete(it)) return;
    st.items = st.items.filter(x => x !== it);
    if (isUser(it.from) && it.status !== 'pending') rememberDeleted(it.app, it.title || it.text || it.image);
    if (ui.view === 'post' && ui.params.id === id) {
        ui.view = null;
        ui.params = ui.params.back ?? {};
    }
    saveState();
    updateInjection();
    changed();
    toastr.success(isUser(it.from) ? 'Post deleted.' : 'Removed from your feed.', APP_NAMES[it.app] ?? 'Phone', { timeOut: 2000 });
}

/** Recently deleted posts of {{user}}'s, while they're still fresh. */
export function deletedContext() {
    const len = (ctx().chat ?? []).length;
    return (state().deletedPosts ?? []).filter(d => len - d.atLen < 20)
        .map(d => `${userName()} deleted their ${APP_NAMES[d.app] ?? d.app} post "${d.text}" (it was up for a while — people may have seen it).`);
}
