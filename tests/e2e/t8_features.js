/* Melhorias: metas por objetivo + excesso, biblioteca, refeições salvas, fotos (Storage de teste), exercício renomeado, backup com fotos. */
const L = require('./lib'); const { ok, txt, T, open, click, nav, waitIdle, today } = L;
const zlib = require('zlib'); const sql = q => T.sql(q);
function png(w, h, rgb) {      // PNG válido gerado na hora (nenhuma imagem real do usuário)
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = (rgb[2] + x) & 255; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}
const IMG = (c) => ({ name: 'foto.png', mimeType: 'image/png', buffer: png(96, 72, c) });
const files = async () => (await L.call('GET', '/__test/files')).map(x => x.replace(/^food-photos\//, ''));
(async () => {
  const b = await L.chromium.launch(); await T.reset(); await T.flags({ requireConfirm: false });
  const { ctx, p } = await open(b);
  await L.signupAndLogin(p, 'caio@teste.invalid');
  const uid = (await sql("select id from auth.users where email='caio@teste.invalid'"))[0].id;
  const q1 = async q => { const r = await sql(q); return r[0] ? Object.values(r[0])[0] : null; };
  const ev = (f, a) => p.evaluate(f, a);

  // ---- T6/T7 metas por objetivo e valores acima da meta
  const E = await ev(() => ({
    rest: evalNutrient('cal', 2340, 3000, 'maintain'), over: evalNutrient('cal', 3400, 3000, 'lose'),
    gainOver: evalNutrient('cal', 3200, 3000, 'gain'), loseProt: evalNutrient('prot', 260, 160, 'lose'), loseCarb: evalNutrient('carb', 400, 250, 'lose'),
    hit: evalNutrient('cal', 3000, 3000, 'maintain'), bar: nutBar(evalNutrient('cal', 3400, 3000, 'lose')), barIn: nutBar(evalNutrient('cal', 1500, 3000, 'lose'))
  }));
  ok('T7 "2.340 / 3.000 — 660 kcal restantes"', E.rest.left === 660 && /660 kcal restantes/.test(E.rest.text) && E.rest.pct === 78, E.rest);
  ok('T7 "3.400 / 3.000 — 400 kcal acima da meta" (excesso mostrado, % acima de 100)', E.over.over === 400 && /400 kcal acima da meta/.test(E.over.text) && E.over.pct === 113, E.over);
  ok('T6 meta atingida é indicada', E.hit.reached && /Meta atingida/.test(E.hit.text));
  ok('T6 emagrecimento: passar da meta de calorias pede atenção; ganho de massa: excesso pequeno é esperado', E.over.tone === 'warn' && E.gainOver.tone === 'over', [E.over.tone, E.gainOver.tone]);
  ok('T6 passar da proteína NUNCA é tratado como alerta (nem no emagrecimento)', E.loseProt.tone === 'over' && E.loseProt.over === 100, E.loseProt);
  ok('T7 barra NÃO é limitada a 100%: trecho de excesso desenhado e marca da meta', /class="ex t-warn"/.test(E.bar) && /class="tk"/.test(E.bar) && !/class="ex/.test(E.barIn), E.bar);
  const widths = [...E.bar.matchAll(/width:([\d.]+)%/g)].map(m => +m[1]);
  ok('T7 barra: parte dentro + excesso = 100% da trilha (escala = max(consumo, meta))', Math.abs(widths[0] + widths[1] - 100) < 0.05 && widths[1] > 10, widths);

  // configurações: trocar objetivo NÃO muda metas ativas sem confirmação
  await nav(p, 'config');
  await p.fill('#cp', '80'); await p.fill('#cc', '2500'); await p.fill('#cr', '150'); await click(p, 'savecfg'); await waitIdle(p);
  await p.fill('#pc-lose-cal', '2000'); await p.fill('#pc-lose-prot', '170'); await p.fill('#pc-lose-carb', '200'); await p.fill('#pc-lose-fat', '60');
  await click(p, 'pssave', 'lose'); await waitIdle(p);
  let pr = (await sql(`select goal_type, calorie_goal c, goal_presets gp from public.profiles where user_id='${uid}'`))[0];
  ok('T6 metas do objetivo "emagrecimento" guardadas na conta sem alterar as metas ativas', pr.c === 2500 && pr.gp.lose.cal === 2000 && pr.gp.lose.prot === 170, pr);
  await click(p, 'gtsel', 'lose'); await p.fill('#cp', '80'); await p.fill('#ctw', '70'); await p.fill('#cadj', '-500'); await click(p, 'savecfg'); await waitIdle(p);
  ok('T6 trocar o objetivo pergunta antes de aplicar as metas salvas', /Usar as metas de/.test(await txt(p, '#sheet')), await txt(p, '#sheet'));
  ok('T6 enquanto não confirma, as metas ativas continuam as mesmas', await q1(`select calorie_goal from public.profiles where user_id='${uid}'`) === 2500);
  await click(p, 'psapply', 'lose'); await waitIdle(p);
  pr = (await sql(`select goal_type gt, calorie_goal c, protein_goal pr, carb_goal cb, fat_goal f, target_weight::float tw, calorie_adjust adj from public.profiles where user_id='${uid}'`))[0];
  ok('T6 após confirmar: metas do emagrecimento aplicadas; peso desejado e déficit salvos', pr.gt === 'lose' && pr.c === 2000 && pr.pr === 170 && pr.cb === 200 && pr.f === 60 && pr.tw === 70 && pr.adj === -500, pr);

  // ---- T1/T2/T12 biblioteca com foto
  await nav(p, 'dieta'); await click(p, 'dtab', 'alimentos'); await click(p, 'libnew');
  await p.fill('#ln', 'Frango grelhado'); await p.fill('#lp', '100'); await p.fill('#lk', '165'); await p.fill('#lpr', '31'); await p.fill('#lc', '0'); await p.fill('#lg', '3.6');
  await p.setInputFiles('#phfile', IMG([200, 80, 40])); await p.waitForSelector('#phbox img', { timeout: 8000 });
  ok('T2 prévia da foto aparece antes de salvar', await ev(() => !!document.querySelector('#phbox img')));
  ok('T2 nada foi enviado ao Storage antes de salvar', (await files()).length === 0);
  await click(p, 'libsave'); await waitIdle(p);
  let f1 = (await sql(`select id, photo_path from public.foods where user_id='${uid}' and name='Frango grelhado'`))[0];
  ok('T2 alimento com foto: arquivo enviado ao Storage e referência gravada no banco', f1 && f1.photo_path && f1.photo_path.startsWith(uid + '/') && (await files()).length === 1, f1);
  await p.reload(); await p.waitForTimeout(900); await nav(p, 'dieta'); await click(p, 'dtab', 'alimentos'); await p.waitForTimeout(400);
  ok('T12 foto continua visível após recarregar (URL assinada)', await ev(() => { const i = document.querySelector('.lib img'); return !!i && /^(https?:|blob:|data:)/.test(i.src) && i.complete && i.naturalWidth > 0; }));
  // substituir
  await p.locator('.lib [data-act=libedit]').first().click(); await p.setInputFiles('#phfile', IMG([20, 160, 90])); await p.waitForTimeout(500);
  await click(p, 'libsave'); await waitIdle(p);
  const f2 = (await sql(`select photo_path from public.foods where user_id='${uid}' and name='Frango grelhado'`))[0];
  ok('T2 substituir a foto: caminho novo, arquivo antigo apagado do Storage', f2.photo_path !== f1.photo_path && (await files()).length === 1 && !(await files()).includes(f1.photo_path), [f1, f2, await files()]);
  // falha de upload não grava nada
  await T.flags({ storageFail: true });
  await p.locator('.lib [data-act=libedit]').first().click(); await p.fill('#lk', '777'); await p.setInputFiles('#phfile', IMG([1, 2, 3])); await p.waitForTimeout(500);
  await click(p, 'libsave'); await waitIdle(p); await p.waitForTimeout(300);
  ok('T2 falha no envio da foto: alimento NÃO é salvo pela metade e o aviso aparece', await q1(`select calories::float from public.foods where user_id='${uid}' and name='Frango grelhado'`) === 165 && /NÃO foi salv|não foi salv/i.test(await ev(() => document.body.innerText)));
  await T.flags({ storageFail: false });
  await click(p, 'close');
  // remover
  await p.locator('.lib [data-act=libedit]').first().click(); await click(p, 'phrm'); await click(p, 'libsave'); await waitIdle(p);
  ok('T2 remover a foto: referência nula e arquivo apagado do Storage', await q1(`select photo_path from public.foods where user_id='${uid}' and name='Frango grelhado'`) === null && (await files()).length === 0, await files());
  // proporcional por gramas
  await click(p, 'dtab', 'dia'); await click(p, 'meal', 'almoco'); await p.fill('#la', '150');
  ok('T5 150 g de frango (100 g = 165 kcal) → 247,5 kcal', /247[,.]5|248/.test(await txt(p, '#lprev')), await txt(p, '#lprev'));
  await click(p, 'saveL'); await waitIdle(p);
  ok('T5 refeição do diário gravada com 247,5 kcal e 46,5 g de proteína', await q1(`select calories::float from public.meal_items where user_id='${uid}'`) === 247.5 && await q1(`select protein::float from public.meal_items where user_id='${uid}'`) === 46.5);

  // ---- T3/T4 refeições salvas
  await ev(() => window.__x = 0);
  await p.evaluate(async () => { await DietActions.saveLibFood({ name: 'Arroz branco', portion: 100, unit: 'g', calories: 130, protein: 2.5, carbs: 28, fat: 0.3 }); });
  await waitIdle(p);
  await click(p, 'dtab', 'refeicoes'); await click(p, 'smnew');
  await p.fill('#smn', 'Almoço padrão');
  const selFood = async (name, amt) => { await p.fill('#smq2', name.slice(0, 4)); const v = await ev(n => { const o = [...document.querySelectorAll('#smf option')].find(x => x.textContent.includes(n)); return o && o.value; }, name); await p.selectOption('#smf', v); await p.fill('#sman', String(amt)); await click(p, 'smaddit'); };
  await selFood('Frango', 150); await selFood('Arroz', 200);
  ok('T3 total da refeição = soma dos itens (247,5 + 260 = 507,5 kcal)', /507[,.]5|508/.test(await txt(p, '#smtot')), await txt(p, '#smtot'));
  await p.setInputFiles('#phfile', IMG([60, 90, 200])); await p.waitForSelector('#phbox img', { timeout: 8000 });
  await click(p, 'smsave'); await waitIdle(p);
  const sm = (await sql(`select id, name, photo_path from public.saved_meals where user_id='${uid}'`))[0];
  const smi = await sql(`select name, amount::float a, calories::float k, protein::float p from public.saved_meal_items where user_id='${uid}' order by position`);
  ok('T3 refeição personalizada com foto e 2 itens gravada na conta', sm && sm.photo_path && smi.length === 2 && smi[0].k === 247.5 && smi[1].k === 260, [sm, smi]);
  // 1 clique
  const dayK = async () => await q1(`select coalesce(sum(calories),0)::float from public.meal_items where user_id='${uid}'`);
  const before = await dayK();
  await p.locator('.smc [data-act=smadd]').first().click(); await waitIdle(p); await p.waitForTimeout(200);
  const after = await dayK();
  ok('T4 um clique adiciona a refeição inteira: +507,5 kcal, sem contar duas vezes', after - before === 507.5 && await q1(`select count(*) from public.meal_items where user_id='${uid}'`) === 3, [before, after]);
  await click(p, 'dtab', 'dia');
  ok('T4 totais do dia = soma exata dos itens do diário (sem contagem dupla)', await ev(() => { const T = tot(), items = DB.meals.filter(m => m.date === S.date).flatMap(m => m.foods); return Math.abs(T.k - items.reduce((a, f) => a + f.calories, 0)) < 0.01 && T.k > 0; }));
  // ajustar quantidades
  await click(p, 'dtab', 'refeicoes'); await p.locator('.smc [data-act=smadj]').first().click();
  await p.fill('#saa0', '100'); await p.fill('#saa1', '0');
  ok('T4 ajustar: total recalculado na hora (100 g de frango = 165 kcal)', /165/.test(await txt(p, '#satot')), await txt(p, '#satot'));
  await click(p, 'saok'); await waitIdle(p);
  ok('T4 só o item com quantidade > 0 entra no diário (165 kcal), os demais ficam de fora', await dayK() - after === 165 && await q1(`select count(*) from public.meal_items where user_id='${uid}'`) === 4);
  ok('T4 itens do diário não alteram a refeição salva (modelo intacto)', await q1(`select sum(calories)::float from public.saved_meal_items where user_id='${uid}'`) === 507.5);
  // favorito, duplicar, editar, excluir
  await click(p, 'dtab', 'refeicoes'); await p.locator('.smc [data-act=smfav]').first().click(); await waitIdle(p);
  await p.locator('.smc [data-act=smdup]').first().click(); await waitIdle(p);
  ok('T3 favoritar e duplicar: 2 refeições salvas, 1 favorita; cópia mantém itens', await q1(`select count(*) from public.saved_meals where user_id='${uid}'`) === 2 && await q1(`select count(*) from public.saved_meals where user_id='${uid}' and favorite`) === 1 && await q1(`select count(*) from public.saved_meal_items where user_id='${uid}'`) === 4);
  ok('T3 a cópia reaproveita a foto (um só arquivo no Storage, sem duplicar)', (await files()).length === 1, await files());
  await p.locator('.smc [data-act=smedit]').first().click(); await p.fill('#smn', 'Almoço (editado)'); await p.fill('#sma0', '300');
  await click(p, 'smsave'); await waitIdle(p);
  ok('T3 editar refeição salva: nome e quantidade proporcional atualizados no banco', await q1(`select count(*) from public.saved_meals where user_id='${uid}' and name='Almoço (editado)'`) === 1 && await q1(`select max(calories)::float from public.saved_meal_items where user_id='${uid}'`) === 495);
  const names = await sql(`select name from public.saved_meals where user_id='${uid}' order by name`);
  await p.locator('.smc [data-act=smdel]').first().click(); await click(p, 'smdelok'); await waitIdle(p);
  ok('T3 excluir refeição salva remove a refeição e seus itens, sem mexer no diário', await q1(`select count(*) from public.saved_meals where user_id='${uid}'`) === 1 && await q1(`select count(*) from public.meal_items where user_id='${uid}'`) === 4 && (await files()).length === 1, [names, await files()]);
  ok('T12 foto ainda usada por outro registro NÃO é apagada ao excluir uma refeição salva', (await files()).length === 1);
  // foto da refeição no diário + galeria/histórico
  await click(p, 'dtab', 'dia'); await p.locator('[data-act=mph][data-v=almoco]').first().click(); await p.setInputFiles('#phfile', IMG([240, 200, 20])); await p.waitForTimeout(700); await click(p, 'mphsave'); await waitIdle(p);
  ok('T2 foto da refeição do dia gravada e ligada à data', await q1(`select count(*) from public.meals where user_id='${uid}' and photo_path is not null and meal_date=current_date`) === 1);
  await click(p, 'dtab', 'fotos'); await p.waitForTimeout(500);
  ok('T2 histórico de fotos mostra as imagens com a data', await ev(() => document.querySelectorAll('main img').length >= 1 && /\d/.test(document.querySelector('main').innerText)));

  // ---- T8/T9 renomear exercício preserva histórico
  await nav(p, 'treinos');
  await click(p, 'new'); await p.fill('#en', 'Treino X');
  await p.locator('#sheet [name=n]').first().fill('Supnio reto'); await p.locator('#sheet [name=s]').first().fill('3'); await click(p, 'saveT'); await waitIdle(p);
  await p.click('.wk:first-child [data-act=reg]'); const e0 = p.locator('#sheet .eb').first();
  await e0.locator('[data-k=c]').nth(0).fill('60'); await e0.locator('[data-k=r]').nth(0).fill('10'); await e0.locator('.dn').nth(0).click(); await click(p, 'fin'); await waitIdle(p);
  const exId = await q1(`select id from public.workout_exercises where user_id='${uid}'`);
  await nav(p, 'treinos'); await p.selectOption('[data-chg=ex]', 'Supnio reto'); await click(p, 'exedit');
  await p.fill('#xen', 'Supino reto'); await p.fill('#xeg', 'Peito'); await p.fill('#xed', 'Barra, pegada média'); await click(p, 'exsave'); await waitIdle(p);
  const ex = (await sql(`select id, name, muscle_group g, description d from public.workout_exercises where user_id='${uid}'`))[0];
  ok('T8 nome corrigido no treino, mesmo ID; grupo muscular e descrição salvos', ex.id === exId && ex.name === 'Supino reto' && ex.g === 'Peito' && ex.d === 'Barra, pegada média', ex);
  const se = (await sql(`select x.exercise_name n, x.exercise_id is not null linked, t.load::float l, t.reps r from public.session_exercises x join public.session_sets t on t.session_exercise_id=x.id and t.user_id=x.user_id where x.user_id='${uid}'`))[0];
  ok('T9 histórico de sessões renomeado junto, com carga/repetições intactas e vínculo ao exercício', se && se.n === 'Supino reto' && se.linked && se.l === 60 && se.r === 10, se);
  ok('T9 progressão de carga continua no exercício renomeado (tela)', /Supino reto/.test(await txt(p, 'main')) && !/Supnio/.test(await txt(p, 'main')));

  // ---- T11/T12 backup com fotos: exportar → apagar → importar
  await nav(p, 'config');
  const [dl] = await Promise.all([p.waitForEvent('download'), click(p, 'exp')]); await dl.saveAs('/tmp/ft-bk-photos.json');
  const raw = L.fs.readFileSync('/tmp/ft-bk-photos.json', 'utf8'), bk = JSON.parse(raw);
  ok('T11 backup inclui as fotos (data-URL JPEG) e as refeições salvas', bk.photos && Object.keys(bk.photos).length >= 2 && Object.values(bk.photos).every(v => /^data:image\/jpeg;base64,/.test(v)) && bk.savedMeals.length === 1, Object.keys(bk));
  ok('T11 backup não vaza caminhos do Storage, user_id, tokens nem e-mail', !new RegExp(uid + '|user_id|access_token|refresh_token|caio@teste').test(raw));
  const cnt = async () => [await q1(`select count(*) from public.meals where user_id='${uid}'`), await q1(`select count(*) from public.saved_meals where user_id='${uid}'`), await q1(`select count(*) from public.foods where user_id='${uid}'`), await q1(`select count(*) from public.workout_sessions where user_id='${uid}'`)];
  const c0 = JSON.stringify(await cnt());
  await click(p, 'wipe'); await click(p, 'wipeok'); await waitIdle(p); await p.waitForTimeout(300);
  ok('T11 apagar a conta limpa dados e deixa o Storage sem órfãos', await q1(`select count(*) from public.meal_items where user_id='${uid}'`) === 0);
  await click(p, 'imp'); await p.fill('#tx', raw); await click(p, 'impok'); await p.waitForTimeout(300); await click(p, 'impgo'); await waitIdle(p); await p.waitForTimeout(800);
  ok('T11 importar restaura refeições, refeições salvas, alimentos e sessões', JSON.stringify(await cnt()) === c0, [c0, await cnt()]);
  const ph = await sql(`select 'food' k, photo_path from public.foods where user_id='${uid}' and photo_path is not null union all select 'smeal', photo_path from public.saved_meals where user_id='${uid}' and photo_path is not null union all select 'meal', photo_path from public.meals where user_id='${uid}' and photo_path is not null`);
  const fl = await files();
  ok('T12 fotos restauradas: reenviadas ao Storage da conta e ligadas aos mesmos registros', ph.length === 2 && ph.every(r => r.photo_path.startsWith(uid + '/') && fl.includes(r.photo_path)), [ph, fl]);
  await nav(p, 'dieta'); await click(p, 'dtab', 'refeicoes'); await p.waitForTimeout(600);
  ok('T12 foto da refeição salva visível após a restauração', await ev(() => { const i = document.querySelector('.smc img'); return !!i && i.complete && i.naturalWidth > 0; }));

  // ---- T10 gráficos / T13 tema / T15 console
  for (const v of ['inicio', 'progresso']) {
    await nav(p, v); await p.waitForTimeout(300);
    ok(`T10 tela "${v}": gráficos desenhados com legenda`, await ev(() => document.querySelectorAll('main svg').length >= 1 && !!document.querySelector('main .leg, main .lg, main figcaption, main .legend, main [class*=leg]')), v);
  }
  await nav(p, 'inicio');
  ok('T10 dashboard: 4 cartões de macros com cores próprias (cal/prot/gordura/carbo)', await ev(() => ['k-cal', 'k-prot', 'k-fat', 'k-carb'].every(c => !!document.querySelector('main .' + c))));
  const cols = await ev(() => ['cal', 'prot', 'fat', 'carb', 'water', 'wk'].map(k => getComputedStyle(document.documentElement).getPropertyValue('--c-' + k).trim() || getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim()));
  ok('T13 variáveis de cor dos nutrientes definidas', cols.filter(Boolean).length >= 4, cols);
  const bgs = [];
  for (const t of ['light', 'dark']) { await nav(p, 'config'); await click(p, 'theme', t); await waitIdle(p); bgs.push(await ev(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.panel')).backgroundColor])); await nav(p, 'inicio'); await p.waitForTimeout(150); }
  ok('T13 tema claro e escuro mudam de fato o fundo e voltam', bgs[0][0] === 'light' && bgs[1][0] === 'dark' && bgs[0][1] !== bgs[1][1], bgs);
  ok('T15 nenhum erro no console durante todo o fluxo', p.errs.length === 0, p.errs);
  await b.close();
  process.exit(L.summary() ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
