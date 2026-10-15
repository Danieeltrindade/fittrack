/* actions/profile.js — perfil: metas, histórico de peso, aparência e restauração de dados de exemplo. */
const appOf = d => { const a = (d.profile && d.profile.appearance) || {}; return { theme: THEMES.some(x => x[0] === a.theme) ? a.theme : 'dark', accent: ACCENTS.some(x => x[0] === a.accent) ? a.accent : 'green' }; };
function applyAppearance() { const r = document.documentElement; if (!r || !r.dataset || !DB) return; const a = appOf(DB); r.dataset.theme = a.theme; r.dataset.accent = a.accent; savePrefs(a); }
const syncWeight = d => { const l = d.weightHistory.slice().sort((a, b) => a.date < b.date ? -1 : 1).pop(); if (l) d.profile.weight = l.weight; };

const ProfileActions = {
  // v = { peso, cal, prot, fat|null, carb|null, water|null }. Campos opcionais vazios (null) não alteram o valor salvo.
  saveGoals(v) {
    const td = iso(new Date());
    return Store.update(d => {
      d.profile = { ...d.profile, weight: v.peso, calorieGoal: v.cal, proteinGoal: v.prot };
      if (v.fat !== null) d.profile.fatGoal = v.fat;
      if (v.carb !== null) d.profile.carbGoal = v.carb;
      if (v.water !== null) d.profile.waterGoalMl = Math.round(v.water);   // não altera registros antigos de água
      const pe = d.weightHistory.find(x => x.date === td);
      pe ? pe.weight = v.peso : d.weightHistory.push({ id: uid(), date: td, weight: v.peso });
    });
  },
  async savePeso(date, w, editId) {
    let r = 'added';
    const ok = await Store.update(d => {
      const o = d.weightHistory.find(x => x.date === date && x.id !== editId), e = editId && d.weightHistory.find(x => x.id === editId);
      if (o) { o.weight = w; r = 'updated'; if (e) d.weightHistory = d.weightHistory.filter(x => x !== e); }
      else if (e) { e.date = date; e.weight = w; r = 'updated'; }
      else d.weightHistory.push({ id: uid(), date, weight: w });
      syncWeight(d);
    });
    return ok ? r : false;
  },
  deletePeso(id) { return Store.update(d => { d.weightHistory = d.weightHistory.filter(x => x.id !== id); syncWeight(d); }); },
  setAppearance(p) {
    const a = appOf(DB), n = { ...a };
    if (THEMES.some(x => x[0] === p.theme)) n.theme = p.theme;
    if (ACCENTS.some(x => x[0] === p.accent)) n.accent = p.accent;
    return Store.update(d => { d.profile.appearance = n; });
  },
  restoreDemo() { S.date = iso(new Date()); return Store.restoreDemo(); }
};
