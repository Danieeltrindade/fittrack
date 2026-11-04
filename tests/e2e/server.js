/* Servidor de TESTE (não faz parte do site). Serve os arquivos estáticos e imita o backend do Supabase usando um
   Postgres REAL com as migrações aplicadas: cadastro/login/recuperação (em memória) e RPCs executadas como o papel
   "authenticated" do usuário (RLS de verdade). Também expõe /__test/* para inspecionar o banco e simular falhas. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), PORT = +process.env.PORT || 8765, DBN = process.env.E2E_DB || 'fittrack_e2e';
const rnd = n => crypto.randomBytes(n).toString('hex');

function psql(sql) {
  return new Promise((res, rej) => {
    const p = spawn('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', DBN], { env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54329', PGUSER: 'postgres' } });
    let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', c => c ? rej(new Error(err.trim())) : res(out.trim())); p.stdin.end(sql);
  });
}
const lit = s => { const t = '$q' + rnd(4) + '$'; return t + s + t; };

const FILES = new Map(), SIGNED = new Map();
const raw = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const S = { users: new Map(), sessions: new Map(), refresh: new Map(), codes: new Map(), tokens: new Map(), outbox: [], log: [],
  flags: { requireConfirm: true, expireAll: false, refreshFails: false, rpcDelayMs: 0, rpcFailCode: null, storageFail: false } };
const mk = (uid, email) => {
  const at = 'at_' + rnd(12), rt = 'rt_' + rnd(12);
  S.sessions.set(at, { uid, email }); S.refresh.set(rt, { uid, email });
  return { access_token: at, refresh_token: rt, token_type: 'bearer', expires_in: 3600, user: { id: uid, email } };
};
const json = (res, st, o) => { res.writeHead(st, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); });
const bearer = req => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : null; };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  try {
    if (p.startsWith('/__api/') || p.startsWith('/__test/')) S.log.push(req.method + ' ' + p);
    if (p === '/__api/signup') {
      const b = await body(req), email = String(b.email || '').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 422, { code: 'validation_failed', message: 'Unable to validate email address: invalid format' });
      if (String(b.password || '').length < 8) return json(res, 422, { code: 'weak_password', message: 'Password should be at least 8 characters.' });
      let u0 = S.users.get(email);
      if (u0) return json(res, 200, { user: { id: 'fake-' + rnd(4), email }, session: null });         // não revela e-mail existente
      const id = await psql(`insert into auth.users (email) values (${lit(email)}) returning id;`).then(t => t.split('\n')[0].trim());
      u0 = { id, email, password: b.password, confirmed: !S.flags.requireConfirm }; S.users.set(email, u0);
      if (!u0.confirmed) { const t = rnd(8); S.tokens.set(t, { kind: 'confirm', email }); S.outbox.push({ to: email, type: 'confirm', link: '/__api/confirm?token=' + t }); }
      return json(res, 200, { user: { id, email }, session: u0.confirmed ? mk(id, email) : null });
    }
    if (p === '/__api/confirm') { const t = S.tokens.get(u.searchParams.get('token')); if (t) S.users.get(t.email).confirmed = true; res.writeHead(302, { location: '/index.html#confirmado' }); return res.end(); }
    if (p === '/__api/login') {
      const b = await body(req), us = S.users.get(String(b.email || '').toLowerCase());
      if (!us || us.password !== b.password) return json(res, 400, { code: 'invalid_credentials', message: 'Invalid login credentials' });
      if (!us.confirmed) return json(res, 400, { code: 'email_not_confirmed', message: 'Email not confirmed' });
      return json(res, 200, { session: mk(us.id, us.email) });
    }
    if (p === '/__api/recover') {
      const b = await body(req), email = String(b.email || '').toLowerCase();
      if (S.users.has(email)) { const t = rnd(8); S.tokens.set(t, { kind: 'recovery', email }); S.outbox.push({ to: email, type: 'recovery', link: '/__api/recovery-link?token=' + t }); }
      return json(res, 200, {});
    }
    if (p === '/__api/recovery-link') { const t = S.tokens.get(u.searchParams.get('token')); if (!t) { res.writeHead(302, { location: '/index.html' }); return res.end(); } const c = rnd(8); S.codes.set(c, t.email); res.writeHead(302, { location: '/index.html?code=' + c }); return res.end(); }
    if (p === '/__api/exchange') { const b = await body(req), email = S.codes.get(b.code); if (!email) return json(res, 400, { code: 'flow_state_not_found', message: 'invalid code' }); S.codes.delete(b.code); const us = S.users.get(email); return json(res, 200, { session: mk(us.id, us.email) }); }
    if (p === '/__api/updateuser') {
      const s = S.sessions.get(bearer(req)); if (!s) return json(res, 401, { code: 'session_not_found', message: 'Auth session missing!' });
      const b = await body(req), us = S.users.get(s.email);
      if (String(b.password || '').length < 8) return json(res, 422, { code: 'weak_password', message: 'Password should be at least 8 characters.' });
      if (b.password === us.password) return json(res, 422, { code: 'same_password', message: 'New password should be different from the old password.' });
      us.password = b.password; return json(res, 200, { user: { id: us.id, email: us.email } });
    }
    if (p === '/__api/logout') { S.sessions.delete(bearer(req)); return json(res, 204, {}); }
    if (p === '/__api/refresh') {
      const b = await body(req), r = S.refresh.get(b.refresh_token);
      if (!r || S.flags.refreshFails) return json(res, 400, { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' });
      S.flags.expireAll = false; return json(res, 200, { session: mk(r.uid, r.email) });
    }
    if (p.startsWith('/__api/rpc/')) {
      const fn = p.slice(11), s = S.sessions.get(bearer(req));
      if (S.flags.rpcDelayMs) await new Promise(r => setTimeout(r, S.flags.rpcDelayMs));
      if (!s || S.flags.expireAll) return json(res, 401, { code: 'PGRST301', message: 'JWT expired' });
      if (S.flags.rpcFailCode) return json(res, 400, { code: S.flags.rpcFailCode, message: 'forced failure' });
      const args = await body(req);
      const out = JSON.parse(await psql(`select stub.rpc(${lit(s.uid)}::uuid, ${lit(fn)}, ${lit(JSON.stringify(args))}::jsonb);`));
      if (out.__error) { const c = out.__error.code; return json(res, c === '42501' ? 403 : c === '28000' ? 401 : 400, out.__error); }
      return json(res, 200, out.data === undefined ? null : out.data);
    }
    // ---- Storage de teste (bucket com limite de 1 MB e só JPEG, como a migração 4; permissões = RLS real de storage.objects)
    if (p.startsWith('/__api/storage/')) {
      const op = p.slice(15), s = S.sessions.get(bearer(req));
      if (!s || S.flags.expireAll) return json(res, 401, { statusCode: '401', error: 'Unauthorized', message: 'invalid JWT' });
      if (S.flags.storageFail) return json(res, 500, { statusCode: '500', error: 'Internal', message: 'forced storage failure' });
      const bk = u.searchParams.get('bucket') || 'food-photos', st = (o) => JSON.parse(o);
      const run = async (o, names) => JSON.parse(await psql(`select stub.st(${lit(s.uid)}::uuid, ${lit(o)}, ${lit(bk)}, ${lit(JSON.stringify(names))}::jsonb);`));
      if (op === 'upload') {
        const name = u.searchParams.get('path'), buf = await raw(req), ct = req.headers['content-type'] || '';
        const bkt = JSON.parse(await psql(`select coalesce(row_to_json(b), '{}') from storage.buckets b where id = ${lit(bk)};`) || '{}');
        if (!bkt.id) return json(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
        if (buf.length > bkt.file_size_limit) return json(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
        if (!/^image\/jpeg/.test(ct)) return json(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
        if (FILES.has(bk + '/' + name)) return json(res, 409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        const out = await run('insert', [name]);
        if (out.__error) return json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        FILES.set(bk + '/' + name, buf); return json(res, 200, { Key: bk + '/' + name, path: name });
      }
      const b = await body(req);
      if (op === 'sign') {
        const out = await run('exists', [b.path]);
        if (!out.data || !out.data.includes(b.path)) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        const t = rnd(12); SIGNED.set(t, bk + '/' + b.path); return json(res, 200, { signedUrl: '/__storage/' + t });
      }
      if (op === 'remove') { const out = await run('delete', b.paths || []); (out.data || []).forEach(n => FILES.delete(bk + '/' + n)); return json(res, 200, (out.data || []).map(name => ({ name }))); }
      if (op === 'list') { const out = await run('list', [b.folder]); return json(res, 200, (out.data || []).map(name => ({ name: name.split('/').pop() }))); }
      return json(res, 404, { message: 'unknown storage op' });
    }
    if (p.startsWith('/__storage/')) { const k = SIGNED.get(p.slice(11)), f = k && FILES.get(k); if (!f) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' }); return res.end(f); }
    if (p === '/__test/files') return json(res, 200, [...FILES.keys()]);
    // ---- controle dos testes
    if (p === '/__test/outbox') return json(res, 200, S.outbox);
    if (p === '/__test/log') return json(res, 200, S.log);
    if (p === '/__test/flags') { Object.assign(S.flags, await body(req)); return json(res, 200, S.flags); }
    if (p === '/__test/sql') { const b = await body(req); const t = await psql(`select coalesce(json_agg(q), '[]') from (${b.sql}) q;`); return json(res, 200, JSON.parse(t)); }
    if (p === '/__test/reset') {
      await psql('truncate auth.users cascade;');
      S.users.clear(); S.sessions.clear(); S.refresh.clear(); S.codes.clear(); S.tokens.clear(); S.outbox.length = 0; S.log.length = 0; FILES.clear(); SIGNED.clear();
      Object.assign(S.flags, { requireConfirm: true, expireAll: false, refreshFails: false, rpcDelayMs: 0, rpcFailCode: null, storageFail: false });
      return json(res, 200, { ok: true });
    }
    // ---- estáticos
    let f = path.join(ROOT, p === '/' ? 'index.html' : decodeURIComponent(p));
    if (!f.startsWith(ROOT) || /[\\/](tests|supabase|node_modules|\.git)[\\/]/.test(f)) { res.writeHead(404); return res.end('nf'); }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
  } catch (e) { json(res, 500, { code: 'stub_error', message: String(e.message || e) }); }
}).listen(PORT, '127.0.0.1', () => console.log('e2e server on ' + PORT));
