const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = (k, t) => `<span class="pill ${k}">${t}</span>`;
const PILL = {
  feito: d => P('ok', d ? `feito em ${d}` : 'feito'),
  andamento: () => P('info', 'em andamento'),
  fila: n => P('warn', n != null ? `na fila · passo ${n}` : 'na fila'),
  admin: () => P('warn', 'depende do Admin'),
  ideia: () => P('idea', 'ideia'),
  desligado: () => P('bad', 'desligado nesta versão'),
  pendente: () => P('warn', 'pendente'),
};
function card(title, body, o = {}) {
  const pills = o.pills ? `<div class="pills">${o.pills.join('')}</div>` : '';
  const why = o.why ? `<p class="why"><b>Por quê.</b> ${o.why}</p>` : '';
  return `<div class="card${o.k ? ' k-' + o.k : ''}"><h3>${title}</h3>${pills}${body}${why}</div>`;
}
function dec(d, pq, meta) {
  const m = meta ? `<div class="dmeta">${meta.join('')}</div>` : '';
  return `<div class="dec">${m}<div class="dr"><b>Decisão</b><p>${d}</p></div><div class="dr pq"><b>Por quê</b><p>${pq}</p></div></div>`;
}
function step(n, title, desc, pill, why, k) {
  return `<li class="step${k ? ' k-' + k : ''}"><span class="sn">${n}</span><div><div class="sh"><h3>${title}</h3>${pill}</div><p>${desc}</p><p class="why"><b>Por que aqui:</b> ${why}</p></div></li>`;
}
function cb(id, title, pre) {
  return `<div class="cb" id="${id}"><div class="cb-h"><a class="cb-id" href="#${id}">Exemplo#${id}</a><span class="cb-t">${title}</span></div><pre>${pre}</pre></div>`;
}
const tiles = arr => `<div class="tiles">${arr.map(([s, b, sm]) => `<div class="tile"><span>${s}</span><b>${b}</b>${sm ? `<small>${sm}</small>` : ''}</div>`).join('')}</div>`;
const tbl = (h, rows) => `<div class="tw"><table class="t"><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${typeof c === 'object' && c.m ? ' class="m"' : ''}>${typeof c === 'object' ? c.v : c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const ul = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const C = s => `<code>${esc(s)}</code>`;
const h2 = (id, t) => `<h2 id="${id}">${t}</h2>`;
const prose = (...ps) => `<div class="prose">${ps.map(p => p.startsWith('<') ? p : `<p>${p}</p>`).join('')}</div>`;
const rule = (l, t) => `<div class="rule"><span class="lbl">${l}</span><p>${t}</p></div>`;
const note = (b, t) => `<div class="note"><b>${b}</b> ${t}</div>`;
module.exports = { esc, P, PILL, card, dec, step, cb, tiles, tbl, ul, C, h2, prose, rule, note };
