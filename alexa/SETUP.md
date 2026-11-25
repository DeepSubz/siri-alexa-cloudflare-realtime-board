# Alexa skill for the Family Board — setup

A private Alexa skill (opened with **"Alexa, open Post It Board"**) that talks to the board the same way the Siri shortcut does
("add…", "cross off…", "remove…", "undo", and follow-up questions). It stays in
**development** mode, so it works on your own Echo devices without Amazon review or publishing.

Takes about 15 minutes. You need the Amazon account your Echo devices use.

---

## 1. Create the skill

1. Go to **https://developer.amazon.com/alexa/console/ask** and sign in with the Amazon account your Echos use.
   (First time: accept the developer agreement. It's free.)
2. Click **Create Skill**.
   - **Skill name:** `Family Board`
   - **Primary locale:** **English (US)** (match the language your Echos use)
   - **Type of experience:** *Other* → **Custom** model
   - **Hosting:** **Provision your own**
   - **Template:** **Start from scratch**
3. Click **Create Skill** and wait for it to finish.

## 2. Paste the phrase list

1. In the left menu: **Build → Interaction Model → JSON Editor**.
2. Replace everything in the editor with the contents of
   [`interaction-model.json`](interaction-model.json) (in this folder).
3. Click **Save**, then **Build skill** (top of the page). Wait for "Build successful".

## 3. Point it at the board

1. Left menu: **Build → Endpoint** (sometimes under *Custom → Endpoint*).
2. Choose **HTTPS**.
3. **Default Region:** `https://<your-worker>.<your-subdomain>.workers.dev/alexa`
4. SSL certificate: **"My development endpoint is a sub-domain of a domain that has a wildcard
   certificate from a certificate authority"**.
5. Click **Save**.

## 4. Connect the board to your skill

1. Copy your **Skill ID** (on the skill list: *Copy Skill ID*; it looks like `amzn1.ask.skill.1234…`).
2. Open `wrangler.jsonc`, paste it into `"ALEXA_SKILL_ID": ""`, then run `npm run deploy`.

   The Skill ID is not a password, but the board only answers requests for this one ID,
   and only when Amazon has signed them.

## 5. Test it

1. In the console, open the **Test** tab and set *Skill testing is enabled in* to **Development**.
2. Type or say **"open post it board"**. You should hear *"What should I update on the family board?"*
3. On any Echo signed in to the same Amazon account:
   **"Alexa, open Post It Board."**

---

## Things you can say

| You say | What happens |
|---|---|
| "Alexa, open Post It Board" | Alexa asks what to update, and keeps asking "Anything else?" until you say no |
| "Add dentist on Thursday at 4" / "Remind me to call the plumber Monday" | Adds a task (to the obvious group, or the one you name) |
| "Cross off the math packet" / "The Disney bundle is done" | Strikes it out on the board |
| "Remove the last one" / "Delete Black Friday" | Takes it off the board |
| "Undo" / "Put it back" | Reverses the last change |
| "No" / "That's all" / "Stop" | Ends the conversation |
| "Alexa, tell Post It Board to add milk" | One-shot: does it and finishes |

If Alexa asks a follow-up ("Which one: …?"), answer with something like **"the Thursday one"**
or **"in Reminders"**.

Money matters (payments, amounts due, failed transactions) are refused, same as Siri.

## Optional: only your household

By default anyone who can open the skill can use it. A development skill is only available on
your own account, so that's normally just your household. To lock it to specific Alexa accounts,
put their Alexa user IDs (comma-separated) in `"ALEXA_USERS"` in `wrangler.jsonc` and redeploy.

## Troubleshooting

- **"There was a problem with the requested skill's response"**: check the endpoint URL in step 3
  ends in `/alexa`, and that the Skill ID is in `wrangler.jsonc` and deployed.
- **"I cannot open … on this device" / Alexa opens a different skill**: the spoken name clashes with a
  published skill. "Family Board" is already taken by a public skill, which is why this one is opened with
  **"post it board"** (the `invocationName` in `interaction-model.json`). Pick another unique phrase if needed,
  paste the updated JSON, Save and Build.
- **Keep it to English (US) only.** Adding more English locales (Language settings → Sync Locales) reset the
  simulator's language and made the skill unopenable until they were removed again. If an Echo is set to a
  different English, change the Echo's language rather than adding locales.
- **Simulator says "I can't open … on this device"**: check the language dropdown above the simulator's text box
  says **English (US)**, not "Select an option".
- **No "Dev" tab in the Alexa app**: the new Alexa+ app doesn't have one; a development skill works on your
  devices without being enabled there.
- **It didn't understand an answer**: start with a word like "add", "cross off", "remove", "the…" or "in…".
  Alexa needs a lead-in word before free-form text.
