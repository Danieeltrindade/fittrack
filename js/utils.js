/* utils.js — funções puras e pequenas, usadas por todos os módulos. */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('pt-BR');                                   // inteiro, pt-BR
const fx = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });                  // até 1 casa decimal
const sum = (a, k) => a.reduce((x, y) => x + (y[k] || 0), 0);
const pct = (v, g) => g > 0 ? v / g : 0;
const r1 = x => Math.round(x * 10) / 10;
/* ID único (UUID v4). Contas na nuvem exigem UUID; o formato também serve para dados locais da demonstração. */
const uid = () => {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const isUuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const clone = o => JSON.parse(JSON.stringify(o));

/* SHA-256 (hex) de um texto — identifica um arquivo de dados antigo sem guardar o conteúdo. Funciona também fora de HTTPS. */
async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  try { if (window.crypto && crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { }
  const K = [], rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let n = 2, c = 0; c < 64; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) { K[c++] = (Math.cbrt(n) % 1) * 4294967296 | 0; } }
  const Hh = []; for (let n = 2, c = 0; c < 8; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) { Hh[c++] = (Math.sqrt(n) % 1) * 4294967296 | 0; } }
  const l = bytes.length, padLen = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(padLen);
  m.set(bytes); m[l] = 128; const dv = new DataView(m.buffer); dv.setUint32(padLen - 4, (l * 8) >>> 0); dv.setUint32(padLen - 8, Math.floor(l * 8 / 4294967296));
  const w = new Int32Array(64);
  for (let o = 0; o < padLen; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, h] = Hh;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { Hh[i] = (Hh[i] + v) | 0; });
  }
  return Hh.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/* datas: sempre "AAAA-MM-DD" no fuso local */
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const pd = s => new Date(s + 'T12:00:00');
const dm = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const dlong = d => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const shiftDate = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };

/* validadores (importação de backup) */
const isD = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(pd(s)) === s;
const isN = (x, min = 0) => typeof x === 'number' && isFinite(x) && x >= min;
const isO = x => !!x && typeof x === 'object' && !Array.isArray(x);
const hasId = x => typeof x.id === 'string' && x.id !== '';

/* Lê "150 g", "2 fatias", "1 unid." → { portion, unit }. Usado na migração e ao salvar alimento manual na biblioteca. */
function parseQty(q) {
  const m = String(q == null ? '' : q).trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { portion: 1, unit: 'porção' };
  const portion = parseFloat(m[1].replace(',', '.')) || 1;
  let u = m[2].trim().toLowerCase();
  if (['g', 'gr', 'grama', 'gramas'].includes(u)) u = 'g';
  else if (['ml', 'mililitro', 'mililitros'].includes(u)) u = 'ml';
  return { portion, unit: (u || 'un').slice(0, 12) };
}
