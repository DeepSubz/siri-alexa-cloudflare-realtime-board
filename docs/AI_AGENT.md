# Connect an AI agent

The board accepts a complete Markdown file from any agent or automation, for example Meta's AI assistant Muse, ChatGPT, Claude, Gemini, n8n, Zapier, Make, a GitHub Action or a cron job. A typical agent reads calendars and inboxes (appointments, school notices, deliveries), rewrites the list by the house rules, and uploads it in one request.

## The request

```http
PUT https://<your-worker>.<your-subdomain>.workers.dev/api/tasks
Authorization: Bearer <write key>
Content-Type: text/markdown

# Family Board

## Appointments
- [ ] Dentist – Thu 4:15pm
```

Response: `{"ok":true,"groups":4,"openTasks":12,"doneTasks":2,"boardsNotified":2,...}`
Errors: `401` key · `415` not `text/markdown` · `413` over 256 KB · `400` empty or not UTF-8.

To read the current list first (no key needed): `GET /api/tasks`.

## Instructions to give your agent

> You maintain a Markdown task file for a family post-it board. Follow these rules exactly:
> 1. Each topic is a level-2 heading: `## Group name` (short, Title Case; reuse existing names exactly).
> 2. Each task is one line: `- [ ] task` for open, `- [x] task` for done. Keep tasks under 40 characters, with names, day, date and time, e.g. `Dentist – Thu Dec 3 4:15pm`.
> 3. To complete a task, change `[ ]` to `[x]`. Do not reword it.
> 4. Never repeat a `##` heading; add tasks under the existing heading.
> 5. Do not split groups yourself; the board splits long groups automatically.
> 6. Plain lines under a heading are shown as notes. Use `<!-- -->` for anything that must not appear.
> 7. Never include money matters, account numbers, passwords or other sensitive data.
> 8. Fetch the current file from GET /api/tasks first, keep what people added by voice, then send the whole updated file with PUT /api/tasks.

## Examples

**curl / cron**

```bash
curl -X PUT "$BOARD_URL/api/tasks" -H "Authorization: Bearer $BOARD_KEY" -H "Content-Type: text/markdown" --data-binary @tasks.md
```

**Node / Python / any agent tool:** expose a single tool `update_board(markdown: string)` that performs the `PUT` above. Give the agent the instructions and a `read_board()` tool that performs `GET /api/tasks`.

Keep the key in your agent platform's secret store, never in the prompt.
