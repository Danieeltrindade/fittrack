/* views/dashboard.js — Início: resumo do dia (macros, água, treino, peso) e da semana. */
function vInicio() {
  const td = iso(new Date()), T = dayAll(td), G = goals(), c = S.cfg, tt = todayT(), h = new Date().getHours();
  const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  // peso
  const PW = pts(S.pesos.map(p => ({ t: pd(p.data).getTime(), v: p.valor })), 'kg', 'Peso').filter(p => p.t >= ago(90).getTime());
  const w7 = S.pesos.filter(p => pd(p.data) <= ago(7)).pop(), dl = w7 ? c.peso - w7.valor : null;
  const dls = dl === null ? '—' : (dl >= 0 ? '+' : '') + fx(dl) + ' kg';
  // água de hoje
  const wTot = dayWater(td), wGoal = waterGoal(DB), wPct = wGoal > 0 ? Math.floor(wTot * 100 / wGoal + 1e-9) : 0, wEv = evalNutrient('water', wTot, wGoal, goalTypeOf(DB));

  const feat = tt
    ? `<p class="cap">${tt.off === 0 ? 'Treino de hoje' : 'Próximo treino · ' + DIAS[(new Date().getDay() + tt.off) % 7]}</p><h2 class="big2">${esc(wt(tt.t.nome))}</h2><p class="sub">${wsum(tt.t)}</p><button class="btn lg" data-act="reg" data-v="${tt.t.id}">${ic('play')}Iniciar treino</button>`
    : `<p class="cap">Treino de hoje</p><h2 class="big2">${S.treinos.length ? 'Nenhum treino agendado' : 'Nenhum treino cadastrado'}</h2><p class="sub">${S.treinos.length ? 'Defina os dias de cada treino em Treinos › Editar, ou comece por um dos treinos abaixo.' : 'Crie o seu primeiro treino na aba Treinos.'}</p><button class="btn s lg" data-act="go" data-v="treinos">Ver treinos</button>`;

  return `<div class="pg"><header class="hd"><div><p class="cap">${dlong(new Date())}</p><h1 style="margin-top:8px">${hi}.</h1><p class="sub">Continue focado. Cada pequena ação aproxima você dos seus objetivos.</p></div></header>
${strip(T, G)}
<div class="row2"><section class="panel feat">${feat}</section>
<section class="panel k-water"><div class="hydc"><div class="hl"><div class="nhd"><i class="nic">${ic('water')}</i><div><p class="cap">Hidratação hoje</p><p class="num">${fmt(wTot)}<small> / ${fmt(wGoal)} ml</small></p></div></div><div><button class="chip" data-act="go" data-v="hidratacao">Registrar água</button></div><div>${nutBar(wEv)}<div class="nst"><span class="st t-${wEv.tone} ${wEv.reached ? 'reached' : ''}">${esc(wEv.text)}</span><span class="pc">${wPct}%</span></div></div></div><div class="hb">${bottle(0, Math.min(1, wGoal > 0 ? wTot / wGoal : 0), Math.min(100, wPct), { id: 'hd', col: 'var(--c-water)' })}</div></div></section></div>
<div class="row2"><section class="panel"><div class="sec" style="margin-bottom:6px"><div><p class="cap">Peso atual</p><p class="num">${fx(c.peso)}<small> kg</small></p></div>${dl !== null ? `<span class="tag ${dl > 0 ? 'info' : ''}">${dls} em 7 dias</span>` : ''}</div>${cw(480, () => line(PW, 'kg', 'var(--accent)'))}${c.target ? `<p class="sub" style="margin:8px 0 0">Peso desejado: <b style="color:var(--ink)">${fx(c.target)} kg</b> · ${Math.abs(c.peso - c.target) < .05 ? 'objetivo atingido' : (c.peso > c.target ? 'faltam ' + fx(c.peso - c.target) + ' kg para baixo' : 'faltam ' + fx(c.target - c.peso) + ' kg para cima')}</p>` : ''}</section>
${S.treinos.length ? `<section class="panel wl" style="padding:20px 24px"><div class="sec" style="margin-bottom:6px"><h2>Seus treinos</h2><button class="chip" data-act="go" data-v="treinos">Ver todos</button></div>${S.treinos.map((t, i) => `<div class="wr"><span class="ix">${i + 1}</span><div><p>${esc(wt(t.nome))}</p><small>${wsum(t)}</small></div><button class="ib play" aria-label="Iniciar ${esc(wt(t.nome))}" data-act="reg" data-v="${t.id}">${ic('play')}</button></div>`).join('')}</section>` : ''}</div>
<section class="panel"><div class="sec"><h2>Resumo da semana</h2><span class="mut" style="font-size:13px">% da meta por dia</span></div>${WeekChart.card(dls)}</section>`;
}
