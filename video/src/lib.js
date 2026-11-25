// Shared helpers. build.mjs inlines this file into every scene's <script>, so each scene stays self-contained.
const NS = 'http://www.w3.org/2000/svg';
function E(tag, attrs, parent, svg) {
  const e = svg ? document.createElementNS(NS, tag) : document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k === 'css') e.style.cssText = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}
const SV = (t, a, p) => E(t, a, p, true);
const HT = (t, a, p) => E(t, a, p, false);
const f1 = n => (+n).toFixed(1);
const at = (i, frac = 0) => CUE[i].s + frac * CUE[i].d;
const end = i => CUE[i].s + CUE[i].d;

const COL = {
  ink: '#18202c', muted: '#5b6576', ground: '#e7ebf0', panel: '#ffffff', line: '#cfd6df',
  siri: '#2f6ff2', alexa: '#0f9a92', muse: '#7350e6', ai: '#d2458e', write: '#e0662a', push: '#e0662a',
  asset: '#7d8798', key: '#a1792a', postit: '#fbe88f',
  zApple: '#c5ccd6', zAmazon: '#33b3ab', zMuse: '#9a7cf0', zCf: '#f2903c', zScreen: '#69b87c', vault: '#3e4757',
};

// ---------- text helpers ----------
// a line whose words blur in one after another; returns the element
function words(parent, text, css, cls) {
  const el = HT('div', { class: cls || 'hf-words', css: css || '' }, parent);
  text.split(' ').forEach((w, i) => { if (i) el.appendChild(document.createTextNode(' ')); HT('span', { text: w, css: 'display:inline-block' }, el); });
  return el;
}
function wordsIn(tl, el, t, gap = 0.07) {
  const ws = el.querySelectorAll('span');
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, t);
  ws.forEach((w, i) => tl.fromTo(w, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.16, ease: 'power2.out' }, t + i * gap));
}
function out(tl, el, t, d = 0.3) { tl.fromTo(el, { opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(8px)', duration: d, ease: 'power3.in', immediateRender: false }, t); }
function show(tl, el, t, d = 0.5, from) {
  tl.fromTo(el, Object.assign({ opacity: 0, filter: 'blur(10px)', scale: 0.96 }, from || {}),
    { opacity: 1, filter: 'blur(0px)', scale: 1, x: 0, y: 0, duration: d, ease: 'expo.out' }, t);
}
// types text into el between t and t+dur
function typeOn(tl, el, text, t, dur) {
  const o = { n: 0 };
  el.textContent = '';
  tl.fromTo(o, { n: 0 }, { n: text.length, duration: dur, ease: 'none', onUpdate: () => { el.textContent = text.slice(0, Math.round(o.n)); } }, t);
}
function typeHTML(tl, el, html, t, dur) { // reveal a highlighted block line by line via clip
  el.innerHTML = html;
  const lines = el.querySelectorAll('.ln');
  lines.forEach((l, i) => tl.fromTo(l, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: Math.max(0.12, dur / lines.length), ease: 'none' }, t + i * dur / lines.length));
}
// JSON / HTTP highlighting into lines
function code(src) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return src.split('\n').map(l => {
    let h = esc(l);
    h = h.replace(/("(?:[^"\\]|\\.)*")(\s*:)?/g, (m, s, c) => c ? `<b class="k">${s}</b>${c}` : `<b class="s">${s}</b>`)
         .replace(/\b(true|false|null|\d+(?:\.\d+)?)\b(?![^<]*>)/g, '<b class="n">$1</b>')
         .replace(/^(POST|PUT|GET|WS)\b/, '<b class="m">$1</b>')
         .replace(/^([A-Za-z-]+:)(?= )/, '<b class="h">$1</b>');
    return `<div class="ln">${h || '&nbsp;'}</div>`;
  }).join('');
}

// ---------- packets on any SVG path ----------
function packet(tl, path, t, dur, opts = {}) {
  const svgEl = path.ownerSVGElement;
  const parent = opts.parent || path.parentNode;
  const c = SV('circle', { r: opts.r || 9, fill: opts.color || '#fff', stroke: opts.stroke || '#fff', 'stroke-width': opts.sw || 3, opacity: 0 }, parent);
  const L = path.getTotalLength(), NS_ = 240, samp = [];
  for (let i = 0; i <= NS_; i++) { const q = path.getPointAtLength(L * i / NS_); samp.push([q.x, q.y]); }
  const o = { p: 0 };
  const place = () => { const u = Math.min(1, Math.max(0, opts.reverse ? 1 - o.p : o.p)) * NS_, i = Math.min(NS_ - 1, Math.floor(u)), fr = u - i;
    c.setAttribute('cx', f1(samp[i][0] + (samp[i + 1][0] - samp[i][0]) * fr)); c.setAttribute('cy', f1(samp[i][1] + (samp[i + 1][1] - samp[i][1]) * fr)); };
  place();
  tl.fromTo(c, { opacity: 0 }, { opacity: 1, duration: 0.08 }, t);
  tl.fromTo(o, { p: 0 }, { p: 1, duration: dur, ease: opts.ease || 'power1.inOut', onUpdate: place }, t);
  tl.fromTo(c, { opacity: 1 }, { opacity: 0, duration: 0.15, immediateRender: false }, t + dur);
  return c;
}
function drawPath(tl, path, t, dur, ease = 'power2.inOut') {
  const L = path.getTotalLength();
  path.style.strokeDasharray = `${L} ${L + 40}`;
  tl.fromTo(path, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: dur, ease }, t);
}

// ---------- the isometric world ----------
function isoWorld(host, o = {}) {
  const S = o.S || 40, C = Math.cos(Math.PI / 6);
  const P = (x, y, z = 0) => [(x - y) * C * S, (x + y) * 0.5 * S - z * S];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const grow = (x, y) => { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); };
  const pts = (a, track = true) => a.map(p => { const q = P(...p); if (track) grow(q[0], q[1]); return f1(q[0]) + ',' + f1(q[1]); }).join(' ');
  HT('style', { text: `
    .iso text{font-family:Outfit,Inter,sans-serif}
    .iso .box polygon,.iso .box path,.iso .box ellipse{stroke:rgba(24,32,44,.22);stroke-width:1;stroke-linejoin:round}
    .iso .box .top{fill:var(--c)} .iso .box .lf{fill:color-mix(in oklab,var(--c),#000 15%)} .iso .box .rt{fill:color-mix(in oklab,var(--c),#000 30%)}
    .iso .plat .top{fill:color-mix(in oklab,var(--c) 26%,#fff)} .iso .plat .lf{fill:color-mix(in oklab,var(--c) 55%,#000 10%)} .iso .plat .rt{fill:color-mix(in oklab,var(--c) 45%,#000 28%)}
    .iso .grid{stroke:#18202c;opacity:.06;stroke-width:1.2}
    .iso .ztitle{font:800 34px Outfit,sans-serif;letter-spacing:.12em}
    .iso .zsub{font:500 20px 'IBM Plex Mono',monospace;fill:#5b6576}
    .iso .glyph{font:700 30px Outfit,sans-serif;fill:rgba(255,255,255,.95)}
    .iso .md{font:500 11.5px 'IBM Plex Mono',monospace;fill:#3a3320} .iso .md.h{font-weight:700;fill:#7a4d10}
    .iso .flow{fill:none;stroke-width:5;stroke-linecap:round} .iso .glow{fill:none;stroke-width:16;opacity:.16;stroke-linecap:round}
    .iso .reply{stroke-dasharray:12 12;stroke-width:4}
    .iso .shadow{fill:none;stroke:#18202c;stroke-width:4;opacity:.07;stroke-linecap:round}
  ` }, host);
  host.setAttribute('data-layout-ignore', '');
  const svg = SV('svg', { class: 'iso', overflow: 'visible' }, host);
  const defs = SV('defs', {}, svg);
  for (const [id, c] of [['alexa', COL.zAmazon], ['siri', COL.siri], ['muse', COL.zMuse]]) {
    const g = SV('radialGradient', { id: o.prefix + 'g-' + id, cx: '35%', cy: '30%', r: '75%' }, defs);
    SV('stop', { offset: '0', 'stop-color': `color-mix(in oklab, ${c}, #fff 55%)` }, g);
    SV('stop', { offset: '.6', 'stop-color': c }, g);
    SV('stop', { offset: '1', 'stop-color': `color-mix(in oklab, ${c}, #000 35%)` }, g);
  }
  const root = SV('g', {}, svg);
  const Lg = { grid: SV('g', {}, root), zones: SV('g', {}, root), shadow: SV('g', {}, root), flow: SV('g', {}, root), top: SV('g', {}, root) };
  const MAT = { 'top-x': [C, .5, -C, .5], left: [C, .5, 0, 1], right: [C, -.5, 0, 1] };
  const ftext = (parent, str, [x, y, z], plane, cls, css) => {
    const [px, py] = P(x, y, z);
    return SV('text', { transform: `matrix(${MAT[plane].map(n => n.toFixed(4)).join(',')},${f1(px)},${f1(py)})`, class: cls, style: css || '', text: str }, parent);
  };
  const box = (parent, { x, y, z = 0, w, d, h, c, cls = 'box' }) => {
    const g = SV('g', { class: cls === 'box' ? 'box' : 'box ' + cls, style: `--c:${c}` }, parent);
    SV('polygon', { class: 'lf', points: pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]) }, g);
    SV('polygon', { class: 'rt', points: pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]) }, g);
    SV('polygon', { class: 'top', points: pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]) }, g);
    return g;
  };
  const quad = (parent, x, y, z, w, h, plane, attrs) => {
    const p = plane === 'left' ? [[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]] : [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]];
    return SV('polygon', Object.assign({ points: pts(p) }, attrs), parent);
  };
  const cyl = (parent, { x, y, z, r, h, c }) => {
    const g = SV('g', { class: 'box', style: `--c:${c}` }, parent);
    const [bx, by] = P(x, y, z), [, ty] = P(x, y, z + h);
    const rx = r * S * 1.2247, ry = r * S * .7071; grow(bx - rx, ty - ry); grow(bx + rx, by + ry);
    SV('path', { class: 'lf', d: `M${f1(bx - rx)},${f1(ty)} L${f1(bx - rx)},${f1(by)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(bx + rx)},${f1(by)} L${f1(bx + rx)},${f1(ty)} Z` }, g);
    SV('ellipse', { class: 'top', cx: f1(bx), cy: f1(ty), rx: f1(rx), ry: f1(ry) }, g);
    return g;
  };
  const sphere = (parent, [x, y, z], r, grad) => { const [cx, cy] = P(x, y, z); return SV('circle', { cx: f1(cx), cy: f1(cy), r: f1(r * S), fill: `url(#${o.prefix}g-${grad})` }, parent); };
  const mini = (parent, x, y, z, w, h, plane = 'left') => {
    quad(parent, x, y, z, w, h, plane, { fill: '#d9c8a8' });
    quad(parent, x + w * .2, y, z + h * .8, w * .6, h * .12, plane, { fill: '#7a5a3a' });
    const cols = ['#fbe88f', '#f7b6c8', '#a9d4f5', '#b9e3a6', '#fcd4a9', '#d9c4f5']; let i = 0;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) quad(parent, x + w * .08 + c * w * .3, y, z + h * .08 + (1 - r) * h * .35, w * .22, h * .27, plane, { fill: cols[i++], stroke: 'rgba(0,0,0,.12)', 'stroke-width': 1 });
  };

  // grid (not counted in bounds)
  for (let x = -16; x <= 38; x += 2) SV('polyline', { class: 'grid', points: pts([[x, -10, 0], [x, 38, 0]], false), fill: 'none' }, Lg.grid);
  for (let y = -10; y <= 38; y += 2) SV('polyline', { class: 'grid', points: pts([[-16, y, 0], [38, y, 0]], false), fill: 'none' }, Lg.grid);

  const zones = {};
  const ZD = [
    { id: 'muse', x: -14.5, y: 8.5, w: 13, d: 12.5, c: COL.zMuse, title: 'MUSE', sub: 'Meta AI · writes the file' },
    { id: 'cf', x: 2.5, y: 1.5, w: 21.5, d: 19.5, c: COL.zCf, title: 'CLOUDFLARE', sub: 'edge worker · AI · storage' },
    { id: 'apple', x: -7, y: 23.5, w: 10, d: 10, c: COL.zApple, title: 'APPLE', sub: 'iPhone · Siri Shortcut' },
    { id: 'screens', x: 25, y: -7.5, w: 12.5, d: 15, c: COL.zScreen, title: 'SCREENS', sub: 'TV · laptop · phone' },
    { id: 'amazon', x: 6, y: 24.5, w: 13, d: 11, c: COL.zAmazon, title: 'AMAZON', sub: 'Echo Show · Alexa skill' },
  ];
  const nodes = {};
  const N = (zone, id) => (nodes[id] = SV('g', { 'data-node': id }, zones[zone]));
  for (const z of ZD) {
    const g = zones[z.id] = SV('g', { 'data-zone': z.id }, Lg.zones);
    box(g, { x: z.x, y: z.y, z: -.6, w: z.w, d: z.d, h: .6, c: z.c, cls: 'plat' });
    ftext(g, z.title, [z.x + .7, z.y + z.d - .75, 0], 'top-x', 'ztitle', `fill:color-mix(in oklab,${z.c},#18202c 45%)`);
    ftext(g, z.sub, [z.x + .7, z.y + z.d - .15, 0], 'top-x', 'zsub');
  }
  // Muse
  const SRC = [{ y: 9.6, c: COL.siri, g: '31', id: 'cal' }, { y: 13.1, c: COL.ai, g: '@', id: 'gmail' }, { y: 16.6, c: COL.alexa, g: '✉', id: 'mail' }];
  for (const s of SRC) { const g = N('muse', s.id); box(g, { x: -13.5, y: s.y, w: 2.6, d: 2.6, h: 1.5, c: s.c }); ftext(g, s.g, [-12.9, s.y + 1.75, 1.5], 'top-x', 'glyph', 'font-size:34px'); }
  { const g = N('muse', 'muse'); cyl(g, { x: -5, y: 14.5, z: 0, r: 1.9, h: 3.4, c: COL.zMuse }); sphere(g, [-5, 14.5, 4.6], .75, 'muse'); }
  // Cloudflare
  { const g = N('cf', 'ai'); box(g, { x: 6, y: 3, w: 4.4, d: 4.2, h: 2.6, c: COL.ai }); ftext(g, '✦ AI', [6.7, 6.2, 2.6], 'top-x', 'glyph', 'font-size:40px'); }
  { const g = N('cf', 'assets'); for (let i = 0; i < 3; i++) box(g, { x: 16, y: 3, z: i * .55, w: 5.4, d: 4.4, h: .32, c: COL.asset }); ftext(g, 'public/', [16.6, 6.6, 1.42], 'top-x', 'glyph', 'font-size:30px'); }
  { const g = N('cf', 'worker'); box(g, { x: 6, y: 11, w: 5, d: 5, h: 3, c: COL.zCf }); ftext(g, 'worker.js', [6.6, 14.9, 3], 'top-x', 'glyph', 'font-size:32px');
    ['/api/tasks', '/api/tasks/command', '/api/tasks/add', '/alexa', '/api/live'].forEach((r, i) => ftext(g, r, [6.25, 16, 2.62 - i * .56], 'left', 'glyph', "font:500 15px 'IBM Plex Mono',monospace")); }
  { const g = N('cf', 'vault'); box(g, { x: 3.6, y: 16.8, w: 2.6, d: 2.6, h: 1.7, c: COL.vault }); const [kx, ky] = P(4.9, 19.42, .95); SV('circle', { cx: f1(kx), cy: f1(ky - 6), r: 7, fill: COL.key }, g); SV('rect', { x: f1(kx - 3), y: f1(ky - 2), width: 6, height: 13, fill: COL.key }, g); }
  { const g = N('cf', 'do'); box(g, { x: 16, y: 10, w: 5, d: 5, h: 3.4, c: COL.zCf }); ftext(g, 'Board', [16.7, 14.6, 3.4], 'top-x', 'glyph', 'font-size:36px'); ftext(g, 'Durable Object', [16.3, 15.02, 2.55], 'left', 'glyph', 'font-size:20px'); }
  { const g = N('cf', 'db'); cyl(g, { x: 21, y: 18.4, z: 0, r: 1.1, h: 1.9, c: COL.asset }); }
  { const g = N('cf', 'sheet'); box(g, { x: 15.2, y: 9.2, z: 5.6, w: 6.8, d: 6.6, h: .16, c: COL.postit });
    [['## Appointments', 1], ['- [ ] Dentist – Thu 4:15pm'], ['- [x] Eye test – Mon 9am'], ['## School', 1], ['- [ ] Math packet due Dec 9'], ['- [ ] Book fair – 12 Dec'], ['## Reminders', 1], ['- [ ] Check Disney bundle'], ['## Groceries', 1], ['- [ ] Milk (2%)'], ['- [ ] Bread – seeded']]
      .forEach(([t, h], i) => ftext(g, t, [15.6, 9.9 + i * .54, 5.77], 'top-x', 'md' + (h ? ' h' : ''))); }
  // Apple
  { const g = N('apple', 'shortcut'); box(g, { x: -5.6, y: 29.2, w: 4.4, d: 2.4, h: .35, c: COL.siri }); ftext(g, 'Family Board', [-5.2, 30.7, .35], 'top-x', 'glyph', 'font-size:20px'); }
  { const g = N('apple', 'phone'); box(g, { x: -3, y: 26, w: 2.5, d: .35, h: 4.8, c: COL.zApple }); quad(g, -2.85, 26.36, .25, 2.2, 4.3, 'left', { fill: '#222a37' }); const [ox, oy] = P(-1.75, 26.36, 3); SV('circle', { cx: f1(ox), cy: f1(oy), r: 24, fill: `url(#${o.prefix}g-siri)` }, g); }
  // Screens
  { const g = N('screens', 'tv'); box(g, { x: 30.4, y: -2.5, w: 1.2, d: 1, h: 1, c: COL.vault }); box(g, { x: 27, y: -2.2, z: 1, w: 8.4, d: .4, h: 5.2, c: COL.vault }); quad(g, 27.25, -1.79, 1.22, 7.9, 4.75, 'left', { fill: '#222a37' }); mini(g, 27.4, -1.78, 1.38, 7.6, 4.45); }
  { const g = N('screens', 'laptop'); box(g, { x: 28, y: 2.1, z: .3, w: 5.6, d: .3, h: 3.5, c: COL.zApple }); quad(g, 28.2, 2.41, .5, 5.2, 3.1, 'left', { fill: '#222a37' }); mini(g, 28.35, 2.42, .62, 4.9, 2.85); box(g, { x: 28, y: 2.4, w: 5.6, d: 3.8, h: .3, c: COL.zApple }); }
  { const g = N('screens', 'phone2'); box(g, { x: 34.2, y: 2.8, w: 2.2, d: 4, h: .22, c: COL.vault }); quad(g, 34.35, 2.95, .23, 1.9, 3.7, 'top', { fill: '#d9c8a8' });
    ['#fbe88f', '#f7b6c8', '#a9d4f5', '#b9e3a6'].forEach((c, i) => quad(g, 34.5 + (i % 2) * .85, 3.3 + Math.floor(i / 2) * 1.6, .24, .7, 1.2, 'top', { fill: c })); }
  // Amazon
  { const g = N('amazon', 'echo'); box(g, { x: 8, y: 30, w: 3.6, d: 1.6, h: 2.5, c: COL.vault }); quad(g, 8.3, 31.62, .35, 3, 1.9, 'left', { fill: '#222a37' }); mini(g, 8.45, 31.63, .5, 2.7, 1.6); }
  { const g = N('amazon', 'cloud'); [[15.8, 28.6, 4.6, .9], [14.6, 29.4, 4.9, 1.25], [15.6, 29.8, 5.2, 1.05], [16.4, 29.2, 4.7, .95]].forEach(([x, y, z, r]) => sphere(g, [x, y, z], r, 'alexa')); const [rx, ry] = P(15.2, 29.3, .02); SV('ellipse', { cx: f1(rx), cy: f1(ry), rx: 110, ry: 32, fill: '#18202c', opacity: .08 }, g); }

  // flows
  const K = { siri: COL.siri, alexa: COL.alexa, muse: COL.muse, ai: COL.ai, write: COL.write, push: COL.push, asset: COL.asset, key: COL.key };
  const flows = {};
  const flow = (id, a, b, lift, k, reply) => {
    const n = 40, pp = [], sh = [];
    for (let i = 0; i <= n; i++) { const t = i / n; const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t + lift * 4 * t * (1 - t); pp.push(P(x, y, z)); sh.push(P(x, y, 0)); }
    const d = 'M' + pp.map(p => p.map(f1).join(' ')).join(' L');
    pp.forEach(p => grow(p[0], p[1]));
    const g = SV('g', { 'data-flow': id }, Lg.flow);
    const shadow = SV('path', { class: 'shadow', d: 'M' + sh.map(p => p.map(f1).join(' ')).join(' L') }, Lg.shadow);
    const glow = reply ? null : SV('path', { class: 'glow', d, stroke: K[k] }, g);
    const path = SV('path', { class: 'flow' + (reply ? ' reply' : ''), d, stroke: K[k] }, g);
    flows[id] = { g, path, glow, shadow, color: K[k], reply };
  };
  const T = { phone: [-1.75, 26.2, 5], worker: [8.5, 13.5, 3], ai: [8.2, 5.1, 2.6], vault: [4.9, 18.1, 1.7], doTop: [18.5, 12.5, 3.4], echo: [9.8, 30.8, 2.5], cloud: [15.2, 29.2, 5.4], muse: [-5, 14.5, 5.2], assets: [18.7, 5.2, 1.4], tv: [31.2, -1.8, 4.2], laptop: [30.8, 2.3, 3.4], phone2: [35.3, 4.8, .25], db: [21, 18.4, 1.9], sheet: [18.6, 12.5, 5.8] };
  SRC.forEach(s => flow('src-' + s.id, [-12.2, s.y + 1.3, 1.5], [-5.2, 14.5, 2.6], 1.4, 'muse'));
  flow('muse', T.muse, T.worker, 5.5, 'muse');
  flow('siri', T.phone, T.worker, 6.5, 'siri');
  flow('siriReply', T.worker, [-1.2, 26.4, 4.4], 3, 'siri', true);
  flow('alexa1', T.echo, [14.8, 29.4, 4.4], 2.2, 'alexa');
  flow('alexa2', T.cloud, T.worker, 5, 'alexa');
  flow('alexaReply', [8.9, 14.2, 3], [14.2, 29.8, 4.2], 2.2, 'alexa', true);
  flow('alexaReply2', [14.3, 30.2, 4.3], [10.4, 31.2, 2.5], .8, 'alexa', true);
  flow('ai', [7.8, 12.6, 3], T.ai, 3.2, 'ai');
  flow('key', [7, 15.6, 2.4], T.vault, 1.6, 'key');
  flow('write', [10.2, 13.8, 3], T.doTop, 2.6, 'write');
  flow('db', [19.6, 14, 2.4], T.db, .6, 'write');
  flow('pushTV', [19.2, 11.4, 3.4], T.tv, 5.4, 'push');
  flow('pushLaptop', [19.6, 12, 3.4], T.laptop, 3.6, 'push');
  flow('pushPhone', [20, 12.8, 3.4], T.phone2, 2.6, 'push');
  flow('assets', T.assets, [29.6, -1.8, 5.6], 3.4, 'asset');
  flow('poll', [29.4, 2.3, 3.9], [10.6, 12, 3], 6.8, 'asset', true);

  const pad = 60; bx0 -= pad; by0 -= pad; bx1 += pad; by1 += pad;
  const W = bx1 - bx0, Hh = by1 - by0;
  svg.setAttribute('viewBox', `${f1(bx0)} ${f1(by0)} ${f1(W)} ${f1(Hh)}`);
  svg.setAttribute('width', f1(W)); svg.setAttribute('height', f1(Hh));
  host.style.width = f1(W) + 'px'; host.style.height = f1(Hh) + 'px';

  const w = { svg, P, T, nodes, flows, zones, layers: Lg, W, H: Hh };
  // 3D or named point → pixel inside the host div
  w.px = p => { const q = typeof p === 'string' ? T[p] : p; const [x, y] = P(...q); return [x - bx0, y - by0]; };
  w.cam = { x: 0, y: 0, scale: 1 };
  w.camAt = (p, z, ox = 0, oy = 0) => { if (p === 'all') { const s = Math.min(1920 / W, 1080 / Hh) * (z || 1); return { x: 960 - W * s / 2 + ox, y: 540 - Hh * s / 2 + oy, scale: s }; } const [x, y] = w.px(p); return { x: 960 + ox - x * z, y: 540 + oy - y * z, scale: z }; };
  w.setCam = (tl, p, z, ox, oy) => { w.cam = w.camAt(p, z, ox, oy); gsap.set(host, Object.assign({ transformOrigin: '0 0' }, w.cam)); tl.set(host, Object.assign({}, w.cam), 0); };
  w.move = (tl, p, z, t, dur = 1.8, ox, oy, ease = 'power2.inOut') => { const to = w.camAt(p, z, ox, oy); tl.fromTo(host, Object.assign({}, w.cam), Object.assign({ duration: dur, ease, immediateRender: false }, to), t); w.cam = to; };
  w.hideFlows = (ids) => { for (const id of ids || Object.keys(flows)) { const f = flows[id]; [f.path, f.glow, f.shadow].forEach(p => { if (!p) return; const L = p.getTotalLength(); p.style.strokeDasharray = `${L} ${L + 40}`; p.style.strokeDashoffset = L; }); } };
  w.draw = (tl, id, t, dur = 1.2) => { const f = flows[id]; [f.path, f.glow, f.shadow].forEach(p => p && drawPath(tl, p, t, dur)); if (f.reply) { /* dashed: restore dash pattern after drawing */ const L = f.path.getTotalLength(); tl.set(f.path, { strokeDasharray: '12 12', strokeDashoffset: 0 }, t + dur); } };
  w.pk = (tl, id, t, dur = 1.2, opts = {}) => packet(tl, flows[id].path, t, dur, Object.assign({ color: flows[id].color, parent: flows[id].g }, opts));
  w.label = (txt, p, size, opts = {}) => { // flat label in world space, sized for a zoom
    const [x, y] = P(...(typeof p === 'string' ? T[p] : p));
    const g = SV('g', { opacity: opts.hidden ? 0 : 1 }, Lg.top);
    const fs = size; const padX = fs * .55, h = fs * 1.7, wdt = txt.length * fs * (opts.mono ? .62 : .56) + padX * 2;
    const dx = opts.dx || 0, dy = opts.dy || 0;
    SV('rect', { x: f1(x + dx - wdt / 2), y: f1(y + dy - h / 2), width: f1(wdt), height: f1(h), rx: f1(h / 2), fill: '#fff', stroke: opts.color || COL.ink, 'stroke-width': fs * .1 }, g);
    SV('text', { x: f1(x + dx), y: f1(y + dy + fs * .35), 'text-anchor': 'middle', style: `font:${opts.mono ? `500 ${fs}px 'IBM Plex Mono',monospace` : `700 ${fs}px Outfit,sans-serif`};fill:${COL.ink}`, text: txt }, g);
    return g;
  };
  w.focusOnly = (tl, keepNodes, keepFlows, t, dur = .6) => { // dim everything else
    const keepN = new Set(keepNodes), keepF = new Set(keepFlows);
    for (const id in nodes) if (!keepN.has(id)) tl.fromTo(nodes[id], { opacity: 1 }, { opacity: .18, duration: dur, immediateRender: false }, t);
    for (const id in flows) if (!keepF.has(id)) { tl.fromTo(flows[id].g, { opacity: 1 }, { opacity: .12, duration: dur, immediateRender: false }, t); tl.fromTo(flows[id].shadow, { opacity: .07 }, { opacity: .02, duration: dur, immediateRender: false }, t); }
  };
  w.unfocus = (tl, t, dur = .6) => {
    for (const id in nodes) tl.to(nodes[id], { opacity: 1, duration: dur }, t);
    for (const id in flows) { tl.to(flows[id].g, { opacity: 1, duration: dur }, t); tl.to(flows[id].shadow, { opacity: .07, duration: dur }, t); }
  };
  return w;
}

// ---------- the post-it board (HTML) ----------
const NOTE_DATA = [
  { g: 'Appointments', c: '#fbe88f', lines: [['Eye test – Mon 9am', 'done'], ['Vet – Sat 10:30am']] },
  { g: 'School', c: '#f7b6c8', lines: [['Math packet – due Dec 9'], ['Book fair – 12 Dec'], ['Permission slip – Nov 20', 'overdue']] },
  { g: 'Reminders', c: '#a9d4f5', lines: [['Disney bundle – Tue-Wed', 'today'], ['Santa photo – Nov 21', 'past']] },
  { g: 'Groceries', c: '#b9e3a6', lines: [['Milk (2%)'], ['Bread – seeded'], ['Eggs', 'done']] },
  { g: 'Chores', c: '#fcd4a9', lines: [['Recycling (Tue)'], ['Fold laundry']] },
  { g: 'Kids', c: '#d9c4f5', lines: [['School PTM – Wed 6pm'], ['Library books Fri']] },
];
// builds a wall into parent (size w x h). Returns {wall, notes:[{el, lines:[{el,txt,strike,hl,ul}] }]}
function board(parent, w, h, opts = {}) {
  const s = w / 1600; // design at 1600 x 900
  const wall = HT('div', { css: `position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden;background:
    radial-gradient(120% 90% at 50% 10%, #efe3cc 0%, #e2d1b3 55%, #cdb894 100%);` }, parent);
  wall.setAttribute('data-layout-ignore', '');
  const banner = HT('div', { css: `position:absolute;left:${w / 2 - 330 * s}px;top:${26 * s}px;width:${660 * s}px;height:${92 * s}px;border-radius:${10 * s}px;
    background:linear-gradient(#8a6a46,#6f5236);box-shadow:0 ${8 * s}px ${18 * s}px rgba(60,40,20,.35);display:flex;align-items:center;justify-content:center;
    font:${58 * s}px 'Bradley Hand',cursive;color:#fbf1dc;letter-spacing:.01em`, text: opts.title || 'The Family Board' }, wall);
  const notes = [];
  const NW = 470 * s, NH = 330 * s, gx = 40 * s, gy = 52 * s, left = (w - (3 * NW + 2 * gx)) / 2, top = 160 * s;
  (opts.data || NOTE_DATA).forEach((n, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const el = HT('div', { css: `position:absolute;left:${left + col * (NW + gx)}px;top:${top + row * (NH + gy)}px;width:${NW}px;height:${NH}px;
      background:linear-gradient(170deg, color-mix(in oklab, ${n.c}, #fff 18%), ${n.c} 60%, color-mix(in oklab, ${n.c}, #000 6%));
      box-shadow:0 ${14 * s}px ${22 * s}px -${8 * s}px rgba(50,35,10,.45), 0 1px 0 rgba(0,0,0,.08);border-radius:${3 * s}px;padding:${44 * s}px ${30 * s}px 0` }, wall);
    gsap.set(el, { rotation: [-1.6, 1.1, -0.7, 1.4, -1.2, 0.8][i % 6] });
    HT('div', { css: `position:absolute;left:50%;top:${10 * s}px;width:${22 * s}px;height:${22 * s}px;margin-left:-${11 * s}px;border-radius:50%;
      background:radial-gradient(circle at 35% 35%, #ff7b6b, #c8322a 70%);box-shadow:0 ${3 * s}px ${4 * s}px rgba(0,0,0,.35)` }, el);
    HT('div', { css: `font:${30 * s}px 'Bradley Hand',cursive;color:#5a4320;margin-bottom:${10 * s}px;text-decoration:underline;text-decoration-thickness:${2 * s}px;text-underline-offset:${6 * s}px`, text: n.g }, el);
    const lines = [];
    const addLine = (txt, state) => {
      const li = HT('div', { css: `position:relative;font:${30 * s}px/1.32 'Bradley Hand',cursive;color:#1f2a44;margin:${6 * s}px 0;white-space:nowrap;display:flex;align-items:baseline;gap:${10 * s}px` }, el);
      const dot = HT('span', { css: `flex:none;width:${16 * s}px;height:${16 * s}px;border:${2.4 * s}px solid #1f2a44;border-radius:50%;transform:translateY(${2 * s}px)` }, li);
      const wrap = HT('span', { css: 'position:relative;display:inline-block' }, li);
      const hl = HT('span', { css: `position:absolute;left:-${6 * s}px;right:-${6 * s}px;top:${8 * s}px;bottom:${2 * s}px;background:${n.c === '#fbe88f' ? '#ff9fc0' : '#ffe53b'};mix-blend-mode:multiply;opacity:.75;transform-origin:left center;border-radius:${4 * s}px` }, wrap);
      const tx = HT('span', { css: 'position:relative', text: txt }, wrap);
      const strike = HT('span', { css: `position:absolute;left:-${4 * s}px;right:-${4 * s}px;top:52%;height:${4.5 * s}px;background:#1f2a44;border-radius:${3 * s}px;transform-origin:left center` }, wrap);
      const ul = SV('svg', { viewBox: '0 0 100 6', preserveAspectRatio: 'none', style: `position:absolute;left:0;right:0;bottom:-${6 * s}px;height:${9 * s}px;width:100%;overflow:visible` }, wrap);
      SV('path', { d: 'M0 3 Q 5 0 10 3 T 20 3 T 30 3 T 40 3 T 50 3 T 60 3 T 70 3 T 80 3 T 90 3 T 100 3', fill: 'none', stroke: '#d0261e', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' }, ul);
      const bang = HT('span', { css: `position:absolute;left:-${28 * s}px;top:0;font:700 ${34 * s}px Outfit,sans-serif;color:#d0261e`, text: '!' }, wrap);
      gsap.set(hl, { scaleX: state === 'today' ? 1 : 0 }); gsap.set(strike, { scaleX: state === 'done' ? 1 : 0 });
      ul.style.opacity = state === 'overdue' ? 1 : 0; bang.style.opacity = state === 'overdue' ? 1 : 0;
      if (state === 'past') li.style.opacity = .45;
      if (state === 'done') li.style.opacity = .75;
      const L = { el: li, txt: tx, strike, hl, ul, bang, dot };
      lines.push(L); return L;
    };
    n.lines.forEach(([t, st]) => addLine(t, st));
    const stamp = HT('div', { css: `position:absolute;right:${14 * s}px;top:${12 * s}px;font:800 ${22 * s}px Outfit,sans-serif;letter-spacing:.12em;padding:${4 * s}px ${10 * s}px;border:${3 * s}px solid #d0261e;color:#d0261e;border-radius:${6 * s}px;opacity:0` }, el);
    const st = n.lines.find(l => l[1] === 'today') ? 'TODAY' : n.lines.find(l => l[1] === 'overdue') ? 'OVERDUE' : '';
    if (st) { stamp.textContent = st; stamp.style.opacity = .9; gsap.set(stamp, { rotation: 8 }); }
    notes.push({ el, lines, addLine, stamp, data: n });
  });
  return { wall, notes, banner, s };
}

// ---------- devices ----------
function iphone(parent, x, y, sc = 1) {
  const W = 420, H = 880;
  const ph = HT('div', { 'data-layout-ignore': '', css: `position:absolute;left:${x}px;top:${y}px;width:${W}px;height:${H}px;border-radius:72px;background:#0d0f13;
    box-shadow:0 0 0 3px #3a3f48, 0 40px 80px rgba(20,24,32,.35), inset 0 0 0 2px #22262d;padding:16px` }, parent);
  gsap.set(ph, { scale: sc, transformOrigin: '50% 50%' });
  const scr = HT('div', { css: `position:relative;width:100%;height:100%;border-radius:58px;overflow:hidden;
    background:linear-gradient(165deg,#2b3c5a 0%,#3e5f86 45%,#d79a6e 100%)` }, ph);
  HT('div', { css: 'position:absolute;left:50%;top:14px;width:124px;height:36px;margin-left:-62px;border-radius:20px;background:#000;z-index:5' }, scr);
  HT('div', { css: "position:absolute;left:34px;top:18px;font:600 22px Inter,sans-serif;color:#fff", text: '7:40' }, scr);
  const clock = HT('div', { css: "position:absolute;left:0;right:0;top:120px;text-align:center;font:300 118px/1 Outfit,sans-serif;color:rgba(255,255,255,.92)", text: '7:40' }, scr);
  const date = HT('div', { css: "position:absolute;left:0;right:0;top:96px;text-align:center;font:600 24px Inter,sans-serif;color:rgba(255,255,255,.85)", text: 'Thursday, November 26'.replace('Thursday, November 26', 'Tuesday, November 24') }, scr);
  const dim = HT('div', { css: 'position:absolute;inset:0;background:rgba(8,10,16,.55);opacity:0' }, scr);
  const edge = HT('div', { css: `position:absolute;inset:0;border-radius:58px;opacity:0;
    box-shadow:inset 0 0 0 7px rgba(255,255,255,.0), inset 0 0 34px 10px #7b6cff, inset 0 0 60px 4px #ff7ab6, inset 0 -30px 60px -10px #38c8ff` }, scr);
  const panel = HT('div', { css: `position:absolute;left:22px;right:22px;bottom:150px;border-radius:30px;background:rgba(250,250,252,.96);
    padding:26px 26px 28px;opacity:0;box-shadow:0 10px 30px rgba(0,0,0,.25)` }, scr);
  const appRow = HT('div', { css: "display:flex;align-items:center;gap:14px;font:600 22px Inter,sans-serif;color:#5b6576;margin-bottom:12px" }, panel);
  HT('div', { css: `width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#ff6a88,#ff9a3c);display:grid;place-items:center;color:#fff;font:700 22px Outfit`, text: '▦' }, appRow);
  HT('span', { text: 'FAMILY BOARD' }, appRow);
  const ask = HT('div', { css: "font:700 34px/1.2 Inter,sans-serif;color:#18202c" }, panel);
  const said = HT('div', { css: `position:absolute;left:34px;right:34px;bottom:70px;font:600 30px/1.25 Inter,sans-serif;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.4)` }, scr);
  return { el: ph, scr, dim, edge, panel, ask, said, clock, date };
}

function echoShow(parent, x, y, sc = 1) {
  const W = 1000, H = 640;
  const dev = HT('div', { 'data-layout-ignore': '', css: `position:absolute;left:${x}px;top:${y}px;width:${W}px;height:${H + 110}px` }, parent);
  gsap.set(dev, { scale: sc, transformOrigin: '50% 100%' });
  HT('div', { css: `position:absolute;left:40px;right:40px;bottom:0;height:150px;border-radius:30px 30px 40px 40px;
    background:repeating-linear-gradient(90deg,#2d3139 0 3px,#353a43 3px 6px);box-shadow:0 30px 60px rgba(0,0,0,.45)` }, dev);
  const frame = HT('div', { css: `position:absolute;left:0;top:0;width:${W}px;height:${H}px;border-radius:34px;background:#0b0c0f;padding:26px;box-shadow:0 30px 60px rgba(0,0,0,.4)` }, dev);
  const scr = HT('div', { css: `position:relative;width:100%;height:100%;border-radius:12px;overflow:hidden;background:#101a26` }, frame);
  const bg = HT('div', { css: `position:absolute;inset:0;background:linear-gradient(180deg,#14263a,#0f1a28)` }, scr);
  const clock = HT('div', { css: "position:absolute;left:40px;top:30px;font:300 46px Outfit,sans-serif;color:#e9f2ff", text: '6:02' }, scr);
  const big = HT('div', { css: "position:absolute;left:60px;right:60px;top:170px;font:600 54px/1.2 Inter,sans-serif;color:#fff" }, scr);
  const small = HT('div', { css: "position:absolute;left:60px;right:60px;top:110px;font:600 30px Inter,sans-serif;color:#7fd8ff;letter-spacing:.06em" }, scr);
  const bar = HT('div', { css: `position:absolute;left:0;right:0;bottom:0;height:12px;background:linear-gradient(90deg,#00caff,#1f6bff,#00caff);transform-origin:50% 50%` }, scr);
  gsap.set(bar, { scaleX: 0 });
  return { el: dev, scr, big, small, bar, clock, bg };
}

// screen position of a world point under a camera state
function worldScreen(w, p, cam) { const [x, y] = w.px(p); cam = cam || w.cam; return [cam.x + x * cam.scale, cam.y + y * cam.scale]; }
// a big HTML pill label pinned to a screen point (anchor: bottom-centre)
function tag(parent, text, color, xy, opts = {}) {
  const el = HT('div', { css: `position:absolute;left:${xy[0]}px;top:${xy[1]}px;transform:translate(-50%,-100%);white-space:nowrap;
    display:flex;align-items:center;gap:14px;padding:14px 24px;border-radius:999px;background:#fff;border:3px solid ${color};
    font:700 ${opts.size || 34}px/1 Outfit,sans-serif;color:#18202c;box-shadow:0 16px 32px rgba(20,24,32,.16)` }, parent);
  HT('i', { css: `width:${(opts.size || 34) * .55}px;height:${(opts.size || 34) * .55}px;border-radius:50%;background:${color};flex:none` }, el);
  HT('span', { text }, el);
  if (opts.sub) HT('span', { css: `font:500 ${Math.max(28, (opts.size || 34) * .8)}px 'IBM Plex Mono',monospace;color:#5b6576`, text: opts.sub }, el);
  return el;
}
// a white card with a coloured header strip and code/body
function card(parent, x, y, w, title, color, bodyHTML, opts = {}) {
  const el = HT('div', { css: `position:absolute;left:${x}px;top:${y}px;width:${w}px;background:#fff;border-radius:22px;overflow:hidden;
    box-shadow:0 24px 48px rgba(20,24,32,.2);border:2px solid color-mix(in oklab,${color} 40%,#fff)` }, parent);
  const hd = HT('div', { css: `display:flex;align-items:center;gap:12px;padding:16px 24px;background:color-mix(in oklab,${color} 14%,#fff);
    font:700 ${opts.hs || 30}px Outfit,sans-serif;color:color-mix(in oklab,${color},#18202c 35%)` }, el);
  HT('i', { css: `width:16px;height:16px;border-radius:50%;background:${color}` }, hd); HT('span', { text: title }, hd);
  const bd = HT('div', { css: `padding:18px 26px 22px;font:${opts.mono === false ? `400 ${opts.fs || 32}px/1.35 Inter,sans-serif` : `500 ${opts.fs || 28}px/1.45 'IBM Plex Mono',monospace`};color:#18202c;white-space:pre`, html: bodyHTML || '' }, el);
  return { el, bd, hd };
}
// a full-frame caption line at the bottom-left, words blur in
function caption(parent, text, opts = {}) {
  return words(parent, text, `position:absolute;left:${opts.x ?? 110}px;${opts.top != null ? `top:${opts.top}px` : `bottom:${(opts.bottom ?? 90) + 100}px`};max-width:${opts.w || 1300}px;
    font:800 ${opts.size || 64}px/1.08 Outfit,sans-serif;letter-spacing:-.02em;color:${opts.color || '#18202c'};text-wrap:balance;
    ${opts.bare ? '' : 'width:fit-content;background:rgba(255,255,255,.94);padding:14px 30px 18px;border-radius:22px;box-shadow:0 16px 36px rgba(20,24,32,.14)'}`);
}
