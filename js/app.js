/* app.js — desenho das telas e navegação. A inicialização (demonstração × conta) fica em boot.js. (Carregado por último.) */
const VIEWS = { inicio: vInicio, treinos: vTreinos, dieta: vDieta, progresso: vProg, hidratacao: vHidr, config: vConfig };

function render() {
  if (!DB || Store.mode === 'none') return;      // sem sessão ativa não há nada a desenhar
  project(); applyAppearance();
  if (!exNames().includes(S.ex)) S.ex = exNames()[0] || '';
  const mob = (window.innerWidth || 1024) < 768; W = mob ? 360 : 720; H = mob ? 240 : 250;   // dimensões dos gráficos
  renderNav(); renderBanner();
  const m = $('#main'); m.className = S.anim ? 'in' : ''; S.anim = false;
  m.innerHTML = VIEWS[S.view]();
  document.title = 'FitTrack · ' + NAV.find(n => n[0] === S.view)[1];
  if (S.view === 'hidratacao') hydStart();
  if (S.view === 'config') updateSuggest();
  if (typeof Photos !== 'undefined') Photos.hydrate(document);
}
function go(v) {
  S.view = v; S.anim = true;
  if (v === 'hidratacao') HYD.prev = 0;      // a garrafa enche do zero ao entrar na página
  try { history.replaceState(null, '', '#' + v); } catch (e) { }
  render(); window.scrollTo(0, 0);
}

if (window.matchMedia) matchMedia('(max-width:767px)').addEventListener('change', () => render());
// outra aba alterou a DEMONSTRAÇÃO → atualiza esta (a conta pessoal não usa localStorage para dados)
addEventListener('storage', e => { if (e.key === DEMO_KEY && Store.mode === 'demo') { try { DB = DemoRepo.load(); render(); } catch (x) { } } });
// voltou a conexão depois de uma falha: relê os dados da conta para a tela refletir a verdade
addEventListener('online', () => { if (Store.mode === 'personal' && Store.syncSoon) Store.reload(); });
Boot.start();
