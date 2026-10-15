/* services/auth.js — autenticação (cadastro, login, logout, recuperação de senha) sobre o Supabase Auth oficial.
   Sem autenticação caseira: senhas e tokens nunca passam por código do FitTrack além da chamada ao supabase-js.
   Mensagens de erro não revelam se um e-mail está cadastrado. */
const Auth = (() => {
  let user = null, listeners = [];

  /* Último erro do Supabase em forma técnica (para o botão "Detalhes"/"Diagnosticar"). Nunca contém senha nem token. */
  let last = null;
  const isNet = e => !!e && (e.__net || e.status === 0 || /AuthRetryableFetchError|AuthUnknownError/.test(e.name || '') && !e.status
    || /failed to fetch|networkerror|network request|load failed|fetch failed|err_name_not_resolved|err_internet/i.test(e.message || ''));
  const msg = (e) => {
    const code = (e && (e.code || e.error_code) || '').toString(), m = ((e && e.message) || '').toLowerCase(), st = e && e.status;
    const text = text0(e, code, m, st);
    last = { text, net: isNet(e), tech: [e && e.name, st != null ? 'HTTP ' + st : '', code, String(e && e.message || '').slice(0, 300)].filter(Boolean).join(' · ') };
    if (last.net || /Veja os detalhes|recusou a chave|URL de retorno|enviar o e-mail|erro interno|desativados/.test(text)) try { console.warn('[FitTrack] erro do Supabase (diagnóstico):', last.tech); } catch (_) { }
    return text;
  };
  const text0 = (e, code, m, st) => {
    if (isNet(e)) return 'Não foi possível alcançar o servidor do Supabase. Use "Diagnosticar conexão" abaixo para ver o motivo.';
    if (code === 'invalid_credentials' || /invalid login credentials/.test(m)) return 'E-mail ou senha incorretos.';
    if (code === 'email_not_confirmed' || /email not confirmed/.test(m)) return 'Confirme seu e-mail antes de entrar: abra a mensagem que enviamos e clique no link.';
    if (code === 'same_password' || /different from the old|should be different/.test(m)) return 'A nova senha precisa ser diferente da atual.';
    if (code === 'weak_password' || /password should be at least|weak/.test(m)) return 'Senha fraca. Use pelo menos 8 caracteres.';
    if (/rate limit|too many|over_.*_rate_limit/.test(code + m) || st === 429) return 'Muitas tentativas em pouco tempo (ou limite de e-mails do Supabase atingido). Aguarde alguns minutos e tente de novo.';
    if (code === 'signup_disabled' || /signups not allowed/.test(m)) return 'Novos cadastros estão desativados neste projeto Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").';
    if (/session.*(missing|not found|expired)|jwt expired|invalid jwt|refresh_token/.test(code + m)) return 'Sua sessão expirou. Entre novamente.';
    if (/invalid email|unable to validate email|validation_failed/.test(code + m)) return 'Informe um e-mail válido.';
    if (st === 401 || st === 403 || /invalid api key|apikey/.test(m)) return 'O Supabase recusou a chave pública configurada em js/config.js. Confira se copiou a chave correta (publishable/anon) do projeto.';
    if (/redirect/.test(m)) return 'A URL de retorno deste site não está autorizada no Supabase (Authentication → URL Configuration → Redirect URLs).';
    if (/error sending|sending.*email|smtp/.test(m)) return 'O Supabase não conseguiu enviar o e-mail de confirmação (limite do envio padrão ou SMTP). Veja o README, seção de e-mail.';
    if (st >= 500) return 'O servidor do Supabase respondeu com erro interno. Tente novamente em instantes.';
    return 'Não foi possível concluir. Veja os detalhes técnicos abaixo.';
  };
  /* só erros de REDE (fetch que nem chegou ao servidor) viram "sem conexão"; qualquer outra exceção mantém a causa real */
  const wrap = async fn => {
    try { return await fn(); }
    catch (e) {
      const net = e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(e && e.message));
      return { error: { name: e && e.name, message: String(e && e.message || e), __net: net } };
    }
  };
  const base = () => { const u = new URL(location.href); u.hash = ''; u.search = ''; return u.pathname.endsWith('index.html') ? u.origin + u.pathname.slice(0, -10) : u.origin + u.pathname; };

  return {
    msg, base, isNet,
    get last() { return last; },
    clearLast() { last = null; },
    get user() { return user; },
    /* chamado UMA vez, logo após Cloud.init(): assina os eventos oficiais da sessão */
    listen(cb) {
      const c = Cloud.client(); if (!c) return;
      c.auth.onAuthStateChange((ev, session) => { user = session && session.user || null; setTimeout(() => cb(ev, session), 0); });
    },
    async current() {
      const c = Cloud.client(); if (!c) return null;
      const r = await wrap(() => c.auth.getSession());
      if (r.error) return { error: r.error };
      user = r.data && r.data.session && r.data.session.user || null;
      return { session: r.data && r.data.session || null };
    },
    async signUp(email, password) {
      const c = Cloud.client();
      const r = await wrap(() => c.auth.signUp({ email, password, options: { emailRedirectTo: base() } }));
      if (r.error) {
        if (r.error.code === 'user_already_exists') return { pending: true };   // não revela cadastro existente
        return { error: msg(r.error) };
      }
      return r.data && r.data.session ? { session: r.data.session } : { pending: true };
    },
    async signIn(email, password) {
      const c = Cloud.client();
      const r = await wrap(() => c.auth.signInWithPassword({ email, password }));
      return r.error ? { error: msg(r.error) } : { session: r.data.session };
    },
    async resetPassword(email) {
      const c = Cloud.client();
      const r = await wrap(() => c.auth.resetPasswordForEmail(email, { redirectTo: base() }));
      // erro de rede/limite é informado; qualquer outro resultado mostra a mesma mensagem neutra
      if (r.error && (isNet(r.error) || r.error.status === 429 || /rate/.test(r.error.code || ''))) return { error: msg(r.error) };
      return { ok: true };
    },
    async updatePassword(password) {
      const c = Cloud.client();
      const r = await wrap(() => c.auth.updateUser({ password }));
      return r.error ? { error: msg(r.error) } : { ok: true };
    },
    async signOut() {
      const c = Cloud.client(); user = null;
      if (!c) return { ok: true };
      const r = await wrap(() => c.auth.signOut({ scope: 'local' }));
      return r.error && !r.error.__net ? { ok: true } : { ok: true, offline: !!(r.error && r.error.__net) };
    },
    async refresh() {
      const c = Cloud.client(); if (!c) return null;
      const r = await wrap(() => c.auth.refreshSession());
      if (r.error || !r.data || !r.data.session) return null;
      user = r.data.session.user; return r.data.session;
    }
  };
})();
