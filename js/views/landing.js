/* views/landing.js — telas públicas (antes do app): início, entrar, criar conta, recuperar senha, nova senha, carregando.
   Aparece em #gate; o app (menu + páginas) fica oculto enquanto isso. Usa a mesma identidade visual do app. */
const GATE = { screen: 'loading', busy: false, msg: null, email: '', text: '', err: '' };

const spin = '<i class="spin" aria-hidden="true"></i>';
const gbtn = (act, label, cls = '', busyLabel) => `<button type="${act ? 'button' : 'submit'}" class="btn ${cls}" ${act ? `data-act="${act}"` : ''} ${GATE.busy ? 'disabled aria-disabled="true"' : ''}>${GATE.busy && busyLabel ? spin + busyLabel : label}</button>`;
const gdiag = () => {
  const L = typeof Auth !== 'undefined' && Auth.last;
  if (!GATE.msg || GATE.msg.t !== 'err' || !L || L.text !== GATE.msg.text) return '';
  const res = GATE.diag === 'running' ? `<p class="sub">${spin} Testando…</p>` : Array.isArray(GATE.diag) ? `<ul class="gdiag">${GATE.diag.map(d => `<li class="${d.ok ? 'ok' : 'bad'}"><b>${d.ok ? '✓' : '✗'} ${esc(d.label)}</b><br>${esc(d.detail)}</li>`).join('')}</ul>` : '';
  return `<div class="gtech"><details><summary>Detalhes técnicos</summary><code>${esc(L.tech || '—')}</code></details><button type="button" class="glink" data-act="gdiag" ${GATE.busy ? 'disabled' : ''}>Diagnosticar conexão</button>${res}</div>`;
};
const gmsg = () => GATE.msg ? `<p class="gmsg ${GATE.msg.t}" role="${GATE.msg.t === 'err' ? 'alert' : 'status'}">${esc(GATE.msg.text)}</p>${gdiag()}` : '<p class="gmsg" role="status"></p>';
const field = (id, label, type, attrs = '') => `<div><label for="${id}">${label}</label><input id="${id}" type="${type}" ${attrs} ${GATE.busy ? 'disabled' : ''}></div>`;
const emailField = () => field('ge', 'E-mail', 'email', `autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required value="${esc(GATE.email)}"`);
const back = (to, label = 'Voltar') => `<button type="button" class="glink" data-act="${to}" ${GATE.busy ? 'disabled' : ''}>← ${label}</button>`;

function gateHtml() {
  const brand = `<div class="gbrand"><i>${ic('treinos')}</i><span>FITTRACK</span></div>`;
  const wrap = h => `<div class="gcard">${brand}${h}</div>`;
  switch (GATE.screen) {
    case 'loading':
      return wrap(`<div class="gload" role="status" aria-live="polite">${spin}<p>${esc(GATE.text || 'Carregando…')}</p></div>`);
    case 'loaderror':
      return wrap(`<h1>Não foi possível carregar</h1><p class="sub">${esc(GATE.err || 'Erro desconhecido.')}</p><p class="sub">Seus dados continuam guardados na sua conta. Nenhum dado de exemplo é exibido no lugar deles.</p><div class="gact">${gbtn('gretry', 'Tentar de novo', '', 'Tentando…')}${gbtn('glogout', 'Sair da conta', 's')}</div>`);
    case 'login':
      return wrap(`<h1>Entrar</h1><p class="sub">Acesse seus treinos, dieta e progresso.</p>${gmsg()}<form data-submit="gdologin" novalidate class="gform">${emailField()}${field('gp', 'Senha', 'password', 'autocomplete="current-password" required')}${gbtn('', 'Entrar', 'w', 'Entrando…')}</form><div class="glinks"><button type="button" class="glink" data-act="gforgot" ${GATE.busy ? 'disabled' : ''}>Esqueci minha senha</button><button type="button" class="glink" data-act="gsignup" ${GATE.busy ? 'disabled' : ''}>Criar conta</button></div>${back('gland')}`);
    case 'signup':
      return wrap(`<h1>Criar conta</h1><p class="sub">Seus dados ficam salvos na sua conta e só você os acessa.</p>${gmsg()}<form data-submit="gdosignup" novalidate class="gform">${emailField()}${field('gp', 'Senha (mínimo 8 caracteres)', 'password', 'autocomplete="new-password" minlength="8" required')}${field('gp2', 'Repita a senha', 'password', 'autocomplete="new-password" minlength="8" required')}${gbtn('', 'Criar conta', 'w', 'Criando…')}</form><div class="glinks"><button type="button" class="glink" data-act="glogin" ${GATE.busy ? 'disabled' : ''}>Já tenho conta</button></div>${back('gland')}`);
    case 'check':
      return wrap(`<h1>Verifique seu e-mail</h1><p class="sub">Se o endereço informado puder ser cadastrado, você vai receber uma mensagem com um link para confirmar a conta. Depois de confirmar, volte aqui e entre.</p><p class="sub">Não chegou? Veja a caixa de spam e confira se digitou o e-mail corretamente.</p><div class="gact">${gbtn('glogin', 'Ir para entrar')}</div>`);
    case 'forgot':
      return wrap(`<h1>Recuperar senha</h1><p class="sub">Informe seu e-mail para receber um link de redefinição.</p>${gmsg()}<form data-submit="gdoforgot" novalidate class="gform">${emailField()}${gbtn('', 'Enviar link', 'w', 'Enviando…')}</form>${back('glogin')}`);
    case 'sent':
      return wrap(`<h1>Link enviado</h1><p class="sub">Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Abra o link neste mesmo navegador.</p><div class="gact">${gbtn('glogin', 'Voltar para entrar')}</div>`);
    case 'newpass':
      return wrap(`<h1>Nova senha</h1><p class="sub">Escolha uma nova senha para a sua conta.</p>${gmsg()}<form data-submit="gdonewpass" novalidate class="gform">${field('gp', 'Nova senha (mínimo 8 caracteres)', 'password', 'autocomplete="new-password" minlength="8" required')}${field('gp2', 'Repita a nova senha', 'password', 'autocomplete="new-password" minlength="8" required')}${gbtn('', 'Salvar nova senha', 'w', 'Salvando…')}</form><div class="glinks"><button type="button" class="glink" data-act="gcancelpw" ${GATE.busy ? 'disabled' : ''}>Cancelar</button></div>`);
    default: { // landing
      const ok = Cloud.available(), why = ok ? '' : (Cloud.describe() || 'Contas online indisponíveis.');
      return wrap(`<h1>Seu treino, sua dieta e seu progresso em um só lugar</h1><p class="sub">Registre treinos e cargas, controle calorias e macros, acompanhe peso e hidratação.</p>${gmsg()}<div class="gopts"><button type="button" class="gopt" data-act="gdemo"><b>Experimentar demonstração</b><span>Sem cadastro. Usa dados fictícios, guardados só neste navegador.</span></button><button type="button" class="gopt pri" data-act="glogin" ${ok ? '' : 'disabled aria-disabled="true"'}><b>Criar conta ou entrar</b><span>${ok ? 'Seus dados salvos na nuvem, acessíveis de qualquer aparelho.' : esc(why)}</span></button></div>`);
    }
  }
}
function showGate() {
  document.body.dataset.gate = '1';
  const g = $('#gate'); if (!g) return;
  // ao redesenhar a MESMA tela (erro, "carregando…"), mantém o que a pessoa já digitou
  const keep = {}; if (GATE.shown === GATE.screen) g.querySelectorAll('input').forEach(i => { keep[i.id] = i.value; });
  const had = document.activeElement && document.activeElement.id;
  g.innerHTML = gateHtml(); GATE.shown = GATE.screen;
  g.querySelectorAll('input').forEach(i => { if (keep[i.id] !== undefined) i.value = keep[i.id]; });
  const f = (had && g.querySelector('#' + had + ':not([disabled])')) || g.querySelector('input:not([disabled])');
  if (f && !GATE.busy) { try { f.focus({ preventScroll: true }); } catch (e) { } }
}
function hideGate() { delete document.body.dataset.gate; GATE.shown = null; const g = $('#gate'); if (g) g.innerHTML = ''; }

/* ---------- navegação entre telas públicas ---------- */
const gset = (screen, msg) => { GATE.diag = null; GATE.screen = screen; GATE.msg = msg || null; showGate(); };
const keepEmail = () => { const e = $('#ge'); if (e) GATE.email = e.value.trim(); };
on('gland', () => { keepEmail(); gset('landing'); });
on('glogin', () => { if (Store.mode === 'demo') { Boot.toLanding('login'); return; } keepEmail(); gset('login'); });
on('gsignup', () => { keepEmail(); if (Store.mode === 'demo') Boot.toLanding('signup'); else gset('signup'); });
on('gforgot', () => { keepEmail(); gset('forgot'); });
on('gdiag', async () => { keepEmail(); GATE.diag = 'running'; showGate(); try { GATE.diag = await Cloud.diagnose(); } catch (e) { GATE.diag = [{ ok: false, label: 'Diagnóstico', detail: String(e && e.message) }]; } showGate(); });
on('gdemo', () => { Boot.enterDemo(); });
on('gexit', () => Boot.logout());
on('glogout', async () => { await Auth.signOut(); Boot.toLanding('landing'); });
on('gretry', async () => { const u = Auth.user; if (u) Boot.enterPersonal(u); else Boot.toLanding('login'); });
on('logout', () => Boot.logout());
on('gcancelpw', async () => { await Auth.signOut(); Boot.toLanding('landing'); });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* envia um formulário uma vez só (GATE.busy impede toque duplo) */
async function gsubmit(fn) {
  if (GATE.busy) return;
  GATE.busy = true; GATE.msg = null; showGate();
  try { await fn(); } finally { GATE.busy = false; if (document.body.dataset.gate) showGate(); }
}
on('gdologin', () => {
  const email = ($('#ge').value || '').trim(), pw = $('#gp').value; GATE.email = email;
  if (!EMAIL_RE.test(email)) { GATE.msg = { t: 'err', text: 'Informe um e-mail válido.' }; showGate(); return; }
  if (!pw) { GATE.msg = { t: 'err', text: 'Informe a senha.' }; showGate(); return; }
  gsubmit(async () => {
    const r = await Auth.signIn(email, pw);
    if (r.error) { GATE.msg = { t: 'err', text: r.error }; return; }
    // a entrada no app é feita pelo evento SIGNED_IN (onAuth); se o evento já passou, garante aqui
    GATE.busy = false; if (Store.mode !== 'personal' && !Boot.entering) Boot.enterPersonal(r.session.user);
  });
});
on('gdosignup', () => {
  const email = ($('#ge').value || '').trim(), pw = $('#gp').value, pw2 = $('#gp2').value; GATE.email = email;
  const bad = !EMAIL_RE.test(email) ? 'Informe um e-mail válido.' : pw.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : pw !== pw2 ? 'As senhas não são iguais.' : '';
  if (bad) { GATE.msg = { t: 'err', text: bad }; showGate(); return; }
  gsubmit(async () => {
    const r = await Auth.signUp(email, pw);
    if (r.error) { GATE.msg = { t: 'err', text: r.error }; return; }
    if (r.session) { GATE.busy = false; if (Store.mode !== 'personal' && !Boot.entering) Boot.enterPersonal(r.session.user); return; }   // projeto sem confirmação por e-mail
    GATE.screen = 'check'; GATE.email = '';
  });
});
on('gdoforgot', () => {
  const email = ($('#ge').value || '').trim(); GATE.email = email;
  if (!EMAIL_RE.test(email)) { GATE.msg = { t: 'err', text: 'Informe um e-mail válido.' }; showGate(); return; }
  gsubmit(async () => {
    const r = await Auth.resetPassword(email);
    if (r.error) { GATE.msg = { t: 'err', text: r.error }; return; }
    GATE.screen = 'sent';
  });
});
on('gdonewpass', () => {
  const pw = $('#gp').value, pw2 = $('#gp2').value;
  const bad = pw.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : pw !== pw2 ? 'As senhas não são iguais.' : '';
  if (bad) { GATE.msg = { t: 'err', text: bad }; showGate(); return; }
  gsubmit(async () => {
    const r = await Auth.updatePassword(pw);
    if (r.error) { GATE.msg = { t: 'err', text: r.error }; return; }
    const u = Auth.user; Boot.recovery = false;
    GATE.busy = false; toast('Senha alterada com sucesso');
    if (u) Boot.enterPersonal(u); else Boot.toLanding('login');
  });
});
