/* views/workouts.js — Treinos: modelos de treino, registro livre de sessões por data, histórico. */

/* ---------- tela ---------- */
function sessionsOfDay() {
  const fut = S.tdate > iso(new Date()), tdy = S.tdate === iso(new Date()), L = S.sess.filter(s => s.data === S.tdate);
  return `<section class="panel" style="padding:18px 24px"><div class="sec" style="margin-bottom:${L.length ? 8 : 6}px"><h2>Sessões de ${pd(S.tdate).toLocaleDateString('pt-BR')}</h2>${tdy ? '<span class="tag">Hoje</span>' : fut ? '<span class="tag mute">Data futura</span>' : ''}</div>${L.map(s => `<div class="li"><div><p>${esc(s.treino)}</p><small>${s.feitas} de ${s.total} séries concluídas${s.obs ? ' · “' + esc(s.obs) + '”' : ''}</small></div>${rowBtns('sedit', 'sdel', s.id, 'Editar sessão', 'Excluir sessão')}</div>`).join('') || `<p class="sub" style="margin:0">${fut ? 'Data futura: ainda não é possível registrar treinos nela.' : 'Nenhuma sessão registrada nesta data. Escolha um treino abaixo para registrar.'}</p>`}</section>`;
}
function sessCard() {
  const all = S.sess.slice().sort((a, b) => a.data < b.data ? 1 : -1), L = S.sf ? all.filter(s => s.wid === S.sf) : all, vis = S.sessAll ? L : L.slice(0, 8), f = S.treinos.find(t => t.id === S.sf);
  return `<section class="panel" id="sessoes"><div class="sec"><h2>Sessões registradas${f ? ' · ' + esc(wt(f.nome)) : ''}</h2><div class="chips">${S.sf ? '<button class="chip" data-act="wclear">Limpar filtro</button>' : ''}${L.length > 8 ? `<button class="chip" data-act="sall">${S.sessAll ? 'Ver menos' : 'Ver todas (' + L.length + ')'}</button>` : ''}</div></div>${vis.map(s => `<div class="li"><div><p>${pd(s.data).toLocaleDateString('pt-BR')} · ${esc(s.treino)}</p><small>${s.feitas} de ${s.total} séries concluídas${s.obs ? ' · “' + esc(s.obs) + '”' : ''}</small></div>${rowBtns('sedit', 'sdel', s.id, 'Editar sessão', 'Excluir sessão')}</div>`).join('') || '<div class="empty">Nenhuma sessão registrada ainda.</div>'}</section>`;
}
function vTreinos() {
  const hs = S.hist.filter(h => h.ex === S.ex), ds = [...new Set(hs.map(h => h.data))].sort().reverse().slice(0, 6);
  return `<div class="pg">${hdr('Treinos', 'Escolha um treino para começar ou revise o histórico.', `<div class="hact"><button class="btn" data-act="new">${ic('plus')}Novo treino</button></div>`)}${dateBar('tdate')}${sessionsOfDay()}
<div class="wgrid">${S.treinos.map(t => `<article class="panel wk"><div class="row"><span class="cap">${esc(wkk(t.nome))}</span>${rowBtns('edit', 'del', t.id, 'Editar treino', 'Excluir treino')}</div><h2>${esc(wt(t.nome))}</h2><p class="exs">${t.ex.map(x => esc(x.n)).join(' · ') || 'Sem exercícios ainda.'}</p><div class="pills"><span>${t.ex.length} exercício${t.ex.length === 1 ? '' : 's'}</span><span>${sum(t.ex, 's')} séries</span>${t.dias.map(d => `<span class="dy">${DIAS[d]}</span>`).join('')}</div><div class="wk-f"><button class="btn" data-act="reg" data-v="${t.id}">${ic('play')}Iniciar treino</button><button class="btn s" data-act="whist" data-v="${t.id}">Histórico</button></div></article>`).join('') || '<div class="empty" style="grid-column:1/-1">Nenhum treino cadastrado. Toque em Novo treino.</div>'}</div>
<section class="panel"><div class="sec"><h2>Histórico do exercício</h2><select style="max-width:260px" data-chg="ex" aria-label="Exercício">${exNames().map(n => `<option ${n === S.ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
${ds.map(d => { const L = hs.filter(h => h.data === d).sort((a, b) => a.serie - b.serie), o = S.sess.find(s => s.data === d && s.exObs && s.exObs[S.ex]); return `<div class="li" style="align-items:flex-start"><div style="flex:none"><p>${dlong(pd(d))}</p>${o ? `<small>“${esc(o.exObs[S.ex])}”</small>` : ''}</div><div style="flex:1;min-width:0;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px 14px;font-size:14px">${L.map(h => `<span style="white-space:nowrap">${fx(h.carga)} kg × ${h.reps}</span>`).join('')}</div></div>`; }).join('') || '<div class="empty">Nenhum registro para este exercício.</div>'}</section>${sessCard()}</div>`;
}

/* ---------- editor de treino (nome, dias, exercícios + séries) ---------- */
function edModal() {
  const d = S.ed;
  modal(`${mTitle(d.id ? 'Editar treino' : 'Novo treino', 14)}<label for="en">Nome do treino</label><input id="en" value="${esc(d.nome)}" placeholder="Ex.: Treino E · Full body"><label style="margin-top:12px">Dias da semana</label><div class="chips">${DIAS.map((x, i) => `<button class="chip ${d.dias.includes(i) ? 'on' : ''}" data-act="day" data-v="${i}">${x}</button>`).join('')}</div>
${d.ex.map((x, i) => `<div class="exr"><div class="xr"><div><label>Exercício</label><input name="n" value="${esc(x.n)}" placeholder="Nome do exercício"></div><div><label>Séries</label><input name="s" type="number" inputmode="numeric" min="1" value="${x.s}"></div><button class="ib" data-act="delex" data-v="${i}" aria-label="Remover exercício">${ic('trash')}</button></div></div>`).join('')}
<button class="btn s sm" style="margin-top:14px" data-act="addex">${ic('plus')}Adicionar exercício</button>${foot('saveT', 'Salvar treino')}`);
}
function readEd() {
  const m = $('#sheet'); S.ed.nome = m.querySelector('#en').value;
  S.ed.ex = [...m.querySelectorAll('.exr')].map(r => ({ n: r.querySelector('[name=n]').value, s: Math.max(1, parseInt(r.querySelector('[name=s]').value) || 1) }));
}
on('new', () => { S.ed = { id: 0, nome: '', dias: [], ex: [{ n: '', s: 3 }] }; edModal(); });
on('edit', (b, v) => { S.ed = JSON.parse(JSON.stringify(S.treinos.find(t => t.id === v))); S.ed.ex = S.ed.ex.map(x => ({ n: x.n, s: x.s })); edModal(); });
on('day', (b, v) => { readEd(); const d = S.ed.dias, i = d.indexOf(+v); i < 0 ? d.push(+v) : d.splice(i, 1); edModal(); });
on('addex', () => { readEd(); S.ed.ex.push({ n: '', s: 3 }); edModal(); });
on('delex', (b, v) => { readEd(); S.ed.ex.splice(+v, 1); edModal(); });
on('saveT', async () => {
  readEd();
  if (!S.ed.nome.trim()) { toast('Dê um nome ao treino'); return; }
  const ed = S.ed; ed.ex = ed.ex.filter(x => x.n.trim());
  if (!await WorkoutActions.save(ed)) return;
  closeModal(); toast('Treino salvo');
});
on('del', (b, v) => confirmM('Excluir treino?', `“${esc(S.treinos.find(t => t.id === v).nome)}” será removido da sua lista. O histórico de séries é mantido.`, 'delok', v));
on('delok', async (b, v) => { if (!await WorkoutActions.remove(v)) return; closeModal(); toast('Treino excluído'); });

/* ---------- registro da sessão: o que foi realmente executado ---------- */
// Uma linha de série. p = série anterior (só referência); vals = valores já registrados (edição).
function setRow(j, p, vals, showPrev) {
  const ref = p ? `${fx(p.carga)} kg × ${p.reps}` : '—';
  const c = vals ? vals.load : (p ? p.carga : ''), r = vals ? vals.reps : '', on_ = vals && vals.completed;
  return `<div class="sr"><span>${j + 1}</span><span class="mut" title="${showPrev || 'Anterior'}">${ref}</span><input data-k="c" type="number" inputmode="decimal" step=".5" value="${c}" aria-label="Carga em kg, série ${j + 1}"><input data-k="r" type="number" inputmode="numeric" value="${r}" aria-label="Repetições, série ${j + 1}"><button class="dn ${on_ ? 'on' : ''}" data-act="set" aria-pressed="${!!on_}" aria-label="Série ${j + 1} concluída">✓</button></div>`;
}
const setHead = ref => `<div class="sr hd"><span>Série</span><span>${ref}</span><span>Carga (kg)</span><span>Reps</span><span>Ok</span></div>`;
function regModal(t) {
  S.reg = t; S.regPrev = t.ex.map(x => lastSets(x.n, S.regDate));
  modal(`${mTitle(esc(t.nome))}<p class="sub">Sessão de <b style="color:var(--ink)">${pd(S.regDate).toLocaleDateString('pt-BR')}</b>. Registre o que você realmente fez em cada série. A coluna “Anterior” é só uma referência.</p>${t.ex.map((x, i) => {
    const pv = S.regPrev[i];
    return `<div class="eb" data-i="${i}"><div class="row"><b>${esc(x.n)}</b></div>${setHead('Anterior')}${[...Array(x.s)].map((_, j) => setRow(j, pv[j] || pv[pv.length - 1])).join('')}<div class="setbar"><button class="chip" data-act="addset" data-v="${i}">+ Série</button><button class="chip" data-act="rmset" data-v="${i}">− Série</button></div><input data-k="o" placeholder="Observação do exercício (opcional)" style="margin-top:10px" aria-label="Observação de ${esc(x.n)}"></div>`;
  }).join('')}<label for="so" style="margin-top:16px">Observação da sessão (opcional)</label><input id="so" placeholder="Ex.: Última série muito pesada">${foot('fin', 'Finalizar treino')}`);
}
on('addset', (b, v) => {
  const bl = b.closest('.eb'), n = bl.querySelectorAll('.sr:not(.hd)').length, pv = S.regPrev[+v] || [];
  bl.querySelector('.setbar').insertAdjacentHTML('beforebegin', setRow(n, pv[n] || pv[pv.length - 1]));
});
on('rmset', b => { const rows = b.closest('.eb').querySelectorAll('.sr:not(.hd)'); if (rows.length > 1) rows[rows.length - 1].remove(); });
on('set', b => { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); });

// Lê a planilha aberta no modal. Nenhuma faixa de carga/reps é imposta; só exige reps em série marcada como concluída.
function readSheet(list) {
  const exs = []; let n = 0, bad = null;
  $('#sheet').querySelectorAll('.eb').forEach(bl => {
    const x = list[+bl.dataset.i], sets = [];
    bl.querySelectorAll('.sr:not(.hd)').forEach((r, j) => {
      const ok = r.querySelector('.dn').classList.contains('on'), load = parseFloat(r.querySelector('[data-k=c]').value) || 0, reps = parseInt(r.querySelector('[data-k=r]').value) || 0;
      if (ok) { n++; if (reps < 1 && !bad) bad = `Informe as repetições da série ${j + 1} de ${x.n}`; }
      sets.push({ setNumber: j + 1, load, reps, completed: ok });
    });
    exs.push({ exerciseId: x.id, exerciseName: x.n, sets, note: bl.querySelector('[data-k=o]').value.trim() });
  });
  return { exs, n, bad };
}
on('reg', (b, v) => {
  const rd = S.view === 'treinos' ? S.tdate : iso(new Date());
  if (rd > iso(new Date())) { toast('Não é possível registrar um treino em uma data futura.'); return; }
  S.regDate = rd; regModal(S.treinos.find(t => t.id === v));
});
on('fin', async () => {
  const t = S.reg, r = readSheet(t.ex.map(x => ({ id: x.id, n: x.n })));
  if (!r.n) { toast('Marque ao menos uma série concluída'); return; }
  if (r.bad) { toast(r.bad); return; }
  if (!await WorkoutActions.addSession({ id: uid(), date: S.regDate, workoutId: t.id, workoutName: t.nome, exercises: r.exs, notes: $('#so').value.trim() })) return;
  closeModal(); toast('Treino registrado');
});

/* ---------- editar / excluir sessão registrada ---------- */
function sessModal(id) {
  const h = DB.workoutHistory.find(x => x.id === id); if (!h) return;
  S.sid = id;
  modal(`${mTitle(esc(h.workoutName))}<p class="sub">${dlong(pd(h.date))} · ajuste carga, repetições e séries concluídas.</p>${h.exercises.map((x, i) => `<div class="eb" data-i="${i}"><div class="row"><b>${esc(x.exerciseName)}</b></div>${setHead('Registrado')}${x.sets.map((s, j) => setRow(j, { carga: s.load, reps: s.reps }, s)).join('')}<input data-k="o" value="${esc(x.note || '')}" placeholder="Observação do exercício (opcional)" style="margin-top:10px" aria-label="Observação de ${esc(x.exerciseName)}"></div>`).join('')}<label for="so" style="margin-top:16px">Observação da sessão (opcional)</label><input id="so" value="${esc(h.notes || '')}" placeholder="Ex.: Última série muito pesada"><div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Cancelar</button><button class="btn" style="flex:1" data-act="ssave">Salvar alterações</button></div>`);
}
on('sedit', (b, v) => sessModal(v));
on('ssave', async () => {
  const h = DB.workoutHistory.find(x => x.id === S.sid), r = readSheet(h.exercises.map(e => ({ id: e.exerciseId, n: e.exerciseName })));
  if (!r.n) { toast('Marque ao menos uma série ou exclua a sessão'); return; }
  if (r.bad) { toast(r.bad); return; }
  if (!await WorkoutActions.saveSession(S.sid, r.exs, $('#so').value.trim())) return;
  closeModal(); toast('Sessão atualizada');
});
on('sdel', (b, v) => confirmM('Excluir sessão?', 'Este registro de treino será removido. Os gráficos e a carga anterior serão recalculados.', 'sdelok', v));
on('sdelok', async (b, v) => { if (!await WorkoutActions.deleteSession(v)) return; closeModal(); toast('Sessão excluída'); });
on('sall', () => { S.sessAll = !S.sessAll; render(); });
on('whist', (b, v) => { S.sf = v; S.sessAll = false; render(); const e = document.getElementById('sessoes'); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
on('wclear', () => { S.sf = null; render(); });
onChange('ex', (el, v) => { S.ex = v; render(); });
