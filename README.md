# 📱 Phone & PC for SillyTavern

An immersion extension that gives `{{user}}` an in-story **phone** (or **PC**). It also lets you peek at what characters are up to online.

- **Texting.** When a character texts you in a reply, the text pops up on the phone with a notification. You can mention it in your own reply, or text back from the phone. Texts you write on the phone are **not delivered until you send your next chat message**, so you can write the text and the rest of your reply together.
- **Photos.** Characters can send you pictures, and you can send them back. With SillyTavern's built-in **Image Generation** extension, photos are generated for real: selfies, Instagram posts and X attachments.
- **Peek at their online life.** Tap ↻ in any app to see a character's **search history**, **browsing history**, **X/Twitter posts**, **Instagram posts**, **Reddit posts & comments** and **recently played music**. Everything is written in character, based on the story so far.
- **Live posting.** Characters can post on X / Instagram / Reddit and search the web during the story. You can post too.
- **Prompt injection.** Texts, read receipts and recent posts are injected into the prompt, so characters remember what was said over text.
- **Phone or PC.** Switch between a draggable phone and a desktop-style PC window. On small screens it goes fullscreen.

## Install

1. In SillyTavern, open **Extensions** (the stacked-blocks icon) → **Install extension**.
2. Paste `https://github.com/howardsierra/SillyTavernPhone-And-PC` and install.
3. A phone button appears on the right side of the screen. You can drag it anywhere. The phone is also in the **wand menu** (✨), and you can use the `/phone` slash command.

## How it works

### Characters texting you

The extension tells the model it can use these tags. They are removed from the chat message and shown on the device instead:

```html
<sms from="Lena">hey, you up?
can't sleep</sms>                                     <!-- each line = one bubble -->
<sms from="Lena" image="mirror selfie in a hoodie">thoughts?</sms>   <!-- a photo -->
<post app="x" from="Lena">tonight was weird. good weird?</post>
<post app="instagram" from="Lena" image="sunset from the rooftop">golden hour 🌇</post>
<post app="reddit" from="Lena" sub="r/relationship_advice" title="How do I tell him?">...</post>
<search from="Lena">how to tell someone you like them</search>   <!-- private, never shown in chat -->
```

By default a short marker stays in the chat, e.g. *📱 Lena texted you.* You can change this to show the full text, or nothing.

### Texting back

1. Open the conversation and type your text. Use 📷 to attach a photo by describing it.
2. Press **↑** (or Enter). The text is **queued** (shown faded, with "Sends with your next reply"). You can still edit or cancel it.
3. Write your normal chat reply and send it. The queued texts are delivered with that message and injected into the prompt, marked "just sent".

The ✈ button queues the text and sends your chat reply immediately. Ctrl+Enter in the phone does the same.

If you delete your chat message, the texts that went with it go back into the outbox. Swiping or regenerating a character's reply also swaps out the texts and posts that came with it.

### Mentioning a text in your reply

Hover over (or tap) a received text and click ↩. A line like `*reads Lena's text: "…"*` is added to your chat input.

### Peeking at a character's online life

Open **X**, **Instagram**, **Reddit**, **Browser** or **Music**, pick a character and tap ↻. The model writes a snapshot of that character's activity, which is saved with the chat. Tap ↻ again for a fresh snapshot.

### Photos

Photos use SillyTavern's built-in **Image Generation** extension (`/imagine`). Set that extension up with any backend it supports first.

- By default, photos sent in **texts** are generated automatically. Feed and post photos show a placeholder; tap it to develop the photo. Set *Develop photos automatically* to *Everything* to generate all of them.
- Tap a developed photo to view it full-size, open it, or **Retake** it.
- If a character has a character-specific prompt in the Image Generation settings, it's added to their selfies so they look like themselves.

## Settings

Under **Extensions → Phone & PC**:

| Setting | What it does |
| --- | --- |
| Chat marker | What stays in the chat where a tag was: short, full text, or nothing |
| Tell the model how to text / post / search | Injects the tag instructions; editable |
| Include recent texts / posts / searches | What goes into the prompt, and how many |
| Injection depth / role | Where the phone context goes in the prompt |
| Photos | Enable photos, choose auto-generation, edit the photo prompt (`{{desc}}`, `{{name}}`, `{{appearance}}`) |
| Feed prompt | The prompt used for peeking (`{{name}}` = the character) |

Inside the phone's **Settings** app you can switch between Phone and PC, light and dark mode, and wallpapers, or clear the phone data for the current chat.

## Notes

- All phone data is stored in the chat's metadata, so every chat has its own phone.
- Peeking uses one quiet generation per tap. Image generation costs whatever your image backend costs.
- Group chats are supported: any character in the group can text you, and you can peek at each one.
