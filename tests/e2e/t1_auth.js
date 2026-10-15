/* Autenticação: cadastro (com confirmação por e-mail), login, logout, recuperação de senha, persistência, erros. */
const L = require('./lib'); const { ok, txt, T, open, gate } = L;
(async () => {
  const b = await L.chromium.launch(); await T.reset();
  // ---- T1 inicialização sem sessão
  let { ctx, p } = await open(b);
  ok('T1 sem sessão: mostra a tela inicial pública (app oculto)', await gate(p) && /Experimentar demonstração/.test(await txt(p, '#gate')) && /Criar conta ou entrar/.test(await txt(p, '#gate')));
  ok('T1 sem sessão: nenhum dado carregado em memória', await p.evaluate(() => Store.mode === 'none' && !DB));
  ok('T1 sem sessão: menu e conteúdo do app vazios', (await txt(p, '#main')) === '' && (await p.evaluate(() => getComputedStyle(document.querySelector('.shell')).display)) === 'none');
  ok('T1 nenhuma chamada ao banco antes de entrar', (await T.log()).filter(x => x.includes('/rpc/')).length === 0);

  // ---- T2 cadastro (com confirmação de e-mail ligada)
  await p.click('[data-act="glogin"]'); await p.click('[data-act="gsignup"]');
  await p.fill('#ge', 'ana@teste.invalid'); await p.fill('#gp', 'curta'); await p.fill('#gp2', 'curta'); await p.click('button[type=submit]');
  ok('T2 senha curta é recusada no formulário', /pelo menos 8/.test(await txt(p, '.gmsg')));
  await p.fill('#gp', 'senha-teste-123'); await p.fill('#gp2', 'senha-diferente'); await p.click('button[type=submit]');
  ok('T2 senhas diferentes são recusadas', /não são iguais/.test(await txt(p, '.gmsg')));
  await p.fill('#ge', 'email-invalido'); await p.fill('#gp2', 'senha-teste-123'); await p.click('button[type=submit]');
  ok('T2 e-mail inválido é recusado', /e-mail válido/.test(await txt(p, '.gmsg')));
  await p.fill('#ge', 'ana@teste.invalid');
  // toque duplo: um único cadastro no servidor
  await p.evaluate(() => { const f = document.querySelector('form[data-submit=gdosignup]'); f.requestSubmit(); f.requestSubmit(); });
  await p.waitForFunction(() => /Verifique seu e-mail/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T2 cadastro: tela "verifique seu e-mail" (mensagem neutra)', /Se o endereço informado puder ser cadastrado/.test(await txt(p, '#gate')));
  ok('T2 envio duplicado não cria duas contas / dois envios', (await T.log()).filter(x => x.endsWith('/__api/signup')).length === 1 && (await T.outbox()).length === 1);
  ok('T2 conta criada no banco + perfil criado pelo gatilho', JSON.stringify(await T.sql("select (select count(*) from auth.users) u, (select count(*) from public.profiles) p")) === '[{"u":1,"p":1}]');
  ok('T2 cadastro ainda não entra no app (precisa confirmar)', await gate(p) && await p.evaluate(() => Store.mode === 'none'));

  // e-mail já cadastrado: mesma resposta, sem revelar
  await p.click('[data-act="glogin"]'); await p.click('[data-act="gsignup"]');
  await p.fill('#ge', 'ana@teste.invalid'); await p.fill('#gp', 'outra-senha-123'); await p.fill('#gp2', 'outra-senha-123'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /Verifique seu e-mail/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T2 e-mail já existente: a tela é idêntica (não revela cadastro)', /Se o endereço informado puder ser cadastrado/.test(await txt(p, '#gate')));

  // ---- T3 login antes/depois da confirmação
  await p.click('[data-act="glogin"]'); await p.fill('#ge', 'ana@teste.invalid'); await p.fill('#gp', 'senha-teste-123'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /Confirme seu e-mail/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T3 login sem confirmar e-mail: orienta a confirmar', await gate(p));
  await p.fill('#gp', 'senha-errada-999'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /incorretos/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  const msgWrongPw = await txt(p, '.gmsg');
  await p.fill('#ge', 'ninguem@teste.invalid'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /incorretos/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T3 senha errada e e-mail inexistente dão a MESMA mensagem', msgWrongPw === await txt(p, '.gmsg') && /E-mail ou senha incorretos/.test(msgWrongPw));
  // clica no link do e-mail de confirmação
  const link = (await T.outbox()).find(m => m.type === 'confirm').link;
  const p2 = await ctx.newPage(); await p2.goto(L.BASE + link); await p2.close();
  await p.fill('#ge', 'ana@teste.invalid'); await p.fill('#gp', 'senha-teste-123'); await p.click('button[type=submit]');
  await p.waitForFunction(() => document.body.dataset.gate !== '1', null, { timeout: 8000 }); await p.waitForTimeout(250);
  ok('T3 após confirmar o e-mail, o login entra no app', await p.evaluate(() => Store.mode === 'personal') && /ana@teste\.invalid/.test(await txt(p, '#top')));
  ok('T3 indicador discreto da conta + botão Sair', /ana@teste\.invalid/.test(await txt(p, '#top')) && (await p.locator('#top [data-act=logout]').count()) === 1);
  ok('T3 conta nova começa vazia (nada de dados de exemplo/Daniel)', (await p.evaluate(() => DB.workouts.length + DB.meals.length + DB.foods.length)) === 0 && !/Daniel/.test(await txt(p, '#main')));
  ok('T3 sem erros no console', p.errs.length === 0, p.errs);

  // ---- T7 persistência após recarregar
  await p.reload(); await p.waitForTimeout(500);
  ok('T7 recarregar mantém a sessão e entra direto no app', !(await gate(p)) && await p.evaluate(() => Store.mode === 'personal' && Boot.email === 'ana@teste.invalid'));
  // dado salvo permanece após recarregar
  await p.evaluate(() => HydrationActions.add(iso(new Date()), '08:00', 300)); await L.waitIdle(p);
  await p.reload(); await p.waitForTimeout(500);
  ok('T7 dado salvo na nuvem volta depois de recarregar', await p.evaluate(() => DB.hydration.length === 1 && DB.hydration[0].amount === 300));

  // ---- T4 logout
  await p.evaluate(() => { window.__secret = DB.hydration[0].id; });
  await p.click('#top [data-act=logout]'); await p.waitForTimeout(400);
  ok('T4 logout volta à tela inicial pública', await gate(p) && /Experimentar demonstração/.test(await txt(p, '#gate')));
  ok('T4 logout limpa a memória (DB, estado de tela, DOM)', await p.evaluate(() => Store.mode === 'none' && !DB && document.querySelector('#main').innerHTML === '' && document.querySelector('#top').innerHTML === '' && S.view === 'inicio'));
  ok('T4 logout remove a sessão persistida', await p.evaluate(() => !localStorage.getItem('fittrack_auth')));
  await p.reload(); await p.waitForTimeout(400);
  ok('T4 após logout e reload continua na tela pública', await gate(p) && await p.evaluate(() => Store.mode === 'none'));

  // ---- T5 recuperação de senha
  await p.click('[data-act="glogin"]'); await p.click('[data-act="gforgot"]');
  await p.fill('#ge', 'ninguem@teste.invalid'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /Link enviado/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  const sentUnknown = await txt(p, '#gate'); const outN = (await T.outbox()).filter(m => m.type === 'recovery').length;
  await p.click('[data-act="glogin"]'); await p.click('[data-act="gforgot"]');
  await p.fill('#ge', 'ana@teste.invalid'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /Link enviado/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T5 recuperação: resposta idêntica para e-mail existente e inexistente', sentUnknown === await txt(p, '#gate'));
  ok('T5 e-mail de recuperação só é enviado para conta existente', outN === 0 && (await T.outbox()).filter(m => m.type === 'recovery').length === 1);
  const rl = (await T.outbox()).find(m => m.type === 'recovery').link;
  await p.goto(L.BASE + rl); await p.waitForFunction(() => /Nova senha/.test(document.querySelector('#gate')?.innerText || ''), null, { timeout: 8000 });
  ok('T5 link de recuperação abre a tela de NOVA SENHA (sem entrar no app)', await gate(p) && await p.evaluate(() => Store.mode === 'none') && !/code=/.test(p.url()), p.url());
  await p.fill('#gp', 'curta'); await p.fill('#gp2', 'curta'); await p.click('button[type=submit]');
  ok('T5 nova senha curta é recusada', /pelo menos 8/.test(await txt(p, '.gmsg')));
  await p.fill('#gp', 'senha-teste-123'); await p.fill('#gp2', 'senha-teste-123'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /diferente da atual/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T5 mesma senha da atual é recusada pelo servidor', true);
  await p.fill('#gp', 'nova-senha-456'); await p.fill('#gp2', 'nova-senha-456'); await p.click('button[type=submit]');
  await p.waitForFunction(() => document.body.dataset.gate !== '1', null, { timeout: 8000 }); await p.waitForTimeout(300);
  ok('T5 nova senha definida: entra no app com os dados da conta', await p.evaluate(() => Store.mode === 'personal' && DB.hydration.length === 1));
  await p.click('#top [data-act=logout]'); await p.waitForTimeout(300);
  await p.click('[data-act="glogin"]'); await p.fill('#ge', 'ana@teste.invalid'); await p.fill('#gp', 'senha-teste-123'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /incorretos/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T5 senha antiga deixa de funcionar', true);
  await p.fill('#gp', 'nova-senha-456'); await p.click('button[type=submit]');
  await p.waitForFunction(() => document.body.dataset.gate !== '1', null, { timeout: 8000 });
  ok('T5 senha nova funciona', await p.evaluate(() => Store.mode === 'personal'));

  // ---- erros de conexão no login
  await p.click('#top [data-act=logout]'); await p.waitForTimeout(300);
  await ctx.setOffline(true);
  await p.click('[data-act="glogin"]'); await p.fill('#ge', 'ana@teste.invalid'); await p.fill('#gp', 'nova-senha-456'); await p.click('button[type=submit]');
  await p.waitForFunction(() => /alcançar o servidor/.test(document.querySelector('#gate').innerText), null, { timeout: 5000 });
  ok('T8 login sem internet: mensagem clara, continua na tela de login', await gate(p));
  await p.click('[data-act=gdiag]'); await p.waitForFunction(() => /nem chegou ao servidor|Sem resposta/.test(document.querySelector('#gate').innerText), null, { timeout: 15000 });
  ok('T8 "Diagnosticar conexão" explica a causa quando o servidor não é alcançado', await p.evaluate(() => /Servidor/.test(document.querySelector('#gate').innerText) && /projeto pausado/.test(document.querySelector('#gate').innerText)));
  await ctx.setOffline(false);
  ok('T8 sem erros inesperados no console', p.errs.filter(e => !/diagnóstico|Failed to load resource|ERR_INTERNET/i.test(e)).length === 0, p.errs);
  await b.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
