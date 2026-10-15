/* actions/diet.js — regras de dados da Dieta: refeições e biblioteca "Meus alimentos". */
const DietActions = {
  // Valores proporcionais à quantidade consumida: valor_porção × (consumido ÷ porção). `food` é um item da biblioteca.
  calc(food, amount) {
    const f = food.portion > 0 ? amount / food.portion : 0;
    return { calories: r1((food.calories || 0) * f), protein: r1((food.protein || 0) * f), carbs: r1((food.carbs || 0) * f), fat: r1((food.fat || 0) * f) };
  },
  // Adiciona (ou, com editId, substitui) um alimento numa refeição. `f` é uma CÓPIA dos valores usados:
  // editar a biblioteca depois não altera refeições já registradas.
  saveFood(date, type, f, editId, toLibrary) {
    return Store.update(d => {
      if (editId) d.meals.forEach(m => { m.foods = m.foods.filter(x => x.id !== editId); retotal(m); });
      let m = d.meals.find(x => x.date === date && x.mealType === type);
      if (!m) { m = { id: uid(), date, mealType: type, foods: [], calories: 0, protein: 0 }; d.meals.push(m); }
      m.foods.push({ id: editId || uid(), ...f });
      retotal(m);
      if (toLibrary) { const q = parseQty(f.quantity); d.foods.push({ id: uid(), name: f.name, portion: q.portion, unit: q.unit, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat }); }
      d.meals = d.meals.filter(x => x.foods.length);
    });
  },
  removeFood(id) {
    return Store.update(d => {
      d.meals.forEach(m => { const l = m.foods.length; m.foods = m.foods.filter(f => f.id !== id); if (m.foods.length !== l) retotal(m); });
      d.meals = d.meals.filter(m => m.foods.length);
    });
  },
  saveLibFood(item, id) {
    return Store.update(d => {
      const x = id && d.foods.find(f => f.id === id);
      if (x) Object.assign(x, item); else d.foods.push({ id: uid(), ...item });
    });
  },
  removeLibFood(id) { return Store.remove('foods', id); }
};
const retotal = m => { m.calories = sum(m.foods, 'calories'); m.protein = sum(m.foods, 'protein'); };
