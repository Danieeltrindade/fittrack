/* views/hydration.js — Hidratação: só água. Meta diária, volumes rápidos, registro manual, histórico do dia e garrafa animada. */
const HYD = { prev: 0 }, HB = 284, BOT = 'M52 22 L88 22 L88 50 C88 66 120 70 120 100 L120 296 Q120 312 104 312 L36 312 Q20 312 20 296 L20 100 C20 70 52 66 52 50 Z';
/* status pelo percentual: 0–30 Começando · 31–70 No caminho · 71–99 Quase lá · 100+ Meta atingida */
const wStat=p=>p>=100?['Meta atingida','ok']:p>=71?['Quase lá','']:p>=31?['No caminho','']:['Começando',''];
/* garrafa SVG: o nível da água (f0 → f1) sobe com transição CSS; ondas animadas por CSS */
function bottle(f0,f1,pct,o){o=o||{};const id=o.id||'h',col=o.col||'var(--accent)',wv='M0 0 q17.5 -5 35 0 t35 0 t35 0 t35 0 t35 0 t35 0 t35 0 t35 0 V300 H0 Z';
return `<svg class="bottle" viewBox="0 0 140 330" role="img" aria-label="Garrafa de água ${pct}% preenchida"><defs><clipPath id="${id}clip"><path d="${BOT}"/></clipPath><linearGradient id="${id}grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${col};stop-opacity:.95"/><stop offset="1" style="stop-color:${col};stop-opacity:.55"/></linearGradient></defs>
<rect x="54" y="2" width="32" height="20" rx="5" style="fill:var(--s2);stroke:var(--mut);stroke-opacity:.5"/>
<g clip-path="url(#${id}clip)"><g class="wg" data-f="${f1}" style="transform:translateY(${(1-f0)*HB}px);opacity:${f0>0?1:0}"><g transform="translate(0,28)"><path class="wave b" d="${wv}" fill="url(#${id}grad)" opacity=".45"/><path class="wave" d="${wv}" fill="url(#${id}grad)"/></g></g>${[.25,.5,.75].map(t=>`<line x1="104" x2="120" y1="${312-t*HB}" y2="${312-t*HB}" style="stroke:var(--ink);stroke-opacity:.28"/>`).join('')}</g>
<path d="${BOT}" fill="none" style="stroke:var(--mut);stroke-opacity:.6" stroke-width="2"/><rect x="30" y="104" width="6" height="150" rx="3" style="fill:var(--ink);fill-opacity:.1"/></svg>`}
function hydStart(){const gs=document.querySelectorAll?[...document.querySelectorAll('.wg')]:[];if(!gs.length)return;const go=()=>gs.forEach(g=>{const f=+g.dataset.f;g.style.transform=`translateY(${(1-f)*HB}px)`;g.style.opacity=f>0?1:0});if(S.view==='hidratacao')HYD.prev=+gs[0].dataset.f;if(window.requestAnimationFrame)requestAnimationFrame(()=>requestAnimationFrame(go));else go()}
function waterModal() {
  modal(`${mTitle('Adicionar água manualmente', 0)}<p class="sub" style="margin-bottom:14px">Registro em ${pd(S.hdate).toLocaleDateString('pt-BR')}.</p><div class="f"><div><label for="wq">Quantidade (ml)</label><input id="wq" type="number" inputmode="numeric" min="1" step="50" value="500"></div><div><label for="wt">Horário</label><input id="wt" type="time" value="${nowHM()}"></div></div>${foot('wsave', 'Adicionar')}`);
}
function vHidr() {
  const tot = sum(S.hyd, 'amount'), goal = S.wgoal, td = iso(new Date());
  const p = goal > 0 ? Math.floor(tot * 100 / goal + 1e-9) : 0, f = goal > 0 ? Math.min(1, tot / goal) : 0, left = Math.max(0, goal - tot), [st, cls] = wStat(p);
  return `<div class="pg">${hdr('Hidratação', 'Acompanhe a água que você bebe ao longo do dia.')}
${dateBar('hdate', S.hdate > td ? '<span class="tag mute">Data futura</span>' : '')}
<div class="hgrid"><section class="panel hbot"><span class="tag ${cls}" id="wstat">${st}</span>${bottle(HYD.prev, f, p)}<p class="hpct" id="wpct">${p}%</p><p class="sub" style="margin:0">${fmt(tot)} de ${fmt(goal)} ml</p></section>
<div class="hcol"><section class="panel"><div class="hstats"><div><span class="cap">Consumido</span><b id="wtot">${fmt(tot)}<small> ml</small></b></div><div><span class="cap">Meta</span><b id="wgoal">${fmt(goal)}<small> ml</small></b></div><div><span class="cap">Falta</span><b id="wleft">${fmt(left)}<small> ml</small></b></div><div><span class="cap">Progresso</span><b>${p}%</b></div></div></section>
<section class="panel"><div class="sec"><h2>Adicionar água</h2></div><div class="hq">${WATER_QUICK.map(a => `<button type="button" class="btn s lg" data-act="wadd" data-v="${a}">+${a} ml</button>`).join('')}</div><button type="button" class="btn w" style="margin-top:12px" data-act="wmanual">${ic('plus')}Adicionar manualmente</button></section>
<section class="panel"><div class="sec"><h2>Registros do dia</h2><span class="mut" style="font-size:13px">${S.hyd.length} registro${S.hyd.length === 1 ? '' : 's'}</span></div>${S.hyd.map(h => `<div class="li"><p>${h.time} — ${fmt(h.amount)} ml</p><button class="ib" aria-label="Excluir registro de ${h.time}, ${h.amount} ml" data-act="wdel" data-v="${h.id}">${ic('trash')}</button></div>`).join('') || '<div class="empty">Nenhum registro de água neste dia.</div>'}</section></div></div></div>`;
}
const futureBlock = () => { if (S.hdate > iso(new Date())) { toast('Não é possível registrar água em uma data futura.'); return true; } return false; };
on('wadd', async (b, v) => { if (futureBlock()) return; if (await HydrationActions.add(S.hdate, nowHM(), +v)) toast('+' + v + ' ml registrados'); });
on('wmanual', () => { if (futureBlock()) return; waterModal(); });
on('wsave', async () => {
  const q = parseInt($('#wq').value), t = ($('#wt').value || '').trim();
  if (!(q >= 10 && q <= 5000)) { toast('Informe uma quantidade entre 10 e 5.000 ml'); return; }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) { toast('Informe o horário'); return; }
  if (futureBlock()) return;
  if (!await HydrationActions.add(S.hdate, t, q)) return;
  closeModal(); toast('Registro adicionado');
});
on('wdel', async (b, v) => { if (await HydrationActions.remove(v)) toast('Registro excluído'); });
