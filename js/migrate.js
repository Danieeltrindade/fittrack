/* migrate.js — normaliza dados de qualquer versão anterior para o formato atual (schemaVersion 2).
   Idempotente: rodar de novo sobre dados já migrados não muda nada. Devolve true se alterou algo. */
function migrate(o) {
  let ch = false;
  const set = (obj, k, v) => { if (obj[k] !== v) { obj[k] = v; ch = true; } };
  const del = (obj, k) => { if (k in obj) { delete obj[k]; ch = true; } };
  const p = o.profile || (o.profile = {});

  // v1 → v2 ---------------------------------------------------------------
  if (!Array.isArray(o.hydration)) { o.hydration = []; ch = true; }
  del(p, 'bodyMeasurements');                         // recurso "Meu Corpo" removido

  // meta de carboidratos: faixa (mín–máx) vira meta única. Usa o mínimo; sem mínimo, usa o máximo.
  if (!(p.carbGoal > 0)) {
    const v = p.carbGoalMin > 0 ? p.carbGoalMin : p.carbGoalMax > 0 ? p.carbGoalMax : 0;
    if (v > 0) set(p, 'carbGoal', v); else del(p, 'carbGoal');
  }
  del(p, 'carbGoalMin'); del(p, 'carbGoalMax');

  // exercícios: sem metas de reps/carga/descanso (8–12 etc.). Fica só nome + número de séries.
  for (const w of o.workouts || []) for (const e of w.exercises || []) {
    ['repsMin', 'repsMax', 'reps', 'load', 'rest'].forEach(k => del(e, k));
    if (!(e.sets >= 1)) set(e, 'sets', 3);
  }

  // biblioteca "Meus alimentos": porção numérica + unidade (antes era o texto "quantity")
  for (const f of o.foods || []) {
    if (!(f.portion > 0) || typeof f.unit !== 'string') {
      const q = parseQty(f.quantity);
      set(f, 'portion', q.portion); set(f, 'unit', q.unit);
    }
    del(f, 'quantity');
    if (typeof f.carbs !== 'number') set(f, 'carbs', 0);
    if (typeof f.fat !== 'number') set(f, 'fat', 0);
  }

  if (o.schemaVersion !== SCHEMA_VERSION) set(o, 'schemaVersion', SCHEMA_VERSION);
  return ch;
}
