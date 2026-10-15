/* views/diet.js — Dieta: refeições por data, adicionar da biblioteca (macros proporcionais) ou manualmente, biblioteca "Meus alimentos". */
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const UNITS = ['g', 'ml', 'unid.'];
const sortedLib = q => S.lib.filter(f => !q || norm(f.n).includes(norm(q))).sort((a, b) => a.n.localeCompare(b.n, 'pt-BR'));
const macroLine = f => `${fmt(f.k)} kcal · P ${fx(f.p)} · C ${fx(f.c)} · G ${fx(f.g)}`;

/* ---------- biblioteca "Meus alimentos" (painel) ---------- */
function libList() {
  const L = sortedLib(S.libq);
  if (!S.lib.length) return '<div class="empty">Nenhum alimento cadastrado. Toque em “Novo alimento” e informe os dados da embalagem.</div>';
  if (!L.length) return '<div class="empty">Nenhum alimento encontrado para essa busca.</div>';
  return L.map(a => `<div class="li"><div><p>${esc(a.n)}</p><small>${fx(a.portion)} ${esc(a.unit)} · ${macroLine(a)}</small></div>${rowBtns('libedit', 'libdel', a.id, 'Editar ' + esc(a.n), 'Excluir ' + esc(a.n))}</div>`).join('');
}
const libPanel = () => `<section class="panel lib"><div class="sec"><h2>Meus alimentos</h2><button class="btn sm" data-act="libnew">${ic('plus')}Novo alimento</button></div><input class="search" id="libq" type="search" data-inp="libq" placeholder="Buscar alimento…" value="${esc(S.libq)}" aria-label="Buscar alimento"><div id="liblist">${libList()}</div></section>`;
onInput('libq', (el, v) => { S.libq = v; $('#liblist').innerHTML = libList(); });

/* ---------- tela ---------- */
function vDieta() {
  const T = tot(), G = goals(), tdy = S.date === iso(new Date()), hr = new Date().getHours();
  return `<div class="pg">${hdr('Dieta', (tdy ? 'Hoje, ' : '') + dlong(pd(S.date)), `<div class="hact"><button class="btn" data-act="meal" data-v="${hr < 10 ? 'cafe' : hr < 15 ? 'almoco' : hr < 18 ? 'lanche' : 'jantar'}">${ic('plus')}Adicionar alimento</button></div>`)}
${dateBar('date')}
${strip(T, G)}
<div class="cols"><section class="panel" style="padding-block:14px">${MEALS.map(([k, nm]) => {
    const L = S.meals.filter(m => m.t === k), o = S.open[k];
    return `<div class="meal"><div class="sh ${o ? '' : 'cl'}"><button data-act="tog" data-v="${k}" aria-expanded="${!!o}">${ic('chev')}<b>${nm}</b><span>${fmt(sum(L, 'k'))} kcal · ${fx(sum(L, 'p'))} g prot.</span></button><button class="ib" aria-label="Adicionar em ${nm}" data-act="meal" data-v="${k}">${ic('plus')}</button></div>
${o ? `<div style="margin:4px 0 10px">${L.map(m => `<div class="li"><div><p>${esc(m.n)}</p><small>${esc(m.q)} · ${fmt(m.k)} kcal · P ${fx(m.p)} · C ${fx(m.c)} · G ${fx(m.g)}</small></div>${rowBtns('editf', 'rm', m.id, 'Editar ' + esc(m.n), 'Remover ' + esc(m.n))}</div>`).join('') || '<div class="empty">Nada registrado. Toque em + para adicionar.</div>'}</div>` : ''}</div>`;
  }).join('')}</section>${libPanel()}</div></div>`;
}
on('tog', (b, v) => { S.open[v] = !S.open[v]; render(); });
on('rm', async (b, v) => { if (await DietActions.removeFood(v)) toast('Alimento removido'); });

/* ---------- adicionar / editar alimento na refeição ---------- */
const mealSelect = t => `<div class="f"><div class="w"><label for="mt">Refeição</label><select id="mt">${MEALS.map(([k, n]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>`;
const modeTabs = m => `<div class="seg full" role="radiogroup" aria-label="Como adicionar" style="margin-bottom:14px">${[['lib', 'Da biblioteca'], ['man', 'Manual']].map(([k, n]) => `<button type="button" role="radio" aria-checked="${k === m}" data-act="mmode" data-v="${k}">${n}</button>`).join('')}</div>`;

function mealModal(type, entry) {
  const mode = entry ? 'man' : (S.mm && S.mm.mode) || (S.lib.length ? 'lib' : 'man');
  S.mm = { mode, editId: entry ? entry.id : null };
  const body = mode === 'lib' ? libForm() : manForm(entry);
  modal(`${mTitle(entry ? 'Editar alimento' : 'Adicionar alimento', 14)}${entry ? '' : modeTabs(mode)}${mealSelect(type)}${body}`);
  if (mode === 'lib' && S.lib.length) updateLibPreview();
}
function libForm() {
  if (!S.lib.length) return `<div class="empty">Sua biblioteca está vazia. Cadastre um alimento com as informações da embalagem para calcular os macros automaticamente.</div><button class="btn w" style="margin-top:14px" data-act="libnew" data-v="back">${ic('plus')}Cadastrar alimento</button>`;
  return `<div class="f"><div class="w"><label for="lq">Buscar na biblioteca</label><input id="lq" type="search" data-inp="lfq" placeholder="Digite para filtrar" autocomplete="off"></div>
<div class="w"><label for="lf">Alimento</label><select id="lf" data-chg="lfsel">${libOptions('')}</select></div>
<div class="w"><label for="la" id="lal">Quantidade consumida</label><input id="la" type="number" inputmode="decimal" step="any" min="0" data-inp="lamt" placeholder="Ex.: 30"></div></div>
<div class="prev" id="lprev" aria-live="polite"></div>${foot('saveL', 'Adicionar')}`;
}
const libOptions = q => { const L = sortedLib(q); return L.length ? L.map(a => `<option value="${a.id}">${esc(a.n)} (${fx(a.portion)} ${esc(a.unit)})</option>`).join('') : '<option value="">Nenhum alimento encontrado</option>'; };
const pickedFood = () => { const s = $('#lf'); return s && DB.foods.find(f => f.id === s.value); };
// Mostra os valores da porção cadastrada e, com quantidade informada, os valores proporcionais calculados.
function updateLibPreview() {
  const f = pickedFood(), box = $('#lprev'), lab = $('#lal'); if (!box) return;
  if (!f) { box.innerHTML = 'Selecione um alimento.'; if (lab) lab.textContent = 'Quantidade consumida'; return; }
  lab.textContent = `Quantidade consumida (${f.unit})`;
  const amt = parseFloat($('#la').value), base = `Porção cadastrada: <b>${fx(f.portion)} ${esc(f.unit)}</b> — ${fmt(f.calories)} kcal · P ${fx(f.protein)} · C ${fx(f.carbs || 0)} · G ${fx(f.fat || 0)}`;
  if (!(amt > 0)) { box.innerHTML = `${base}<div class="mut" style="margin-top:8px">Informe a quantidade para ver os valores calculados.</div>`; return; }
  const v = DietActions.calc(f, amt);
  box.innerHTML = `${base}<div style="margin-top:10px">Para <b>${fx(amt)} ${esc(f.unit)}</b>:</div><div class="pv"><div><b>${fx(v.calories)}</b><span>kcal</span></div><div><b>${fx(v.protein)} g</b><span>proteína</span></div><div><b>${fx(v.carbs)} g</b><span>carboidratos</span></div><div><b>${fx(v.fat)} g</b><span>gorduras</span></div></div>`;
}
function manForm(f) {
  return `<div class="f"><div class="w"><label for="mn">Alimento</label><input id="mn" value="${f ? esc(f.n) : ''}" placeholder="Ex.: Iogurte natural"></div><div class="w"><label for="mq">Quantidade</label><input id="mq" value="${f ? esc(f.q) : ''}" placeholder="Ex.: 170 g"></div><div><label for="mk">Calorias (kcal)</label><input id="mk" type="number" inputmode="decimal" step="any" value="${f ? f.k : ''}"></div><div><label for="mp">Proteína (g)</label><input id="mp" type="number" inputmode="decimal" step="any" value="${f ? f.p : ''}"></div><div><label for="mb">Carboidratos (g)</label><input id="mb" type="number" inputmode="decimal" step="any" value="${f ? f.c : ''}"></div><div><label for="mg">Gorduras (g)</label><input id="mg" type="number" inputmode="decimal" step="any" value="${f ? f.g : ''}"></div></div><label style="display:flex;gap:8px;align-items:center;margin:0;color:var(--ink)"><input type="checkbox" id="ms" style="width:20px;height:20px;accent-color:var(--accent)"> Salvar em Meus alimentos</label>${foot('saveM', f ? 'Salvar' : 'Adicionar')}`;
}
on('meal', (b, v) => { S.mm = null; mealModal(v); });
on('editf', (b, v) => { const f = S.meals.find(m => m.id === v); mealModal(f.t, f); });
on('mmode', (b, v) => { const t = ($('#mt') || {}).value || 'almoco'; S.mm = { mode: v }; mealModal(t); });
onInput('lfq', (el, v) => { $('#lf').innerHTML = libOptions(v); updateLibPreview(); });
onChange('lfsel', () => updateLibPreview());
onInput('lamt', () => updateLibPreview());
on('saveL', async () => {
  const f = pickedFood(), amt = parseFloat($('#la').value), t = $('#mt').value;
  if (!f) { toast('Escolha um alimento da biblioteca'); return; }
  if (!(amt > 0)) { toast('Informe a quantidade consumida'); return; }
  // salva uma CÓPIA dos valores calculados: editar o alimento depois não altera refeições antigas
  S.open[t] = true;   // antes de salvar, pois salvar redesenha a tela
  if (!await DietActions.saveFood(S.date, t, { name: f.name, quantity: `${fx(amt)} ${f.unit}`, foodId: f.id, ...DietActions.calc(f, amt) }, null, false)) return;
  closeModal(); toast('Alimento adicionado');
});
on('saveM', async () => {
  const n = $('#mn').value.trim(), t = $('#mt').value;
  if (!n) { toast('Informe o alimento'); return; }
  const num = id => parseFloat($(id).value) || 0, editing = !!(S.mm && S.mm.editId);
  S.open[t] = true;
  if (!await DietActions.saveFood(S.date, t, { name: n, quantity: $('#mq').value.trim() || '1 porção', calories: num('#mk'), protein: num('#mp'), carbs: num('#mb'), fat: num('#mg') }, editing ? S.mm.editId : null, $('#ms').checked)) return;
  closeModal(); toast(editing ? 'Alimento atualizado' : 'Alimento adicionado');
});

/* ---------- cadastro na biblioteca (criar / editar / excluir) ---------- */
function libModal(f) {
  S.lid = f ? f.id : null;
  const units = UNITS.includes(f && f.unit) || !f ? UNITS : [...UNITS, f.unit], v = k => f ? f[k] : '';
  modal(`${mTitle(f ? 'Editar alimento' : 'Novo alimento', 6)}<p class="sub" style="margin-bottom:14px">Informe os valores da embalagem para a porção indicada. Editar não altera refeições já registradas.</p>
<div class="f"><div class="w"><label for="ln">Nome</label><input id="ln" value="${f ? esc(f.n) : ''}" placeholder="Ex.: Whey Dark Lab"></div>
<div><label for="lp">Porção</label><input id="lp" type="number" inputmode="decimal" step="any" min="0" value="${f ? f.portion : ''}" placeholder="Ex.: 50"></div>
<div><label for="lu">Unidade</label><select id="lu">${units.map(u => `<option ${f && f.unit === u || (!f && u === 'g') ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
<div><label for="lk">Calorias (kcal)</label><input id="lk" type="number" inputmode="decimal" step="any" min="0" value="${v('k')}"></div>
<div><label for="lpr">Proteínas (g)</label><input id="lpr" type="number" inputmode="decimal" step="any" min="0" value="${v('p')}"></div>
<div><label for="lc">Carboidratos (g)</label><input id="lc" type="number" inputmode="decimal" step="any" min="0" value="${v('c')}"></div>
<div><label for="lg">Gorduras (g)</label><input id="lg" type="number" inputmode="decimal" step="any" min="0" value="${v('g')}"></div></div>${foot('libsave', 'Salvar alimento')}`);
}
on('libnew', (b, v) => { S.libBack = v === 'back' ? (($('#mt') || {}).value || null) : null; libModal(); });
on('libedit', (b, v) => libModal(S.lib.find(f => f.id === v)));
on('libsave', async () => {
  const name = $('#ln').value.trim(), portion = parseFloat($('#lp').value), n = id => { const t = $(id).value.trim(); return t === '' ? 0 : parseFloat(t); };
  const item = { name, portion, unit: $('#lu').value, calories: n('#lk'), protein: n('#lpr'), carbs: n('#lc'), fat: n('#lg') };
  if (!name) { toast('Informe o nome do alimento'); return; }
  if (!(portion > 0)) { toast('Informe a porção (maior que zero)'); return; }
  if ([item.calories, item.protein, item.carbs, item.fat].some(x => !isFinite(x) || x < 0)) { toast('Os valores nutricionais não podem ser negativos'); return; }
  const back = S.libBack, lid = S.lid;
  if (!await DietActions.saveLibFood(item, lid)) return;
  S.libBack = null; closeModal(); toast(lid ? 'Alimento atualizado' : 'Alimento cadastrado');
  if (back) { S.mm = { mode: 'lib' }; mealModal(back); }
});
on('libdel', (b, v) => confirmM('Excluir alimento?', `“${esc(S.lib.find(f => f.id === v).n)}” sai da biblioteca. Refeições já registradas não são alteradas.`, 'libdelok', v));
on('libdelok', async (b, v) => { if (!await DietActions.removeLibFood(v)) return; closeModal(); toast('Alimento excluído'); });
