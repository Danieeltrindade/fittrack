/* Utilidades dos testes e2e: sobe o navegador, intercepta o CDN do supabase-js e o config.js, e oferece atalhos. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 8765), STUB = fs.readFileSync(path.join(__dirname, 'supabase-stub.js'), 'utf8');
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, i) => { if (c) { pass++; console.log('OK  ', n); } else { fail++; fails.push(n); console.log('FAIL', n, i === undefined ? '' : JSON.stringify(i)); } };
const CFG_OK = "window.FITTRACK_CONFIG={supabaseUrl:'https://stub-project.supabase.co',supabaseKey:'sb_publishable_stub_key_only_for_tests'};";

function call(method, p, body) {
  return new Promise((res, rej) => {
    const r = http.request(BASE + p, { method, headers: { 'content-type': 'application/json' } }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(d); } }); });
    r.on('error', rej); r.end(body ? JSON.stringify(body) : undefined);
  });
}
const T = { reset: () => call('POST', '/__test/reset', {}), flags: f => call('POST', '/__test/flags', f), outbox: () => call('GET', '/__test/outbox'), log: () => call('GET', '/__test/log'), sql: sql => call('POST', '/__test/sql', { sql }) };

/* abre uma página nova. opts: cfg (texto do config.js), stub (false = sem supabase-js, simula CDN fora), seed (localStorage inicial), w/h/touch */
async function open(b, opts = {}) {
  const ctx = opts.ctx || await b.newContext({ viewport: { width: opts.w || 1280, height: opts.h || 900 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, acceptDownloads: true });
  const p = await ctx.newPage(); p.errs = [];
  await p.route('**/cdn.jsdelivr.net/npm/@supabase/**', r => opts.stub === false ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: STUB }));
  await p.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: opts.cfg !== undefined ? opts.cfg : CFG_OK }));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource|fonts\.g/.test(m.text())) p.errs.push(m.text()); });
  p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
  if (opts.seed) { await p.addInitScript(s => { if (!sessionStorage.getItem('__seeded')) { for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem('__seeded', '1'); } }, opts.seed); }
  await p.goto(BASE + (opts.path || '/index.html'));
  await p.waitForTimeout(opts.wait || 350);
  return { ctx, p };
}
const txt = (p, s) => p.evaluate(s => (document.querySelector(s) || {}).innerText || '', s);
const gate = p => p.evaluate(() => document.body.dataset.gate === '1');
const click = async (p, act, v) => { await p.evaluate(([a, v]) => { document.querySelector(`[data-act="${a}"]${v !== undefined ? `[data-v="${v}"]` : ''}`).click(); }, [act, v]); await p.waitForTimeout(150); };
const fill = (p, sel, v) => p.fill(sel, v);
const nav = async (p, v) => { await p.evaluate(v => { (document.querySelector('#side [data-v="' + v + '"]') || document.querySelector('#bn [data-v="' + v + '"]') || document.querySelector('.av')).click(); }, v); await p.waitForTimeout(150); };
const today = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const waitIdle = async p => { await p.waitForFunction(() => !document.body.classList.contains('busy')); await p.waitForTimeout(80); };

/* cria conta e entra (projeto sem confirmação por e-mail) */
async function signupAndLogin(p, email, pw = 'senha-teste-123') {
  await p.click('[data-act="glogin"]'); await p.click('[data-act="gsignup"]');
  await p.fill('#ge', email); await p.fill('#gp', pw); await p.fill('#gp2', pw);
  await p.click('form[data-submit="gdosignup"] button[type=submit]');
  await p.waitForFunction(() => document.body.dataset.gate !== '1', null, { timeout: 8000 });
  await p.waitForTimeout(200);
}
async function login(p, email, pw = 'senha-teste-123') {
  await p.click('[data-act="glogin"]');
  await p.fill('#ge', email); await p.fill('#gp', pw);
  await p.click('form[data-submit="gdologin"] button[type=submit]');
  await p.waitForFunction(() => document.body.dataset.gate !== '1', null, { timeout: 8000 });
  await p.waitForTimeout(200);
}
const dbdoc = p => p.evaluate(() => JSON.parse(JSON.stringify(DB)));
module.exports = { chromium, fs, path, BASE, open, ok, txt, gate, click, fill, nav, today, T, call, waitIdle, signupAndLogin, login, dbdoc, CFG_OK, summary: () => { console.log(`\n== ${pass} OK, ${fail} FAIL`, fails); return fail; } };
