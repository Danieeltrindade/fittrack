/* data.js — constantes do domínio, estrutura vazia dos dados, dados iniciais e dados de demonstração. */
const KEY = 'fittrack_data';
const SCHEMA_VERSION = 2;
const NAV = [['inicio', 'Início'], ['treinos', 'Treinos'], ['dieta', 'Dieta'], ['progresso', 'Progresso'], ['hidratacao', 'Hidratação'], ['config', 'Configurações']];
const MEALS = [['cafe', 'Café da manhã'], ['almoco', 'Almoço'], ['lanche', 'Lanche'], ['jantar', 'Jantar'], ['outras', 'Outras']];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const RG = [[7, '7 dias'], [30, '30 dias'], [90, '3 meses'], [0, 'Todo o histórico']];
const THEMES = [['dark', 'Escuro', 'moon'], ['light', 'Claro', 'sun']];
const ACCENTS = [['green', 'Verde'], ['blue', 'Azul'], ['cyan', 'Ciano'], ['red', 'Vermelho'], ['yellow', 'Amarelo'], ['purple', 'Roxo'], ['pink', 'Rosa']];
const WATER_QUICK = [200, 300, 500, 700];
const DEFAULT_WATER_ML = 3000;

const emptyData = () => ({
  schemaVersion: SCHEMA_VERSION,
  profile: { weight: 0, calorieGoal: 0, proteinGoal: 0 },
  workouts: [], workoutHistory: [], foods: [], meals: [], weightHistory: [], hydration: []
});

/* Dados de demonstração (fictícios; datas relativas a hoje). Botão "Restaurar dados de exemplo". */
function defaultData() {
  const d = emptyData();
  // alimento da biblioteca: porção + unidade + valores da porção
  const L = (name, portion, unit, calories, protein, carbs, fat) => ({ id: uid(), name, portion, unit, calories, protein, carbs, fat });
  const W = (name, days, ex) => ({ id: uid(), name, days, exercises: ex.map(([n, s]) => ({ id: uid(), name: n, sets: s })) });
  d.profile = { weight: 78.4, calorieGoal: 2900, proteinGoal: 160, fatGoal: 80, carbGoal: 380, waterGoalMl: 3000 };
  // [nome, séries, repsDoHistórico, cargaFinalDoHistórico] — reps/carga só geram o histórico fictício
  const plan = [
    ['Treino A · Peito e tríceps', [1], [['Supino reto', 4, 8, 70], ['Supino inclinado', 3, 10, 26], ['Crucifixo', 3, 12, 16], ['Tríceps corda', 3, 12, 30]]],
    ['Treino B · Costas e bíceps', [2], [['Puxada frontal', 4, 10, 60], ['Remada curvada', 4, 8, 55], ['Rosca direta', 3, 10, 30]]],
    ['Treino C · Pernas', [4], [['Agachamento', 4, 8, 90], ['Leg press', 4, 10, 200], ['Cadeira extensora', 3, 12, 55]]],
    ['Treino D · Ombros e abdômen', [5], [['Desenvolvimento', 4, 10, 24], ['Elevação lateral', 3, 12, 10], ['Abdominal', 3, 15, 0]]]
  ];
  plan.forEach(([name, days, ex]) => d.workouts.push(W(name, days, ex.map(e => [e[0], e[1]]))));
  d.workouts.forEach((w, wi) => {
    const spec = plan[wi][2];
    for (let k = 12; k >= 1; k--) d.workoutHistory.push({
      id: uid(), date: iso(ago(k * 7 - wi - 1)), workoutId: w.id, workoutName: w.name, notes: '',
      exercises: w.exercises.map((x, xi) => ({
        exerciseId: x.id, exerciseName: x.name,
        sets: [...Array(x.sets)].map((_, s) => ({
          setNumber: s + 1, completed: true, reps: spec[xi][2] - (s > 1 ? 1 : 0),
          load: spec[xi][3] ? Math.round(spec[xi][3] * (.75 + .25 * (12 - k) / 11) / 2.5) * 2.5 : 0
        }))
      }))
    });
  });
  d.foods = [L('Frango grelhado', 150, 'g', 248, 46, 0, 5), L('Ovo cozido', 1, 'unid.', 78, 6, 1, 5), L('Whey protein', 30, 'g', 120, 24, 3, 2), L('Arroz branco', 150, 'g', 195, 4, 42, 0), L('Batata-doce', 150, 'g', 130, 2, 30, 0), L('Aveia', 40, 'g', 150, 5, 27, 3)];
  // refeição-modelo: [nome, quantidade, kcal, proteína, carb, gordura]
  const B = {
    cafe: [['Ovos mexidos', '3 unid.', 234, 19, 2, 16], ['Pão integral', '2 fatias', 140, 6, 25, 2], ['Banana', '1 unid.', 90, 1, 23, 0], ['Aveia', '40 g', 150, 5, 27, 3]],
    almoco: [['Arroz branco', '150 g', 195, 4, 42, 0], ['Feijão', '100 g', 77, 5, 14, 0], ['Frango grelhado', '150 g', 248, 46, 0, 5], ['Azeite e salada', '1 porção', 160, 1, 6, 14]],
    lanche: [['Whey protein', '30 g', 120, 24, 3, 2], ['Pasta de amendoim', '15 g', 94, 4, 3, 8], ['Iogurte grego', '170 g', 130, 15, 8, 4]],
    jantar: [['Frango grelhado', '150 g', 248, 46, 0, 5], ['Macarrão', '200 g', 260, 9, 52, 1], ['Batata-doce', '150 g', 130, 2, 30, 0], ['Ovo cozido', '2 unid.', 156, 12, 2, 10]]
  };
  for (let i = 0; i < 45; i++) for (const t in B) {
    if (!i && t === 'jantar') continue;
    const f = i ? 1.15 + Math.sin(i * 1.7 + t.length) * .1 : 1, pf = i ? f * .72 : 1;
    const foods = B[t].map(([name, quantity, k, p, c, g]) => ({ id: uid(), name, quantity, calories: Math.round(k * f), protein: Math.round(p * pf), carbs: c, fat: g }));
    d.meals.push({ id: uid(), date: iso(ago(i)), mealType: t, foods, calories: sum(foods, 'calories'), protein: sum(foods, 'protein') });
  }
  for (let i = 0; i < 119; i += 3) d.weightHistory.push({ id: uid(), date: iso(ago(119 - i)), weight: +(74.5 + i * .033 + Math.sin(i / 4) * .2).toFixed(1) });
  d.weightHistory.push({ id: uid(), date: iso(new Date()), weight: 78.4 });
  // água dos últimos 30 dias (hoje só até agora, com valores variados)
  for (let i = 29; i >= 0; i--) {
    const n = i ? 4 + (i % 3) : 2, ml = [300, 500, 500, 300, 700, 200];
    for (let j = 0; j < n; j++) d.hydration.push({ id: uid(), date: iso(ago(i)), time: String(8 + j * 2).padStart(2, '0') + ':' + (j % 2 ? '30' : '00'), amount: ml[(i + j) % ml.length] });
  }
  return d;
}
