/* Demonstração: fotos ficam no IndexedDB do navegador (nunca vão ao Storage); responsividade das telas novas; isolamento entre contas. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle, gate } = L;
const zlib = require('zlib'); const sql = q => T.sql(q);
const png = (w, h, c) => { const t = Array.from({ length: 256 }, (_, n) => { let x = n; for (let k = 0; k < 8; k++) x = x & 1 ? 0xEDB88320 ^ (x >>> 1) : x >>> 1; return x >>> 0; });
  const crc = b => { let x = 0xFFFFFFFF; for (const y of b) x = t[(x ^ y) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  const ch = (a, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(a), d]); const k = Buffer.alloc(4); k.writeUInt32BE(crc(td)); return Buffer.concat([l, td, k]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = (c[2] + x) & 255; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]); };
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { ctx, p } = await open(b);
  await p.click('[data-act="gdemo"]'); await p.waitForTimeout(500);
  ok('D1 demonstração aberta sem cadastro', !(await gate(p)) && await p.evaluate(() => Store.mode === 'demo'));
  await nav(p, 'dieta'); await p.evaluate(() => { document.querySelector('[data-act=dtab][data-v=alimentos]').click(); }); await p.waitForTimeout(150);
  await click(p, 'libnew'); await p.fill('#ln', 'Aveia demo'); await p.fill('#lp', '40'); await p.fill('#lk', '150'); await p.fill('#lpr', '5'); await p.fill('#lc', '27'); await p.fill('#lg', '3');
  await p.setInputFiles('#phfile', { name: 'a.png', mimeType: 'image/png', buffer: png(80, 60, [10, 120, 200]) }); await p.waitForSelector('#phbox img', { timeout: 8000 });
  await click(p, 'libsave'); await p.waitForTimeout(500);
  ok('D2 demo: foto NÃO foi enviada ao Storage nem ao banco', (await L.call('GET', '/__test/files')).length === 0 && (await sql('select count(*) c from public.foods'))[0].c === 0);
  const ref = await p.evaluate(() => (DB.foods.find(f => f.name === 'Aveia demo') || {}).photo);
  ok('D3 demo: referência da foto guardada no documento local e a imagem no IndexedDB', !!ref && await p.evaluate(async r => { try { const u = await Photos.url(r); return typeof u === 'string' && u.length > 10; } catch (e) { return String(e); } }, ref), ref);
  await p.reload(); await p.waitForTimeout(900);
  if (await gate(p)) { await p.click('[data-act="gdemo"]'); await p.waitForTimeout(500); }
  await nav(p, 'dieta'); await p.evaluate(() => document.querySelector('[data-act=dtab][data-v=alimentos]').click()); await p.waitForTimeout(500);
  ok('D4 demo: foto continua visível após recarregar a página', await p.evaluate(() => { const i = document.querySelector('.lib img'); return !!i && i.complete && i.naturalWidth > 0; }));
  if (await gate(p)) { await p.click('[data-act="gdemo"]'); await p.waitForTimeout(600); } await p.waitForFunction(() => document.querySelector('#side [data-v=dieta]'), null, { timeout: 8000 }); await nav(p, 'config');
  ok('D5 demo: sem exportar/importar (só dados fictícios; foto fica somente no navegador)', await p.evaluate(() => !document.querySelector('[data-act=exp]') && !document.querySelector('[data-act=imp]')));
  ok('D6 demo: nenhum erro no console', p.errs.length === 0, p.errs);

  // ---- T14 responsividade das telas novas (conta pessoal, dados do próprio teste)
  const { p: q } = await open(b, { w: 1280, h: 900 });
  await L.signupAndLogin(q, 'dora@teste.invalid');
  await q.evaluate(async () => { await DietActions.saveLibFood({ name: 'Banana', portion: 100, unit: 'g', calories: 89, protein: 1.1, carbs: 23, fat: 0.3 }); });
  await waitIdle(q);
  await q.evaluate(async () => { const f = DB.foods[0]; await MealActions.save({ name: 'Lanche', category: 'lanche', photo: null, items: [{ id: uid(), foodId: f.id, name: f.name, amount: 200, unit: f.unit, ...DietActions.calc(f, 200) }] }); });
  await waitIdle(q);
  for (const [w, h] of [[390, 800], [820, 1100], [1280, 900]]) {
    await q.setViewportSize({ width: w, height: h });
    for (const [v, tab] of [['inicio'], ['dieta', 'dia'], ['dieta', 'alimentos'], ['dieta', 'refeicoes'], ['dieta', 'fotos'], ['treinos'], ['progresso'], ['config']]) {
      await nav(q, v); if (tab) await q.evaluate(t => document.querySelector(`[data-act=dtab][data-v=${t}]`).click(), tab); await q.waitForTimeout(150);
      const o = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      ok(`T14 ${w}px · ${v}${tab ? '/' + tab : ''}: sem rolagem horizontal`, o.sw <= o.cw + 1, o);
    }
    await q.evaluate(() => document.querySelector('[data-act=dtab][data-v=refeicoes]') || 0);
  }
  ok('T15 nenhum erro no console nas telas novas', q.errs.length === 0, q.errs);

  // isolamento: outra conta não enxerga fotos nem refeições salvas
  const { p: r } = await open(b); await L.signupAndLogin(r, 'edu@teste.invalid');
  ok('T12 outra conta começa sem alimentos, refeições salvas nem fotos', await r.evaluate(() => DB.foods.length === 0 && DB.savedMeals.length === 0));
  await b.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
