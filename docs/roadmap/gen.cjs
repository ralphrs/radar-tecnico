const fs = require('fs');
const css = require('./css.cjs');
const pages = [...require('./pages1.cjs'), ...require('./pages2.cjs')];
const OUT = process.argv[2];

const ICON = {
  menu: '<svg class="ph" viewBox="0 0 256 256" aria-hidden="true"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"/></svg>',
  close: '<svg class="ph" viewBox="0 0 256 256" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>',
  theme: '<svg class="ph" viewBox="0 0 256 256" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192V40a88,88,0,0,1,0,176Z"/></svg>',
  mark: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" opacity=".55"/><path d="M12 12 L18.4 5.6"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
};

// sub-itens do trilho a partir dos h2 de cada página
function subs(p) {
  const out = [];
  const re = /<h2 id="([^"]+)">([^<]+)<\/h2>/g; let m;
  for (const part of p.body) { while ((m = re.exec(part))) out.push([m[1], m[2]]); re.lastIndex = 0; }
  return out;
}

const groups = [];
pages.forEach((p, i) => {
  p.n = i + 1;
  let g = groups.find(x => x.name === p.group);
  if (!g) groups.push(g = { name: p.group, items: [] });
  g.items.push(p);
});

const rail = `<div class="rail-scrim" id="scrim" hidden></div>
<nav class="rail rail-drawer" id="rail" aria-label="Páginas do roadmap">
  <div class="rail-top"><b>Páginas</b><button type="button" class="icon-btn" id="rail-close" aria-label="Fechar páginas">${ICON.close}</button></div>
${groups.map(g => `  <h6>${g.name}</h6>
  <ul>
${g.items.map(p => `    <li data-p="${p.id}"><button type="button" data-go="${p.id}"><span class="n">${String(p.n).padStart(2, '0')}</span><span class="nm">${p.nm}</span><span class="st s-${p.st}" aria-hidden="true"></span></button>
      <ul>${subs(p).map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ul></li>`).join('\n')}
  </ul>`).join('\n')}
  <div class="rail-legend" aria-hidden="true"><span><i class="st s-ok"></i>no ar</span><span><i class="st s-info"></i>em andamento</span><span><i class="st s-warn"></i>na fila ou pendente</span><span><i class="st s-idea"></i>ideia</span></div>
</nav>`;

const panels = pages.map((p, i) => {
  const prev = pages[i - 1], next = pages[i + 1];
  const pager = `<nav class="pager" aria-label="Página anterior e próxima">${prev ? `<a class="pv" href="#${prev.id}"><span>Anterior</span><b>${prev.nm}</b></a>` : ''}${next ? `<a class="nx" href="#${next.id}"><span>Próxima</span><b>${next.nm}</b></a>` : `<a class="nx" href="#comecar"><span>Voltar ao início</span><b>Começar por aqui</b></a>`}</nav>`;
  return `<section class="panel" id="${p.id}" aria-labelledby="h-${p.id}">
<div class="phead"><div class="crumbs"><i></i><span class="num">${String(p.n).padStart(2, '0')}</span><span>${p.group}</span></div>
<h1 class="pg" id="h-${p.id}">${p.nm}</h1>
<div class="lede">${p.lede.map(x => `<p>${x}</p>`).join('')}</div>
<div class="pstat">${p.pstat.join('')}</div></div>
${p.body.join('\n')}
${pager}
</section>`;
}).join('\n');

const js = `(function(){
  var ids=${JSON.stringify(pages.map(p => p.id))};
  var root=document.documentElement, rail=document.getElementById('rail'), scrim=document.getElementById('scrim'), mb=document.getElementById('menu-btn');
  function panelOf(id){ if(!id) return null; var el=document.getElementById(id); if(!el) return null; if(el.classList.contains('panel')) return el; return el.closest ? el.closest('.panel') : null; }
  function closeNav(){ rail.classList.remove('on'); scrim.classList.remove('on'); document.body.classList.remove('nav-lock'); mb.setAttribute('aria-expanded','false'); setTimeout(function(){ if(!scrim.classList.contains('on')) scrim.hidden=true; },220); }
  function openNav(){ scrim.hidden=false; requestAnimationFrame(function(){ scrim.classList.add('on'); }); rail.classList.add('on'); document.body.classList.add('nav-lock'); mb.setAttribute('aria-expanded','true'); var on=rail.querySelector('li.on>button'); if(on) on.focus(); }
  function route(){
    var h=''; try{ h=decodeURIComponent((location.hash||'').slice(1)); }catch(e){ h=''; }
    var p=panelOf(h) || document.getElementById(ids[0]);
    var ps=document.querySelectorAll('.panel');
    for(var i=0;i<ps.length;i++){ ps[i].classList.toggle('on', ps[i]===p); }
    var lis=rail.querySelectorAll('li[data-p]');
    for(var j=0;j<lis.length;j++){ var on=lis[j].getAttribute('data-p')===p.id; lis[j].classList.toggle('on',on); var b=lis[j].querySelector('button'); if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); }
    var t=document.getElementById(h);
    if(t && t!==p){ t.scrollIntoView(); } else { window.scrollTo(0,0); }
    var h1=p.querySelector('h1'); document.title=(h1?h1.textContent+' · ':'')+'Roadmap do Lookout';
  }
  rail.addEventListener('click',function(e){
    var b=e.target.closest('button[data-go]');
    if(b){ var id=b.getAttribute('data-go'); if(location.hash==='#'+id) route(); else location.hash=id; closeNav(); return; }
    if(e.target.closest('a[href^="#"]')) closeNav();
  });
  mb.addEventListener('click',function(){ rail.classList.contains('on') ? closeNav() : openNav(); });
  document.getElementById('rail-close').addEventListener('click',closeNav);
  scrim.addEventListener('click',closeNav);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape' && rail.classList.contains('on')){ closeNav(); mb.focus(); } });
  window.addEventListener('hashchange',route);
  // tema: sistema, claro, escuro
  var tb=document.getElementById('theme-btn'), tl=tb.querySelector('.lbl');
  var modes=['sistema','claro','escuro'], cur='sistema';
  try{ var s=localStorage.getItem('roadmap-lookout-tema'); if(modes.indexOf(s)>=0) cur=s; }catch(e){}
  function applyTheme(){ if(cur==='claro') root.setAttribute('data-theme','light'); else if(cur==='escuro') root.setAttribute('data-theme','dark'); else root.removeAttribute('data-theme'); tl.textContent=cur.charAt(0).toUpperCase()+cur.slice(1); tb.setAttribute('aria-label','Tema: '+cur+'. Trocar tema'); }
  tb.addEventListener('click',function(){ cur=modes[(modes.indexOf(cur)+1)%3]; try{ localStorage.setItem('roadmap-lookout-tema',cur); }catch(e){} applyTheme(); });
  applyTheme();
  route();
})();`;

const html = `<title>Roadmap do Lookout</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${css}</style>
<div class="shell">
<header class="top"><div class="topin">
  <a class="brand" href="#comecar" aria-label="Roadmap do Lookout, começar por aqui"><span class="mark">${ICON.mark}</span><b>Lookout</b><span class="sep" aria-hidden="true"></span><span class="sub">Roadmap</span></a>
  <div class="top-r">
    <span class="asof">estado de 04/11/2026</span>
    <button type="button" class="icon-btn theme-btn" id="theme-btn" aria-label="Trocar tema">${ICON.theme}<span class="lbl">Sistema</span></button>
    <button type="button" class="menu-btn" id="menu-btn" aria-label="Abrir páginas" aria-expanded="false" aria-controls="rail">${ICON.menu}<span class="nm">Páginas</span></button>
  </div>
</div></header>
<div class="layout">
${rail}
<main id="conteudo">
<svg class="defs" aria-hidden="true"><defs>
  <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="fl-ah"/></marker>
  <marker id="ahe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="fl-ahe"/></marker>
  <marker id="ahl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="fl-ahl"/></marker>
</defs></svg>
${panels}
</main>
</div>
</div>
<script>${js}</script>
`;

fs.writeFileSync(OUT, html);
console.log('bytes', Buffer.byteLength(html), 'paginas', pages.length);
