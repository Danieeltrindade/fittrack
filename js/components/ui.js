/* components/ui.js — pequenos blocos de interface compartilhados entre as telas. */
const hdr = (t, s, r) => `<header class="hd"><div><h1>${t}</h1><p class="sub">${s}</p></div>${r || ''}</header>`;
const wt = n => n.split(' · ').pop();                               // "Treino 1 · Push" → "Push"
const wkk = n => n.includes(' · ') ? n.split(' · ')[0] : 'Treino';  // "Treino 1 · Push" → "Treino 1"
// barra de progresso real (acima de 100% a barra enche; o texto mostra o valor verdadeiro)
const pb = (v, g) => `<div class="bar" role="progressbar" aria-valuenow="${Math.round(pct(v, g) * 100)}" aria-valuemin="0" aria-valuemax="100"><i class="${g > 0 && v >= g ? 'ok' : ''}" style="width:${Math.min(pct(v, g) * 100, 100)}%"></i></div>`;
// quatro metas do dia: consumido / meta, restante ou excesso, percentual e barra que passa de 100% (ver goals.js)
const nutCard = (nut, v, g, gt) => {
  const e = evalNutrient(nut, v, g, gt), n = NUTR[nut];
  return `<div class="m k-${n.css}"><div class="nhd"><i class="nic">${ic(n.css)}</i><div><span class="cap">${n.name}</span><p class="num">${fmt(v)}<small> / ${e.has ? fmt(g) : '—'} ${n.unit}</small></p></div></div>${nutBar(e)}<div class="nst"><span class="st t-${e.tone} ${e.reached ? 'reached' : ''}">${e.has && e.tone === 'near' ? 'Quase na meta · ' : ''}${esc(e.text)}</span><span class="pc">${e.has ? e.pct + '%' : ''}</span></div></div>`;
};
const strip = (T, G, gt) => { gt = gt || goalTypeOf(DB); return `<div class="strip">${nutCard('cal', T.k, G.cal, gt)}${nutCard('prot', T.p, G.prot, gt)}${nutCard('fat', T.g, G.fat, gt)}${nutCard('carb', T.c, G.carb, gt)}</div>`; };
const rowBtns = (a1, a2, v, l1, l2) => `<div class="row" style="gap:0"><button class="ib" aria-label="${l1}" data-act="${a1}" data-v="${v}">${ic('edit')}</button><button class="ib" aria-label="${l2}" data-act="${a2}" data-v="${v}">${ic('trash')}</button></div>`;
// resumo de um treino: "N exercícios · M séries"
const wsum = t => { const n = t.ex.length, s = sum(t.ex, 's'); return `${n} exercício${n === 1 ? '' : 's'} · ${s} séries`; };
