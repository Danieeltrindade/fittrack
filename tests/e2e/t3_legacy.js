/* Migração do armazenamento antigo (localStorage "fittrack_data") para a conta. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle } = L;
const sql = q => T.sql(q);
const FIX = L.fs.readFileSync(L.path.join(__dirname, '../fixtures/legacy-v1-fictional.json'), 'utf8');
const SEED = { fittrack_data: FIX };
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const src = JSON.parse(FIX);
  const want = { workouts: src.workouts.length, sessions: src.workoutHistory.length, meals: src.meals.length, foods: src.foods.length, weights: src.weightHistory.length, water: src.hydration.length,
    sets: src.workoutHistory.reduce((a, h) => a + h.exercises.reduce((c, e) => c + e.sets.length, 0), 0), items: src.meals.reduce((a, m) => a + m.foods.length, 0),
    exercises: new Set(src.workouts.flatMap(w => w.exercises.map(e => e.id))).size };
  let { ctx, p } = await open(b, { seed: SEED });
  ok('Legacy: tela pública NÃO toca nem converte o armazenamento antigo', await p.evaluate(() => localStorage.getItem('fittrack_data')) === FIX && await p.evaluate(() => !localStorage.getItem('fittrack_demo_v1')));
  await L.signupAndLogin(p, 'caio@teste.invalid');
  const uid = (await sql("select id from auth.users where email='caio@teste.invalid'"))[0].id;
  const cnt = async t => (await sql(`select count(*)::int c from public.${t} where user_id='${uid}'`))[0].c;
  ok('T20 detecta dados antigos e OFERECE a migração (faixa visível)', /Encontramos dados do FitTrack salvos neste navegador/.test(await txt(p, '#banner')), await txt(p, '#banner'));
  ok('T20 NADA é migrado automaticamente (banco vazio após o login)', await cnt('workouts') === 0 && await cnt('meals') === 0 && await cnt('workout_sessions') === 0);
  ok('T20 armazenamento antigo continua intacto, byte a byte', await p.evaluate(() => localStorage.getItem('fittrack_data')) === FIX);
  ok('T20 a conta nova NÃO exibe os dados antigos antes da confirmação', await p.evaluate(() => DB.workouts.length === 0));
  // abrir resumo e cancelar
  await click(p, 'lgopen');
  const m = await txt(p, '#sheet');
  ok('T20 resumo mostra contagens e promete não apagar o original', new RegExp(`${want.workouts}\\s*treinos`).test(m) && new RegExp(`${want.meals}\\s*refeições`).test(m) && /não serão apagados nem alterados/.test(m) && /cópia de segurança/.test(m), m.slice(0, 400));
  await click(p, 'close'); await p.waitForTimeout(100);
  ok('T20 cancelar não migra nada', await cnt('workouts') === 0 && await cnt('meals') === 0);
  await click(p, 'lgskip');
  ok('T20 "Agora não" esconde a faixa, sem migrar', (await txt(p, '#banner')) === '' && await cnt('workouts') === 0);

  // falha: o servidor recusa → nada gravado, nada marcado, original intacto
  await nav(p, 'config'); await click(p, 'lgopen');
  await T.flags({ rpcFailCode: '23514' }); await click(p, 'lggo');
  await p.waitForFunction(() => /não foi concluída/.test(document.querySelector('#sheet').innerText), null, { timeout: 8000 });
  ok('T21 falha no envio: informa a etapa e que nada foi apagado', /envio/.test(await txt(p, '#sheet')) && /não foram apagados nem alterados/.test(await txt(p, '#sheet')), await txt(p, '#sheet'));
  ok('T21 falha: nenhum dado e nenhum marcador de "concluído" no banco', await cnt('workouts') === 0 && await cnt('legacy_imports') === 0 && await p.evaluate(() => localStorage.getItem('fittrack_data')) === FIX);
  ok('T21 a cópia de segurança foi criada ANTES do envio', await p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('fittrack_data_pre_cloud_'))));
  await T.flags({ rpcFailCode: null });
  // recuperação: tentar de novo
  await click(p, 'lggo');
  await p.waitForFunction(() => /Migração concluída/.test(document.querySelector('#sheet').innerText), null, { timeout: 15000 });
  const got = {
    workouts: await cnt('workouts'), exercises: await cnt('workout_exercises'), sessions: await cnt('workout_sessions'), sets: await cnt('session_sets'),
    foods: await cnt('foods'), meals: await cnt('meals'), items: await cnt('meal_items'), weights: await cnt('weight_history'), water: await cnt('hydration') };
  ok('T20 migração conferida: TODAS as contagens do banco batem com o arquivo', JSON.stringify(got) === JSON.stringify({ workouts: want.workouts, exercises: want.exercises, sessions: want.sessions, sets: want.sets, foods: want.foods, meals: want.meals, items: want.items, weights: want.weights, water: want.water }), { got, want });
  ok('T20 marcador de conclusão gravado só depois da conferência', await cnt('legacy_imports') === 1);
  ok('T20 original preservado e cópia de segurança idêntica ao original', await p.evaluate(([f]) => localStorage.getItem('fittrack_data') === f && localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('fittrack_data_pre_cloud_'))) === f, [FIX]));
  // preservação: perfil, metas, aparência, cargas, reps, macros, hidratação
  const prof = (await sql(`select weight::float w, calorie_goal c, protein_goal p, carb_goal cb, theme, accent from public.profiles where user_id='${uid}'`))[0];
  ok('T20 perfil/metas/aparência migrados (faixa de carboidrato vira meta única)', prof.w === src.profile.weight && prof.c === src.profile.calorieGoal && prof.p === src.profile.proteinGoal && prof.cb === src.profile.carbGoalMin && prof.theme === 'light' && prof.accent === 'purple', prof);
  const s0 = src.workoutHistory[0], sset = s0.exercises[0].sets[0];
  const dbset = (await sql(`select t.load::float l, t.reps r, t.completed c from public.session_sets t join public.session_exercises x on x.id=t.session_exercise_id and x.user_id=t.user_id join public.workout_sessions s on s.id=x.session_id and s.user_id=x.user_id where s.user_id='${uid}' and s.session_date='${s0.date}' and x.position=0 and t.set_number=${sset.setNumber} order by s.created_at limit 1`))[0];
  ok('T20 cargas e repetições do histórico preservadas', dbset && dbset.l === sset.load && dbset.r === sset.reps && dbset.c === sset.completed, { dbset, sset });
  const m0 = src.meals[0], dm = (await sql(`select i.name, i.calories::float k, i.protein::float p, i.carbs::float c, i.fat::float g, i.quantity from public.meal_items i join public.meals m on m.id=i.meal_id and m.user_id=i.user_id where m.user_id='${uid}' and m.meal_date='${m0.date}' and m.meal_type='${m0.mealType}' order by i.position limit 1`))[0];
  ok('T20 macros e quantidades das refeições preservados', dm && dm.name === m0.foods[0].name && dm.k === m0.foods[0].calories && dm.p === m0.foods[0].protein && dm.quantity === m0.foods[0].quantity, { dm, f: m0.foods[0] });
  ok('T20 biblioteca migrada com porção + unidade (formato novo)', await (async () => { const f = (await sql(`select portion::float p, unit from public.foods where user_id='${uid}' and name='${src.foods[0].name}'`))[0]; return f && f.p === 150 && f.unit === 'g'; })());
  ok('T20 após migrar, a tela mostra os dados da conta (reload do banco)', await p.evaluate(w => DB.workouts.length === w, want.workouts));
  ok('T20 faixa de oferta some depois de migrar', (await txt(p, '#banner')) === '');
  // repetir: sem duplicar
  await nav(p, 'config'); ok('T21 painel mostra "já migrados"', /já migrados/.test(await txt(p, 'main')));
  await click(p, 'lgopen'); await click(p, 'lggo');
  await p.waitForFunction(() => /Migração concluída/.test(document.querySelector('#sheet').innerText), null, { timeout: 15000 });
  const again = { workouts: await cnt('workouts'), sessions: await cnt('workout_sessions'), sets: await cnt('session_sets'), meals: await cnt('meals'), items: await cnt('meal_items'), foods: await cnt('foods'), weights: await cnt('weight_history'), water: await cnt('hydration'), exercises: await cnt('workout_exercises') };
  const srt = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
  ok('T21 repetir a migração NÃO duplica nenhum dado', srt(again) === srt(got), { again, got });
  ok('T21 repetir não duplica o marcador', await cnt('legacy_imports') === 1);
  await p.reload(); await p.waitForTimeout(700);
  ok('T21 após recarregar, a oferta continua desligada', (await txt(p, '#banner')) === '' && await cnt('legacy_imports') === 1);

  // edição posterior não é sobrescrita por migrar de novo
  await p.evaluate(() => HydrationActions.add(iso(new Date()), '09:00', 123)); await waitIdle(p);
  await nav(p, 'config'); await click(p, 'lgopen'); await click(p, 'lggo');
  await p.waitForFunction(() => /Migração concluída/.test(document.querySelector('#sheet').innerText), null, { timeout: 15000 });
  ok('T21 dados novos feitos depois da migração permanecem', (await cnt('hydration')) === got.water + 1);

  // ---- segunda conta: migração acrescenta só à conta que confirmou (sem misturar)
  await click(p, 'close'); await p.click('#top [data-act=logout]'); await p.waitForTimeout(300);
  await L.signupAndLogin(p, 'dani@teste.invalid');
  const uid2 = (await sql("select id from auth.users where email='dani@teste.invalid'"))[0].id;
  ok('T25 outra conta no mesmo navegador: nada da primeira conta aparece', await p.evaluate(() => DB.workouts.length === 0 && DB.meals.length === 0) && !/Treino A/.test(await txt(p, '#main')));
  ok('T25 a oferta de migração aparece de novo (decisão por conta)', /Encontramos dados/.test(await txt(p, '#banner')) && (await sql(`select count(*)::int c from public.workouts where user_id='${uid2}'`))[0].c === 0);
  await b.close();

  // ---- arquivo antigo ilegível/corrompido
  await T.reset(); await T.flags({ requireConfirm: false });
  const b2 = await L.chromium.launch();
  ({ p } = await open(b2, { seed: { fittrack_data: '{"profile": {"weight": 7' } }));
  await L.signupAndLogin(p, 'eva@teste.invalid');
  await nav(p, 'config');
  ok('Legacy corrompido: não oferece migração automática, não quebra o app', (await txt(p, '#banner')) === '' && p.errs.length === 0, p.errs);
  await click(p, 'lgopen');
  ok('Legacy corrompido: explica o problema sem apagar nada', /não puderam ser lidos/.test(await txt(p, '#sheet')) && await p.evaluate(() => localStorage.getItem('fittrack_data') === '{"profile": {"weight": 7'));
  await b2.close();

  // ---- arquivo antigo com dado inválido (valor negativo): recusado antes de enviar
  await T.reset(); await T.flags({ requireConfirm: false });
  const bad = JSON.parse(FIX); bad.weightHistory[0].weight = -5;
  const b3 = await L.chromium.launch();
  ({ p } = await open(b3, { seed: { fittrack_data: JSON.stringify(bad) } }));
  await L.signupAndLogin(p, 'fabio@teste.invalid'); await nav(p, 'config'); await click(p, 'lgopen');
  ok('Legacy inválido: recusado na validação (nada enviado)', /não puderam ser lidos/.test(await txt(p, '#sheet')) && ((await T.log()).filter(x => x.includes('import_backup')).length === 0));
  await b3.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
