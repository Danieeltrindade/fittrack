/* actions/hydration.js — registros de água. Só água: { id, date, time, amount(ml) }. */
const HydrationActions = {
  add(date, time, amount) { return Store.update(d => { d.hydration.push({ id: uid(), date, time, amount }); }); },
  remove(id) { return Store.update(d => { d.hydration = d.hydration.filter(h => h.id !== id); }); }
};
