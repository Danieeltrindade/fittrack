/* components/datePicker.js — seletor de data ‹ data › + "Hoje", reutilizado em Treinos, Dieta e Hidratação.
   key = chave em S que guarda a data da tela: 'tdate' (treinos), 'date' (dieta), 'hdate' (hidratação). */
const DATE_LABEL = { tdate: 'Data do treino', date: 'Data', hdate: 'Data da hidratação' };
function dateBar(key, extra) {
  const v = S[key], today = v === iso(new Date());
  return `<div class="dctl" style="margin-top:-24px">
<button class="ib" style="font-size:24px" data-act="datenav" data-k="${key}" data-v="-1" aria-label="Dia anterior">‹</button>
<input type="date" id="d-${key}" data-chg="datepick" data-k="${key}" value="${v}" aria-label="${DATE_LABEL[key]}" style="width:auto">
<button class="ib" style="font-size:24px" data-act="datenav" data-k="${key}" data-v="1" aria-label="Próximo dia">›</button>
<button class="chip ${today ? 'on' : ''}" data-act="datenav" data-k="${key}" data-v="0">Hoje</button>${extra || ''}</div>`;
}
on('datenav', (b, v) => { const k = b.dataset.k; S[k] = v === '0' ? iso(new Date()) : shiftDate(S[k], +v); render(); });
onChange('datepick', (el, val) => { if (val) { S[el.dataset.k] = val; render(); } });
