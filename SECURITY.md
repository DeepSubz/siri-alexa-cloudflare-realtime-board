# Security policy

Please report vulnerabilities privately through **GitHub → Security → Report a vulnerability** on this repository rather than in a public issue.

Design notes:
- The write key (`TASKS_TOKEN`) is a Cloudflare secret, compared in constant time; rotate it with `npm run key`.
- Alexa requests are verified with Amazon's certificate chain, the RSA-SHA256 signature, a 150-second timestamp window and the skill ID.
- Reading the board needs no key. If your list is private, protect the Worker with Cloudflare Access.
- Do not store passwords, payment details or other sensitive data on the board. The AI guardrails refuse financial content by design.
