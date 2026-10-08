// =====================================================================
//  نظام الشهادات — 40 تصميم (Canvas) + اختيار الأدمن + إصدار للطالب
//  - الشهادة بتتصدر بـ "لقطة" (snapshot) من البيانات والتصميم وقت الإصدار
//    فتغيير التصميم لاحقاً مايأثرش على الشهادات القديمة.
// =====================================================================
import {
  ref, get, set, update, onValue, query, limitToLast, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const X = () => window.__exam; // helpers من main.js
const CW = 1400, CH = 990;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- utils
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function rrect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function star(c, cx, cy, ro, ri, n, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = rot + (i * Math.PI) / n; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  c.closePath();
}
function poly(c, cx, cy, r, n, rot = -Math.PI / 2) {
  c.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i * TAU) / n; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath();
}
function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
function withAlpha(hex, a) {
  const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
}
function ruleFlourish(c, cx, y, w, col, lw = 2) {
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw;
  c.beginPath(); c.moveTo(cx - w / 2, y); c.lineTo(cx - 16, y); c.moveTo(cx + 16, y); c.lineTo(cx + w / 2, y); c.stroke();
  c.beginPath(); c.moveTo(cx, y - 8); c.lineTo(cx + 8, y); c.lineTo(cx, y + 8); c.lineTo(cx - 8, y); c.closePath(); c.fill(); c.restore();
}

// ---------------------------------------------------------------- text
const isArabic = (s) => /[\u0600-\u06FF]/.test(s);
function tx(c, str, x, y, o = {}) {
  if (str === undefined || str === null || str === "") return;
  str = String(str);
  const size = o.size || 28, weight = o.weight || 400;
  const fam = o.font || '"Cairo","Tajawal",sans-serif';
  c.save();
  c.textBaseline = "middle"; c.textAlign = o.align || "center";
  c.direction = o.dir || (isArabic(str) ? "rtl" : "ltr");
  let s = size;
  c.font = `${o.italic ? "italic " : ""}${weight} ${s}px ${fam}`;
  if (o.maxW) { const w = c.measureText(str).width; if (w > o.maxW) { s = Math.max(Math.floor(size * (o.maxW / w)), o.minSize || 14); c.font = `${o.italic ? "italic " : ""}${weight} ${s}px ${fam}`; } }
  if (o.spacing && "letterSpacing" in c) c.letterSpacing = o.spacing + "px";
  if (o.shadow) { c.shadowColor = o.shadow; c.shadowBlur = o.shadowBlur || 8; c.shadowOffsetY = 2; }
  if (o.stroke) { c.lineWidth = o.strokeW || 3; c.strokeStyle = o.stroke; c.strokeText(str, x, y); }
  c.fillStyle = o.color || "#222"; c.fillText(str, x, y);
  c.restore();
}

// ---------------------------------------------------------------- backgrounds
const BG = {
  solid: (c, p) => { c.fillStyle = p.bg; c.fillRect(0, 0, CW, CH); },
  grad: (c, p) => { c.fillStyle = lg(c, 0, 0, CW, CH, [[0, p.bg], [1, p.bg2]]); c.fillRect(0, 0, CW, CH); },
  radial: (c, p) => { const g = c.createRadialGradient(CW / 2, CH / 2, 60, CW / 2, CH / 2, CW * 0.75); g.addColorStop(0, p.bg); g.addColorStop(1, p.bg2); c.fillStyle = g; c.fillRect(0, 0, CW, CH); },
  stripes: (c, p) => { BG.solid(c, p); c.save(); c.strokeStyle = withAlpha(p.accent, 0.07); c.lineWidth = 14; for (let i = -CH; i < CW + CH; i += 46) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + CH, CH); c.stroke(); } c.restore(); },
  dots: (c, p) => { BG.solid(c, p); c.fillStyle = withAlpha(p.accent, 0.12); for (let y = 24; y < CH; y += 34) for (let x = ((y / 34) % 2 ? 41 : 24); x < CW; x += 34) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); } },
  grid: (c, p) => { BG.solid(c, p); c.strokeStyle = withAlpha(p.accent, 0.09); c.lineWidth = 1.5; for (let x = 0; x < CW; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, CH); c.stroke(); } for (let y = 0; y < CH; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(CW, y); c.stroke(); } },
  waves: (c, p) => { BG.grad(c, p); c.save(); for (let k = 0; k < 5; k++) { c.fillStyle = withAlpha(p.accent, 0.06 + k * 0.015); c.beginPath(); c.moveTo(0, CH); for (let x = 0; x <= CW; x += 20) c.lineTo(x, CH - 90 - k * 36 + Math.sin(x / 130 + k) * 34); c.lineTo(CW, CH); c.closePath(); c.fill(); } c.restore(); },
  islamic: (c, p) => { BG.solid(c, p); c.save(); c.strokeStyle = withAlpha(p.accent, 0.13); c.lineWidth = 1.6; const s = 90; for (let y = 0; y < CH + s; y += s) for (let x = 0; x < CW + s; x += s) { star(c, x, y, s * 0.46, s * 0.26, 8, Math.PI / 8); c.stroke(); poly(c, x + s / 2, y + s / 2, s * 0.2, 4, Math.PI / 4); c.stroke(); } c.restore(); },
  chevron: (c, p) => { BG.solid(c, p); c.save(); c.strokeStyle = withAlpha(p.accent, 0.1); c.lineWidth = 10; for (let y = -40; y < CH + 60; y += 56) { c.beginPath(); for (let x = 0; x <= CW; x += 70) c.lineTo(x, y + ((x / 70) % 2 ? 28 : 0)); c.stroke(); } c.restore(); },
  paper: (c, p) => { BG.radial(c, p); const r = rng(7); c.save(); for (let i = 0; i < 5500; i++) { c.fillStyle = `rgba(90,60,20,${r() * 0.045})`; c.fillRect(r() * CW, r() * CH, 2, 2); } c.restore(); },
  bokeh: (c, p) => { BG.grad(c, p); const r = rng(11); c.save(); for (let i = 0; i < 26; i++) { c.fillStyle = withAlpha(i % 2 ? p.accent : p.accent2, 0.06 + r() * 0.07); c.beginPath(); c.arc(r() * CW, r() * CH, 30 + r() * 110, 0, TAU); c.fill(); } c.restore(); },
  tri: (c, p) => { BG.solid(c, p); c.save(); c.fillStyle = p.accent; c.beginPath(); c.moveTo(0, 0); c.lineTo(430, 0); c.lineTo(0, 300); c.fill(); c.fillStyle = p.accent2; c.beginPath(); c.moveTo(0, 0); c.lineTo(250, 0); c.lineTo(0, 175); c.fill(); c.fillStyle = p.accent; c.beginPath(); c.moveTo(CW, CH); c.lineTo(CW - 430, CH); c.lineTo(CW, CH - 300); c.fill(); c.fillStyle = p.accent2; c.beginPath(); c.moveTo(CW, CH); c.lineTo(CW - 250, CH); c.lineTo(CW, CH - 175); c.fill(); c.restore(); },
  diag: (c, p) => { BG.solid(c, p); c.save(); c.fillStyle = withAlpha(p.accent, 0.12); c.beginPath(); c.moveTo(0, CH * 0.62); c.lineTo(CW, CH * 0.22); c.lineTo(CW, CH * 0.42); c.lineTo(0, CH * 0.82); c.fill(); c.fillStyle = withAlpha(p.accent2, 0.1); c.beginPath(); c.moveTo(0, CH * 0.82); c.lineTo(CW, CH * 0.42); c.lineTo(CW, CH * 0.5); c.lineTo(0, CH * 0.9); c.fill(); c.restore(); },
  circles: (c, p) => { BG.solid(c, p); c.save(); c.strokeStyle = withAlpha(p.accent, 0.12); c.lineWidth = 2; for (let i = 1; i < 9; i++) { c.beginPath(); c.arc(CW / 2, CH / 2, i * 90, 0, TAU); c.stroke(); } c.restore(); },
};

// ---------------------------------------------------------------- borders
const BORDER = {
  none: () => {},
  single: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 6; c.strokeRect(34, 34, CW - 68, CH - 68); },
  double: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 8; c.strokeRect(26, 26, CW - 52, CH - 52); c.lineWidth = 2; c.strokeRect(46, 46, CW - 92, CH - 92); },
  triple: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 3; [26, 40, 54].forEach((m, i) => { c.lineWidth = i === 1 ? 9 : 2.5; c.strokeRect(m, m, CW - 2 * m, CH - 2 * m); }); },
  thickthin: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 22; c.strokeRect(30, 30, CW - 60, CH - 60); c.strokeStyle = p.accent2; c.lineWidth = 3; c.strokeRect(62, 62, CW - 124, CH - 124); },
  dashed: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 5; c.setLineDash([22, 12]); rrect(c, 36, 36, CW - 72, CH - 72, 26); c.stroke(); c.setLineDash([]); c.lineWidth = 2; rrect(c, 56, 56, CW - 112, CH - 112, 18); c.stroke(); },
  rounded: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 10; rrect(c, 30, 30, CW - 60, CH - 60, 54); c.stroke(); c.lineWidth = 2.5; c.strokeStyle = p.accent2; rrect(c, 52, 52, CW - 104, CH - 104, 38); c.stroke(); },
  bracket: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 8; const L = 150, m = 34; [[m, m, 1, 1], [CW - m, m, -1, 1], [m, CH - m, 1, -1], [CW - m, CH - m, -1, -1]].forEach(([x, y, sx, sy]) => { c.beginPath(); c.moveTo(x + sx * L, y); c.lineTo(x, y); c.lineTo(x, y + sy * L); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(x + sx * (L - 40), y + sy * 22); c.lineTo(x + sx * 22, y + sy * 22); c.lineTo(x + sx * 22, y + sy * (L - 40)); c.stroke(); c.lineWidth = 8; }); c.lineWidth = 1.5; c.strokeRect(70, 70, CW - 140, CH - 140); },
  meander: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 3; c.strokeRect(24, 24, CW - 48, CH - 48); c.strokeRect(78, 78, CW - 156, CH - 156); c.lineWidth = 3.5; const u = 18; const run = (x0, y0, dx, dy, n) => { c.beginPath(); let x = x0, y = y0; c.moveTo(x, y); for (let i = 0; i < n; i++) { const nx = dx ? 1 : 0, ny = dy ? 1 : 0; const px = -ny * (dx ? 0 : 1) , py = nx; c.lineTo(x + dx * u * 3 * 0 + 0, y); x += dx * u * 3; y += dy * u * 3; } }; for (let x = 36; x < CW - 60; x += u * 3) { [[x, 36], [x, CH - 72 + 0]].forEach(([px, py], k) => { const d = k ? -1 : 1; c.beginPath(); c.moveTo(px, py + (k ? 36 : 0)); c.lineTo(px, py + (k ? 36 : 0) + d * 36); c.lineTo(px + 36, py + (k ? 36 : 0) + d * 36); c.lineTo(px + 36, py + (k ? 36 : 0) + d * 12); c.lineTo(px + 14, py + (k ? 36 : 0) + d * 12); c.lineTo(px + 14, py + (k ? 36 : 0) + d * 24); c.stroke(); }); } for (let y = 108; y < CH - 120; y += u * 3) { [[36, y], [CW - 72, y]].forEach(([px, py], k) => { const d = k ? -1 : 1; const bx = px + (k ? 36 : 0); c.beginPath(); c.moveTo(bx, py); c.lineTo(bx + d * 36, py); c.lineTo(bx + d * 36, py + 36); c.lineTo(bx + d * 12, py + 36); c.lineTo(bx + d * 12, py + 14); c.lineTo(bx + d * 24, py + 14); c.stroke(); }); } },
  scallop: (c, p) => { c.fillStyle = p.accent; const r = 20; for (let x = r; x < CW; x += r * 2) { c.beginPath(); c.arc(x, 0, r, 0, Math.PI); c.fill(); c.beginPath(); c.arc(x, CH, r, Math.PI, TAU); c.fill(); } for (let y = r; y < CH; y += r * 2) { c.beginPath(); c.arc(0, y, r, -Math.PI / 2, Math.PI / 2); c.fill(); c.beginPath(); c.arc(CW, y, r, Math.PI / 2, Math.PI * 1.5); c.fill(); } c.strokeStyle = p.accent; c.lineWidth = 3; c.strokeRect(52, 52, CW - 104, CH - 104); },
  band: (c, p) => { c.fillStyle = p.accent; c.fillRect(0, 0, CW, 38); c.fillRect(0, CH - 38, CW, 38); c.fillStyle = p.accent2; c.fillRect(0, 38, CW, 8); c.fillRect(0, CH - 46, CW, 8); },
  deco: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 4; const m = 34, s = 70; c.beginPath(); c.moveTo(m + s, m); c.lineTo(CW - m - s, m); c.lineTo(CW - m - s, m); c.lineTo(CW - m, m + s); c.lineTo(CW - m, CH - m - s); c.lineTo(CW - m - s, CH - m); c.lineTo(m + s, CH - m); c.lineTo(m, CH - m - s); c.lineTo(m, m + s); c.closePath(); c.stroke(); c.lineWidth = 1.8; c.beginPath(); c.moveTo(m + s + 14, m + 18); c.lineTo(CW - m - s - 14, m + 18); c.lineTo(CW - m - 18, m + s + 14); c.lineTo(CW - m - 18, CH - m - s - 14); c.lineTo(CW - m - s - 14, CH - m - 18); c.lineTo(m + s + 14, CH - m - 18); c.lineTo(m + 18, CH - m - s - 14); c.lineTo(m + 18, m + s + 14); c.closePath(); c.stroke(); },
  islamic: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 5; c.strokeRect(40, 40, CW - 80, CH - 80); c.lineWidth = 1.6; c.strokeRect(60, 60, CW - 120, CH - 120); c.fillStyle = p.bg; [[40, 40], [CW - 40, 40], [40, CH - 40], [CW - 40, CH - 40], [CW / 2, 40], [CW / 2, CH - 40]].forEach(([x, y]) => { star(c, x, y, 36, 18, 8, Math.PI / 8); c.fill(); c.lineWidth = 3; c.stroke(); c.fillStyle = p.accent; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill(); c.fillStyle = p.bg; }); },
  dotted: (c, p) => { c.fillStyle = p.accent; for (let x = 40; x <= CW - 40; x += 26) { [40, CH - 40].forEach((y) => { c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); }); } for (let y = 40; y <= CH - 40; y += 26) { [40, CW - 40].forEach((x) => { c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); }); } c.strokeStyle = p.accent2; c.lineWidth = 2; c.strokeRect(64, 64, CW - 128, CH - 128); },
  diamond: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 3; c.strokeRect(36, 36, CW - 72, CH - 72); c.fillStyle = p.accent; for (let x = 36; x <= CW - 36; x += 70) { [36, CH - 36].forEach((y) => { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 9, y); c.lineTo(x, y + 9); c.lineTo(x - 9, y); c.fill(); }); } for (let y = 36; y <= CH - 36; y += 70) { [36, CW - 36].forEach((x) => { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 9, y); c.lineTo(x, y + 9); c.lineTo(x - 9, y); c.fill(); }); } },
  frame: (c, p) => { c.fillStyle = p.accent; c.fillRect(0, 0, CW, CH); c.fillStyle = p.bg; c.fillRect(34, 34, CW - 68, CH - 68); c.strokeStyle = p.accent2; c.lineWidth = 3; c.strokeRect(50, 50, CW - 100, CH - 100); },
};

// ---------------------------------------------------------------- corners
const CORNER = {
  none: () => {},
  quarter: (c, p) => { c.strokeStyle = p.accent2; c.lineWidth = 3; [[0, 0, 0], [CW, 0, 1], [CW, CH, 2], [0, CH, 3]].forEach(([x, y, k]) => { c.save(); c.translate(x, y); c.rotate((k * Math.PI) / 2); for (let r = 60; r <= 180; r += 30) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI / 2); c.stroke(); } c.restore(); }); },
  leaf: (c, p) => { [[84, 84, 0], [CW - 84, 84, 1], [CW - 84, CH - 84, 2], [84, CH - 84, 3]].forEach(([x, y, k]) => { c.save(); c.translate(x, y); c.rotate((k * Math.PI) / 2); c.fillStyle = p.accent2; for (let i = 0; i < 5; i++) { c.save(); c.rotate(0.2 + i * 0.28); c.beginPath(); c.ellipse(46, 0, 42, 11, 0, 0, TAU); c.fill(); c.restore(); } c.fillStyle = p.accent; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill(); c.restore(); }); },
  star8: (c, p) => { [[90, 90], [CW - 90, 90], [CW - 90, CH - 90], [90, CH - 90]].forEach(([x, y]) => { c.fillStyle = p.accent; star(c, x, y, 40, 20, 8, Math.PI / 8); c.fill(); c.fillStyle = p.bg; star(c, x, y, 20, 10, 8, 0); c.fill(); c.fillStyle = p.accent2; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill(); }); },
  diamond: (c, p) => { [[84, 84], [CW - 84, 84], [CW - 84, CH - 84], [84, CH - 84]].forEach(([x, y]) => { c.fillStyle = p.accent; poly(c, x, y, 32, 4, 0); c.fill(); c.strokeStyle = p.accent2; c.lineWidth = 3; poly(c, x, y, 46, 4, 0); c.stroke(); }); },
  fan: (c, p) => { [[0, 0, 0], [CW, 0, 1], [CW, CH, 2], [0, CH, 3]].forEach(([x, y, k]) => { c.save(); c.translate(x, y); c.rotate((k * Math.PI) / 2); for (let i = 0; i < 9; i++) { c.strokeStyle = i % 2 ? p.accent2 : p.accent; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 0); const a = (i * Math.PI) / 16; c.lineTo(Math.cos(a) * 190, Math.sin(a) * 190); c.stroke(); } c.beginPath(); c.arc(0, 0, 190, 0, Math.PI / 2); c.stroke(); c.restore(); }); },
  tri: (c, p) => { c.fillStyle = p.accent2; [[0, 0, 0], [CW, 0, 1], [CW, CH, 2], [0, CH, 3]].forEach(([x, y, k]) => { c.save(); c.translate(x, y); c.rotate((k * Math.PI) / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(150, 0); c.lineTo(0, 150); c.fill(); c.fillStyle = p.accent; c.beginPath(); c.moveTo(0, 0); c.lineTo(90, 0); c.lineTo(0, 90); c.fill(); c.fillStyle = p.accent2; c.restore(); }); },
  spiral: (c, p) => { c.strokeStyle = p.accent; c.lineWidth = 3.5; [[96, 96, 0], [CW - 96, 96, 1], [CW - 96, CH - 96, 2], [96, CH - 96, 3]].forEach(([x, y, k]) => { c.save(); c.translate(x, y); c.rotate((k * Math.PI) / 2); c.beginPath(); for (let t = 0; t < 14; t += 0.2) { const r = 3 + t * 4.2; c.lineTo(Math.cos(t) * r, Math.sin(t) * r); } c.stroke(); c.restore(); }); },
  flower: (c, p) => { [[88, 88], [CW - 88, 88], [CW - 88, CH - 88], [88, CH - 88]].forEach(([x, y]) => { c.fillStyle = p.accent2; for (let i = 0; i < 6; i++) { c.save(); c.translate(x, y); c.rotate((i * TAU) / 6); c.beginPath(); c.ellipse(24, 0, 22, 11, 0, 0, TAU); c.fill(); c.restore(); } c.fillStyle = p.accent; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill(); }); },
};

// ---------------------------------------------------------------- emblems (cx, cy, r)
function ribbonTails(c, cx, cy, r, col, col2) {
  c.fillStyle = col2; c.beginPath(); c.moveTo(cx - r * 0.55, cy + r * 0.6); c.lineTo(cx - r * 0.85, cy + r * 1.75); c.lineTo(cx - r * 0.5, cy + r * 1.5); c.lineTo(cx - r * 0.2, cy + r * 1.85); c.lineTo(cx - r * 0.05, cy + r * 0.8); c.fill();
  c.beginPath(); c.moveTo(cx + r * 0.55, cy + r * 0.6); c.lineTo(cx + r * 0.85, cy + r * 1.75); c.lineTo(cx + r * 0.5, cy + r * 1.5); c.lineTo(cx + r * 0.2, cy + r * 1.85); c.lineTo(cx + r * 0.05, cy + r * 0.8); c.fill();
}
const EMBLEM = {
  none: () => {},
  rosette: (c, cx, cy, r, p) => { ribbonTails(c, cx, cy, r, p.accent, p.accent2); c.fillStyle = lg(c, cx - r, cy - r, cx + r, cy + r, [[0, p.accent2], [1, p.accent]]); star(c, cx, cy, r, r * 0.86, 24, 0); c.fill(); c.strokeStyle = p.bg; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r * 0.68, 0, TAU); c.stroke(); c.fillStyle = p.bg; star(c, cx, cy, r * 0.42, r * 0.18, 5); c.fill(); },
  medal: (c, cx, cy, r, p) => { c.fillStyle = p.accent2; c.beginPath(); c.moveTo(cx - r * 0.6, cy - r * 1.2); c.lineTo(cx - r * 0.1, cy - r * 0.6); c.lineTo(cx - r * 0.85, cy - r * 0.35); c.fill(); c.beginPath(); c.moveTo(cx + r * 0.6, cy - r * 1.2); c.lineTo(cx + r * 0.1, cy - r * 0.6); c.lineTo(cx + r * 0.85, cy - r * 0.35); c.fill(); c.fillStyle = lg(c, cx - r, cy - r, cx + r, cy + r, [[0, p.accent2], [0.5, p.accent], [1, p.accent2]]); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.strokeStyle = p.bg; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r * 0.8, 0, TAU); c.stroke(); c.fillStyle = p.bg; star(c, cx, cy, r * 0.55, r * 0.24, 5); c.fill(); },
  laurel: (c, cx, cy, r, p) => { c.save(); c.translate(cx, cy); [-1, 1].forEach((sd) => { c.save(); c.scale(sd, 1); c.strokeStyle = p.accent; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, Math.PI * 0.08, Math.PI * 0.95); c.stroke(); c.fillStyle = p.accent; for (let i = 0; i < 8; i++) { const th = Math.PI * (0.12 + i * 0.105); c.save(); c.translate(Math.cos(th) * r, Math.sin(th) * r); c.rotate(th + Math.PI / 2 + 0.55); c.beginPath(); c.ellipse(0, -r * 0.14, r * 0.1, r * 0.24, 0, 0, TAU); c.fill(); c.restore(); } c.restore(); }); c.restore(); c.fillStyle = p.accent2; star(c, cx, cy - r * 0.05, r * 0.5, r * 0.22, 5); c.fill(); },
  shield: (c, cx, cy, r, p) => { c.fillStyle = p.accent; c.beginPath(); c.moveTo(cx - r * 0.85, cy - r * 0.9); c.lineTo(cx + r * 0.85, cy - r * 0.9); c.lineTo(cx + r * 0.85, cy + r * 0.1); c.quadraticCurveTo(cx + r * 0.8, cy + r * 0.85, cx, cy + r * 1.1); c.quadraticCurveTo(cx - r * 0.8, cy + r * 0.85, cx - r * 0.85, cy + r * 0.1); c.closePath(); c.fill(); c.strokeStyle = p.accent2; c.lineWidth = 4; c.stroke(); c.fillStyle = p.bg; star(c, cx, cy - r * 0.1, r * 0.5, r * 0.22, 5); c.fill(); },
  ribbonBadge: (c, cx, cy, r, p) => { ribbonTails(c, cx, cy, r, p.accent, p.accent2); c.fillStyle = p.accent; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.strokeStyle = p.accent2; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, r * 0.84, 0, TAU); c.stroke(); c.fillStyle = p.bg; c.beginPath(); c.moveTo(cx - r * 0.38, cy); c.lineTo(cx - r * 0.1, cy + r * 0.28); c.lineTo(cx + r * 0.42, cy - r * 0.3); c.lineTo(cx + r * 0.3, cy - r * 0.42); c.lineTo(cx - r * 0.1, cy + r * 0.02); c.lineTo(cx - r * 0.26, cy - r * 0.14); c.closePath(); c.fill(); },
  hex: (c, cx, cy, r, p) => { c.fillStyle = p.accent; poly(c, cx, cy, r, 6, 0); c.fill(); c.strokeStyle = p.accent2; c.lineWidth = 5; poly(c, cx, cy, r * 0.82, 6, 0); c.stroke(); c.fillStyle = p.bg; star(c, cx, cy, r * 0.46, r * 0.2, 5); c.fill(); },
  crescent: (c, cx, cy, r, p) => { c.fillStyle = p.accent; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.fillStyle = p.bg; c.beginPath(); c.arc(cx + r * 0.2, cy, r * 0.78, 0, TAU); c.fill(); c.fillStyle = p.accent2; star(c, cx + r * 0.1, cy, r * 0.34, r * 0.15, 5); c.fill(); },
  book: (c, cx, cy, r, p) => { c.fillStyle = p.accent; c.beginPath(); c.moveTo(cx, cy - r * 0.55); c.quadraticCurveTo(cx - r * 0.55, cy - r * 0.95, cx - r, cy - r * 0.6); c.lineTo(cx - r, cy + r * 0.6); c.quadraticCurveTo(cx - r * 0.55, cy + r * 0.25, cx, cy + r * 0.6); c.closePath(); c.fill(); c.fillStyle = p.accent2; c.beginPath(); c.moveTo(cx, cy - r * 0.55); c.quadraticCurveTo(cx + r * 0.55, cy - r * 0.95, cx + r, cy - r * 0.6); c.lineTo(cx + r, cy + r * 0.6); c.quadraticCurveTo(cx + r * 0.55, cy + r * 0.25, cx, cy + r * 0.6); c.closePath(); c.fill(); c.strokeStyle = p.bg; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy - r * 0.5); c.lineTo(cx, cy + r * 0.55); c.stroke(); },
  trophy: (c, cx, cy, r, p) => { c.fillStyle = p.accent; c.beginPath(); c.moveTo(cx - r * 0.6, cy - r * 0.9); c.lineTo(cx + r * 0.6, cy - r * 0.9); c.quadraticCurveTo(cx + r * 0.6, cy + r * 0.3, cx, cy + r * 0.35); c.quadraticCurveTo(cx - r * 0.6, cy + r * 0.3, cx - r * 0.6, cy - r * 0.9); c.fill(); c.strokeStyle = p.accent2; c.lineWidth = 7; c.beginPath(); c.arc(cx - r * 0.62, cy - r * 0.5, r * 0.28, Math.PI * 0.5, Math.PI * 1.5); c.stroke(); c.beginPath(); c.arc(cx + r * 0.62, cy - r * 0.5, r * 0.28, -Math.PI * 0.5, Math.PI * 0.5); c.stroke(); c.fillStyle = p.accent2; c.fillRect(cx - r * 0.1, cy + r * 0.3, r * 0.2, r * 0.38); c.fillRect(cx - r * 0.42, cy + r * 0.66, r * 0.84, r * 0.2); c.fillStyle = p.bg; star(c, cx, cy - r * 0.38, r * 0.28, r * 0.12, 5); c.fill(); },
  check: (c, cx, cy, r, p) => { c.fillStyle = p.accent; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.strokeStyle = p.bg; c.lineWidth = r * 0.16; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(cx - r * 0.42, cy + r * 0.02); c.lineTo(cx - r * 0.1, cy + r * 0.34); c.lineTo(cx + r * 0.46, cy - r * 0.3); c.stroke(); c.strokeStyle = p.accent2; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, r * 1.13, 0, TAU); c.stroke(); },
  cap: (c, cx, cy, r, p) => { c.fillStyle = p.accent; c.beginPath(); c.moveTo(cx, cy - r * 0.7); c.lineTo(cx + r * 1.15, cy - r * 0.15); c.lineTo(cx, cy + r * 0.4); c.lineTo(cx - r * 1.15, cy - r * 0.15); c.closePath(); c.fill(); c.fillStyle = p.accent2; c.beginPath(); c.moveTo(cx - r * 0.62, cy + r * 0.05); c.lineTo(cx - r * 0.62, cy + r * 0.62); c.quadraticCurveTo(cx, cy + r * 1.0, cx + r * 0.62, cy + r * 0.62); c.lineTo(cx + r * 0.62, cy + r * 0.05); c.lineTo(cx, cy + r * 0.4); c.closePath(); c.fill(); c.strokeStyle = p.accent2; c.lineWidth = 5; c.beginPath(); c.moveTo(cx + r * 1.0, cy - r * 0.08); c.lineTo(cx + r * 1.0, cy + r * 0.6); c.stroke(); c.fillStyle = p.accent; c.beginPath(); c.arc(cx + r * 1.0, cy + r * 0.66, 8, 0, TAU); c.fill(); },
  sun: (c, cx, cy, r, p) => { c.fillStyle = p.accent2; for (let i = 0; i < 16; i++) { const a = (i * TAU) / 16; c.beginPath(); c.moveTo(cx + Math.cos(a - 0.1) * r * 0.7, cy + Math.sin(a - 0.1) * r * 0.7); c.lineTo(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15); c.lineTo(cx + Math.cos(a + 0.1) * r * 0.7, cy + Math.sin(a + 0.1) * r * 0.7); c.fill(); } c.fillStyle = p.accent; c.beginPath(); c.arc(cx, cy, r * 0.7, 0, TAU); c.fill(); c.fillStyle = p.bg; star(c, cx, cy, r * 0.4, r * 0.17, 5); c.fill(); },
};

// ---------------------------------------------------------------- name plates
const PLATE = {
  line: (c, p, cx, y, w, h) => { ruleFlourish(c, cx, y + h / 2 + 4, w, p.accent, 2.5); },
  box: (c, p, cx, y, w, h) => { c.fillStyle = p.plate; c.strokeStyle = withAlpha(p.accent, 0.55); c.lineWidth = 2.5; rrect(c, cx - w / 2, y - h / 2, w, h, 18); c.fill(); c.stroke(); },
  pill: (c, p, cx, y, w, h) => { c.fillStyle = p.plate; c.strokeStyle = p.accent; c.lineWidth = 4; rrect(c, cx - w / 2, y - h / 2, w, h, h / 2); c.fill(); c.stroke(); },
  ribbon: (c, p, cx, y, w, h) => { const x0 = cx - w / 2, x1 = cx + w / 2, n = 38; c.fillStyle = p.accent2; c.beginPath(); c.moveTo(x0 - 40, y - h / 2 + 18); c.lineTo(x0 + 30, y - h / 2 + 18); c.lineTo(x0 + 30, y + h / 2 + 18); c.lineTo(x0 - 40, y + h / 2 + 18); c.lineTo(x0 - 10, y + 18); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x1 + 40, y - h / 2 + 18); c.lineTo(x1 - 30, y - h / 2 + 18); c.lineTo(x1 - 30, y + h / 2 + 18); c.lineTo(x1 + 40, y + h / 2 + 18); c.lineTo(x1 + 10, y + 18); c.closePath(); c.fill(); c.fillStyle = p.plate; c.strokeStyle = p.accent; c.lineWidth = 3; c.beginPath(); c.rect(x0, y - h / 2, w, h); c.fill(); c.stroke(); },
  double: (c, p, cx, y, w, h) => { c.strokeStyle = p.accent; c.lineWidth = 3; [[-h / 2, 0], [h / 2, 0]].forEach(([dy]) => { c.beginPath(); c.moveTo(cx - w / 2, y + dy); c.lineTo(cx + w / 2, y + dy); c.stroke(); }); c.lineWidth = 1.2; [-h / 2 + 8, h / 2 - 8].forEach((dy) => { c.beginPath(); c.moveTo(cx - w / 2, y + dy); c.lineTo(cx + w / 2, y + dy); c.stroke(); }); },
  none: (c, p, cx, y, w, h) => { c.fillStyle = p.accent; c.fillRect(cx - 90, y + h / 2 + 2, 180, 5); },
  tab: (c, p, cx, y, w, h) => { c.fillStyle = p.accent; c.fillRect(cx - w / 2, y - h / 2, 12, h); c.fillStyle = p.plate; c.fillRect(cx - w / 2 + 12, y - h / 2, w - 12, h); },
};

// ---------------------------------------------------------------- strings
const STR = {
  title: { pass: ["شهادة نجاح", "Certificate of Success"], complete: ["شهادة إتمام", "Certificate of Completion"], achieve: ["شهادة تقدير", "Certificate of Achievement"], excel: ["شهادة تفوّق", "Certificate of Excellence"], merit: ["شهادة اجتياز", "Certificate of Passing"] },
  certify: ["تشهد {i} بنجاح الطالب/ـة", "{i} proudly certifies the success of"],
  passed: ["في امتحان", "in the exam"],
  score: ["الدرجة", "Score"], pct: ["النسبة", "Percentage"], grade: ["التقدير", "Grade"],
  date: ["التاريخ", "Date"], no: ["رقم الشهادة", "Certificate No."], sign: ["التوقيع", "Signature"],
};
const gradeOf = (pct) => (pct >= 90 ? ["ممتاز", "Excellent"] : pct >= 75 ? ["جيد جداً", "Very Good"] : pct >= 60 ? ["جيد", "Good"] : ["مقبول", "Pass"]);

// ---------------------------------------------------------------- layouts
// يرجع هندسة الصفحة: مركز النص، حدوده، المحاذاة، مكان الختم، ولوحة جانبية اختيارية
function geometry(layout) {
  const g = { cx: CW / 2, L: 150, R: CW - 150, align: "center", y: { title: 168, sub: 292, name: 408, pass: 512, exam: 596, stats: 650, foot: 800 }, emblem: { x: CW / 2, y: 836, r: 58 }, statsMode: "row", panel: null, dateX: 330, signX: CW - 330, titleSize: 78 };
  if (layout === "side") { g.panel = { x: 1060, w: 340, side: "r" }; g.cx = 560; g.L = 120; g.R = 1000; g.emblem = { x: 1230, y: 270, r: 80 }; g.dateX = 270; g.signX = 850; g.titleSize = 70; }
  if (layout === "sideL") { g.panel = { x: 0, w: 340, side: "l" }; g.cx = 860; g.L = 420; g.R = 1290; g.emblem = { x: 170, y: 270, r: 80 }; g.dateX = 560; g.signX = 1160; g.titleSize = 70; }
  if (layout === "banner") { g.panel = { y: 0, h: 250 }; g.y = { title: 118, sub: 372, name: 466, pass: 560, exam: 632, stats: 678, foot: 818 }; g.emblem = { x: CW / 2, y: 250, r: 50 }; g.titleSize = 82; g.footEmblem = false; }
  if (layout === "minimal") { g.align = "right"; g.cx = CW - 150; g.L = 160; g.R = CW - 150; g.y = { title: 190, sub: 310, name: 420, pass: 520, exam: 600, stats: 660, foot: 810 }; g.emblem = { x: 230, y: 190, r: 66 }; g.dateX = 330; g.signX = CW - 330; g.statsMode = "rowRight"; g.titleSize = 74; g.bar = true; }
  if (layout === "split") { g.panel = { x: 0, w: 380, side: "l", stats: true }; g.cx = 890; g.L = 450; g.R = 1330; g.y = { title: 170, sub: 290, name: 400, pass: 505, exam: 590, stats: 0, foot: 800 }; g.emblem = { x: 890, y: 810, r: 56 }; g.statsMode = "stack"; g.dateX = 560; g.signX = 1220; g.titleSize = 70; }
  if (layout === "plaque") { g.plaque = { x: 110, y: 100, w: CW - 220, h: CH - 200 }; g.y = { title: 195, sub: 305, name: 415, pass: 515, exam: 595, stats: 645, foot: 790 }; g.emblem = { x: CW / 2, y: 815, r: 54 }; g.titleSize = 74; }
  return g;
}

function drawPanel(c, T, g) {
  const p = T.pal;
  if (!g.panel) return;
  if (g.panel.h) { // banner
    c.fillStyle = lg(c, 0, 0, CW, g.panel.h, [[0, p.panel], [1, p.panel2 || p.panel]]); c.fillRect(0, 0, CW, g.panel.h);
    c.fillStyle = p.accent; c.fillRect(0, g.panel.h, CW, 8);
  } else {
    const { x, w } = g.panel; c.fillStyle = lg(c, x, 0, x + w, CH, [[0, p.panel], [1, p.panel2 || p.panel]]); c.fillRect(x, 0, w, CH);
    c.fillStyle = p.accent; c.fillRect(g.panel.side === "r" ? x : x + w - 8, 0, 8, CH);
    c.save(); c.globalAlpha = 0.1; c.strokeStyle = p.onPanel || "#fff"; c.lineWidth = 2; for (let i = 1; i < 6; i++) { c.beginPath(); c.arc(x + w / 2, CH + 40, i * 80, 0, TAU); c.stroke(); } c.restore();
  }
}

// ---------------------------------------------------------------- main renderer
export function renderCertificate(canvas, T, d, opts = {}) {
  const c = canvas.getContext("2d");
  const scale = canvas.width / CW;
  c.save(); c.setTransform(scale, 0, 0, scale, 0, 0);
  const p = T.pal, g = geometry(T.layout), mode = d.lang || "ar";
  const AR = mode !== "en", EN = mode === "en" || mode === "both";
  const F = T.fonts;
  const fHead = `"${F[0]}","Cairo","Tajawal",sans-serif`, fBody = `"${F[1]}","Cairo","Tajawal",sans-serif`, fName = `"${F[2] || F[0]}","Cairo","Tajawal",sans-serif`;
  const fEn = `"${T.enFont || "Cormorant Garamond"}","Georgia",serif`;
  c.clearRect(0, 0, CW, CH);
  (BG[T.bg] || BG.solid)(c, p);
  if (T.border === "frame") BORDER.frame(c, p);
  if (g.plaque) { c.save(); c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 30; c.fillStyle = p.plate; rrect(c, g.plaque.x, g.plaque.y, g.plaque.w, g.plaque.h, 28); c.fill(); c.restore(); c.strokeStyle = p.accent; c.lineWidth = 3; rrect(c, g.plaque.x + 16, g.plaque.y + 16, g.plaque.w - 32, g.plaque.h - 32, 18); c.stroke(); }
  drawPanel(c, T, g);
  if (T.border !== "frame") (BORDER[T.border] || BORDER.single)(c, p);
  (CORNER[T.corner] || CORNER.none)(c, p);

  const al = g.align, X0 = al === "right" ? g.R : g.cx, maxW = g.R - g.L;
  const aTx = (str, y, o) => tx(c, str, X0, y, { align: al, maxW, ...o });
  const titleP = g.panel && g.panel.h ? p.onPanel : p.ink;
  // title
  const ttl = STR.title[T.titleKey || "pass"];
  const tsz = g.titleSize;
  if (AR) aTx(ttl[0], g.y.title - (EN && mode === "both" ? 18 : 0), { size: tsz, weight: 700, color: titleP, font: fHead, shadow: T.titleShadow, maxW });
  if (mode === "both") aTx(ttl[1], g.y.title + 38, { size: 28, color: g.panel && g.panel.h ? p.onPanel : p.accent, font: fEn, italic: true, spacing: 2, weight: 600, dir: "ltr" });
  if (mode === "en") aTx(ttl[1], g.y.title, { size: Math.round(tsz * 0.78), color: titleP, font: fEn, weight: 700, dir: "ltr", spacing: 1 });
  if (!(g.panel && g.panel.h) && T.titleRule !== false) { if (al === "center") ruleFlourish(c, g.cx, g.y.title + 78, Math.min(560, maxW * 0.6), p.accent); else { c.fillStyle = p.accent; c.fillRect(g.R - 220, g.y.title + 78, 220, 5); } }
  // certify
  const cer = STR.certify;
  if (AR) aTx(cer[0].replace("{i}", d.institution), g.y.sub, { size: 29, color: p.text, font: fBody, weight: 500 });
  if (mode === "both") aTx(cer[1].replace("{i}", d.institution), g.y.sub + 34, { size: 22, color: p.mute, font: fEn, italic: true, dir: "ltr" });
  if (mode === "en") aTx(cer[1].replace("{i}", d.institution), g.y.sub, { size: 27, color: p.text, font: fEn, italic: true, dir: "ltr" });
  // name + plate
  const nameW = Math.min(maxW - 40, 880);
  const plateY = g.y.name, plateH = 104;
  const nameCx = al === "right" ? g.R - nameW / 2 : g.cx;
  (PLATE[T.plate] || PLATE.line)(c, p, nameCx, plateY, nameW, plateH);
  tx(c, d.name, nameCx, plateY, { size: 56, weight: 800, color: p.nameColor || p.accent, font: fName, maxW: nameW - 70, minSize: 26 });
  // passed line + exam
  const ps = STR.passed;
  if (AR) aTx(ps[0], g.y.pass, { size: 27, color: p.text, font: fBody });
  if (mode === "both") aTx(ps[1], g.y.pass + 32, { size: 21, color: p.mute, font: fEn, italic: true, dir: "ltr" });
  if (mode === "en") aTx(ps[1], g.y.pass, { size: 26, color: p.text, font: fEn, italic: true, dir: "ltr" });
  const examY = g.y.exam + (mode === "both" ? 18 : 0);
  aTx("«" + d.exam + "»", examY, { size: 42, weight: 700, color: p.ink, font: fHead, maxW: maxW - 20, minSize: 22, dir: isArabic(d.exam) ? "rtl" : "ltr" });

  // stats
  const fmt = (n) => (AR ? Number(n).toLocaleString("ar-EG") : String(n));
  const items = [
    { k: STR.score, v: `${fmt(d.score)}/${fmt(d.total)}` },
    { k: STR.pct, v: `${fmt(d.pct)}%`, raw: d.pct },
    { k: STR.grade, v: AR ? d.grade[0] : d.grade[1] },
  ];
  const labelOf = (k) => (mode === "en" ? k[1] : k[0]);
  drawStats(c, T, g, items, labelOf, mode, { fHead, fBody, fEn, X0, al, maxW });

  // footer: date | emblem | signature
  const fy = g.y.foot + 40;
  const dateTxt = d.date;
  const footL = g.dateX, footR = g.signX;
  if (T.layout === "split" || T.layout === "side" || T.layout === "sideL" || T.layout === "minimal" || true) {
    c.save(); c.strokeStyle = withAlpha(p.accent, 0.7); c.lineWidth = 2;
    c.beginPath(); c.moveTo(footL - 130, fy); c.lineTo(footL + 130, fy); c.stroke();
    c.beginPath(); c.moveTo(footR - 150, fy); c.lineTo(footR + 150, fy); c.stroke(); c.restore();
  }
  tx(c, dateTxt, footL, fy - 22, { size: 25, weight: 700, color: p.ink, font: fBody, dir: AR ? "rtl" : "ltr" });
  tx(c, mode === "en" ? STR.date[1] : STR.date[0] + (mode === "both" ? " / " + STR.date[1] : ""), footL, fy + 24, { size: 19, color: p.mute, font: fBody, dir: AR ? "rtl" : "ltr" });
  tx(c, d.signer || d.institution, footR, fy - 22, { size: 26, weight: 700, color: p.ink, font: `"${T.signFont || "Aref Ruqaa"}","Amiri","Cairo",serif`, maxW: 290 });
  tx(c, d.signerTitle || (mode === "en" ? STR.sign[1] : STR.sign[0]), footR, fy + 24, { size: 19, color: p.mute, font: fBody, maxW: 290, dir: isArabic(d.signerTitle || "") || !d.signerTitle ? (mode === "en" ? "ltr" : "rtl") : "ltr" });
  // emblem
  const em = g.emblem;
  if (T.emblem !== "none") { c.save(); if (T.emblemShadow !== false) { c.shadowColor = "rgba(0,0,0,.22)"; c.shadowBlur = 14; c.shadowOffsetY = 4; } (EMBLEM[T.emblem] || EMBLEM.rosette)(c, em.x, em.y, em.r, g.panel && !g.panel.h && (g.panel.side === "r" ? em.x >= g.panel.x : em.x <= g.panel.x + g.panel.w) ? { ...p, bg: p.panel, accent: p.onPanel, accent2: p.accent2 } : p); c.restore(); }
  // cert number
  const noY = T.layout === "banner" ? 932 : 940;
  tx(c, `${mode === "en" ? STR.no[1] : STR.no[0]}: ${d.certNo}`, CW / 2 + (g.panel && g.panel.side === "r" ? -170 : g.panel && g.panel.side === "l" ? 170 : 0), noY, { size: 18, color: p.mute, font: fBody, dir: "ltr", spacing: 1 });
  c.restore();
}

function drawStats(c, T, g, items, labelOf, mode, f) {
  const p = T.pal, st = T.stats || "cards";
  const y0 = g.y.stats;
  const val = (it, x, y, size, col) => tx(c, it.v, x, y, { size, weight: 800, color: col, font: f.fHead, maxW: 190, dir: "ltr" });
  const lab = (it, x, y, size, col) => { tx(c, labelOf(it.k), x, y, { size, weight: 600, color: col, font: f.fBody, dir: mode === "en" ? "ltr" : "rtl" }); if (mode === "both") tx(c, it.k[1], x, y + 22, { size: 15, color: col, font: f.fEn, italic: true, dir: "ltr" }); };
  if (g.statsMode === "stack") {
    const { x, w } = g.panel; const cx = x + w / 2 - 4;
    items.forEach((it, i) => { const y = 250 + i * 215; c.fillStyle = "rgba(255,255,255,.12)"; rrect(c, cx - 140, y - 78, 280, 170, 22); c.fill(); c.strokeStyle = p.accent; c.lineWidth = 2; c.stroke(); val(it, cx, y - 14, 56, p.onPanel); lab(it, cx, y + 48, 24, withAlpha(p.onPanel, 0.85)); });
    return;
  }
  if (st === "inline" || st === "bar") {
    const span = Math.min(g.R - g.L, 880), xs = g.align === "right" ? g.R - span : g.cx - span / 2;
    if (st === "bar") {
      const pct = parseFloat(String(items[1].v)) || 0; const bw = span, bx = xs, by = y0 + 36;
      c.fillStyle = withAlpha(p.accent, 0.18); rrect(c, bx, by, bw, 26, 13); c.fill();
      c.fillStyle = lg(c, bx, 0, bx + bw, 0, [[0, p.accent2], [1, p.accent]]); rrect(c, bx + (g.align === "right" ? bw * (1 - clamp(d_pct(items), 0, 100) / 100) : 0), by, Math.max(26, bw * clamp(d_pct(items), 0, 100) / 100), 26, 13); c.fill();
      items.forEach((it, i) => { const x = xs + (span / 3) * (i + 0.5); tx(c, `${labelOf(it.k)}: ${it.v}`, x, by + 62, { size: 26, weight: 700, color: p.ink, font: f.fBody, dir: mode === "en" ? "ltr" : "rtl" }); });
    } else {
      c.strokeStyle = withAlpha(p.accent, 0.6); c.lineWidth = 2; c.strokeRect(xs, y0 + 8, span, 92);
      items.forEach((it, i) => { const x = xs + (span / 3) * (i + 0.5); if (i) { c.beginPath(); c.moveTo(xs + (span / 3) * i, y0 + 22); c.lineTo(xs + (span / 3) * i, y0 + 86); c.stroke(); } val(it, x, y0 + 40, 40, p.accent); lab(it, x, y0 + 80, 19, p.mute); });
    }
    return;
  }
  const n = items.length, cw = st === "circles" ? 150 : 230, gap = st === "circles" ? 90 : 56, total = n * cw + (n - 1) * gap;
  const startX = g.align === "right" ? g.R - total : g.cx - total / 2;
  items.forEach((it, i) => {
    const x = startX + i * (cw + gap), cx = x + cw / 2, col = [p.accent, p.accent2, p.accent][i % 3];
    if (st === "circles") { c.fillStyle = p.plate; c.strokeStyle = col; c.lineWidth = 6; c.beginPath(); c.arc(cx, y0 + 52, 66, 0, TAU); c.fill(); c.stroke(); val(it, cx, y0 + 46, 34, p.ink); lab(it, cx, y0 + 82, 17, p.mute); }
    else { c.fillStyle = p.plate; c.strokeStyle = withAlpha(p.accent, 0.5); c.lineWidth = 2.5; rrect(c, x, y0, cw, 112, st === "pills" ? 56 : 16); c.fill(); c.stroke(); if (st !== "pills") { c.fillStyle = col; c.fillRect(x + 22, y0, cw - 44, 6); } val(it, cx, y0 + 46, 42, p.ink); lab(it, cx, y0 + 88, 20, p.mute); }
  });
}
const d_pct = (items) => Number(items[1].raw) || 0;

// ---------------------------------------------------------------- 40 templates
const pal = (o) => ({ text: "#4a4a4a", mute: "#7b7b7b", onPanel: "#ffffff", plate: "#ffffff", bg2: o.bg, panel: o.accent, panel2: o.panel || o.accent, nameColor: o.accent, ...o });
const T = (id, name, en, group, layout, bg, border, corner, emblem, plate, stats, fonts, palette, extra = {}) => ({ id, name, en, group, layout, bg, border, corner, emblem, plate, stats, fonts, pal: pal(palette), ...extra });
export const GROUPS = { classic: "كلاسيكي فاخر", islamic: "إسلامي وهندسي", modern: "عصري", academic: "أكاديمي رسمي", playful: "ملوّن ومرح" };
export const TEMPLATES = [
  // ---------- classic
  T("c01", "ذهبي كلاسيكي", "Classic Gold", "classic", "center", "paper", "double", "leaf", "rosette", "line", "cards", ["Amiri", "Cairo", "Amiri"], { bg: "#fffdf6", bg2: "#f6ead0", ink: "#6b4e10", accent: "#b8903a", accent2: "#e2c36b", plate: "#fff9e8", nameColor: "#8a6516" }),
  T("c02", "أزرق ملكي", "Royal Navy", "classic", "center", "radial", "triple", "fan", "medal", "box", "cards", ["El Messiri", "Almarai", "El Messiri"], { bg: "#ffffff", bg2: "#e8eef9", ink: "#13306b", accent: "#1d3f8f", accent2: "#c9a24a", plate: "#eef3fc", nameColor: "#1d3f8f" }),
  T("c03", "زمردي فاخر", "Emerald Luxe", "classic", "center", "grad", "thickthin", "quarter", "laurel", "double", "circles", ["Reem Kufi", "Cairo", "Amiri"], { bg: "#f7fbf8", bg2: "#dcefe3", ink: "#0f4d33", accent: "#14704a", accent2: "#c9a24a", plate: "#ffffff", nameColor: "#14704a" }),
  T("c04", "عنابي ملكي", "Burgundy Crest", "classic", "plaque", "grad", "deco", "none", "shield", "ribbon", "inline", ["Amiri", "Tajawal", "Amiri"], { bg: "#f2e3d4", bg2: "#e7cdb4", ink: "#5a1022", accent: "#7a1a31", accent2: "#c9a24a", plate: "#fff8ee", nameColor: "#7a1a31" }),
  T("c05", "فضي رخامي", "Silver Marble", "classic", "center", "grad", "bracket", "diamond", "trophy", "line", "cards", ["Markazi Text", "Almarai", "Markazi Text"], { bg: "#fbfcfd", bg2: "#dfe4ea", ink: "#2c3a4d", accent: "#6b7a90", accent2: "#a9b4c4", plate: "#f2f5f8", nameColor: "#34455e" }),
  T("c06", "ورق عتيق", "Antique Parchment", "classic", "center", "paper", "meander", "none", "ribbonBadge", "double", "inline", ["Aref Ruqaa", "Cairo", "Aref Ruqaa"], { bg: "#f6e9c9", bg2: "#e5cf9e", ink: "#573a12", accent: "#8b5e1f", accent2: "#c08a3a", plate: "#fbf1d8", nameColor: "#6b4413" }),
  T("c07", "بيج دافئ", "Warm Beige", "classic", "plaque", "paper", "dashed", "flower", "book", "pill", "cards", ["Amiri", "Almarai", "Amiri"], { bg: "#ecdcc4", bg2: "#d9c2a0", ink: "#4b3520", accent: "#9a6b3c", accent2: "#d1a56a", plate: "#fffaf0", nameColor: "#7a4f26" }),
  T("c08", "ذهب على أسود", "Gold on Black", "classic", "center", "radial", "double", "star8", "medal", "box", "cards", ["Reem Kufi", "Tajawal", "Amiri"], { bg: "#1d1810", bg2: "#0c0a06", ink: "#f2dfa0", accent: "#c9a24a", accent2: "#e8cd7e", text: "#e3d3a6", mute: "#ac9c78", plate: "#2a2214", nameColor: "#f0d68a" }, { titleShadow: "rgba(201,162,74,.45)" }),
  // ---------- islamic
  T("i01", "زخرفة إسلامية ذهبية", "Golden Arabesque", "islamic", "center", "islamic", "islamic", "star8", "crescent", "line", "cards", ["Reem Kufi", "Cairo", "Amiri"], { bg: "#fffaf0", bg2: "#fffaf0", ink: "#5b4310", accent: "#b38a2e", accent2: "#d9b85c", plate: "#fff6e0", nameColor: "#8a6516" }),
  T("i02", "فيروزي هندسي", "Turquoise Geometry", "islamic", "center", "islamic", "islamic", "star8", "sun", "box", "cards", ["El Messiri", "Almarai", "El Messiri"], { bg: "#0f5e63", bg2: "#0f5e63", ink: "#fff3cf", accent: "#e0b84e", accent2: "#f3d98d", text: "#d8eeee", mute: "#a9d0d1", plate: "#0b4a4e", nameColor: "#f6dc92" }),
  T("i03", "أخضر إسلامي", "Islamic Green", "islamic", "plaque", "islamic", "frame", "star8", "crescent", "ribbon", "inline", ["Amiri", "Tajawal", "Amiri"], { bg: "#0f6b45", bg2: "#0f6b45", ink: "#0e4a30", accent: "#c9a24a", accent2: "#e6cb7c", plate: "#fffdf4", nameColor: "#0f6b45" }),
  T("i04", "كحلي ونجوم", "Midnight Stars", "islamic", "banner", "islamic", "double", "none", "hex", "pill", "cards", ["Reem Kufi", "Cairo", "Reem Kufi"], { bg: "#f5f7fc", bg2: "#f5f7fc", ink: "#142a5c", accent: "#c9a24a", accent2: "#e6cb7c", panel: "#1a2f6a", panel2: "#0f1d45", plate: "#ffffff", nameColor: "#1a2f6a" }, { titleKey: "excel" }),
  T("i05", "هلال وكتاب", "Crescent & Book", "islamic", "sideL", "solid", "thickthin", "none", "crescent", "line", "cards", ["Aref Ruqaa", "Cairo", "Aref Ruqaa"], { bg: "#fdfaf1", bg2: "#fdfaf1", ink: "#173e34", accent: "#b9923a", accent2: "#dcc276", panel: "#17594a", panel2: "#0e3a30", plate: "#f6f1df", nameColor: "#17594a" }),
  T("i06", "مرمر وزهور", "Marble Bloom", "islamic", "center", "circles", "islamic", "flower", "rosette", "double", "circles", ["Markazi Text", "Almarai", "Markazi Text"], { bg: "#fbf8fc", bg2: "#fbf8fc", ink: "#44245e", accent: "#8a5aa8", accent2: "#c9a24a", plate: "#ffffff", nameColor: "#6b3d8a" }),
  T("i07", "رمال الصحراء", "Desert Sands", "islamic", "minimal", "dots", "dotted", "none", "sun", "none", "bar", ["Lemonada", "Cairo", "Lemonada"], { bg: "#fbf0dc", bg2: "#fbf0dc", ink: "#6d3b12", accent: "#c4762a", accent2: "#e3a35a", plate: "#fff7e8", nameColor: "#a65a17" }),
  T("i08", "بنفسجي هندسي", "Violet Geometry", "islamic", "center", "islamic", "deco", "diamond", "hex", "pill", "cards", ["El Messiri", "Almarai", "El Messiri"], { bg: "#faf7ff", bg2: "#faf7ff", ink: "#3a1d7a", accent: "#6d45c4", accent2: "#c9a24a", plate: "#f1eaff", nameColor: "#5a35ab" }),
  // ---------- modern
  T("m01", "أزرق عصري", "Modern Blue", "modern", "banner", "solid", "none", "none", "check", "tab", "cards", ["Cairo", "Cairo", "Cairo"], { bg: "#f7f9fd", bg2: "#f7f9fd", ink: "#0e2a66", accent: "#2563eb", accent2: "#60a5fa", panel: "#1e4fd8", panel2: "#173a9e", plate: "#ffffff", nameColor: "#1e4fd8" }, { titleRule: false }),
  T("m02", "تدرّج بنفسجي", "Violet Gradient", "modern", "side", "grad", "none", "none", "ribbonBadge", "pill", "circles", ["Tajawal", "Tajawal", "Tajawal"], { bg: "#ffffff", bg2: "#f1ecff", ink: "#2b1b66", accent: "#7c4dff", accent2: "#b39bff", panel: "#6a3de8", panel2: "#3c1fa8", plate: "#f6f2ff", nameColor: "#5b34d6" }),
  T("m03", "مينيمال", "Minimal Ink", "modern", "minimal", "solid", "none", "none", "check", "line", "bar", ["Almarai", "Almarai", "Almarai"], { bg: "#ffffff", bg2: "#ffffff", ink: "#111111", accent: "#111111", accent2: "#888888", plate: "#ffffff", nameColor: "#111111" }, { titleRule: false }),
  T("m04", "مثلثات برتقالية", "Orange Facets", "modern", "center", "tri", "none", "none", "medal", "box", "cards", ["Lalezar", "Cairo", "Cairo"], { bg: "#fffaf5", bg2: "#fffaf5", ink: "#3a2412", accent: "#f2711c", accent2: "#ffb066", plate: "#fff1e4", nameColor: "#d4570b" }),
  T("m05", "أزرق سماوي", "Sky Waves", "modern", "center", "waves", "rounded", "none", "cap", "pill", "cards", ["Cairo", "Tajawal", "Cairo"], { bg: "#f2fbff", bg2: "#d7f0fb", ink: "#0c3a52", accent: "#0b86b8", accent2: "#5cc4e6", plate: "#ffffff", nameColor: "#0b86b8" }),
  T("m06", "فيروزي نظيف", "Clean Teal", "modern", "sideL", "solid", "none", "none", "check", "box", "inline", ["Tajawal", "Tajawal", "Tajawal"], { bg: "#f7fdfc", bg2: "#f7fdfc", ink: "#0b3b3a", accent: "#0f9d8a", accent2: "#5fd0c0", panel: "#0f8f7e", panel2: "#0a5f56", plate: "#e8f8f5", nameColor: "#0b7f70" }, { titleRule: false }),
  T("m07", "رمادي احترافي", "Pro Slate", "modern", "split", "solid", "single", "none", "hex", "line", "cards", ["Almarai", "Almarai", "Almarai"], { bg: "#f6f7f9", bg2: "#f6f7f9", ink: "#1f2937", accent: "#475569", accent2: "#94a3b8", panel: "#334155", panel2: "#1e293b", plate: "#ffffff", nameColor: "#334155" }),
  T("m08", "وردي عصري", "Rose Bokeh", "modern", "banner", "bokeh", "rounded", "none", "rosette", "pill", "circles", ["Tajawal", "Tajawal", "Lemonada"], { bg: "#fff6f9", bg2: "#ffe3ec", ink: "#5a1233", accent: "#e0457b", accent2: "#f59bb9", panel: "#d6336c", panel2: "#a61e50", plate: "#ffffff", nameColor: "#c2255c" }),
  T("m09", "أخضر ليموني", "Lime Chevron", "modern", "minimal", "chevron", "band", "none", "trophy", "tab", "cards", ["Cairo", "Cairo", "Cairo"], { bg: "#fbfff2", bg2: "#fbfff2", ink: "#27410a", accent: "#65a30d", accent2: "#a3e635", plate: "#f3fbdc", nameColor: "#4d7c0f" }),
  T("m10", "أحمر قوي", "Bold Red", "modern", "center", "diag", "band", "none", "medal", "ribbon", "cards", ["Lalezar", "Cairo", "Cairo"], { bg: "#fffafa", bg2: "#fffafa", ink: "#3a0a0a", accent: "#d62828", accent2: "#f77f00", plate: "#fff1f1", nameColor: "#b91c1c" }),
  // ---------- academic
  T("a01", "جامعي كحلي", "University Navy", "academic", "plaque", "solid", "double", "none", "cap", "double", "cards", ["Amiri", "Almarai", "Amiri"], { bg: "#1b2e57", bg2: "#1b2e57", ink: "#16264b", accent: "#1b2e57", accent2: "#c9a24a", plate: "#fffdf8", nameColor: "#1b2e57" }),
  T("a02", "أكاديمي أحمر وذهبي", "Crimson & Gold", "academic", "center", "solid", "frame", "none", "shield", "line", "cards", ["Amiri", "Cairo", "Amiri"], { bg: "#fffdf8", bg2: "#fffdf8", ink: "#4a0f14", accent: "#8c1d26", accent2: "#c9a24a", plate: "#fbf3e6", nameColor: "#8c1d26" }),
  T("a03", "مدرسي أخضر", "School Green", "academic", "split", "grid", "single", "none", "book", "box", "cards", ["Cairo", "Cairo", "Cairo"], { bg: "#f7fbf4", bg2: "#f7fbf4", ink: "#173d1d", accent: "#2f8a3e", accent2: "#9bd37a", panel: "#2c7a3a", panel2: "#1b5226", plate: "#ffffff", nameColor: "#216a2f" }, { titleKey: "complete" }),
  T("a04", "دبلوم رسمي", "Formal Diploma", "academic", "center", "paper", "thickthin", "diamond", "laurel", "double", "inline", ["Markazi Text", "Almarai", "Markazi Text"], { bg: "#fffcf4", bg2: "#f1e6c8", ink: "#3b2a0c", accent: "#7a5a1c", accent2: "#c9a24a", plate: "#fffaf0", nameColor: "#5c4210" }, { titleKey: "merit" }),
  T("a05", "رسمي أزرق", "Official Blue", "academic", "banner", "grid", "band", "none", "rosette", "tab", "cards", ["Almarai", "Almarai", "Almarai"], { bg: "#f5f9ff", bg2: "#f5f9ff", ink: "#0f2a55", accent: "#2b6cb0", accent2: "#c9a24a", panel: "#1f4f8f", panel2: "#143561", plate: "#ffffff", nameColor: "#1f4f8f" }),
  T("a06", "كلية الآداب", "Arts College", "academic", "side", "paper", "double", "quarter", "book", "line", "cards", ["Aref Ruqaa", "Cairo", "Aref Ruqaa"], { bg: "#fbf4e4", bg2: "#efe0bd", ink: "#3d2410", accent: "#8a4b1c", accent2: "#c9a24a", panel: "#6f3a14", panel2: "#4a2509", plate: "#fffaf0", nameColor: "#7a3f14" }),
  T("a07", "كلية العلوم", "Science Rings", "academic", "center", "circles", "diamond", "none", "hex", "pill", "circles", ["Cairo", "Tajawal", "Cairo"], { bg: "#f4fbff", bg2: "#f4fbff", ink: "#0b3350", accent: "#0f7ab5", accent2: "#38bdf8", plate: "#ffffff", nameColor: "#0f6ea3" }, { titleKey: "complete" }),
  T("a08", "رمادي أنيق", "Elegant Grey", "academic", "plaque", "grad", "bracket", "none", "trophy", "line", "cards", ["Almarai", "Almarai", "Almarai"], { bg: "#d8dde4", bg2: "#b9c1cc", ink: "#232c38", accent: "#4b5668", accent2: "#c9a24a", plate: "#fbfcfd", nameColor: "#2f3a4b" }),
  // ---------- playful
  T("p01", "ألوان مرحة", "Confetti", "playful", "center", "dots", "dashed", "flower", "rosette", "pill", "circles", ["Lemonada", "Tajawal", "Lemonada"], { bg: "#fff9e6", bg2: "#fff9e6", ink: "#6a1b4d", accent: "#ec4899", accent2: "#fbbf24", plate: "#ffffff", nameColor: "#db2777" }, { titleKey: "achieve" }),
  T("p02", "نجوم وجوائز", "Star Awards", "playful", "banner", "bokeh", "scallop", "none", "medal", "ribbon", "circles", ["Lalezar", "Cairo", "Cairo"], { bg: "#fff8ec", bg2: "#ffe8c2", ink: "#4a2a00", accent: "#f59e0b", accent2: "#ef4444", panel: "#f97316", panel2: "#ea580c", plate: "#ffffff", nameColor: "#d97706" }, { titleKey: "achieve" }),
  T("p03", "بحر وأمواج", "Ocean Breeze", "playful", "center", "waves", "rounded", "none", "ribbonBadge", "box", "pills", ["Lemonada", "Cairo", "Lemonada"], { bg: "#effcff", bg2: "#c7f0f9", ink: "#064e5e", accent: "#0891b2", accent2: "#22d3ee", plate: "#ffffff", nameColor: "#0e7490" }, { titleKey: "achieve" }),
  T("p04", "برتقالي دافئ", "Sunny Stripes", "playful", "sideL", "stripes", "dotted", "none", "trophy", "box", "cards", ["Lalezar", "Tajawal", "Cairo"], { bg: "#fffaf0", bg2: "#fffaf0", ink: "#5a2a00", accent: "#ea580c", accent2: "#fdba74", panel: "#f97316", panel2: "#c2410c", plate: "#fff1e0", nameColor: "#c2410c" }),
  T("p05", "طبيعة خضراء", "Nature Leaf", "playful", "center", "stripes", "scallop", "leaf", "check", "pill", "cards", ["Lemonada", "Cairo", "Lemonada"], { bg: "#f6fff0", bg2: "#f6fff0", ink: "#1d4d12", accent: "#16a34a", accent2: "#86efac", plate: "#ffffff", nameColor: "#15803d" }, { titleKey: "complete" }),
  T("p06", "بنفسجي حالم", "Dreamy Violet", "playful", "plaque", "bokeh", "dashed", "spiral", "rosette", "ribbon", "circles", ["Aref Ruqaa", "Tajawal", "Aref Ruqaa"], { bg: "#a58bf0", bg2: "#6d4fd6", ink: "#3b1e82", accent: "#8b5cf6", accent2: "#f0abfc", plate: "#fcf9ff", nameColor: "#6d28d9" }, { titleKey: "achieve" }),
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

// =====================================================================
//  الإعدادات + الإصدار (snapshot) + الإنزال
// =====================================================================
const DEFAULTS = { templateId: "c01", lang: "ar", institution: "منصة امتحان لغة عربية", signer: "", signerTitle: "", enabled: true, examTemplates: {} };
let settings = { ...DEFAULTS };
let issued = {}; // certificates/*
let settingsLoaded = false;
let _dbRef = null;
const db = () => X().db;

function listenSettings() {
  if (_dbRef) return;
  _dbRef = true;
  onValue(ref(db(), "certSettings"), (snap) => {
    const v = snap.val() || {};
    settings = { ...DEFAULTS, ...v, examTemplates: v.examTemplates || {} };
    settingsLoaded = true;
    if (window.CertAdmin && window.CertAdmin._visible()) window.CertAdmin.render();
  });
}
const effectiveTemplateId = (examId) => (settings.examTemplates && settings.examTemplates[examId]) || settings.templateId;

const fmtDate = (ts, lang) => {
  const d = new Date(ts || Date.now());
  return lang === "ar" ? d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const certNoOf = (examId, code, ts) => {
  let h = 0; String(examId).split("").forEach((ch) => (h = (h * 31 + ch.charCodeAt(0)) % 997));
  return `C${new Date(ts || Date.now()).getFullYear() % 100}-${code}-${String(h).padStart(3, "0")}`;
};

// يبني بيانات الشهادة الثابتة من نتيجة الطالب + إعدادات اللحظة دي
function buildSnapshot(result, examId, issuedBy) {
  const total = Number(result.total) || 0, score = Number(result.score) || 0;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const ts = Date.now();
  return {
    templateId: effectiveTemplateId(examId), lang: settings.lang || "ar",
    institution: settings.institution || DEFAULTS.institution, signer: settings.signer || "", signerTitle: settings.signerTitle || "",
    name: result.name || "", exam: result.examName || "", score, total, pct, grade: gradeOf(pct),
    issuedAt: ts, certNo: certNoOf(examId, result.code, ts), issuedBy: issuedBy || "student", examId, code: result.code,
  };
}
const dataFromSnapshot = (sn) => ({ ...sn, date: fmtDate(sn.issuedAt, sn.lang) });

async function ensureIssued(result, examId, issuedBy) {
  const path = `certificates/${examId}/${result.code}`;
  const ex = await get(ref(db(), path));
  if (ex.exists()) return ex.val();
  const sn = buildSnapshot(result, examId, issuedBy);
  await set(ref(db(), path), sn);
  return sn;
}

async function loadFonts(T, lang) {
  if (!document.fonts || !document.fonts.load) return;
  const fam = [...new Set([...(T.fonts || []), T.signFont || "Aref Ruqaa", "Cormorant Garamond"])];
  const jobs = fam.flatMap((f) => [document.fonts.load(`700 40px "${f}"`, "أبجد Abc"), document.fonts.load(`400 24px "${f}"`, "أبجد Abc")]);
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, 2500))]);
}

async function renderSnapshotTo(canvas, sn) {
  const T = templateById(sn.templateId);
  await loadFonts(T, sn.lang);
  renderCertificate(canvas, T, dataFromSnapshot(sn));
  return canvas;
}
function fullCanvas() { const cv = document.createElement("canvas"); cv.width = CW; cv.height = CH; return cv; }
const safeFile = (s) => String(s || "certificate").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);

async function downloadPNG(sn) {
  const cv = await renderSnapshotTo(fullCanvas(), sn);
  const a = document.createElement("a"); a.download = `شهادة_${safeFile(sn.name)}.png`; a.href = cv.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove();
}
async function downloadPDF(sn) {
  const { jsPDF } = window.jspdf;
  const cv = await renderSnapshotTo(fullCanvas(), sn);
  const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
  pdf.addImage(cv.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
  pdf.save(`شهادة_${safeFile(sn.name)}.pdf`);
}

// ---------------------------------------------------------------- generic preview modal
function ensureModal() {
  let m = document.getElementById("certModal");
  if (m) return m;
  m = document.createElement("div"); m.id = "certModal"; m.className = "modal-ov";
  m.innerHTML = `<div class="modal" style="max-width:980px;width:96vw"><h3 id="certModalTitle">معاينة</h3>
    <div class="cert-modal-body"><div class="cert-preview-wrap"><canvas id="certModalCanvas" width="1400" height="990"></canvas></div>
    <div class="modal-acts" id="certModalActs" style="flex-wrap:wrap"></div></div></div>`;
  m.addEventListener("click", (e) => { if (e.target === m) m.style.display = "none"; });
  document.body.appendChild(m);
  return m;
}
async function openPreview(title, drawFn, actions) {
  const m = ensureModal();
  document.getElementById("certModalTitle").textContent = title;
  const acts = document.getElementById("certModalActs"); acts.innerHTML = "";
  actions.forEach((a) => { const b = document.createElement("button"); b.className = "abtn " + (a.cls || "bg-blue"); b.style.flex = "1"; b.textContent = a.label; b.onclick = a.fn; acts.appendChild(b); });
  m.style.display = "flex";
  await drawFn(document.getElementById("certModalCanvas"));
}
const closePreview = () => { const m = document.getElementById("certModal"); if (m) m.style.display = "none"; };

// ---------------------------------------------------------------- student side
const CertStudent = {
  async mount(detail) {
    const box = document.getElementById("rCert");
    if (!box) return;
    box.innerHTML = "";
    const { d, hideScore, passed } = detail;
    if (hideScore || !passed || !d || !d.code || !d.examId) return;
    listenSettings();
    if (!settingsLoaded) { try { const v = (await get(ref(db(), "certSettings"))).val() || {}; settings = { ...DEFAULTS, ...v, examTemplates: v.examTemplates || {} }; } catch {} }
    if (settings.enabled === false) return;
    box.innerHTML = '<button type="button" class="cert-student-btn" id="certStudentBtn">🎓 عرض وتحميل شهادتي</button>';
    document.getElementById("certStudentBtn").onclick = async () => {
      const btn = document.getElementById("certStudentBtn"); btn.disabled = true; btn.textContent = "جاري تجهيز الشهادة...";
      try {
        const sn = await ensureIssued(d, d.examId, "student");
        await openPreview("🎓 شهادتك", (cv) => renderSnapshotTo(cv, sn), [
          { label: "⬇️ تحميل PDF", cls: "bg-green", fn: () => downloadPDF(sn) },
          { label: "🖼️ تحميل صورة", cls: "bg-blue", fn: () => downloadPNG(sn) },
          { label: "إغلاق", cls: "bg-dark", fn: closePreview },
        ]);
      } catch (e) { console.error(e); alert("تعذر تجهيز الشهادة. تحقق من الاتصال وحاول مرة أخرى."); }
      btn.disabled = false; btn.textContent = "🎓 عرض وتحميل شهادتي";
    };
  },
};
document.addEventListener("exam:result-shown", (e) => CertStudent.mount(e.detail));
window.CertStudent = CertStudent;

// ---------------------------------------------------------------- admin side
const SAMPLE = (lang) => ({
  lang, name: lang === "en" ? "Ahmed Mohamed Ali" : "أحمد محمد علي حسن", exam: lang === "en" ? "Arabic Language Final Exam" : "امتحان اللغة العربية النهائي",
  score: 46, total: 50, pct: 92, grade: ["ممتاز", "Excellent"], date: fmtDate(Date.now(), lang), certNo: "C26-48213-001",
  institution: settings.institution || DEFAULTS.institution, signer: settings.signer || "", signerTitle: settings.signerTitle || "",
});
let _filter = "all", _io = null, _issuedUnsub = null;

const CertAdmin = {
  _visible() { const t = document.getElementById("tab-certs"); return !!(t && t.classList.contains("on") && window.__exam.getAdmin()); },
  onOpen() { listenSettings(); this.listenIssued(); this.render(); },
  listenIssued() { if (_issuedUnsub) return; _issuedUnsub = onValue(ref(db(), "certificates"), (s) => { issued = s.val() || {}; if (this._visible()) this.renderIssued(); }); },
  async save(patch, msg) {
    if (!window.__exam.getAdmin()) return;
    try {
      await update(ref(db(), "certSettings"), { ...patch, updatedAt: serverTimestamp(), updatedBy: window.__exam.getAdmin().name });
      window.__exam.logAction("إعدادات الشهادات: " + (msg || "تحديث"));
      window.__exam.showToast("✅ " + (msg || "تم الحفظ"));
    } catch (e) { console.error(e); alert("تعذر الحفظ."); }
  },
  setDefault(id) { return this.save({ templateId: id }, "اعتماد تصميم " + templateById(id).name); },
  setExamTemplate(examId, id) {
    const ex = { ...(settings.examTemplates || {}) }; if (id) ex[examId] = id; else delete ex[examId];
    return this.save({ examTemplates: Object.keys(ex).length ? ex : null }, "تصميم خاص بامتحان");
  },
  saveForm() {
    const v = (i) => document.getElementById(i);
    return this.save({ institution: v("certInst").value.trim().slice(0, 80) || DEFAULTS.institution, signer: v("certSigner").value.trim().slice(0, 60), signerTitle: v("certSignerTitle").value.trim().slice(0, 60), lang: v("certLang").value, enabled: v("certEnabled").checked }, "بيانات الشهادة");
  },
  preview(id) {
    let lang = settings.lang || "ar"; const T = templateById(id);
    const draw = async (cv) => { await loadFonts(T, lang); renderCertificate(cv, T, SAMPLE(lang)); };
    const open = () => openPreview(`معاينة: ${T.name} (${T.id.toUpperCase()})`, draw, [
      { label: id === settings.templateId ? "✅ التصميم الحالي" : "✔️ استخدام هذا التصميم", cls: "bg-green", fn: async () => { await this.setDefault(id); closePreview(); } },
      { label: "🔤 تبديل اللغة (عربي / English / ثنائي)", cls: "bg-purple", fn: () => { lang = lang === "ar" ? "en" : lang === "en" ? "both" : "ar"; draw(document.getElementById("certModalCanvas")); } },
      { label: "إغلاق", cls: "bg-dark", fn: closePreview },
    ]);
    return open();
  },
  render() {
    const root = document.getElementById("certAdminRoot"); if (!root) return;
    const cur = templateById(settings.templateId);
    const exams = window.__exam.getExams().filter((e) => !e.archived);
    const E = window.__exam.esc;
    const keepFocus = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : "";
    root.innerHTML = `
      <h3>🎓 شهادات الامتحانات</h3>
      <p class="admin-help">40 تصميم جاهز. اختيارك بيطبّق على الشهادات <b>الجديدة</b> فقط — الشهادات اللي اتصدرت قبل كده بتفضل بتصميمها الأصلي.</p>
      <div class="cert-current"><span>التصميم المعتمد حالياً:</span> <b>${E(cur.name)}</b> <span class="cert-num">${cur.id.toUpperCase()}</span>
        <button class="abtn bg-blue" style="padding:6px 12px;font-size:12px" onclick="CertAdmin.preview('${cur.id}')">👁️ معاينة</button></div>
      <div class="cert-settings-grid">
        <div><label for="certInst">اسم الجهة / المنصة</label><input id="certInst" maxlength="80" value="${E(settings.institution || "")}"></div>
        <div><label for="certSigner">اسم الموقِّع</label><input id="certSigner" maxlength="60" placeholder="مثال: أ. أحمد" value="${E(settings.signer || "")}"></div>
        <div><label for="certSignerTitle">صفة الموقِّع</label><input id="certSignerTitle" maxlength="60" placeholder="مثال: مدرس المادة" value="${E(settings.signerTitle || "")}"></div>
        <div><label for="certLang">لغة الشهادة</label><select id="certLang"><option value="ar" ${settings.lang === "ar" ? "selected" : ""}>العربية</option><option value="en" ${settings.lang === "en" ? "selected" : ""}>English</option><option value="both" ${settings.lang === "both" ? "selected" : ""}>عربي + English</option></select></div>
      </div>
      <label class="cert-switch" style="margin:10px 0"><input type="checkbox" id="certEnabled" ${settings.enabled !== false ? "checked" : ""}> السماح للطالب بتحميل شهادته بعد النجاح</label>
      <button class="abtn bg-green" onclick="CertAdmin.saveForm()">💾 حفظ بيانات الشهادة</button>
      <details style="margin:16px 0"><summary style="cursor:pointer;font-weight:800;color:var(--P)">🎯 تصميم مختلف لامتحان معيّن (اختياري)</summary>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">${exams.length ? exams.map((e) => `<div class="cert-toolbar" style="margin:0"><span style="flex:1;min-width:140px;font-weight:700">${E(e.name)}</span>
          <select id="certEx_${E(e.id)}" onchange="CertAdmin.setExamTemplate('${E(e.id)}', this.value)"><option value="">افتراضي (${E(cur.name)})</option>${TEMPLATES.map((t) => `<option value="${t.id}" ${settings.examTemplates && settings.examTemplates[e.id] === t.id ? "selected" : ""}>${t.id.toUpperCase()} — ${E(t.name)}</option>`).join("")}</select></div>`).join("") : '<p class="admin-help">لا توجد امتحانات.</p>'}</div></details>
      <h4 style="margin:14px 0 8px">🖼️ كل التصاميم (${TEMPLATES.length})</h4>
      <div class="cert-groups">${[["all", "الكل"], ...Object.entries(GROUPS)].map(([k, l]) => `<button type="button" class="es-chip ${_filter === k ? "on" : ""}" onclick="CertAdmin.setFilter('${k}')">${l} <b>${k === "all" ? TEMPLATES.length : TEMPLATES.filter((t) => t.group === k).length}</b></button>`).join("")}</div>
      <div class="cert-grid">${TEMPLATES.filter((t) => _filter === "all" || t.group === _filter).map((t) => `
        <div class="cert-card ${t.id === settings.templateId ? "active" : ""}">
          <div class="cert-thumb" onclick="CertAdmin.preview('${t.id}')" title="معاينة كبيرة"><canvas data-tid="${t.id}" width="420" height="297"></canvas></div>
          <div class="cert-info"><div class="cert-name"><span>${E(t.name)} <small>${E(t.en)}</small></span><span class="cert-num">${t.id.toUpperCase()}</span></div>
            <div class="cert-actions"><button class="abtn bg-blue" onclick="CertAdmin.preview('${t.id}')">👁️ معاينة</button>
            <button class="abtn ${t.id === settings.templateId ? "bg-dark" : "bg-green"}" ${t.id === settings.templateId ? "disabled" : ""} onclick="CertAdmin.setDefault('${t.id}')">${t.id === settings.templateId ? "✅ مستخدم" : "استخدام"}</button></div></div>
        </div>`).join("")}</div>
      <h4 style="margin:22px 0 8px">📜 الشهادات الصادرة</h4><div id="certIssuedBox"></div>`;
    this.lazyThumbs();
    this.renderIssued();
    if (keepFocus) document.getElementById(keepFocus)?.focus();
  },
  setFilter(k) { _filter = k; this.render(); },
  lazyThumbs() {
    if (_io) _io.disconnect();
    const sample = SAMPLE(settings.lang || "ar");
    _io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return; const cv = en.target; _io.unobserve(cv);
      const T = templateById(cv.dataset.tid);
      loadFonts(T, sample.lang).then(() => renderCertificate(cv, T, sample));
    }), { rootMargin: "200px" });
    document.querySelectorAll("#certAdminRoot canvas[data-tid]").forEach((cv) => _io.observe(cv));
  },
  renderIssued() {
    const box = document.getElementById("certIssuedBox"); if (!box) return;
    const E = window.__exam.esc;
    const rows = Object.entries(issued).flatMap(([examId, byCode]) => Object.entries(byCode || {}).map(([code, v]) => ({ examId, code, ...v }))).sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0)).slice(0, 100);
    if (!rows.length) { box.innerHTML = '<p class="cmp-empty">لم تُصدر أي شهادة بعد. بتتصدر تلقائياً أول ما ينجح طالب ويفتح شهادته.</p>'; return; }
    box.innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>الطالب</th><th>الامتحان</th><th>التصميم</th><th>الرقم</th><th>التاريخ</th><th>إدارة</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${E(r.name)}</td><td>${E(r.exam)}</td><td>${E(templateById(r.templateId).name)}</td><td class="mono">${E(r.certNo)}</td><td style="font-size:11px">${E(new Date(r.issuedAt || 0).toLocaleDateString("ar-EG"))}</td>
      <td><button class="abtn bg-blue" style="padding:4px 10px;font-size:11px" onclick="CertAdmin.view('${E(r.examId)}','${E(r.code)}')">عرض</button>
      <button class="abtn bg-orange" style="padding:4px 10px;font-size:11px" onclick="CertAdmin.reissue('${E(r.examId)}','${E(r.code)}')">إعادة إصدار</button></td></tr>`).join("")}</tbody></table></div>`;
  },
  view(examId, code) {
    const sn = issued[examId] && issued[examId][code]; if (!sn) return;
    return openPreview(`شهادة ${sn.name}`, (cv) => renderSnapshotTo(cv, sn), [
      { label: "⬇️ PDF", cls: "bg-green", fn: () => downloadPDF(sn) }, { label: "🖼️ صورة", cls: "bg-blue", fn: () => downloadPNG(sn) }, { label: "إغلاق", cls: "bg-dark", fn: closePreview }]);
  },
  async reissue(examId, code) {
    const old = issued[examId] && issued[examId][code]; if (!old) return;
    if (!confirm(`إعادة إصدار شهادة ${old.name} بالتصميم والبيانات الحالية؟\nالشهادة القديمة هتتبدّل.`)) return;
    try {
      const res = (await get(ref(db(), `examResults/${examId}/${code}`))).val();
      if (!res) return alert("نتيجة الطالب غير موجودة.");
      const sn = buildSnapshot(res, examId, window.__exam.getAdmin().name); sn.certNo = old.certNo || sn.certNo;
      await set(ref(db(), `certificates/${examId}/${code}`), sn);
      window.__exam.logAction("إعادة إصدار شهادة: " + old.name); window.__exam.showToast("✅ تم إعادة الإصدار");
    } catch (e) { console.error(e); alert("تعذر إعادة الإصدار."); }
  },
};
window.CertAdmin = CertAdmin;

// ---------------------------------------------------------------- admin bulk PDF (يحتفظ بالدالة القديمة كاحتياطي)
const legacyPrint = window.examPrintCertificates;
window.examPrintCertificatesLegacy = legacyPrint;
window.examPrintCertificates = async () => {
  const ex = window.__exam.getCurEx(); if (!ex) return;
  try {
    listenSettings();
    if (!settingsLoaded) { const v = (await get(ref(db(), "certSettings"))).val() || {}; settings = { ...DEFAULTS, ...v, examTemplates: v.examTemplates || {} }; }
    const list = (await window.__exam.getExamResults(ex.id)).filter(window.__exam.isResultGradingComplete).sort((a, b) => b.score - a.score);
    const passMark = ex.passMark || 50;
    const passers = list.filter((r) => r.total && Math.round((r.score / r.total) * 100) >= passMark);
    if (!passers.length) return alert("لا يوجد ناجحون لطباعة شهادات");
    if (!confirm(`سيتم إنشاء PDF فيه ${passers.length} شهادة (كل واحدة في صفحة). متابعة؟`)) return;
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
    const admin = window.__exam.getAdmin();
    const cv = fullCanvas();
    for (let i = 0; i < passers.length; i++) {
      const sn = await ensureIssued({ ...passers[i], examName: passers[i].examName || ex.name }, ex.id, admin ? admin.name : "admin");
      await renderSnapshotTo(cv, sn);
      if (i) pdf.addPage();
      pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
    }
    pdf.save(`شهادات_${safeFile(ex.name)}.pdf`);
    window.__exam.logAction("طباعة شهادات: " + ex.name);
  } catch (e) {
    console.error("cert print failed, falling back", e);
    if (legacyPrint) return legacyPrint();
    alert("تعذر إنشاء الشهادات.");
  }
};
listenSettings.__init = true;
