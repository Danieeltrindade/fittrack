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
function vConfig() {
  const c = S.cfg, G = goals(), AP = appOf(DB);
  return `<div class="pg">${hdr('Configurações', 'Peso, metas e seus dados.')}
<div class="row2" style="align-items:start"><section class="panel"><h2 style="margin-bottom:16px">Metas e peso</h2><div class="f"><div class="w"><label for="cp">Peso atual (kg)</label><input id="cp" type="number" step=".1" value="${c.peso}"></div>
<div><label for="cc">Meta de calorias (kcal)</label><input id="cc" type="number" step="50" value="${c.cal}"></div>
<div><label for="cr">Meta de proteína (g)</label><input id="cr" type="number" step="5" value="${c.prot}"></div>
<div><label for="cb">Meta de carboidratos (g/dia)</label><input id="cb" type="number" inputmode="decimal" step="5" min="0" value="${c.carb || ''}" placeholder="${c.carb ? '' : 'Estimado: ' + G.carb}"></div>
<div><label for="cf">Meta de gordura (g/dia)</label><input id="cf" type="number" inputmode="decimal" step="1" min="0" value="${c.fat || ''}" placeholder="${c.fat ? '' : 'Estimado: ' + G.fat}"></div>
<div class="w"><label for="cw">Meta diária de água (ml)</label><input id="cw" type="number" inputmode="numeric" step="100" min="500" value="${S.wgoal}"></div></div><button class="btn" data-act="savecfg">Salvar alterações</button></section>
${dataPanel()}</div>
${accountPanel()}
<section class="panel apr"><div><h2>Aparência</h2><p class="sub">Escolha o tema e a cor de destaque. A mudança é aplicada na hora e fica salva ${Store.mode === 'personal' ? 'na sua conta' : 'neste navegador'}.</p></div>
<div><p class="cap" id="lbl-tema">Tema</p><div class="seg" role="radiogroup" aria-labelledby="lbl-tema">${THEMES.map(([k, n, i]) => `<button type="button" role="radio" aria-checked="${k === AP.theme}" data-act="theme" data-v="${k}">${ic(i)}${n}</button>`).join('')}</div></div>
<div><p class="cap" id="lbl-cor">Cor de destaque</p><div class="sws" role="radiogroup" aria-labelledby="lbl-cor">${ACCENTS.map(([k, n]) => `<button type="button" role="radio" aria-checked="${k === AP.accent}" class="sw ${k}" data-act="accent" data-v="${k}"><i></i>${n}</button>`).join('')}</div></div></section></div>`;
}
on('theme', (b, v) => ProfileActions.setAppearance({ theme: v }));
on('accent', (b, v) => ProfileActions.setAppearance({ accent: v }));
on('savecfg', async () => {
  const num = id => { const t = $(id).value.trim(); return t === '' ? null : parseFloat(t); };
  const p = parseFloat($('#cp').value), c = parseInt($('#cc').value), r = parseInt($('#cr').value), carb = num('#cb'), fat = num('#cf'), water = num('#cw');
  if (!(p > 0 && c > 0 && r > 0)) { toast('Preencha valores maiores que zero'); return; }
  if ([fat, carb].some(x => x !== null && !(x > 0))) { toast('Gordura e carboidratos devem ser maiores que zero'); return; }
  if (water !== null && !(water >= 500 && water <= 10000)) { toast('Meta de água: informe entre 500 e 10.000 ml'); return; }
  if (await ProfileActions.saveGoals({ peso: p, cal: c, prot: r, fat, carb, water })) toast('Alterações salvas');
});
on('demo', () => { if (Store.mode === 'demo') confirmM('Restaurar dados fictícios?', 'Os dados da demonstração voltam ao exemplo original. Isso afeta somente a demonstração, nunca uma conta.', 'demook'); });
on('demook', () => { if (Store.mode !== 'demo') { closeModal(); return; } ProfileActions.restoreDemo(); closeModal(); toast('Dados fictícios restaurados'); });
on('wipe', () => { if (Store.mode === 'personal') confirmM('Apagar todos os dados da conta?', 'Treinos, refeições, alimentos, água, peso e históricos da sua conta serão removidos do servidor. O login é mantido. Essa ação não pode ser desfeita; exporte um backup antes se quiser guardar uma cópia.', 'wipeok'); });
on('wipeok', async () => { if (Store.mode !== 'personal') { closeModal(); return; } if (await Store.clear()) { closeModal(); toast('Todos os dados da conta foram apagados'); } });
