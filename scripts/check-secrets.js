#!/usr/bin/env node
/* Verifica se algum arquivo do projeto contém segredos (chave secreta/service_role do Supabase, senha de banco, tokens).
   Uso: node scripts/check-secrets.js      → sai com código 1 se achar algo.
   Recomendado rodar antes de cada commit/publicação (ver README). */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIR = new Set(['node_modules', '.git', '.supabase']);
const ALLOW = new Set(['scripts/check-secrets.js', 'README.md', 'js/services/supabase.js', 'tests/e2e/t4_demo.js', 'js/config.js', 'js/config.example.js', '.gitignore', 'supabase/migrations/20261009000001_schema.sql', 'supabase/migrations/20261009000002_rls.sql', 'supabase/migrations/20261009000003_functions.sql']);
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP_DIR.has(e.name)) continue; const f = path.join(d, e.name); e.isDirectory() ? walk(f) : files.push(f); } })(ROOT);

const problems = [];
const jwtRole = t => { try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).role; } catch (e) { return null; } };
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (/\.(png|jpg|jpeg|gif|ico|woff2?|zip|pdf)$/i.test(rel)) continue;
  let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  const add = (why, m) => problems.push(`${rel}: ${why} → ${String(m).slice(0, 40)}…`);
  let m;
  if ((m = txt.match(/sb_secret_[A-Za-z0-9_\-]{16,}/)) && !ALLOW.has(rel)) add('chave secreta do Supabase (sb_secret_…)', m[0]);
  for (const t of txt.match(/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g) || []) { if (jwtRole(t) === 'service_role') add('JWT com papel service_role', t); }
  if ((m = txt.match(/postgres(?:ql)?:\/\/[^\s:@\/'"]+:([^\s@'"]{3,})@[^\s'"]+/))) add('URL de banco com senha', m[0]);
  if (!ALLOW.has(rel) && (m = txt.match(/service_role['"`]?\s*[:=]\s*['"`][A-Za-z0-9._\-]{20,}/))) add('valor atribuído a service_role', m[0]);
  if (/^js\/config(\.local)?\.js$/.test(rel) && (m = txt.match(/supabaseKey\s*:\s*['"]([^'"]*)['"]/))) {
    const k = m[1]; if (/^sb_secret_/i.test(k) || jwtRole(k) === 'service_role') add('config.js com chave SECRETA', k);
  }
  if (/(^|\/)\.env/.test(rel)) add('arquivo .env versionável', rel);
}
if (problems.length) { console.error('POSSÍVEIS SEGREDOS ENCONTRADOS:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`OK: nenhum segredo encontrado em ${files.length} arquivos.`);
