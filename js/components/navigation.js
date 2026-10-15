/* components/navigation.js — menu lateral (desktop/tablet), barra inferior (celular) e topo. */
const nv = l => l.map(([k, n]) => `<button class="ni ${k === S.view ? 'on' : ''}" data-act="go" data-v="${k}" ${k === S.view ? 'aria-current="page"' : ''}>${ic(k)}<span class="lb">${n}</span></button>`).join('');
function renderNav() {
  $('#side').innerHTML = `<div class="logo"><i>${ic('treinos')}</i><span>FITTRACK</span></div>` + nv(NAV.slice(0, 5)) + `<div class="sf">${nv(NAV.slice(5))}</div>`;
  $('#bn').innerHTML = nv(NAV.slice(0, 5));
  $('#top').innerHTML = `<div class="mlogo"><i>${ic('treinos')}</i>FITTRACK</div><span class="date">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>${accountHtml()}<button class="av" data-act="go" data-v="config" aria-label="Perfil e configurações">${esc(initialOf())}</button>`;
}
on('go', (b, v) => { closeModal(); go(v); });
