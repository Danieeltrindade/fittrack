/* Treino livre, troca do treino do dia e ajustes durante a sessão (pular / trocar / adicionar), com sugestão do próximo treino pela semana. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle } = L;
const sql = q => T.sql(q);
const FIXED = new Date('2026-11-12T12:00:00');          // quinta-feira · a semana de treino começa na segunda 09/11
const day = o => { const d = new Date(FIXED); d.setDate(d.getDate() - o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const SEG = day(3), TER = day(2), HOJE = day(0);
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { p } = await open(b, { w: 1280, h: 900 });
  await L.signupAndLogin(p, 'ana@teste.invalid');
  await p.clock.setFixedTime(FIXED);
  const ids = {};
  // dados de TESTE (conta de teste): 4 treinos agendados (seg/ter/qui/sex) e 2 sessões na semana: Pernas na segunda (no lugar do Peito) e Costas na terça
  const res = await p.evaluate(async ([SEG, TER]) => Store.update(d => {
    Object.assign(d.profile, { calorieGoal: 2900, proteinGoal: 160, carbGoal: 380, fatGoal: 80 });
    const w = (name, days, exs) => { const o = { id: uid(), name, days, exercises: exs.map(n => ({ id: uid(), name: n, sets: 3 })) }; d.workouts.push(o); return o; };
    const peito = w('Peito e tríceps', [1], ['Supino reto', 'Crucifixo']), costas = w('Costas e bíceps', [2], ['Puxada frontal', 'Rosca direta']), pernas = w('Pernas', [4], ['Agachamento livre', 'Leg press']), ombros = w('Ombros', [5], ['Desenvolvimento']);
    const ses = (date, wk) => d.workoutHistory.push({ id: uid(), date, workoutId: wk.id, workoutName: wk.name, notes: '', exercises: wk.exercises.map(e => ({ exerciseId: e.id, exerciseName: e.name, note: '', sets: [1, 2, 3].map(n => ({ setNumber: n, load: 40, reps: 10, completed: true })) })) });
    ses(SEG, pernas); ses(TER, costas);
  }), [SEG, TER]);
  ok('S0 dados de teste gravados', res === true);
  await waitIdle(p); await nav(p, 'inicio'); await p.waitForTimeout(400);
  const card = () => txt(p, '.feat');

  // ---- sugestão do treino pela semana
  const c1 = await card();
  ok('N1 hoje (quinta) a sugestão é o Peito: atrasado e ainda não feito na semana', /treino de hoje/i.test(c1) && /Peito e tríceps/.test(c1), c1);
  ok('N1 avisa que pela agenda de hoje seria Pernas (que já foi feito na segunda)', /Pela agenda de hoje seria\s*Pernas, mas\s*Peito e tríceps\s*ainda não foi feito/.test(c1.replace(/\n/g, ' ')), c1);
  ok('N1 cartão tem Iniciar treino, Trocar e Treino livre', /Iniciar treino/.test(c1) && /Trocar/.test(c1) && /Treino livre/.test(c1));

  // ---- trocar o treino de hoje
  await click(p, 'swapday'); await p.waitForTimeout(200);
  const sw = await txt(p, '#sheet');
  ok('W1 folha lista os 4 treinos com a situação de cada um', ['Peito e tríceps', 'Costas e bíceps', 'Pernas', 'Ombros'].every(n => sw.includes(n)), sw);
  ok('W1 situação: Pernas e Costas "Feito", Peito "Ainda não feito esta semana", Ombros "Planejado"', /Feito seg/.test(sw) && /Feito ter/.test(sw) && /Ainda não feito esta semana/.test(sw) && /Planejado: sex/.test(sw), sw);
  ok('W2 já vem marcado o treino sugerido (Peito) e o botão diz "Usar Peito e tríceps hoje"', /Usar Peito e tríceps hoje/.test(await txt(p, '#swgo')));
  await p.evaluate(() => document.querySelector('#swl [data-v]:nth-child(4)').click()); await p.waitForTimeout(100);
  ok('W3 escolher outro treino muda o botão sem reabrir a folha', /Usar Ombros hoje/.test(await txt(p, '#swgo')));
  await click(p, 'swgo'); await p.waitForTimeout(250);
  ok('W4 abre a sessão do treino escolhido (Ombros), de hoje', /Ombros/.test(await txt(p, '#sheet h2')) && await p.evaluate(() => S.regDate) === HOJE);
  await p.evaluate(() => { const r = document.querySelector('#sheet .sr:not(.hd)'); r.querySelector('[data-k=r]').value = 8; r.querySelector('[data-k=c]').value = 30; r.querySelector('.dn').click(); });
  await click(p, 'fin'); await waitIdle(p);
  const ses1 = await p.evaluate(() => DB.workoutHistory.slice(-1)[0]);
  ok('W5 sessão salva ligada ao treino escolhido (Ombros), não ao sugerido', ses1.workoutName === 'Ombros' && !!ses1.workoutId && ses1.date === HOJE, ses1);
  await nav(p, 'inicio'); await p.waitForTimeout(300);
  const c2 = await card();
  ok('N2 depois de treinar hoje, o cartão vira "Próximo treino" e continua sugerindo o Peito (ainda não feito)', /próximo treino/i.test(c2) && /Peito e tríceps/.test(c2), c2);
  ok('N3 treinos feitos na semana: 3 (Pernas trocada, Costas e Ombros)', /3\s*\/\s*4/.test(await txt(p, '.wkt')), await txt(p, '.wkt'));

  // ---- treino livre
  await click(p, 'freenew'); await p.waitForTimeout(200);
  ok('F1 abre o treino livre, vazio, com campos de nome e "com quem"', /Treino livre/.test(await txt(p, '#sheet h2')) && await p.locator('#fwn').inputValue() === 'Treino livre' && await p.locator('#fwt').count() === 1);
  await p.fill('#fwn', 'Costas com o João'); await p.fill('#fwt', 'João');
  await click(p, 'fwlib'); await p.waitForTimeout(150);
  ok('F2 a biblioteca mostra exercícios dos seus treinos e do histórico', (await txt(p, '#fwlist')).includes('Supino reto') && (await txt(p, '#fwlist')).includes('Puxada frontal'));
  await p.fill('#fwq', 'supino'); await p.waitForTimeout(80);
  ok('F3 a busca filtra a lista', (await p.locator('#fwlist .swo').count()) === 1 && (await txt(p, '#fwlist')).includes('Supino reto'));
  await p.evaluate(() => document.querySelector('#fwlist .swo').click()); await p.waitForTimeout(150);
  ok('F4 o exercício entra com 3 séries e o nome digitado foi mantido', (await txt(p, '#sheet')).includes('Supino reto') && await p.locator('#fwn').inputValue() === 'Costas com o João' && await p.locator('#fwt').inputValue() === 'João');
  await click(p, 'fwlib'); await p.fill('#fwnew', 'Peck deck'); await click(p, 'fwcreate'); await p.waitForTimeout(200);
  ok('F5 cria exercício novo na hora e já o adiciona', (await txt(p, '#sheet')).includes('Peck deck'));
  await click(p, 'fwup', '1'); await click(p, 'fwup', '1'); await click(p, 'fwdn', '0');
  ok('F6 ajusta o número de séries (Supino 2, Peck deck 5)', await p.evaluate(() => S.fw.ex.map(x => x.s).join()) === '2,5');
  await click(p, 'fwlib'); await p.fill('#fwq', 'puxada'); await p.evaluate(() => document.querySelector('#fwlist .swo').click()); await p.waitForTimeout(100);
  await click(p, 'fwgo'); await p.waitForTimeout(250);
  const blocks = () => p.evaluate(() => [...document.querySelectorAll('#sheet .eb')].map(b => ({ n: b.querySelector('b').textContent, sets: b.querySelectorAll('.sr:not(.hd)').length, skip: b.hasAttribute('data-skip') })));
  const B1 = await blocks();
  ok('F7 abre a sessão com os 3 exercícios e as séries escolhidas', JSON.stringify(B1.map(x => [x.n, x.sets])) === JSON.stringify([['Supino reto', 2], ['Peck deck', 5], ['Puxada frontal', 3]]), B1);
  ok('F7 título é o nome do treino livre', /Costas com o João/.test(await txt(p, '#sheet h2')));

  // ---- ajustes durante a sessão
  await p.evaluate(() => { const r = document.querySelectorAll('#sheet .eb')[0].querySelector('.sr:not(.hd)'); r.querySelector('[data-k=c]').value = 22; r.querySelector('[data-k=r]').value = 12; r.querySelector('.dn').click(); });
  await p.evaluate(() => document.querySelectorAll('#sheet [data-act=exmenu]')[2].click()); await p.waitForTimeout(80);
  ok('A1 o menu ⋯ do exercício mostra pular, trocar e remover', await p.evaluate(() => { const m = document.querySelectorAll('#sheet .exm')[2]; return !m.hidden && /Pular/.test(m.innerText) && /Trocar/.test(m.innerText) && /Remover/.test(m.innerText); }));
  await p.evaluate(() => document.querySelectorAll('#sheet [data-act=exskip]')[2].click()); await p.waitForTimeout(80);
  ok('A2 pular esconde as séries e marca "pulado"; o que já foi digitado nos outros fica', await p.evaluate(() => { const b = document.querySelectorAll('#sheet .eb')[2]; return b.hasAttribute('data-skip') && !b.querySelector('.skt').hidden && getComputedStyle(b.querySelector('.exbody')).display === 'none' && document.querySelectorAll('#sheet .eb')[0].querySelector('[data-k=c]').value === '22'; }));
  await p.evaluate(() => document.querySelectorAll('#sheet [data-act=exmenu]')[1].click());
  await p.evaluate(() => document.querySelectorAll('#sheet [data-act=exswap]')[1].click()); await p.waitForTimeout(120);
  ok('A3 trocar abre a lista de exercícios (sem os que já estão na sessão)', await p.evaluate(() => { const t = document.querySelector('#pklist').innerText; return t.includes('Crucifixo') && !t.includes('Supino reto') && !t.includes('Peck deck'); }));
  await p.fill('#pq', 'cruc'); await p.evaluate(() => document.querySelector('#pklist .swo').click()); await p.waitForTimeout(150);
  const B2 = await blocks();
  ok('A4 trocar substitui o exercício mantendo o nº de séries e mostra "trocado de Peck deck"', B2[1].n === 'Crucifixo' && B2[1].sets === 5 && /trocado de Peck deck/.test(await txt(p, '#sheet')), B2);
  ok('A4 a troca não apagou o que já tinha sido digitado em outro exercício', await p.evaluate(() => document.querySelectorAll('#sheet .eb')[0].querySelector('[data-k=c]').value === '22'));
  await click(p, 'exadd'); await p.fill('#pnew', 'Elevação de quadril'); await click(p, 'excreate'); await p.waitForTimeout(150);
  const B3 = await blocks();
  ok('A5 adicionar cria o exercício novo no fim, com 3 séries e etiqueta "adicionado"', B3.length === 4 && B3[3].n === 'Elevação de quadril' && B3[3].sets === 3 && /adicionado/.test(await txt(p, '#sheet')), B3);
  await p.evaluate(() => { const r = document.querySelectorAll('#sheet .eb')[3].querySelector('.sr:not(.hd)'); r.querySelector('[data-k=c]').value = 60; r.querySelector('[data-k=r]').value = 15; r.querySelector('.dn').click(); });
  await p.evaluate(() => { const r = document.querySelectorAll('#sheet .eb')[1].querySelector('.sr:not(.hd)'); r.querySelector('[data-k=c]').value = 18; r.querySelector('[data-k=r]').value = 14; r.querySelector('.dn').click(); });
  await click(p, 'fin'); await waitIdle(p); await p.waitForTimeout(250);
  const ses2 = await p.evaluate(() => DB.workoutHistory.slice(-1)[0]);
  ok('A6 sessão livre salva SEM treino cadastrado (workoutId nulo), com o nome do treino', ses2.workoutId === null && ses2.workoutName === 'Costas com o João', [ses2.workoutId, ses2.workoutName]);
  ok('A6 "Com João" vai nas observações da sessão', /Com João/.test(ses2.notes), ses2.notes);
  ok('A6 o exercício pulado NÃO foi gravado; trocado e adicionado foram', JSON.stringify(ses2.exercises.map(e => e.exerciseName)) === JSON.stringify(['Supino reto', 'Crucifixo', 'Elevação de quadril']), ses2.exercises.map(e => e.exerciseName));
  ok('A6 exercício da biblioteca fica ligado ao cadastrado; o criado na hora não tem vínculo', await p.evaluate(() => { const s = DB.workoutHistory.slice(-1)[0], sup = DB.workouts.flatMap(w => w.exercises).find(e => e.name === 'Supino reto'); return s.exercises[0].exerciseId === sup.id && !s.exercises[2].exerciseId; }));
  ok('A6 cargas e repetições digitadas foram gravadas', ses2.exercises[0].sets[0].load === 22 && ses2.exercises[0].sets[0].reps === 12 && ses2.exercises[2].sets[0].load === 60);
  ok('A7 aparece a tela "Treino concluído" com Guardar como treino', /Treino concluído/.test(await txt(p, '#sheet')) && /Guardar como treino/.test(await txt(p, '#sheet')) && /conta como treino feito/.test(await txt(p, '#sheet')));

  // ---- banco de verdade (RLS ligado): sessão sem treino cadastrado
  const rows = await sql("select s.workout_id is null as livre, s.workout_name, (select count(*) from public.session_exercises x where x.session_id = s.id) as nex, (select count(*) from public.session_exercises x where x.session_id = s.id and x.exercise_id is null) as sem_vinculo from public.workout_sessions s where s.workout_name = 'Costas com o João'");
  ok('D1 no banco: workout_id nulo, 3 exercícios, 1 sem vínculo (o criado na hora)', rows.length === 1 && rows[0].livre === true && +rows[0].nex === 3 && +rows[0].sem_vinculo === 1, rows);

  // guardar como treino
  await click(p, 'fwsave'); await waitIdle(p); await p.waitForTimeout(200);
  const salvo = await p.evaluate(() => DB.workouts.find(w => w.name === 'Costas com o João'));
  ok('G1 "Guardar como treino" cria o treino com os 3 exercícios realizados, sem dia definido', !!salvo && salvo.exercises.length === 3 && !(salvo.days || []).length, salvo);

  // exercício criado na hora aparece no histórico e nos gráficos
  await nav(p, 'treinos'); await p.waitForTimeout(300);
  ok('H1 "Peck deck" e o exercício criado na hora aparecem na lista de exercícios do histórico', await p.evaluate(() => exNames().includes('Elevação de quadril') && [...document.querySelectorAll('select[data-chg=ex] option')].some(o => o.textContent === 'Elevação de quadril')));
  ok('H2 a sessão livre aparece em "Sessões registradas" e em "Sessões de hoje"', /Costas com o João/.test(await txt(p, '#sessoes')));
  await nav(p, 'progresso'); await p.waitForTimeout(300);
  await p.evaluate(() => { const s = document.querySelector('select[data-chg=ex]'); s.value = 'Elevação de quadril'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(250);
  ok('H3 o gráfico de cargas funciona para o exercício criado na hora', await p.evaluate(() => /60/.test(document.querySelector('#lcbox').textContent)));
  await nav(p, 'inicio'); await p.waitForTimeout(300);
  ok('H4 sessão livre conta como treino feito na semana (4 feitos; 5 treinos cadastrados depois de guardar)', /4\s*\/\s*5/.test(await txt(p, '.wkt')), await txt(p, '.wkt'));

  // ---- tudo pulado não grava
  await click(p, 'freenew'); await click(p, 'fwlib'); await p.evaluate(() => document.querySelector('#fwlist .swo').click()); await click(p, 'fwgo'); await p.waitForTimeout(200);
  await p.evaluate(() => { document.querySelector('#sheet [data-act=exmenu]').click(); document.querySelector('#sheet [data-act=exskip]').click(); });
  const n0 = await p.evaluate(() => DB.workoutHistory.length); await click(p, 'fin');
  ok('P1 com tudo pulado não grava e avisa', /ao menos uma série/.test(await txt(p, '#toast')) && await p.evaluate(() => DB.workoutHistory.length) === n0);
  await p.evaluate(() => closeModal());
  await click(p, 'freenew'); await click(p, 'fwgo');
  ok('P2 treino livre sem exercícios não abre sessão e avisa', /ao menos um exercício/.test(await txt(p, '#toast')));
  await p.evaluate(() => closeModal());


  // ---- demonstração (dados só neste navegador): o mesmo fluxo funciona sem conta
  const { p: d } = await open(b, { w: 1280, h: 900 });
  await d.click('[data-act="gdemo"]'); await d.waitForTimeout(500);
  const n1 = await d.evaluate(() => DB.workoutHistory.length);
  await d.evaluate(() => document.querySelector('[data-act=freenew]').click()); await d.waitForTimeout(150);
  await d.evaluate(() => document.querySelector('[data-act=fwlib]').click()); await d.waitForTimeout(100);
  await d.fill('#fwnew', 'Exercício de teste'); await d.evaluate(() => document.querySelector('[data-act=fwcreate]').click()); await d.waitForTimeout(150);
  await d.evaluate(() => document.querySelector('[data-act=fwgo]').click()); await d.waitForTimeout(250);
  await d.evaluate(() => { const r = document.querySelector('#sheet .sr:not(.hd)'); r.querySelector('[data-k=c]').value = 12; r.querySelector('[data-k=r]').value = 10; r.querySelector('.dn').click(); });
  await d.evaluate(() => document.querySelector('[data-act=fin]').click()); await d.waitForTimeout(400);
  const hs = await d.evaluate(() => DB.workoutHistory.slice(-1)[0]);
  ok('E1 demonstração: treino livre é gravado só localmente, sem treino cadastrado', await d.evaluate(() => DB.workoutHistory.length) === n1 + 1 && hs.workoutId === null && hs.exercises[0].exerciseName === 'Exercício de teste', hs);
  ok('E2 demonstração: abre a tela "Treino concluído"', /Treino concluído/.test(await d.evaluate(() => document.querySelector('#sheet').innerText)));
  ok('E3 a demonstração não enviou nada ao banco', (await sql("select count(*) as n from public.workout_sessions where workout_name = 'Treino livre'"))[0].n === '0' || +(await sql("select count(*) as n from public.workout_sessions where workout_name = 'Treino livre'"))[0].n === 0);
  await d.evaluate(() => closeModal()); await d.screenshot({ path: '/tmp/ft-inicio-livre-d.png' });

  // ---- celular
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ok('M1 celular: o cartão mostra Iniciar, Trocar e Treino livre e a página não rola na horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && !!document.querySelector('.feat [data-act=swapday]') && !!document.querySelector('.feat [data-act=freenew]')));
  await click(p, 'swapday'); await p.waitForTimeout(200);
  ok('M2 celular: a folha de troca cabe na tela', await p.evaluate(() => { const s = document.querySelector('#sheet').getBoundingClientRect(); return s.right <= innerWidth + 1 && s.left >= -1; }));
  await p.screenshot({ path: '/tmp/ft-troca-m.png' });
  await p.evaluate(() => closeModal());
  await click(p, 'freenew'); await click(p, 'fwlib'); await p.evaluate(() => document.querySelector('#fwlist .swo').click()); await click(p, 'fwgo'); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('#sheet [data-act=exmenu]').click());
  ok('M3 celular: sessão com menu aberto cabe na tela', await p.evaluate(() => { const s = document.querySelector('#sheet'); return s.scrollWidth <= s.clientWidth + 1; }));
  await p.screenshot({ path: '/tmp/ft-sessao-m.png' });
  await b.close(); L.summary();
})().catch(e => { console.error(e); process.exit(1); });
