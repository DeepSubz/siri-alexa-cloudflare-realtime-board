# Family Board — task file format

The board reads one plain Markdown file (for example `tasks.md`) and turns it into post-it notes.
Anyone can edit it by hand, or an AI can write it. The board checks the file every few seconds
and updates the wall on its own. No AI is needed to read it.

For a picture of how everything connects (Siri, Alexa, Muse, the Cloudflare worker, Workers AI, the Durable Object
and the screens), open [docs/architecture.html](docs/architecture.html).

---

## The rules

| Write this | It means |
|---|---|
| `# Family Board` | Optional title for the file. Ignored by the board. |
| `## Appointments` | Starts a **group**. Every task under it belongs to that group. |
| `- [ ] Dentist – Thu 4:15pm` | An **open task**. |
| `- [x] Dentist – Thu 4:15pm` | A **done task**. It gets crossed out on its post-it. |
| `Remember: bring insurance card` | A plain line inside a group is a **note** (not a task). It's never crossed out. |
| `<!-- anything -->` | A **comment**. It's invisible on the board (handy for instructions to people or AI). |

That's it. A group is a `##` heading followed by `- [ ]` / `- [x]` lines.

### What the board does with it

- **One colour per group.** All post-its for *Appointments* share one paper colour, handwriting and pen,
  different from the other groups.
- **Long groups are split automatically.** The board fills each post-it only as far as the handwriting
  stays at full, readable size, then starts the next one. 12 appointments might become 4 post-its,
  labelled *Appointments (1 of 4)*, *(2 of 4)*… Nobody needs to split anything in the file.
- **Split post-its stay together.** A group's post-its are placed side by side as a cluster,
  close to each other but not overlapping.
- **Done tasks are crossed out** with a pen stroke the moment the file changes.
- **When every task on a post-it is done, it stays up (all crossed out) for a few hours, then peels off
  the wall.** The default is 3 hours, set by `doneHours` at the top of `index.html` (or `?doneHours=1`
  in the page address). The clock starts when the board first sees the post-it complete and keeps
  running across reloads. Un-ticking a task puts the post-it back in play.
- **Removing a group or task** from the file removes it from the wall too.

---

## Example

```markdown
# Family Board

## Appointments
- [ ] Dentist – Thu 4:15pm
- [x] Eye test – Mon 9:00am
- [ ] Vet for Biscuit – Sat 10:30am

## Groceries
- [ ] Milk (2%)
- [ ] Bread – the seeded one
- [x] Eggs

## Chores
- [ ] Take out recycling (Tue)
- [ ] Fold laundry
Kids: one chore each before screen time
```

---

## Dates: today, tomorrow and overdue

Put the date in the task the way you'd say it and the board reads it:
`Dentist – Thu Dec 3 4pm`, `Book fair – 12 Dec`, `Winter Break – Dec 21 to Jan 1`, `Permission slip – due Dec 9`,
`Swimming – Sat`, `Call the plumber tomorrow`.

- **Today**: a highlighter swipe across the task and a red **TODAY** stamp on its post-it.
- **Tomorrow**: a paler highlight.
- **Overdue**: things to *do* (due, submit, sign, buy, call, pay, return, RSVP…) whose date has passed get a red `!`,
  a wavy red underline and an **OVERDUE** stamp.
- **Past events** (birthdays, school events) just fade until they're ticked off or removed.
- A weekday on its own (`Wed 6pm`) means this week's; `from Mon Nov 30` never goes overdue.

## Ambience

The board follows the time and season by itself: warm light at sunrise and sunset, a dim lamp-lit night (darker after
10pm, set with `bedtime` in the page settings), autumn leaves, winter snow, spring petals, and holiday touches —
pumpkins in October and Thanksgiving week, snow and a tree from Dec 18 to Jan 1, hearts Feb 7–14.
Preview any moment with `?date=2026-12-24&time=19:30` (add `&demo=1` to see the butterflies and falling things at once).

## Good habits

- **Keep each task short**, ideally under ~40 characters. Short tasks fit more per post-it.
- **Keep group names short and consistent.** `Appointments` and `appointments` count as the same group,
  but `Appointments` and `Appts` are two groups with two colours.
- **Put each group in the file once.** If the same heading appears twice, they become two separate groups.
- **Tick tasks off, don't delete them**, if you want to see the cross-out happen. Deleting is fine too;
  the task just disappears.
- Order inside a group is the order on the post-its.
- Other Markdown is tolerated: `*` or `1.` bullets work as tasks, `~~text~~` also counts as done,
  and **bold**, *italic*, links and `code` marks are shown as plain handwriting.

---

## Saving the file to the live board

Send the **whole** file in one request:

```
PUT https://<your-worker>.<your-subdomain>.workers.dev/api/tasks
Authorization: Bearer <write key>
Content-Type: text/markdown

<the complete Markdown file>
```

- The write key is stored only in Cloudflare (secret `TASKS_TOKEN`) and in the sender's secure vault.
  It never goes in this file, the page, or a chat.
- Success returns `200` with a summary, for example
  `{"ok":true,"groups":4,"openTasks":23,"doneTasks":2,"boardsNotified":1,...}`.
  `boardsNotified` is how many open boards received the update instantly.
- Errors: `401` missing or wrong key · `415` not `text/markdown` · `413` over 256 KB · `400` empty or not UTF-8.
- Reading the current file: `GET https://<your-worker>.<your-subdomain>.workers.dev/api/tasks` (no key needed).
- To change the key: `wrangler secret put TASKS_TOKEN` in this folder, then update the vault.

---

## Adding one task (Siri Shortcut, quick capture)

```
POST https://<your-worker>.<your-subdomain>.workers.dev/api/tasks/add
Authorization: Bearer <write key>
Content-Type: application/json

{"group": "School", "task": "Remind me that Sam has a parent-teacher meeting at school on Wednesday at 6pm"}
```

- `group` must match an existing `##` heading (any capitalisation). The board's own spelling is used.
  No new groups are created; an unknown group returns `400` with `validGroups`.
- `task` is shortened by Workers AI to under 40 characters, keeping names, day, date and time,
  for example `Sam parent-teacher mtg – Wed 6pm`. It is added as `- [ ] …` at the end of that group.
  Every other line of the file is left exactly as it was.
- Anything about money (amounts due, payments, failed or declined transactions, bank or card details)
  is refused with `400` and never added.
- If the same open task is already in that group, nothing is added (`"duplicate": true`).
- Success returns `200`, for example
  `{"ok":true,"groups":7,"openTasks":24,"doneTasks":1,"boardsNotified":2,"task":"Sam parent-teacher mtg – Wed 6pm","group":"School"}`.
- Errors: `401` key · `415` not JSON · `400` missing fields, unknown group or financial · `502` AI unavailable, try again.
- **iOS Shortcut:** *Get Contents of URL* → Method **POST**, header `Authorization` = `Bearer <key>`
  (from a secure source), Request Body **JSON** with text fields `group` and `task`.

## Talking to the board (one sentence)

```
POST https://<your-worker>.<your-subdomain>.workers.dev/api/tasks/command
Authorization: Bearer <write key>
Content-Type: application/json

{"text": "Cross off the Disney bundle"}
```

- Workers AI works out whether to **add**, **strike out** (done) or **remove**, which group, and which task.
  For add it picks the obvious group if none is named, and shortens the task like `/add` does.
  For done/remove it only changes a task that really exists, and only that one line.
- Every answer has a `message` written to be read aloud, e.g. `Crossed off “Check Disney bundle – Tue-Wed” in Reminders.`
- If it needs more, `ok` is `false`, `needsAnswer` is `true` and `message` is a question
  (`Which one: “Dentist – Thu” or “Dentist – Mon”?`). Send the first sentence plus the answer back,
  e.g. `{"text": "Remove the dentist — the Thursday one"}`.
- Money matters are refused, as with `/add`. Errors: `401` key · `415` not JSON · `502` AI unavailable.
- **Conversation mode.** Every answer also has `say` (what Siri should speak next, usually ending in
  "Anything else?") and `finished: true` when the person says no / that's all / bye. The board remembers the
  question it just asked (3 minutes) and the last few voice changes (6 hours), so "remove the last one",
  "cross that off", "undo" and "add it back" work, and a short answer like "the Disney one" keeps the
  action that was asked about. It can also un-tick a crossed-off task ("that's not done yet").
  A Shortcut only needs to loop: ask with `say`, send the answer as `text`, stop when `finished`.

## Striking out or removing one task

```
POST https://<your-worker>.<your-subdomain>.workers.dev/api/tasks/done      ← strikes it out ([ ] → [x])
POST https://<your-worker>.<your-subdomain>.workers.dev/api/tasks/remove    ← deletes the line
Authorization: Bearer <write key>
Content-Type: application/json

{"group": "Appointments", "task": "dentist thu"}
```

- `task` can be the exact text or part of it ("dentist thu"). It must match **exactly one** task in that group
  (`done` only looks at open tasks). Only that one line changes; every other line stays exactly as it was.
- Errors: `401` key · `415` not JSON · `400` unknown group (`validGroups`) · `404` nothing matches ·
  `409` more than one matches (say more of it). `404` and `409` include `options`, the candidate tasks.
- Success: `{"ok":true,"action":"done","task":"Dentist – Thu 4:15pm","group":"Appointments","groups":7,"openTasks":22,...}`

Reading (no key needed):
- `GET /api/tasks/list` → `{"groups":["Appointments","School",…]}`
- `GET /api/tasks/list?group=Reminders` → `{"group":"Reminders","open":[…],"all":[…]}`. Handy for a
  Shortcut's *Choose from List*: pick the exact task text, then send it to `done` or `remove`.

---

## Instructions to give an AI that maintains the file

> You maintain a Markdown task file for a family post-it board. Follow these rules exactly:
> 1. Each topic is a level-2 heading: `## Group name` (short, Title Case, reuse existing names exactly).
> 2. Each task is one line: `- [ ] task` for open, `- [x] task` for done. Keep tasks under 40 characters.
> 3. To complete a task, change `[ ]` to `[x]`. Do not reword it.
> 4. Never put the same `##` heading in the file twice; add tasks under the existing heading.
> 5. Do not split groups yourself; the board splits long groups automatically.
> 6. Optional plain lines under a heading are shown as notes. Use `<!-- -->` for anything that
>    should not appear on the board.
> 7. Output the whole file, nothing else.
