/* actions/meals.js — refeições salvas (modelos): criar, editar, duplicar, favoritar, excluir e adicionar ao diário.
   Um modelo guarda os itens com quantidade (amount + unit) e valores calculados PARA essa quantidade (cópias).
   Adicionar ao diário cria itens NOVOS (cópias, ajustáveis); os totais do dia são sempre a soma dos itens do diário,
   então nada é contado duas vezes. */
const scaleItem = (it, amt) => { const k = it.amount > 0 ? amt / it.amount : 0; return { calories: r1(it.calories * k), protein: r1(it.protein * k), carbs: r1((it.carbs || 0) * k), fat: r1((it.fat || 0) * k) }; };
const savedTotals = m => ({ k: sum(m.items, 'calories'), p: sum(m.items, 'protein'), c: sum(m.items, 'carbs'), g: sum(m.items, 'fat') });

const MealActions = {
  /* m: { id?, name, category, photo, items:[{id?, foodId, name, amount, unit, calories, protein, carbs, fat}] } */
  save(m) {
    return Store.update(d => {
      d.savedMeals = d.savedMeals || [];
      const x = m.id && d.savedMeals.find(s => s.id === m.id);
      const items = m.items.map(i => ({ id: i.id || uid(), foodId: i.foodId || undefined, name: i.name, amount: i.amount, unit: i.unit, calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat }));
      const rec = { id: x ? x.id : uid(), name: m.name, category: m.category, favorite: x ? !!x.favorite : !!m.favorite, items };
      if (m.photo) rec.photo = m.photo;
      if (x) d.savedMeals[d.savedMeals.indexOf(x)] = rec; else d.savedMeals.push(rec);
    });
  },
  remove(id) { return Store.update(d => { d.savedMeals = (d.savedMeals || []).filter(s => s.id !== id); }); },
  toggleFav(id) { return Store.update(d => { const s = (d.savedMeals || []).find(x => x.id === id); if (s) s.favorite = !s.favorite; }); },
  duplicate(id) {
    return Store.update(d => {
      const s = (d.savedMeals || []).find(x => x.id === id); if (!s) return;
      const c = clone(s); c.id = uid(); c.name = (s.name + ' (cópia)').slice(0, 200); c.favorite = false; c.items.forEach(i => { i.id = uid(); });
      d.savedMeals.push(c);   // a foto (se houver) é a MESMA referência; o arquivo só é apagado quando nenhum registro a usa
    });
  },
  /* adiciona ao diário. amounts: { itemId: quantidade ajustada } (omitido = quantidade original) */
  addToDiary(id, date, slot, amounts) {
    return Store.update(d => {
      const s = (d.savedMeals || []).find(x => x.id === id); if (!s) throw new Error('modelo não encontrado');
      let m = d.meals.find(x => x.date === date && x.mealType === slot);
      if (!m) { m = { id: uid(), date, mealType: slot, foods: [], calories: 0, protein: 0 }; d.meals.push(m); }
      for (const it of s.items) {
        if (amounts && !(amounts[it.id] > 0)) continue;            // quantidade 0/vazia: o item fica de fora
        const amt = amounts ? amounts[it.id] : it.amount;
        m.foods.push({ id: uid(), name: it.name, quantity: `${fx(amt)} ${it.unit}`, ...(it.foodId ? { foodId: it.foodId } : {}), ...scaleItem(it, amt) });
      }
      if (!m.foods.length) throw new Error('nada a adicionar');
      retotal(m);
      if (s.photo && !m.photo) m.photo = s.photo;
    });
  }
};
