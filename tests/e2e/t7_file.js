const L = require('./lib');
(async () => {
  const b = await L.chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|fonts/.test(m.text())) errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.route(/fonts\.|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + L.path.resolve(__dirname, '../../index.html')); await p.waitForTimeout(500);
  L.ok('file://: tela inicial aparece e conta fica indisponível (config vazio / sem CDN)', await p.evaluate(() => document.body.dataset.gate === '1' && document.querySelector('[data-act=glogin]').disabled));
  await p.click('[data-act=gdemo]'); await p.waitForTimeout(400);
  L.ok('file://: demonstração funciona aberta direto do disco', await p.evaluate(() => Store.mode === 'demo' && DB.workouts.length === 4));
  for (const v of ['treinos', 'dieta', 'progresso', 'hidratacao', 'config']) await L.nav(p, v);
  L.ok('file://: sem erros no console', errs.length === 0, errs);
  await b.close(); process.exit(L.summary() ? 1 : 0);
})();
