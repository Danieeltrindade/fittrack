/* store.js — documento de dados em memória (DB) + escrita confirmada.
   Modo demonstração: grava em DemoRepo (localStorage "fittrack_demo_v1"), síncrono como antes.
   Modo pessoal: grava no Supabase via CloudRepo. A tela SÓ muda depois que o servidor confirma; se falhar, DB continua
   como estava e o erro é mostrado (nunca aparece "salvo" sem confirmação).
   Escritas são enfileiradas (uma por vez, na ordem) e cada uma envia só o que mudou. */
let DB;              // dados em memória (somente da sessão atual: é descartado ao sair da conta)
let memOnly = false; // true se o navegador não permitir localStorage

const valid = o => !!o && typeof o === 'object' && !!o.profile && ['workouts', 'workoutHistory', 'foods', 'meals', 'weightHistory'].every(k => Array.isArray(o[k]));
const carryApp = nd => { const a = DB && DB.profile && DB.profile.appearance; if (a && nd && nd.profile) nd.profile.appearance = a; return nd; };

const Store = {
  mode: 'none',        // 'none' | 'demo' | 'personal'
  epoch: 0,            // sobe a cada troca de modo/conta: respostas atrasadas de outra sessão são descartadas
  busy: 0,             // >0 enquanto uma gravação está em andamento (bloqueia cliques repetidos)
  _q: Promise.resolve(),

  _busy(n) { this.busy = Math.max(0, this.busy + n); document.body.classList.toggle('busy', this.busy > 0); },
  /* troca de sessão: nada da anterior pode sobrar na memória */
  reset(mode) { this.mode = mode; this.epoch++; this.busy = 0; this._q = Promise.resolve(); DB = null; document.body.classList.remove('busy'); },

  fail(e) {
    const msg = e && e.message && e.kind ? e.message : 'Não foi possível salvar. Nada foi alterado.';
    toast(msg, 5200);
    if (e && e.kind === 'network') this.syncSoon = true;
    render();   // volta qualquer campo/botão ao estado real dos dados
  },

  /* fn(next) altera uma CÓPIA do documento. Devolve Promise<boolean>: true só se a gravação foi confirmada. */
  update(fn) {
    const ep = this.epoch, cloud = this.mode === 'personal';
    if (cloud) this._busy(1);                          // já ocupado ao ENFILEIRAR: toques repetidos logo em seguida são ignorados
    const job = async () => {
      try { return await run(); } finally { if (cloud && ep === this.epoch) this._busy(-1); }
    };
    const run = async () => {
      if (!DB || ep !== this.epoch) return false;
      if (this.mode === 'demo') {
        try { const f = DemoRepo.load(); DB = f; } catch (e) { }      // lê de novo: outra aba não é sobrescrita por estado velho
        const next = clone(DB);
        try { fn(next); } catch (e) { toast('Não foi possível aplicar a alteração.'); return false; }
        DB = next;
        if (!DemoRepo.save(DB)) toast('Sem acesso ao armazenamento do navegador: a demonstração vale só até fechar a página.');
        render(); return true;
      }
      const next = clone(DB);
      try { fn(next); } catch (e) { toast('Não foi possível aplicar a alteração.'); return false; }
      try {
        await CloudRepo.commit(DB, next);
        if (ep !== this.epoch) return false;             // o usuário saiu/trocou de conta durante a gravação
        DB = next; render(); return true;
      } catch (e) {
        if (ep === this.epoch) this.fail(e);
        return false;
      }
    };
    const p = this._q.then(job, job);
    this._q = p.catch(() => { });
    return p;
  },
  add(col, item) { item.id = item.id || uid(); return this.update(d => { d[col].push(item); }); },
  remove(col, id) { return this.update(d => { d[col] = d[col].filter(i => i.id !== id); }); },

  /* relê do servidor (após importação, reconexão ou erro) */
  async reload() {
    if (this.mode !== 'personal') return false;
    const ep = this.epoch;
    this._busy(1);
    try {
      const d = await CloudRepo.load();
      if (ep !== this.epoch) return false;
      DB = d; this.syncSoon = false; render(); return true;
    } catch (e) { if (ep === this.epoch) toast(e.message || 'Não foi possível atualizar os dados.', 5200); return false; }
    finally { this._busy(-1); }
  },

  /* "Apagar dados": apaga os dados da conta no servidor e só então esvazia a tela */
  async clear() {
    if (this.mode === 'demo') return this.restoreDemo();
    const ep = this.epoch; this._busy(1);
    try {
      await CloudRepo.wipe();
      if (ep !== this.epoch) return false;
      DB = carryApp(emptyData()); CloudRepo.legacyHashes = []; render(); return true;
    } catch (e) { if (ep === this.epoch) this.fail(e); return false; }
    finally { this._busy(-1); }
  },
  restoreDemo() { if (this.mode !== 'demo') return false; DB = DemoRepo.reset(); render(); return true; }
};
