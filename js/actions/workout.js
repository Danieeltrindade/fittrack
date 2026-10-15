/* actions/workout.js — regras de dados de Treinos: modelos de treino e sessões realizadas. */
const WorkoutActions = {
  // ed = { id, nome, dias, ex:[{n, s}] }. Exercícios mantêm o id quando o nome não muda (histórico continua ligado).
  save(ed) {
    return Store.update(d => {
      const old = d.workouts.find(w => w.id === ed.id), oe = old ? old.exercises : [];
      const w = {
        id: old ? old.id : uid(), name: ed.nome.trim(), days: ed.dias,
        exercises: ed.ex.map(x => { const o = oe.find(o => o.name === x.n.trim()) || {}; return { id: o.id || uid(), name: x.n.trim(), sets: x.s }; })
      };
      old ? Object.assign(old, w) : d.workouts.push(w);
    });
  },
  remove(id) { return Store.remove('workouts', id); },          // o histórico de sessões é mantido
  addSession(s) { return Store.add('workoutHistory', s); },
  saveSession(id, exs, notes) { return Store.update(d => { const h = d.workoutHistory.find(x => x.id === id); if (h) { h.exercises = exs; h.notes = notes; } }); },
  deleteSession(id) { return Store.remove('workoutHistory', id); }
};
