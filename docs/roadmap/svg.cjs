// Helpers dos diagramas: grade de 210 px (x = 16, 226, 436, 646, 856), caixa 150 x 64, rx 10
const X = [16, 226, 436, 646, 856];
const W = 150, H = 64;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function badge(cx, cy, n) {
  return `<circle class="fl-n" cx="${cx}" cy="${cy}" r="11"/><text class="fl-nt" x="${cx}" y="${cy + 4}" text-anchor="middle">${n}</text>`;
}
// box(x, y, n, titulo, sub, opts) ; opts: {k, w, h, mono}
function box(x, y, n, t, s, o = {}) {
  const w = o.w || W, h = o.h || H, k = o.k ? ' ' + o.k : '';
  const cx = x + w / 2;
  const t1 = s ? y + h / 2 - 5 : y + h / 2 + 5;
  let out = `<g class="fl-b${k}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`;
  out += `<text class="fl-t" x="${cx}" y="${t1}" text-anchor="middle">${esc(t)}</text>`;
  if (s) out += `<text class="${o.mono ? 'fl-m' : 'fl-s'}" x="${cx}" y="${t1 + 19}" text-anchor="middle">${esc(s)}</text>`;
  out += badge(x + 18, y, n) + '</g>';
  return out;
}
// losango centrado em (cx, cy)
function dia(cx, cy, n, t, s, o = {}) {
  const w = o.w || 160, h = o.h || 110;
  const pts = `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;
  let out = `<g class="fl-b k-dec"><polygon points="${pts}"/>`;
  out += `<text class="fl-t" x="${cx}" y="${cy - 3}" text-anchor="middle">${esc(t)}</text>`;
  if (s) out += `<text class="fl-s" x="${cx}" y="${cy + 14}" text-anchor="middle">${esc(s)}</text>`;
  out += badge(cx - 24, cy - h / 2 + 4, n) + '</g>';
  return out;
}
function ar(d, kind) {
  const cls = kind === 'ev' ? 'fl-a ev' : kind === 'loop' ? 'fl-a loop' : 'fl-a';
  const m = kind === 'ev' ? 'ahe' : kind === 'loop' ? 'ahl' : 'ah';
  return `<path class="${cls}" d="${d}" marker-end="url(#${m})"/>`;
}
// rótulo com fundo, centrado em x
function lbl(x, y, text, cls = 'fl-s') {
  const w = Math.round(String(text).length * 6.6 + 12);
  return `<rect class="fl-lblbg" x="${x - w / 2}" y="${y - 13}" width="${w}" height="18" rx="4"/><text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${esc(text)}</text>`;
}
function loopLbl(x, y, text) {
  const w = Math.round(String(text).length * 6.8 + 18);
  return `<rect class="fl-loopbg" x="${x - w / 2}" y="${y - 14}" width="${w}" height="20" rx="10"/><text class="fl-loop" x="${x}" y="${y}" text-anchor="middle">${esc(text)}</text>`;
}
function lane(x, y, w, h, title) {
  return `<rect class="fl-lane" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/><text class="fl-lt" x="${x + 14}" y="${y + 18}">${esc(title.toUpperCase())}</text>`;
}
// figura completa
function fig(id, title, vb, body, caption, items, aria, minw) {
  const style = minw ? ` style="min-width:${minw}px"` : '';
  const list = items && items.length ? `<ol class="fl-list">${items.map(([b, t]) => `<li><span><b>${b}</b>${t}</span></li>`).join('')}</ol>` : '';
  return `<div class="fig" id="${id}"><div class="fh"><a href="#${id}">Diagrama#${id}</a><span>${title}</span></div><div class="fb"><svg class="flow" viewBox="${vb}"${style} role="img" aria-label="${esc(aria)}">${body}</svg></div><div class="fc">${caption}</div>${list}</div>`;
}
// lados das caixas
const R = (x) => x + W, CX = (x) => x + W / 2, CY = (y) => y + H / 2, B = (y) => y + H;

module.exports = { X, W, H, esc, box, dia, ar, lbl, loopLbl, lane, fig, R, CX, CY, B };
