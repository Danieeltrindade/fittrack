/* views/account.js — indicador da conta no topo, faixas de aviso (demonstração / migração / sem conexão) e o fluxo de migração. */
const initialOf = () => (Store.mode === 'personal' ? (Boot.email || '?')[0] : 'D').toUpperCase();

function accountHtml() {
  if (Store.mode === 'personal') return `<span class="acct" title="${esc(Boot.email)}"><i class="dot"></i><span>${esc(Boot.email)}</span></span><button class="btn s sm" data-act="logout">Sair</button>`;
  if (Store.mode === 'demo') return `<span class="tag demo">Demonstração</span><button class="btn s sm" data-act="gexit">Sair</button>`;
  return '';
}
function renderBanner() {
  const b = $('#banner'); if (!b) return;
  let h = '';
  if (Store.mode === 'demo') h = `<div class="nb demo" role="note"><p><b>Modo demonstração.</b> Os dados são fictícios e ficam só neste navegador; nada é enviado a nenhum servidor.</p><div class="row"><button class="btn sm" data-act="gsignup">Criar conta</button><button class="btn s sm" data-act="glogin">Entrar</button></div></div>`;
  else if (Store.mode === 'personal') {
    if (Store.syncSoon) h += `<div class="nb warn" role="alert"><p>A última tentativa falhou por falta de conexão e a alteração <b>não foi salva</b>. Os dados abaixo são os da sua conta.</p><div class="row"><button class="btn sm" data-act="resync">Atualizar dados</button></div></div>`;
    if (Legacy.pending() && !Legacy.dismissed) {
      const c = Legacy.info.counts;
      h += `<div class="nb legacy" role="note"><p><b>Encontramos dados do FitTrack salvos neste navegador</b> (${c.workouts} treinos, ${c.sessions} sessões, ${c.meals} refeições…). Deseja migrá-los para a sua conta? Nada é feito sem a sua confirmação e o original não é apagado.</p><div class="row"><button class="btn sm" data-act="lgopen">Ver e migrar</button><button class="btn s sm" data-act="lgskip">Agora não</button></div></div>`;
    }
  }
  b.innerHTML = h;
}
on('resync', () => Store.reload());
on('lgskip', () => { Legacy.dismissed = true; renderBanner(); });

/* ---------- migração dos dados antigos ---------- */
const kvRow = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;
function legacyModal() {
  const i = Legacy.info;
  if (!i) { toast('Não há dados antigos neste navegador.'); return; }
  if (!i.doc) {
    modal(`${mTitle('Dados antigos não puderam ser lidos')}<p class="sub">Encontramos dados salvos neste navegador, mas ${esc(i.err)}. Nada foi alterado ou apagado.</p><div class="row" style="margin-top:20px"><button class="btn" style="flex:1" data-act="close">Fechar</button></div>`);
    return;
  }
  const c = i.counts, done = Legacy.done();
  modal(`${mTitle(done ? 'Dados antigos já migrados' : 'Migrar dados deste navegador')}
<p class="sub">${done ? 'Estes dados antigos já foram enviados e conferidos nesta conta. Migrar de novo não duplica nada.' : `Os dados abaixo estão salvos neste navegador (armazenamento antigo do FitTrack) e serão <b style="color:var(--ink)">acrescentados</b> à conta <b style="color:var(--ink)">${esc(Boot.email)}</b>.`}</p>
<div class="kv">${kvRow(c.workouts, 'treinos')}${kvRow(c.exercises, 'exercícios')}${kvRow(c.sessions, 'sessões')}${kvRow(c.sets, 'séries')}${kvRow(c.foods, 'alimentos')}${kvRow(c.meals, 'refeições')}${kvRow(c.weights, 'pesos')}${kvRow(c.water, 'registros de água')}</div>
<ul class="sub" style="margin:14px 0 0 18px;line-height:1.6"><li>Antes de enviar, criamos uma <b style="color:var(--ink)">cópia de segurança</b> neste navegador.</li><li>Os dados originais <b style="color:var(--ink)">não serão apagados nem alterados</b>.</li><li>O envio é feito de uma vez (tudo ou nada) e conferido item a item.</li><li>As metas e a aparência só são aplicadas se o seu perfil na conta ainda estiver em branco.</li></ul>
<div class="row" style="margin-top:20px;gap:10px;flex-wrap:wrap"><button class="btn s" style="flex:1" data-act="close">Cancelar</button><button class="btn s" style="flex:1" data-act="lgdl">Baixar cópia (.json)</button><button class="btn" style="flex:1" data-act="lggo">${done ? 'Migrar de novo' : 'Migrar para minha conta'}</button></div>`);
}
on('lgopen', () => legacyModal());
on('lgdl', () => saveFile(`fittrack-dados-antigos-${iso(new Date())}.json`, Legacy.info.raw));
on('lggo', async () => {
  if (Legacy.running) return; Legacy.running = true;
  const step = t => modal(`${mTitle('Migrando seus dados')}<div class="gload" role="status" aria-live="polite">${spin}<p>${esc(t)}</p></div><p class="sub" style="text-align:center">Não feche esta página.</p>`);
  step('Preparando…');
  const ep = Store.epoch;
  let r; try { r = await Legacy.run(step); } catch (e) { r = { ok: false, step: 'inesperado', msg: 'Ocorreu um erro inesperado.' }; }
  Legacy.running = false;
  if (ep !== Store.epoch) return;
  if (r.ok) {
    const c = r.counts;
    modal(`${mTitle('Migração concluída e conferida')}<p class="sub">O banco confirmou todos os itens abaixo. Seus dados originais continuam intactos neste navegador (e há uma cópia de segurança).</p><div class="kv">${kvRow(c.workouts, 'treinos')}${kvRow(c.sessions, 'sessões')}${kvRow(c.meals, 'refeições')}${kvRow(c.foods, 'alimentos')}${kvRow(c.weights, 'pesos')}${kvRow(c.water, 'registros de água')}</div><div class="row" style="margin-top:20px"><button class="btn" style="flex:1" data-act="close">Fechar</button></div>`);
    toast('Dados migrados para a sua conta');
  } else {
    modal(`${mTitle('A migração não foi concluída')}<p class="sub">Etapa: <b style="color:var(--ink)">${esc(r.step)}</b>. ${esc(r.msg)}</p><p class="sub" style="margin-top:8px">Seus dados originais <b style="color:var(--ink)">não foram apagados nem alterados</b>. Você pode tentar de novo quando quiser.</p><div class="row" style="margin-top:20px;gap:10px"><button class="btn s" style="flex:1" data-act="close">Fechar</button><button class="btn" style="flex:1" data-act="lggo">Tentar de novo</button></div>`);
  }
});
