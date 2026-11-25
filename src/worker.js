// Family Board — Cloudflare Worker
//
//   GET  /api/tasks   → the current task file (Markdown)
//   PUT  /api/tasks   → replace the whole task file. Needs  Authorization: Bearer <TASKS_TOKEN>
//   POST /api/tasks/add → {"group","task"} JSON: shortens the task with Workers AI and adds it
//                       as "- [ ] …" under that existing group. Same Bearer key as PUT.
//   POST /api/tasks/done   → {"group","task"}: strikes out the one open task that matches
//   POST /api/tasks/remove → {"group","task"}: deletes the one task line that matches
//   POST /api/tasks/command → {"text":"cross off the dentist"}: one spoken sentence → add / done / remove,
//                       answered with a "message" for Siri (a question when it needs more)
//   GET  /api/tasks/list[?group=…] → the groups, or one group's tasks, as JSON
//   POST /alexa            → requests from the family's private Alexa skill (signed by Amazon)
//   GET  /api/live    → WebSocket: sends the file on connect and again the instant it changes
//   everything else   → the static site in ./public
//
// The file lives in one Durable Object ("Board"), so a save is visible everywhere immediately
// and can be pushed to every open board. Until the first PUT, the board is seeded from the
// tasks.md that was deployed with the site.

import { DurableObject } from 'cloudflare:workers';

const MAX_BYTES = 256 * 1024;   // a family board is a few KB; this stops accidental huge uploads

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // keep-alive pings are answered without waking the object (keeps it cheap)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async getText() {
    return (await this.ctx.storage.get('tasks')) ?? null;
  }

  async getInfo() {
    return { updatedAt: (await this.ctx.storage.get('updatedAt')) ?? null };
  }

  async setText(text) {
    const updatedAt = Date.now();
    await this.ctx.storage.put({ tasks: text, updatedAt });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch { /* socket already gone */ }
    }
    return { updatedAt, listeners: this.ctx.getWebSockets().length };
  }

  // WebSocket connections from boards (hibernatable: idle connections cost nothing)
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const text = await this.getText();
    if (text !== null) server.send(text);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Add one open task under an existing "## group". Runs inside the object, so it can't race a PUT.
  // Every other byte of the file (including its line endings) is kept exactly as it was.
  async appendTask(group, task) {
    const text = (await this.ctx.storage.get('tasks')) ?? '';
    const sec = findSection(text, group);
    if (!sec) return { ok: false, groups: listGroups(text) };
    if (sec.openTasks.has(task.toLowerCase())) {
      // the same open task is already there (e.g. a Shortcut fired twice): don't add it again
      return { ok: true, duplicate: true, heading: sec.heading, text, updatedAt: null,
               listeners: this.ctx.getWebSockets().length };
    }
    const parts = sec.parts;
    const at = 2 * sec.insertAfter + 1;                       // the line break after that line
    parts.splice(at, 0, parts[at] ?? sec.eol, `- [ ] ${task}`);
    const next = parts.join('');
    const { updatedAt, listeners } = await this.setText(next);
    await this.remember({ action: 'add', group: sec.heading, task });
    return { ok: true, heading: sec.heading, text: next, updatedAt, listeners };
  }

  // Strike out ("done"), un-tick ("reopen") or delete ("remove") one task in a group. Only that one line changes.
  async editTask(group, query, action) {
    const text = (await this.ctx.storage.get('tasks')) ?? '';
    const sec = findSection(text, group);
    if (!sec) return { ok: false, reason: 'group', groups: listGroups(text) };
    const pool = action === 'done' ? sec.tasks.filter((t) => !t.done)
      : action === 'reopen' ? sec.tasks.filter((t) => t.done) : sec.tasks;
    const { found } = matchTask(pool, query);
    if (found.length !== 1) {
      return { ok: false, reason: found.length ? 'many' : 'none', heading: sec.heading,
               options: (found.length ? found : pool).map((t) => t.text) };
    }
    const t = found[0];
    const parts = sec.parts;
    if (action === 'done') {
      const line = parts[2 * t.i];
      parts[2 * t.i] = /\[ \]/.test(line)
        ? line.replace('[ ]', '[x]')
        : line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)/, '$1[x] ');   // bullet without a checkbox
    } else if (action === 'reopen') {
      const line = parts[2 * t.i];
      parts[2 * t.i] = /\[[xX]\]/.test(line)
        ? line.replace(/\[[xX]\]/, '[ ]')
        : line.replace(/~~(.*)~~/, '$1');                          // a fully struck-through line
    } else if (t.i > 0) {
      parts.splice(2 * t.i - 1, 2);                                // the line and the break before it
    } else {
      parts.splice(0, 2);
    }
    const next = parts.join('');
    const { updatedAt, listeners } = await this.setText(next);
    await this.remember({ action, group: sec.heading, task: t.text });
    return { ok: true, heading: sec.heading, task: t.text, text: next, updatedAt, listeners };
  }

  // A short memory for voice: the last few changes (so "remove the last one" works) and the
  // question the board just asked (so the next sentence is read as the answer).
  async remember(entry) {
    const history = (await this.ctx.storage.get('history')) ?? [];
    history.unshift({ ...entry, at: Date.now() });
    await this.ctx.storage.put('history', history.slice(0, 8));
  }

  async getChat() {
    const got = await this.ctx.storage.get(['history', 'pending']);
    return { history: got.get('history') ?? [], pending: got.get('pending') ?? null };
  }

  async setPending(p) {
    if (p) await this.ctx.storage.put('pending', p); else await this.ctx.storage.delete('pending');
  }

  async webSocketMessage() { /* boards only listen */ }
  async webSocketClose(ws, code) { try { ws.close(code, 'closing'); } catch {} }
  async webSocketError(ws) { try { ws.close(1011, 'error'); } catch {} }
}

// ---------- reading the Markdown without changing it ----------

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const normName = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

// Split into lines while keeping each line break, so join('') gives back the exact file.
// parts[2i] is line i, parts[2i+1] is the break after it (absent on the last line).
function scan(text) {
  const parts = text.split(/(\r\n|\n|\r)/);
  const lines = parts.filter((_, i) => i % 2 === 0);
  const headings = [];
  let inComment = false;
  lines.forEach((line, i) => {
    const wasIn = inComment;
    // track <!-- ... --> blocks so headings written inside comments are ignored
    let s = line;
    for (;;) {
      if (inComment) { const e = s.indexOf('-->'); if (e < 0) break; inComment = false; s = s.slice(e + 3); }
      else { const b = s.indexOf('<!--'); if (b < 0) break; inComment = true; s = s.slice(b + 4); }
    }
    if (wasIn) return;
    const m = line.match(HEADING);
    if (m) headings.push({ i, level: m[1].length, name: m[2] });
  });
  return { parts, lines, headings, eol: (text.match(/\r\n|\n|\r/) || ['\n'])[0] };
}

const listGroups = (text) => scan(text).headings.filter((h) => h.level === 2).map((h) => h.name);

function findSection(text, group) {
  const { parts, lines, headings, eol } = scan(text);
  const k = headings.findIndex((h) => h.level === 2 && normName(h.name) === normName(group));
  if (k < 0) return null;
  const start = headings[k].i;
  const end = k + 1 < headings.length ? headings[k + 1].i : lines.length;
  let insertAfter = start;
  const openTasks = new Set();
  const tasks = [];                                   // every task line in the group, in order
  for (let i = start + 1; i < end; i++) {
    if (lines[i].trim() !== '') insertAfter = i;
    // same rule as the board: any bullet is a task; [x] or a fully ~~struck~~ line is done
    const t = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s*)?(.*?)\s*$/);
    if (!t || !t[2]) continue;
    const whole = t[2].match(/^~~(.*)~~$/);
    const done = /[xX]/.test(t[1] || '') || !!whole;
    const text = whole ? whole[1].trim() : t[2];
    tasks.push({ i, done, text });
    if (!done) openTasks.add(text.toLowerCase());
  }
  return { heading: headings[k].name, parts, lines, eol, insertAfter, openTasks, tasks };
}

// Find the one task the person meant: exact text first, then a unique partial match.
const normTask = (s) => s.toLowerCase().replace(/~~|\*\*|__|`/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
function matchTask(candidates, query) {
  const q = normTask(query);
  if (!q) return { found: [] };
  const exact = candidates.filter((t) => normTask(t.text) === q);
  if (exact.length) return { found: [exact[0]] };
  // partial matches only for real words, never for a stray dash or a single letter
  if (q.replace(/[^\p{L}\p{N}]/gu, '').length < 3) return { found: [] };
  const part = candidates.filter((t) => normTask(t.text).includes(q));
  if (part.length) return { found: part };
  const words = q.split(/[^\p{L}\p{N}:]+/u).filter((w) => w.length > 1);
  if (!words.length) return { found: [] };
  return { found: candidates.filter((t) => words.every((w) => normTask(t.text).includes(w))) };
}

function countTasks(text) {
  return {
    groups: listGroups(text).length,
    openTasks: (text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[ \]/gm) || []).length,
    doneTasks: (text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/gm) || []).length,
  };
}

// ---------- shortening a spoken reminder with Workers AI ----------

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_TASK = 39;                     // "under 40 characters"

// money talk is never allowed on the board, whatever the AI says
const FINANCIAL = new RegExp([
  String.raw`[$£€₹¥]\s?\d`,
  String.raw`\d[\d,.]*\s?(?:usd|gbp|eur|inr|aud|cad|rs\.?|rupees?|dollars?|pounds?|euros?|bucks)\b`,
  String.raw`\b(?:rs|inr|usd)\.?\s?\d`,
  String.raw`\bamount (?:due|owed|outstanding)\b`,
  String.raw`\b(?:payment|transaction|transfer|direct debit|card|charge)s? (?:has |was |have |were )?(?:failed|declined|bounced|rejected|unsuccessful)\b`,
  String.raw`\b(?:failed|declined|bounced|rejected|unsuccessful) (?:payment|transaction|transfer|direct debit|card|charge)s?\b`,
  String.raw`\b(?:overdue|outstanding|unpaid) (?:bill|payment|invoice|balance|amount)s?\b`,
  String.raw`\b(?:iban|sort code|routing number|account (?:no|number)|card (?:no|number|ending)|cvv|pin number)\b`,
].join('|'), 'i');

function cleanTask(s) {
  return String(s ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\s*(?:[-*+]\s+)?(?:\[[ xX]\]\s*)?#*\s*/, '')   // no list marker, checkbox or heading
    .replace(/<!--|-->|~~/g, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
}

function hardTrim(s) {
  if (s.length <= MAX_TASK) return s;
  const cut = s.slice(0, MAX_TASK + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > 20 ? cut.slice(0, sp) : s.slice(0, MAX_TASK)).replace(/[\s–—,-]+$/, '');
}

async function askAI(env, input, tighter) {
  const system =
    'You turn a family reminder into a short post-it task. Reply with JSON only.\n' +
    '"financial": true if the text mentions money owed, an amount due, a bill or payment amount, ' +
    'a failed, declined or bounced payment or transaction, or bank/card details; otherwise false. ' +
    'Shopping, buying things, gifts and errands are NOT financial.\n' +
    `"task": the reminder rewritten in at most ${tighter ? 32 : MAX_TASK} characters. Keep any person's name, ` +
    'day, date and time if present: they must all survive, so shorten the "what" instead ' +
    '(e.g. "Dry cleaning – Fri 12 Dec 5:30pm"). Drop filler like "remind me that". Put the what first, then " – " and the when. ' +
    'Use short forms: Mon Tue Wed Thu Fri Sat Sun, 6pm, 9:30am, 12 Dec. No quotes, no full stop, no checkbox.\n' +
    'Example: "Remind me that Sam has a parent-teacher meeting at school on Wednesday at 6pm" → ' +
    '{"financial": false, "task": "Sam parent-teacher mtg – Wed 6pm"}';
  const out = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
    max_tokens: 80,
    temperature: 0.1,
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        properties: { financial: { type: 'boolean' }, task: { type: 'string' } },
        required: ['financial', 'task'],
      },
    },
  });
  let r = out?.response ?? out;
  if (typeof r === 'string') {
    const m = r.match(/\{[\s\S]*\}/);
    r = m ? JSON.parse(m[0]) : null;
  }
  if (!r || typeof r.task !== 'string') throw new Error('AI gave no task');
  return { financial: r.financial === true, task: cleanTask(r.task) };
}

async function shorten(env, input) {
  let r = await askAI(env, input, false);
  if (r.task.length > MAX_TASK && !r.financial) r = { ...r, task: (await askAI(env, input, true)).task };
  return { financial: r.financial, task: hardTrim(r.task) };
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// constant-time comparison so the key can't be guessed by timing responses
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function authorised(request, env) {
  if (!env.TASKS_TOKEN) return false;                       // no key configured → nobody can write
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return !!m && sameSecret(m[1].trim(), env.TASKS_TOKEN);
}

const boardStub = (env) => env.BOARD.get(env.BOARD.idFromName('family'));

// first use: copy the deployed tasks.md into storage
async function ensureSeeded(request, env, stub) {
  let text = await stub.getText();
  if (text === null) {
    const res = await env.ASSETS.fetch(new Request(new URL('/tasks.md', request.url)));
    text = res.ok ? await res.text() : '';
    await stub.setText(text);
  }
  return text;
}

async function getTasks(request, env) {
  const stub = boardStub(env);
  const text = await ensureSeeded(request, env, stub);
  const { updatedAt } = await stub.getInfo();
  const headers = { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' };
  if (updatedAt) headers['Last-Modified'] = new Date(updatedAt).toUTCString();
  return new Response(request.method === 'HEAD' ? null : text, { headers });
}

async function putTasks(request, env) {
  if (!(await authorised(request, env))) {
    return json(401, { ok: false, error: 'Missing or wrong Authorization: Bearer key.' });
  }
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!/^text\/(markdown|plain|x-markdown)\b/.test(type)) {
    return json(415, { ok: false, error: 'Send the file as Content-Type: text/markdown.' });
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return json(400, { ok: false, error: 'The file is empty.' });
  if (buf.byteLength > MAX_BYTES) return json(413, { ok: false, error: `File is larger than ${MAX_BYTES} bytes.` });
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return json(400, { ok: false, error: 'The file must be UTF-8 text.' }); }

  const { updatedAt, listeners } = await boardStub(env).setText(text);

  // a quick summary so the sender can confirm the board understood the file
  const groups = (text.match(/^#{2,6}\s+\S.*$/gm) || []).length;
  const open = (text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[ \]/gm) || []).length;
  const done = (text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/gm) || []).length;
  return json(200, {
    ok: true, bytes: buf.byteLength, groups, openTasks: open, doneTasks: done,
    boardsNotified: listeners, updatedAt: new Date(updatedAt).toISOString(),
  });
}

// POST /api/tasks/add  {"group": "...", "task": "..."}  → one shortened open task under that group
async function addTask(request, env) {
  if (!(await authorised(request, env))) {
    return json(401, { ok: false, error: 'Missing or wrong Authorization: Bearer key.' });
  }
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!/^application\/json\b/.test(type)) {
    return json(415, { ok: false, error: 'Send a JSON body with Content-Type: application/json.' });
  }
  const raw = await request.text();
  if (raw.length > 8192) return json(413, { ok: false, error: 'Request is too large.' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'The body is not valid JSON.' }); }
  const group = typeof body?.group === 'string' ? body.group.trim() : '';
  const input = typeof body?.task === 'string' ? body.task.replace(/\s+/g, ' ').trim() : '';
  if (!group || !input) return json(400, { ok: false, error: 'Send both "group" and "task" as text.' });
  if (input.length > 1000) return json(400, { ok: false, error: '"task" is longer than 1000 characters.' });

  // the group must already be on the board; nothing new is created here
  const stub = boardStub(env);
  const text = await ensureSeeded(request, env, stub);
  if (!findSection(text, group)) {
    return json(400, { ok: false, error: `No group called "${group}".`, validGroups: listGroups(text) });
  }

  const financialError = () => json(400, {
    ok: false, error: 'Financial details (amounts due, payments, transactions, bank or card details) are not put on the board.',
  });
  if (FINANCIAL.test(input)) return financialError();

  let short;
  try { short = await shorten(env, input); }
  catch { return json(502, { ok: false, error: 'Could not shorten the task right now. Try again.' }); }
  if (short.financial || FINANCIAL.test(short.task)) return financialError();
  if (!short.task) return json(400, { ok: false, error: 'Could not make a task from that text.' });

  const r = await stub.appendTask(group, short.task);
  if (!r.ok) return json(400, { ok: false, error: `No group called "${group}".`, validGroups: r.groups });
  return json(200, {
    ok: true, ...countTasks(r.text), boardsNotified: r.listeners,
    task: short.task, group: r.heading,
    ...(r.duplicate ? { duplicate: true } : { updatedAt: new Date(r.updatedAt).toISOString() }),
  });
}

// ---------- POST /api/tasks/command  {"text": "cross off the dentist"} ----------
// One spoken sentence → add / strike out / remove. Always answers with a "message" Siri can read out.
// When it needs more, ok is false and "message" is a question; the Shortcut asks it and sends
// the original sentence plus the answer back here.

const quoted = (s) => `“${s}”`;
const orList = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
const PENDING_MS = 3 * 60 * 1000;
const HISTORY_MS = 6 * 60 * 60 * 1000;    // voice changes older than 6 hours are forgotten          // a follow-up answer counts if it comes within 3 minutes
const ANYTHING_ELSE = 'Anything else?';
const ACTION_WORDS = /\b(?:add|put|remind|remove|delete|take off|get rid|cancel|cross|tick|check off|strike|done|finished|complete|undo|reopen|untick|un-tick|back)\b/i;
// "no", "that's all", "bye"… ends the conversation without asking the AI
const FINISHED = /^(?:no+|nope|nah|nothing(?: else)?|no(?:,)? thanks?(?: you)?|no(?:,)? that'?s (?:all|it)|that'?s (?:all|it)|all done|i'?m (?:done|good|finished)|done|stop|cancel|exit|quit|bye|goodbye|thanks?(?: you)?|thank you(?:,)? bye)[.!]*$/i;

function namedGroup(said, groups) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = groups.filter((g) => {
    const stem = esc(g.toLowerCase().replace(/s$/, ''));
    return new RegExp(`\\b(?:to|in|on|under|into|onto)\\s+(?:the\\s+|my\\s+|our\\s+)?${stem}s?\\b` +
      `|\\b(?:a|an|new)\\s+${stem}s?\\b|\\b${stem}s?\\s+(?:board|list|group|note|post-?it)\\b`, 'i').test(said);
  });
  return hits.length === 1 ? hits[0] : '';
}

const ago = (at) => {
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? 'just now' : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

async function interpret(env, utterance, board, history, pending) {
  const groups = board.map((g) => g.group);
  const system =
    'You manage a family post-it board by voice. Turn what the person said into one action. Reply with JSON only.\n' +
    'The board (each group with its open and done tasks):\n' + JSON.stringify(board) + '\n\n' +
    'Recent changes made by voice, newest first:\n' +
    (history.length ? JSON.stringify(history.map((h) => ({ ...h, at: undefined, when: ago(h.at) }))) : '(none)') + '\n' +
    '"the last one", "that", "it", "my last addition", "what I just added" or "undo" refer to the NEWEST recent change. ' +
    'Undo an add → remove that task; undo a done → reopen it; undo a remove, or "add/put it back" after a remove → ' +
    'action "add" with the removed task\'s exact text and group.\n\n' +
    (pending
      ? `This is a follow-up. Earlier the person said: ${JSON.stringify(pending.text)}. You asked: ${JSON.stringify(pending.question)}. ` +
        (pending.action ? `They wanted to ${pending.action === 'done' ? 'cross off' : pending.action} something: keep action "${pending.action}". ` : '') +
        'Their new words answer that question, unless they are clearly a new, complete request.\n\n'
      : '') +
    'Fields:\n' +
    '"action": "add" to put something new on the board; "done" when they finished it, or say tick, check, ' +
    'cross off, strike out, mark done; "reopen" to un-tick a task that is crossed off (not done, untick, reopen); ' +
    '"remove" when they say remove, delete, take off, cancel, get rid of; "finish" if they are ending the ' +
    'conversation (no, nothing else, that\'s all, bye, thanks); "unknown" if you cannot tell.\n' +
    `"group": exactly one of ${JSON.stringify(groups)}. If they use a word that matches a group ("a reminder" → Reminders, ` +
    '"the school board" → School), use that group. If they did not name a group, pick the obvious one ' +
    '(a dentist or doctor visit → an appointments group). For done/reopen/remove use the group that holds the task. ' +
    'Use "" if it is genuinely unclear.\n' +
    `"task": for add, the new task in at most ${MAX_TASK} characters, keeping any person's name, day, date and time ` +
    '(what first, then " – " and the when; short forms like Wed, 6pm, 12 Dec; drop filler like "remind me that"). ' +
    'For done/reopen/remove, copy the text of the ONE existing task they mean exactly, character for character ' +
    '(done: only open tasks; reopen: only done tasks). Use "" if no task fits or several fit equally.\n' +
    '"financial": true ONLY if the request states money owed, an amount due, a bill or payment amount, a failed or ' +
    'declined payment or transaction, or bank/card details. Shopping, buying things, gifts and errands are NOT financial.\n' +
    '"question": if something is missing or ambiguous, one short question to ask them (offer the choices), else "".';
  const out = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: utterance }],
    max_tokens: 160,
    temperature: 0.1,
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'done', 'reopen', 'remove', 'finish', 'unknown'] },
          group: { type: 'string' }, task: { type: 'string' },
          financial: { type: 'boolean' }, question: { type: 'string' },
        },
        required: ['action', 'group', 'task', 'financial', 'question'],
      },
    },
  });
  let r = out?.response ?? out;
  if (typeof r === 'string') { const m = r.match(/\{[\s\S]*\}/); r = m ? JSON.parse(m[0]) : null; }
  if (!r || typeof r.action !== 'string') throw new Error('AI gave no action');
  return {
    action: ['add', 'done', 'reopen', 'remove', 'finish'].includes(r.action) ? r.action : 'unknown',
    group: String(r.group || '').trim(),
    task: String(r.task || '').trim(),
    financial: r.financial === true,
    question: String(r.question || '').trim(),
  };
}

async function command(request, env) {
  const fail = (status, message) => json(status, { ok: false, finished: true, message, say: message });
  if (!(await authorised(request, env))) return fail(401, 'The board key is missing or wrong.');
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  let utterance = '';
  const raw = await request.text();
  if (raw.length > 8192) return fail(413, 'That was too long.');
  if (/^application\/json\b/.test(type)) {
    try { utterance = JSON.parse(raw)?.text; } catch { return fail(400, 'The request was not valid JSON.'); }
  } else if (/^text\/plain\b/.test(type)) {
    utterance = raw;
  } else {
    return fail(415, 'Send JSON with a "text" field.');
  }
  const r = await runCommand(request, env, utterance);
  return json(r.status, r.body);
}

// The board's "brain" for spoken requests, shared by Siri (/api/tasks/command) and Alexa (/alexa).
// Returns { status, body } where body has message, say, finished, needsAnswer…
async function runCommand(request, env, utterance) {
  // "message" says what happened; "say" is what to speak next (message + the next question);
  // "finished" means stop listening.
  const reply = (status, message, extra = {}) => {
    const body = { ok: status === 200, message, ...extra };
    body.say = body.finished || body.needsAnswer ? message : `${message} ${ANYTHING_ELSE}`;
    return { status, body };
  };
  utterance = typeof utterance === 'string' ? utterance.replace(/\s+/g, ' ').trim() : '';

  const stub = boardStub(env);
  const done = async () => { await stub.setPending(null); return reply(200, 'Okay, the family board is up to date.', { action: 'finish', finished: true }); };
  if (!utterance || FINISHED.test(utterance)) return done();
  if (utterance.length > 1000) return reply(400, 'That was too long. Try a shorter sentence.');

  const financialNo = async () => {
    await stub.setPending(null);
    return reply(400, 'Money matters like payments and amounts due don’t go on the family board.');
  };
  if (FINANCIAL.test(utterance)) return financialNo();

  const text = await ensureSeeded(request, env, stub);
  const groups = listGroups(text);
  const board = groups.map((g) => {
    const sec = findSection(text, g);
    return { group: g, open: sec.tasks.filter((t) => !t.done).map((t) => t.text),
             done: sec.tasks.filter((t) => t.done).map((t) => t.text) };
  });
  const memory = await stub.getChat();
  memory.history = memory.history.filter((h) => Date.now() - h.at < HISTORY_MS);   // "the last one" means today, not last week
  const pending = memory.pending && Date.now() - memory.pending.at < PENDING_MS ? memory.pending : null;

  let r;
  try { r = await interpret(env, utterance, board, memory.history, pending); }
  catch { return reply(502, 'I couldn’t reach the board’s assistant just now. Please try again.'); }
  if (r.action === 'finish') return done();
  // a group the person named ("add a reminder", "to the school board") wins over the AI's guess
  if (r.action === 'add') {
    const named = namedGroup(pending ? `${pending.text} ${utterance}` : utterance, groups);
    if (named) r.group = named;
  }
  // an answer like "the Disney one" keeps the action of the question it answers
  if (pending?.action && !ACTION_WORDS.test(utterance)) r.action = pending.action;
  if (r.financial) return financialNo();

  // anything that needs an answer is remembered, so the next sentence is read as the reply
  const ask = async (q, extra) => {
    await stub.setPending({ text: pending ? `${pending.text} — ${utterance}` : utterance, question: q,
                            action: ['add', 'done', 'reopen', 'remove'].includes(r.action) ? r.action : pending?.action || '',
                            at: Date.now() });
    return reply(400, q, { needsAnswer: true, ...extra });
  };
  const success = async (message, extra) => { await stub.setPending(null); return reply(200, message, extra); };

  if (r.action === 'unknown') {
    return ask(r.question || 'Do you want to add something, cross something off, or remove something?');
  }
  const sec = r.group && findSection(text, r.group);
  if (!sec) return ask(r.question || `Which group: ${orList(groups)}?`, { action: r.action });

  if (r.action === 'add') {
    const task = hardTrim(cleanTask(r.task));
    if (!task) return ask(r.question || `What should I add to ${sec.heading}?`, { action: 'add', group: sec.heading });
    if (FINANCIAL.test(task)) return financialNo();
    const res = await stub.appendTask(sec.heading, task);
    if (!res.ok) return ask(`Which group: ${orList(groups)}?`, { action: 'add' });
    return success(res.duplicate ? `${quoted(task)} is already on ${res.heading}.` : `Added ${quoted(task)} to ${res.heading}.`,
      { action: 'add', group: res.heading, task, ...countTasks(res.text), boardsNotified: res.listeners,
        ...(res.duplicate ? { duplicate: true } : {}) });
  }

  // done / reopen / remove: the AI names the task; the board double-checks it exists before changing anything
  const pool = r.action === 'done' ? sec.tasks.filter((t) => !t.done)
    : r.action === 'reopen' ? sec.tasks.filter((t) => t.done) : sec.tasks;
  if (!pool.length) {
    await stub.setPending(null);
    return reply(400, r.action === 'done' ? `Everything in ${sec.heading} is already done.`
      : r.action === 'reopen' ? `Nothing in ${sec.heading} is crossed off.` : `${sec.heading} has no tasks.`);
  }
  const res = r.task ? await stub.editTask(sec.heading, r.task, r.action)
    : { ok: false, reason: 'none', options: pool.map((t) => t.text) };
  if (!res.ok) {
    const opts = (res.options || pool.map((t) => t.text)).slice(0, 5);
    return ask(r.question && !r.task ? r.question : `Which one: ${orList(opts.map(quoted))}?`,
      { action: r.action, group: sec.heading, options: opts });
  }
  const verb = { done: `Crossed off ${quoted(res.task)} in`, reopen: `Put ${quoted(res.task)} back on`,
                 remove: `Removed ${quoted(res.task)} from` }[r.action];
  return success(`${verb} ${res.heading}.`,
    { action: r.action, group: res.heading, task: res.task, ...countTasks(res.text), boardsNotified: res.listeners });
}

// GET /api/tasks/list               → {"groups": [...]}
// GET /api/tasks/list?group=Home    → {"group","open":[...],"all":[...]}  (read-only, like GET /api/tasks)
async function listTasks(request, env) {
  const text = await ensureSeeded(request, env, boardStub(env));
  const group = (new URL(request.url).searchParams.get('group') || '').trim();
  if (!group) return json(200, { ok: true, groups: listGroups(text) });
  const sec = findSection(text, group);
  if (!sec) return json(400, { ok: false, error: `No group called "${group}".`, validGroups: listGroups(text) });
  return json(200, {
    ok: true, group: sec.heading,
    open: sec.tasks.filter((t) => !t.done).map((t) => t.text),
    all: sec.tasks.map((t) => t.text),
  });
}

// POST /api/tasks/done | /api/tasks/remove   {"group": "...", "task": "..."}
async function changeTask(request, env, action) {
  if (!(await authorised(request, env))) {
    return json(401, { ok: false, error: 'Missing or wrong Authorization: Bearer key.' });
  }
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!/^application\/json\b/.test(type)) {
    return json(415, { ok: false, error: 'Send a JSON body with Content-Type: application/json.' });
  }
  const raw = await request.text();
  if (raw.length > 8192) return json(413, { ok: false, error: 'Request is too large.' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'The body is not valid JSON.' }); }
  const group = typeof body?.group === 'string' ? body.group.trim() : '';
  const task = typeof body?.task === 'string' ? body.task.trim() : '';
  if (!group || !task) return json(400, { ok: false, error: 'Send both "group" and "task" as text.' });

  const stub = boardStub(env);
  await ensureSeeded(request, env, stub);
  const r = await stub.editTask(group, task, action);
  if (!r.ok) {
    if (r.reason === 'group') return json(400, { ok: false, error: `No group called "${group}".`, validGroups: r.groups });
    const what = action === 'done' ? 'open task' : 'task';
    return json(r.reason === 'many' ? 409 : 404, {
      ok: false,
      error: r.reason === 'many'
        ? `More than one ${what} in ${r.heading} matches "${task}". Say more of it.`
        : `No ${what} in ${r.heading} matches "${task}".`,
      options: r.options,
    });
  }
  return json(200, {
    ok: true, ...countTasks(r.text), boardsNotified: r.listeners,
    action, task: r.task, group: r.heading, updatedAt: new Date(r.updatedAt).toISOString(),
  });
}

async function live(request, env) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
  const stub = boardStub(env);
  await ensureSeeded(request, env, stub);
  return stub.fetch(request);
}

// ---------- Alexa: "Alexa, open Family Board" ----------
// A private custom skill sends requests here. Every request is checked the way Amazon requires:
// signed by Amazon's certificate, recent, and addressed to this board's skill (ALEXA_SKILL_ID).

// minimal DER reader — just enough to pull the public key, validity dates and names out of a certificate
function derRead(b, i) {
  const tag = b[i]; let len = b[i + 1], off = i + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let k = 0; k < n; k++) len = len * 256 + b[off + k]; off += n; }
  return { tag, start: i, off, len, end: off + len };
}
function derChildren(b, node) {
  const out = []; let i = node.off;
  while (i < node.end) { const c = derRead(b, i); out.push(c); i = c.end; }
  return out;
}
const derTime = (b, n) => {
  const s = new TextDecoder().decode(b.slice(n.off, n.end));
  const y = n.tag === 0x17 ? (+s.slice(0, 2) < 50 ? 2000 : 1900) + +s.slice(0, 2) : +s.slice(0, 4);
  const r = n.tag === 0x17 ? s.slice(2) : s.slice(4);
  return Date.UTC(y, +r.slice(0, 2) - 1, +r.slice(2, 4), +r.slice(4, 6), +r.slice(6, 8), +r.slice(8, 10));
};
function parseCert(der) {
  const cert = derRead(der, 0), [tbs] = derChildren(der, cert), f = derChildren(der, tbs);
  const k = f[0].tag === 0xa0 ? 1 : 0;                   // optional [0] version
  const [nb, na] = derChildren(der, f[k + 3]);
  const spki = der.slice(f[k + 5].start, f[k + 5].end);
  return { notBefore: derTime(der, nb), notAfter: derTime(der, na), spki, tbsBytes: der.slice(tbs.start, tbs.end) };
}
function pemToDers(pem) {
  return [...pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/g)]
    .map(m => Uint8Array.from(atob(m[1].replace(/\s+/g, '')), c => c.charCodeAt(0)));
}
const certCache = new Map();
function validCertUrl(u) {
  try {
    const url = new URL(u);
    const path = url.pathname.split('/').reduce((a, seg) => seg === '..' ? a.slice(0, -1) : seg && seg !== '.' ? [...a, seg] : a, []).join('/');
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 's3.amazonaws.com' && (!url.port || url.port === '443') && path.startsWith('echo.api/');
  } catch { return false; }
}
async function verifyAlexa(request, raw, env) {
  const certUrl = request.headers.get('SignatureCertChainUrl') || '';
  const sig256 = request.headers.get('Signature-256'), sig1 = request.headers.get('Signature');
  if (!validCertUrl(certUrl) || !(sig256 || sig1)) return 'bad signature headers';
  let cert = certCache.get(certUrl);
  if (!cert || Date.now() > cert.notAfter) {
    const res = await fetch(certUrl);
    if (!res.ok) return 'certificate not available';
    const ders = pemToDers(await res.text());
    if (!ders.length) return 'no certificate';
    cert = parseCert(ders[0]);
    // the signing certificate must name Amazon's Alexa service
    const latin = new TextDecoder('latin1').decode(cert.tbsBytes);
    if (!latin.includes('echo-api.amazon.com')) return 'certificate is not for echo-api.amazon.com';
    certCache.set(certUrl, cert);
  }
  const now = Date.now();
  if (now < cert.notBefore || now > cert.notAfter) return 'certificate expired';
  const hash = sig256 ? 'SHA-256' : 'SHA-1';
  const key = await crypto.subtle.importKey('spki', cert.spki, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
  const sig = Uint8Array.from(atob((sig256 || sig1).trim()), c => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(raw));
  return ok ? null : 'signature does not match';
}

const alexaSay = (text, end, reprompt) => new Response(JSON.stringify({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text: text.replace(/[“”]/g, '"') },
    ...(end ? {} : { reprompt: { outputSpeech: { type: 'PlainText', text: reprompt || 'Anything else for the family board?' } } }),
    shouldEndSession: !!end,
  },
}), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });

const ALEXA_HELP = 'You can say things like: add dentist on Thursday at four, cross off the math packet, remove the last one, or undo. What should I update?';

async function alexa(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const raw = await request.text();
  if (raw.length > 65536) return new Response('Too large', { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('Bad request', { status: 400 }); }

  // 1) Amazon's checks: recent, signed by Amazon, and for this board's skill
  const ts = Date.parse(body?.request?.timestamp || '');
  if (!ts || Math.abs(Date.now() - ts) > 150 * 1000) return new Response('Stale request', { status: 400 });
  const problem = await verifyAlexa(request, raw, env);
  if (problem) return new Response(`Not verified: ${problem}`, { status: 400 });
  const appId = body?.session?.application?.applicationId || body?.context?.System?.application?.applicationId;
  if (!env.ALEXA_SKILL_ID || appId !== env.ALEXA_SKILL_ID) return new Response('Unknown skill', { status: 403 });
  // optional: only these Alexa accounts (comma-separated ALEXA_USERS); empty means anyone who can use the skill
  const allowed = (env.ALEXA_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  const userId = body?.session?.user?.userId || body?.context?.System?.user?.userId || '';
  if (allowed.length && !allowed.includes(userId)) return alexaSay('Sorry, this family board is private.', true);

  // 2) turn the request into a sentence for the board's brain
  const req = body.request || {}, isNew = !!body?.session?.new;
  if (req.type === 'LaunchRequest') return alexaSay('What should I update on the family board?', false, 'You can say add, cross off, or remove something.');
  if (req.type === 'SessionEndedRequest') return new Response(JSON.stringify({ version: '1.0', response: {} }), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
  if (req.type !== 'IntentRequest') return alexaSay('Sorry, I didn’t catch that.', true);
  const name = req.intent?.name || '', q = (req.intent?.slots?.text?.value || '').trim();
  let utterance = '';
  switch (name) {
    case 'AddIntent':    utterance = `add ${q}`; break;
    case 'DoneIntent':   utterance = `cross off ${q}`; break;
    case 'RemoveIntent': utterance = `remove ${q}`; break;
    case 'UndoIntent':   utterance = 'undo that'; break;
    case 'AnswerIntent': utterance = q; break;
    case 'AMAZON.YesIntent':  return alexaSay('What else should I update?', false);
    case 'AMAZON.HelpIntent': return alexaSay(ALEXA_HELP, false);
    case 'AMAZON.NoIntent': case 'AMAZON.StopIntent': case 'AMAZON.CancelIntent': case 'AMAZON.NavigateHomeIntent':
      utterance = 'no thanks'; break;
    default: return alexaSay('Sorry, I didn’t catch that. ' + ALEXA_HELP, false);
  }
  if (!utterance.trim()) return alexaSay('What should I update on the family board?', false);

  // 3) same brain as Siri; keep listening for "anything else?" unless it was a one-shot request
  const r = await runCommand(request, env, utterance);
  const b = r.body;
  if (b.finished) return alexaSay(b.say || b.message, true);
  if (b.needsAnswer) return alexaSay(b.say, false, b.say);
  if (isNew && r.status === 200) return alexaSay(b.message, true);     // "Alexa, tell Family Board to add …"
  return alexaSay(b.say, false);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/tasks') {
      switch (request.method) {
        case 'GET':
        case 'HEAD': return getTasks(request, env);
        case 'PUT':  return putTasks(request, env);
        default:
          return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, PUT' } });
      }
    }
    if (pathname === '/api/tasks/add') {
      if (request.method === 'POST') return addTask(request, env);
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    }
    if (pathname === '/api/tasks/done' || pathname === '/api/tasks/remove') {
      if (request.method === 'POST') return changeTask(request, env, pathname.endsWith('done') ? 'done' : 'remove');
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    }
    if (pathname === '/api/tasks/command') {
      if (request.method === 'POST') return command(request, env);
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    }
    if (pathname === '/api/tasks/list') {
      if (request.method === 'GET') return listTasks(request, env);
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
    }
    if (pathname === '/alexa') return alexa(request, env);
    if (pathname === '/api/live') return live(request, env);
    return env.ASSETS.fetch(request);
  },
};
