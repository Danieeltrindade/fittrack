/* components/charts.js — gráficos SVG feitos à mão (linha e barras) com tooltips. */
let W=640,H=230;const L=40,R=12,T=14,B=30;
function axes(mn,mx,Y){return [0,1,2].map(i=>{const v=mn+(mx-mn)*i/2;return `<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end">${fx(v)}</text>`}).join('')}
function pts(A,u,label,pre,post){return A.map((p,i)=>({...p,tip:`<b>${dlong(new Date(p.t))}</b>${pre?'<br>'+pre(p):''}<br>${label}: ${fx(p.v)} ${u}${post?'<br>'+post(p):''}${i?`<br><span class="${p.v>=A[i-1].v?'up':'dw'}">${p.v>=A[i-1].v?'+':''}${fx(p.v-A[i-1].v)} ${u} vs. anterior</span>`:''}`}))}
function line(P,u,col){col=col||'var(--accent)';if(!P.length)return '<div class="empty">Sem registros neste período.</div>';const ts=P.map(p=>p.t),t0=Math.min(...ts),t1=Math.max(...ts),vs=P.map(p=>p.v);let mn=Math.min(...vs),mx=Math.max(...vs);const pad=(mx-mn||1)*.3;mn-=pad;mx+=pad;if(mn<0)mn=0;
const X=t=>t1===t0?(L+W-R)/2:L+(t-t0)/(t1-t0)*(W-L-R),Y=v=>T+(mx-v)/(mx-mn)*(H-T-B),tk=t1===t0?[t0]:[0,1,2,3,4].map(i=>t0+(t1-t0)*i/4),pl=P.map(p=>X(p.t)+','+Y(p.v)).join(' ');
return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de linha">${axes(mn,mx,Y)}<polygon points="${X(t0)},${Y(mn)} ${pl} ${X(t1)},${Y(mn)}" fill="color-mix(in srgb,${col} 14%,transparent)"/><polyline points="${pl}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${P.map(p=>`<g data-tip="${esc(p.tip)}"><circle cx="${X(p.t)}" cy="${Y(p.v)}" r="14" fill="transparent"/><circle cx="${X(p.t)}" cy="${Y(p.v)}" r="4" fill="var(--bg)" stroke="${col}" stroke-width="2.5" pointer-events="none"/></g>`).join('')}${tk.map(t=>`<text x="${X(t)}" y="${H-8}" text-anchor="middle">${dm(new Date(t))}</text>`).join('')}</svg>`}
function bars(P,goal,u,label,col){col=col||'var(--accent)';if(!P.length)return '<div class="empty">Sem registros neste período.</div>';const n=P.length,mx=(Math.max(...P.map(p=>p.v),goal)||1)*1.1,w=(W-L-R)/n,Y=v=>T+(mx-v)/mx*(H-T-B),ti=n<=7?P.map((_,i)=>i):[0,1,2,3,4].map(i=>Math.round((n-1)*i/4));
return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">${axes(0,mx,Y)}${P.map((p,i)=>`<rect data-tip="${esc(`<b>${dlong(new Date(p.t))}</b><br>${label}: ${fmt(p.v)} ${u}<br>${goal?Math.round(p.v/goal*100):0}% da meta${goal&&p.v>goal?'<br>'+fmt(p.v-goal)+' '+u+' acima da meta':''}`)}" x="${L+i*w+w*.14}" y="${Y(p.v)}" width="${w*.72}" height="${H-B-Y(p.v)}" rx="${Math.min(4,w/3)}" fill="${col}" fill-opacity="${p.v>=goal*.9?1:.5}"/>`).join('')}<line x1="${L}" x2="${W-R}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--mut)" stroke-width="1.5" stroke-dasharray="6 5"/><text x="${W-R}" y="${Y(goal)-6}" text-anchor="end">meta ${fmt(goal)} ${u}</text>${ti.map(i=>`<text x="${L+i*w+w/2}" y="${H-8}" text-anchor="middle">${dm(new Date(P[i].t))}</text>`).join('')}</svg>`}
// largura temporária para gráficos em cartões estreitos
const cw = (w, f) => { const o = W; W = Math.min(o, w); try { return f(); } finally { W = o; } };

// Tooltip dos pontos/barras (atributo data-tip)
const tp = document.createElement('div'); tp.id = 'tp'; document.body.append(tp);
function tip(e) {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) { tp.style.display = 'none'; return; }
  tp.innerHTML = el.getAttribute('data-tip'); tp.style.display = 'block';
  const x = Math.min(e.clientX + 14, innerWidth - tp.offsetWidth - 8), y = e.clientY - tp.offsetHeight - 12;
  tp.style.left = Math.max(8, x) + 'px'; tp.style.top = (y < 8 ? e.clientY + 18 : y) + 'px';
}
['mouseover', 'mousemove', 'click'].forEach(ev => document.addEventListener(ev, tip));
