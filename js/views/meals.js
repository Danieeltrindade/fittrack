/* views/meals.js — aba "Refeições salvas" da Dieta: modelos de refeição completos (nome, foto, itens, totais). */
const catName = k => (MEAL_CATS.find(c => c[0] === k) || [0, 'Outras'])[1];
const smList = () => (S.saved || []).slice().sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, 'pt-BR'));
const totLine = T => `${fmt(T.k)} kcal · P ${fx(T.p)} · C ${fx(T.c)} · G ${fx(T.g)}`;

function smealsPanel() {
  const L = smList().filter(m => !S.smq || norm(m.name).includes(norm(S.smq)));
  const rows = L.map(m => { const T = savedTotals(m);
    return `<div class="smc ${m.favorite ? 'fav' : ''}"><div class="smh">${m.photo ? `<button class="phb" data-act="phview" data-v="${esc(m.photo)}" aria-label="Ver foto de ${esc(m.name)}">${Photos.img(m.photo, 'th', '')}</button>` : `<i class="nic k-cal">${ic('meals')}</i>`}
<div class="smt"><p><b>${esc(m.name)}</b> <span class="tag mute">${esc(catName(m.category))}</span></p><small>${m.items.length} alimento${m.items.length === 1 ? '' : 's'} · ${totLine(T)}</small></div>
<button class="ib ${m.favorite ? 'on' : ''}" aria-label="${m.favorite ? 'Tirar dos favoritos' : 'Favoritar'} ${esc(m.name)}" aria-pressed="${!!m.favorite}" data-act="smfav" data-v="${m.id}">${ic('star')}</button></div>
<div class="sml">${m.items.map(i => `${esc(i.name)} <span class="mut">${fx(i.amount)} ${esc(i.unit)}</span>`).join(' · ') || '<span class="mut">Sem alimentos</span>'}</div>
<div class="chips"><button class="btn sm" data-act="smadd" data-v="${m.id}">${ic('plus')}Adicionar ao diário</button><button class="btn s sm" data-act="smadj" data-v="${m.id}">Ajustar quantidades…</button><button class="ib" aria-label="Duplicar ${esc(m.name)}" data-act="smdup" data-v="${m.id}">${ic('copy')}</button><button class="ib" aria-label="Editar ${esc(m.name)}" data-act="smedit" data-v="${m.id}">${ic('edit')}</button><button class="ib" aria-label="Excluir ${esc(m.name)}" data-act="smdel" data-v="${m.id}">${ic('trash')}</button></div></div>`; }).join('');
  return `<section class="panel"><div class="sec"><div><h2>Refeições salvas</h2><p class="sub" style="margin:2px 0 0">Monte refeições completas com seus alimentos e adicione ao diário com um toque.</p></div><button class="btn sm" data-act="smnew">${ic('plus')}Nova refeição</button></div>
${S.saved && S.saved.length ? `<input class="search" type="search" data-inp="smq" placeholder="Buscar refeição…" value="${esc(S.smq || '')}" aria-label="Buscar refeição salva"><div id="smlist">${rows || '<div class="empty">Nenhuma refeição encontrada.</div>'}</div>` : '<div class="empty">Nenhuma refeição salva. Toque em “Nova refeição” e escolha alimentos da sua biblioteca.</div>'}</section>`;
}
onInput('smq', (el, v) => { S.smq = v; const p = $('#smlist'); if (p) { const h = document.createElement('div'); h.innerHTML = smealsPanel(); const n = h.querySelector('#smlist'); if (n) { p.innerHTML = n.innerHTML; Photos.hydrate(p); } } });
on('smfav', async (b, v) => { await MealActions.toggleFav(v); });
on('smdup', async (b, v) => { if (await MealActions.duplicate(v)) toast('Refeição duplicada'); });
on('smdel', (b, v) => confirmM('Excluir refeição salva?', `“${esc(S.saved.find(m => m.id === v).name)}” será removida dos seus modelos. Refeições já registradas no diário não mudam.`, 'smdelok', v));
on('smdelok', async (b, v) => { const old = (DB.savedMeals.find(m => m.id === v) || {}).photo; if (!await MealActions.remove(v)) return; closeModal(); toast('Refeição excluída'); await Photos.release([old]); });

/* ---------- adicionar ao diário ---------- */
const slotSelect = t => `<select id="sds">${MEALS.map(([k, n]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
async function quickAdd(id, date, slot, amounts, label) {
  S.open[slot] = true;
  if (await MealActions.addToDiary(id, date, slot, amounts)) { S.dtab = 'dia'; render(); toast(label || 'Refeição adicionada ao diário'); return true; }
  return false;
}
on('smadd', async (b, v) => {   // um clique: data selecionada na Dieta, refeição padrão da categoria, quantidades originais
  const m = DB.savedMeals.find(x => x.id === v); if (!m || !m.items.length) { toast('Esta refeição não tem alimentos'); return; }
  await quickAdd(v, S.date, CAT_SLOT[m.category] || 'outras');
});
on('smadj', (b, v) => {
  const m = DB.savedMeals.find(x => x.id === v); if (!m) return;
  S.sa = { id: v };
  modal(`${mTitle('Adicionar ao diário', 6)}<p class="sub" style="margin-bottom:14px"><b style="color:var(--ink)">${esc(m.name)}</b> — ajuste as quantidades se precisar. Os valores são recalculados.</p>
<div class="f"><div><label for="sdd">Data</label><input id="sdd" type="date" value="${S.date}"></div><div><label for="sds">Refeição do diário</label>${slotSelect(CAT_SLOT[m.category] || 'outras')}</div></div>
${m.items.map((i, n) => `<div class="li sai"><div><p>${esc(i.name)}</p><small id="sat${n}"></small></div><div class="row" style="gap:6px"><input class="amt" id="saa${n}" type="number" inputmode="decimal" step="any" min="0" value="${i.amount}" data-inp="saamt" aria-label="Quantidade de ${esc(i.name)} em ${esc(i.unit)}"><span class="mut">${esc(i.unit)}</span></div></div>`).join('')}
<div class="prev" id="satot" aria-live="polite"></div>${foot('saok', 'Adicionar')}`);
  saRecalc();
});
function saRecalc() {
  const m = S.sa && DB.savedMeals.find(x => x.id === S.sa.id); if (!m) return;
  const T = { k: 0, p: 0, c: 0, g: 0 };
  m.items.forEach((i, n) => { const a = parseFloat(($('#saa' + n) || {}).value) || 0, v = scaleItem(i, a); T.k += v.calories; T.p += v.protein; T.c += v.carbs; T.g += v.fat; const el = $('#sat' + n); if (el) el.textContent = `${fmt(v.calories)} kcal · P ${fx(v.protein)} · C ${fx(v.carbs)} · G ${fx(v.fat)}`; });
  const el = $('#satot'); if (el) el.innerHTML = `Total adicionado: <b>${totLine(T)}</b>`;
}
onInput('saamt', () => saRecalc());
on('saok', async () => {
  const m = DB.savedMeals.find(x => x.id === (S.sa || {}).id); if (!m) return;
  const date = $('#sdd').value, slot = $('#sds').value, am = {};
  if (!isD(date)) { toast('Escolha uma data válida'); return; }
  let any = false;
  for (let n = 0; n < m.items.length; n++) {
    const raw = $('#saa' + n).value, a = parseFloat(raw);
    if (raw !== '' && !(a >= 0)) { toast('Quantidade inválida'); return; }
    if (a > 0) { am[m.items[n].id] = a; any = true; }     // itens com quantidade 0 ou vazia ficam de fora
  }
  if (!any) { toast('Informe ao menos uma quantidade maior que zero'); return; }
  S.date = date; closeModal();
  await quickAdd(m.id, date, slot, am);
});

/* ---------- criar / editar ---------- */
const smPer = i => ({ calories: i.calories / i.amount, protein: i.protein / i.amount, carbs: (i.carbs || 0) / i.amount, fat: (i.fat || 0) / i.amount });
function smOpen(m) {
  S.sm = m ? { id: m.id, name: m.name, category: m.category, favorite: !!m.favorite, items: m.items.map(i => ({ ...i, per: smPer(i) })) } : { id: null, name: '', category: 'almoco', favorite: false, items: [] };
  PhotoUI.init(m ? m.photo : null);
  smModal();
}
function smModal() {
  const m = S.sm, T = savedTotals(m);
  modal(`${mTitle(m.id ? 'Editar refeição salva' : 'Nova refeição salva', 14)}
<div class="f"><div class="w"><label for="smn">Nome</label><input id="smn" maxlength="120" value="${esc(m.name)}" placeholder="Ex.: Almoço padrão"></div>
<div class="w"><label for="smc">Categoria</label><select id="smc">${MEAL_CATS.map(([k, n]) => `<option value="${k}" ${k === m.category ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
${PhotoUI.html('Foto da refeição (opcional)')}</div>
<p class="cap" style="margin:6px 0 8px">Alimentos</p>
${m.items.map((i, n) => `<div class="li sai"><div><p>${esc(i.name)}</p><small id="smt${n}">${macroLine({ k: i.calories, p: i.protein, c: i.carbs || 0, g: i.fat || 0 })}</small></div><div class="row" style="gap:6px"><input class="amt" id="sma${n}" type="number" inputmode="decimal" step="any" min="0" value="${i.amount}" data-inp="smamt" data-n="${n}" aria-label="Quantidade de ${esc(i.name)} em ${esc(i.unit)}"><span class="mut">${esc(i.unit)}</span><button class="ib" aria-label="Remover ${esc(i.name)}" data-act="smrm" data-v="${n}">${ic('trash')}</button></div></div>`).join('') || '<div class="empty" style="padding:14px">Nenhum alimento ainda.</div>'}
<div class="smadd">${S.lib.length ? `<div class="f" style="margin:12px 0 0"><div class="w"><label for="smq2">Adicionar da biblioteca</label><input id="smq2" type="search" data-inp="smlfq" placeholder="Buscar alimento" autocomplete="off"></div><div><select id="smf" aria-label="Alimento" data-chg="smfsel">${libOptions('')}</select></div><div class="row" style="gap:6px"><input id="sman" type="number" inputmode="decimal" step="any" min="0" placeholder="Qtd." aria-label="Quantidade a adicionar"><span class="mut" id="smu"></span><button class="btn s sm" data-act="smaddit">${ic('plus')}Incluir</button></div></div>` : `<div class="empty" style="padding:14px">Cadastre alimentos na aba “Alimentos” para montar refeições.</div>`}</div>
<div class="prev" id="smtot" aria-live="polite">Total: <b>${totLine(T)}</b></div>${foot('smsave', 'Salvar refeição')}`);
  smUnit(); Photos.hydrate($('#sheet'));
}
const smRead = () => { const m = S.sm; if (!m) return; const n = $('#smn'), c = $('#smc'); if (n) m.name = n.value; if (c) m.category = c.value; };
function smUnit() { const f = DB.foods.find(x => x.id === (($('#smf') || {}).value)), u = $('#smu'); if (u) u.textContent = f ? f.unit : ''; }
onChange('smfsel', () => smUnit());
onInput('smlfq', (el, v) => { $('#smf').innerHTML = libOptions(v); smUnit(); });
onInput('smamt', (el) => {
  const m = S.sm, n = +el.dataset.n, i = m.items[n]; if (!i) return;
  const a = parseFloat(el.value) || 0; i.amount = a; i.calories = r1(i.per.calories * a); i.protein = r1(i.per.protein * a); i.carbs = r1(i.per.carbs * a); i.fat = r1(i.per.fat * a);
  const t = $('#smt' + n); if (t) t.textContent = macroLine({ k: i.calories, p: i.protein, c: i.carbs, g: i.fat });
  const T = savedTotals(m), el2 = $('#smtot'); if (el2) el2.innerHTML = `Total: <b>${totLine(T)}</b>`;
});
on('smaddit', () => {
  smRead();
  const f = DB.foods.find(x => x.id === $('#smf').value), a = parseFloat($('#sman').value);
  if (!f) { toast('Escolha um alimento'); return; }
  if (!(a > 0)) { toast('Informe a quantidade'); return; }
  const v = DietActions.calc(f, a);
  S.sm.items.push({ id: uid(), foodId: f.id, name: f.name, amount: a, unit: f.unit, ...v, per: { calories: v.calories / a, protein: v.protein / a, carbs: v.carbs / a, fat: v.fat / a } });
  smModal();
});
on('smrm', (b, v) => { smRead(); S.sm.items.splice(+v, 1); smModal(); });
on('smnew', () => smOpen());
on('smedit', (b, v) => smOpen(DB.savedMeals.find(x => x.id === v)));
on('smsave', async () => {
  smRead(); const m = S.sm, name = m.name.trim();
  if (!name) { toast('Informe o nome da refeição'); return; }
  if (!m.items.length) { toast('Inclua ao menos um alimento'); return; }
  if (m.items.some(i => !(i.amount > 0))) { toast('Todas as quantidades precisam ser maiores que zero'); return; }
  const old = m.id ? (DB.savedMeals.find(x => x.id === m.id) || {}).photo : null;
  Store._busy(1); let res;
  try { res = await PhotoUI.resolve(); } catch (e) { Store._busy(-1); toast((e.message || 'Não foi possível enviar a foto') + ' A refeição NÃO foi salva.', 5200); return; }
  Store._busy(-1);
  const ref = res.ref === undefined ? old : res.ref;
  const ok = await MealActions.save({ id: m.id, name, category: m.category, favorite: m.favorite, photo: ref, items: m.items });
  await PhotoUI.finish(ok, res, old);
  if (!ok) return;
  PhotoUI.drop(); closeModal(); toast(m.id ? 'Refeição atualizada' : 'Refeição salva');
});
