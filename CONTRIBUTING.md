# Contributing

Thanks for helping. Good first contributions:

- **New integrations:** Google Assistant, Home Assistant, Slack, Telegram, WhatsApp, email-in.
- **New screens and themes:** e-ink, kiosk mode, dark wall, accessibility improvements.
- **Tests:** the Markdown scanner, `matchTask`, Alexa signature verification with fixture certificates.
- **Docs and translations.**

## Workflow

1. Fork and clone, then run `npm install`.
2. `cp .dev.vars.example .dev.vars` and `npm run dev`.
3. Keep changes small and focused; describe the architecture impact in the PR.
4. Never commit secrets, real task lists, personal names or account IDs.

## Principles

- One source of truth (the Markdown file); JSON on the wire only.
- The model proposes, code decides.
- Every write goes through the single Durable Object.
- Everything must stay deployable on Cloudflare's free plan.
