/* state.js — estado de interface (não persistido) e projeção somente-leitura de DB para as telas. */
const S = { view: 'inicio', range: 90, ex: '', open: { cafe: true, almoco: true }, libq: '' };

/* --- seletores sobre DB --- */
const dayMeals = d => DB.meals.filter(m => m.date === d);
const dayFoods = d => dayMeals(d).flatMap(m => m.foods);
const dayAll = d => { const L = dayFoods(d); return { k: sum(L, 'calories'), p: sum(L, 'protein'), c: sum(L, 'carbs'), g: sum(L, 'fat') }; };
const dayWater = d => sum((DB.hydration || []).filter(h => h.date === d), 'amount');
const waterGoal = d => { const p = (d || DB).profile || {}; return p.waterGoalMl > 0 ? p.waterGoalMl : p.waterGoalMaxL > 0 ? Math.round(p.waterGoalMaxL * 1000) : DEFAULT_WATER_ML; };
// Série diária para os gráficos: [{t, v}] só dos dias com valor > 0
function dailySeries(dates, valueOf) { return [...new Set(dates)].sort().map(d => ({ t: pd(d).getTime(), v: valueOf(d) })).filter(p => p.v > 0); }
const series = key => dailySeries(DB.meals.map(m => m.date), d => dayAll(d)[key]);       // key: k | p | c | g
const waterSeries = () => dailySeries((DB.hydration || []).map(h => h.date), dayWater);
const exNames = () => [...new Set(S.treinos.flatMap(t => t.ex.map(e => e.n)))];
const tot = () => ({ k: sum(S.meals, 'k'), p: sum(S.meals, 'p'), c: sum(S.meals, 'c'), g: sum(S.meals, 'g') });

/* metas: gordura e carboidratos ausentes são estimados a partir das calorias (e só aparecem como sugestão) */
function goals() {
  const c = S.cfg, gg = c.fat > 0 ? c.fat : Math.round(c.cal * .25 / 9);
  const ce = Math.max(0, Math.round((c.cal - c.prot * 4 - gg * 9) / 4));
  return { cal: c.cal, prot: c.prot, fat: gg, carb: c.carb > 0 ? c.carb : ce, carbEst: !(c.carb > 0), fatEst: !(c.fat > 0) };
}

/* carga anterior: última sessão do exercício em data ANTERIOR à da sessão em registro (só referência) */
function lastSets(name, before) {
  const r = S.hist.filter(h => h.ex === name && (!before || h.data < before));
  if (!r.length) return [];
  const d = r.map(h => h.data).sort().pop();
  return r.filter(h => h.data === d).sort((a, b) => a.serie - b.serie);
}
// Próximo treino agendado a partir de hoje (null se nenhum treino tem dia definido)
function todayT() {
  const d = new Date().getDay();
  for (let i = 0; i < 7; i++) { const t = S.treinos.find(t => t.dias.includes((d + i) % 7)); if (t) return { t, off: i }; }
  return null;
}

function project() {
  const d = DB, pf = d.profile;
  Object.assign(S, {
    cfg: { peso: pf.weight, cal: pf.calorieGoal, prot: pf.proteinGoal, fat: pf.fatGoal, carb: pf.carbGoal },
    treinos: d.workouts.map(w => ({ id: w.id, nome: w.name, dias: w.days || [], ex: w.exercises.map(e => ({ id: e.id, n: e.name, s: e.sets })) })),
    meals: d.meals.filter(m => m.date === S.date).flatMap(m => m.foods.map(f => ({ id: f.id, t: m.mealType, n: f.name, q: f.quantity, k: f.calories, p: f.protein, c: f.carbs || 0, g: f.fat || 0 }))),
    lib: d.foods.map(f => ({ id: f.id, n: f.name, portion: f.portion, unit: f.unit, k: f.calories, p: f.protein, c: f.carbs || 0, g: f.fat || 0 })),
    hist: d.workoutHistory.flatMap(h => h.exercises.flatMap(e => e.sets.filter(s => s.completed).map(s => ({ data: h.date, ex: e.exerciseName, serie: s.setNumber, carga: s.load, reps: s.reps })))),
    sess: d.workoutHistory.map(h => ({
      id: h.id, data: h.date, treino: h.workoutName, wid: h.workoutId, obs: h.notes || '',
      feitas: h.exercises.reduce((a, e) => a + e.sets.filter(s => s.completed).length, 0),
      total: h.exercises.reduce((a, e) => a + e.sets.length, 0),
      exObs: Object.fromEntries(h.exercises.filter(e => e.note).map(e => [e.exerciseName, e.note]))
    })),
    hyd: (d.hydration || []).filter(h => h.date === S.hdate).sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0),
    wgoal: waterGoal(d),
    pesos: d.weightHistory.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(w => ({ id: w.id, data: w.date, valor: w.weight })),
    feitos: d.workoutHistory.filter(h => pd(h.date) >= ago(7)).length
  });
}
