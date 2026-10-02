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
