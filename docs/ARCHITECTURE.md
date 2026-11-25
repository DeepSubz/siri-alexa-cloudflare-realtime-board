# Architecture walkthrough

This document follows one event through the system and explains why each piece exists. For the interactive map, open [`architecture.html`](architecture.html) in a browser.

## Components

| Component | Ecosystem | Role |
|---|---|---|
| Siri Shortcut | Apple | Turns speech into one HTTPS request; speaks the reply; loops until `finished`. |
| Alexa custom skill | Amazon | Turns speech into an intent with a `{text}` slot; Amazon signs the request. |
| AI agent (e.g. Meta's Muse) | Meta / any | Reads calendar and mail; uploads the whole Markdown file. |
| Worker (`src/worker.js`) | Cloudflare | Router, authentication, Alexa signature verification, guardrails. |
| Workers AI | Cloudflare | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, strict JSON schema output. |
| Durable Object `Board` | Cloudflare | Single writer; SQLite storage (`tasks`, `updatedAt`, `history`, `pending`); holds every live WebSocket. |
| Board page (`public/index.html`) | Browser | Parses Markdown, lays out post-its, renders with Three.js, receives pushes. |

## One sentence, end to end

1. **Capture.** Siri sends `POST /api/tasks/command` with `{"text": "Add dentist Thursday at four"}` and `Authorization: Bearer <key>`.
2. **Authenticate.** The Worker compares SHA-256 digests of the presented key and the secret in constant time.
3. **Context.** The Worker asks the Durable Object for the current file, the voice changes from the last 6 hours and any question it asked in the last 3 minutes.
4. **Interpret.** Workers AI returns `{"action","group","task","question"}` under a JSON schema.
5. **Guard.** Code refuses money matters, trims to 39 characters, requires an existing group, and for done/remove requires exactly one matching line, otherwise it asks a question.
6. **Commit.** The Durable Object edits one line, preserves every other byte, saves, and records the change for "undo".
7. **Broadcast.** The object sends the full file down every open WebSocket.
8. **Render.** Each screen diffs the text and repaints only the notes that changed.
9. **Reply.** The Worker returns `message`, `say` and `finished`; Siri speaks `say` and listens again.

Alexa follows the same path from step 3, after its own verification (certificate chain from `s3.amazonaws.com/echo.api/`, `echo-api.amazon.com` name, RSA-SHA256 signature, 150-second freshness, skill ID). The agent's `PUT` skips steps 3 to 5 and replaces the whole file.

## Clocks and resilience

| Timer | Value |
|---|---|
| WebSocket push | as soon as the object saves |
| Keep-alive ping | every 30 s (answered by Cloudflare without waking the object) |
| Safety poll while live | every 60 s |
| Poll when the socket is down | every 2 s (15 s if the tab is hidden) |
| Reconnect backoff | 1 s, doubling to 60 s |
| Alexa freshness window | 150 s |
| Follow-up question memory | 3 min |
| Lighting update | 5 min |
| Fully crossed-out note peels off | 3 h (configurable) |
| Voice "undo" memory | 6 h |
| Date re-evaluation (today / overdue) | midnight |

## Extending it

- **New ecosystem:** add a route in `src/worker.js` that authenticates the caller and turns its payload into a sentence for `runCommand()`. Google Assistant, Home Assistant, Slack and Telegram all fit this shape.
- **New screen:** anything that can open `wss://…/api/live` and render Markdown.
- **New rules:** add guardrails in `runCommand()`. The model only proposes; code decides.
