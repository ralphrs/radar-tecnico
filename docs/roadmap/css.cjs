module.exports = `
:root{
  --bg:#f7f8fa;--card:#ffffff;--fg:#14181f;--muted:#5b6472;--border:#e3e6eb;
  --primary:#2563eb;--ok:#16a34a;--warn:#d97706;--bad:#dc2626;--idea:#7c3aed;
  --sunken:color-mix(in srgb,var(--fg) 4%,var(--bg));
  --border-strong:color-mix(in srgb,var(--fg) 20%,var(--card));
  --primary-bg:color-mix(in srgb,var(--primary) 9%,var(--card));
  --primary-bd:color-mix(in srgb,var(--primary) 38%,var(--card));
  --primary-fg:color-mix(in srgb,var(--primary) 82%,var(--fg));
  --ok-bg:color-mix(in srgb,var(--ok) 10%,var(--card));
  --ok-bd:color-mix(in srgb,var(--ok) 40%,var(--card));
  --ok-fg:color-mix(in srgb,var(--ok) 72%,var(--fg));
  --warn-bg:color-mix(in srgb,var(--warn) 11%,var(--card));
  --warn-bd:color-mix(in srgb,var(--warn) 42%,var(--card));
  --warn-fg:color-mix(in srgb,var(--warn) 68%,var(--fg));
  --bad-bg:color-mix(in srgb,var(--bad) 9%,var(--card));
  --bad-bd:color-mix(in srgb,var(--bad) 38%,var(--card));
  --bad-fg:color-mix(in srgb,var(--bad) 78%,var(--fg));
  --idea-bg:color-mix(in srgb,var(--idea) 9%,var(--card));
  --idea-bd:color-mix(in srgb,var(--idea) 38%,var(--card));
  --idea-fg:color-mix(in srgb,var(--idea) 80%,var(--fg));
  --scrim:rgba(10,12,16,.42);
  --sh-sm:0 1px 2px rgba(20,24,31,.06),0 1px 3px rgba(20,24,31,.08);
  --sh-xl:0 8px 16px rgba(20,24,31,.08),0 24px 48px rgba(20,24,31,.12);
  --sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --hdr:60px;--rail:248px;
  --r-sm:6px;--r-md:8px;--r-lg:12px;--r-full:999px;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0f1115;--card:#171a21;--fg:#e6e9ef;--muted:#9aa3b2;--border:#262b35;
  --primary:#60a5fa;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171;--idea:#a78bfa;
  --scrim:rgba(0,0,0,.6);
  --sh-sm:0 1px 2px rgba(0,0,0,.48);
  --sh-xl:0 24px 48px rgba(0,0,0,.64);
  color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0f1115;--card:#171a21;--fg:#e6e9ef;--muted:#9aa3b2;--border:#262b35;
  --primary:#60a5fa;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171;--idea:#a78bfa;
  --scrim:rgba(0,0,0,.6);
  --sh-sm:0 1px 2px rgba(0,0,0,.48);
  --sh-xl:0 24px 48px rgba(0,0,0,.64);
  color-scheme:dark}
body{background:var(--bg);color:var(--fg)}

*{box-sizing:border-box}
body{margin:0;font:15px/1.6 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
p{margin:0}
h1,h2,h3,h4{margin:0;font-weight:600;text-wrap:balance;letter-spacing:-.01em}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--mono);font-size:.86em;background:var(--sunken);border:1px solid var(--border);border-radius:5px;padding:0 4px;overflow-wrap:anywhere}
:focus-visible{outline:none;box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--primary);border-radius:4px}
.ph{width:16px;height:16px;fill:currentColor;flex:none;display:inline-block;vertical-align:-3px}
[hidden]{display:none!important}

/* Moldura: gutter lateral no wrapper externo */
.shell{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 env(safe-area-inset-bottom,0px)}
.top{position:sticky;top:0;z-index:100;margin-inline:calc(-1 * max(16px,env(safe-area-inset-left,0px)));padding-inline:max(16px,env(safe-area-inset-left,0px));padding-top:env(safe-area-inset-top,0px);background:color-mix(in srgb,var(--bg) 90%,transparent);-webkit-backdrop-filter:saturate(1.3) blur(10px);backdrop-filter:saturate(1.3) blur(10px);border-bottom:1px solid var(--border)}
.topin{display:flex;align-items:center;gap:12px;height:var(--hdr);max-width:1240px;margin:0 auto}
.brand{display:flex;align-items:center;gap:10px;color:var(--fg);min-width:0;flex:0 1 auto}
.brand:hover{text-decoration:none;color:var(--fg)}
.brand .mark{width:26px;height:26px;display:grid;place-items:center;color:var(--primary);flex:none}
.brand .mark svg{width:24px;height:24px}
.brand .sep{width:1px;height:18px;background:var(--border-strong);flex:none}
.brand b{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand span.sub{font-size:13px;color:var(--muted);white-space:nowrap}
.top-r{margin-left:auto;display:flex;align-items:center;gap:8px}
.asof{font:400 12px var(--mono);color:var(--muted);white-space:nowrap}
.icon-btn,.menu-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;min-width:36px;padding:0 10px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--card);color:var(--fg);font:500 13px var(--sans);cursor:pointer}
.icon-btn:hover,.menu-btn:hover{border-color:var(--border-strong)}
.menu-btn{display:none}
.menu-btn[aria-expanded="true"]{background:var(--primary-bg);border-color:var(--primary-bd);color:var(--primary-fg)}
.theme-btn .lbl{font-size:12.5px;color:var(--muted)}

.layout{display:grid;grid-template-columns:var(--rail) minmax(0,1fr);gap:40px;max-width:1240px;margin:0 auto}
main{min-width:0;padding-block:36px 120px}

/* Trilho */
.rail{position:sticky;top:var(--hdr);align-self:start;padding-block:28px 24px;max-height:calc(100vh - var(--hdr));overflow-y:auto;font-size:13.5px}
.rail h6{margin:18px 10px 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.rail h6:first-of-type{margin-top:0}
.rail ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.rail button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;color:var(--muted);background:transparent;border:0;padding:6px 10px;border-radius:var(--r-sm);font:inherit;cursor:pointer;line-height:1.35}
.rail button:hover{background:var(--sunken);color:var(--fg)}
.rail li.on>button{background:var(--primary-bg);color:var(--primary-fg);font-weight:500}
.rail button .n{flex:none;width:20px;font:400 11px var(--mono);color:var(--muted);font-variant-numeric:tabular-nums}
.rail li.on>button .n{color:var(--primary)}
.rail button .nm{flex:1;min-width:0}
.rail button .st{flex:none;width:7px;height:7px;border-radius:50%;background:var(--border-strong)}
.rail .st.s-ok{background:var(--ok)}.rail .st.s-info{background:var(--primary)}.rail .st.s-warn{background:var(--warn)}.rail .st.s-idea{background:var(--idea)}.rail .st.s-bad{background:var(--bad)}
.rail li ul{margin:2px 0 6px 18px;padding-left:10px;border-left:1px solid var(--border);display:none}
.rail li.on ul{display:grid}
.rail li ul a{display:block;font-size:12.5px;line-height:1.45;color:var(--muted);padding:3px 8px;border-radius:4px}
.rail li ul a:hover{color:var(--fg);background:var(--sunken);text-decoration:none}
.rail-legend{margin:18px 10px 0;display:grid;gap:4px;font-size:11.5px;color:var(--muted)}
.rail-legend span{display:flex;align-items:center;gap:7px}
.rail-legend .st{display:inline-block;width:7px;height:7px;border-radius:50%}
.rail-top,.rail-scrim{display:none}

/* Página */
.panel{display:none;scroll-margin-top:200px}
.panel.on{display:block}
.crumbs{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;font-weight:500;margin-bottom:10px}
.crumbs i{width:7px;height:7px;background:var(--primary);border-radius:1px}
.crumbs .num{font-family:var(--mono);letter-spacing:0;color:var(--primary)}
h1.pg{font-size:34px;line-height:1.12;letter-spacing:-.025em}
.lede{margin-top:14px;font-size:17px;line-height:1.55;color:var(--muted);max-width:70ch}
.lede p+p{margin-top:8px}
.pstat{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.phead{padding-bottom:26px;border-bottom:1px solid var(--border);margin-bottom:8px}
main h2{font-size:21px;margin:40px 0 0;scroll-margin-top:calc(var(--hdr) + 16px)}
main h3{font-size:15px}
.prose{margin-top:12px;max-width:74ch;display:grid;gap:10px;color:var(--fg)}
.prose p{font-size:15px}
.prose ul,.prose ol{margin:0;padding-left:20px;display:grid;gap:6px}
.muted{color:var(--muted)}

.pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;border-radius:var(--r-full);padding:1px 9px;border:1px solid var(--border);background:var(--card);color:var(--muted);white-space:nowrap;line-height:1.6}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.85}
.pill.plain::before{display:none}
.pill.ok{background:var(--ok-bg);border-color:var(--ok-bd);color:var(--ok-fg)}
.pill.warn{background:var(--warn-bg);border-color:var(--warn-bd);color:var(--warn-fg)}
.pill.info{background:var(--primary-bg);border-color:var(--primary-bd);color:var(--primary-fg)}
.pill.bad{background:var(--bad-bg);border-color:var(--bad-bd);color:var(--bad-fg)}
.pill.idea{background:var(--idea-bg);border-color:var(--idea-bd);color:var(--idea-fg)}
.pill.mono{font-family:var(--mono);font-size:11.5px}

.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr));gap:14px;margin-top:16px}
.cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}
.card{border:1px solid var(--border);border-radius:var(--r-lg);background:var(--card);padding:16px 18px;display:grid;gap:8px;align-content:start;min-width:0}
.card h3{font-size:15px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.card p,.card li{font-size:14px;color:var(--muted)}
.card ul{margin:0;padding-left:18px;display:grid;gap:4px}
.card .pills{display:flex;flex-wrap:wrap;gap:6px}
.card .why{font-size:13.5px;color:var(--muted);border-top:1px dashed var(--border);padding-top:8px}
.card .why b{color:var(--fg);font-weight:600}
.card.k-ok{border-left:3px solid var(--ok)}
.card.k-info{border-left:3px solid var(--primary)}
.card.k-warn{border-left:3px solid var(--warn)}
.card.k-idea{border-left:3px solid var(--idea)}
.card.k-bad{border-left:3px solid var(--bad)}

/* Fila numerada */
.steps{display:grid;gap:10px;margin-top:16px;list-style:none;padding:0}
.step{display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--card);padding:14px 16px}
.step .sn{width:36px;height:36px;border-radius:var(--r-full);display:grid;place-items:center;font:600 14px var(--mono);border:1px solid var(--border-strong);background:var(--sunken);color:var(--fg)}
.step.k-ok .sn{background:var(--ok-bg);border-color:var(--ok-bd);color:var(--ok-fg)}
.step.k-info .sn{background:var(--primary-bg);border-color:var(--primary-bd);color:var(--primary-fg)}
.step .sh{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.step h3{font-size:15px}
.step p{font-size:14px;color:var(--muted);margin-top:4px}
.step .why{margin-top:6px;font-size:13.5px;color:var(--muted)}
.step .why b{color:var(--fg)}

/* Tiles */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px}
.tile{padding:12px 14px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--card);display:flex;flex-direction:column;gap:2px;min-width:0}
.tile span{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500}
.tile b{font-size:24px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tile small{font-size:12px;color:var(--muted)}

/* Cartão de decisão */
.dec{margin-top:18px;border:1px solid var(--idea-bd);border-left:4px solid var(--idea);border-radius:var(--r-lg);background:var(--idea-bg);padding:14px 18px;display:grid;gap:10px;max-width:80ch}
.dec .dr{display:grid;grid-template-columns:84px minmax(0,1fr);gap:12px;align-items:baseline}
.dec .dr>b{font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--idea-fg)}
.dec .dr p{font-size:14.5px;color:var(--fg)}
.dec .dr.pq p{color:var(--muted)}
.dec .dmeta{display:flex;flex-wrap:wrap;gap:6px}
.opts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.opt{border:1px solid var(--border);border-radius:var(--r-md);background:var(--card);padding:12px 14px;display:grid;gap:6px;align-content:start}
.opt h4{font-size:14px}
.opt p,.opt li{font-size:13px;color:var(--muted)}
.opt ul{margin:0;padding-left:16px;display:grid;gap:3px}
.opt.pick{border-color:var(--ok-bd);box-shadow:inset 0 0 0 1px var(--ok-bd)}

/* Regra em destaque */
.rule{margin-top:18px;border:1px solid var(--primary-bd);background:var(--primary-bg);border-radius:var(--r-lg);padding:16px 20px;display:grid;gap:6px;max-width:80ch}
.rule .lbl{font-size:12px;font-weight:600;color:var(--primary-fg);text-transform:uppercase;letter-spacing:.06em}
.rule p{font-size:15px}
.note{margin-top:14px;border:1px solid var(--warn-bd);background:var(--warn-bg);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--fg);max-width:80ch}
.note b{color:var(--warn-fg)}

/* Diagramas */
.fig{margin-top:22px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--card);overflow:hidden;scroll-margin-top:calc(var(--hdr) + 16px)}
.fig .fh{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;padding:9px 16px;border-bottom:1px solid var(--border);background:var(--sunken);font-size:12.5px;color:var(--muted)}
.fig .fh a{font-family:var(--mono);font-size:11.5px;font-weight:600;color:var(--primary-fg);letter-spacing:.02em}
.fig:target{box-shadow:0 0 0 2px var(--primary-bd)}
.fig .fb{padding:18px 16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.fig .fc{padding:12px 16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);background:var(--sunken)}
svg.flow{display:block;width:100%;min-width:760px;height:auto}
.flow text{font-family:var(--sans)}
.fl-b rect,.fl-b polygon{fill:var(--card);stroke:var(--border-strong);stroke-width:1.2}
.fl-b.k-in rect{fill:var(--sunken)}
.fl-b.k-dec polygon{fill:var(--warn-bg);stroke:var(--warn-bd)}
.fl-b.k-ok rect{fill:var(--ok-bg);stroke:var(--ok-bd)}
.fl-b.k-bad rect{fill:var(--bad-bg);stroke:var(--bad-bd)}
.fl-b.k-ev rect{fill:var(--primary-bg);stroke:var(--primary-bd);stroke-dasharray:4 3}
.fl-b.k-idea rect{fill:var(--idea-bg);stroke:var(--idea-bd)}
.fl-b.k-opt rect{stroke-dasharray:4 3}
.fl-t{font-size:13.5px;font-weight:600;fill:var(--fg)}
.fl-s{font-size:12px;fill:var(--muted)}
.fl-m{font-family:var(--mono)!important;font-size:11.5px;fill:var(--muted)}
.fl-a{stroke:var(--muted);stroke-width:1.4;fill:none}
.fl-a.ev{stroke:var(--primary);stroke-dasharray:5 4}
.fl-a.loop{stroke:var(--idea);stroke-width:1.8}
.fl-ah{fill:var(--muted)}
.fl-ahe{fill:var(--primary)}
.fl-ahl{fill:var(--idea)}
.fl-loop{font-size:12px;font-weight:600;fill:var(--idea-fg)}
.fl-loopbg{fill:var(--idea-bg);stroke:var(--idea)}
.fl-lblbg{fill:var(--card)}
.fl-yes{font-size:12px;font-weight:600;fill:var(--ok-fg)}
.fl-no{font-size:12px;font-weight:600;fill:var(--bad-fg)}
.fl-n{fill:var(--card);stroke:var(--border-strong)}
.fl-nt{font-size:12px;font-weight:600;fill:var(--muted)}
.fl-lane{fill:var(--bg);stroke:var(--border)}
.fl-lt{font-size:11px;font-weight:600;letter-spacing:.08em;fill:var(--muted)}
.fl-list{margin:0;padding:14px 16px 16px;border-top:1px solid var(--border);display:grid;gap:7px;font-size:13.5px;color:var(--muted);counter-reset:n;list-style:none}
.fl-list li{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:start;counter-increment:n;line-height:1.5}
.fl-list li>span{min-width:0}
.fl-list li::before{content:counter(n);display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:var(--r-full);border:1px solid var(--border-strong);background:var(--card);font:600 12px var(--sans);color:var(--muted);margin-top:-1px}
.fl-list b{color:var(--fg);font-weight:600}
.fl-list b::after{content:" · ";color:var(--muted);font-weight:400}
.defs{position:absolute;width:0;height:0;overflow:hidden}

/* Blocos de exemplo */
.cb{margin-top:18px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--sunken);overflow:hidden;scroll-margin-top:calc(var(--hdr) + 16px)}
.cb:target{box-shadow:0 0 0 2px var(--primary-bd)}
.cb-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-height:40px;padding:6px 14px;border-bottom:1px solid var(--border);background:var(--card)}
.cb-id{font-family:var(--mono);font-size:11.5px;font-weight:600;color:var(--primary-fg);letter-spacing:.02em}
.cb-t{font-size:12.5px;color:var(--muted);min-width:0;flex:1}
.cb pre{margin:0;padding:14px 16px;font:400 12.5px/1.6 var(--mono);color:var(--fg);overflow-x:auto;white-space:pre;tab-size:2}
.cb pre .k{color:var(--primary-fg)}
.cb pre .hl{background:var(--warn-bg);box-shadow:inset 0 0 0 1px var(--warn-bd);border-radius:2px;padding:0 2px}
.cb pre .c{color:var(--muted)}

/* Tabelas */
.tw{margin-top:16px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--card);overflow-x:auto}
table.t{width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px}
table.t th{text-align:left;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:var(--sunken);padding:9px 12px;border-bottom:1px solid var(--border)}
table.t td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top;color:var(--fg)}
table.t tr:last-child td{border-bottom:0}
table.t td.m{font-family:var(--mono);font-size:12.5px;white-space:nowrap}

/* Linha do tempo */
.tl{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:0;max-width:84ch}
.tl>li{display:grid;grid-template-columns:96px minmax(0,1fr);gap:18px;position:relative;padding-bottom:26px}
.tl>li::before{content:"";position:absolute;left:105px;top:8px;bottom:-4px;width:1px;background:var(--border-strong)}
.tl>li:last-child::before{display:none}
.tl .d{font:600 13px var(--mono);color:var(--primary-fg);text-align:right;padding-top:2px}
.tl .d small{display:block;font:400 11.5px var(--sans);color:var(--muted)}
.tl .b{position:relative;padding-left:16px}
.tl .b::before{content:"";position:absolute;left:-15px;top:7px;width:11px;height:11px;border-radius:50%;background:var(--card);border:2px solid var(--primary)}
.tl .b h3{font-size:15px}
.tl .b ul{margin:6px 0 0;padding-left:18px;display:grid;gap:4px;font-size:14px;color:var(--muted)}

/* Navegação entre páginas */
.pager{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:72px;padding-top:24px;border-top:1px solid var(--border)}
.pager a{display:flex;flex-direction:column;gap:3px;padding:14px 16px;border:1px solid var(--border);border-radius:var(--r-lg);color:var(--fg);background:var(--card);min-width:0}
.pager a:hover{border-color:var(--primary-bd);text-decoration:none}
.pager a span{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:500}
.pager a b{font-weight:600;overflow-wrap:anywhere}
.pager a.nx{text-align:right;grid-column:2}

@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}

/* Tablet e celular: trilho vira gaveta */
@media (max-width:900px){
  .layout{display:block}
  .menu-btn{display:inline-flex}
  .rail-scrim{display:block;position:fixed;inset:0;z-index:110;background:var(--scrim);opacity:0;pointer-events:none;transition:opacity .2s cubic-bezier(.2,0,0,1)}
  .rail-scrim.on{opacity:1;pointer-events:auto}
  .rail.rail-drawer{position:fixed;inset:0 auto 0 0;width:min(340px,88vw);max-height:none;z-index:120;background:var(--bg);border-right:1px solid var(--border);box-shadow:var(--sh-xl);overflow-y:auto;overscroll-behavior:contain;padding:0 14px max(40px,env(safe-area-inset-bottom,0px)) max(14px,env(safe-area-inset-left,0px));transform:translateX(-104%);transition:transform .2s cubic-bezier(.2,0,0,1);visibility:hidden}
  .rail.rail-drawer.on{transform:none;visibility:visible}
  .rail-drawer .rail-top{display:flex;align-items:center;justify-content:space-between;height:var(--hdr);padding-top:env(safe-area-inset-top,0px);margin-bottom:12px;border-bottom:1px solid var(--border);font-size:14px}
  .rail button{min-height:40px}
  body.nav-lock{overflow:hidden}
  main{padding-block:24px 96px}
}
@media (max-width:640px){
  h1.pg{font-size:27px}
  .lede{font-size:16px}
  .cols,.opts{grid-template-columns:minmax(0,1fr)}
  .asof,.brand span.sub,.brand .sep,.theme-btn .lbl,.menu-btn .nm{display:none}
  .menu-btn{padding:0;width:36px}
  .fig .fh::after{content:"deslize para ver";margin-left:auto;font-size:11px;color:var(--muted)}
  .fig .fb{padding:14px 12px}
  .dec .dr{grid-template-columns:minmax(0,1fr);gap:2px}
  .step{grid-template-columns:minmax(0,1fr);gap:8px}
  .tl>li{grid-template-columns:minmax(0,1fr);gap:4px;padding-left:22px}
  .tl>li::before{left:5px;top:10px}
  .tl .d{text-align:left}
  .tl .b{padding-left:0}
  .tl .b::before{left:-22px;top:-18px}
  .pager{grid-template-columns:minmax(0,1fr)}
  .pager a.nx{grid-column:1}
}
`;
