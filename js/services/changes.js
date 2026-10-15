/* services/changes.js — calcula o que mudou entre dois estados do documento (antes → depois).
   Só as linhas alteradas viajam para o banco (changeset): gravar uma refeição nunca reescreve o resto dos seus dados,
   e um estado antigo na tela nunca sobrescreve registros que você não tocou. */
const Changes = (() => {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const num = x => +x || 0;
  const pos = x => (x > 0 ? +x : null);

  const N = {
    profile: (p, ap) => ({
      weight: num(p.weight), calorieGoal: num(p.calorieGoal), proteinGoal: num(p.proteinGoal),
      fatGoal: pos(p.fatGoal), carbGoal: pos(p.carbGoal), waterGoalMl: pos(p.waterGoalMl), appearance: ap
    }),
    workout: w => ({ id: w.id, name: w.name, days: [...new Set(w.days || [])].sort((a, b) => a - b) }),
    wex: (e, wid) => ({ id: e.id, workoutId: wid, name: e.name, sets: num(e.sets) }),
    food: f => ({ id: f.id, name: f.name, portion: num(f.portion), unit: f.unit, calories: num(f.calories), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) }),
    session: h => ({
      id: h.id, date: h.date, workoutId: h.workoutId || null, workoutName: h.workoutName, notes: h.notes || '',
      exercises: (h.exercises || []).map(e => ({ exerciseId: e.exerciseId || null, exerciseName: e.exerciseName, note: e.note || '', sets: (e.sets || []).map(s => ({ setNumber: num(s.setNumber), load: num(s.load), reps: num(s.reps), completed: !!s.completed })) }))
    }),
    meal: m => ({ id: m.id, date: m.date, mealType: m.mealType }),
    item: (f, mid) => ({ id: f.id, mealId: mid, name: f.name, quantity: String(f.quantity == null ? '' : f.quantity), calories: num(f.calories), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat), foodId: f.foodId || null }),
    weight: w => ({ id: w.id, date: w.date, weight: num(w.weight) }),
    water: h => ({ id: h.id, date: h.date, time: h.time, amount: num(h.amount) })
  };

  /* Cada coleção vira um mapa id → linha normalizada. Treinos/exercícios e refeições/itens são linhas separadas no banco,
     então alterar UM item toca só UMA linha (e o servidor recalcula os totais da refeição). */
  const FLAT = [['foods', 'food', N.food], ['workoutHistory', 'session', N.session], ['weightHistory', 'weight', N.weight], ['hydration', 'water', N.water]];
  function maps(d) {
    const m = { workout: new Map(), wex: new Map(), meal: new Map(), item: new Map() };
    (d.workouts || []).forEach(w => { m.workout.set(w.id, N.workout(w)); (w.exercises || []).forEach(e => m.wex.set(e.id, N.wex(e, w.id))); });
    (d.meals || []).forEach(x => { m.meal.set(x.id, N.meal(x)); (x.foods || []).forEach(f => m.item.set(f.id, N.item(f, x.id))); });
    FLAT.forEach(([key, kind, norm]) => { m[kind] = new Map((d[key] || []).map(x => [x.id, norm(x)])); });
    return m;
  }
  const PROFILE_KEYS = ['weight', 'calorieGoal', 'proteinGoal', 'fatGoal', 'carbGoal', 'waterGoalMl'];

  function diff(a, b) {
    const ops = [], pa = N.profile(a.profile || {}, appOf(a)), pb = N.profile(b.profile || {}, appOf(b));
    const pv = {};
    PROFILE_KEYS.forEach(k => { if (!same(pa[k], pb[k])) pv[k] = pb[k]; });
    if (!same(pa.appearance, pb.appearance)) pv.appearance = pb.appearance;
    if (Object.keys(pv).length) ops.push({ k: 'profile', a: 'put', v: pv });
    const ma = maps(a), mb = maps(b);
    for (const kind of ['workout', 'wex', 'food', 'session', 'meal', 'item', 'weight', 'water']) {
      for (const [id, n] of mb[kind]) { const o = ma[kind].get(id); if (!o || !same(o, n)) ops.push({ k: kind, a: 'put', v: n }); }
      if (kind === 'meal') continue;               // refeição some sozinha quando fica sem itens (servidor)
      for (const id of ma[kind].keys()) if (!mb[kind].has(id)) ops.push({ k: kind, a: 'del', id });
    }
    return ops;
  }

  /* todo ID que for enviado ao banco precisa ser UUID */
  function badIds(ops) {
    const bad = [];
    const walk = (o) => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') for (const k in o) {
        if (['id', 'exerciseId', 'workoutId', 'foodId'].includes(k) && o[k] != null && !isUuid(o[k])) bad.push(o[k]);
        else walk(o[k]);
      }
    };
    ops.forEach(op => { walk(op.v); if (op.id !== undefined && !isUuid(op.id)) bad.push(op.id); });
    return bad;
  }
  return { diff, badIds, N, same };
})();
