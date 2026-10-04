/*
 * Phone & PC — a SillyTavern extension.
 *
 * Gives {{user}} an in-story phone (or PC): texts, calls, social media, money,
 * shopping, food delivery, dating and more. Characters use the phone through tags in
 * their replies; whatever {{user}} does on the device is delivered with the next chat
 * message and injected into the prompt. See README.md.
 */
import { init } from './src/main.js';

jQuery(() => {
    init().catch(e => console.error('[Phone] failed to initialise', e));
});
