/* Duas contas reais, ataques via API, erros de rede/permissão/sessão, abas desatualizadas, responsividade. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle, gate } = L;
const sql = q => T.sql(q);
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { ctx, p } = await open(b);

  // ---- T25/T26 duas contas independentes, sem resíduo na tela
  await L.signupAndLogin(p, 'ana@teste.invalid');
  const A = (await sql("select id from auth.users where email='ana@teste.invalid'"))[0].id;
  await p.evaluate(() => WorkoutActions.save({ id: 0, nome: 'Treino SECRETO da Ana', dias: [1], ex: [{ n: 'Supino da Ana', s: 3 }] })); await waitIdle(p);
  await p.evaluate(() => DietActions.saveLibFood({ name: 'Alimento da Ana', portion: 100, unit: 'g', calories: 100, protein: 10, carbs: 5, fat: 1 }, null)); await waitIdle(p);
  await p.evaluate(() => HydrationActions.add(iso(new Date()), '10:00', 700)); await waitIdle(p);
  const aW = (await sql(`select id from public.workouts where user_id='${A}'`))[0].id;
  const aEx = (await sql(`select id from public.workout_exercises where user_id='${A}'`))[0].id;
  const aFood = (await sql(`select id from public.foods where user_id='${A}'`))[0].id;
  await nav(p, 'treinos');
  ok('T25 conta A vê o próprio treino', /Treino SECRETO da Ana/.test(await txt(p, 'main')));
  await p.click('#top [data-act=logout]'); await p.waitForTimeout(300);
  ok('T25 após sair, a tela não guarda nenhum dado da conta A', !/SECRETO|Ana/.test(await p.evaluate(() => document.body.innerText)) && await p.evaluate(() => !DB));
  await L.signupAndLogin(p, 'beto@teste.invalid');
  const B = (await sql("select id from auth.users where email='beto@teste.invalid'"))[0].id;
  await nav(p, 'treinos');
  ok('T25 conta B (mesma aba, sem recarregar) NÃO vê dados de A', !/SECRETO|Supino da Ana/.test(await p.evaluate(() => document.body.innerText)) && await p.evaluate(() => DB.workouts.length === 0 && DB.foods.length === 0 && DB.hydration.length === 0));
  await p.evaluate(() => WorkoutActions.save({ id: 0, nome: 'Treino do Beto', dias: [], ex: [{ n: 'Agachamento do Beto', s: 4 }] })); await waitIdle(p);
  ok('T25 no banco, cada conta tem só as próprias linhas (user_id distintos)', JSON.stringify(await sql(`select user_id, count(*)::int n from public.workouts group by 1 order by 1`)) === JSON.stringify([A, B].sort().map(u => ({ user_id: u, n: 1 }))));

  // ---- T27/T28/T29 ataques com a sessão de B usando o cliente real do app (RPC), mirando A
  const atk = await p.evaluate(async ([aW, aEx, aFood, A]) => {
    const c = Cloud.client(), out = {};
    const uidv = () => crypto.randomUUID();
    out.get = (await c.rpc('get_my_data', {})).data;
    out.delWorkout = await c.rpc('apply_changeset', { p: { ops: [{ k: 'workout', a: 'del', id: aW }, { k: 'food', a: 'del', id: aFood }] } });
    const sid = uidv(), mid = uidv();
    out.assoc = await c.rpc('apply_changeset', { p: { ops: [
      { k: 'session', a: 'put', v: { id: sid, date: '2026-10-01', workoutId: aW, workoutName: 'Tentativa', notes: '', exercises: [{ exerciseId: aEx, exerciseName: 'Supino', sets: [{ setNumber: 1, load: 1, reps: 1, completed: true }] }] } },
      { k: 'meal', a: 'put', v: { id: mid, date: '2026-10-01', mealType: 'cafe' } },
      { k: 'item', a: 'put', v: { id: uidv(), mealId: mid, name: 'Pão', quantity: '1', calories: 1, protein: 1, carbs: 1, fat: 0, foodId: aFood } }] } });
    out.hijack = await c.rpc('apply_changeset', { p: { ops: [{ k: 'workout', a: 'put', v: { id: aW, name: 'SEQUESTRADO', days: [] } }] } });
    out.badOwner = await c.rpc('apply_changeset', { p: { ops: [{ k: 'weight', a: 'put', v: { id: uidv(), user_id: A, date: '2026-10-01', weight: 80 } }] } });
    out.imp = await c.rpc('import_backup', { p: { workouts: [{ id: 'x', name: 'Invasor', user_id: A, exercises: [] }], workoutHistory: [], foods: [], meals: [], weightHistory: [], profile: { user_id: A } }, p_mode: 'merge' });
    out.sessId = sid;
    return out;
  }, [aW, aEx, aFood, A]);
  ok('T26 get_my_data da conta B devolve só dados de B', JSON.stringify(atk.get.workouts.map(w => w.name)) === '["Treino do Beto"]' && atk.get.foods.length === 0 && atk.get.hydration.length === 0);
  ok('T27 B não consegue ler nem apagar treino/alimento de A por id', (await sql(`select count(*)::int n from public.workouts where user_id='${A}' and name='Treino SECRETO da Ana'`))[0].n === 1 && (await sql(`select count(*)::int n from public.foods where user_id='${A}'`))[0].n === 1);
  ok('T27 B usar o ID do treino de A cria linha de B; a de A segue intacta', (await sql(`select name from public.workouts where user_id='${A}'`))[0].name === 'Treino SECRETO da Ana' && (await sql(`select count(*)::int n from public.workouts where user_id='${B}' and name='SEQUESTRADO'`))[0].n === 1);
  ok('T28 sessão/refeição de B apontando para IDs de A: vínculo descartado (sem associação entre contas)', (await sql(`select count(*)::int n from public.workout_sessions s where s.user_id='${B}' and s.id='${atk.sessId}' and s.workout_id is null`))[0].n === 1 && (await sql(`select count(*)::int n from public.session_exercises where user_id='${B}' and exercise_id is not null`))[0].n === 0 && (await sql(`select count(*)::int n from public.meal_items where user_id='${B}' and food_id is not null`))[0].n === 0);
  ok('T28 B nunca vira dono de linhas pelo campo user_id enviado (A não ganhou peso)', (await sql(`select count(*)::int n from public.weight_history where user_id='${A}'`))[0].n === 0);
  ok('T28 importação de B com user_id/ids de A não escreve nada na conta de A', (await sql(`select count(*)::int n from public.workouts where user_id='${A}'`))[0].n === 1 && (await sql(`select count(*)::int n from public.workouts where user_id='${B}' and name='Invasor'`))[0].n === 1);
  await p.evaluate(() => Store.reload()); await p.waitForTimeout(400);

  // ---- T27 gravação confirmada só com resposta do servidor; abas desatualizadas não sobrescrevem
  const p2 = await ctx.newPage(); await p2.route('**/cdn.jsdelivr.net/npm/@supabase/**', r => r.fulfill({ contentType: 'application/javascript', body: L.fs.readFileSync(L.path.join(__dirname, 'supabase-stub.js'), 'utf8') }));
  await p2.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: L.CFG_OK })); await p2.route(/fonts\./, r => r.abort());
  await p2.goto(L.BASE + '/index.html'); await p2.waitForTimeout(600);
  ok('Abas: segunda aba entra na mesma conta (sessão persistida)', await p2.evaluate(() => Store.mode === 'personal' && Boot.email === 'beto@teste.invalid'));
  await p2.evaluate(() => HydrationActions.add(iso(new Date()), '11:00', 111)); await p2.waitForFunction(() => !document.body.classList.contains('busy'));
  await p.evaluate(() => HydrationActions.add(iso(new Date()), '12:00', 222)); await waitIdle(p);   // aba 1 está desatualizada (não viu a água da aba 2)
  ok('Abas: gravar numa aba desatualizada NÃO apaga o que a outra aba salvou', (await sql(`select sum(amount_ml)::int s, count(*)::int n from public.hydration where user_id='${B}'`))[0].s === 333, await sql(`select * from public.hydration where user_id='${B}'`));
  await p.evaluate(() => Store.reload()); await p.waitForTimeout(300);
  ok('Abas: "atualizar dados" traz o estado real da conta', await p.evaluate(() => DB.hydration.length === 2));
  await p2.close();

  // ---- T27 erros: permissão, rede, sessão expirada
  await nav(p, 'hidratacao');
  const waterRows = async () => (await sql(`select count(*)::int n from public.hydration where user_id='${B}'`))[0].n;
  const n0 = await waterRows(), ui0 = await p.evaluate(() => DB.hydration.length);
  await T.flags({ rpcFailCode: '42501' }); await click(p, 'wadd', '300'); await waitIdle(p);
  const t1 = await txt(p, '#toast');
  ok('T27 permissão recusada: avisa e NÃO diz que salvou', /permissão/.test(t1) && !/registrados/.test(t1), t1);
  ok('T27 permissão recusada: tela e banco continuam como estavam', await waterRows() === n0 && await p.evaluate(() => DB.hydration.length) === ui0);
  await T.flags({ rpcFailCode: '23514' }); await click(p, 'wadd', '300'); await waitIdle(p);
  ok('T27 valor recusado pelo servidor: aviso claro, nada salvo', /recusou os dados/.test(await txt(p, '#toast')) && await waterRows() === n0);
  await T.flags({ rpcFailCode: null });
  await ctx.setOffline(true); await click(p, 'wadd', '300'); await waitIdle(p);
  const t2 = await txt(p, '#toast');
  ok('T27 sem conexão: avisa que nada foi alterado, não confirma gravação', /Sem conexão/.test(t2) && !/registrados/.test(t2), t2);
  ok('T27 sem conexão: nenhum dado fictício nem alteração otimista na tela', await p.evaluate(() => DB.hydration.length) === ui0 && await waterRows() === n0);
  ok('T27 sem conexão: faixa de aviso com "Atualizar dados"', /não foi salva/.test(await txt(p, '#banner')));
  await ctx.setOffline(false); await p.waitForTimeout(900);
  ok('T27 conexão volta: dados relidos do servidor e aviso some', (await txt(p, '#banner')) === '');
  await click(p, 'wadd', '300'); await waitIdle(p);
  ok('T27 depois de reconectar, gravar funciona e é confirmado', await waterRows() === n0 + 1 && /registrados/.test(await txt(p, '#toast')));

  // sessão expirada, renovação possível (token vencido → refresh → repete)
  await T.flags({ expireAll: true, refreshFails: false });
  const n1 = await waterRows(); await click(p, 'wadd', '200'); await waitIdle(p);
  ok('T29 token vencido mas renovável: a gravação é refeita e confirmada', await waterRows() === n1 + 1 && await p.evaluate(() => Store.mode === 'personal'));
  // sessão expirada e irrecuperável
  await T.flags({ expireAll: true, refreshFails: true });
  const n2 = await waterRows(); await click(p, 'wadd', '200'); await p.waitForTimeout(1200);
  ok('T29 sessão expirada: volta ao login com aviso e a alteração NÃO é salva', await gate(p) && /sessão expirou/.test(await txt(p, '#gate')) && await waterRows() === n2, await txt(p, '#gate'));
  ok('T29 sessão expirada: memória limpa (nenhum dado de B na tela)', await p.evaluate(() => !DB && Store.mode === 'none') && !/Beto/.test(await p.evaluate(() => document.body.innerText)));
  await T.flags({ expireAll: false, refreshFails: false });

  // falha ao carregar após o login: não mostra dados fictícios
  await p.fill('#ge', 'beto@teste.invalid'); await p.fill('#gp', 'senha-teste-123');
  await T.flags({ rpcFailCode: '08006' });
  await p.click('form[data-submit="gdologin"] button[type=submit]'); await p.waitForFunction(() => /Não foi possível carregar/.test(document.querySelector('#gate').innerText), null, { timeout: 8000 });
  ok('T27 falha ao carregar os dados: tela de erro, SEM dados fictícios no lugar', !/Treino A|78,4|Daniel/.test(await txt(p, '#gate')) && await p.evaluate(() => !DB));
  await T.flags({ rpcFailCode: null }); await click(p, 'gretry'); await p.waitForFunction(() => document.body.dataset.gate !== '1', null, { timeout: 8000 });
  ok('T27 "Tentar de novo" carrega os dados reais da conta', await p.evaluate(() => DB.workouts.length >= 1 && DB.workouts.some(w => w.name === 'Treino do Beto')));

  // duplo clique em ação de gravação: uma só gravação
  await nav(p, 'hidratacao'); const n3 = await waterRows();
  await T.flags({ rpcDelayMs: 400 });
  await p.evaluate(() => { const b = document.querySelector('[data-act=wadd][data-v="500"]'); b.click(); b.click(); b.click(); });
  await p.waitForTimeout(1500); await waitIdle(p);
  ok('T27 cliques repetidos durante a gravação não duplicam o registro', await waterRows() === n3 + 1, await waterRows() - n3);
  await T.flags({ rpcDelayMs: 0 });

  // ---- sessão em outra aba: logout propaga
  const p3 = await ctx.newPage(); await p3.route('**/cdn.jsdelivr.net/npm/@supabase/**', r => r.fulfill({ contentType: 'application/javascript', body: L.fs.readFileSync(L.path.join(__dirname, 'supabase-stub.js'), 'utf8') }));
  await p3.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: L.CFG_OK })); await p3.route(/fonts\./, r => r.abort());
  await p3.goto(L.BASE + '/index.html'); await p3.waitForTimeout(500);
  await p3.click('#top [data-act=logout]'); await p3.waitForTimeout(500);
  ok('Abas: sair em uma aba leva a outra aba à tela pública e limpa a memória', await gate(p) && await p.evaluate(() => !DB && Store.mode === 'none'));
  await p3.close();
  ok('Sem erros inesperados no console', p.errs.length === 0, p.errs);
  await b.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
