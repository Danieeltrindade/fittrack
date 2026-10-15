/* components/ui.js — pequenos blocos de interface compartilhados entre as telas. */
const hdr = (t, s, r) => `<header class="hd"><div><h1>${t}</h1><p class="sub">${s}</p></div>${r || ''}</header>`;
const wt = n => n.split(' · ').pop();                               // "Treino 1 · Push" → "Push"
const wkk = n => n.includes(' · ') ? n.split(' · ')[0] : 'Treino';  // "Treino 1 · Push" → "Treino 1"
// barra de progresso real (acima de 100% a barra enche; o texto mostra o valor verdadeiro)
const pb = (v, g) => `<div class="bar" role="progressbar" aria-valuenow="${Math.round(pct(v, g) * 100)}" aria-valuemin="0" aria-valuemax="100"><i class="${g > 0 && v >= g ? 'ok' : ''}" style="width:${Math.min(pct(v, g) * 100, 100)}%"></i></div>`;
// quatro metas do dia: Calorias, Proteína, Carboidratos, Gordura — consumido / meta / percentual
const strip = (T, G) => `<div class="strip">${[
  ['Calorias', T.k, G.cal, 'kcal'], ['Proteína', T.p, G.prot, 'g'], ['Carboidratos', T.c, G.carb, 'g'], ['Gordura', T.g, G.fat, 'g']
].map(([n, v, g, u]) => `<div class="m"><span class="cap">${n}</span><p class="num">${fmt(v)}<small> / ${fmt(g)} ${u}</small></p>${pb(v, g)}<span class="pc">${Math.round(pct(v, g) * 100)}%</span></div>`).join('')}</div>`;
const rowBtns = (a1, a2, v, l1, l2) => `<div class="row" style="gap:0"><button class="ib" aria-label="${l1}" data-act="${a1}" data-v="${v}">${ic('edit')}</button><button class="ib" aria-label="${l2}" data-act="${a2}" data-v="${v}">${ic('trash')}</button></div>`;
// resumo de um treino: "N exercícios · M séries"
const wsum = t => { const n = t.ex.length, s = sum(t.ex, 's'); return `${n} exercício${n === 1 ? '' : 's'} · ${s} séries`; };
