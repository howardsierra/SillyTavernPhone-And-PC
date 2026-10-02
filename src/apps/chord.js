// Chord — Discord-style servers with channels. Story characters can be members and
// answer when {{user}} talks; the exchanges are remembered in the prompt.
import { changed, isUser, nextId, people, saveState, state, userName } from '../core.js';
import { isBusy, runJson } from '../gen.js';
import { updateInjection } from '../inject.js';
import { avatar, button, empty, header, iconBtn, shimmerCards } from '../ui/kit.js';
import { clearDrafts, draft, navigate, ui } from '../ui/state.js';
import { arr, clock, esc, fmt, hueFor, sameName, str } from '../util.js';

function chord() {
    const st = state();
    st.chord ??= { servers: [] };
    return st.chord;
}

function serverById(id) {
    return chord().servers.find(s => s.id === id) ?? null;
}

async function findServers() {
    const st = state();
    const data = await runJson('servers', { people: people().join(', ') || '(none)' }, { busyKey: 'chord' });
    if (!data) return;
    const known = people();
    const fresh = arr(data.servers).map(s => ({
        id: nextId(st),
        name: str(s.name),
        icon: str(s.icon).slice(0, 4) || '💬',
        description: str(s.description),
        members: (Array.isArray(s.members) ? s.members : []).map(m => known.find(n => sameName(n, str(m))) ?? str(m)).filter(Boolean).filter(m => !isUser(m)),
        channels: arr(s.channels).map(c => ({ id: nextId(st), name: str(c.name).replace(/^#/, '').toLowerCase().replace(/\s+/g, '-') || 'general', topic: str(c.topic), messages: [] })),
    })).filter(s => s.name && s.channels.length);
    chord().servers.push(...fresh);
    if (fresh[0]) ui.params.server = fresh[0].id;
    saveState();
    changed();
}

function describe(channel, limit = 20) {
    const list = channel.messages.slice(-limit);
    if (!list.length) return '(no messages yet)';
    return list.map(m => `${m.mine ? userName() : m.author}: ${m.text}`).join('\n');
}

/** Generate chatter; with `mine`, members respond to what {{user}} just wrote. */
async function chat(server, channel, mine = null) {
    const st = state();
    const task = mine
        ? `${userName()} just wrote: "${mine.text}". Write 1-5 replies reacting to it — the members who'd care answer; people from the story stay in character.`
        : 'Write the next 8-14 messages of conversation in this channel.';
    const data = await runJson('serverChat', {
        server: server.name, channel: channel.name, topic: channel.topic || 'general chat',
        members: server.members.join(', ') || '(various members)', recent: describe(channel), task,
    }, { busyKey: `chord:${channel.id}` });
    if (!data) return;
    const known = people();
    let t = Math.max(Date.now() - (mine ? 0 : 20 * 60e3), ...channel.messages.map(m => m.time + 1));
    const added = [];
    for (const m of arr(data.messages)) {
        const text = str(m.text);
        const author = str(m.author);
        if (!text || !author || isUser(author)) continue;
        const match = known.find(n => sameName(n, author));
        const replyName = str(m.replyTo);
        const target = replyName ? [...channel.messages, ...added].reverse().find(x => (isUser(replyName) && x.mine) || sameName(x.author, replyName)) : null;
        added.push({ id: nextId(st), author: match ?? author, text, time: mine ? t++ : (t += 45e3), known: !!match, ...(target ? { replyTo: target.id } : {}) });
        if (match && !server.members.some(x => sameName(x, match))) server.members.push(match);
    }
    channel.messages.push(...added);
    if (channel.messages.length > 300) channel.messages.splice(0, channel.messages.length - 300);
    ui.scrollBottom = true;
    saveState();
    updateInjection();
    changed();
}

/** Recent Chord exchanges involving {{user}} or story characters, for the prompt. */
export function chordContext(limit = 8) {
    const user = userName();
    const lines = [];
    for (const s of chord().servers) {
        for (const c of s.channels) {
            for (const m of c.messages) {
                if (!m.mine && !m.known) continue;
                lines.push({ time: m.time, text: `[${s.name} #${c.name}] ${m.mine ? user : m.author}: ${m.text}` });
            }
        }
    }
    return lines.sort((a, b) => a.time - b.time).slice(-limit).map(l => l.text);
}

function nameColor(name) {
    return `hsl(${hueFor(name)} 70% 66%)`;
}

function renderHome() {
    const servers = chord().servers;
    const busy = isBusy('chord');
    if (!servers.length) {
        return `${header('<span class="stp-brand stp-brand-chord"><i class="fa-brands fa-discord"></i> Chord</span>')}
            <div class="stp-scroll" data-scroll="chord">${busy ? shimmerCards(3) : empty('fa-brands fa-discord', 'No servers yet', 'Find the servers you\'re in — friend groups, local communities, fandoms. People from your story might be there.', button('Find my servers', 'chord-find', { icon: 'fa-solid fa-compass' }))}</div>`;
    }
    const server = serverById(ui.params.server) ?? servers[0];
    ui.params.server = server.id;
    const rail = `<nav class="stp-chord-rail">
        ${servers.map(s => `<button class="stp-chord-server ${s.id === server.id ? 'stp-active' : ''}" data-act="chord-server" data-id="${esc(s.id)}" title="${esc(s.name)}" style="--srv:hsl(${hueFor(s.name)} 55% 45%)">${esc(s.icon)}</button>`).join('')}
        <button class="stp-chord-server stp-chord-add ${busy ? 'stp-spin' : ''}" data-act="chord-find" title="Find more servers" ${busy ? 'disabled' : ''}><i class="fa-solid ${busy ? 'fa-arrows-rotate' : 'fa-plus'}"></i></button>
    </nav>`;
    const channels = `<div class="stp-chord-channels">
        <div class="stp-chord-server-name">${esc(server.name)}</div>
        ${server.description ? `<div class="stp-chord-desc">${esc(server.description)}</div>` : ''}
        <div class="stp-chord-section">Text channels</div>
        ${server.channels.map(c => {
            const last = c.messages.at(-1);
            return `<button class="stp-chord-channel" data-act="chord-channel" data-id="${esc(c.id)}"><i class="fa-solid fa-hashtag"></i><span class="stp-grow"><span class="stp-ellipsis">${esc(c.name)}</span>${last ? `<small class="stp-ellipsis">${esc(last.mine ? 'You' : last.author)}: ${esc(last.text)}</small>` : ''}</span></button>`;
        }).join('')}
        <div class="stp-chord-section">Members — ${server.members.length}</div>
        <div class="stp-chord-members">${server.members.slice(0, 30).map(m => `<span class="stp-chord-member">${avatar(m, 'xs')}<span style="color:${nameColor(m)}">${esc(m)}</span></span>`).join('')}</div>
    </div>`;
    return `${header('<span class="stp-brand stp-brand-chord"><i class="fa-brands fa-discord"></i> Chord</span>')}
        <div class="stp-chord">${rail}<div class="stp-scroll" data-scroll="chord:${esc(server.id)}">${channels}</div></div>`;
}

function renderChannel() {
    const server = serverById(ui.params.server);
    const channel = server?.channels.find(c => c.id === ui.params.channel);
    if (!channel) return `${header('Chord')}${empty('fa-brands fa-discord', 'Channel not found')}`;
    const busy = isBusy(`chord:${channel.id}`);
    let prev = null;
    const rows = channel.messages.map(m => {
        const name = m.mine ? userName() : m.author;
        const grouped = prev && (prev.mine ? userName() : prev.author) === name && m.time - prev.time < 5 * 60e3 && !m.replyTo;
        const to = m.replyTo ? channel.messages.find(x => x.id === m.replyTo) : null;
        prev = m;
        const reply = to ? `<div class="stp-chord-replyto"><i class="fa-solid fa-reply fa-flip-horizontal"></i> <b style="color:${nameColor(to.mine ? userName() : to.author)}">${esc(to.mine ? userName() : to.author)}</b> ${esc(to.text.slice(0, 60))}</div>` : '';
        if (grouped) return `<div class="stp-chord-msg stp-grouped"><div class="stp-chord-text">${fmt(m.text)}</div></div>`;
        return `<div class="stp-chord-msg ${m.mine ? 'stp-mine' : ''}">
            ${reply}
            <div class="stp-chord-line">${avatar(name, 'sm')}
                <div class="stp-grow"><div class="stp-chord-head"><b style="color:${nameColor(name)}">${esc(name)}</b>${m.known ? ' <i class="fa-solid fa-star stp-chord-known" title="From your story"></i>' : ''} <span class="stp-muted">${esc(clock(m.time))}</span></div>
                <div class="stp-chord-text">${fmt(m.text)}</div></div>
            </div>
        </div>`;
    }).join('');
    const key = `chord:${channel.id}`;
    return `${header(`<span class="stp-chord-title"><i class="fa-solid fa-hashtag"></i>${esc(channel.name)}</span>`, { actions: iconBtn('fa-solid fa-forward', 'chord-more', 'Catch up', busy ? 'disabled' : '') })}
        ${channel.topic ? `<div class="stp-chord-topic">${esc(channel.topic)} · ${esc(server.name)}</div>` : ''}
        <div class="stp-scroll stp-chord-log" data-scroll="${esc(key)}">
            ${rows ? `<div class="stp-chord-welcome"><b>#${esc(channel.name)}</b><span>The start of the conversation.</span></div>${rows}` : busy ? '' : `<div class="stp-chord-welcome"><b>Welcome to #${esc(channel.name)}!</b><span>${esc(channel.topic || '')}</span></div>`}
            ${busy ? '<div class="stp-chord-typing"><span class="stp-typing"><i></i><i></i><i></i></span> people are typing…</div>' : ''}
        </div>
        <div class="stp-composer">
            <input class="stp-input stp-composer-input" data-draft="${esc(key)}" data-enter="chord-send" placeholder="Message #${esc(channel.name)}" value="${esc(ui.drafts[key] ?? '')}">
            <button class="stp-send" data-act="chord-send" title="Send"><i class="fa-solid fa-arrow-up"></i></button>
        </div>
        <div class="stp-composer-hint">Members answer right away · ⏩ to catch up</div>`;
}

export default {
    id: 'chord',
    label: 'Chord',
    icon: 'fa-brands fa-discord',
    color: 'linear-gradient(160deg, #7983f5, #5865f2)',
    group: 'Social',
    render() {
        return ui.view === 'channel' ? renderChannel() : renderHome();
    },
    back() {
        if (ui.view !== 'channel') return false;
        navigate('chord', null, { server: ui.params.server });
        return true;
    },
    actions: {
        'chord-find': () => findServers(),
        'chord-server': el => {
            ui.params.server = el.dataset.id;
            changed();
        },
        'chord-channel': el => {
            const server = serverById(ui.params.server);
            const channel = server?.channels.find(c => c.id === el.dataset.id);
            if (!channel) return;
            navigate('chord', 'channel', { server: server.id, channel: channel.id });
            ui.scrollBottom = true;
            if (!channel.messages.length) chat(server, channel);
        },
        'chord-more': () => {
            const server = serverById(ui.params.server);
            const channel = server?.channels.find(c => c.id === ui.params.channel);
            if (channel) chat(server, channel);
        },
        'chord-send': () => {
            const server = serverById(ui.params.server);
            const channel = server?.channels.find(c => c.id === ui.params.channel);
            if (!channel) return;
            const key = `chord:${channel.id}`;
            const text = draft(key);
            if (!text || isBusy(key)) return;
            const mine = { id: nextId(state()), author: userName(), text, time: Date.now(), mine: true };
            channel.messages.push(mine);
            clearDrafts(key);
            ui.scrollBottom = true;
            saveState();
            changed();
            chat(server, channel, mine);
        },
    },
};

