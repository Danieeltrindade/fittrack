/* Início: garrafa ciano no cartão de hidratação (barra mantida) e resumo da semana com 4 nutrientes em % da meta. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle } = L;
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { p } = await open(b, { w: 1280, h: 900 });
  await L.signupAndLogin(p, 'ana@teste.invalid');
  const day = o => { const d = new Date(); d.setDate(d.getDate() - o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // dados de TESTE (conta de teste): refeições em 3 dias, 1 com meta superada; 800 ml de água hoje
  const res = await p.evaluate(async ([d0, d1, d2]) => {
    return await Store.update(d => {
      Object.assign(d.profile, { calorieGoal: 2900, proteinGoal: 160, carbGoal: 380, fatGoal: 80 });
      const mk = (date, cal, prot, carb, fat) => d.meals.push({ id: uid(), date, mealType: 'almoco', calories: cal, protein: prot, foods: [{ id: uid(), name: 'Teste', quantity: '1', calories: cal, protein: prot, carbs: carb, fat: fat }] });
      mk(d0, 1500, 80, 150, 40); mk(d1, 3500, 200, 420, 95); mk(d2, 2900, 160, 380, 80);
      (d.hydration = d.hydration || []).push({ id: uid(), date: d0, time: '08:00', amount: 800 });
    });
  }, [day(0), day(1), day(3)]);
  ok('H0 dados de teste gravados', res === true);
  void ('update ->', res, await p.evaluate(() => [DB.meals.length, (DB.hydration||[]).length, JSON.stringify(DB.meals[0]||null)]));
  await waitIdle(p); await nav(p, 'inicio'); await p.waitForTimeout(1500);
  const q = s => p.evaluate(s2 => document.querySelectorAll(s2).length, s);
  const T1 = await p.evaluate(() => ({ g: S.cfg && goals() }));

  ok('H1 cartão de hidratação continua com a barra de progresso', await q('.k-water .nutbar, .k-water [class*=bar]') >= 1 && /restantes/.test(await txt(p, '.k-water')), await txt(p, '.k-water'));
  ok('H1 garrafa no canto, dentro do cartão', await q('.hydc .hb svg.bottle') === 1);
  const bw = await p.evaluate(() => document.querySelector('.hydc .hb').getBoundingClientRect().width), bw2 = await p.evaluate(() => { const r = document.querySelector('.k-water').getBoundingClientRect(); return r.width; });
  ok('H1 garrafa é pequena (≤ 80 px) e cabe no cartão', bw > 30 && bw <= 80 && bw < bw2 / 3, [bw, bw2]);
  const col = await p.evaluate(() => { const s = document.querySelector('.hydc linearGradient stop'); return s.getAttribute('style'); });
  ok('H2 água da garrafa em ciano (--c-water), não no destaque', /--c-water/.test(col) && !/--accent/.test(col), col);
  const f = await p.evaluate(() => { const g = document.querySelector('.hydc .wg'); return [g.dataset.f, g.style.transform]; });
  ok('H3 nível da garrafa = água de hoje ÷ meta (animado até lá)', Math.abs(+f[0] - 800 / (await p.evaluate(() => waterGoal(DB)))) < .001 && /translateY/.test(f[1]), f);
  ok('H3 ondas animadas como na página Hidratação', await q('.hydc .wave') === 2);
  ok('H3 aria-label da garrafa informa o porcentual', /Garrafa de água \d+% preenchida/.test(await p.evaluate(() => document.querySelector('.hydc svg.bottle').getAttribute('aria-label'))));
  ok('H4 página Hidratação segue com a garrafa na cor de destaque', await (async () => { await nav(p, 'hidratacao'); await p.waitForTimeout(400); return /--accent/.test(await p.evaluate(() => document.querySelector('linearGradient stop').getAttribute('style'))) && await q('#hclip') === 1; })());
  await nav(p, 'inicio'); await p.waitForTimeout(600);

  ok('W1 resumo mostra 4 nutrientes juntos: 7 dias × 4 barras = 28 retângulos coloridos máx.', await q('.wkc .wkd') === 7);
  const bars = await p.evaluate(() => [...document.querySelectorAll('.wkc .wkd')].map(g => [...g.querySelectorAll('rect[fill^="var(--c-"]')].map(r => r.getAttribute('fill'))));
  const withData = bars.filter(a => a.length);
  ok('W1 cada dia com registro tem exatamente 4 barras: calorias, proteína, carboidrato, gordura', withData.length === 3 && withData.every(a => JSON.stringify(a) === JSON.stringify(['var(--c-cal)', 'var(--c-prot)', 'var(--c-carb)', 'var(--c-fat)'])), bars);
  ok('W2 dias sem registro mostram "s/ registro"', /s\/ registro|—/.test(await p.evaluate(() => document.querySelector('.wkc').textContent)));
  ok('W2 linha de meta em 100% e eixo 0/50/100%', await p.evaluate(() => { const x = document.querySelector('.wkc').textContent; return /100%/.test(x) && /50%/.test(x) && /meta/.test(x); }));
  ok('W3 acima de 100% a barra continua e fica hachurada (dia com meta superada)', await q('.wkc rect[fill^="url(#wh"]') >= 4);
  const tl = await txt(p, '.wkt');
  ok('W4 mantém treinos feitos, peso em 7 dias e as 4 médias', /treinos feitos/.test(tl) && /peso em 7 dias/.test(tl) && /média de calorias/.test(tl) && /média de proteínas/.test(tl) && /média de carboidratos/.test(tl) && /média de gorduras/.test(tl), tl);
  const avgK = await p.evaluate(() => Math.round(WeekChart.avg(WeekChart.days(), 'k')));
  ok('W4 média de calorias = média só dos dias com registro ((1500+3500+2900)/3)', avgK === Math.round((1500 + 3500 + 2900) / 3), avgK);
  // clicar no dia de ontem (3500 kcal; meta ≠ 3500): valores reais e % da meta
  const yk = day(1);
  await p.click(`.wkd[data-v="${yk}"]`); await p.waitForTimeout(200);
  const dt = await txt(p, '#wkdt'), gl = await p.evaluate(() => goals());
  ok('W5 clicar no dia mostra valores reais, meta e %', dt.includes('3.500') && dt.includes(gl.cal.toLocaleString('pt-BR')) && new RegExp(Math.round(3500 / gl.cal * 100) + '%').test(dt), dt);
  ok('W5 selecionado marcado (aria-pressed) e detalhe diz "acima" quando passou da meta', await p.evaluate(k => document.querySelector(`.wkd[data-v="${k}"]`).getAttribute('aria-pressed') === 'true', yk) && /acima/.test(dt));
  await p.focus(`.wkd[data-v="${day(3)}"]`); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('W6 teclado: Enter seleciona o dia', (await txt(p, '#wkdt')).includes('2.900'), await txt(p, '#wkdt'));
  ok('H3 garrafa continua cheia depois de interagir com o gráfico (sem redesenhar a tela)', await p.evaluate(() => /translateY\((\d+)/.test(document.querySelector('.hydc .wg').style.transform) && +RegExp.$1 < 284));
  ok('W7 sem rolagem horizontal no desktop', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: '/tmp/ft-inicio-d.png', fullPage: true });
  // celular
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(800);
  ok('W7 sem rolagem horizontal no celular (390 px)', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
  ok('W7 gráfico cabe no cartão no celular', await p.evaluate(() => { const c = document.querySelector('.wkc').getBoundingClientRect(), k = document.querySelector('.wkbox').getBoundingClientRect(); return c.right <= k.right + 1 && c.width > 250; }));
  ok('H1 no celular a garrafa continua visível ao lado do texto', await p.evaluate(() => { const r = document.querySelector('.hydc .hb').getBoundingClientRect(), c = document.querySelector('.k-water').getBoundingClientRect(); return r.right <= c.right && r.width >= 40; }));
  await p.screenshot({ path: '/tmp/ft-inicio-m.png', fullPage: true });
  // tema claro
  await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); await p.waitForTimeout(200);
  await p.screenshot({ path: '/tmp/ft-inicio-l.png', fullPage: true });
  // demo
  const { p: d } = await open(b, { w: 1280, h: 900 });
  await d.click('[data-act=gdemo]').catch(() => { }); await d.waitForTimeout(200).catch(() => { });
  await b.close(); L.done && L.done();
})().catch(e => { console.error(e); process.exit(1); });
