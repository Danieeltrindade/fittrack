/* services/supabase.js — ÚNICO ponto que cria o cliente do Supabase.
   Usa o supabase-js carregado por <script> (CDN com versão fixa — ver index.html e README). Nenhuma outra parte do app
   chama Supabase diretamente: telas e ações falam com Store → Repo (dataRepository.js) e Auth (auth.js). */
const Cloud = (() => {
  let client = null, problem = null, started = false;
  const jwtRole = k => { try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch (e) { return null; } };

  /* devolve null se a configuração é utilizável, ou o motivo (código) se não for */
  function check(cfg) {
    const url = (cfg && cfg.supabaseUrl || '').trim(), key = (cfg && cfg.supabaseKey || '').trim();
    if (!url || !key) return 'not_configured';
    if (/SEU-PROJETO|EXEMPLO|exemplo/.test(url + key)) return 'not_configured';
    if (!/^https:\/\/[^\s/]+$/i.test(url.replace(/\/+$/, '')) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.replace(/\/+$/, ''))) return 'bad_url';
    // trava de segurança: chaves SECRETAS jamais podem rodar no navegador
    if (/^sb_secret_/i.test(key) || jwtRole(key) === 'service_role') return 'secret_key';
    return null;
  }

  function init() {
    if (started) return client;
    started = true;
    const cfg = window.FITTRACK_CONFIG || {};
    problem = check(cfg);
    if (problem) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') { problem = 'library_missing'; return null; }
    try {
      client = window.supabase.createClient(cfg.supabaseUrl.trim().replace(/\/+$/, ''), cfg.supabaseKey.trim(), {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'fittrack_auth' }
      });
    } catch (e) { problem = 'init_failed'; client = null; }
    return client;
  }
  /* Testa, passo a passo, o que impede a conexão. Só faz GET públicos (health/settings) com a chave PÚBLICA. */
  async function diagnose() {
    const cfg = window.FITTRACK_CONFIG || {}, out = [], add = (ok, label, detail) => out.push({ ok, label, detail });
    const prob = check(cfg);
    add(location.protocol !== 'file:', 'Como a página foi aberta', location.protocol === 'file:'
      ? 'Aberta direto do arquivo (file://). Abra por um servidor local (ex.: "python3 -m http.server 8000" e http://localhost:8000) — o e-mail de confirmação não consegue voltar para file://.'
      : location.origin);
    add(!prob, 'Configuração (js/config.js)', prob ? ({ not_configured: 'URL e/ou chave vazias ou de exemplo.', bad_url: 'A URL deve ser só https://SEU-PROJETO.supabase.co (sem /rest/v1 nem barra final).', secret_key: 'Há uma chave SECRETA no arquivo — remova.' })[prob] || prob : 'URL e chave preenchidas.');
    if (prob) return out;
    add(!!(window.supabase && window.supabase.createClient), 'Biblioteca supabase-js', window.supabase ? 'Carregada.' : 'Não carregou (CDN bloqueado, sem internet ou extensão de bloqueio). Veja README: copiar para js/vendor/.');
    const base = cfg.supabaseUrl.trim().replace(/\/+$/, ''), key = cfg.supabaseKey.trim();
    let host = ''; try { host = new URL(base).host; } catch (e) { }
    const get = async (path) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 10000); try { return await fetch(base + path, { headers: { apikey: key }, signal: c.signal }); } finally { clearTimeout(t); } };
    try {
      const r = await get('/auth/v1/health');
      if (r.ok) add(true, 'Servidor ' + host, 'Respondeu (HTTP ' + r.status + ').');
      else if (r.status === 401 || r.status === 403) add(false, 'Servidor ' + host, 'Respondeu, mas recusou a chave (HTTP ' + r.status + '). Copie de novo a chave publishable/anon em Project Settings → API Keys.');
      else add(false, 'Servidor ' + host, 'Respondeu com HTTP ' + r.status + (r.status === 404 ? ' — a URL provavelmente está errada.' : '.'));
    } catch (e) {
      add(false, 'Servidor ' + host, (e && e.name === 'AbortError' ? 'Sem resposta em 10 s. ' : 'A requisição nem chegou ao servidor. ') +
        'Causas comuns: (1) URL com erro de digitação — confira o endereço em Project Settings → API; (2) projeto pausado — abra o painel e clique em Restore (planos gratuitos pausam após inatividade); (3) bloqueio local — extensão/antivírus/DNS/VPN/rede da empresa; (4) sem internet.');
      return out;
    }
    try {
      const r = await get('/auth/v1/settings');
      if (r.ok) {
        const s = await r.json();
        add(!s.disable_signup, 'Cadastro de novos usuários', s.disable_signup ? 'DESATIVADO no projeto (Authentication → Sign In / Providers → habilite "Allow new users to sign up").' : 'Ativado.');
        add(true, 'Confirmação de e-mail', s.mailer_autoconfirm ? 'Desativada: a conta já entra logada.' : 'Ativada: a pessoa precisa clicar no link recebido por e-mail.');
        add(!!(s.external && s.external.email), 'Login por e-mail/senha', s.external && s.external.email ? 'Ativado.' : 'DESATIVADO (Authentication → Sign In / Providers → Email).');
      } else add(false, 'Configurações de autenticação', 'HTTP ' + r.status);
    } catch (e) { add(false, 'Configurações de autenticação', 'Não foi possível ler: ' + (e && e.message)); }
    add(true, 'URL de retorno que o app envia', 'Cadastre em Authentication → URL Configuration → Redirect URLs: ' + (typeof Auth !== 'undefined' ? Auth.base() : location.origin + '/') + ' (e Site URL igual).');
    return out;
  }
  return {
    init, check, diagnose,
    client: () => client,
    available: () => !!client,
    problem: () => problem,
    describe() {
      return ({
        not_configured: 'As contas online ainda não foram configuradas neste site.',
        bad_url: 'A URL do Supabase em js/config.js parece inválida.',
        secret_key: 'js/config.js contém uma chave SECRETA. Remova-a imediatamente e use apenas a chave pública (publishable/anon).',
        library_missing: 'Não foi possível carregar a biblioteca de contas (supabase-js). Verifique a conexão e tente recarregar a página.',
        init_failed: 'Não foi possível iniciar o serviço de contas.'
      })[problem] || '';
    }
  };
})();
