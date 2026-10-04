import { settings } from '../core.js';
import { ui } from '../ui/state.js';
import { browserApp, musicApp } from './browser.js';
import channels from './channels.js';
import chord from './chord.js';
import { filesApp, gamesApp, mailApp } from './desktop.js';
import food from './food.js';
import { calendarApp, liveApp, newsApp } from './extras.js';
import { locateApp, notesApp, photosApp } from './life.js';
import messages from './messages.js';
import pay from './pay.js';
import phone from './phone.js';
import rated from './rated.js';
import settingsApp from './settings-app.js';
import shop from './shop.js';
import { instagramApp, redditApp, socialActions, xApp } from './social.js';
import spark from './spark.js';
import { THEIR_APPS, theirActions } from './theirs.js';
import { timeApp } from './time.js';
import { guideActions } from '../guide.js';
import velvet from './velvet.js';

export const ALL_APPS = [phone, messages, browserApp, musicApp, xApp, instagramApp, redditApp, chord, channels, liveApp, spark, pay, shop, food, newsApp, calendarApp, locateApp, photosApp, notesApp, settingsApp, rated, velvet, mailApp, filesApp, gamesApp, timeApp];

/** PC-only apps never show up on the phone. */
const PC_ONLY = new Set(['mail', 'files', 'games']);

export const DOCK = ['phone', 'messages', 'browser', 'music'];

/** The PC's own apps, in start-menu order (websites open in the browser instead). */
const PC_APPS = ['browser', 'mail', 'files', 'messages', 'chord', 'channels', 'games', 'music', 'calendar', 'notes', 'timeskip', 'settings'];

/** Pinned to the PC's taskbar. */
export const TASKBAR = ['browser', 'mail', 'files', 'messages', 'chord', 'games', 'music'];

/** On the PC these are websites: they open as tabs in the browser. */
export const SITES = ['x', 'reddit', 'instagram', 'news', 'shop', 'live', 'velvet'];

export const EXTRA_ACTIONS = { ...socialActions, ...theirActions, ...guideActions };

const byId = list => id => list.find(a => a.id === id);

function isPc() {
    return settings().mode === 'pc';
}

function allowed(a) {
    return a && (!a.adult || settings().adultApps);
}

/** A character's device: their own versions of the personal apps, plus the peekable ones. */
function theirApps() {
    const theirs = byId(THEIR_APPS);
    const all = byId(ALL_APPS);
    if (isPc()) return ['browser', 'mail', 'files', 'messages', 'games', 'music', 'notes', 'settings'].map(id => theirs(id) ?? all(id)).filter(Boolean);
    return [theirs('messages'), theirs('phone'), browserApp, musicApp, xApp, instagramApp, redditApp, theirs('photos'), theirs('notes'), theirs('pay'), theirs('spark'), settingsApp];
}

/** Websites the PC's browser can open (on their PC: their own profiles). */
export function siteApps() {
    const all = byId(ALL_APPS);
    const ids = ui.owner ? ['x', 'instagram', 'reddit'] : SITES;
    return ids.map(all).filter(allowed);
}

/** {{user}}'s own apps on this device (badges count these even while looking at someone else's). */
export function userApps() {
    if (isPc()) return PC_APPS.map(byId(ALL_APPS)).filter(allowed);
    return ALL_APPS.filter(a => allowed(a) && !PC_ONLY.has(a.id));
}

/** Apps on the home screen / desktop. */
export function visibleApps() {
    return ui.owner ? theirApps() : userApps();
}

/** An app or (on the PC) a website that can be shown right now. */
export function appById(id) {
    return visibleApps().find(a => a.id === id) ?? (isPc() ? siteApps().find(a => a.id === id) : null) ?? null;
}

/** Is this a website shown inside the PC browser? */
export function isSite(id) {
    return isPc() && (id === 'browser' || siteApps().some(a => a.id === id));
}

/** Apps that exist only on the other device (for "pick up your phone" hints). */
export function otherDeviceApp(id) {
    const app = ALL_APPS.find(a => a.id === id);
    return app && allowed(app) ? app : null;
}

export function allActions() {
    const map = { ...EXTRA_ACTIONS };
    for (const app of [...ALL_APPS, ...THEIR_APPS]) Object.assign(map, app.actions ?? {});
    return map;
}
