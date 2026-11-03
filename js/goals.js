/* goals.js — metas nutricionais por objetivo e avaliação do consumo (consumido / meta / restante / excesso).
   Regra de produto: ULTRAPASSAR UMA META NÃO É AUTOMATICAMENTE RUIM. O tom depende do nutriente e do objetivo:
     tone 'ok'    → dentro da meta (ou meta atingida)           → cor do nutriente
     tone 'near'  → perto da meta (≥ 90%)                       → cor do nutriente (sem alarme)
     tone 'over'  → acima da meta, mas esperado/neutro          → cor do nutriente + faixa listrada do excesso
     tone 'warn'  → acima da meta e vale atenção (âmbar, nunca vermelho)
   A barra NUNCA é cortada em 100%: a escala vai até o valor consumido e uma marca indica onde está a meta. */
const NUTR = {
  cal:  { key: 'k', name: 'Calorias',     unit: 'kcal', css: 'cal'  },
  prot: { key: 'p', name: 'Proteína',     unit: 'g',    css: 'prot' },
  carb: { key: 'c', name: 'Carboidratos', unit: 'g',    css: 'carb' },
  fat:  { key: 'g', name: 'Gordura',      unit: 'g',    css: 'fat'  },
  water: { key: 'w', name: 'Água',        unit: 'ml',   css: 'water' }
};
/* quanto acima da meta ainda é "esperado" (fração da meta) por objetivo e nutriente; acima disso vira atenção */
const OVER_OK = {
  lose:     { cal: 0,    prot: Infinity, carb: 0,    fat: 0,    water: Infinity },
  maintain: { cal: 0.05, prot: Infinity, carb: 0.10, fat: 0.10, water: Infinity },
  gain:     { cal: 0.10, prot: Infinity, carb: 0.15, fat: 0.15, water: Infinity }
};
const goalTypeOf = d => { const g = d && d.profile && d.profile.goalType; return GOAL_TYPES.some(x => x[0] === g) ? g : 'maintain'; };

/* v = consumido, g = meta (0/ausente = sem meta). Devolve tudo que a interface precisa. */
function evalNutrient(nut, v, g, goalType) {
  const n = NUTR[nut], gt = goalType || 'maintain';
  if (!(g > 0)) return { nut, name: n.name, unit: n.unit, v, g: 0, has: false, pct: 0, left: 0, over: 0, tone: 'ok', text: 'Defina uma meta em Configurações', short: '' };
  const left = Math.max(0, g - v), over = Math.max(0, v - g), p = v / g * 100, okFrac = OVER_OK[gt][nut];
  const tone = over > 0 ? (over / g <= okFrac ? 'over' : 'warn') : p >= 90 ? 'near' : 'ok';
  const u = ' ' + n.unit, F = x => Math.round(x).toLocaleString('pt-BR');
  const text = over > 0 ? `${F(over)}${u} acima da meta` : v >= g ? 'Meta atingida' : `${F(left)}${u} restantes`;
  return { nut, name: n.name, unit: n.unit, v, g, has: true, pct: Math.round(p), left, over, tone, text, reached: v >= g };
}
/* barra com excesso: trilha até max(v, g); parte dentro da meta na cor do nutriente; excesso listrado; marca da meta. */
function nutBar(e) {
  if (!e.has) return '<div class="nbar"></div>';
  const scale = Math.max(e.v, e.g) || 1, inW = Math.min(e.v, e.g) / scale * 100, exW = e.over / scale * 100, tick = e.g / scale * 100;
  return `<div class="nbar ${e.over > 0 ? 'has-over' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.round(e.g)}" aria-valuenow="${Math.round(e.v)}" aria-valuetext="${esc(Math.round(e.v) + ' de ' + Math.round(e.g) + ' ' + e.unit + ': ' + e.text)}">`
    + `<i class="in" style="width:${inW.toFixed(2)}%"></i>${e.over > 0 ? `<i class="ex t-${e.tone}" style="left:${inW.toFixed(2)}%;width:${exW.toFixed(2)}%"></i><b class="tk" style="left:${tick.toFixed(2)}%"></b>` : ''}</div>`;
}
/* Sugestão de caloria do objetivo: manutenção + ajuste (déficit negativo, superávit positivo). Só sugere — nunca grava sozinho. */
const suggestCalories = (maintainCal, adjust) => Math.max(0, Math.round((maintainCal || 0) + (adjust || 0)));
/* metas por objetivo guardadas no perfil: { lose|maintain|gain: { cal, prot, carb, fat } } */
const presetOf = (profile, gt) => { const p = profile && profile.goalPresets && profile.goalPresets[gt]; return p && typeof p === 'object' ? p : {}; };
