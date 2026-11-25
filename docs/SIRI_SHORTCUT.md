# Connect Siri (iPhone, iPad, Apple Watch, HomePod via iPhone)

One shortcut turns the board into a back-and-forth conversation:

> **You:** "Hey Siri, Family Board."
> **Siri:** "What should I update?"
> **You:** "Add dentist Thursday at four."
> **Siri:** "Added Dentist – Thu 4pm to Appointments. Anything else?"
> **You:** "Cross off the math packet." … "No, that's all."

You need your board address (`https://<your-worker>.<your-subdomain>.workers.dev`) and your write key from `npm run setup`.

## Build the shortcut (about 5 minutes)

Open the **Shortcuts** app → **+** (new shortcut) → rename it **Family Board** (this is what you say to Siri). Then add these actions in order. Search for each action by the name in bold.

1. **Text**: type `What should I update?`
   Then **Set Variable**: name `Prompt`, input *Text*.
2. **Repeat**: set it to **10** times. Put steps 3 to 9 *inside* the repeat.
3. **Ask for Input**: type **Text**, prompt = the `Prompt` variable.
   (When you run the shortcut by voice, Siri speaks the prompt and listens.)
4. **Dictionary**: add one item, key `text` (type Text), value = *Provided Input*.
5. **Get Contents of URL**:
   - URL: `https://<your-worker>.<your-subdomain>.workers.dev/api/tasks/command`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <your write key>`, and `Content-Type` = `application/json`
   - Request Body: **File** → the *Dictionary* from step 4 (or choose **JSON** and add the field `text` = *Provided Input*)
6. **Get Dictionary Value**: get **Value** for key `say` in *Contents of URL*.
   Then **Set Variable**: `Prompt` = *Dictionary Value*.
7. **Get Dictionary Value**: get **Value** for key `finished` in *Contents of URL*.
8. **If** *Dictionary Value* **is** `1` (true):
   - **Speak Text**: the `Prompt` variable
   - **Stop This Shortcut**
9. **End If** (leave *Otherwise* empty). The repeat goes round: Siri speaks the next question, which is the `say` text ending in "Anything else?".

Tip: keep the key out of screenshots. If you share the shortcut, remove the header first.

## Make Siri talk back

iPhone **Settings → Siri → Siri Responses → Prefer Spoken Responses**. Without it, Siri may show the answer silently when your phone is unlocked.

## Things you can say

| Say | What happens |
|---|---|
| "Add dentist Thursday at four" · "Remind me to call the plumber Monday" | Adds a task to the obvious group, or the one you name |
| "Cross off the math packet" · "The Disney bundle is done" | Crosses it out on every screen |
| "Remove the last one" · "Delete Black Friday" | Takes it off the board |
| "Undo" · "Put it back" · "That's not done yet" | Reverses the last change, or un-ticks a task |
| "No" · "That's all" · "Bye" | Ends the conversation (`finished: true`) |

If more than one task matches, the board asks: *"Which one: Dentist – Thu or Dentist – Mon?"*. Just answer "the Thursday one".

## One-tap alternatives

- **Quick add without a conversation:** a shortcut with **Get Contents of URL** → `POST /api/tasks/add` and JSON `{"group": "Groceries", "task": <Provided Input>}`.
- **Pick from a list:** `GET /api/tasks/list?group=Groceries` → **Choose from List** → `POST /api/tasks/done` with the chosen task.
