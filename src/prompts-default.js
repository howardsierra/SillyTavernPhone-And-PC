// Default prompt templates. Every one of these can be overridden in the settings panel.

const JSON_ONLY = 'Respond with ONLY a JSON object, no commentary, in exactly this shape:';
const WORLD = 'Everything must fit the setting, era and tone of the story so far (in a fantasy or historical setting, invent in-world equivalents).';

export const PROMPT_LABELS = {
    instructions: 'Tag instructions (injected into every prompt)',
    instructionsAdult: 'Extra tag instructions for 18+ apps',
    peek: 'Peek: a character\'s phone (social, browser, music, money, orders, location, dating)',
    locate: 'Locate: where a character is right now',
    shop: 'Cartly: product search results',
    food: 'Munch: nearby restaurants',
    spark: 'Spark: dating profiles',
    rated: 'Rated (18+): anonymous posts feed',
    ratedComments: 'Rated (18+): comments on a post',
};

export const DEFAULT_PROMPTS = {
    instructions: `[Phone system: {{user}} has a smartphone. When it fits the story (e.g. characters are apart), characters can use their phones by writing these tags anywhere in a reply. The tags are hidden from the story text and shown on {{user}}'s phone.
- Text {{user}}: <sms from="Name">message</sms> (each line = one bubble). Send a picture by adding image="what the photo shows".
- Call {{user}}: <call from="Name" status="missed">optional voicemail</call> (status: missed, answered or declined).
- Post online: <post app="x|instagram|reddit" from="Name">text</post> (Reddit: title="..." sub="r/..."; Instagram/X photo: image="...").
- Search the web privately: <search from="Name">query</search>
- Money (Pocket app): <pay from="Name" to="Name" amount="20" note="🍕 pizza"/> or <request from="Name" to="{{user}}" amount="20" note="..."/>
- Order online: <order app="shop|food" from="Name" for="Recipient" item="..." price="24.99" store="...">gift note</order>
- Share location: <location from="Name" place="...">what they're doing</location>
Characters only know about texts, payments and orders {{user}} has actually sent (see the phone log). Never write phone actions on {{user}}'s behalf.]`,

    instructionsAdult: `[18+ app "Rated": an anonymous app where adults post photos of themselves to be rated 1-10 by strangers. A character can secretly post with <anon from="Name" image="what the photo shows">caption</anon>. Posts are anonymous; nobody knows who posted unless the character tells them. All users are consenting adults (18+).]`,

    peek: `[OOC: Pause the roleplay. Write a realistic snapshot of {{name}}'s phone as it looks right now: their online activity, money, shopping and whereabouts. It must fit {{name}}'s personality, voice, interests, secrets and the current events of the story, including their feelings about {{user}}. Be specific, candid and in character — include things {{name}} would never say out loud. Write posts in {{name}}'s own style (slang, emoji, lowercase, typos if fitting). ${WORLD}

${JSON_ONLY}
{
  "handles": {"x": "@handle", "instagram": "@handle", "reddit": "u/username"},
  "bio": {"x": "short bio", "instagram": "short bio"},
  "location": {"place": "where they are", "activity": "what they're doing", "ago": "5m"},
  "searches": [{"query": "...", "ago": "15m"}],
  "history": [{"title": "page title", "url": "https://...", "ago": "1h"}],
  "x": [{"text": "...", "image": "optional: attached photo", "ago": "2h", "likes": 12, "reposts": 1, "replies": 3}],
  "instagram": [{"image": "detailed description of the photo", "caption": "...", "ago": "1d", "likes": 87, "comments": [{"user": "@someone", "text": "..."}]}],
  "reddit": [{"type": "post", "subreddit": "r/...", "title": "...", "body": "...", "ago": "3h", "upvotes": 45, "comments": 12}, {"type": "comment", "subreddit": "r/...", "thread": "title of the thread", "body": "...", "ago": "5h", "upvotes": 8}],
  "music": [{"track": "...", "artist": "...", "ago": "20m"}],
  "payments": [{"from": "{{name}} or someone else", "to": "someone", "amount": 12.5, "note": "emoji + short note", "ago": "1d"}],
  "orders": [{"item": "...", "price": 24.99, "store": "...", "ago": "3d"}],
  "dating": {"onApp": false, "bio": "...", "prompts": [{"q": "...", "a": "..."}], "photo": "profile photo description", "lookingFor": "..."}
}
Include 6-10 searches, 4-6 history entries, 3-6 X posts, 2-4 Instagram posts, 4-6 Reddit items (mix posts and comments), 5 songs, 3-6 payments (Venmo-style, between {{name}} and friends, never involving {{user}}), 2-4 orders. Set dating.onApp to true only if {{name}} would plausibly have a dating profile right now. Newest first. "ago" uses short forms like 5m, 3h, 2d.]`,

    locate: `[OOC: Pause the roleplay. Where is {{name}} right now and what are they doing, consistent with the story so far? ${WORLD}
${JSON_ONLY}
{"place": "short place name", "activity": "what they're doing, one sentence", "ago": "2m"}]`,

    shop: `[OOC: Pause the roleplay. {{user}} is browsing an online store and searched for: "{{query}}". Invent 8 realistic product listings that match the search. ${WORLD} Prices should be realistic for the setting.
${JSON_ONLY}
{"products": [{"name": "...", "price": 29.99, "store": "shop or brand", "rating": 4.6, "reviews": 1240, "description": "one or two sentences", "image": "product photo description"}]}]`,

    food: `[OOC: Pause the roleplay. {{user}} opened a food delivery app. Invent 5 nearby restaurants with varied cuisines, each with 5 menu items. ${WORLD}
${JSON_ONLY}
{"restaurants": [{"name": "...", "cuisine": "...", "rating": 4.7, "eta": "25-35 min", "fee": 2.99, "image": "photo of their signature dish", "menu": [{"name": "...", "price": 14.5, "description": "short"}]}]}]`,

    spark: `[OOC: Pause the roleplay. {{user}} is swiping on a dating app. Invent 6 dating profiles of people who live nearby. They are all adults (18+), varied and realistic, with personality — some funny, some intense, some red flags. ${WORLD} "interest" is how likely they'd be to like {{user}} back (1-10).
${JSON_ONLY}
{"profiles": [{"name": "first name", "age": 27, "distance": "3 km", "job": "...", "bio": "...", "prompts": [{"q": "a dating-app prompt", "a": "their answer"}], "photo": "profile photo description", "interest": 7}]}]`,

    rated: `[OOC: Pause the roleplay. Generate the feed of "Rated", an anonymous app where consenting adults (all 18+) post photos of themselves to be rated 1-10 by strangers. Invent 6 posts from anonymous users: varied people, bodies, moods and confidence levels, with funny/flirty/insecure captions. ${WORLD} If it fits a story character's personality and the current events, ONE post may secretly be by that character (set "secretlyBy" to their exact name, otherwise leave it out).
${JSON_ONLY}
{"posts": [{"handle": "anonymous username", "age": 24, "photo": "description of the photo", "caption": "...", "rating": 7.8, "votes": 312, "comments": [{"handle": "...", "text": "...", "rating": 8}], "secretlyBy": "optional"}]}]`,

    ratedComments: `[OOC: Pause the roleplay. On "Rated", an anonymous app where consenting adults (all 18+) post photos of themselves for strangers to rate 1-10, this post just got reactions:
Photo: {{photo}}
Caption: {{caption}}
Write 6 comments from anonymous strangers: honest, mixed, some flirty, some blunt, each with the rating they gave. ${WORLD}
${JSON_ONLY}
{"rating": 7.9, "comments": [{"handle": "...", "text": "...", "rating": 8}]}]`,
};
