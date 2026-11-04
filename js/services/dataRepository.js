/* services/dataRepository.js — ÚNICA camada que lê/grava dados persistentes.
     Repo.demo  → modo demonstração: dados FICTÍCIOS em localStorage["fittrack_demo_v1"]. Nunca fala com o servidor.
     Repo.cloud → modo pessoal: banco do Supabase (fonte da verdade). Só chama as funções RPC das migrações.
   Regra de propriedade: em cada modo existe EXATAMENTE um mecanismo de persistência. localStorage nunca guarda dados
   pessoais do modo pessoal (só preferências de aparência e a cópia de segurança da migração, a pedido do usuário). */
const DEMO_KEY = 'fittrack_demo_v1';
const PREFS_KEY = 'fittrack_prefs';
const RPC_TIMEOUT_MS = 25000;

class RepoError extends Error { constructor(kind, message, raw) { super(message); this.kind = kind; this.raw = raw; } }
// kind: network | auth | permission | validation | config | unknown

function classify(e, status) {
  const code = String(e && (e.code || '') || ''), m = String(e && e.message || e || ''), ml = m.toLowerCase();
  status = status || (e && e.status) || 0;
  if (e && e.__timeout || /failed to fetch|networkerror|network request failed|load failed|timeout|fetch failed|err_internet|offline/.test(ml) || (typeof navigator !== 'undefined' && navigator.onLine === false))
    return new RepoError('network', 'Sem conexão com o servidor. Nada foi alterado.', e);
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || code === '28000' || /jwt|not_authenticated|auth session missing/.test(ml))
    return new RepoError('auth', 'Sua sessão expirou. Entre novamente.', e);
  if (status === 403 || code === '42501' || /permission denied|row-level security|violates row/.test(ml))
    return new RepoError('permission', 'O servidor recusou a operação por falta de permissão. Nada foi alterado.', e);
  if (/^(22|23)/.test(code) || /invalid_|violates|invalid input|out of range/.test(ml))
    return new RepoError('validation', 'O servidor recusou os dados enviados (valor inválido). Nada foi alterado.', e);
  return new RepoError('unknown', 'Não foi possível concluir a operação no servidor. Nada foi alterado.', e);
}
const withTimeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej({ __timeout: true, message: 'timeout' }), ms);
  Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
});

/* ---------- demonstração (local, fictícia) ---------- */
const DemoRepo = {
  load() {
    let raw = null;
    try { raw = localStorage.getItem(DEMO_KEY); } catch (e) { memOnly = true; }
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o && valid(o.data)) { migrate(o.data); return o.data; }
      } catch (e) { }
      try { localStorage.setItem(DEMO_KEY + '_corrompido', raw); } catch (e) { }   // dados da demo são fictícios, mas não perdemos o texto
    }
    const d = defaultData(); this.save(d); return d;
  },
  save(doc) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify({ v: 1, data: doc })); return true; }
    catch (e) { memOnly = true; return false; }
  },
  reset() { const d = carryApp(defaultData()); this.save(d); return d; }
};

/* ---------- nuvem (Supabase) ---------- */
const CloudRepo = {
  legacyHashes: [],

  async rpc(name, args) {
    const c = Cloud.client();
    if (!c) throw new RepoError('config', Cloud.describe() || 'Serviço de contas indisponível.');
    const once = async () => {
      let r;
      try { r = await withTimeout(c.rpc(name, args), RPC_TIMEOUT_MS); }
      catch (e) { throw classify(e); }
      if (r.error) throw classify(r.error, r.status);
      return r.data;
    };
    try { return await once(); }
    catch (e) {
      if (e.kind !== 'auth') throw e;
      // token vencido: renova uma vez e repete. As operações são idempotentes (gravam por ID), então repetir é seguro.
      const s = await Auth.refresh();
      if (!s) { Boot.sessionLost('Sua sessão expirou. Entre novamente — a última alteração não foi salva.'); throw e; }
      return once();
    }
  },

  async load() {
    const d = await this.rpc('get_my_data', {});
    if (!d || typeof d !== 'object' || !valid(d)) throw new RepoError('unknown', 'Resposta inesperada do servidor.');
    this.legacyHashes = Array.isArray(d.legacyImported) ? d.legacyImported : [];
    delete d.legacyImported;
    d.hydration = d.hydration || [];
    d.savedMeals = d.savedMeals || [];
    migrate(d);
    return d;
  },
  /* grava as diferenças entre dois estados. Só devolve se o servidor confirmou. */
  async commit(prev, next) {
    const ops = Changes.diff(prev, next);
    if (!ops.length) return 0;
    const bad = Changes.badIds(ops);
    if (bad.length) throw new RepoError('validation', 'Identificador inválido nos dados; nada foi enviado.');
    const r = await this.rpc('apply_changeset', { p: { ops } });
    if (!r || typeof r.applied !== 'number' || r.applied !== ops.length) throw new RepoError('unknown', 'O servidor não confirmou a gravação.');
    return ops.length;
  },
  /* importação transacional (uma chamada = uma transação no banco) */
  importBackup(doc, mode) { return this.rpc('import_backup', { p: doc, p_mode: mode }); },
  markLegacy(hash, summary) { return this.rpc('mark_legacy_import', { p_key: hash, p_summary: summary }); },
  wipe() { return this.rpc('delete_all_my_data', {}); }
};

const Repo = { demo: DemoRepo, cloud: CloudRepo };

/* preferências visuais locais (não são dados pessoais): usadas na tela inicial, antes de qualquer login */
function savePrefs(a) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: a.theme, accent: a.accent })); } catch (e) { } }
function loadPrefs() { try { const o = JSON.parse(localStorage.getItem(PREFS_KEY)); if (o && typeof o === 'object') return o; } catch (e) { } return null; }
