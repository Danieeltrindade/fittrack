/* services/legacy.js — dados do armazenamento ANTIGO do navegador (localStorage["fittrack_data"]).
   Regras: só LEITURA. Nunca é apagado, sobrescrito, migrado de forma automática nem convertido em demonstração.
   A migração para a conta só começa por ação explícita, com resumo, cópia de segurança, confirmação e conferência. */
const Legacy = {
  info: null,     // null = não há dados antigos | { raw, hash, doc?, counts?, err? }
  dismissed: false,

  counts(d) {
    return {
      workouts: d.workouts.length,
      exercises: new Set(d.workouts.flatMap(w => w.exercises.map(e => e.id))).size,
      foods: d.foods.length,
      sessions: d.workoutHistory.length,
      sets: d.workoutHistory.reduce((a, h) => a + h.exercises.reduce((b, e) => b + e.sets.length, 0), 0),
      meals: d.meals.length,
      items: new Set(d.meals.flatMap(m => m.foods.map(f => f.id))).size,
      weights: d.weightHistory.length,
      water: (d.hydration || []).length
    };
  },
  async detect() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    const hash = await sha256(raw);
    let o; try { o = JSON.parse(raw); } catch (e) { return { raw, hash, err: 'o conteúdo não é um JSON válido' }; }
    if (!valid(o)) return { raw, hash, err: 'a estrutura não é reconhecida' };
    const c = clone(o); migrate(c);                       // normalização só em memória; nada é gravado de volta
    const r = validateBackup(JSON.stringify(c));
    if (r.err) return { raw, hash, err: r.err };
    return { raw, hash, doc: r.data, counts: Legacy.counts(r.data) };
  },
  /* há dados antigos válidos que ainda NÃO foram migrados para esta conta? */
  pending() { const i = Legacy.info; return !!(i && i.doc && !CloudRepo.legacyHashes.includes(i.hash)); },
  done() { const i = Legacy.info; return !!(i && i.doc && CloudRepo.legacyHashes.includes(i.hash)); },

  backupKey() { return KEY + '_pre_cloud_' + Legacy.info.hash.slice(0, 8); },

  /* executa a migração. onStep(texto) atualiza a tela. Devolve { ok, counts } ou { ok:false, step, msg }. */
  async run(onStep) {
    const i = Legacy.info, ep = Store.epoch;
    if (!i || !i.doc) return { ok: false, step: 'início', msg: 'Não há dados antigos válidos para migrar.' };
    // 1) cópia de segurança (e conferência de que foi gravada)
    onStep('Criando cópia de segurança neste navegador…');
    try {
      const k = Legacy.backupKey();
      if (localStorage.getItem(k) !== i.raw) localStorage.setItem(k, i.raw);
      if (localStorage.getItem(k) !== i.raw) throw new Error('cópia diferente');
    } catch (e) { return { ok: false, step: 'cópia de segurança', msg: 'Não foi possível criar a cópia de segurança (armazenamento cheio ou bloqueado). Nada foi enviado.' }; }
    // 2) o original não pode ter mudado desde o resumo mostrado ao usuário (ex.: outra aba)
    let now = null; try { now = localStorage.getItem(KEY); } catch (e) { }
    if (now !== i.raw) return { ok: false, step: 'verificação', msg: 'Os dados antigos mudaram desde que o resumo foi mostrado (talvez em outra aba). Recarregue a página e confira de novo.' };
    // 3) envio: UMA chamada = UMA transação no banco (tudo ou nada). IDs determinísticos: repetir não duplica.
    onStep('Enviando para a sua conta…');
    let res;
    try { res = await CloudRepo.importBackup(i.doc, 'merge'); }
    catch (e) { return { ok: false, step: 'envio', msg: (e.message || 'Falha no envio') + ' Nenhum dado foi marcado como migrado; você pode tentar de novo sem duplicar nada.' }; }
    if (ep !== Store.epoch) return { ok: false, step: 'sessão', msg: 'A sessão mudou durante a migração.' };
    // 4) conferência: cada contagem que o banco confirma tem que bater com a do arquivo
    onStep('Conferindo os dados gravados…');
    const want = Legacy.counts(i.doc), diff = Object.keys(want).filter(k => Number(res[k]) !== want[k]);
    if (diff.length) return { ok: false, step: 'conferência', msg: `O banco confirmou menos itens que o esperado (${diff.join(', ')}). A migração NÃO foi marcada como concluída; seus dados originais continuam intactos.` };
    // 5) só agora marca como concluída
    try { await CloudRepo.markLegacy(i.hash, want); CloudRepo.legacyHashes.push(i.hash); }
    catch (e) { return { ok: false, step: 'registro', msg: 'Os dados foram gravados e conferidos, mas não foi possível registrar a conclusão. Pode repetir sem duplicar.' }; }
    // 6) recarrega da conta (o que se vê passa a ser o que está no banco)
    onStep('Atualizando a tela…');
    await Store.reload();
    return { ok: true, counts: want };
  }
};
