// Assembles the film: times every scene from the Qwen narration, inlines the shared library
// into each scene, and writes compositions/*.html and index.html.
// Usage: node build.mjs
import fs from 'node:fs';

const script = JSON.parse(fs.readFileSync('script.json', 'utf8'));
const voice = JSON.parse(fs.readFileSync('voice_manifest.json', 'utf8'));
const lib = fs.readFileSync('src/lib.js', 'utf8');
const music = fs.existsSync('music.json') ? JSON.parse(fs.readFileSync('music.json', 'utf8')) : [];

const SFXDUR = { 'click-soft': 0.36, 'impact-bass-1': 2.1, 'key-press': 0.4, notification: 2.45, ping: 1.32, pop: 0.72, riser: 10.0, sparkle: 1.8, typing: 1.5, 'whoosh-cinematic': 5.5, 'whoosh-short': 0.57, whoosh: 0.57 };
const FAST = process.env.FAST === '1';
const r3 = n => Math.round(n * 1000) / 1000;
let t = 0;
const scenes = [], audio = [];
for (const sc of script.scenes) {
  const srcPath = `src/scenes/${sc.id}.html`;
  if (!fs.existsSync(srcPath)) { console.warn('missing scene', sc.id); continue; }
  const src = fs.readFileSync(srcPath, 'utf8');
  const tm = Object.assign({ pre: 0.6, gap: 0.45, post: 1.0, gaps: {} }, JSON.parse((src.match(/<!--TIMING\s*([\s\S]*?)-->/) || [, '{}'])[1]));
  if (FAST) { // fast cut: same lines, trimmed pauses
    tm.pre = Math.max(0.25, tm.pre * 0.45); tm.gap = Math.max(0.2, tm.gap * 0.45); tm.post = Math.max(0.6, tm.post * 0.45);
    for (const k in tm.gaps) tm.gaps[k] = Math.max(0.3, tm.gaps[k] * 0.45);
  }
  let local = tm.pre;
  const cue = [];
  sc.lines.forEach(([who, text], i) => {
    const key = `${sc.id}_${String(i).padStart(2, '0')}`;
    const v = voice[key];
    if (!v) throw new Error('no voice for ' + key);
    if (i) local += tm.gaps[i] ?? (who !== 'nar' || sc.lines[i - 1][0] !== 'nar' ? (FAST ? 0.22 : 0.35) : tm.gap);
    cue.push({ s: r3(local), d: v.dur, who, text });
    audio.push({ id: 'v-' + key.replace('_', '-'), src: v.file, start: r3(t + local), dur: v.dur, vol: 1, track: who === 'nar' ? 20 : 21 });
    local += v.dur;
  });
  const dur = r3(local + tm.post);
  // sound effects declared by the scene: <!--SFX [["whoosh", "c(0)+0.2", 0.5], ...] -->
  const sfxSpec = JSON.parse((src.match(/<!--SFX\s*([\s\S]*?)-->/) || [, '[]'])[1]);
  const c = i => cue[i].s, e = i => cue[i].s + cue[i].d;
  const CALM_SKIP = new Set(['impact-bass-1', 'riser', 'whoosh-cinematic']); // calm mix: no dramatic hits
  sfxSpec.forEach(([name, expr, vol], k) => {
    if (CALM_SKIP.has(name)) return;
    const when = Function('c', 'e', 'D', `return (${expr});`)(c, e, dur);
    audio.push({ id: `fx-${sc.id}-${k}`, src: `assets/sfx/${name}.mp3`, start: r3(t + when), dur: SFXDUR[name], vol: r3((vol ?? 0.5) * 0.6), track: 22 + (k % 3) });
  });
  const markup = src.replace(/<!--(TIMING|SFX)[\s\S]*?-->/g, '');
  const style = (markup.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const body = (markup.match(/<body>([\s\S]*?)<\/body>/) || [, ''])[1];
  const js = (markup.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1];
  const out = `<template>
<style>
@font-face{font-family:'Bradley Hand';src:local('Bradley Hand Bold'),local('Bradley Hand'),url('assets/fonts/hand.ttf') format('truetype');font-weight:400 900}
#root{position:absolute;inset:0;overflow:hidden;font-family:Inter,sans-serif;color:#18202c}
#root .k{color:#2f6ff2;font-weight:500} #root .s{color:#0f8a5f;font-weight:500} #root .n{color:#e0662a;font-weight:500} #root .m{color:#d2458e;font-weight:700} #root .h{color:#7350e6;font-weight:600}
${style}
</style>
<div id="root" data-composition-id="${sc.id}" data-width="1920" data-height="1080">
${body}
</div>
<script>
(() => {
const ROOT = (() => { const all = [...document.querySelectorAll('[data-composition-id="${sc.id}"]')]; return all.find(e => e.id === 'root') || all.find(e => !e.hasAttribute('data-composition-src')) || all[all.length - 1]; })();
const $ = s => ROOT.querySelector(s);
const CUE = ${JSON.stringify(cue)};
const DUR = ${dur};
${lib}
const tl = gsap.timeline({ paused: true });
${js}
tl.set({}, {}, DUR);
window.__timelines["${sc.id}"] = tl;
})();
</script>
</template>
`;
  fs.writeFileSync(`compositions/${sc.id}.html`, out);
  scenes.push({ id: sc.id, start: r3(t), dur });
  t += dur;
}
const total = r3(t);

// music beds: music.json = [{file, from (scene id), to (scene id), offset, vol}]
const sceneStart = Object.fromEntries(scenes.map(s => [s.id, s.start]));
const sceneEnd = Object.fromEntries(scenes.map(s => [s.id, s.start + s.dur]));
music.forEach((m, k) => {
  if (!(m.from in sceneStart)) return;
  const start = sceneStart[m.from] + (m.lead || 0), stop = (m.to in sceneEnd ? sceneEnd[m.to] : total) + (m.tail || 0);
  audio.push({ id: 'mus-' + k, src: m.file, start: r3(start), dur: r3(Math.min(stop - start, m.max || 1e9)), vol: m.vol ?? 0.14, track: 30 + k, fadeIn: m.fadeIn ?? 1.5, fadeOut: m.fadeOut ?? 2.5, mediaStart: m.offset || 0 });
});

// burned-in subtitles from captions.json (node captions.mjs)
const caps = fs.existsSync('captions.json') ? JSON.parse(fs.readFileSync('captions.json', 'utf8')) : [];
if (caps.length) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  fs.writeFileSync('compositions/captions.html', `<template>
<style>
#root { position: absolute; inset: 0; pointer-events: none; }
#root .cg { position: absolute; left: 0; right: 0; bottom: 46px; text-align: center; opacity: 0; visibility: hidden; }
#root .cg span { display: inline-block; max-width: 1560px; padding: 10px 24px 12px; border-radius: 14px; background: rgba(20,26,36,.84);
  font: 600 40px/1.25 Inter, sans-serif; color: #fff; letter-spacing: .005em; }
</style>
<div id="root" data-composition-id="captions" data-width="1920" data-height="1080" data-layout-allow-occlusion data-layout-allow-caption-zone>
${caps.map((g, i) => `  <div class="cg" id="cap-${i}"><span>${esc(g.text)}</span></div>`).join('\n')}
</div>
<script>
(() => {
const CAPS = ${JSON.stringify(caps.map(g => [g.start, g.end]))};
const ROOT = [...document.querySelectorAll('[data-composition-id="captions"]')].find(e => e.id === 'root') || document.querySelector('[data-composition-id="captions"]');
const tl = gsap.timeline({ paused: true });
CAPS.forEach(([s, e], i) => {
  const g = ROOT.querySelector('#cap-' + i);
  tl.set(g, { visibility: 'visible' }, s);
  tl.fromTo(g, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: 'power1.out' }, s);
  tl.to(g, { opacity: 0, duration: 0.1, ease: 'power2.in' }, e - 0.1);
  tl.set(g, { opacity: 0, visibility: 'hidden' }, e);
});
tl.set({}, {}, ${total});
window.__timelines["captions"] = tl;
})();
</script>
</template>
`);
}
const hosts = scenes.map((s, i) => `      <div id="${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:${i + 1}"></div>`).join('\n');
const capHost = caps.length ? `\n      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${total}" data-track-index="9" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index:100"></div>` : '';
const auds = audio.map(a => `      <audio id="${a.id}" class="clip" src="${a.src}" data-start="${a.start}"${a.dur ? ` data-duration="${a.dur}"` : ''} data-track-index="${a.track}" data-volume="${a.vol}"${a.fadeIn ? ` data-fade-in="${a.fadeIn}"` : ''}${a.fadeOut ? ` data-fade-out="${a.fadeOut}"` : ''}${a.mediaStart ? ` data-media-start="${a.mediaStart}"` : ''}></audio>`).join('\n');
const index = `<!doctype html>
<html lang="en" data-composition-variables='[{"id":"builtBy","type":"string","label":"Built by line","default":"Designed, integrated & engineered end to end"}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #e7ebf0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
${hosts}${capHost}
${auds}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync('index.html', index);
fs.writeFileSync('timing.json', JSON.stringify({ total, scenes, voice: audio.filter(a => a.id.startsWith('v-')).map(a => ({ id: a.id, src: a.src, start: a.start, dur: a.dur })) }, null, 1));
console.log('total', total.toFixed(1), 's ·', scenes.length, 'scenes');
scenes.forEach(s => console.log(s.id.padEnd(10), s.start.toFixed(1).padStart(7), s.dur.toFixed(1).padStart(6)));
