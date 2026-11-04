/* SUBSTITUTO DE TESTE do supabase-js (NÃO faz parte do site). Imita a API que o FitTrack usa — createClient, auth.*, rpc —
   falando com o servidor de teste (/__api), que executa as RPCs num Postgres real com RLS. O comportamento de erro segue o
   do supabase-js: nunca lança exceção; devolve { data, error }. Falha de rede → mensagem "Failed to fetch". */
(function () {
  function createClient(url, key, opts) {
    const SK = (opts && opts.auth && opts.auth.storageKey) || 'sb-auth';
    const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } }, del: k => { try { localStorage.removeItem(k); } catch (e) { } } };
    let session = null; const subs = [];
    const emit = (ev, s) => subs.slice().forEach(f => { try { f(ev, s); } catch (e) { } });
    const post = async (path, body, token) => {
      let r; try { r = await fetch('/__api/' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) }); }
      catch (e) { return { net: e }; }
      let j = null; try { j = await r.json(); } catch (e) { }
      return { status: r.status, body: j };
    };
    const neterr = () => ({ message: 'Failed to fetch', status: 0, name: 'AuthRetryableFetchError' });
    const aerr = r => ({ message: r.body && r.body.message || 'error', code: r.body && r.body.code, status: r.status });
    const set = s => { session = s; if (s) ls.set(SK, JSON.stringify(s)); else ls.del(SK); };

    const ready = (async () => {
      try { const raw = ls.get(SK); if (raw) session = JSON.parse(raw); } catch (e) { }
      const code = new URLSearchParams(location.search).get('code');
      if (code) {
        const r = await post('exchange', { code });
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { }
        if (r.body && r.body.session) { set(r.body.session); setTimeout(() => { emit('SIGNED_IN', session); emit('PASSWORD_RECOVERY', session); }, 0); }
      } else setTimeout(() => emit('INITIAL_SESSION', session), 0);
    })();
    addEventListener('storage', e => {                    // outra aba saiu da conta / entrou
      if (e.key !== SK) return;
      if (!e.newValue) { session = null; emit('SIGNED_OUT', null); } else { try { session = JSON.parse(e.newValue); emit('SIGNED_IN', session); } catch (x) { } }
    });

    const auth = {
      onAuthStateChange(cb) { subs.push(cb); return { data: { subscription: { unsubscribe() { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); } } } }; },
      async getSession() { await ready; return { data: { session }, error: null }; },
      async signUp({ email, password }) {
        const r = await post('signup', { email, password });
        if (r.net) return { data: { user: null, session: null }, error: neterr() };
        if (r.status >= 400) return { data: { user: null, session: null }, error: aerr(r) };
        if (r.body.session) { set(r.body.session); emit('SIGNED_IN', session); }
        return { data: { user: r.body.user, session: r.body.session || null }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const r = await post('login', { email, password });
        if (r.net) return { data: { user: null, session: null }, error: neterr() };
        if (r.status >= 400) return { data: { user: null, session: null }, error: aerr(r) };
        set(r.body.session); emit('SIGNED_IN', session);
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() {
        const t = session && session.access_token; set(null);
        emit('SIGNED_OUT', null);
        if (t) await post('logout', {}, t);
        return { error: null };
      },
      async resetPasswordForEmail(email) {
        const r = await post('recover', { email });
        if (r.net) return { data: null, error: neterr() };
        return { data: {}, error: r.status >= 400 ? aerr(r) : null };
      },
      async updateUser({ password }) {
        if (!session) return { data: { user: null }, error: { message: 'Auth session missing!', code: 'session_not_found', status: 400 } };
        const r = await post('updateuser', { password }, session.access_token);
        if (r.net) return { data: { user: null }, error: neterr() };
        if (r.status >= 400) return { data: { user: null }, error: aerr(r) };
        return { data: { user: r.body.user }, error: null };
      },
      async refreshSession() {
        if (!session) return { data: { session: null, user: null }, error: { message: 'Auth session missing!' } };
        const r = await post('refresh', { refresh_token: session.refresh_token });
        if (r.net) return { data: { session: null, user: null }, error: neterr() };
        if (r.status >= 400) { set(null); emit('SIGNED_OUT', null); return { data: { session: null, user: null }, error: aerr(r) }; }
        set(r.body.session); emit('TOKEN_REFRESHED', session);
        return { data: { session, user: session.user }, error: null };
      }
    };
    const rpc = async (name, args) => {
      await ready;
      const r = await post('rpc/' + name, args || {}, session && session.access_token);
      if (r.net) return { data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }, status: 0, statusText: '' };
      if (r.status >= 400) return { data: null, error: { message: r.body && r.body.message, code: r.body && r.body.code, details: '', hint: '' }, status: r.status, statusText: '' };
      return { data: r.body, error: null, status: 200, statusText: 'OK' };
    };
    // Storage (mesma forma do supabase-js: nunca lança; devolve { data, error })
    const sreq = async (op, bucket, qs, body, raw) => {
      let r; try { r = await fetch('/__api/storage/' + op + '?bucket=' + bucket + (qs || ''), { method: 'POST', headers: raw ? { 'content-type': raw.type, authorization: 'Bearer ' + (session && session.access_token) } : { 'content-type': 'application/json', authorization: 'Bearer ' + (session && session.access_token) }, body: raw ? raw.blob : JSON.stringify(body || {}) }); }
      catch (e) { return { net: e }; }
      let j = null; try { j = await r.json(); } catch (e) { }
      return { status: r.status, body: j };
    };
    const serr = r => r.net ? { message: 'Failed to fetch', name: 'StorageUnknownError' } : { message: r.body && r.body.message || 'error', statusCode: String(r.body && r.body.statusCode || r.status), status: r.status };
    const storage = { from: bucket => ({
      async upload(path, blob, o) { await ready; const r = await sreq('upload', bucket, '&path=' + encodeURIComponent(path), null, { blob, type: (o && o.contentType) || blob.type }); return r.net || r.status >= 400 ? { data: null, error: serr(r) } : { data: r.body, error: null }; },
      async createSignedUrl(path, secs) { await ready; const r = await sreq('sign', bucket, '', { path }); return r.net || r.status >= 400 ? { data: null, error: serr(r) } : { data: { signedUrl: r.body.signedUrl }, error: null }; },
      async remove(paths) { await ready; const r = await sreq('remove', bucket, '', { paths }); return r.net || r.status >= 400 ? { data: null, error: serr(r) } : { data: r.body, error: null }; },
      async list(folder) { await ready; const r = await sreq('list', bucket, '', { folder }); return r.net || r.status >= 400 ? { data: null, error: serr(r) } : { data: r.body, error: null }; }
    }) };
    return { auth, rpc, storage };
  }
  window.supabase = { createClient };
})();
