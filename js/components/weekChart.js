/* components/weekChart.js — Resumo da semana (Início): calorias, proteínas, carboidratos e gorduras juntos, em % da meta do dia.
   Barras lado a lado por dia; acima de 100% a barra continua (hachurada). Clique/Enter em um dia mostra os valores reais. */
const WeekChart = (() => {
  const NU = [['k', 'cal', 'Calorias', 'kcal', 'cal'], ['p', 'prot', 'Proteínas', 'g', 'prot'], ['c', 'carb', 'Carboidratos', 'g', 'carb'], ['g', 'fat', 'Gorduras', 'g', 'fat']]; // [chave em dayAll, chave em goals(), nome, unidade, cor]
  const MX = 140, DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  let sel = null, uidn = 0;
  const days = () => { const G = goals(); return [6, 5, 4, 3, 2, 1, 0].map(i => { const d = ago(i), a = dayAll(iso(d)); return { d, a, has: a.k > 0, key: iso(d), G }; }); };
  const avg = (D, k) => { const A = D.filter(x => x.has); return A.length ? A.reduce((s, x) => s + x.a[k], 0) / A.length : null; };
  const cur = D => { const ok = D.find(x => x.key === sel); return ok ? ok.key : (D.filter(x => x.has).pop() || D[D.length - 1]).key; };
  const sd = (d) => DOW[d.getDay()] + ' ' + dm(d);

  function svg(D, W, selKey) {
    const H = Math.max(230, Math.min(280, Math.round(W * .42))), L = 40, R = 10, T = 14, B = 28, gw = (W - L - R) / D.length, Y = p => T + (1 - p / MX) * (H - T - B), id = 'wh' + (++uidn);
    const G = D[0].G;
    let g = `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="#fff" fill-opacity=".4"/></pattern></defs>`;
    g += [0, 50, 100].map(p => `<line x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 7}" y="${Y(p) + 4}" text-anchor="end">${p}%</text>`).join('');
    D.forEach((x, i) => {
      const cx = L + gw * (i + .5), on = x.key === selKey; let inner = '';
      if (x.has) {
        const bw = Math.max(4, Math.min(15, (gw - 12) / 4)), gap = 2.5, tot = 4 * bw + 3 * gap;
        NU.forEach((n, k) => {
          const raw = G[n[1]] > 0 ? x.a[n[0]] / G[n[1]] * 100 : 0, p = Math.min(MX, raw), bx = cx - tot / 2 + k * (bw + gap);
          inner += `<rect x="${bx}" y="${Y(p)}" width="${bw}" height="${Math.max(0, H - B - Y(p))}" rx="3" fill="var(--c-${n[4]})"/>`;
          if (p > 100) inner += `<rect x="${bx}" y="${Y(p)}" width="${bw}" height="${Y(100) - Y(p)}" rx="3" fill="url(#${id})"/>`;
        });
      } else inner = `<text x="${cx}" y="${Y(0) - 8}" text-anchor="middle" style="font-size:9.5px">${gw < 56 ? '—' : 's/ registro'}</text>`;
      g += `<g class="wkd" data-act="wkday" data-v="${x.key}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${sd(x.d)}${x.has ? ': ' + NU.map(n => n[2] + ' ' + fmt(x.a[n[0]]) + ' ' + n[3]).join(', ') : ': sem registros'}"><rect x="${cx - gw / 2 + 1}" y="${T}" width="${gw - 2}" height="${H - T - B}" rx="8" fill="${on ? 'var(--hov)' : 'transparent'}"/>${inner}</g><text x="${cx}" y="${H - 8}" text-anchor="middle" style="${on ? 'fill:var(--ink);font-weight:700' : ''}">${dm(x.d)}</text>`;
    });
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(100)}" y2="${Y(100)}" stroke="var(--ink)" stroke-opacity=".55" stroke-dasharray="5 4"/><text x="${W - R}" y="${Y(100) - 5}" text-anchor="end">meta</text>`;
    return `<svg class="ch wkc" viewBox="0 0 ${W} ${H}" role="group" aria-label="Calorias, proteínas, carboidratos e gorduras por dia, em porcentagem da meta">${g}</svg>`;
  }
  function detail(D, selKey) {
    const x = D.find(o => o.key === selKey), G = x.G;
    if (!x.has) return `<div class="wkdt"><div><b>${sd(x.d)}</b><span>Sem registros neste dia. Dias sem registro ficam fora das médias.</span></div></div>`;
    return `<div class="wkdt">${NU.map(n => { const v = x.a[n[0]], gl = G[n[1]], p = gl > 0 ? Math.round(v / gl * 100) : 0, df = v - gl; return `<div class="k-${n[4]}"><span><i></i>${n[2]}</span><b>${fmt(v)} / ${fmt(gl)} ${n[3]}</b><em>${p}% · ${df > 0 ? fmt(df) + ' ' + n[3] + ' acima' : df === 0 ? 'meta atingida' : fmt(-df) + ' ' + n[3] + ' restantes'}</em></div>`; }).join('')}</div>`;
  }
  const lg = () => `<div class="wkl">${NU.map(n => `<span><i style="background:var(--c-${n[4]})"></i>${n[2]}</span>`).join('')}<span>Tracejado = meta do dia (100%)</span></div>`;
  function tiles(D, dls) {
    const m = NU.map(n => { const a = avg(D, n[0]), gl = D[0].G[n[1]]; return `<div class="k-${n[4]}"><b>${a === null ? '—' : fmt(a) + `<small> ${n[3]}</small>`}</b><span><i></i>média de ${n[2].toLowerCase()}${a === null || !(gl > 0) ? '' : ' · ' + Math.round(a / gl * 100) + '%'}</span></div>`; }).join('');
    return `<div class="wkt"><div><b>${S.feitos}<small> / ${S.treinos.length}</small></b><span>treinos feitos</span></div><div><b>${dls}</b><span>peso em 7 dias</span></div>${m}</div>`;
  }
  /* corpo do cartão: tiles + gráfico + legenda + detalhe do dia */
  function inner(dls) {
    const D = days(), k = cur(D), box = document.getElementById && document.getElementById('wkbox'), W = Math.max(300, Math.floor((box && box.clientWidth) || (window.innerWidth < 768 ? 330 : 640)));
    const none = !(D[0].G.cal > 0) ? '<p class="wkn">Defina suas metas em Configurações para ver o gráfico em % da meta.</p>' : '';
    return `${tiles(D, dls)}${none}<div id="wkch">${svg(D, W, k)}</div>${lg()}<div id="wkdt">${detail(D, k)}</div>`;
  }
  let lastDls = '—';
  const redraw = () => { const el = document.getElementById('wkbox'); if (el) el.innerHTML = inner(lastDls); };
  const card = dls => { lastDls = dls; return `<div id="wkbox" class="wkbox">${inner(dls)}</div>`; };
  on('wkday', (b, v) => { sel = v; redraw(); const n = document.querySelector(`.wkd[data-v="${v}"]`); if (n) n.focus({ preventScroll: true }); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('wkd')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  let tm; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => { if (typeof S !== 'undefined' && S.view === 'inicio') redraw(); }, 150); });
  return { card, days, avg, NU };
})();
