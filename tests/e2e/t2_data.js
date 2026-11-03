/* Funções do app em conta pessoal: tudo é conferido DIRETO NO BANCO (Postgres real), não só na tela. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle, today } = L;
const sql = q => T.sql(q);
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { ctx, p } = await open(b);
  await L.signupAndLogin(p, 'bia@teste.invalid');
  const uid = (await sql("select id from auth.users where email='bia@teste.invalid'"))[0].id;
  const q1 = async (q) => { const r = await sql(q); return r[0] ? Object.values(r[0])[0] : null; };

  // ---- T9 perfil/metas
  await nav(p, 'config');
  await p.fill('#cp', '75.5'); await p.fill('#cc', '2800'); await p.fill('#cr', '160'); await p.fill('#cb', '350'); await p.fill('#cf', '70'); await p.fill('#cw', '3500');
  await click(p, 'savecfg'); await waitIdle(p);
  const pr = (await sql(`select weight::float w, calorie_goal c, protein_goal pr, carb_goal cb, fat_goal f, water_goal_ml wa from public.profiles where user_id='${uid}'`))[0];
  ok('T9 metas gravadas no banco (meta ÚNICA de carboidratos, gordura, água)', JSON.stringify(pr) === JSON.stringify({ w: 75.5, c: 2800, pr: 160, cb: 350, f: 70, wa: 3500 }), [pr, uid]);
  ok('T9 peso do dia entra no histórico de peso', await q1(`select count(*) from public.weight_history where user_id='${uid}' and weight=75.5 and entry_date=current_date`) === 1);
  await p.reload(); await p.waitForTimeout(600); await nav(p, 'config');
  ok('T9 metas continuam após recarregar', await p.inputValue('#cc') === '2800' && await p.inputValue('#cb') === '350' && await p.inputValue('#cw') === '3500');
  ok('T9 sem campos de faixa de carboidrato (mín/máx)', !/mín|máx/i.test(await txt(p, 'main')));

  // ---- T10 modelos de treino
  await nav(p, 'treinos');
  await click(p, 'new'); await p.fill('#en', 'Treino A · Peito');
  await p.locator('#sheet [name=n]').first().fill('Supino reto'); await p.locator('#sheet [name=s]').first().fill('4');
  await click(p, 'addex'); await p.locator('#sheet [name=n]').last().fill('Crucifixo'); await p.locator('#sheet [name=s]').last().fill('3');
  await click(p, 'day', '1'); await click(p, 'day', '4'); await click(p, 'saveT'); await waitIdle(p);
  let w = (await sql(`select w.id, w.name, w.days, (select json_agg(e.name order by e.position) from public.workout_exercises e where e.user_id=w.user_id and e.workout_id=w.id) ex from public.workouts w where w.user_id='${uid}'`))[0];
  ok('T10 treino criado com exercícios, séries e dias no banco', w && w.name === 'Treino A · Peito' && JSON.stringify(w.ex) === '["Supino reto","Crucifixo"]' && JSON.stringify(w.days) === '[1,4]', w);
  const exIds = (await sql(`select id from public.workout_exercises where user_id='${uid}' order by position`)).map(x => x.id);
  await p.click('.wk:first-child [data-act=edit]'); await p.fill('#en', 'Treino A · Peito e tríceps');
  await p.locator('#sheet [name=s]').first().fill('5'); await click(p, 'addex'); await p.locator('#sheet [name=n]').last().fill('Tríceps corda'); await p.locator('#sheet [name=s]').last().fill('3');
  await click(p, 'saveT'); await waitIdle(p);
  const exAfter = (await sql(`select id, name, sets from public.workout_exercises where user_id='${uid}' order by position`));
  ok('T10 editar treino: nome atualizado, IDs dos exercícios mantidos, novo exercício incluído', exAfter.length === 3 && exAfter[0].id === exIds[0] && exAfter[1].id === exIds[1] && exAfter[0].sets === 5 && exAfter[2].name === 'Tríceps corda', exAfter);

  // ---- T11 sessão registrada (carga/reps livres) + histórico
  await p.click('.wk:first-child [data-act=reg]');
  const first = p.locator('#sheet .eb').first();
  await first.locator('[data-k=c]').nth(0).fill('70'); await first.locator('[data-k=r]').nth(0).fill('8'); await first.locator('.dn').nth(0).click();
  await first.locator('[data-k=c]').nth(1).fill('72.5'); await first.locator('[data-k=r]').nth(1).fill('6'); await first.locator('.dn').nth(1).click();
  await p.fill('#so', 'boa sessão'); await click(p, 'fin'); await waitIdle(p);
  const ss = await sql(`select s.workout_name, s.notes, s.workout_id is not null linked, (select count(*) from public.session_sets t where t.user_id=s.user_id) n, (select json_agg(json_build_array(t.load::float, t.reps, t.completed) order by t.set_number) from public.session_sets t join public.session_exercises x on x.id=t.session_exercise_id and x.user_id=t.user_id where t.user_id=s.user_id and x.position=0) sets from public.workout_sessions s where s.user_id='${uid}'`);
  ok('T11 sessão gravada no banco com cargas/reps livres e vínculo ao treino', ss.length === 1 && ss[0].linked && ss[0].notes === 'boa sessão' && JSON.stringify(ss[0].sets.slice(0, 2)) === '[[70,8,true],[72.5,6,true]]', ss);
  await nav(p, 'treinos');
  ok('T11 histórico aparece na tela após gravar', /boa sessão|Treino A/.test(await txt(p, 'main')));
  // editar e excluir sessão
  await p.locator('#sessoes [data-act=sedit]').first().click();
  const e1 = p.locator('#sheet .eb').first(); await e1.locator('[data-k=c]').first().fill('75'); await e1.locator('[data-k=r]').first().fill('5'); await click(p, 'ssave'); await waitIdle(p);
  ok('T11 editar sessão atualiza o banco sem duplicar séries', await q1(`select count(*) from public.session_sets where user_id='${uid}' and load=75 and reps=5`) === 1 && await q1(`select count(*) from public.workout_sessions where user_id='${uid}'`) === 1);
  // apagar o modelo preserva o histórico
  await p.click('.wk:first-child [data-act=del]'); await click(p, 'delok'); await waitIdle(p);
  ok('T11 apagar o modelo de treino preserva a sessão (workout_id vira NULL)', await q1(`select count(*) from public.workouts where user_id='${uid}'`) === 0 && await q1(`select count(*) from public.workout_sessions where user_id='${uid}' and workout_id is null`) === 1);
  await p.locator('#sessoes [data-act=sdel]').first().click(); await click(p, 'sdelok'); await waitIdle(p);
  ok('T11 excluir sessão remove sessão e séries', await q1(`select count(*) from public.workout_sessions where user_id='${uid}'`) === 0 && await q1(`select count(*) from public.session_sets where user_id='${uid}'`) === 0);

  // ---- T12/T13 biblioteca e macros proporcionais
  await nav(p, 'dieta'); await click(p, 'dtab', 'alimentos'); await click(p, 'libnew');
  await p.fill('#ln', 'Whey Teste'); await p.fill('#lp', '30'); await p.fill('#lk', '120'); await p.fill('#lpr', '24'); await p.fill('#lc', '3'); await p.fill('#lg', '2'); await click(p, 'libsave'); await waitIdle(p);
  const food = (await sql(`select name, portion::float p, unit, calories::float k, protein::float pr, carbs::float c, fat::float g from public.foods where user_id='${uid}'`))[0];
  ok('T12 alimento da biblioteca gravado (porção + unidade + macros)', food && food.name === 'Whey Teste' && food.p === 30 && food.unit === 'g' && food.k === 120 && food.pr === 24, food);
  await click(p, 'dtab', 'dia'); await click(p, 'meal', 'cafe'); await p.fill('#la', '45');
  ok('T13 prévia proporcional: 45 g → 180 kcal, 36 g proteína', /180/.test(await txt(p, '#lprev')) && /36/.test(await txt(p, '#lprev')), await txt(p, '#lprev'));
  await click(p, 'saveL'); await waitIdle(p);
  const mi = (await sql(`select i.name, i.quantity, i.calories::float k, i.protein::float pr, i.carbs::float c, i.fat::float g, i.food_id is not null linked, m.meal_type, m.calories::float mk from public.meal_items i join public.meals m on m.id=i.meal_id and m.user_id=i.user_id where i.user_id='${uid}'`))[0];
  ok('T13 refeição gravada com macros proporcionais calculados', mi && mi.k === 180 && mi.pr === 36 && mi.c === 4.5 && mi.g === 3 && mi.quantity === '45 g' && mi.meal_type === 'cafe' && mi.mk === 180 && mi.linked, mi);
  // editar a biblioteca não altera refeição antiga
  await click(p, 'dtab', 'alimentos'); await p.locator('.lib [data-act=libedit]').first().click(); await p.fill('#lk', '999'); await click(p, 'libsave'); await waitIdle(p);
  ok('T13 editar o alimento na biblioteca NÃO altera a refeição já registrada', await q1(`select calories::float from public.meal_items where user_id='${uid}'`) === 180 && await q1(`select calories::float from public.foods where user_id='${uid}'`) === 999);
  // item manual + salvar na biblioteca
  await click(p, 'dtab', 'dia'); await click(p, 'meal', 'almoco'); await click(p, 'mmode', 'man');
  await p.fill('#mn', 'Arroz manual'); await p.fill('#mq', '150 g'); await p.fill('#mk', '195'); await p.fill('#mp', '4'); await p.fill('#mb', '42'); await p.fill('#mg', '0'); await p.check('#ms'); await click(p, 'saveM'); await waitIdle(p);
  ok('T13 item manual gravado e também enviado à biblioteca', await q1(`select count(*) from public.meal_items where user_id='${uid}' and name='Arroz manual' and calories=195`) === 1 && await q1(`select count(*) from public.foods where user_id='${uid}' and name='Arroz manual' and portion=150 and unit='g'`) === 1);
  // histórico nutricional + dashboard
  await nav(p, 'inicio');
  ok('T14 dashboard soma as refeições do dia (375 kcal, 40 g prot.)', /375/.test(await txt(p, 'main')) && /40/.test(await txt(p, '.strip')), (await txt(p, '.strip')).replace(/\n+/g, ' '));
  // remover item da refeição
  await nav(p, 'dieta'); await click(p, 'dtab', 'dia'); await p.locator('[data-act=rm]').first().click(); await waitIdle(p);
  ok('T13 remover item atualiza refeição no banco (refeição vazia some)', await q1(`select count(*) from public.meal_items where user_id='${uid}'`) === 1 && await q1(`select count(*) from public.meals where user_id='${uid}'`) === 1);
  // apagar alimento da biblioteca preserva refeição
  await click(p, 'dtab', 'alimentos'); await p.locator('.lib [data-act=libdel]').first().click(); await click(p, 'libdelok'); await waitIdle(p);
  ok('T12 excluir da biblioteca não apaga refeições já registradas', await q1(`select count(*) from public.foods where user_id='${uid}'`) === 1 && await q1(`select count(*) from public.meal_items where user_id='${uid}'`) === 1);

  // ---- T15 peso
  await nav(p, 'progresso'); await click(p, 'peso'); await p.fill('#pdt', today()); await p.fill('#pw', '74.2'); await click(p, 'psave'); await waitIdle(p);
  ok('T15 peso do dia atualizado no banco (uma linha por data)', await q1(`select count(*) from public.weight_history where user_id='${uid}' and entry_date=current_date`) === 1 && await q1(`select weight::float from public.weight_history where user_id='${uid}' and entry_date=current_date`) === 74.2);
  const old = new Date(Date.now() - 5 * 864e5), od = old.getFullYear() + '-' + String(old.getMonth() + 1).padStart(2, '0') + '-' + String(old.getDate()).padStart(2, '0');
  await click(p, 'peso'); await p.fill('#pdt', od); await p.fill('#pw', '76'); await click(p, 'psave'); await waitIdle(p);
  ok('T15 novo peso em outra data', await q1(`select count(*) from public.weight_history where user_id='${uid}'`) === 2);
  await p.locator('[data-act=pdel]').first().click(); await click(p, 'pdelok'); await waitIdle(p);
  ok('T15 excluir peso remove do banco', await q1(`select count(*) from public.weight_history where user_id='${uid}'`) === 1);

  // ---- T16 hidratação
  await nav(p, 'hidratacao');
  await click(p, 'wadd', '500'); await waitIdle(p); await click(p, 'wadd', '300'); await waitIdle(p);
  ok('T16 água rápida gravada no banco', await q1(`select coalesce(sum(amount_ml),0)::int from public.hydration where user_id='${uid}' and entry_date=current_date`) === 800);
  await click(p, 'wmanual'); await p.fill('#wq', '250'); await p.fill('#wt', '07:15'); await click(p, 'wsave'); await waitIdle(p);
  ok('T16 água manual com horário gravada', await q1(`select count(*) from public.hydration where user_id='${uid}' and entry_time='07:15' and amount_ml=250`) === 1);
  ok('T16 tela mostra o total do dia (1.050 ml de 3.500)', /1\.050/.test(await txt(p, 'main')) && /3\.500/.test(await txt(p, 'main')), (await txt(p, 'main')).slice(0, 200));
  await p.locator('[data-act=wdel]').first().click(); await waitIdle(p);
  ok('T16 excluir registro de água', await q1(`select count(*) from public.hydration where user_id='${uid}'`) === 2);
  await nav(p, 'inicio');
  ok('T14 dashboard mostra a água do dia', /ml|água/i.test(await txt(p, 'main')));

  // ---- T17 progresso (gráficos com dados da conta)
  await nav(p, 'progresso');
  ok('T17 progresso renderiza gráficos sem erro', (await p.locator('main svg').count()) >= 1 && p.errs.length === 0, p.errs);
  ok('T17 progresso inclui carboidratos e hidratação', /Carboidratos/i.test(await txt(p, 'main')) && /Hidrata|água/i.test(await txt(p, 'main')), (await txt(p, 'main')).slice(0, 300));

  // ---- T18 aparência
  await nav(p, 'config'); await click(p, 'theme', 'light'); await waitIdle(p); await click(p, 'accent', 'purple'); await waitIdle(p);
  const ap = (await sql(`select theme, accent from public.profiles where user_id='${uid}'`))[0];
  ok('T18 tema e cor guardados na conta', ap.theme === 'light' && ap.accent === 'purple', ap);
  await p.reload(); await p.waitForTimeout(600);
  ok('T18 tema/cor aplicados após recarregar', await p.evaluate(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.accent === 'purple'));

  // ---- T19 exportar JSON
  await nav(p, 'config');
  const [dl] = await Promise.all([p.waitForEvent('download'), click(p, 'exp')]);
  const file = '/tmp/fittrack-export-test.json'; await dl.saveAs(file);
  const exp = JSON.parse(L.fs.readFileSync(file, 'utf8')), raw = L.fs.readFileSync(file, 'utf8');
  ok('T19 backup exportado traz os dados da conta', exp.workoutHistory.length === 0 && exp.foods.length === 1 && exp.meals.length === 1 && exp.hydration.length === 2 && exp.profile.calorieGoal === 2800, Object.keys(exp));
  ok('T19 backup NÃO contém senha, token, chave, e-mail nem user_id', !/access_token|refresh_token|password|senha|sb_publishable|service_role|user_id|bia@teste/i.test(raw));

  // ---- T19 importar JSON
  await click(p, 'imp');
  const bk = JSON.parse(raw);
  const wid = 'w-imp-1', eid = 'e-imp-1';
  const imp = { schemaVersion: 2, profile: { weight: 70, calorieGoal: 2500, proteinGoal: 140, carbGoal: 300, waterGoalMl: 2500 },
    workouts: [{ id: wid, name: 'Importado', days: [2], exercises: [{ id: eid, name: 'Remada', sets: 3 }] }],
    workoutHistory: [{ id: 'h-imp', date: today(), workoutId: wid, workoutName: 'Importado', notes: 'n', exercises: [{ exerciseId: eid, exerciseName: 'Remada', sets: [{ setNumber: 1, load: 50, reps: 10, completed: true }] }] }],
    foods: [], meals: [], weightHistory: [{ id: 'p-imp', date: today(), weight: 70 }], hydration: [] };
  await p.fill('#tx', JSON.stringify({ ...imp, profile: { ...imp.profile, user_id: 'aaaa' } })); await click(p, 'impok');
  ok('T19 importar: arquivo com user_id é RECUSADO antes de tocar no banco', /não é permitido|user_id/.test(await txt(p, '#sheet')) && await q1(`select count(*) from public.workouts where user_id='${uid}'`) === 0 && await q1(`select count(*) from public.foods where user_id='${uid}'`) === 1);
  await click(p, 'close'); await click(p, 'imp'); await p.fill('#tx', '{"quebrado"'); await click(p, 'impok');
  ok('T19 importar: JSON inválido recusado e dados intactos', /não foi alterado|não foram alterados/i.test(await txt(p, '#sheet')) && await q1(`select count(*) from public.foods where user_id='${uid}'`) === 1);
  await click(p, 'close'); await click(p, 'imp'); await p.fill('#tx', JSON.stringify({ ...imp, weightHistory: [{ id: 'x', date: today(), weight: -3 }] })); await click(p, 'impok');
  ok('T19 importar: valor inválido recusado e dados intactos', /Importação falhou/.test(await txt(p, '#sheet')) && await q1(`select count(*) from public.foods where user_id='${uid}'`) === 1);
  await click(p, 'close'); await click(p, 'imp'); await p.fill('#tx', JSON.stringify(imp)); await click(p, 'impok');
  ok('T19 importar: pede confirmação mostrando o resumo', /Substituir os dados da conta/.test(await txt(p, '#sheet')) && /1\s*treinos|treinos/.test(await txt(p, '#sheet')));
  await click(p, 'impcancel');
  ok('T19 importar: cancelar não altera nada', await q1(`select count(*) from public.foods where user_id='${uid}'`) === 1);
  await click(p, 'imp'); await p.fill('#tx', JSON.stringify(imp)); await click(p, 'impok'); await click(p, 'impgo');
  await p.waitForFunction(() => !document.body.classList.contains('busy') && !document.querySelector('#ov.open'), null, { timeout: 8000 }); await p.waitForTimeout(200);
  const dbw = (await sql(`select name from public.workouts where user_id='${uid}'`)), dbs = await q1(`select count(*) from public.workout_sessions where user_id='${uid}' and workout_id is not null`);
  ok('T19 importar: dados da conta substituídos (treino, sessão ligada, peso) e antigos removidos', dbw.length === 1 && dbw[0].name === 'Importado' && dbs === 1 && await q1(`select count(*) from public.foods where user_id='${uid}'`) === 0 && await q1(`select count(*) from public.hydration where user_id='${uid}'`) === 0);
  ok('T19 importar: a tela já mostra os dados importados', await p.evaluate(() => DB.workouts.length === 1 && DB.workouts[0].name === 'Importado' && DB.profile.calorieGoal === 2500));
  ok('T19 importar: aparência da conta preservada (arquivo sem aparência)', (await sql(`select theme from public.profiles where user_id='${uid}'`))[0].theme === 'light');
  ok('T19 reimportar o mesmo arquivo não duplica', await (async () => { await click(p, 'imp'); await p.fill('#tx', JSON.stringify(imp)); await click(p, 'impok'); await click(p, 'impgo'); await p.waitForFunction(() => !document.body.classList.contains('busy') && !document.querySelector('#ov.open'), null, { timeout: 8000 }); return await q1(`select count(*) from public.workouts where user_id='${uid}'`) === 1 && await q1(`select count(*) from public.session_sets where user_id='${uid}'`) === 1; })());

  // ---- apagar dados da conta
  await click(p, 'wipe'); await click(p, 'wipeok'); await p.waitForFunction(() => !document.body.classList.contains('busy') && !document.querySelector('#ov.open'), null, { timeout: 8000 });
  ok('Apagar dados da conta: banco e tela esvaziados, login mantido', await q1(`select count(*) from public.workouts where user_id='${uid}'`) === 0 && await q1(`select count(*) from public.workout_sessions where user_id='${uid}'`) === 0 && await p.evaluate(() => DB.workouts.length === 0 && Store.mode === 'personal') && await q1(`select count(*) from auth.users where id='${uid}'`) === 1);
  ok('Sem erros no console', p.errs.length === 0, p.errs);
  await b.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
