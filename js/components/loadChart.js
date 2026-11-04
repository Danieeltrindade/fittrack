/* components/loadChart.js — gráfico de evolução de carga e repetições (Progresso).
   Linha da maior carga de cada sessão, colorida pelo desempenho (gradiente), com a trilha de séries embaixo:
   cada pílula é uma série (repetições), colorida pela comparação com a mesma série da sessão anterior.
   Dados: S.hist (uma linha por série concluída: data, ex, serie, carga, reps). Nada é calculado sobre dados inventados:
   a primeira sessão e séries sem par na sessão anterior ficam neutras. */
const LoadChart = (() => {
  const KEY = 'fittrack_chartpal';
  const PALS = [
    ['a', 'Verde · Azul · Vermelho', 'Queda em vermelho, bem diferente do azul e do verde.'],
    ['b', 'Verde · Cinza · Laranja', 'Estável em cinza; a queda é laranja forte.'],
    ['c', 'Ciano · Roxo · Rosa', 'Sem verde nem vermelho (bom para daltonismo).'],
    ['d', 'Azul · Cinza · Laranja', 'Clássica para daltonismo, contraste mais forte.'],
    ['e', 'Verde · Amarelo · Vermelho', 'Semáforo clássico.']
  ];
  const THRESH = 1.5;                                   // % — acima: evolução; abaixo de −: queda; entre: estável
  const e1 = (l, r) => l * (1 + r / 30);                // carga equivalente de uma série (carga × (1 + reps/30))
  const pctF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'always' });
  const GL = { up: '▲', flat: '●', down: '▼', first: '' };
  const CN = { up: 'Evolução', flat: 'Estável', down: 'Queda', first: 'Primeira sessão' };

  let pref = { pal: 'a', glyph: false };
  try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && PALS.some(p => p[0] === o.pal)) pref = { pal: o.pal, glyph: !!o.glyph }; } catch (e) { }
  const apply = () => { try { document.documentElement.dataset.pal = pref.pal; } catch (e) { } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { } };
  apply();

  const short = d => d.slice(8) + '/' + d.slice(5, 7);
  const long = d => { const t = pd(d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const clsOf = dl => dl == null ? 'first' : dl > THRESH ? 'up' : dl < -THRESH ? 'down' : 'flat';
  const mix = dl => {                                    // cor contínua: queda → estável → evolução (mais forte quanto maior a variação)
    if (dl == null) return 'var(--lc-flat)';
    const t = Math.max(-1, Math.min(1, dl / 3));
    return t >= 0 ? `color-mix(in srgb, var(--lc-up) ${Math.round(t * 100)}%, var(--lc-flat))` : `color-mix(in srgb, var(--lc-down) ${Math.round(-t * 100)}%, var(--lc-flat))`;
  };

  /* sessões do exercício (todas), com variação em relação à sessão anterior */
  function sessions(ex) {
    const by = {};
    S.hist.filter(h => h.ex === ex && h.carga > 0).forEach(h => { (by[h.data] = by[h.data] || []).push(h); });
    const A = Object.keys(by).sort().map((d, i) => {
      const sets = by[d].slice().sort((a, b) => a.serie - b.serie).map(h => [h.carga, h.reps]);
      const reps = sets.map(s => s[1]);
      return { d, t: pd(d).getTime(), sets, n: sets.length, total: reps.reduce((a, b) => a + b, 0), maxLoad: Math.max(...sets.map(s => s[0])),
        idx: sets.reduce((a, s) => a + e1(s[0], s[1]), 0) / sets.length };
    });
    A.forEach((o, i) => { o.prev = A[i - 1] || null; o.delta = o.prev ? (o.idx / o.prev.idx - 1) * 100 : null; o.cls = clsOf(o.delta); });
    return A;
  }
  const setDelta = (o, k) => { const p = o.prev; if (!p || !p.sets[k] || !o.sets[k]) return null; const a = e1(p.sets[k][0], p.sets[k][1]); return a > 0 ? (e1(o.sets[k][0], o.sets[k][1]) / a - 1) * 100 : null; };

  function mono(P) {                                    // curva suave sem ultrapassar os pontos (monótona)
    const n = P.length; if (n < 2) return `M${P[0].x},${P[0].y}`;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1].x - P[i].x; m[i] = (P[i + 1].y - P[i].y) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${P[0].x},${P[0].y}`;
    for (let i = 0; i < n - 1; i++) d += `C${P[i].x + dx[i] / 3},${P[i].y + t[i] * dx[i] / 3} ${P[i + 1].x - dx[i] / 3},${P[i + 1].y - t[i + 1] * dx[i] / 3} ${P[i + 1].x},${P[i + 1].y}`;
    return d;
  }

  function svg(V, sel, w) {
    const mob = w < 500, rows = Math.max(...V.map(o => o.n)), rh = mob ? 22 : 24, gap = 4, T = 28, plotH = mob ? 150 : 190, gapR = 14, railH = rows * (rh + gap), B = 26, L = mob ? 50 : 60, R = 12;
    const H = T + plotH + gapR + railH + B, padX = mob ? 26 : 38;
    const t0 = V[0].t, t1 = V[V.length - 1].t, X = t => t1 === t0 ? (L + w - R) / 2 : L + padX + (t - t0) / (t1 - t0) * (w - L - R - 2 * padX);
    const loads = V.flatMap(o => o.sets.map(s => s[0])), lo = Math.floor((Math.min(...loads) - 5) / 5) * 5, hi = Math.ceil((Math.max(...loads) + 5) / 5) * 5, step = hi - lo > 30 ? 10 : 5;
    const Y = v => T + (hi - v) / (hi - lo) * plotH;
    const P = V.map(o => ({ x: X(o.t), y: Y(o.maxLoad) })), d = mono(P), x0 = P[0].x, x1 = P[P.length - 1].x, base = T + plotH, ry0 = base + gapR;
    const sp = V.length > 1 ? (x1 - x0) / (V.length - 1) : 90, pw = Math.max(28, Math.min(48, sp - 8)), roomy = sp >= 46;
    const stops = V.map((o, i) => `<stop offset="${x1 === x0 ? 0 : (P[i].x - x0) / (x1 - x0)}" style="stop-color:${mix(o.delta)}"/>`).join('');
    let g = `<defs><linearGradient id="lcg" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1 === x0 ? x0 + 1 : x1}" y2="0">${stops}</linearGradient>` +
      `<linearGradient id="lcf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<mask id="lcm" maskUnits="userSpaceOnUse" x="0" y="${T}" width="${w}" height="${plotH}"><rect y="${T}" width="${w}" height="${plotH}" fill="url(#lcf)"/></mask>` +
      `<filter id="lcb" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>`;
    const si = V.findIndex(o => o.d === sel), sx = X(V[si].t);
    g += `<rect x="${sx - 24}" y="${T}" width="48" height="${plotH + gapR + railH}" rx="10" fill="var(--hov)"/>`;
    for (let v = lo; v <= hi; v += step) g += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v} kg</text>`;
    g += `<g mask="url(#lcm)" opacity=".3"><path d="${d}L${x1},${base}L${x0},${base}Z" fill="url(#lcg)"/></g>`;
    g += `<path d="${d}" fill="none" stroke="url(#lcg)" stroke-width="7" opacity=".35" filter="url(#lcb)" stroke-linecap="round"/><path d="${d}" fill="none" stroke="url(#lcg)" stroke-width="3.5" stroke-linecap="round"/>`;
    for (let k = 0; k < rows; k++) g += `<text x="${L - 8}" y="${ry0 + k * (rh + gap) + rh / 2 + 4}" text-anchor="end">Série ${k + 1}</text>`;
    V.forEach((o, i) => {
      const x = P[i].x, y = P[i].y, c = mix(o.delta), r = o.d === sel ? 9 : 7;
      const aria = `${short(o.d)}: ` + o.sets.map((s, k) => `série ${k + 1}, ${fx(s[0])} quilos, ${s[1]} repetições`).join('; ') + (o.delta == null ? '' : `. ${CN[o.cls]}, ${pctF.format(o.delta)}%`);
      let inner = `<rect x="${x - sp / 2}" y="${T}" width="${sp}" height="${plotH + gapR + railH}" fill="transparent"/>`;
      let shape;
      if (o.cls === 'up') shape = `<path d="M${x},${y - r}L${x + r},${y + r * .8}L${x - r},${y + r * .8}Z" stroke-linejoin="round"/>`;
      else if (o.cls === 'down') shape = `<path d="M${x},${y + r}L${x + r},${y - r * .8}L${x - r},${y - r * .8}Z" stroke-linejoin="round"/>`;
      else if (o.cls === 'first') shape = `<path d="M${x},${y - r}L${x + r},${y}L${x},${y + r}L${x - r},${y}Z" stroke-linejoin="round"/>`;
      else shape = `<circle cx="${x}" cy="${y}" r="${r * .9}"/>`;
      inner += `<g style="fill:${c};stroke:var(--card);stroke-width:2.5">${shape}</g>`;
      if (roomy && o.delta != null) inner += `<text x="${x}" y="${y - r - 8}" text-anchor="middle" style="fill:${c};font-weight:700">${pctF.format(o.delta)}%</text>`;
      o.sets.forEach((s, k) => {
        const yy = ry0 + k * (rh + gap), dl = setDelta(o, k), cc = mix(dl), diff = s[0] < o.maxLoad, str = dl == null ? 0 : Math.min(1, Math.abs(dl) / 3);
        const fill = dl == null ? 'var(--s2)' : `color-mix(in srgb, ${cc} ${Math.round(34 + 40 * str)}%, var(--card))`;
        inner += `<rect x="${x - pw / 2}" y="${yy}" width="${pw}" height="${rh}" rx="7" style="fill:${fill};stroke:${dl == null ? 'var(--line)' : `color-mix(in srgb, ${cc} 70%, transparent)`}"/>`;
        const gl = pref.glyph && dl != null && pw >= 34 ? `<tspan style="font-size:8.5px;fill:${cc}" dx="3">${GL[clsOf(dl)]}</tspan>` : '';
        inner += `<text x="${x}" y="${yy + rh - 7}" text-anchor="middle" style="fill:var(--ink);font-weight:700;font-size:12.5px">${s[1]}${diff && pw > 36 ? `<tspan style="font-size:9px;font-weight:500;opacity:.85" dx="3">${fx(s[0])}</tspan>` : ''}${gl}</text>`;
        if (diff && pw <= 36) inner += `<circle cx="${x + pw / 2 - 4}" cy="${yy + 4}" r="2.4" fill="var(--ink)" opacity=".8"/>`;
      });
      g += `<g class="lcpt" data-act="lcsel" data-v="${o.d}" tabindex="0" role="button" aria-pressed="${o.d === sel}" aria-label="${esc(aria)}">${inner}</g>`;
    });
    const skip = sp < 44 ? 2 : 1;
    V.forEach((o, i) => { if (i % skip === 0 || o.d === sel) g += `<text x="${P[i].x}" y="${H - 7}" text-anchor="middle" style="${o.d === sel ? 'fill:var(--ink);font-weight:700' : ''}">${short(o.d)}</text>`; });
    return `<svg class="ch lcsvg" viewBox="0 0 ${w} ${H}" role="group" aria-label="Carga por sessão com as repetições de cada série">${g}</svg>`;
  }

  function detail(o) {
    const rows = o.sets.map((s, k) => { const dl = setDelta(o, k), c = clsOf(dl);
      return `<tr><td>Série ${k + 1}</td><td>${fx(s[0])} kg</td><td>${s[1]}</td><td><span class="lcv ${c}">${dl == null ? '—' : GL[c] + ' ' + pctF.format(dl) + '%'}</span></td></tr>`; }).join('');
    let why = '';
    if (o.prev) { const dl = o.maxLoad - o.prev.maxLoad, dr = o.total / o.n - o.prev.total / o.prev.n;
      why = `<p class="lcn">Em relação a ${short(o.prev.d)}: carga ${dl === 0 ? 'igual' : (dl > 0 ? '+' : '−') + fx(Math.abs(dl)) + ' kg'}, repetições médias ${Math.abs(dr) < 0.05 ? 'iguais' : (dr > 0 ? '+' : '−') + fx(Math.abs(dr))}.</p>`; }
    return `<div class="lcd"><div><h3>${long(o.d)}</h3><p class="mut">${esc(S.ex)}</p>
<div class="lcch"><div><b>${o.n}</b>série${o.n === 1 ? '' : 's'}</div><div><b>${o.total}</b>repetições no total</div><div><b>${fx(o.maxLoad)} kg</b>maior carga</div></div>
<span class="lcst ${o.cls}">${GL[o.cls] ? GL[o.cls] + ' ' : '◆ '}${CN[o.cls]}${o.delta == null ? '' : ' · ' + pctF.format(o.delta) + '%'}</span>${why}</div>
<div class="lctw"><table><thead><tr><th>Série</th><th>Carga</th><th>Repetições</th><th>vs. anterior</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${o.n} série${o.n === 1 ? '' : 's'}</td><td>${o.total}</td><td></td></tr></tfoot></table></div></div>`;
  }

  function palettes() {
    const cur = PALS.find(p => p[0] === pref.pal);
    return `<div class="lcpal"><p class="cap" id="lcpl">Cores do gráfico</p><div class="lcps" role="group" aria-labelledby="lcpl">${PALS.map((p, i) => `<button type="button" class="lcp" data-pal="${p[0]}" data-act="lcpal" data-v="${p[0]}" aria-pressed="${p[0] === pref.pal}" aria-label="Paleta ${i + 1}: ${p[1]}" title="${p[1]}"><span><i style="background:var(--lc-up)"></i><i style="background:var(--lc-flat)"></i><i style="background:var(--lc-down)"></i></span><b>${i + 1}</b></button>`).join('')}
<label class="lcg"><input type="checkbox" data-chg="lcglyph" ${pref.glyph ? 'checked' : ''}> Símbolos nas séries</label></div><p class="lcn" id="lcpn">${cur[1]}. ${cur[2]}</p></div>`;
  }

  /* conteúdo do cartão (o cartão em si fica em views/progress.js) */
  function inner() {
    const all = sessions(S.ex), cut = S.range ? ago(S.range).getTime() : 0, V = all.filter(o => o.t >= cut);
    if (!V.length) return '<div class="empty">Sem registros neste período.</div>';
    const sel = V.some(o => o.d === S.lcSel) ? S.lcSel : V[V.length - 1].d, o = V.find(x => x.d === sel);
    return `<div class="lcb">${svg(V, sel, W)}</div>
<div class="leg"><span><i class="lcgr"></i>Queda · Estável · Evolução</span><span>▲ evolução ● estável ▼ queda ◆ primeira sessão</span></div>
<p class="lcn">Linha: maior carga da sessão. Pílulas: repetições de cada série, comparadas com a mesma série da sessão anterior. Toque em uma data para ver os detalhes.</p>
${detail(o)}${palettes()}
<details class="lcx"><summary>Como as cores são calculadas</summary><p>Cada série vira uma carga equivalente (carga × (1 + repetições ÷ 30)). A linha usa a média das séries da sessão, comparada com a sessão anterior. Acima de +${THRESH}% é evolução, entre −${THRESH}% e +${THRESH}% é estável e abaixo de −${THRESH}% é queda. Subir a carga com menos repetições conta como evolução. A primeira sessão, ou uma série que não existia na sessão anterior, fica neutra. Nada é estimado para registros antigos.</p></details>`;
  }
  const draw = () => { const el = document.getElementById('lcbox'); if (el) el.innerHTML = inner(); };

  on('lcsel', (b, v) => { S.lcSel = v; draw(); const n = document.querySelector(`.lcpt[data-v="${v}"]`); if (n) n.focus({ preventScroll: true }); });
  on('lcpal', (b, v) => { if (!PALS.some(p => p[0] === v)) return; pref.pal = v; save(); apply(); draw(); const n = document.querySelector(`.lcp[data-v="${v}"]`); if (n) n.focus({ preventScroll: true }); });
  onChange('lcglyph', (el) => { pref.glyph = !!el.checked; save(); draw(); const n = document.querySelector('.lcg input'); if (n) n.focus({ preventScroll: true }); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('lcpt')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });

  return { inner, sessions, PALS, get pref() { return pref; } };
})();
