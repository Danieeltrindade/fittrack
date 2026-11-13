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
// exercícios dos treinos cadastrados + os que só aparecem no histórico (treinos livres)
const exNames = () => [...new Set([...S.treinos.flatMap(t => t.ex.map(e => e.n)), ...DB.workoutHistory.flatMap(h => h.exercises.map(e => e.exerciseName))])];
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
/* Semana de treino: começa na segunda-feira. */
const weekStartISO = () => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
/* Treino sugerido: o que ainda NÃO foi feito nesta semana, na ordem: atrasados (o dia marcado já passou) → o de hoje → os próximos.
   Treinos trocados ou livres entram na conta: quem treinou Pernas na segunda no lugar de Peito recebe o Peito como sugestão.
   Retorna { t, off, done, sched } ou null se nenhum treino tem dia definido.
   off = dias até o dia marcado (0 = hoje ou atrasado) · done = já treinou hoje · sched = treino marcado para hoje (se existir). */
function todayT() {
  const dow = new Date().getDay(), pos = d => (d + 6) % 7, today = pos(dow), td = iso(new Date()), ws = weekStartISO();
  const sch = S.treinos.filter(t => t.dias.length);
  if (!sch.length) return null;
  const doneIds = new Set(DB.workoutHistory.filter(h => h.date >= ws && h.workoutId).map(h => h.workoutId));
  const done = DB.workoutHistory.some(h => h.date === td), sched = sch.find(t => t.dias.includes(dow)) || null;
  const pend = sch.filter(t => !doneIds.has(t.id)), early = t => Math.min(...t.dias.filter(d => pos(d) < today).map(pos));
  const over = pend.filter(t => t.dias.some(d => pos(d) < today)).sort((a, b) => early(a) - early(b));
  const tod = pend.filter(t => t.dias.includes(dow) && !over.includes(t));
  const offOf = t => Math.min(...t.dias.map(d => (d - dow + 7) % 7 || 7));
  const up = pend.filter(t => !over.includes(t) && !tod.includes(t)).sort((a, b) => offOf(a) - offOf(b));
  const pick = over[0] || tod[0];
  if (pick) return { t: pick, off: 0, done, sched };
  if (up[0]) return { t: up[0], off: offOf(up[0]), done, sched };
  // tudo já feito nesta semana: segue a agenda (próximo dia marcado, sem contar hoje se já treinou)
  const d = new Date().getDay();
  for (let i = done ? 1 : 0; i < 8; i++) { const t = sch.find(t => t.dias.includes((d + i) % 7)); if (t) return { t, off: i % 7, done, sched }; }
  return null;
}

function project() {
  const d = DB, pf = d.profile;
  Object.assign(S, {
    cfg: { peso: pf.weight, cal: pf.calorieGoal, prot: pf.proteinGoal, fat: pf.fatGoal, carb: pf.carbGoal, goalType: goalTypeOf(d), target: pf.targetWeight > 0 ? pf.targetWeight : 0, adjust: Number.isFinite(pf.calorieAdjust) ? pf.calorieAdjust : 0, presets: pf.goalPresets && typeof pf.goalPresets === 'object' ? pf.goalPresets : {} },
    treinos: d.workouts.map(w => ({ id: w.id, nome: w.name, dias: w.days || [], ex: w.exercises.map(e => ({ id: e.id, n: e.name, s: e.sets })) })),
    meals: d.meals.filter(m => m.date === S.date).flatMap(m => m.foods.map(f => ({ id: f.id, t: m.mealType, n: f.name, q: f.quantity, k: f.calories, p: f.protein, c: f.carbs || 0, g: f.fat || 0, ph: f.photo || null }))),
    lib: d.foods.map(f => ({ id: f.id, n: f.name, portion: f.portion, unit: f.unit, k: f.calories, p: f.protein, c: f.carbs || 0, g: f.fat || 0, ph: f.photo || null })),
    saved: d.savedMeals || [],
    mph: Object.fromEntries(d.meals.filter(m => m.date === S.date && m.photo).map(m => [m.mealType, m.photo])),
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
