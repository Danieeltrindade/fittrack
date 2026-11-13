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
<section class="panel"><div class="sec"><h2>Histórico do exercício</h2><div class="chips"><select style="max-width:260px" data-chg="ex" aria-label="Exercício">${exNames().map(n => `<option ${n === S.ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${S.ex ? `<button class="btn s sm" data-act="exedit">${ic('edit')}Editar exercício</button>` : ''}</div></div>
${ds.map(d => { const L = hs.filter(h => h.data === d).sort((a, b) => a.serie - b.serie), o = S.sess.find(s => s.data === d && s.exObs && s.exObs[S.ex]); return `<div class="li" style="align-items:flex-start"><div style="flex:none"><p>${dlong(pd(d))}</p>${o ? `<small>“${esc(o.exObs[S.ex])}”</small>` : ''}</div><div style="flex:1;min-width:0;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px 14px;font-size:14px">${L.map(h => `<span style="white-space:nowrap">${fx(h.carga)} kg × ${h.reps}</span>`).join('')}</div></div>`; }).join('') || '<div class="empty">Nenhum registro para este exercício.</div>'}</section>${sessCard()}</div>`;
}

/* ---------- editor de treino (nome, dias, exercícios + séries) ---------- */
function edModal() {
  const d = S.ed;
  modal(`${mTitle(d.id ? 'Editar treino' : 'Novo treino', 14)}<label for="en">Nome do treino</label><input id="en" value="${esc(d.nome)}" placeholder="Ex.: Treino E · Full body"><label style="margin-top:12px">Dias da semana</label><div class="chips">${DIAS.map((x, i) => `<button class="chip ${d.dias.includes(i) ? 'on' : ''}" data-act="day" data-v="${i}">${x}</button>`).join('')}</div>
<datalist id="mgs">${MUSCLE_GROUPS.map(g => `<option value="${g}">`).join('')}</datalist>
${d.ex.map((x, i) => `<div class="exr" data-id="${x.id || ''}"><div class="xr"><div><label>Exercício</label><input name="n" maxlength="120" value="${esc(x.n)}" placeholder="Nome do exercício"></div><div><label>Séries</label><input name="s" type="number" inputmode="numeric" min="1" value="${x.s}"></div><button class="ib" data-act="delex" data-v="${i}" aria-label="Remover exercício">${ic('trash')}</button></div><details class="exd" ${x.d || x.g ? 'open' : ''}><summary>Grupo muscular e descrição</summary><div class="f" style="margin:8px 0 0"><div><label>Grupo muscular</label><input name="g" list="mgs" maxlength="60" value="${esc(x.g || '')}" placeholder="Ex.: Peito"></div><div class="w"><label>Descrição</label><textarea name="d" rows="2" maxlength="500" placeholder="Dicas de execução, observações…">${esc(x.d || '')}</textarea></div></div></details></div>`).join('')}
<button class="btn s sm" style="margin-top:14px" data-act="addex">${ic('plus')}Adicionar exercício</button>${foot('saveT', 'Salvar treino')}`);
}
function readEd() {
  const m = $('#sheet'); S.ed.nome = m.querySelector('#en').value;
  S.ed.ex = [...m.querySelectorAll('.exr')].map(r => ({ id: r.dataset.id || '', n: r.querySelector('[name=n]').value, s: Math.max(1, parseInt(r.querySelector('[name=s]').value) || 1), g: r.querySelector('[name=g]').value.trim(), d: r.querySelector('[name=d]').value.trim() }));
}
on('new', () => { S.ed = { id: 0, nome: '', dias: [], ex: [{ id: '', n: '', s: 3 }] }; edModal(); });
on('edit', (b, v) => { S.ed = JSON.parse(JSON.stringify(S.treinos.find(t => t.id === v))); S.ed.ex = S.ed.ex.map(x => ({ id: x.id, n: x.n, s: x.s, g: x.g || '', d: x.d || '' })); edModal(); });
on('day', (b, v) => { readEd(); const d = S.ed.dias, i = d.indexOf(+v); i < 0 ? d.push(+v) : d.splice(i, 1); edModal(); });
on('addex', () => { readEd(); S.ed.ex.push({ id: '', n: '', s: 3 }); edModal(); });
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
const libEx = name => { const e = DB.workouts.flatMap(w => w.exercises).find(x => x.name === name); return e ? e.id : ''; };   // vínculo com o exercício cadastrado (se houver)
const setRows = (x, pv) => [...Array(x.s)].map((_, j) => setRow(j, pv[j] || pv[pv.length - 1])).join('');
// Bloco de um exercício na sessão. o = { from: nome original (trocado), add: true (adicionado na hora) }
function exBlock(x, i, pv, o) {
  o = o || {};
  return `<div class="eb" data-i="${i}"><div class="row"><div style="min-width:0"><b>${esc(x.n)}</b>${o.from ? ` <span class="tag">trocado de ${esc(o.from)}</span>` : ''}${o.add ? ' <span class="tag">adicionado</span>' : ''}<span class="tag mute skt" hidden>pulado</span></div><button class="ib" data-act="exmenu" aria-label="Opções de ${esc(x.n)}" aria-expanded="false">${ic('dots')}</button></div>
<div class="exm" hidden><button class="chip" data-act="exskip">Pular este exercício</button><button class="chip" data-act="exswap">${ic('swap')}Trocar por outro</button><button class="chip" data-act="exrm">Remover da sessão</button></div>
<div class="exbody">${setHead('Anterior')}${setRows(x, pv)}<div class="setbar"><button class="chip" data-act="addset" data-v="${i}">+ Série</button><button class="chip" data-act="rmset" data-v="${i}">− Série</button></div><input data-k="o" placeholder="Observação do exercício (opcional)" style="margin-top:10px" aria-label="Observação de ${esc(x.n)}"></div></div>`;
}
function regModal(t) {
  S.reg = t; S.regPrev = t.ex.map(x => lastSets(x.n, S.regDate));
  modal(`${mTitle(esc(t.nome))}<p class="sub">Sessão de <b style="color:var(--ink)">${pd(S.regDate).toLocaleDateString('pt-BR')}</b>. Registre o que você realmente fez em cada série. A coluna “Anterior” é só uma referência.</p><p class="hint">Pular, trocar ou adicionar exercícios vale só para esta sessão: o treino cadastrado não muda.</p><div id="exlist">${t.ex.map((x, i) => exBlock(x, i, S.regPrev[i])).join('')}</div><div id="expick"></div><button class="btn s sm" style="margin-top:14px" data-act="exadd">${ic('plus')}Adicionar exercício</button><label for="so" style="margin-top:16px">Observação da sessão (opcional)</label><input id="so" placeholder="Ex.: Última série muito pesada">${foot('fin', 'Finalizar treino')}`);
}
/* ---- ajustes durante a sessão (sem redesenhar o modal: o que já foi digitado é preservado) ---- */
const sessNames = () => [...$('#sheet').querySelectorAll('.eb b')].map(b => b.textContent);
function pickList() {
  const q = (S.pickq || '').toLowerCase(), have = sessNames(), L = exNames().filter(n => !have.includes(n) && n.toLowerCase().includes(q));
  return L.length ? L.map(n => `<button class="swo" data-act="expick" data-v="${esc(n)}"><span>${esc(n)}</span><small>${S.pick.mode === 'swap' ? 'trocar' : 'adicionar'}</small></button>`).join('') : '<p class="sub">Nenhum exercício encontrado. Crie um novo abaixo.</p>';
}
function openPicker(mode, i) {
  S.pick = { mode, i }; S.pickq = '';
  $('#expick').innerHTML = `<div class="pickbox"><div class="row"><b>${mode === 'swap' ? 'Trocar por qual exercício?' : 'Adicionar qual exercício?'}</b><button class="ib" data-act="pickx" aria-label="Fechar">✕</button></div><input id="pq" data-inp="pq" placeholder="Buscar exercício" aria-label="Buscar exercício" style="margin-top:10px"><div class="pklist" id="pklist">${pickList()}</div><div class="row" style="margin-top:10px;gap:8px"><input id="pnew" maxlength="120" placeholder="Não achou? Nome do novo exercício" aria-label="Nome do novo exercício"><button class="btn sm" data-act="excreate">Criar</button></div></div>`;
  $('#expick').scrollIntoView && $('#expick').scrollIntoView({ block: 'nearest' });
}
onInput('pq', (el, v) => { S.pickq = v; const l = $('#pklist'); if (l) l.innerHTML = pickList(); });
on('exmenu', b => { const m = b.closest('.eb').querySelector('.exm'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); });
on('exskip', b => {
  const bl = b.closest('.eb'), sk = bl.toggleAttribute('data-skip');
  bl.querySelector('.skt').hidden = !sk; b.textContent = sk ? 'Voltar a fazer' : 'Pular este exercício';
  bl.querySelector('.exm').hidden = true; bl.querySelector('[data-act=exmenu]').setAttribute('aria-expanded', 'false');
});
on('exrm', b => { b.closest('.eb').remove(); });
on('exswap', b => openPicker('swap', +b.closest('.eb').dataset.i));
on('exadd', () => openPicker('add'));
on('pickx', () => { $('#expick').innerHTML = ''; });
function applyPick(name) {
  name = name.trim(); if (!name) return;
  const pk = S.pick, x = { id: libEx(name), n: name, s: 3 }, pv = lastSets(name, S.regDate);
  if (pk.mode === 'swap') {
    const bl = $('#sheet').querySelector(`.eb[data-i="${pk.i}"]`); if (!bl) return;
    x.s = Math.max(1, bl.querySelectorAll('.sr:not(.hd)').length); const from = S.reg.ex[pk.i].n;
    S.reg.ex[pk.i] = x; S.regPrev[pk.i] = pv; bl.outerHTML = exBlock(x, pk.i, pv, { from });
  } else {
    const i = S.reg.ex.length; S.reg.ex.push(x); S.regPrev[i] = pv; $('#exlist').insertAdjacentHTML('beforeend', exBlock(x, i, pv, { add: true }));
  }
  $('#expick').innerHTML = '';
}
on('expick', (b, v) => applyPick(v));
on('excreate', () => {
  const n = ($('#pnew').value || '').trim(); if (!n) { toast('Digite o nome do exercício'); $('#pnew').focus(); return; }
  if (sessNames().includes(n)) { toast('Este exercício já está na sessão'); return; }
  applyPick(n); toast('Exercício adicionado');
});
on('addset', (b, v) => {
  const bl = b.closest('.eb'), n = bl.querySelectorAll('.sr:not(.hd)').length, pv = S.regPrev[+v] || [];
  bl.querySelector('.setbar').insertAdjacentHTML('beforebegin', setRow(n, pv[n] || pv[pv.length - 1]));
});
on('rmset', b => { const rows = b.closest('.eb').querySelectorAll('.sr:not(.hd)'); if (rows.length > 1) rows[rows.length - 1].remove(); });
on('set', b => { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); });

// Lê a planilha aberta no modal. Nenhuma faixa de carga/reps é imposta; só exige reps em série marcada como concluída.
function readSheet(list) {
  const exs = []; let n = 0, bad = null;
  $('#sheet').querySelectorAll('.eb:not([data-skip])').forEach(bl => {
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
  const obs = $('#so').value.trim(), notes = [t.free && t.tag ? 'Com ' + t.tag : '', obs].filter(Boolean).join(' · ');
  if (!await WorkoutActions.addSession({ id: uid(), date: S.regDate, workoutId: t.free ? null : t.id, workoutName: t.nome, exercises: r.exs, notes })) return;
  closeModal();
  if (t.free) { S.freeDone = { nome: t.nome, ex: r.exs.map(e => ({ n: e.exerciseName, s: e.sets.length })) }; modal(`${mTitle('Treino concluído')}<p class="sub">“${esc(t.nome)}” foi registrado e conta como treino feito. As cargas entram nos gráficos de cada exercício.</p><div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Fechar</button><button class="btn" style="flex:1" data-act="fwsave">Guardar como treino</button></div>`); }
  else toast('Treino registrado');
});

/* ---------- trocar o treino de hoje ---------- */
const DIAL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function swapStatus(t) {
  const dow = new Date().getDay(), ws = weekStartISO(), h = DB.workoutHistory.filter(x => x.workoutId === t.id && x.date >= ws).sort((a, b) => a.date < b.date ? -1 : 1).pop();
  if (h) return ['Feito ' + DIAL[pd(h.date).getDay()], ''];
  if (t.dias.includes(dow)) return ['Planejado para hoje', 'ac'];
  const pos = d => (d + 6) % 7, over = t.dias.some(d => pos(d) < pos(dow));
  return [over ? 'Ainda não feito esta semana' : t.dias.length ? 'Planejado: ' + t.dias.slice().sort((a, b) => pos(a) - pos(b)).map(d => DIAL[d]).join(', ') : 'Sem dia definido', over ? 'wn' : ''];
}
on('swapday', () => {
  if (!S.treinos.length) { toast('Crie um treino em Treinos ou monte um treino livre.'); return; }
  const tt = todayT(); S.swp = tt ? tt.t.id : S.treinos[0].id;
  modal(`${mTitle('Qual treino hoje?', 4)}<p class="sub" style="margin-bottom:12px">Escolha qualquer um dos seus treinos. O que estava marcado para hoje continua na lista.</p><div id="swl">${S.treinos.map(t => { const st = swapStatus(t); return `<button class="swo" data-act="swpick" data-v="${t.id}" aria-pressed="${t.id === S.swp}"><span class="rad"></span><span style="flex:1;min-width:0"><b>${esc(wt(t.nome))}</b><small>${wsum(t)}</small></span><span class="tag mute ${st[1]}">${st[0]}</span></button>`; }).join('')}</div><button class="btn w" style="margin-top:16px" data-act="swgo" id="swgo"></button><button class="btn s w" style="margin-top:10px" data-act="freenew">Montar um treino livre</button>`);
  swLabel();
});
const swLabel = () => { const t = S.treinos.find(x => x.id === S.swp), b = $('#swgo'); if (b && t) b.textContent = 'Usar ' + wt(t.nome) + ' hoje'; };
on('swpick', (b, v) => { S.swp = v; $('#sheet').querySelectorAll('#swl .swo').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === v))); swLabel(); });
on('swgo', () => { const t = S.treinos.find(x => x.id === S.swp); if (!t) return; closeModal(); S.regDate = iso(new Date()); regModal(t); });

/* ---------- treino livre: montado na hora, com exercícios da biblioteca ou novos ---------- */
function readFw() { const n = $('#fwn'), g = $('#fwt'); if (n) S.fw.nome = n.value; if (g) S.fw.tag = g.value; }
function fwList() {
  const q = (S.fw.q || '').toLowerCase(), have = S.fw.ex.map(x => x.n), L = exNames().filter(n => !have.includes(n) && n.toLowerCase().includes(q));
  return L.length ? L.map(n => `<button class="swo" data-act="fwadd" data-v="${esc(n)}"><span>${esc(n)}</span><small>adicionar</small></button>`).join('') : '<p class="sub">Nenhum exercício encontrado. Crie um novo abaixo.</p>';
}
function freeModal() {
  const f = S.fw;
  modal(`${mTitle('Treino livre', 4)}<p class="sub" style="margin-bottom:12px">Monte o treino na hora. Cargas e repetições você registra na próxima tela.</p><label for="fwn">Nome do treino</label><input id="fwn" maxlength="120" value="${esc(f.nome)}"><label for="fwt" style="margin-top:12px">Com quem? (opcional)</label><input id="fwt" maxlength="60" value="${esc(f.tag)}" placeholder="Ex.: João">
<div style="margin-top:14px">${f.ex.length ? f.ex.map((x, i) => `<div class="li"><b style="min-width:0">${esc(x.n)}</b><div class="row" style="gap:6px;flex:none"><button class="chip" data-act="fwdn" data-v="${i}" aria-label="Menos uma série de ${esc(x.n)}">−</button><b aria-label="${x.s} séries" style="min-width:42px;text-align:center">${x.s} sér.</b><button class="chip" data-act="fwup" data-v="${i}" aria-label="Mais uma série de ${esc(x.n)}">+</button><button class="ib" data-act="fwrm" data-v="${i}" aria-label="Remover ${esc(x.n)}">${ic('trash')}</button></div></div>`).join('') : '<p class="hint">Nenhum exercício ainda. Adicione os que vocês vão fazer hoje.</p>'}</div>
${f.lib ? `<div class="pickbox"><input id="fwq" data-inp="fwq" placeholder="Buscar exercício" aria-label="Buscar exercício" value="${esc(f.q || '')}"><div class="pklist" id="fwlist">${fwList()}</div><div class="row" style="margin-top:10px;gap:8px"><input id="fwnew" maxlength="120" placeholder="Não achou? Nome do novo exercício" aria-label="Nome do novo exercício"><button class="btn sm" data-act="fwcreate">Criar</button></div></div>` : `<button class="btn s sm" style="margin-top:12px" data-act="fwlib">${ic('plus')}Adicionar exercício</button>`}
<div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Cancelar</button><button class="btn" style="flex:1" data-act="fwgo">${ic('play')}Iniciar treino</button></div>`);
}
on('freenew', () => { S.fw = { nome: 'Treino livre', tag: '', ex: [], lib: false, q: '' }; freeModal(); });
on('fwlib', () => { readFw(); S.fw.lib = true; S.fw.q = ''; freeModal(); const q = $('#fwq'); if (q) q.focus(); });
onInput('fwq', (el, v) => { S.fw.q = v; const l = $('#fwlist'); if (l) l.innerHTML = fwList(); });
function fwAdd(n) { n = n.trim(); if (!n) return; readFw(); if (!S.fw.ex.some(x => x.n === n)) S.fw.ex.push({ id: libEx(n), n, s: 3 }); S.fw.lib = false; S.fw.q = ''; freeModal(); }
on('fwadd', (b, v) => fwAdd(v));
on('fwcreate', () => { const n = ($('#fwnew').value || '').trim(); if (!n) { toast('Digite o nome do exercício'); $('#fwnew').focus(); return; } fwAdd(n); toast('Exercício adicionado'); });
on('fwrm', (b, v) => { readFw(); S.fw.ex.splice(+v, 1); freeModal(); });
on('fwup', (b, v) => { readFw(); const x = S.fw.ex[+v]; x.s = Math.min(10, x.s + 1); freeModal(); });
on('fwdn', (b, v) => { readFw(); const x = S.fw.ex[+v]; x.s = Math.max(1, x.s - 1); freeModal(); });
on('fwgo', () => {
  readFw(); const f = S.fw, nome = f.nome.trim() || 'Treino livre';
  if (!f.ex.length) { toast('Adicione ao menos um exercício'); return; }
  closeModal(); S.regDate = iso(new Date()); regModal({ id: null, nome, tag: f.tag.trim(), free: true, ex: f.ex.map(x => ({ id: x.id, n: x.n, s: x.s })) });
});
on('fwsave', async () => {
  const f = S.freeDone; if (!f) return;
  if (!await WorkoutActions.save({ id: 0, nome: f.nome, dias: [], ex: f.ex.map(e => ({ id: '', n: e.n, s: Math.max(1, e.s) })) })) return;
  closeModal(); toast('Treino guardado em Treinos');
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

/* ---------- editar um exercício (nome, descrição, grupo muscular, excluir) — vale para todos os treinos que o contêm ---------- */
const MUSCLE_GROUPS = ['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Antebraço', 'Quadríceps', 'Posterior de coxa', 'Glúteos', 'Panturrilha', 'Abdômen', 'Lombar', 'Corpo inteiro'];
const exInfo = name => { const L = DB.workouts.flatMap(w => w.exercises.filter(e => e.name === name).map(e => ({ w, e }))); return { L, e: (L[0] || {}).e || {}, n: L.length }; };
on('exedit', () => {
  const name = S.ex, x = exInfo(name); if (!x.n) { toast('Exercício não encontrado nos treinos'); return; }
  S.exo = name;
  modal(`${mTitle('Editar exercício', 6)}<p class="sub" style="margin-bottom:14px">Presente em ${x.n} treino${x.n === 1 ? '' : 's'}. Ao corrigir o nome, <b style="color:var(--ink)">o histórico de cargas e repetições é mantido</b> e passa a aparecer com o nome novo.</p>
<datalist id="mgs">${MUSCLE_GROUPS.map(g => `<option value="${g}">`).join('')}</datalist>
<div class="f"><div class="w"><label for="xen">Nome</label><input id="xen" maxlength="120" value="${esc(name)}"></div><div class="w"><label for="xeg">Grupo muscular</label><input id="xeg" list="mgs" maxlength="60" value="${esc(x.e.muscleGroup || '')}" placeholder="Ex.: Peito"></div><div class="w"><label for="xed">Descrição</label><textarea id="xed" rows="3" maxlength="500" placeholder="Dicas de execução, observações…">${esc(x.e.description || '')}</textarea></div></div>
<div class="row" style="margin-top:20px;gap:10px"><button class="btn d" data-act="exdel">${ic('trash')}Excluir</button><button class="btn s" style="flex:1" data-act="close">Cancelar</button><button class="btn" style="flex:1" data-act="exsave">Salvar</button></div>`);
});
on('exsave', async () => {
  const n = $('#xen').value.trim(); if (!n) { toast('Informe o nome do exercício'); return; }
  const old = S.exo;
  if (n !== old && exNames().includes(n) && !confirm_dup(n)) return;
  if (!await WorkoutActions.editExercise(old, { name: n, muscleGroup: $('#xeg').value.trim(), description: $('#xed').value.trim() })) return;
  S.ex = n; closeModal(); toast(n === old ? 'Exercício atualizado' : 'Exercício renomeado — histórico preservado');
});
const confirm_dup = n => { toast(`Já existe um exercício chamado “${n}”. Escolha outro nome.`); return false; };
on('exdel', () => confirmM('Excluir exercício?', `“${esc(S.exo)}” sai de todos os treinos. O histórico de cargas e repetições já registrado é mantido.`, 'exdelok'));
on('exdelok', async () => { if (!await WorkoutActions.deleteExercise(S.exo)) return; closeModal(); toast('Exercício excluído dos treinos'); });
