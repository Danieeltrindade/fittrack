/* views/dashboard.js — Início: resumo do dia (macros, água, treino, peso) e da semana. */
function vInicio() {
  const td = iso(new Date()), T = dayAll(td), G = goals(), c = S.cfg, tt = todayT(), h = new Date().getHours();
  const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  // semana: calorias por dia (7 dias)
  const wkd = [6, 5, 4, 3, 2, 1, 0].map(i => { const d = ago(i); return { d, ...dayAll(iso(d)) }; });
  const wk = wkd.map(x => ({ t: x.d.getTime(), v: x.k })), act = wkd.filter(x => x.k > 0);
  const av = (k, u) => act.length ? fmt(act.reduce((s, x) => s + x[k], 0) / act.length) + `<small>${u}</small>` : '—';
  // peso
  const PW = pts(S.pesos.map(p => ({ t: pd(p.data).getTime(), v: p.valor })), 'kg', 'Peso').filter(p => p.t >= ago(90).getTime());
  const w7 = S.pesos.filter(p => pd(p.data) <= ago(7)).pop(), dl = w7 ? c.peso - w7.valor : null;
  const dls = dl === null ? '—' : (dl >= 0 ? '+' : '') + fx(dl) + ' kg';
  // água de hoje
  const wTot = dayWater(td), wGoal = waterGoal(DB), wPct = wGoal > 0 ? Math.floor(wTot * 100 / wGoal + 1e-9) : 0;

  const feat = tt
    ? `<p class="cap">${tt.off === 0 ? 'Treino de hoje' : 'Próximo treino · ' + DIAS[(new Date().getDay() + tt.off) % 7]}</p><h2 class="big2">${esc(wt(tt.t.nome))}</h2><p class="sub">${wsum(tt.t)}</p><button class="btn lg" data-act="reg" data-v="${tt.t.id}">${ic('play')}Iniciar treino</button>`
    : `<p class="cap">Treino de hoje</p><h2 class="big2">${S.treinos.length ? 'Nenhum treino agendado' : 'Nenhum treino cadastrado'}</h2><p class="sub">${S.treinos.length ? 'Defina os dias de cada treino em Treinos › Editar, ou comece por um dos treinos abaixo.' : 'Crie o seu primeiro treino na aba Treinos.'}</p><button class="btn s lg" data-act="go" data-v="treinos">Ver treinos</button>`;

  return `<div class="pg"><header class="hd"><div><p class="cap">${dlong(new Date())}</p><h1 style="margin-top:8px">${hi}.</h1><p class="sub">Continue focado. Cada pequena ação aproxima você dos seus objetivos.</p></div></header>
${strip(T, G)}
<div class="row2"><section class="panel feat">${feat}</section>
<section class="panel"><div class="sec" style="margin-bottom:10px"><div><p class="cap">Hidratação hoje</p><p class="num">${fmt(wTot)}<small> / ${fmt(wGoal)} ml</small></p></div><button class="chip" data-act="go" data-v="hidratacao">Registrar água</button></div>${pb(wTot, wGoal)}<span class="pc">${wPct}%${wTot >= wGoal ? ' · meta atingida' : ' · faltam ' + fmt(wGoal - wTot) + ' ml'}</span></section></div>
<div class="row2"><section class="panel"><div class="sec" style="margin-bottom:6px"><div><p class="cap">Peso atual</p><p class="num">${fx(c.peso)}<small> kg</small></p></div>${dl !== null ? `<span class="tag ${dl > 0 ? 'info' : ''}">${dls} em 7 dias</span>` : ''}</div>${cw(480, () => line(PW, 'kg'))}</section>
${S.treinos.length ? `<section class="panel wl" style="padding:20px 24px"><div class="sec" style="margin-bottom:6px"><h2>Seus treinos</h2><button class="chip" data-act="go" data-v="treinos">Ver todos</button></div>${S.treinos.map((t, i) => `<div class="wr"><span class="ix">${i + 1}</span><div><p>${esc(wt(t.nome))}</p><small>${wsum(t)}</small></div><button class="ib play" aria-label="Iniciar ${esc(wt(t.nome))}" data-act="reg" data-v="${t.id}">${ic('play')}</button></div>`).join('')}</section>` : ''}</div>
<section class="panel"><div class="sec"><h2>Resumo da semana</h2><span class="mut" style="font-size:13px">Calorias por dia</span></div><div class="wsum"><div class="stats"><div><b>${S.feitos}<small> / ${S.treinos.length}</small></b><span>treinos feitos</span></div><div><b>${av('k', ' kcal')}</b><span>média de calorias</span></div><div><b>${av('p', ' g')}</b><span>média de proteína</span></div><div><b>${dls}</b><span>peso em 7 dias</span></div></div><div>${bars(wk, c.cal, 'kcal', 'Calorias')}</div></section></div>`;
}
