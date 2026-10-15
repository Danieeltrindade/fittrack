/* backup.js — exportar/importar arquivo .json da PRÓPRIA conta: validação completa antes de tocar no banco, confirmação,
   importação transacional (uma chamada = uma transação) e conferência. O arquivo nunca carrega senha, token, chave do
   Supabase nem identidade: a propriedade dos dados vem sempre da sessão logada, nunca do arquivo. */
let PENDING = null;
function validateBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return { err: 'o arquivo está vazio' };
  let o; try { o = JSON.parse(text); } catch (e) { return { err: 'o conteúdo não é um JSON válido (arquivo corrompido ou de outro tipo)' }; }
  if (!isO(o)) return { err: 'o JSON não tem a estrutura de um backup do FitTrack' };
  // identidade e credenciais não pertencem a um backup: recusa em vez de ignorar (evita importar dados "de outra conta")
  const FORBID = /^(user_?id|owner(_?id)?|account(_?id)?|email|password|senha|access_?token|refresh_?token|token|api_?key|apikey|secret|service_?role|supabase.*)$/i;
  const scan = (x, d) => { if (d > 8 || !x || typeof x !== 'object') return null; for (const k of Object.keys(x)) { if (FORBID.test(k)) return k; const r = scan(x[k], d + 1); if (r) return r; } return null; };
  const forb = scan(o, 0); if (forb) return { err: `o arquivo contém o campo "${forb}" (identificação de conta ou credencial), que não é permitido em backups do FitTrack` };
  if (o.schemaVersion !== undefined && !(Number.isInteger(o.schemaVersion) && o.schemaVersion >= 1 && o.schemaVersion <= SCHEMA_VERSION)) return { err: 'este backup é de uma versão mais nova do FitTrack' };
  const LONG = (x, d) => { if (typeof x === 'string') return x.length > 300; if (Array.isArray(x)) return x.some(y => LONG(y, d)); if (isO(x)) return Object.keys(x).some(q => LONG(x[q], d)); return false; };
  if (['workouts', 'foods', 'meals', 'weightHistory', 'hydration'].some(q => Array.isArray(o[q]) && LONG(o[q].map(r => { const { notes, ...rest } = r || {}; return rest; }))) ) return { err: 'o arquivo contém textos longos demais em nomes ou campos (limite de 300 caracteres)' };
  const p = o.profile;
  if (!isO(p) || !isN(p.weight) || !isN(p.calorieGoal) || !isN(p.proteinGoal)) return { err: '"profile" ausente ou inválido (peso e metas devem ser números)' };
  for (const k of ['fatGoal', 'carbGoal', 'carbGoalMin', 'carbGoalMax', 'waterGoalMl']) if (p[k] !== undefined && !isN(p[k])) return { err: `"profile.${k}" deve ser um número` };
  for (const k of ['workouts', 'workoutHistory', 'foods', 'meals', 'weightHistory']) if (!Array.isArray(o[k])) return { err: `"${k}" ausente ou não é uma lista` };
  const bad = (k, i, m) => ({ err: `${k}[${i}]: ${m}` }), dup = a => new Set(a.map(x => x.id)).size !== a.length;
  const macros = f => isN(f.calories) && isN(f.protein) && (f.carbs === undefined || isN(f.carbs)) && (f.fat === undefined || isN(f.fat));
  const mealFood = f => isO(f) && hasId(f) && typeof f.name === 'string' && (typeof f.quantity === 'string' || isN(f.quantity)) && macros(f);
  // biblioteca: formato novo (portion + unit) ou antigo (quantity); a migração converte
  const libFood = f => isO(f) && hasId(f) && typeof f.name === 'string' && macros(f) && ((isN(f.portion, 1e-9) && typeof f.unit === 'string') || typeof f.quantity === 'string' || isN(f.quantity));
  // treinos: aceita campos antigos (reps, load, rest, repsMin, repsMax) — a migração remove
  for (const [i, w] of o.workouts.entries()) {
    if (!isO(w) || !hasId(w) || typeof w.name !== 'string' || !Array.isArray(w.exercises) || (w.days !== undefined && !(Array.isArray(w.days) && w.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6)))) return bad('workouts', i, 'treino inválido');
    for (const [j, e] of w.exercises.entries()) if (!isO(e) || !hasId(e) || typeof e.name !== 'string' || !isN(e.sets)) return bad('workouts', i, `exercício ${j + 1} inválido`);
  }
  for (const [i, h] of o.workoutHistory.entries()) {
    if (!isO(h) || !hasId(h) || !isD(h.date) || typeof h.workoutName !== 'string' || !Array.isArray(h.exercises) || (h.notes !== undefined && typeof h.notes !== 'string')) return bad('workoutHistory', i, 'sessão inválida (data, nome ou exercícios)');
    for (const [j, e] of h.exercises.entries()) if (!isO(e) || typeof e.exerciseName !== 'string' || !Array.isArray(e.sets) || (e.note !== undefined && typeof e.note !== 'string') || !e.sets.every(s => isO(s) && isN(s.setNumber) && isN(s.load) && isN(s.reps) && typeof s.completed === 'boolean')) return bad('workoutHistory', i, `exercício ${j + 1} inválido`);
  }
  for (const [i, f] of o.foods.entries()) if (!libFood(f)) return bad('foods', i, 'alimento da biblioteca inválido');
  for (const [i, m] of o.meals.entries()) if (!isO(m) || !hasId(m) || !isD(m.date) || !MEALS.some(x => x[0] === m.mealType) || !isN(m.calories) || !isN(m.protein) || !Array.isArray(m.foods) || !m.foods.every(mealFood)) return bad('meals', i, 'refeição inválida (data, tipo, totais ou alimentos)');
  for (const [i, w] of o.weightHistory.entries()) if (!isO(w) || !hasId(w) || !isD(w.date) || !isN(w.weight, .01)) return bad('weightHistory', i, 'registro de peso inválido (data ou peso)');
  if (o.hydration !== undefined) {
    if (!Array.isArray(o.hydration)) return { err: '"hydration" não é uma lista' };
    for (const [i, h] of o.hydration.entries()) if (!isO(h) || !hasId(h) || !isD(h.date) || typeof h.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.time) || !isN(h.amount, 1)) return bad('hydration', i, 'registro de água inválido (data, horário ou quantidade)');
    if (dup(o.hydration)) return { err: 'há registros com IDs repetidos' };
  }
  if (['workouts', 'workoutHistory', 'foods', 'meals', 'weightHistory'].some(k => dup(o[k])) || dup(o.meals.flatMap(m => m.foods))) return { err: 'há registros com IDs repetidos' };
  return { data: o };
}

/* ---------- importar ---------- */
function importFail(msg) {
  PENDING = null;
  modal(`${mTitle('Importação falhou')}<p class="sub">${esc(msg)}.</p><p class="sub" style="margin-top:8px">Seus dados atuais <b style="color:var(--ink)">não foram alterados</b>.</p><div class="row" style="margin-top:20px"><button class="btn" style="flex:1" data-act="close">Fechar</button></div>`);
  toast('Importação falhou. Dados atuais mantidos.');
}
function stageImport(text, src) {
  if (Store.mode !== 'personal') { importFail('a importação só está disponível dentro de uma conta'); return; }
  const r = validateBackup(text); if (r.err) { importFail(r.err); return; }
  PENDING = r.data; const o = r.data, kv = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;
  modal(`${mTitle('Substituir os dados da conta?')}<p class="sub">Esta importação vai <b style="color:var(--ink)">substituir todos os dados da conta ${esc(Boot.email)}</b> pelo conteúdo de “${esc(src)}”. A troca é feita de uma vez só (tudo ou nada). Não dá para desfazer; exporte um backup antes se quiser guardar os dados atuais.</p><div class="kv">${kv(o.workouts.length, 'treinos')}${kv(o.workoutHistory.length, 'sessões')}${kv(o.meals.length, 'refeições')}${kv(o.foods.length, 'alimentos')}${kv(o.weightHistory.length, 'pesos')}${kv((o.hydration || []).length, 'registros de água')}</div><div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="impcancel">Cancelar</button><button class="btn r" style="flex:1" data-act="impgo">Substituir dados</button></div>`);
}
const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,application/json'; fi.style.display = 'none'; document.body.append(fi);
fi.addEventListener('change', async () => {
  const f = fi.files && fi.files[0]; if (!f) return;
  if (!f.size) { fi.value = ''; importFail('o arquivo está vazio'); return; }
  if (f.size > 20 * 1024 * 1024) { fi.value = ''; importFail('o arquivo é grande demais para ser um backup do FitTrack'); return; }
  let t; try { t = await f.text(); } catch (e) { fi.value = ''; importFail('não foi possível ler o arquivo'); return; }
  fi.value = ''; stageImport(t, f.name);
});
on('imp', () => modal(`${mTitle('Importar dados')}<p class="sub" style="margin-bottom:14px">Escolha um backup .json exportado pelo FitTrack. Nada é alterado antes da sua confirmação.</p><button class="btn w" data-act="pick">Selecionar arquivo .json</button><label for="tx" style="margin-top:16px">Ou cole o conteúdo do backup</label><textarea id="tx" style="width:100%;height:120px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--ink);font:12px monospace"></textarea>${foot('impok', 'Verificar e importar')}`));
on('pick', () => fi.click());
on('impok', () => stageImport($('#tx').value, 'texto colado'));
on('impcancel', () => { PENDING = null; closeModal(); });
on('impgo', async () => {
  const o = PENDING; PENDING = null;
  if (!o) { closeModal(); return; }
  if (Store.mode !== 'personal') { closeModal(); return; }
  const ep = Store.epoch;
  modal(`${mTitle('Importando')}<div class="gload" role="status" aria-live="polite">${spin}<p>Gravando na sua conta…</p></div>`);
  Store._busy(1);
  try {
    migrate(o);
    const res = await CloudRepo.importBackup(o, 'replace');
    if (ep !== Store.epoch) return;
    const want = Legacy.counts(o), diff = Object.keys(want).filter(k => Number(res[k]) !== want[k]);
    await Store.reload();
    if (diff.length) { importFail('o banco confirmou menos itens que o arquivo (' + diff.join(', ') + '). Confira seus dados'); return; }
    closeModal(); toast('Backup importado com sucesso');
  } catch (e) {
    if (ep !== Store.epoch) return;
    // se a resposta se perdeu, o banco pode ter gravado: relê para a tela refletir a verdade
    await Store.reload();
    importFail((e.message || 'não foi possível gravar') + (e.kind === 'network' ? ' Se a conexão caiu no meio, os dados mostrados agora são os que estão na conta' : ''));
  } finally { Store._busy(-1); }
});

/* ---------- exportar ---------- */
function fallbackExport(text, msg) {
  modal(`${mTitle('Exportar dados', 0)}<p class="sub" style="margin-bottom:12px">${msg}</p><textarea id="tx" readonly style="width:100%;height:200px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--ink);font:12px monospace">${esc(text)}</textarea>${foot('cp', 'Copiar')}`);
}
/* entrega um texto como arquivo (Claude/Artifact, download comum ou caixa de cópia) */
async function saveFile(name, text) {
  const plat = !!(window.claude && window.claude.use);
  let dl = null; try { if (plat) dl = await window.claude.use('downloads'); } catch (e) { }
  if (dl) { // dentro do Claude (Artifact): capacidade de download da plataforma
    try { await dl.save({ filename: name, data: text }); toast('Arquivo salvo: ' + name); }
    catch (e) { e && e.code === 'declined' ? toast('Download cancelado') : fallbackExport(text, 'O download automático não está disponível agora. Copie o conteúdo e salve em um arquivo .json.'); }
    return;
  }
  if (plat) { fallbackExport(text, 'O download automático não está disponível neste ambiente. Copie o conteúdo e salve em um arquivo .json.'); return; }
  try { // site comum (GitHub Pages ou arquivo local): link de download
    const u = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
    a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    toast('Arquivo gerado: ' + name);
  } catch (e) { fallbackExport(text, 'Não foi possível gerar o arquivo. Copie o conteúdo e salve em um arquivo .json.'); }
}
/* O backup contém SÓ os dados do app (nada de senha, token, e-mail ou chave). */
function exportBackup() {
  if (Store.mode !== 'personal' || !DB) { toast('Entre na sua conta para exportar seus dados.'); return; }
  saveFile(`fittrack-backup-${iso(new Date())}.json`, JSON.stringify({ app: 'FitTrack', exportedAt: new Date().toISOString(), ...DB }, null, 2));
}
on('exp', () => exportBackup());
on('cp', () => { $('#tx').select(); try { navigator.clipboard.writeText($('#tx').value); } catch (x) { } toast('Dados copiados'); });
