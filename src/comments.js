// Comment threads on X / Instagram / Reddit posts: load comments, reply to the
// post or to a comment, and get answers right away (the poster especially).
import { changed, isUser, nextId, people, saveState, state, userName } from './core.js';
import { runJson } from './gen.js';
import { updateInjection } from './inject.js';
import { notify } from './notify.js';
import { APP_NAMES } from './parse.js';
import { navigate } from './ui/state.js';
import { arr, sameName, str, toNum } from './util.js';

/** A post's comment thread (older Instagram comments are folded in). */
export function threadOf(post) {
    if (!post.thread) {
        post.thread = (post.comments ?? []).map((c, i) => ({
            id: `${post.id}-c${i}`, author: str(c.user).replace(/^@/, '') || 'someone', handle: str(c.user), text: str(c.text),
            time: post.time + (i + 1) * 60e3, likes: 0,
        }));
    }
    return post.thread;
}

export function commentCount(post) {
    const n = post.thread?.length ?? post.comments?.length ?? 0;
    if (post.app === 'reddit') return Math.max(Number(post.commentCount) || 0, n);
    if (post.app === 'x') return Math.max(Number(post.replies) || 0, n);
    return n;
}

function describeThread(post) {
    const list = threadOf(post).slice(-20);
    if (!list.length) return '(no comments yet)';
    return list.map(c => {
        const to = c.replyTo ? threadOf(post).find(x => x.id === c.replyTo) : null;
        return `- ${c.author}${to ? ` (replying to ${to.author})` : ''}: ${c.text}`;
    }).join('\n');
}

/**
 * Generates comments. With `mine` set, people respond to what {{user}} just wrote.
 * @param {object} post
 * @param {object} [mine] {{user}}'s new comment
 */
export async function generateComments(post, mine = null) {
    const user = userName();
    const author = isUser(post.from) ? user : post.from;
    const target = mine?.replyTo ? threadOf(post).find(c => c.id === mine.replyTo) : null;
    const task = mine
        ? `${user} just commented${target ? ` (replying to ${target.author}: "${target.text}")` : ''}: "${mine.text}"\n\nWrite 1-4 new comments reacting to it, in character. ${isUser(post.from) ? 'People may reply to ' + user + ' or chime in.' : `${author} (who posted this) will most likely reply to ${user}${target && !sameName(target.author, author) ? `, and ${target.author} may answer too` : ''}; others may chime in.`} Set "replyTo" to the name of the person each comment answers.`
        : `Write 6-10 comments people left on this post: varied (funny, supportive, flirty, rude, questions), with a few replies between commenters${isUser(post.from) ? '' : ` and maybe a reply from ${author}`}. Set "replyTo" to the name of the person a comment answers, or leave it empty.`;
    const data = await runJson('comments', {
        appName: APP_NAMES[post.app] ?? post.app,
        author,
        post: [post.title, post.text, post.image ? `[photo: ${post.image}]` : ''].filter(Boolean).join(' — ') || '(photo)',
        thread: describeThread(post),
        task,
        people: people().join(', ') || '(none)',
    }, { busyKey: `comments:${post.id}`, asCharacter: isUser(post.from) ? null : post.from });
    if (!data) return;

    const st = state();
    const thread = threadOf(post);
    const known = people();
    const added = [];
    let t = Math.max(Date.now(), ...thread.map(c => c.time + 1));
    for (const c of arr(data.comments)) {
        const text = str(c.text);
        if (!text) continue;
        const rawAuthor = str(c.author) || str(c.handle).replace(/^@|^u\//, '') || 'someone';
        if (isUser(rawAuthor)) continue;
        const match = known.find(n => sameName(n, rawAuthor)) ?? (sameName(rawAuthor, author) ? author : null);
        const replyName = str(c.replyTo);
        // Replies attach to the latest comment by that person (or to yours).
        const replyTarget = replyName
            ? [...thread, ...added].reverse().find(x => sameName(x.author, replyName) || (isUser(replyName) && x.mine))
            : (mine && !thread.some(x => x.replyTo === mine.id) ? mine : null);
        const comment = {
            id: nextId(st), author: match ?? rawAuthor, handle: str(c.handle), text, time: t++,
            likes: toNum(c.likes), known: !!match, ...(replyTarget ? { replyTo: replyTarget.id } : {}),
        };
        added.push(comment);
    }
    thread.push(...added);
    saveState();
    updateInjection();
    changed();

    // Let {{user}} know when someone answers them.
    const answer = added.find(c => c.replyTo && thread.find(x => x.id === c.replyTo)?.mine);
    if (answer) {
        notify({
            app: post.app, icon: 'fa-solid fa-reply', title: answer.author,
            text: `replied to your comment: ${answer.text}`,
            go: () => navigate(post.app, 'post', { id: post.id }),
        });
    }
}

/** {{user}} comments on a post (optionally replying to a comment) and people respond. */
export async function addComment(post, text, replyTo = null) {
    const st = state();
    const mine = { id: nextId(st), author: userName(), text, time: Date.now(), mine: true, likes: 0, ...(replyTo ? { replyTo } : {}) };
    threadOf(post).push(mine);
    saveState();
    changed();
    await generateComments(post, mine);
}

/** Recent comment exchanges involving {{user}} or story characters, for the prompt. */
export function commentContext(posts, limit = 8) {
    const lines = [];
    const user = userName();
    for (const p of posts) {
        if (!p.thread?.length) continue;
        const owner = isUser(p.from) ? `${user}'s` : `${p.from}'s`;
        const short = String(p.title || p.text || p.image || '').replace(/\s+/g, ' ').slice(0, 60);
        for (const c of p.thread) {
            if (!c.mine && !c.known) continue;
            const to = c.replyTo ? p.thread.find(x => x.id === c.replyTo) : null;
            lines.push({ time: c.time, text: `On ${owner} ${APP_NAMES[p.app]} post "${short}": ${c.mine ? user : c.author}${to ? ` replied to ${to.mine ? user : to.author}` : ' commented'}: "${c.text}"` });
        }
    }
    return lines.sort((a, b) => a.time - b.time).slice(-limit).map(l => l.text);
}
