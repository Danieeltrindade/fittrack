/* boot.js — ciclo de vida do app: tela inicial pública → demonstração OU conta pessoal.
   Estados (Store.mode): 'none' (tela inicial/login), 'demo' (dados fictícios locais), 'personal' (conta + banco).
   Trocar de modo/conta sempre zera a memória (DB, estado de tela, DOM) para nunca exibir dados da sessão anterior. */
const Boot = {
  uid: null, email: '', seq: 0, entering: false, recovery: false,

  /* limpa tudo que pode conter dados pessoais em memória/DOM */
  wipeMemory() {
    Store.reset('none'); Boot.uid = null; Boot.email = '';
    Legacy.info = null; Legacy.dismissed = false; CloudRepo.legacyHashes = [];
    PENDING = null; try { Photos.forget(); PhotoUI.drop(); } catch (e) { }
    Object.keys(S).forEach(k => delete S[k]);
    Object.assign(S, { view: 'inicio', range: 90, ex: '', open: { cafe: true, almoco: true }, libq: '' });
    S.date = S.tdate = S.hdate = iso(new Date());
    HYD.prev = 0;
    ['#main', '#side', '#bn', '#top', '#banner', '#sheet'].forEach(s => { const e = $(s); if (e) e.innerHTML = ''; });
    closeModal(); const t = $('#toast'); if (t) t.classList.remove('on');
  },

  startApp() {
    hideGate();
    try { const h = location.hash.slice(1); if (Object.prototype.hasOwnProperty.call(VIEWS, h)) S.view = h; } catch (e) { }
    S.anim = true; render(); window.scrollTo(0, 0);
    if (memOnly) toast('Armazenamento do navegador indisponível: os dados locais não serão salvos.', 5000);
  },

  async enterDemo() {
    const my = ++Boot.seq;
    Boot.wipeMemory(); Store.reset('demo');
    DB = DemoRepo.load();
    if (my !== Boot.seq) return;
    Boot.startApp();
  },

  async enterPersonal(user) {
    const my = ++Boot.seq;
    Boot.wipeMemory(); Store.reset('personal');
    Boot.uid = user.id; Boot.email = user.email || '';
    Boot.entering = true; GATE.screen = 'loading'; GATE.text = 'Carregando seus dados…'; showGate();
    try {
      const d = await CloudRepo.load();
      if (my !== Boot.seq) return;
      DB = d;
    } catch (e) {
      if (my !== Boot.seq) return;
      if (e.kind === 'auth') { Boot.sessionLost('Sua sessão expirou. Entre novamente.'); return; }
      GATE.screen = 'loaderror'; GATE.err = e.message; showGate(); return;     // erro NÃO mostra dados fictícios
    } finally { if (my === Boot.seq) Boot.entering = false; }
    try { Legacy.info = await Legacy.detect(); } catch (e) { Legacy.info = null; }
    if (my !== Boot.seq) return;
    Boot.startApp();
  },

  /* volta para a tela inicial pública, sem dados na memória */
  toLanding(screen, msg) {
    Boot.entering = false;
    ++Boot.seq; Boot.wipeMemory(); Boot.recovery = false;
    GATE.screen = screen || 'landing'; GATE.msg = msg ? { t: 'err', text: msg } : null; GATE.busy = false;
    showGate();
  },
  sessionLost(msg) { Boot.toLanding('login', msg || 'Sua sessão expirou. Entre novamente.'); },

  async logout() {
    if (GATE.busy) return;
    if (Store.mode === 'demo') { Boot.toLanding('landing'); return; }
    GATE.busy = true;
    await Auth.signOut();
    Boot.toLanding('landing');
    toast('Você saiu da sua conta');
  },

  /* eventos oficiais do Supabase Auth */
  onAuth(ev, session) {
    if (ev === 'PASSWORD_RECOVERY') { Boot.recovery = true; ++Boot.seq; Boot.wipeMemory(); GATE.screen = 'newpass'; GATE.msg = null; showGate(); return; }
    if (ev === 'SIGNED_OUT') { if (Store.mode === 'personal' || GATE.screen === 'loading') Boot.toLanding('login', 'Você saiu da conta (ou a sessão terminou).'); return; }
    if (ev === 'SIGNED_IN' && session && session.user) {
      if (Boot.recovery) return;                                              // fluxo de nova senha em andamento
      if (Store.mode === 'personal' && session.user.id === Boot.uid) return;  // renovação/foco da aba: mesma conta, nada a fazer
      if (Boot.entering) return;
      Boot.enterPersonal(session.user);
    }
  },

  async start() {
    const p = loadPrefs(); if (p) { const r = document.documentElement; if (THEMES.some(x => x[0] === p.theme)) r.dataset.theme = p.theme; if (ACCENTS.some(x => x[0] === p.accent)) r.dataset.accent = p.accent; }
    Cloud.init(); Auth.listen(Boot.onAuth);
    GATE.screen = 'loading'; GATE.text = 'Carregando…'; showGate();
    if (!Cloud.available()) { GATE.screen = 'landing'; showGate(); return; }
    const r = await Auth.current();
    if (Boot.recovery || Store.mode !== 'none') return;
    if (r && r.error) { GATE.screen = 'landing'; GATE.msg = { t: 'err', text: Auth.isNet(r.error) ? 'Sem conexão para verificar sua sessão. Você ainda pode usar a demonstração.' : Auth.msg(r.error) }; showGate(); return; }
    if (r && r.session && !Boot.entering) { Boot.enterPersonal(r.session.user); return; }
    if (!Boot.entering) { GATE.screen = GATE.screen === 'loading' ? 'landing' : GATE.screen; showGate(); }
  }
};
