/* services/photos.js — fotos de alimentos e refeições (apenas registro visual; SEM reconhecimento por IA).
   Onde ficam:
     • conta pessoal  → Supabase Storage, bucket PRIVADO "food-photos", pasta <user_id>/<uuid>.jpg (RLS no banco; links assinados temporários)
     • demonstração   → IndexedDB do navegador ("fittrack_demo_photos"), nunca enviado a servidor
   O documento de dados guarda só a REFERÊNCIA (caminho/uuid) da foto. Toda imagem é convertida para JPEG no aparelho
   (máx. 1280 px, < 1 MB) antes de enviar, o que também remove metadados como localização (EXIF). */
const Photos = (() => {
  const BUCKET = 'food-photos', MAX_BYTES = 1048576, MAX_INPUT = 25 * 1024 * 1024, DB_NAME = 'fittrack_demo_photos', STORE = 'photos';
  const cache = new Map();          // ref → { url, exp }
  let idb = null;

  class PhotoError extends Error { constructor(msg, raw) { super(msg); this.raw = raw; } }

  /* ---------- imagem → JPEG pequeno ---------- */
  async function decode(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { } }
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
      im.src = u;
    });
  }
  const toBlob = (cv, q) => new Promise(res => cv.toBlob(b => res(b), 'image/jpeg', q));
  async function encode(src, maxPx, q, limit) {
    let w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    if (!w || !h) throw new PhotoError('Não foi possível ler essa imagem.');
    for (let i = 0; i < 6; i++) {
      const k = Math.min(1, maxPx / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch); cx.drawImage(src, 0, 0, cw, ch);
      const b = await toBlob(cv, q);
      if (!b) throw new PhotoError('Não foi possível processar essa imagem.');
      if (b.size <= limit) return b;
      q = Math.max(.4, q - .1); maxPx = Math.round(maxPx * .85);
    }
    throw new PhotoError('A imagem é grande demais, mesmo depois de reduzida. Escolha outra foto.');
  }
  /* valida e reduz. Devolve { blob, url } (url = pré-visualização local; revogue com URL.revokeObjectURL quando acabar) */
  async function prepare(file) {
    if (!file || !/^image\//i.test(file.type || '')) throw new PhotoError('Escolha um arquivo de imagem (JPG, PNG, WebP…).');
    if (file.size > MAX_INPUT) throw new PhotoError('Imagem maior que 25 MB. Escolha outra foto.');
    let src; try { src = await decode(file); } catch (e) { throw new PhotoError('Não foi possível abrir essa imagem. Formatos como HEIC podem não ser aceitos pelo navegador — use JPG ou PNG.', e); }
    const blob = await encode(src, 1280, .82, MAX_BYTES);
    if (src.close) try { src.close(); } catch (e) { }
    return { blob, url: URL.createObjectURL(blob) };
  }

  /* ---------- IndexedDB (demonstração) ---------- */
  function openDb() {
    if (idb) return idb;
    idb = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new PhotoError('Este navegador não permite guardar fotos localmente.')); return; }
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(new PhotoError('Não foi possível abrir o armazenamento de fotos do navegador.', r.error));
    });
    idb.catch(() => { idb = null; });
    return idb;
  }
  const idbDo = async (mode, fn) => { const db = await openDb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE); const rq = fn(st); tx.oncomplete = () => res(rq && rq.result); tx.onerror = tx.onabort = () => rej(new PhotoError('Falha ao gravar a foto no navegador.', tx.error)); }); };

  /* ---------- Storage (conta) ---------- */
  const bucket = () => { const c = Cloud.client(); if (!c || !c.storage) throw new PhotoError('Serviço de fotos indisponível.'); return c.storage.from(BUCKET); };
  const cloudErr = (e, what) => {
    const m = String(e && e.message || e || ''), ml = m.toLowerCase(), st = e && (e.statusCode || e.status);
    if (typeof navigator !== 'undefined' && navigator.onLine === false || /failed to fetch|networkerror|load failed|fetch failed/.test(ml)) return new PhotoError(`Sem conexão: não foi possível ${what} a foto.`, e);
    if (st == 401 || st == 403 || /jwt|row-level|unauthorized|not allowed|policy/.test(ml)) return new PhotoError(`O servidor recusou ${what === 'enviar' ? 'o envio d' : 'a leitura d'}a foto (permissão ou sessão expirada).`, e);
    if (st == 413 || /too large|payload|size/.test(ml)) return new PhotoError('A foto passou do limite de 1 MB do servidor.', e);
    if (/bucket not found|not found/.test(ml) && what === 'enviar') return new PhotoError('O bucket de fotos ainda não existe no seu Supabase. Rode a migração 4 (README).', e);
    return new PhotoError(`Não foi possível ${what} a foto.`, e);
  };
  const personal = () => Store.mode === 'personal';

  /* ---------- API ---------- */
  async function upload(blob) {
    if (personal()) {
      const path = `${Boot.uid}/${uid()}.jpg`;
      let r; try { r = await bucket().upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' }); } catch (e) { throw cloudErr(e, 'enviar'); }
      if (r.error) throw cloudErr(r.error, 'enviar');
      return path;
    }
    const ref = uid(); await idbDo('readwrite', s => s.put(blob, ref)); return ref;
  }
  async function blobOf(ref) {
    if (personal()) {
      const u = await src(ref); const r = await fetch(u); if (!r.ok) throw new PhotoError('Não foi possível baixar a foto.'); return r.blob();
    }
    const b = await idbDo('readonly', s => s.get(ref)); if (!b) throw new PhotoError('Foto não encontrada neste navegador.'); return b;
  }
  /* URL para exibir (objectURL local ou link assinado temporário) */
  async function src(ref) {
    const c = cache.get(ref);
    if (c && c.exp > Date.now()) return c.url;
    let url, exp;
    if (personal()) {
      let r; try { r = await bucket().createSignedUrl(ref, 3600); } catch (e) { throw cloudErr(e, 'carregar'); }
      if (r.error || !r.data) throw cloudErr(r.error, 'carregar');
      url = r.data.signedUrl; exp = Date.now() + 50 * 60 * 1000;
    } else {
      const b = await idbDo('readonly', s => s.get(ref)); if (!b) throw new PhotoError('Foto não encontrada.');
      url = URL.createObjectURL(b); exp = Infinity;
    }
    cache.set(ref, { url, exp }); return url;
  }
  async function remove(refs) {
    refs = [...new Set(refs)].filter(Boolean); if (!refs.length) return;
    refs.forEach(r => { const c = cache.get(r); if (c && c.url.startsWith('blob:')) URL.revokeObjectURL(c.url); cache.delete(r); });
    if (personal()) { let r; try { r = await bucket().remove(refs); } catch (e) { throw cloudErr(e, 'remover'); } if (r.error) throw cloudErr(r.error, 'remover'); }
    else for (const k of refs) await idbDo('readwrite', s => s.delete(k));
  }
  /* todas as referências de foto usadas por um documento */
  const usedRefs = d => {
    const s = new Set(), add = x => { if (x && x.photo) s.add(x.photo); };
    (d.foods || []).forEach(add); (d.savedMeals || []).forEach(add);
    (d.meals || []).forEach(m => { add(m); (m.foods || []).forEach(add); });
    return s;
  };
  /* apaga do armazenamento as fotos de `candidates` que NENHUM registro de `doc` usa mais. Falhas não desfazem nada (só sobra um arquivo órfão). */
  async function release(candidates, doc) {
    const used = usedRefs(doc || DB), gone = [...new Set(candidates || [])].filter(r => r && !used.has(r));
    if (!gone.length) return;
    try { await remove(gone); } catch (e) { try { console.warn('[FitTrack] foto não removida do armazenamento:', e.message); } catch (_) { } }
  }

  /* <img> assíncrono: o HTML leva só a referência; hydrate() preenche o src depois de desenhar a tela */
  const img = (ref, cls = '', alt = '') => ref ? `<img class="ph ${cls}" data-ph="${esc(ref)}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '';
  function hydrate(root) {
    const ep = Store.epoch;
    (root || document).querySelectorAll('img[data-ph]').forEach(el => {
      const ref = el.dataset.ph; if (el.dataset.phOk === ref) return; el.dataset.phOk = ref;
      src(ref).then(u => { if (ep === Store.epoch) { el.src = u; el.classList.add('ld'); } }, () => { el.dataset.phOk = ''; el.classList.add('er'); el.alt = 'Foto indisponível'; });
    });
  }
  function forget() { cache.forEach(c => { if (c.url.startsWith('blob:')) URL.revokeObjectURL(c.url); }); cache.clear(); }
  async function clearDemo() { try { await idbDo('readwrite', s => s.clear()); } catch (e) { } }

  /* ---------- backup: fotos vão DENTRO do arquivo (JPEG reduzido, base64) e voltam como fotos novas da conta ---------- */
  const readDataUrl = b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => rej(new PhotoError('Falha ao ler a foto.')); f.readAsDataURL(b); });
  async function exportMap(refs) {
    const out = {}; let skipped = 0;
    for (const ref of refs) {
      try {
        const b = await blobOf(ref), im = await decode(b), small = await encode(im, 900, .7, 240 * 1024);
        out[ref] = await readDataUrl(small);
      } catch (e) { skipped++; }
    }
    return { map: out, skipped };
  }
  const DATA_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  const validDataUrl = s => typeof s === 'string' && s.length <= 400 * 1024 && DATA_RE.test(s);
  async function importMap(map) {
    const out = {}, made = [];
    try {
      for (const [k, v] of Object.entries(map || {})) {
        const blob = await (await fetch(v)).blob();
        out[k] = await upload(blob); made.push(out[k]);
      }
    } catch (e) { try { await remove(made); } catch (_) { } throw e; }
    return out;
  }
  return { PhotoError, prepare, upload, src, remove, release, usedRefs, img, hydrate, forget, clearDemo, exportMap, importMap, validDataUrl, blobOf, MAX_BYTES };
})();

/* ---------- campo de foto reutilizável nos modais (pré-visualizar, escolher, substituir, remover) ---------- */
const PhotoUI = {
  st: null,
  init(ref) { this.drop(); this.st = { ref: ref || null, draft: null, remove: false, busy: false, err: '' }; },
  drop() { if (this.st && this.st.draft) URL.revokeObjectURL(this.st.draft.url); this.st = null; },
  /* a foto que será gravada se o usuário salvar agora: undefined = não mudou, null = removida, Blob = nova */
  html(label = 'Foto (opcional)') {
    return `<div class="w phf"><p class="cap" style="margin-bottom:8px">${label}</p><div id="phbox">${this.box()}</div><input id="phfile" type="file" accept="image/*" data-chg="phfile" hidden></div>`;
  },
  box() {
    const s = this.st; if (!s) return '';
    const has = s.draft || (s.ref && !s.remove);
    const view = s.draft ? `<img class="ph big ld" src="${s.draft.url}" alt="Pré-visualização da foto">` : (s.ref && !s.remove ? Photos.img(s.ref, 'big', 'Foto atual') : `<div class="ph-empty">${ic('photo')}<span>Sem foto</span></div>`);
    return `${view}<div class="chips" style="margin-top:10px"><button type="button" class="btn s sm" data-act="phpick" ${s.busy ? 'disabled' : ''}>${ic('photo')}${has ? 'Substituir foto' : 'Escolher foto'}</button>${has ? '<button type="button" class="btn s sm" data-act="phrm">Remover foto</button>' : ''}</div>${s.busy ? '<p class="sub" style="margin:8px 0 0">Preparando imagem…</p>' : ''}${s.err ? `<p class="gmsg err" role="alert" style="margin-top:8px">${esc(s.err)}</p>` : ''}${has && !s.draft ? '' : ''}`;
  },
  refresh() { const b = $('#phbox'); if (b) { b.innerHTML = this.box(); Photos.hydrate(b); } },
  /* sobe a foto nova (se houver) ANTES de gravar o registro. Devolve { ref, uploaded } — ref é o valor a gravar. */
  async resolve() {
    const s = this.st;
    if (!s) return { ref: undefined, uploaded: null };
    if (s.draft) { const ref = await Photos.upload(s.draft.blob); return { ref, uploaded: ref }; }
    if (s.remove) return { ref: null, uploaded: null };
    return { ref: s.ref || null, uploaded: null };
  },
  /* depois do Store.update: sucesso → libera a foto antiga se ninguém mais a usa; falha → apaga a que acabou de subir */
  async finish(ok, res, oldRef) {
    if (!res) return;
    if (!ok) { if (res.uploaded) { try { await Photos.remove([res.uploaded]); } catch (e) { } } return; }
    if (oldRef && oldRef !== res.ref) await Photos.release([oldRef]);
  }
};
on('phpick', () => { const f = $('#phfile'); if (f) f.click(); });
on('phrm', () => { const s = PhotoUI.st; if (!s) return; if (s.draft) { URL.revokeObjectURL(s.draft.url); s.draft = null; } s.remove = true; s.err = ''; PhotoUI.refresh(); });
onChange('phfile', async el => {
  const s = PhotoUI.st, f = el.files && el.files[0]; el.value = ''; if (!s || !f) return;
  s.busy = true; s.err = ''; PhotoUI.refresh();
  try { const p = await Photos.prepare(f); if (PhotoUI.st !== s) { URL.revokeObjectURL(p.url); return; } if (s.draft) URL.revokeObjectURL(s.draft.url); s.draft = p; s.remove = false; }
  catch (e) { s.err = e.message || 'Não foi possível usar essa imagem.'; }
  s.busy = false; PhotoUI.refresh();
});
/* visualizar em tamanho maior */
on('phview', (b, v) => { modal(`<div class="phv">${Photos.img(v, 'full', 'Foto')}</div><div class="row" style="margin-top:14px"><button class="btn s" style="flex:1" data-act="close">Fechar</button></div>`); Photos.hydrate($('#sheet')); });
