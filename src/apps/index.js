import { settings } from '../core.js';
import { ui } from '../ui/state.js';
import { browserApp, musicApp } from './browser.js';
import channels from './channels.js';
import chord from './chord.js';
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
import velvet from './velvet.js';

export const ALL_APPS = [phone, messages, browserApp, musicApp, xApp, instagramApp, redditApp, chord, channels, liveApp, spark, pay, shop, food, newsApp, calendarApp, locateApp, photosApp, notesApp, settingsApp, rated, velvet];

export const DOCK = ['phone', 'messages', 'browser', 'music'];

export const EXTRA_ACTIONS = { ...socialActions, ...theirActions };

const byId = list => id => list.find(a => a.id === id);

/** A character's device: their own versions of the personal apps, plus the peekable ones. */
function theirApps() {
    const theirs = byId(THEIR_APPS);
    return [theirs('messages'), theirs('phone'), browserApp, musicApp, xApp, instagramApp, redditApp, theirs('photos'), theirs('notes'), theirs('pay'), theirs('spark'), settingsApp];
}

/** {{user}}'s own apps (badges count these even while looking at someone else's phone). */
export function userApps() {
    const adult = settings().adultApps;
    return ALL_APPS.filter(a => !a.adult || adult);
}

export function visibleApps() {
    return ui.owner ? theirApps() : userApps();
}

export function appById(id) {
    return visibleApps().find(a => a.id === id) ?? null;
}

export function allActions() {
    const map = { ...EXTRA_ACTIONS };
    for (const app of [...ALL_APPS, ...THEIR_APPS]) Object.assign(map, app.actions ?? {});
    return map;
}
