// Builds subtitles from the script text + whisper word timings of the narration track.
// Usage: node captions.mjs /tmp/transcript.json   → captions.json, renders/subtitles.srt
import fs from 'node:fs';
const tr = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/transcript.json', 'utf8'));
const tw = (Array.isArray(tr) ? tr : tr.words).map(w => ({ text: w.text ?? w.word, start: w.start, end: w.end })).filter(w => /[A-Za-z0-9]/.test(w.text));
const timing = JSON.parse(fs.readFileSync('timing.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('voice_manifest.json', 'utf8'));

const groups = [];
for (const v of timing.voice) {
  const key = v.id.replace(/^v-/, '').replace('-', '_');
  const text = manifest[key].text.replace(/^(Family Board\.)$/, '“Hey Siri, Family Board.”');
  const words = text.split(/\s+/).filter(Boolean);
  const t0 = v.start, t1 = v.start + v.dur;
  const inside = tw.filter(w => w.start >= t0 - 0.15 && w.start < t1 + 0.1);
  // time for each script word: 1:1 with whisper when the counts agree, else spread by characters
  let times;
  if (inside.length === words.length) times = inside.map(w => [w.start, w.end]);
  else {
    const s0 = inside.length ? inside[0].start : t0, s1 = inside.length ? inside[inside.length - 1].end : t1;
    const tot = words.reduce((a, w) => a + w.length + 1, 0); let acc = 0;
    times = words.map(w => { const a = s0 + (s1 - s0) * acc / tot; acc += w.length + 1; return [a, s0 + (s1 - s0) * acc / tot]; });
  }
  // groups of up to 7 words / 46 characters, breaking after punctuation
  let cur = [];
  const flush = () => { if (!cur.length) return; groups.push({ text: cur.map(c => c.w).join(' '), start: cur[0].a, end: cur[cur.length - 1].b }); cur = []; };
  words.forEach((w, i) => {
    const len = cur.map(c => c.w).join(' ').length + w.length + 1;
    const left = words.length - i; // never leave one or two words stranded at the end of a line
    if (cur.length && (cur.length >= 7 || len > 46) && !(left <= 2 && len <= 58)) flush();
    cur.push({ w, a: times[i][0], b: times[i][1] });
    if (/[.,:;?!]$/.test(w) && cur.length >= 3) flush();
  });
  flush();
}
// tidy: open 0.05 s early, hold to the next group (max +0.6 s), never overlap
groups.forEach(g => { g.start = Math.max(0.15, g.start - 0.05); });
groups.forEach((g, i) => {
  const next = groups[i + 1];
  g.end = Math.min(g.end + 0.6, next ? next.start - 0.02 : g.end + 0.6);
  g.start = +g.start.toFixed(3); g.end = +g.end.toFixed(3);
});
fs.writeFileSync('captions.json', JSON.stringify(groups, null, 0));
const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
fs.mkdirSync('renders', { recursive: true });
fs.writeFileSync('renders/subtitles.srt', groups.map((g, i) => `${i + 1}\n${ts(g.start)} --> ${ts(g.end)}\n${g.text}\n`).join('\n'));
console.log(groups.length, 'subtitle groups; last ends', groups[groups.length - 1].end);
