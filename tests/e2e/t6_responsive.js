/* Responsividade (celular, tablet, desktop), regressão visual básica de todas as páginas e testes do diff de alterações. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle, gate } = L;
const FIX = L.fs.readFileSync(L.path.join(__dirname, '../fixtures/legacy-v1-fictional.json'), 'utf8');
const overflow = p => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
const smallTargets = p => p.evaluate(() => [...document.querySelectorAll('#gate button, #gate input, #top button, #bn button, #banner button')].filter(e => e.offsetParent && !e.disabled).map(e => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.height < 36 && !e.classList.contains('glink')).map(([e]) => e.outerHTML.slice(0, 60)));
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  for (const [nome, w, h, touch] of [['celular 390', 390, 844, true], ['tablet 820', 820, 1180, true], ['desktop 1280', 1280, 800, false]]) {
    const { ctx, p } = await open(b, { w, h, touch, seed: { fittrack_data: FIX } });
    let o = await overflow(p);
    ok(`T30 ${nome}: tela inicial sem rolagem horizontal`, o.sw <= o.iw, o);
    for (const act of ['glogin']) { await p.click(`[data-act="${act}"]`); }
    o = await overflow(p); ok(`T30 ${nome}: login cabe na tela`, o.sw <= o.iw, o);
    await p.click('[data-act="gsignup"]'); o = await overflow(p); ok(`T30 ${nome}: cadastro cabe na tela`, o.sw <= o.iw, o);
    const fb = await p.evaluate(() => { const r = document.querySelector('.gcard').getBoundingClientRect(); return [r.left, r.right, innerWidth]; });
    ok(`T30 ${nome}: cartão de login com margens`, fb[0] >= 8 && fb[1] <= fb[2] - 8, fb);
    ok(`T30 ${nome}: alvos de toque do login com altura mínima`, (await smallTargets(p)).length === 0, await smallTargets(p));
    await p.click('[data-act="gland"]'); await p.click('[data-act="gdemo"]'); await p.waitForTimeout(400);
    // demo: percorre as páginas
    let bad = [];
    for (const v of ['inicio', 'treinos', 'dieta', 'progresso', 'hidratacao', 'config']) {
      await nav(p, v); const x = await overflow(p); const t = await txt(p, 'main');
      if (x.sw > x.iw || /undefined|NaN|\[object/.test(t)) bad.push([v, x]);
    }
    ok(`T30 ${nome}: demonstração — 6 páginas sem rolagem horizontal e sem "undefined/NaN"`, bad.length === 0 && p.errs.length === 0, { bad, errs: p.errs });
    ok(`T30 ${nome}: faixa de demonstração e topo visíveis sem sobrepor o conteúdo`, await p.evaluate(() => { const bn = document.querySelector('#banner').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return bn.height > 0 && bn.bottom <= m.top + 1; }));
    ok(`T30 ${nome}: alvos de toque do topo/faixa com altura mínima`, (await smallTargets(p)).length === 0, await smallTargets(p));
    // conta com dados migrados
    await p.click('#top [data-act=gexit]'); await p.waitForTimeout(300);
    await L.signupAndLogin(p, `r${w}@teste.invalid`);
    const bn = await txt(p, '#banner');
    ok(`T30 ${nome}: conta — faixa de migração visível e legível`, /Encontramos dados/.test(bn));
    await click(p, 'lgopen'); await click(p, 'lggo'); await p.waitForFunction(() => /Migração concluída/.test(document.querySelector('#sheet').innerText), null, { timeout: 20000 });
    const sh = await p.evaluate(() => { const r = document.querySelector('.sheet').getBoundingClientRect(); return [r.left, r.right, innerWidth]; });
    ok(`T30 ${nome}: modal de migração cabe na tela`, sh[0] >= 0 && sh[1] <= sh[2], sh);
    await click(p, 'close'); await p.waitForTimeout(200);
    bad = [];
    for (const v of ['inicio', 'treinos', 'dieta', 'progresso', 'hidratacao', 'config']) {
      await nav(p, v); const x = await overflow(p); const t = await txt(p, 'main');
      if (x.sw > x.iw || /undefined|NaN|\[object/.test(t) || t.trim().length < 20) bad.push([v, x]);
    }
    ok(`T30 ${nome}: conta com dados migrados — 6 páginas OK`, bad.length === 0 && p.errs.length === 0, { bad, errs: p.errs });
    await nav(p, 'progresso');
    ok(`T17 ${nome}: gráficos de progresso (peso, calorias, proteína, carbo, gordura, água) desenhados`, (await p.locator('main svg').count()) >= 4, await p.locator('main svg').count());
    await nav(p, 'config'); ok(`T30 ${nome}: Configurações mostra conta, dados e aparência`, /Conectado como/.test(await txt(p, 'main')) && /Aparência/.test(await txt(p, 'main')));
    await p.click('#top [data-act=logout]'); await p.waitForTimeout(300);
    ok(`T30 ${nome}: logout volta à tela inicial`, await gate(p));
    await ctx.close();
  }

  // ---- diff de alterações (unidade, no navegador)
  const { p } = await open(b);
  const u = await p.evaluate(() => {
    const a = emptyData(), r = {}; const id = () => crypto.randomUUID();
    const b2 = clone(a); r.same = Changes.diff(a, b2).length;
    b2.hydration.push({ id: id(), date: '2026-10-01', time: '08:00', amount: 300 }); r.addWater = Changes.diff(a, b2).map(o => o.k + ':' + o.a);
    const m = { id: id(), date: '2026-10-01', mealType: 'cafe', calories: 10, protein: 1, foods: [{ id: id(), name: 'x', quantity: '1', calories: 10, protein: 1, carbs: 0, fat: 0 }, { id: id(), name: 'y', quantity: '1', calories: 0, protein: 0, carbs: 0, fat: 0 }] };
    const c1 = clone(a); c1.meals.push(m); const c2 = clone(c1); c2.meals[0].foods.pop();
    r.removeItem = Changes.diff(c1, c2).map(o => o.k + ':' + o.a);
    const c3 = clone(c1); c3.meals = []; r.delMeal = Changes.diff(c1, c3).map(o => o.k + ':' + o.a).sort();
    const c4 = clone(c1); c4.meals[0].foods[0].quantity = '2'; r.editItem = Changes.diff(c1, c4).map(o => o.k + ':' + o.a);
    const w1 = clone(a); w1.workouts.push({ id: id(), name: 'W', days: [1], exercises: [{ id: id(), name: 'E', sets: 3 }] }); const w2 = clone(w1); w2.workouts[0].exercises[0].sets = 5; r.editEx = Changes.diff(w1, w2).map(o => o.k + ':' + o.a);
    const q1 = clone(a); const q2 = clone(a); q2.profile.calorieGoal = 3100; r.profOnly = Changes.diff(q1, q2).map(o => Object.keys(o.v).join(','));
    const d1 = clone(a); d1.profile.appearance = { theme: 'light', accent: 'blue' }; r.prof = Changes.diff(a, d1).map(o => o.k + ':' + JSON.stringify(o.v.appearance));
    const e1 = clone(a); e1.workouts.push({ id: 'nao-uuid', name: 'x', days: [], exercises: [] }); r.bad = Changes.badIds(Changes.diff(a, e1)).length;
    r.uuid = isUuid(uid());
    return r;
  });
  ok('Diff: documentos iguais não geram operações', u.same === 0);
  ok('Diff: nova água gera uma única operação', JSON.stringify(u.addWater) === '["water:put"]', u.addWater);
  ok('Diff: remover um item gera só a exclusão desse item', JSON.stringify(u.removeItem) === '["item:del"]', u.removeItem);
  ok('Diff: remover refeição exclui os itens (a refeição some no servidor)', JSON.stringify(u.delMeal) === '["item:del","item:del"]', u.delMeal);
  ok('Diff: editar um item grava só esse item', JSON.stringify(u.editItem) === '["item:put"]', u.editItem);
  ok('Diff: editar um exercício grava só esse exercício', JSON.stringify(u.editEx) === '["wex:put"]', u.editEx);
  ok('Diff: perfil envia só o campo alterado', JSON.stringify(u.profOnly) === '["calorieGoal"]', u.profOnly);
  ok('Diff: mudar aparência envia só o perfil', u.prof.length === 1 && u.prof[0].startsWith('profile:'), u.prof);
  ok('Diff: ID que não é UUID é detectado antes de enviar', u.bad === 1 && u.uuid);
  ok('Sem erros no console', p.errs.length === 0, p.errs);
  await b.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
