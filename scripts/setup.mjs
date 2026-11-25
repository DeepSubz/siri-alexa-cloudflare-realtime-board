#!/usr/bin/env node
// One-command setup: signs in to YOUR Cloudflare account, deploys, and creates a private write key.
//   npm run setup            first-time setup (safe to re-run)
//   npm run key              rotate the write key
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const rotateOnly = process.argv.includes('--new-key');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const say = (m) => console.log(`\n\x1b[1m▸ ${m}\x1b[0m`);

const major = +process.versions.node.split('.')[0];
if (major < 18) { console.error('Node.js 18 or newer is required: https://nodejs.org'); process.exit(1); }

// 1. Cloudflare sign-in (opens your browser once)
say('Checking your Cloudflare sign-in');
const who = spawnSync(npx, ['wrangler', 'whoami'], { encoding: 'utf8' });
if (who.status !== 0 || /not authenticated/i.test(who.stdout + who.stderr)) {
  say('Opening the browser so you can sign in to Cloudflare (a free account is enough)');
  const login = spawnSync(npx, ['wrangler', 'login'], { stdio: 'inherit' });
  if (login.status !== 0) process.exit(login.status || 1);
}

// 2. Deploy (Wrangler may ask you to pick a free workers.dev subdomain the first time)
let url = '';
if (!rotateOnly) {
  say('Deploying the worker, the Durable Object and the board to your account');
  url = await new Promise((resolve, reject) => {
    const p = spawn(npx, ['wrangler', 'deploy'], { stdio: ['inherit', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => { process.stdout.write(d); out += d; });
    p.on('close', (code) => code ? reject(new Error('wrangler deploy failed')) : resolve((out.match(/https:\/\/[\w.-]+\.workers\.dev/) || [''])[0]));
  });
}

// 3. A long random write key, stored as an encrypted Cloudflare secret
say('Creating your private write key');
const key = randomBytes(24).toString('base64url');
const put = spawnSync(npx, ['wrangler', 'secret', 'put', 'TASKS_TOKEN'], { input: key + '\n', encoding: 'utf8' });
if (put.status !== 0) { console.error(put.stdout, put.stderr); process.exit(put.status || 1); }

console.log(`
\x1b[32m✔ Done.\x1b[0m
${url ? `  Your board:   ${url}\n  On a TV:      ${url}/?tv=1\n` : ''}  Write key:    ${key}

  The write key is shown only this once. Save it in your password manager.
  Siri, Alexa and any AI agent use it to make changes. Reading the board needs no key.

  Next steps:
    • Siri:      docs/SIRI_SHORTCUT.md
    • Alexa:     alexa/SETUP.md
    • AI agent:  docs/AI_AGENT.md
    • Try it:    curl -X POST ${url || 'https://<your-worker>.workers.dev'}/api/tasks/command \\
                   -H "Authorization: Bearer <write key>" -H "Content-Type: application/json" \\
                   -d '{"text":"Add milk to groceries"}'
`);
