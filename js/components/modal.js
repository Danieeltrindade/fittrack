/* components/modal.js — modal (painel), confirmação, rodapé de botões e aviso (toast). */
function toast(t, ms) {
  const e = $('#toast'); e.textContent = t; e.classList.add('on'); e.classList.toggle('err', !!ms);
  clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), ms || 2200);
}
const modal = h => { $('#sheet').innerHTML = h; $('#ov').classList.add('open'); if (typeof Photos !== 'undefined') Photos.hydrate($('#sheet')); };
const closeModal = () => { $('#ov').classList.remove('open'); if (typeof PhotoUI !== 'undefined') PhotoUI.drop(); };
const mTitle = (t, mb) => `<h2 style="font-size:18px${mb ? ';margin-bottom:' + mb + 'px' : ''}">${t}</h2>`;
const foot = (ok, lbl) => `<div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Cancelar</button><button class="btn" style="flex:1" data-act="${ok}">${lbl}</button></div>`;
const confirmM = (t, p, act, v) => modal(`${mTitle(t)}<p class="sub">${p}</p><div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Cancelar</button><button class="btn r" style="flex:1" data-act="${act}" data-v="${v || ''}">Confirmar</button></div>`);
on('close', () => closeModal());
