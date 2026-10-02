// Default prompt templates. Every one of these can be overridden in the settings panel.

const JSON_ONLY = 'Respond with ONLY a JSON object, no commentary, in exactly this shape:';
const STYLE = 'Be specific, candid and in character — include things {{name}} would never say out loud. Write in {{name}}\'s own voice and style (slang, emoji, lowercase, typos if fitting).';
const WORLD = 'Everything must fit the setting, era and tone given by the story context below (in a fantasy or historical setting, invent in-world equivalents).';

export const PROMPT_LABELS = {
    instructions: 'Tag instructions (injected into every prompt)',
    instructionsAdult: 'Extra tag instructions for 18+ apps',
    phoneOnly: 'Phone-only roleplay instructions',
    reply: 'Reply to a text (instant delivery)',
    replyGroup: 'Reply in a group text',
    comments: 'Comments on a post (and replies to yours)',
    servers: 'Chord: servers you\'re in',
    serverChat: 'Chord: a channel\'s chat',
    tgChannels: 'Channels: broadcast channels to follow',
    tgPosts: 'Channels: a channel\'s posts',
    velvetCreators: 'Velvet (18+): creators',
    velvetPosts: 'Velvet (18+): a creator\'s posts',
    devTexts: 'Their phone: a character\'s private text conversations',
    devThread: 'Their phone: more of one conversation',
    devCalls: 'Their phone: call log',
    devNotes: 'Their phone: private notes',
    devPhotos: 'Their phone: camera roll',
    mailInbox: 'Mail (PC): {{user}}\'s inbox',
    mailReply: 'Mail (PC): a reply to {{user}}\'s email',
    devMail: 'Their PC: a character\'s inbox',
    devFiles: 'Their PC: a character\'s files',
    games: 'Games (PC): game library and friends',
    news: 'News: headlines',
    live: 'Live: who is streaming',
    liveChat: 'Live: a stream\'s chat',
    peekSocial: 'Peek: a character\'s X / Instagram / Reddit profile feed',
    feed: 'Feed: {{user}}\'s home timeline on X / Instagram / Reddit',
    peekBrowser: 'Peek: a character\'s search & browsing history',
    peekMusic: 'Peek: what a character listens to',
    peek: 'Peek: the rest of a character\'s phone (money, orders, location, dating)',
    locate: 'Locate: where a character is right now',
    shop: 'Cartly: product search results',
    food: 'Munch: nearby restaurants',
    spark: 'Spark: dating profiles',
    rated: 'Rated (18+): anonymous posts feed',
    ratedComments: 'Rated (18+): comments on a post',
};

export const DEFAULT_PROMPTS = {
    instructions: `[Phone system: {{user}} has a smartphone. When it fits the story (e.g. characters are apart), characters can use their phones by writing these tags anywhere in a reply. The tags are hidden from the story text and shown on {{user}}'s phone.
- Text {{user}}: <sms from="Name">message</sms> (each line = one bubble). Send a picture by adding image="what the photo shows"; a voice message with voice="true"; in a group chat add chat="Group name".
- React to {{user}}'s latest text: <react from="Name" emoji="❤️"/>
- Call {{user}}: <call from="Name" status="missed">optional voicemail</call> (status: missed, answered or declined).
- Post online: <post app="x|instagram|reddit" from="Name">text</post> (Reddit: title="..." sub="r/..."; Instagram/X photo: image="...").
- Search the web privately: <search from="Name">query</search>
- Money (Pocket app): <pay from="Name" to="Name" amount="20" note="🍕 pizza"/> or <request from="Name" to="{{user}}" amount="20" note="..."/>
- Order online: <order app="shop|food" from="Name" for="Recipient" item="..." price="24.99" store="...">gift note</order>
- Share location: <location from="Name" place="...">what they're doing</location>
- Make a plan: <plan from="Name" when="Saturday 8pm" with="{{user}}">what</plan>
Characters only know about texts, payments and orders {{user}} has actually sent (see the phone log). Never write phone actions on {{user}}'s behalf.]`,

    instructionsAdult: `[18+ app "Rated": an anonymous app where adults post photos of themselves to be rated 1-10 by strangers. A character can secretly post with <anon from="Name" image="what the photo shows">caption</anon>. Posts are anonymous; nobody knows who posted unless the character tells them. All users are consenting adults (18+).]`,

    phoneOnly: `[Phone-only roleplay: right now the whole roleplay happens through {{user}}'s phone — {{user}} is not physically with anyone. Reply ONLY with phone actions written as tags, mostly texts: <sms from="Name">message</sms>. Write texts the way the character really texts: short, casual, several bubbles (one per line), emoji or slang if it fits them, and react to exactly what {{user}} just sent. The person {{user}} just texted or called is the one who answers, even if it isn't {{char}}. Other phone tags (call, post, pay, request, order, location, search) are welcome when they fit. Do not write any narration, actions or spoken dialogue outside the tags.]`,

    reply: `[OOC: Pause the story for a moment. {{user}} just did this on their phone:
{{what}}

Write {{contact}}'s response exactly as it would arrive on {{user}}'s phone, in character and consistent with everything that has happened. Use ONLY phone tags — usually one or more <sms from="{{contact}}">…</sms>: short, natural texting, one bubble per line, in {{contact}}'s own texting style. Add image="what the photo shows" to send a picture, or voice="true" for a voice message. {{contact}} may also call, pay, react to a text with <react from="{{contact}}" emoji="❤️"/>, or use any other phone tag. If {{contact}} wouldn't answer right now (busy, asleep, upset, ignoring {{user}}), write only <silent/>. Write nothing outside the tags.]`,

    replyGroup: `[OOC: Pause the story for a moment. The group chat «{{contact}}» (members: {{members}}) just got this from {{user}}:
{{what}}

Write how the group responds, like a real group chat: one or more members text back with <sms chat="{{contact}}" from="Member name">…</sms> — in character, in their own texting styles, several members may reply and react to each other. If nobody would answer right now, write only <silent/>. Write nothing outside the tags.]`,

    peekSocial: `[OOC: Pause the roleplay. Show {{name}}'s {{appName}} profile as it looks right now: their handle, bio and their {{count}} most recent posts, as a real, lived-in profile feed — varied topics, moods and posting times, everyday life mixed with things tied to the story. It must fit {{name}}'s personality, interests and secrets, and the story context below (including how they feel about {{user}}, if they know them). ${STYLE} ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"handle": "@handle", "bio": "short bio", "posts": [{{shape}}]}
Write {{count}} posts, newest first. "ago" uses short forms like 5m, 3h, 2d, 3w.]`,

    feed: `[OOC: Pause the roleplay. Show {{user}}'s home feed on {{appName}} right now: {{count}} posts from accounts {{user}} follows — friends, acquaintances, local accounts, celebrities, memes, news and ads that fit the world. Where it fits, include posts by people from the story (use their exact names as "author"): {{people}}. Those posts must be in character and fit the story context. Everyone else is invented; give them believable names and handles. Vary the tone: funny, mundane, dramatic, wholesome, thirsty. ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"posts": [{{shape}}]}
Write {{count}} posts, newest first. "ago" uses short forms like 5m, 3h, 2d.]`,

    peekBrowser: `[OOC: Pause the roleplay. Show {{name}}'s private browser as it looks right now: recent searches and browsing history. It must fit {{name}}'s personality, worries, interests and secrets, and the story context below (including how they feel about {{user}}, if they know them). Be candid — this is what they look up when nobody is watching. ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"searches": [{"query": "...", "ago": "15m"}], "history": [{"title": "page title", "url": "https://...", "ago": "1h"}]}
Write 12-15 searches and 8-12 history entries, newest first. "ago" uses short forms like 5m, 3h, 2d.]`,

    peekMusic: `[OOC: Pause the roleplay. Show what {{name}} has been listening to lately: songs that fit their personality, taste and current mood in the story context below. ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"tracks": [{"track": "...", "artist": "...", "ago": "20m"}]}
Write 12-15 tracks, most recent first.]`,

    peek: `[OOC: Pause the roleplay. Show the rest of {{name}}'s phone as it looks right now: their money, shopping, whereabouts and dating life. It must fit {{name}}'s personality and secrets, and the story context below (including how they feel about {{user}}, if they know them). ${STYLE} ${WORLD}

{{context}}

${JSON_ONLY}
{
  "handles": {"x": "@handle", "instagram": "@handle", "reddit": "u/username"},
  "location": {"place": "where they are", "activity": "what they're doing", "ago": "5m"},
  "payments": [{"from": "{{name}} or someone else", "to": "someone", "amount": 12.5, "note": "emoji + short note", "ago": "1d"}],
  "orders": [{"item": "...", "price": 24.99, "store": "...", "ago": "3d"}],
  "dating": {"onApp": false, "bio": "...", "prompts": [{"q": "...", "a": "..."}], "photo": "profile photo description", "lookingFor": "..."}
}
Include 6-10 payments (Venmo-style, between {{name}} and friends, never involving {{user}}) and 4-6 orders, newest first. Set dating.onApp to true only if {{name}} would plausibly have a dating profile right now. "ago" uses short forms like 5m, 3h, 2d.]`,

    comments: `[OOC: Pause the roleplay. On {{appName}}, {{author}} posted:
"{{post}}"

Comments so far:
{{thread}}

{{task}}
People from the story who might comment (use their exact names, in character): {{people}}. Everyone else is an invented account with a believable name and handle. Keep comments short and natural for {{appName}}. ${WORLD}

{{context}}

${JSON_ONLY}
{"comments": [{"author": "name", "handle": "@handle", "text": "...", "replyTo": "name of the person this answers, or empty", "likes": 3}]}]`,

    servers: `[OOC: Pause the roleplay. {{user}} opens a Discord-style chat app. Invent 4 servers {{user}} is a member of — for example a friend group, a local community, a hobby or fandom server, and a work/school/guild server. Where it fits, people from the story are members (use their exact names): {{people}}. Each server has 3-5 text channels with short topics. ${WORLD}

{{context}}

${JSON_ONLY}
{"servers": [{"name": "...", "icon": "one emoji", "description": "...", "members": ["member names, including story people where it fits"], "channels": [{"name": "general", "topic": "..."}]}]}]`,

    serverChat: `[OOC: Pause the roleplay. Discord-style server "{{server}}", channel #{{channel}} ({{topic}}). Members include: {{members}}.
Recent messages:
{{recent}}

{{task}}
Write it like real group chat: short messages, casual typing, emoji, jokes, side conversations. People from the story stay in character and use their exact names; everyone else is an invented member with a fitting username. ${WORLD}

{{context}}

${JSON_ONLY}
{"messages": [{"author": "name", "text": "...", "replyTo": "name they answer, or empty"}]}]`,

    tgChannels: `[OOC: Pause the roleplay. {{user}} browses a Telegram-style channels app. Invent 5 broadcast channels worth following: local news, gossip, memes, a niche interest, and an anonymous confessions channel named like "Overheard in <place>" (set "anonymous": true for that one). They fit the world and may talk about what's happening in the story. ${WORLD}

{{context}}

${JSON_ONLY}
{"channels": [{"name": "...", "emoji": "📰", "description": "...", "subscribers": 12400, "anonymous": false}]}]`,

    tgPosts: `[OOC: Pause the roleplay. The channel "{{channel}}" ({{description}}). Write its {{count}} most recent posts{{anonRule}} Posts may touch on what's happening in the story. ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"posts": [{"text": "...", "image": "optional: what an attached photo shows", "views": 1200, "ago": "2h", "reactions": {"🔥": 12, "😂": 4}, "secretlyBy": ""}]}]`,

    velvetCreators: `[OOC: Pause the roleplay. {{user}} browses "Velvet", a subscription app where adult creators (all 18+, consenting) post exclusive photos for paying subscribers. Invent 6 creators with varied looks, vibes and niches (fitness, cosplay, lingerie, alt, girl/boy-next-door, artsy), each with a monthly price. If it plausibly fits a story character's personality and situation, ONE creator may be that character (exact name, "storyCharacter": true): {{people}}. ${WORLD}

{{context}}

${JSON_ONLY}
{"creators": [{"name": "display name", "handle": "@...", "bio": "...", "price": 9.99, "avatar": "profile photo description", "cover": "banner photo description", "posts": 42, "storyCharacter": false}]}]`,

    velvetPosts: `[OOC: Pause the roleplay. {{name}} is a creator on Velvet, an 18+ subscription app ({{bio}}). Write their {{count}} latest posts: what each photo shows and the caption, in their own voice — teasing, flirty, personal. Everyone shown is a consenting adult. ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"posts": [{"image": "photo description", "caption": "...", "likes": 230, "ago": "1d"}]}]`,

    devTexts: `[OOC: Pause the roleplay. {{user}} is looking through {{name}}'s phone, at their Messages app. Invent {{count}} of {{name}}'s recent text conversations with people OTHER than {{user}}: friends, family, coworkers, exes, a group chat — and people from the story where it fits ({{people}}). Each has 4-10 recent messages that reveal {{name}}'s life, worries and secrets, consistent with the story; sometimes they talk about {{user}}. Also give the name {{name}} saved {{user}} under in their contacts (a nickname, an emoji, a plain name — whatever fits how they feel). ${STYLE} ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"userContactName": "...", "threads": [{"contact": "name or group name", "members": ["only for group chats"], "messages": [{"from": "me (for {{name}}) or the sender's name", "text": "...", "image": "optional: what a sent photo shows", "ago": "2h"}]}]}]`,

    devThread: `[OOC: Pause the roleplay. On {{name}}'s phone, the text conversation with {{contact}}. The latest messages:
{{recent}}

Write the next 3-6 messages of this conversation, as it continues right now ({{name}} and {{contact}} both may write). ${STYLE} ${WORLD}

{{context}}

${JSON_ONLY}
{"messages": [{"from": "me (for {{name}}) or the sender's name", "text": "...", "image": "optional", "ago": "now"}]}]`,

    devCalls: `[OOC: Pause the roleplay. {{user}} is looking through {{name}}'s phone, at their recent calls (not counting calls with {{user}}). Invent 8-12 calls that fit {{name}}'s life and the story: who called, who they called, missed calls, a voicemail or two. ${WORLD}

{{context}}

${JSON_ONLY}
{"calls": [{"contact": "name", "dir": "in or out", "status": "answered, missed or declined", "duration": "4:12", "ago": "3h", "voicemail": "optional transcript of a voicemail left for {{name}}"}]}]`,

    devNotes: `[OOC: Pause the roleplay. {{user}} is looking through {{name}}'s phone, at their private Notes app. Invent 4-7 notes {{name}} wrote for themselves: lists, reminders, drafts of messages they never sent, a diary-like entry, ideas, things about people in their life (maybe {{user}}). ${STYLE} ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"notes": [{"title": "...", "body": "the note text (line breaks allowed)", "ago": "2d"}]}]`,

    devPhotos: `[OOC: Pause the roleplay. {{user}} is looking through {{name}}'s phone, at their camera roll. Invent 9-12 recent photos and screenshots that fit {{name}}'s life and the story: selfies, friends, places, food, pets, memes, screenshots of conversations, maybe one they'd rather nobody saw (album "Hidden"). ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"photos": [{"image": "detailed description of the photo", "album": "Recents, Favorites, Screenshots or Hidden", "ago": "1d"}]}]`,

    mailInbox: `[OOC: Pause the roleplay. {{user}} checks their email inbox on their computer. Write {{count}} recent emails: newsletters, receipts and shipping updates, work or school mail, an account alert, maybe a scam — and, where it fits the story, emails from people in it ({{people}}; use their exact names). Put 1-2 obvious junk emails in "spam". ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"emails": [{"from": "sender name", "address": "sender@example.com", "subject": "...", "body": "the email text (a few short paragraphs, line breaks allowed)", "ago": "3h", "folder": "inbox or spam"}]}]`,

    mailReply: `[OOC: Pause the roleplay. {{user}} sent {{name}} an email.
Subject: {{subject}}
{{body}}

Earlier emails between them:
{{earlier}}

Write {{name}}'s reply email, in character and consistent with the story — the tone people use in email (could be warm, formal, flustered, curt…). If {{name}} wouldn't answer, set "reply" to false. ${WORLD}

{{context}}

${JSON_ONLY}
{"reply": true, "subject": "Re: ...", "body": "..."}]`,

    devMail: `[OOC: Pause the roleplay. {{user}} is looking through {{name}}'s email on their computer. Write 7-10 emails in {{name}}'s inbox that reveal their life: work/school, bills, subscriptions, family, old friends, something they'd rather keep private, maybe something about {{user}}. Include 1-2 emails {{name}} sent (folder "sent"). ${STYLE} ${WORLD}

{{context}}

${JSON_ONLY}
{"emails": [{"from": "sender name (or {{name}} for sent mail)", "to": "recipient (sent mail only)", "address": "sender@example.com", "subject": "...", "body": "...", "ago": "2d", "folder": "inbox or sent"}]}]`,

    devFiles: `[OOC: Pause the roleplay. {{user}} is looking through the files on {{name}}'s computer. Invent 8-12 files in their Documents, Downloads and Desktop folders that fit their life and the story: essays, drafts, spreadsheets, lists, letters never sent, a diary, receipts, screenshots, a suspiciously named folder… Give realistic file names with extensions, and the text inside for documents. ${STYLE} ${WORLD}

{{context}}

${JSON_ONLY}
{"files": [{"name": "budget_2024.xlsx", "folder": "Documents, Downloads or Desktop", "ago": "3d", "size": "24 KB", "content": "what's inside (text documents: the actual text; other files: a short description)"}]}]`,

    games: `[OOC: Pause the roleplay. {{who}} opens a game launcher on {{whose}} computer. Invent the game library: 6-9 games that fit {{whose}} tastes, personality and the setting (in-world games if the setting has no video games — or plausible equivalents), with hours played (be revealing: a guilty pleasure, an obsession) and when last played. Also the friends list: 4-7 friends with what they're doing right now — people from the story where it fits ({{people}}; exact names) and online friends with gamer tags. ${WORLD}

{{context}}

${JSON_ONLY}
{"games": [{"title": "...", "genre": "...", "hours": 120, "lastPlayed": "2d", "cover": "cover art description"}], "friends": [{"name": "...", "status": "Playing <game> | Online | Away | Offline 3h"}]}]`,

    news: `[OOC: Pause the roleplay. Write the news feed {{user}} sees on their phone right now: 8 articles from the world of the story — local news, world events, gossip, entertainment, weather, sports or the in-world equivalent. Where it fits, include stories touching on recent story events or people (rumours, sightings, consequences), but keep most of it everyday news that makes the world feel alive. ${WORLD}
{{more}}

{{context}}

${JSON_ONLY}
{"articles": [{"headline": "...", "source": "outlet name", "category": "Local", "summary": "2-3 sentence summary", "body": "two short paragraphs", "image": "what the article photo shows", "ago": "2h"}]}]`,

    live: `[OOC: Pause the roleplay. Who is live streaming right now? Invent 6 live streams {{user}} could watch: gaming, just chatting, music, cooking, IRL, art — or the in-world equivalent. If it fits their personality and the story context, one or two may be streamed by people from the story (use their exact names): {{people}}. ${WORLD}

{{context}}

${JSON_ONLY}
{"streams": [{"streamer": "name", "title": "stream title", "category": "Just Chatting", "viewers": 1240, "scene": "what's on screen right now"}]}]`,

    liveChat: `[OOC: Pause the roleplay. {{streamer}} is live streaming "{{title}}" ({{category}}). Recent chat:
{{recent}}

{{user}} wrote in chat: {{userMsgs}}

Continue the stream: what {{streamer}} says out loud next (1-3 short lines, in character — they may read and react to chat, especially {{user}}'s messages and donations), and 10-14 new chat messages from viewers (usernames, emotes, jokes, questions, simps, trolls). ${WORLD}

{{context}}

${JSON_ONLY}
{"streamer": ["line", "line"], "chat": [{"user": "username", "text": "..."}], "viewers": 1300}]`,

    locate: `[OOC: Pause the roleplay. Where is {{name}} right now and what are they doing, consistent with the story context below? ${WORLD}
{{context}}

${JSON_ONLY}
{"place": "short place name", "activity": "what they're doing, one sentence", "ago": "2m"}]`,

    shop: `[OOC: Pause the roleplay. {{user}} is browsing an online store and searched for: "{{query}}". Invent 8 realistic product listings that match the search. ${WORLD} Prices should be realistic for the setting.
{{context}}

${JSON_ONLY}
{"products": [{"name": "...", "price": 29.99, "store": "shop or brand", "rating": 4.6, "reviews": 1240, "description": "one or two sentences", "image": "product photo description"}]}]`,

    food: `[OOC: Pause the roleplay. {{user}} opened a food delivery app. Invent 5 nearby restaurants with varied cuisines, each with 5 menu items. ${WORLD}
{{context}}

${JSON_ONLY}
{"restaurants": [{"name": "...", "cuisine": "...", "rating": 4.7, "eta": "25-35 min", "fee": 2.99, "image": "photo of their signature dish", "menu": [{"name": "...", "price": 14.5, "description": "short"}]}]}]`,

    spark: `[OOC: Pause the roleplay. {{user}} is swiping on a dating app. Invent 6 dating profiles of people who live nearby. They are all adults (18+), varied and realistic, with personality — some funny, some intense, some red flags. ${WORLD} "interest" is how likely they'd be to like {{user}} back (1-10).
{{context}}

${JSON_ONLY}
{"profiles": [{"name": "first name", "age": 27, "distance": "3 km", "job": "...", "bio": "...", "prompts": [{"q": "a dating-app prompt", "a": "their answer"}], "photo": "profile photo description", "interest": 7}]}]`,

    rated: `[OOC: Pause the roleplay. Generate the feed of "Rated", an anonymous app where consenting adults (all 18+) post photos of themselves to be rated 1-10 by strangers. Invent 6 posts from anonymous users: varied people, bodies, moods and confidence levels, with funny/flirty/insecure captions. ${WORLD} If it fits a story character's personality and the story context, ONE post may secretly be by that character (set "secretlyBy" to their exact name, otherwise leave it out).
{{context}}

${JSON_ONLY}
{"posts": [{"handle": "anonymous username", "age": 24, "photo": "description of the photo", "caption": "...", "rating": 7.8, "votes": 312, "comments": [{"handle": "...", "text": "...", "rating": 8}], "secretlyBy": "optional"}]}]`,

    ratedComments: `[OOC: Pause the roleplay. On "Rated", an anonymous app where consenting adults (all 18+) post photos of themselves for strangers to rate 1-10, this post just got reactions:
Photo: {{photo}}
Caption: {{caption}}
Write 6 comments from anonymous strangers: honest, mixed, some flirty, some blunt, each with the rating they gave. ${WORLD}
{{context}}

${JSON_ONLY}
{"rating": 7.9, "comments": [{"handle": "...", "text": "...", "rating": 8}]}]`,
};
