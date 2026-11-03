/* migrate.js — normaliza dados de qualquer versão anterior para o formato atual (schemaVersion 3).
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

  // v2 → v3: objetivo, peso desejado, ajuste calórico, metas por objetivo, refeições salvas. Só ACRESCENTA campos com padrão neutro:
  // nenhuma meta já cadastrada é alterada.
  if (!Array.isArray(o.savedMeals)) { o.savedMeals = []; ch = true; }
  if (!GOAL_TYPES.some(g => g[0] === p.goalType)) set(p, 'goalType', 'maintain');
  if (!Number.isFinite(p.calorieAdjust)) set(p, 'calorieAdjust', 0);
  if (!(p.targetWeight > 0) && 'targetWeight' in p) del(p, 'targetWeight');
  if (!p.goalPresets || typeof p.goalPresets !== 'object' || Array.isArray(p.goalPresets)) { p.goalPresets = {}; ch = true; }
  for (const w of o.workouts || []) for (const e of w.exercises || []) {
    if (e.description === null || e.description === '') del(e, 'description');
    if (e.muscleGroup === null || e.muscleGroup === '') del(e, 'muscleGroup');
  }

  if (o.schemaVersion !== SCHEMA_VERSION) set(o, 'schemaVersion', SCHEMA_VERSION);
  return ch;
}
