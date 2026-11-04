/* views/settings.js — Configurações: peso e metas (calorias, proteína, gordura, carboidratos, água), dados e aparência. */
function dataPanel() {
  if (Store.mode === 'demo') return `<section class="panel"><h2 style="margin-bottom:4px">Dados da demonstração</h2><p class="sub" style="margin:0 0 18px">Todos os dados aqui são <b style="color:var(--ink)">fictícios</b> e ficam só neste navegador (nunca vão para um servidor). Você pode mexer à vontade e restaurar o exemplo quando quiser.</p><div class="chips"><button class="btn s" data-act="demo">Restaurar dados fictícios</button></div></section>`;
  const leg = Legacy.info ? `<button class="btn s" data-act="lgopen">${Legacy.done() ? 'Dados antigos (já migrados)' : 'Migrar dados deste navegador'}</button>` : '';
  return `<section class="panel"><h2 style="margin-bottom:4px">Seus dados</h2><p class="sub" style="margin:0 0 18px">Seus dados ficam salvos na sua conta (nuvem). Exporte um backup para guardar uma cópia, ou importe um backup seu para <b style="color:var(--ink)">substituir</b> os dados da conta.</p><div class="chips"><button class="btn s" data-act="exp">Exportar dados</button><button class="btn s" data-act="imp">Importar dados</button>${leg}<button class="btn d" data-act="wipe">Apagar dados da conta</button></div></section>`;
}
function accountPanel() {
  if (Store.mode === 'demo') return `<section class="panel"><h2 style="margin-bottom:4px">Conta</h2><p class="sub" style="margin:0 0 18px">Você está na demonstração. Crie uma conta para salvar seus próprios dados na nuvem.</p><div class="chips"><button class="btn" data-act="gsignup">Criar conta</button><button class="btn s" data-act="glogin">Entrar</button><button class="btn s" data-act="gexit">Sair da demonstração</button></div></section>`;
  return `<section class="panel"><h2 style="margin-bottom:4px">Conta</h2><p class="sub" style="margin:0 0 18px">Conectado como <b style="color:var(--ink)" id="acct-email">${esc(Boot.email)}</b>.</p><div class="chips"><button class="btn s" data-act="logout">Sair da conta</button></div></section>`;
}
const gtSeg = cur => `<div class="seg full" role="radiogroup" aria-label="Objetivo principal" id="gtseg">${GOAL_TYPES.map(([k, n]) => `<button type="button" role="radio" aria-checked="${k === cur}" data-act="gtsel" data-v="${k}">${n}</button>`).join('')}</div>`;
const adjText = a => a < 0 ? `Déficit de ${fmt(-a)} kcal por dia` : a > 0 ? `Superávit de ${fmt(a)} kcal por dia` : 'Sem déficit nem superávit (manutenção)';
function presetCard(gt, nm) {
  const pr = presetOf(DB.profile, gt), c = S.cfg, on = c.goalType === gt, v = k => pr[k] > 0 ? pr[k] : '';
  return `<div class="pset ${on ? 'on' : ''}" data-gt="${gt}"><div class="sec" style="margin-bottom:10px"><b>${nm}</b>${on ? '<span class="tag">Objetivo atual</span>' : ''}</div>
<div class="f f2"><div><label for="pc-${gt}-cal">Calorias (kcal)</label><input id="pc-${gt}-cal" type="number" inputmode="numeric" step="50" min="0" value="${v('cal')}"></div>
<div><label for="pc-${gt}-prot">Proteínas (g)</label><input id="pc-${gt}-prot" type="number" inputmode="numeric" step="5" min="0" value="${v('prot')}"></div>
<div><label for="pc-${gt}-carb">Carboidratos (g)</label><input id="pc-${gt}-carb" type="number" inputmode="numeric" step="5" min="0" value="${v('carb')}"></div>
<div><label for="pc-${gt}-fat">Gorduras (g)</label><input id="pc-${gt}-fat" type="number" inputmode="numeric" step="1" min="0" value="${v('fat')}"></div></div>
${gt !== 'maintain' ? `<p class="sub" style="font-size:12.5px;margin:10px 0 0" id="ps-${gt}"></p>` : ''}
<div class="chips" style="margin-top:12px"><button class="btn s sm" data-act="pssave" data-v="${gt}">Salvar metas deste objetivo</button><button class="btn s sm" data-act="psuse" data-v="${gt}">Usar como metas atuais…</button></div></div>`;
}
function vConfig() {
  const c = S.cfg, G = goals(), AP = appOf(DB);
  return `<div class="pg">${hdr('Configurações', 'Objetivo, metas, peso e seus dados.')}
<div class="row2" style="align-items:start"><section class="panel"><h2 style="margin-bottom:16px">Objetivo e metas do dia a dia</h2>
<p class="cap" id="lbl-gt" style="margin-bottom:8px">Objetivo principal</p>${gtSeg(c.goalType)}
<p class="sub" style="font-size:13px;margin:8px 0 16px">O objetivo define como o app interpreta ultrapassar uma meta (ex.: passar da proteína é esperado; passar das calorias no emagrecimento pede atenção). Trocar o objetivo <b style="color:var(--ink)">não muda</b> suas metas sozinho.</p>
<div class="f"><div><label for="cp">Peso atual (kg)</label><input id="cp" type="number" step=".1" value="${c.peso}"></div>
<div><label for="ctw">Peso desejado (kg)</label><input id="ctw" type="number" inputmode="decimal" step=".1" min="0" value="${c.target || ''}" placeholder="Opcional"></div>
<div class="w"><label for="cadj">Déficit (−) ou superávit (+) calórico desejado, em kcal/dia</label><input id="cadj" type="number" inputmode="numeric" step="50" value="${c.adjust || 0}" data-inp="cadj"><small class="mut" id="cadjt" style="display:block;margin-top:6px">${adjText(c.adjust || 0)}</small></div>
<div><label for="cc">Meta de calorias (kcal)</label><input id="cc" type="number" step="50" value="${c.cal}"></div>
<div><label for="cr">Meta de proteína (g)</label><input id="cr" type="number" step="5" value="${c.prot}"></div>
<div><label for="cb">Meta de carboidratos (g/dia)</label><input id="cb" type="number" inputmode="decimal" step="5" min="0" value="${c.carb || ''}" placeholder="${c.carb ? '' : 'Estimado: ' + G.carb}"></div>
<div><label for="cf">Meta de gordura (g/dia)</label><input id="cf" type="number" inputmode="decimal" step="1" min="0" value="${c.fat || ''}" placeholder="${c.fat ? '' : 'Estimado: ' + G.fat}"></div>
<div class="w"><label for="cw">Meta diária de água (ml)</label><input id="cw" type="number" inputmode="numeric" step="100" min="500" value="${S.wgoal}"></div></div><button class="btn" data-act="savecfg">Salvar alterações</button></section>
${dataPanel()}</div>
<section class="panel"><div class="sec"><div><h2>Metas por objetivo</h2><p class="sub" style="margin:4px 0 0">Guarde metas personalizadas para cada objetivo e use quando quiser. Nada é aplicado sem a sua confirmação.</p></div></div><div class="psets">${GOAL_TYPES.map(([k, n]) => presetCard(k, n)).join('')}</div></section>
${accountPanel()}
<section class="panel apr"><div><h2>Aparência</h2><p class="sub">Escolha o tema e a cor de destaque. A mudança é aplicada na hora e fica salva ${Store.mode === 'personal' ? 'na sua conta' : 'neste navegador'}.</p></div>
<div><p class="cap" id="lbl-tema">Tema</p><div class="seg" role="radiogroup" aria-labelledby="lbl-tema">${THEMES.map(([k, n, i]) => `<button type="button" role="radio" aria-checked="${k === AP.theme}" data-act="theme" data-v="${k}">${ic(i)}${n}</button>`).join('')}</div></div>
<div><p class="cap" id="lbl-cor">Cor de destaque</p><div class="sws" role="radiogroup" aria-labelledby="lbl-cor">${ACCENTS.map(([k, n]) => `<button type="button" role="radio" aria-checked="${k === AP.accent}" class="sw ${k}" data-act="accent" data-v="${k}"><i></i>${n}</button>`).join('')}</div></div></section></div>`;
}
const gtDraft = () => { const b = document.querySelector('#gtseg [aria-checked=true]'); return b ? b.dataset.v : S.cfg.goalType; };
on('gtsel', (b, v) => { document.querySelectorAll('#gtseg button').forEach(x => x.setAttribute('aria-checked', x === b)); });
onInput('cadj', (el, v) => { const n = parseInt(v) || 0, t = $('#cadjt'); if (t) t.textContent = adjText(n); updateSuggest(); });
/* sugestão (não aplicada): calorias de manutenção + ajuste */
function updateSuggest() {
  const mc = parseFloat(($('#pc-maintain-cal') || {}).value) || S.cfg.cal, adj = parseInt(($('#cadj') || {}).value) || 0;
  ['lose', 'gain'].forEach(gt => { const el = $('#ps-' + gt); if (!el) return; const ok = gt === 'lose' ? adj < 0 : adj > 0; el.innerHTML = ok ? `Sugestão: manutenção (${fmt(mc)}) ${adj < 0 ? '−' : '+'} ${fmt(Math.abs(adj))} = <b style="color:var(--ink)">${fmt(suggestCalories(mc, adj))} kcal</b> <button type="button" class="glink" data-act="psfill" data-v="${gt}">Usar essa sugestão</button>` : ''; });
}
on('psfill', (b, v) => { const mc = parseFloat($('#pc-maintain-cal').value) || S.cfg.cal, adj = parseInt($('#cadj').value) || 0; $('#pc-' + v + '-cal').value = suggestCalories(mc, adj); });
const readPreset = gt => { const n = k => parseFloat($(`#pc-${gt}-${k}`).value) || 0; return { cal: n('cal'), prot: n('prot'), carb: n('carb'), fat: n('fat') }; };
on('pssave', async (b, v) => {
  const p = readPreset(v);
  if (!(p.cal > 0 && p.prot >= 0 && p.carb >= 0 && p.fat >= 0) || p.cal > 20000 || p.prot > 2000 || p.carb > 3000 || p.fat > 2000) { toast('Informe calorias maiores que zero e valores válidos'); return; }
  if (await ProfileActions.savePreset(v, p)) toast('Metas do objetivo salvas');
});
const diffRows = p => [['Calorias', S.cfg.cal, p.cal, 'kcal'], ['Proteína', S.cfg.prot, p.prot, 'g'], ['Carboidratos', goals().carb, p.carb, 'g'], ['Gordura', goals().fat, p.fat, 'g']].filter(r => r[2] > 0).map(([n, a, b, u]) => `<div class="li"><p>${n}</p><small>${fmt(a)} → <b style="color:var(--ink)">${fmt(b)}</b> ${u}</small></div>`).join('');
on('psuse', (b, v) => {
  const p = presetOf(DB.profile, v), nm = GOAL_TYPES.find(g => g[0] === v)[1];
  if (!(p.cal > 0)) { toast('Salve primeiro as metas deste objetivo'); return; }
  modal(`${mTitle('Usar metas de ' + nm + '?', 6)}<p class="sub" style="margin-bottom:12px">Suas metas atuais serão substituídas por estas e o objetivo passa a ser “${nm}”. Registros anteriores não mudam.</p>${diffRows(p)}<div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Manter as atuais</button><button class="btn" style="flex:1" data-act="psapply" data-v="${v}">Aplicar</button></div>`);
});
on('psapply', async (b, v) => { if (await ProfileActions.applyPreset(v)) { closeModal(); toast('Metas atualizadas'); } });
on('theme', (b, v) => ProfileActions.setAppearance({ theme: v }));
on('accent', (b, v) => ProfileActions.setAppearance({ accent: v }));
on('savecfg', async () => {
  const num = id => { const t = $(id).value.trim(); return t === '' ? null : parseFloat(t); };
  const p = parseFloat($('#cp').value), c = parseInt($('#cc').value), r = parseInt($('#cr').value), carb = num('#cb'), fat = num('#cf'), water = num('#cw'), tw = num('#ctw'), adj = parseInt($('#cadj').value) || 0, gt = gtDraft();
  if (!(p > 0 && c > 0 && r > 0)) { toast('Preencha valores maiores que zero'); return; }
  if ([fat, carb].some(x => x !== null && !(x > 0))) { toast('Gordura e carboidratos devem ser maiores que zero'); return; }
  if (water !== null && !(water >= 500 && water <= 10000)) { toast('Meta de água: informe entre 500 e 10.000 ml'); return; }
  if (tw !== null && !(tw > 20 && tw < 700)) { toast('Peso desejado: informe um valor entre 20 e 700 kg'); return; }
  if (Math.abs(adj) > 5000) { toast('Déficit/superávit: use um valor até 5.000 kcal'); return; }
  const changedGT = gt !== S.cfg.goalType;
  if (!await ProfileActions.saveGoals({ peso: p, cal: c, prot: r, fat, carb, water, goalType: gt, target: tw === null ? 0 : tw, adjust: adj })) return;
  toast('Alterações salvas');
  // trocou o objetivo e existem metas salvas para ele que diferem das atuais: PERGUNTA antes de mudar qualquer meta
  const pr = presetOf(DB.profile, gt);
  if (changedGT && pr.cal > 0 && (pr.cal !== S.cfg.cal || pr.prot !== S.cfg.prot)) {
    const nm = GOAL_TYPES.find(g => g[0] === gt)[1];
    modal(`${mTitle('Usar as metas de ' + nm + '?', 6)}<p class="sub" style="margin-bottom:12px">Você tem metas salvas para este objetivo. Suas metas atuais continuam como estão, a menos que você aplique.</p>${diffRows(pr)}<div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Manter as atuais</button><button class="btn" style="flex:1" data-act="psapply" data-v="${gt}">Aplicar</button></div>`);
  }
});
on('demo', () => { if (Store.mode === 'demo') confirmM('Restaurar dados fictícios?', 'Os dados da demonstração voltam ao exemplo original. Isso afeta somente a demonstração, nunca uma conta.', 'demook'); });
on('demook', () => { if (Store.mode !== 'demo') { closeModal(); return; } ProfileActions.restoreDemo(); closeModal(); toast('Dados fictícios restaurados'); });
on('wipe', () => { if (Store.mode === 'personal') confirmM('Apagar todos os dados da conta?', 'Treinos, refeições, alimentos, água, peso e históricos da sua conta serão removidos do servidor. O login é mantido. Essa ação não pode ser desfeita; exporte um backup antes se quiser guardar uma cópia.', 'wipeok'); });
on('wipeok', async () => { if (Store.mode !== 'personal') { closeModal(); return; } if (await Store.clear()) { closeModal(); toast('Todos os dados da conta foram apagados'); } });
