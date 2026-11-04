/* Demonstração pública: sem cadastro, dados fictícios locais, isolada do banco e do armazenamento pessoal. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle, gate } = L;
const sql = q => T.sql(q);
const FIX = L.fs.readFileSync(L.path.join(__dirname, '../fixtures/legacy-v1-fictional.json'), 'utf8');
const PERSONAL = JSON.stringify({ profile: { weight: 99.9, calorieGoal: 1, proteinGoal: 1 }, workouts: [], workoutHistory: [], foods: [], meals: [], weightHistory: [] });
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { ctx, p } = await open(b, { seed: { fittrack_data: PERSONAL, fittrack_prefs: '{"theme":"dark","accent":"green"}' } });
  const rowsTotal = async () => (await sql("select (select count(*) from public.workouts)+(select count(*) from public.meals)+(select count(*) from public.hydration)+(select count(*) from public.weight_history)+(select count(*) from public.foods)+(select count(*) from public.workout_sessions) n"))[0].n;
  await T.reset(); await T.flags({ requireConfirm: false });   // zera o log do servidor
  await p.click('[data-act="gdemo"]'); await p.waitForTimeout(500);
  ok('T22 demonstração abre SEM cadastro nem login', !(await gate(p)) && await p.evaluate(() => Store.mode === 'demo'));
  ok('T22 faixa deixa claro: dados fictícios, só neste navegador', /Modo demonstração/.test(await txt(p, '#banner')) && /fictícios/.test(await txt(p, '#banner')));
  ok('T22 demonstração tem dados fictícios completos (treinos, refeições, peso, água)', await p.evaluate(() => DB.workouts.length === 4 && DB.meals.length > 100 && DB.weightHistory.length > 20 && DB.hydration.length > 50 && DB.foods.length === 6 && DB.profile.weight === 78.4));
  const pages = { inicio: /Calorias|CALORIAS/i, treinos: /Treino A/, dieta: /Diário/, progresso: /Peso|peso/, hidratacao: /Adicionar água/, config: /Objetivo e metas/ };
  let bad = [];
  for (const v of Object.keys(pages)) { await nav(p, v); const t = await txt(p, 'main'); if (!pages[v].test(t) || /undefined|NaN|\[object/.test(t)) bad.push(v); }
  ok('T22 todas as páginas funcionam na demonstração (Início, Treinos, Dieta, Progresso, Hidratação, Configurações)', bad.length === 0 && p.errs.length === 0, { bad, errs: p.errs });
  await nav(p, 'config');
  const cfg = await txt(p, 'main');
  ok('T22 demonstração: sem exportar/importar/apagar nem migração, com "restaurar dados fictícios"', !/Exportar dados|Importar dados|Apagar dados|Migrar dados/.test(cfg) && /Restaurar dados fictícios/.test(cfg));
  ok('T22 demonstração: nada de e-mail/conta pessoal exibido', !/Conectado como/.test(cfg) && /Você está na demonstração/.test(cfg));
  // edições na demonstração
  await nav(p, 'hidratacao'); const w0 = await p.evaluate(() => DB.hydration.length); await click(p, 'wadd', '500'); await waitIdle(p);
  await nav(p, 'config'); await click(p, 'theme', 'light'); await click(p, 'accent', 'blue');
  await p.fill('#cc', '2222'); await click(p, 'savecfg');
  ok('T22 edições da demonstração funcionam e são salvas em fittrack_demo_v1', await p.evaluate(w => { const o = JSON.parse(localStorage.getItem('fittrack_demo_v1')); return o.data.hydration.length === w + 1 && o.data.profile.calorieGoal === 2222 && o.data.profile.appearance.theme === 'light'; }, w0));
  ok('T23 demonstração NÃO altera o armazenamento pessoal fittrack_data', await p.evaluate(s => localStorage.getItem('fittrack_data') === s, PERSONAL));
  ok('T23 demonstração NÃO faz nenhuma chamada ao servidor/banco', (await T.log()).filter(x => x.includes('/__api/')).length === 0, await T.log());
  ok('T23 nenhum dado da demonstração foi parar no banco', await rowsTotal() === 0);
  ok('T23 demonstração não grava token/sessão', await p.evaluate(() => !localStorage.getItem('fittrack_auth')));
  // recarregar: volta à tela pública; a demo continua guardada
  await p.reload(); await p.waitForTimeout(500);
  ok('T22 recarregar leva à tela pública (a demo não "vira" conta)', await gate(p) && await p.evaluate(() => Store.mode === 'none'));
  await p.click('[data-act="gdemo"]'); await p.waitForTimeout(400);
  ok('T22 reabrir a demonstração mantém as edições locais', await p.evaluate(w => DB.hydration.length === w + 1 && DB.profile.calorieGoal === 2222, w0));
  // restaurar dados fictícios
  await nav(p, 'config'); await click(p, 'demo'); await click(p, 'demook'); await p.waitForTimeout(200);
  ok('T22 "restaurar dados fictícios" volta ao exemplo original', await p.evaluate(w => DB.hydration.length === w && DB.profile.calorieGoal === 2900, w0));
  ok('T23 restaurar a demo não toca no armazenamento pessoal', await p.evaluate(s => localStorage.getItem('fittrack_data') === s, PERSONAL));
  // sair da demonstração
  await p.click('#top [data-act=gexit]'); await p.waitForTimeout(300);
  ok('T22 sair da demonstração volta à tela pública, sem apagar a demo nem dados pessoais', await gate(p) && await p.evaluate(s => !!localStorage.getItem('fittrack_demo_v1') && localStorage.getItem('fittrack_data') === s, PERSONAL));
  ok('T22 sair da demonstração limpa a memória', await p.evaluate(() => !DB && Store.mode === 'none' && document.querySelector('#main').innerHTML === ''));
  // demo -> criar conta: nada se mistura
  await p.click('[data-act="gdemo"]'); await p.waitForTimeout(300);
  await p.click('#banner [data-act=gsignup]'); await p.waitForTimeout(200);
  ok('T22 "Criar conta" na faixa da demo leva ao cadastro', /Criar conta/.test(await txt(p, '#gate')) && await p.evaluate(() => Store.mode === 'none' && !DB));
  await p.fill('#ge', 'gui@teste.invalid'); await p.fill('#gp', 'senha-teste-123'); await p.fill('#gp2', 'senha-teste-123'); await p.click('button[type=submit]');
  await p.waitForFunction(() => document.body.dataset.gate !== '1', null, { timeout: 8000 }); await p.waitForTimeout(300);
  ok('T23 conta nova NÃO herda a demonstração (memória e banco vazios)', await p.evaluate(() => Store.mode === 'personal' && DB.workouts.length === 0 && DB.meals.length === 0 && DB.hydration.length === 0) && await rowsTotal() === 0);
  ok('T23 a demonstração local continua guardada à parte', await p.evaluate(() => !!localStorage.getItem('fittrack_demo_v1')));
  ok('T23 a conta pessoal não mostra a faixa de demonstração', !/Modo demonstração/.test(await txt(p, '#banner')));
  await b.close();

  // ---- demonstração com serviço de contas indisponível
  for (const [nome, opts, rx] of [
    ['config vazia', { cfg: "window.FITTRACK_CONFIG={supabaseUrl:'',supabaseKey:''};" }, /não foram configuradas/],
    ['valores de exemplo', { cfg: "window.FITTRACK_CONFIG={supabaseUrl:'https://SEU-PROJETO.supabase.co',supabaseKey:'sb_publishable_EXEMPLO'};" }, /não foram configuradas/],
    ['chave SECRETA (sb_secret_)', { cfg: "window.FITTRACK_CONFIG={supabaseUrl:'https://abc.supabase.co',supabaseKey:'sb_secret_abcdefghijklmnopqrstuvwxyz'};" }, /chave SECRETA/],
    ['chave JWT service_role', { cfg: "window.FITTRACK_CONFIG={supabaseUrl:'https://abc.supabase.co',supabaseKey:'" + 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from('{"role":"service_role"}').toString('base64').replace(/=/g, '') + '.assinatura' + "'};" }, /chave SECRETA/],
    ['supabase-js fora do ar (CDN)', { stub: false }, /biblioteca de contas/]
  ]) {
    const bb = await L.chromium.launch(); const { p: q } = await open(bb, opts);
    const disabled = await q.evaluate(() => document.querySelector('[data-act=glogin]').disabled);
    ok(`Contas indisponíveis (${nome}): botão de conta desativado e explicado`, disabled && rx.test(await txt(q, '#gate')) && await q.evaluate(() => !Cloud.client()), await txt(q, '#gate'));
    await q.click('[data-act="gdemo"]'); await q.waitForTimeout(300);
    ok(`Contas indisponíveis (${nome}): a demonstração continua funcionando`, await q.evaluate(() => Store.mode === 'demo' && DB.workouts.length === 4) && q.errs.length === 0, q.errs);
    await bb.close();
  }
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
