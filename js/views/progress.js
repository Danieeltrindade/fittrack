/* views/progress.js — Progresso: peso, progressão de carga, calorias, proteína, carboidratos e hidratação. */
function pesoCard() {
  const L = S.pesos.slice().reverse(), vis = S.pAll ? L : L.slice(0, 6);
  return `<section class="panel"><div class="sec"><h2>Registros de peso</h2><div class="chips">${L.length > 6 ? `<button class="chip" data-act="pall">${S.pAll ? 'Ver menos' : 'Ver todos (' + L.length + ')'}</button>` : ''}<button class="btn sm" data-act="peso">${ic('plus')}Registrar peso</button></div></div>${vis.map(p => `<div class="li"><div><p>${fx(p.valor)} kg</p><small>${pd(p.data).toLocaleDateString('pt-BR')}</small></div>${rowBtns('pedit', 'pdel', p.id, 'Editar peso', 'Excluir peso')}</div>`).join('') || '<div class="empty">Nenhum peso registrado. Toque em Registrar peso.</div>'}</section>`;
}
// cartão de barras por dia (média no topo + gráfico com linha da meta)
const barCard = (cap, P, goal, u, label, fmtAvg, nut) => `<section class="panel k-${nut}"><div class="sec"><div class="nhd"><i class="nic">${ic(nut)}</i><div><p class="cap">${cap}</p><p class="num" style="font-size:26px">${fmtAvg(P.length ? P.reduce((x, y) => x + y.v, 0) / P.length : 0)}<small> ${u}/dia</small></p></div></div></div>${cw(520, () => bars(P, goal, u, label, 'var(--nc)'))}<div class="leg"><span><i></i>${label} por dia</span><span><i class="ln" style="background:var(--mut)"></i>Meta${goal ? ': ' + fmt(goal) + ' ' + u : ' não definida'}</span><span>Barras claras: abaixo de 90% da meta</span></div></section>`;

function vProg() {
  const n = S.range, cut = n ? ago(n).getTime() : 0, c = S.cfg, G = goals(), inr = p => p.t >= cut;
  const PW = pts(S.pesos.map(p => ({ t: pd(p.data).getTime(), v: p.valor })), 'kg', 'Peso').filter(inr);
  // progressão de carga: maior carga do dia (desempate por reps) para o exercício escolhido
  const by = {};
  S.hist.filter(h => h.ex === S.ex).forEach(h => { const b = by[h.data]; if (!b || h.carga > b.carga || (h.carga === b.carga && h.reps > b.reps)) by[h.data] = h; });
  const EA = pts(Object.keys(by).sort().map(d => ({ t: pd(d).getTime(), v: by[d].carga, r: by[d].reps })), 'kg', 'Carga', p => 'Exercício: ' + esc(S.ex), p => 'Repetições: ' + p.r).filter(inr);
  const ex = exNames().filter(x => S.hist.some(h => h.ex === x && h.carga > 0)), dlt = PW.length > 1 ? PW[PW.length - 1].v - PW[0].v : 0;
  return `<div class="pg">${hdr('Progresso', 'Sua evolução, com os dados que você registrou.', `<div class="chips" role="group" aria-label="Período">${RG.map(([r, l]) => `<button class="chip ${r === n ? 'on' : ''}" data-act="range" data-v="${r}">${l}</button>`).join('')}</div>`)}
<section class="panel"><div class="sec"><div><p class="cap">Peso</p><p class="num">${fx(PW.length ? PW[PW.length - 1].v : c.peso)}<small> kg</small></p></div><span class="tag ${dlt > 0 ? 'info' : ''}">${dlt >= 0 ? '+' : ''}${fx(dlt)} kg no período</span></div>${line(PW, 'kg', 'var(--accent)')}<div class="leg"><span><i class="ln" style="background:var(--accent)"></i>Peso (kg)</span>${S.cfg.target ? `<span>Peso desejado: ${fx(S.cfg.target)} kg</span>` : ''}</div></section>
<section class="panel"><div class="sec"><div><p class="cap">Evolução das cargas</p><h2 style="margin-top:4px">${esc(S.ex || '—')}</h2></div><select style="max-width:240px" data-chg="ex" aria-label="Exercício">${ex.map(x => `<option ${x === S.ex ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>${line(EA, 'kg', 'var(--c-train)')}<div class="leg"><span><i class="ln" style="background:var(--c-train)"></i>Maior carga do dia (kg)</span></div></section>
<div class="two">${barCard('Calorias', series('k').filter(inr), G.cal, 'kcal', 'Calorias', fmt, 'cal')}${barCard('Proteína', series('p').filter(inr), G.prot, 'g', 'Proteína', v => fmt(v), 'prot')}</div>
<div class="two">${barCard('Carboidratos', series('c').filter(inr), G.carb, 'g', 'Carboidratos', fmt, 'carb')}${barCard('Gordura', series('g').filter(inr), G.fat, 'g', 'Gordura', fmt, 'fat')}</div>
${barCard('Hidratação', waterSeries().filter(inr), waterGoal(DB), 'ml', 'Água', fmt, 'water')}${pesoCard()}</div>`;
}
on('range', (b, v) => { S.range = +v; render(); });
on('pall', () => { S.pAll = !S.pAll; render(); });

/* ---------- registros de peso (modal) ---------- */
function pesoModal(r) {
  S.pid = r ? r.id : null;
  modal(`${mTitle(r ? 'Editar peso' : 'Registrar peso', 14)}<div class="f"><div><label for="pdt">Data</label><input id="pdt" type="date" max="${iso(new Date())}" value="${r ? r.data : iso(new Date())}"></div><div><label for="pw">Peso (kg)</label><input id="pw" type="number" step=".1" inputmode="decimal" value="${r ? r.valor : ''}"></div></div><p class="sub" style="font-size:13px">Se já houver um peso nessa data, ele será atualizado.</p>${foot('psave', 'Salvar')}`);
}
on('peso', () => pesoModal());
on('pedit', (b, v) => pesoModal(S.pesos.find(p => p.id === v)));
on('psave', async () => {
  const dt = $('#pdt').value, w = parseFloat($('#pw').value);
  if (!dt || dt > iso(new Date())) { toast('Escolha uma data até hoje'); return; }
  if (!(w > 0 && w < 500)) { toast('Informe um peso válido'); return; }
  const r = await ProfileActions.savePeso(dt, w, S.pid); if (!r) return;
  closeModal(); toast(r === 'updated' ? 'Peso atualizado' : 'Peso registrado');
});
on('pdel', (b, v) => confirmM('Excluir registro de peso?', 'O registro será removido do histórico e do gráfico.', 'pdelok', v));
on('pdelok', async (b, v) => { if (!await ProfileActions.deletePeso(v)) return; closeModal(); toast('Registro excluído'); });
