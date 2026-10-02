// Builds the phone context that is injected into every prompt.
import { PROMPT_KEY, ctx, hasChat, isChatCharacter, isJustSent, isUser, liveItems, money, promptText, settings, state, sub, userName } from './core.js';
import { isDelivered, orderStepLabel, ratedStats, requestStatus } from './derived.js';
import { isQuietGenerating } from './gen.js';
import { APP_NAMES } from './parse.js';
import { sameName } from './util.js';

function byTime(a, b) {
    return a.time - b.time;
}

export function updateInjection() {
    const c = ctx();
    const s = settings();
    if (!s.enabled || !hasChat()) {
        c.setExtensionPrompt(PROMPT_KEY, '', 1, Number(s.depth) || 0);
        return;
    }

    const user = userName();
    const items = liveItems().filter(x => x.status === 'sent');
    const parts = [];
    const quiet = isQuietGenerating();

    if (s.injectInstructions && !quiet) {
        const text = promptText('instructions');
        if (text.trim()) parts.push(sub(text));
        if (s.adultApps) {
            const adult = promptText('instructionsAdult');
            if (adult.trim()) parts.push(sub(adult));
        }
    }

    if (s.injectTexts) {
        const texts = items.filter(x => x.kind === 'sms').sort(byTime).slice(-Math.max(1, Number(s.maxTexts) || 15));
        if (texts.length) {
            const lines = texts.map(t => {
                let suffix = '';
                if (t.dir === 'in') suffix = t.read ? ' (read)' : ' (unread)';
                if (t.dir === 'out' && isJustSent(t)) suffix = ' (just sent)';
                const to = t.dir === 'out' ? t.contact : user;
                const where = t.app === 'spark' ? ' [on the Spark dating app]' : '';
                const body = [t.image ? `[sends a photo: ${t.image}]` : '', t.text].filter(Boolean).join(' ');
                return `${t.from} → ${to}${where}: ${body}${suffix}`;
            });
            parts.push(`[${user}'s phone — text messages, oldest to newest]\n${lines.join('\n')}`);
        }

        const calls = items.filter(x => x.kind === 'call').sort(byTime).slice(-4);
        if (calls.length) {
            const lines = calls.map(t => {
                if (t.dir === 'out') return `${user} called ${t.contact}${isJustSent(t) ? ' (calling right now — the phone is ringing)' : ''}`;
                const vm = t.text ? ` and left a voicemail: "${t.text}"` : '';
                return `${t.from} called ${user} (${t.status})${vm}`;
            });
            parts.push(`[Recent phone calls]\n${lines.join('\n')}`);
        }
    }

    if (s.injectMoney) {
        const pays = items.filter(x => x.kind === 'pay' && (isUser(x.from) || isUser(x.to))).sort(byTime).slice(-6);
        if (pays.length) {
            const lines = pays.map(p => {
                const note = p.note ? ` for "${p.note}"` : '';
                const fresh = isJustSent(p) ? ' (just now)' : '';
                if (p.payType === 'request') return `${p.from} requested ${money(p.amount)} from ${p.to}${note} — ${requestStatus(p)}${fresh}`;
                if (p.payType === 'decline') return `${user} declined ${p.to}'s money request${fresh}`;
                return `${p.from} sent ${p.to} ${money(p.amount)}${note}${fresh}`;
            });
            parts.push(`[Pocket (money app) — recent payments]\n${lines.join('\n')}`);
        }
    }

    if (s.injectOrders) {
        const orders = items.filter(x => x.kind === 'order' && x.source !== 'gen' && (isUser(x.from) || isUser(x.recipient)))
            .sort(byTime).slice(-5)
            .filter(o => !isDelivered(o) || (ctx().chat.length - (o.sentAtLen ?? 0)) < 14);
        if (orders.length) {
            const lines = orders.map(o => {
                const forWhom = sameName(o.recipient, o.from) ? '' : ` for ${o.recipient}`;
                const where = o.store ? ` from ${o.store}` : '';
                const note = o.note ? ` (gift note: "${o.note}")` : '';
                const status = isDelivered(o) ? `DELIVERED — it has arrived at ${isUser(o.recipient) ? `${user}'s` : `${o.recipient}'s`} door` : orderStepLabel(o);
                return `${o.from} ordered ${o.item}${where}${forWhom} (${money(o.price)})${note} — ${status}`;
            });
            parts.push(`[Online orders]\n${lines.join('\n')}`);
        }
    }

    if (s.injectPosts) {
        const posts = items.filter(x => x.kind === 'post' && x.app !== 'rated' && !x.stranger).sort(byTime).slice(-Math.max(1, Number(s.maxPosts) || 4));
        if (posts.length) {
            const lines = posts.map(p => {
                const where = p.app === 'reddit' ? `Reddit${p.sub ? ` ${p.sub}` : ''}` : APP_NAMES[p.app];
                const what = p.postType === 'comment' ? 'commented' : 'posted';
                const title = p.title ? `"${p.title}" — ` : '';
                const img = p.image ? ` [photo: ${p.image}]` : '';
                return `${p.from} ${what} on ${where}: ${title}${p.text}${img}`;
            });
            parts.push(`[Recent public social media posts]\n${lines.join('\n')}`);
        }
    }

    // Spark: matches with people in the story and {{user}}'s likes.
    const st = state();
    const sparkLines = [];
    for (const name of st.spark.liked ?? []) {
        if (isChatCharacter(name)) sparkLines.push(`${user} swiped right on ${name}'s Spark dating profile.`);
    }
    for (const m of st.spark.matches.slice(-4)) sparkLines.push(`${user} matched with ${m.name} on Spark.`);
    if (sparkLines.length) parts.push(`[Spark (dating app)]\n${sparkLines.join('\n')}`);

    if (s.adultApps) {
        const rated = items.filter(x => x.kind === 'post' && x.app === 'rated' && x.source !== 'gen').sort(byTime).slice(-3);
        const ratedGen = items.filter(x => x.kind === 'post' && x.app === 'rated' && x.source === 'gen' && x.secretlyBy && x.myRating);
        const lines = [];
        for (const p of rated) {
            const stats = ratedStats(p);
            const who = isUser(p.from) ? user : p.from;
            const mine = p.myRating && !isUser(p.from) ? ` One of the ratings, ${p.myRating}/10, came anonymously from ${user}.` : '';
            lines.push(`${who} anonymously posted on Rated: [photo: ${p.image}] "${p.text}" — currently ${stats.rating}/10 from ${stats.votes} votes.${mine}`);
        }
        for (const p of ratedGen) lines.push(`${user} anonymously rated a Rated post ${p.myRating}/10 — the post is secretly ${p.secretlyBy}'s (${user} may not know that).`);
        if (lines.length) parts.push(`[Rated (anonymous 18+ rating app) — only the poster knows a post is theirs]\n${lines.join('\n')}`);
    }

    if (s.injectSearches) {
        const searches = items.filter(x => x.kind === 'search').sort(byTime).slice(-8);
        if (searches.length) {
            parts.push(`[Private web searches — only the searcher knows about these]\n${searches.map(x => `${x.from} searched: ${x.text}`).join('\n')}`);
        }
    }

    // Phone-only roleplay: goes last so it sits closest to the reply.
    if (state().phoneOnly && !quiet) {
        const only = promptText('phoneOnly');
        if (only.trim()) parts.push(sub(only));
    }

    c.setExtensionPrompt(PROMPT_KEY, parts.join('\n\n'), 1, Number(s.depth) || 0, false, Number(s.role) || 0);
}
