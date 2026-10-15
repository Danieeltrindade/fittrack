/* events.js — despacho de eventos. Cada módulo registra seus próprios handlers:
     on('acao', (botão, valor, evento) => …)        ← cliques em [data-act="acao"]
     onChange('chave', (campo, valor) => …)          ← mudanças em [data-chg="chave"]
     onInput('chave', (campo, valor) => …)           ← digitação em [data-inp="chave"] */
const CLICK = {}, CHANGE = {}, INPUT = {};
const on = (a, fn) => { CLICK[a] = fn; };
const onChange = (k, fn) => { CHANGE[k] = fn; };
const onInput = (k, fn) => { INPUT[k] = fn; };

document.addEventListener('click', e => {
  if (e.target.id === 'ov') { closeModal(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (Store.busy && b.dataset.act !== 'close') return;     // gravação em andamento: ignora toques repetidos
  const fn = CLICK[b.dataset.act];
  if (fn) fn(b, b.dataset.v, e);
});
// formulários (Enter e gerenciadores de senha): <form data-submit="acao">
document.addEventListener('submit', e => { const f = e.target.closest && e.target.closest('form[data-submit]'); if (!f) return; e.preventDefault(); const fn = CLICK[f.dataset.submit]; if (fn) fn(f, '', e); });
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.chg; if (k && CHANGE[k]) CHANGE[k](e.target, e.target.value); });
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.inp; if (k && INPUT[k]) INPUT[k](e.target, e.target.value); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
