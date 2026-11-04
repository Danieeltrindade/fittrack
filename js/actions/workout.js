/* actions/workout.js — regras de dados de Treinos: modelos de treino e sessões realizadas. */
const WorkoutActions = {
  // ed = { id, nome, dias, ex:[{n, s}] }. Exercícios mantêm o id quando o nome não muda (histórico continua ligado).
  save(ed) {
    return Store.update(d => {
      const old = d.workouts.find(w => w.id === ed.id), oe = old ? old.exercises : [], renames = [];
      const w = {
        id: old ? old.id : uid(), name: ed.nome.trim(), days: ed.dias,
        exercises: ed.ex.map(x => {
          const nm = x.n.trim(), byId = x.id && oe.find(o => o.id === x.id), o = byId || oe.find(o => o.name === nm && !ed.ex.some(y => y.id === o.id)) || {};
          if (o.id && o.name !== nm) renames.push([o, nm]);                       // o ID acompanha a renomeação: o histórico continua ligado
          const r = { id: o.id || uid(), name: nm, sets: x.s };
          if (x.g) r.muscleGroup = x.g; if (x.d) r.description = x.d;
          return r;
        })
      };
      old ? Object.assign(old, w) : d.workouts.push(w);
      renames.forEach(([o, nm]) => renameInHistory(d, o.id, o.name, nm, w.id));
    });
  },
  /* edita o exercício (por nome) em TODOS os treinos que o contêm; renomear também atualiza o histórico */
  editExercise(oldName, v) {
    return Store.update(d => {
      const ids = new Set();
      d.workouts.forEach(w => w.exercises.forEach(e => { if (e.name === oldName) { ids.add(e.id); e.name = v.name; if (v.muscleGroup) e.muscleGroup = v.muscleGroup; else delete e.muscleGroup; if (v.description) e.description = v.description; else delete e.description; } }));
      if (v.name !== oldName) renameInHistory(d, ids, oldName, v.name, null);
    });
  },
  deleteExercise(name) { return Store.update(d => { d.workouts.forEach(w => { w.exercises = w.exercises.filter(e => e.name !== name); }); }); },
  remove(id) { return Store.remove('workouts', id); },          // o histórico de sessões é mantido
  addSession(s) { return Store.add('workoutHistory', s); },
  saveSession(id, exs, notes) { return Store.update(d => { const h = d.workoutHistory.find(x => x.id === id); if (h) { h.exercises = exs; h.notes = notes; } }); },
  deleteSession(id) { return Store.remove('workoutHistory', id); }
};

/* Renomeia o exercício no histórico: sessões ligadas pelo ID do exercício e, para sessões antigas sem vínculo, as de mesmo nome
   (no mesmo treino, ou de qualquer treino quando a renomeação vem da edição global). Cargas, repetições e datas não são tocadas. */
function renameInHistory(d, ids, oldName, newName, workoutId) {
  const set = ids instanceof Set ? ids : new Set([ids]);
  d.workoutHistory.forEach(h => h.exercises.forEach(e => {
    if (e.exerciseId ? set.has(e.exerciseId) : (e.exerciseName === oldName && (workoutId === null || h.workoutId === workoutId || !h.workoutId))) e.exerciseName = newName;
  }));
}
