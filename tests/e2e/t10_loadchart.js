/* Gráfico de evolução de carga e repetições: todas as séries, gradiente de desempenho, 5 paletas escolhíveis na hora. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle } = L;
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { ctx, p } = await open(b);
  await L.signupAndLogin(p, 'lia@teste.invalid');
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() - o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // sessões de TESTE (conta de teste): carga e repetições livres por série; 4ª sessão com cargas diferentes entre as séries
  const SESS = [[16, [[55, 12], [55, 12], [55, 11]]], [12, [[55, 12], [55, 12], [55, 12]]], [8, [[70, 10], [70, 10], [70, 9]]], [4, [[70, 10], [70, 9], [65, 8]]], [0, [[70, 12], [70, 11], [70, 10]]]];
  await p.evaluate(async ([S0, ds]) => {
    await Store.update(d => { const wid = uid(), eid = uid(); d.workouts.push({ id: wid, name: 'Peito', days: [1], exercises: [{ id: eid, name: 'Crucifixo', sets: 3 }] }); S0.forEach(([o, sets], i) => d.workoutHistory.push({ id: uid(), date: ds[i], workoutId: wid, workoutName: 'Peito', notes: '', exercises: [{ exerciseId: eid, exerciseName: 'Crucifixo', note: '', sets: sets.map((s, k) => ({ setNumber: k + 1, load: s[0], reps: s[1], completed: true })) }] })); });
  }, [SESS, SESS.map(s => day(s[0]))]);
  await waitIdle(p);
  await p.evaluate(() => { S.ex = 'Crucifixo'; });
  await nav(p, 'progresso'); await p.waitForTimeout(300);
  const q = s => p.evaluate(s2 => document.querySelectorAll(s2).length, s);

  ok('G1 gráfico novo substitui o antigo: um ponto clicável por sessão (5)', await q('#lcbox .lcpt') === 5);
  ok('G2 trilha mostra TODAS as séries: 15 pílulas (5 sessões × 3 séries)', await p.evaluate(() => document.querySelectorAll('#lcbox .lcpt rect[width][height="24"], #lcbox .lcpt rect[height="22"]').length) === 15);
  const reps = await p.evaluate(() => [...document.querySelectorAll('#lcbox .lcpt')].map(g => [...g.querySelectorAll('text')].filter(t => /^\d+/.test(t.textContent) && !t.textContent.includes('%')).map(t => parseInt(t.childNodes[0].textContent))));
  ok('G2 as repetições de cada série aparecem exatamente como registradas', JSON.stringify(reps) === JSON.stringify([[12, 12, 11], [12, 12, 12], [10, 10, 9], [10, 9, 8], [12, 11, 10]]), reps);
  ok('G3 por padrão a sessão mais recente fica selecionada, com séries, total de repetições e maior carga', /33/.test(await txt(p, '.lcd')) && /3\s*séries/.test(await txt(p, '.lcd')) && /70 kg/.test(await txt(p, '.lcd')), await txt(p, '.lcd'));
  await p.click(`#lcbox .lcpt[data-v="${await p.evaluate(() => LoadChart.sessions('Crucifixo')[3].d)}"]`); await p.waitForTimeout(150);
  const dtx = await txt(p, '.lcd');
  ok('G3 ao selecionar uma data: carga e repetições de cada série (cargas diferentes entre séries)', /70 kg/.test(dtx) && /65 kg/.test(dtx) && /27/.test(dtx) && /Série 3/.test(dtx), dtx);
  const cl = await p.evaluate(() => LoadChart.sessions('Crucifixo').map(o => o.cls));
  ok('G4 classificação: primeira · estável · evolução (55→70 kg com menos reps) · queda leve · evolução', JSON.stringify(cl) === JSON.stringify(['first', 'flat', 'up', 'down', 'up']), cl);
  ok('G4 subir a carga com menos repetições NÃO é queda', cl[2] === 'up');
  ok('G4 sem dados inventados: a 1ª sessão e séries sem par ficam neutras', await p.evaluate(() => { const o = LoadChart.sessions('Crucifixo'); return o[0].delta === null && o[0].prev === null; }));
  ok('G5 linha em gradiente com 5 paradas de cor e marcadores por tipo', await q('#lcg stop') === 5 && await q('#lcbox .lcpt g path, #lcbox .lcpt g circle') >= 5);
  const sw = await q('.lcp'); ok('G6 existem as 5 paletas para escolher na hora', sw === 5);
  const seen = new Set();
  for (const k of ['a', 'b', 'c', 'd', 'e']) {
    await p.click(`.lcp[data-v="${k}"]`); await p.waitForTimeout(120);
    const r = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return [document.documentElement.dataset.pal, cs.getPropertyValue('--lc-up').trim(), cs.getPropertyValue('--lc-flat').trim(), cs.getPropertyValue('--lc-down').trim(), document.querySelector('.lcp[aria-pressed=true]').dataset.v, document.querySelector('#lcg stop').getAttribute('style')]; });
    seen.add(r.slice(1, 4).join('|'));
    ok(`G6 paleta ${k}: aplicada ao gráfico inteiro, marcada como ativa`, r[0] === k && r[4] === k && r[1] && r[2] && r[3], r);
  }
  ok('G6 as 5 paletas têm cores diferentes entre si', seen.size === 5, [...seen]);
  await p.click('.lcp[data-v="c"]'); await p.reload(); await p.waitForTimeout(700); await nav(p, 'progresso'); await p.waitForTimeout(250);
  ok('G7 a paleta escolhida continua após recarregar', await p.evaluate(() => document.documentElement.dataset.pal === 'c' && document.querySelector('.lcp[aria-pressed=true]').dataset.v === 'c'));
  await p.click('.lcg input'); await p.waitForTimeout(150);
  ok('G7 símbolos ▲ ● ▼ opcionais nas séries', /[▲▼]/.test(await p.evaluate(() => document.querySelector('#lcbox svg').textContent)) && await p.evaluate(() => JSON.parse(localStorage.getItem('fittrack_chartpal')).glyph === true));
  ok('G8 a escolha de paleta é só preferência do aparelho (nenhuma coluna nova no banco)', (await T.sql("select count(*)::int c from information_schema.columns where table_schema='public' and column_name ilike '%pal%'"))[0].c === 0);
  // tema claro e escuro
  await nav(p, 'config'); await click(p, 'theme', 'light'); await waitIdle(p); await nav(p, 'progresso'); await p.waitForTimeout(200);
  const lightUp = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lc-up').trim());
  await nav(p, 'config'); await click(p, 'theme', 'dark'); await waitIdle(p); await nav(p, 'progresso'); await p.waitForTimeout(200);
  const darkUp = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lc-up').trim());
  ok('G9 cores da paleta se ajustam ao tema claro e ao escuro', lightUp && darkUp && lightUp !== darkUp, [lightUp, darkUp]);
  // período
  await click(p, 'range', '7'); await p.waitForTimeout(200);
  ok('G10 filtro de 7 dias: só as 2 sessões recentes; variação calculada sobre o histórico completo', await q('#lcbox .lcpt') === 2 && /\+/.test(await txt(p, '.lcd')), await txt(p, '.lcd'));
  await click(p, 'range', '0');
  // responsivo
  for (const [w, h] of [[390, 800], [820, 1100], [1280, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(250);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, pills: document.querySelectorAll('#lcbox .lcpt').length }));
    ok(`G11 ${w}px: sem rolagem horizontal e gráfico presente`, o.sw <= o.cw + 1 && o.pills === 5, o);
  }
  // teclado
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.evaluate(() => document.querySelectorAll('#lcbox .lcpt')[1].focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok('G12 seleção por teclado (Enter) funciona', await p.evaluate(() => document.querySelector('.lcpt[aria-pressed=true]').dataset.v) === await p.evaluate(() => LoadChart.sessions('Crucifixo')[1].d));
  // exercício sem histórico / vazio
  await p.evaluate(() => { S.lcSel = 'x'; });
  ok('G13 nenhum erro no console', p.errs.length === 0, p.errs);
  await b.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
