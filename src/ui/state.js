// UI state shared by the shell and the apps. Rendering subscribes to core changes.
import { changed } from '../core.js';

export const ui = {
    open: false,
    app: 'home',
    view: null,
    params: {},
    drafts: {},
    banner: null,
    viewer: null,
    overlay: null,
    scrollBottom: false,
    lastViewKey: '',
    revealed: {},
    typing: null,
    locked: false,
    homePage: 0,
};

export function navigate(app, view = null, params = {}) {
    ui.open = true;
    ui.locked = false;
    ui.app = app;
    ui.view = view;
    ui.params = params;
    ui.overlay = null;
    if (view === 'thread') ui.scrollBottom = true;
    changed();
}

export function draft(key) {
    return String(ui.drafts[key] ?? '').trim();
}

export function clearDrafts(...keys) {
    for (const k of keys) delete ui.drafts[k];
}

export function resetUi() {
    Object.assign(ui, { app: ui.app === 'home' ? 'home' : ui.app, view: null, params: {}, drafts: {}, banner: null, viewer: null, overlay: null });
}
