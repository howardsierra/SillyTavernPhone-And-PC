// Values derived from story progress: order tracking, Rated votes, request status.
import { isUser, liveItems, messagesSince, saveState } from './core.js';
import { notify } from './notify.js';
import { navigate } from './ui/state.js';
import { seeded } from './util.js';

export const ORDER_STEPS = {
    food: [
        { label: 'Order placed', at: 0, icon: 'fa-solid fa-receipt' },
        { label: 'Preparing', at: 1, icon: 'fa-solid fa-fire-burner' },
        { label: 'On the way', at: 3, icon: 'fa-solid fa-motorcycle' },
        { label: 'Delivered', at: 5, icon: 'fa-solid fa-house-circle-check' },
    ],
    shop: [
        { label: 'Ordered', at: 0, icon: 'fa-solid fa-receipt' },
        { label: 'Shipped', at: 2, icon: 'fa-solid fa-box' },
        { label: 'Out for delivery', at: 6, icon: 'fa-solid fa-truck-fast' },
        { label: 'Delivered', at: 9, icon: 'fa-solid fa-house-circle-check' },
    ],
};

/** -1 while queued, otherwise the index into ORDER_STEPS. */
export function orderStep(it) {
    if (it.source === 'gen') return ORDER_STEPS[it.app === 'food' ? 'food' : 'shop'].length - 1;
    const n = messagesSince(it);
    if (n < 0) return -1;
    const steps = ORDER_STEPS[it.app === 'food' ? 'food' : 'shop'];
    let step = 0;
    steps.forEach((s, i) => {
        if (n >= s.at) step = i;
    });
    return step;
}

export function orderStepLabel(it) {
    const step = orderStep(it);
    if (step < 0) return 'Queued — places with your next reply';
    return ORDER_STEPS[it.app === 'food' ? 'food' : 'shop'][step].label;
}

export function isDelivered(it) {
    return orderStep(it) === ORDER_STEPS[it.app === 'food' ? 'food' : 'shop'].length - 1;
}

/** Notifies when orders involving {{user}} change status. */
export function checkDeliveries() {
    let dirty = false;
    for (const it of liveItems()) {
        if (it.kind !== 'order' || it.source === 'gen' || it.status === 'pending') continue;
        if (!isUser(it.from) && !isUser(it.recipient)) continue;
        const step = orderStep(it);
        if (it.notifiedStep === undefined) {
            it.notifiedStep = step;
            dirty = true;
            continue;
        }
        if (step > it.notifiedStep) {
            it.notifiedStep = step;
            dirty = true;
            const app = it.app === 'food' ? 'food' : 'shop';
            const label = ORDER_STEPS[app][step].label;
            const forWhom = isUser(it.recipient) ? '' : ` for ${it.recipient}`;
            notify({
                app,
                icon: ORDER_STEPS[app][step].icon,
                title: app === 'food' ? 'Munch' : 'Cartly',
                text: `${label}: ${it.item}${forWhom}`,
                go: () => navigate(app, null, { tab: 'orders' }),
            });
        }
    }
    if (dirty) saveState();
}

/** Rated stats: generated posts keep their numbers; live posts gain votes as the story moves on. */
export function ratedStats(it) {
    if (it.source === 'gen') {
        return { rating: Number(it.rating) || 7, votes: Number(it.votes) || 0 };
    }
    const n = messagesSince(it);
    if (n < 0) return { rating: 0, votes: 0 };
    const base = 6.2 + seeded(`${it.id}:r`) * 3.3;
    const rating = it.rating ? Number(it.rating) : Math.round(base * 10) / 10;
    const votes = Math.round(4 + n * (6 + seeded(`${it.id}:v`) * 14) + (it.comments?.length ?? 0));
    return { rating, votes };
}

/** Status of a money request: open, paid or declined. */
export function requestStatus(req, items = liveItems()) {
    const answer = items.find(x => x.kind === 'pay' && x.requestId === req.id);
    if (!answer) return 'open';
    if (answer.payType === 'decline') return answer.status === 'pending' ? 'declining' : 'declined';
    return answer.status === 'pending' ? 'paying' : 'paid';
}
