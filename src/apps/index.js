import { settings } from '../core.js';
import { browserApp, musicApp } from './browser.js';
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

export const ALL_APPS = [phone, messages, browserApp, musicApp, xApp, instagramApp, redditApp, liveApp, spark, pay, shop, food, newsApp, calendarApp, locateApp, photosApp, notesApp, settingsApp, rated];

export const DOCK = ['phone', 'messages', 'browser', 'music'];

export const EXTRA_ACTIONS = { ...socialActions };

export function visibleApps() {
    const adult = settings().adultApps;
    return ALL_APPS.filter(a => !a.adult || adult);
}

export function appById(id) {
    return visibleApps().find(a => a.id === id) ?? null;
}

export function allActions() {
    const map = { ...EXTRA_ACTIONS };
    for (const app of ALL_APPS) Object.assign(map, app.actions ?? {});
    return map;
}
