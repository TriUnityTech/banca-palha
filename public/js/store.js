/* Guarda o estado, aplica ações com segurança e salva na nuvem (Supabase), no servidor local ou no navegador. */
(function (root) {
  'use strict';
  const D = root.Domain;
  const CFG = root.BANCA_CONFIG || {};
  const NUVEM = !!(CFG.supabaseUrl && CFG.supabaseKey);
  const CHAVE_LOCAL = 'banca-palha-dados';
  const CHAVE_CACHE = 'banca-palha-copia-nuvem';
  const CHAVE_USER = 'banca-palha-usuario';
  const CHAVE_COD = 'banca-palha-codigo';
  let estado = null;
  let modo = NUVEM ? 'nuvem' : 'servidor'; // nuvem | servidor | local
  let situacao = 'ok'; // ok | salvando | erro | conflito | offline
  let timer = null, emVoo = false, sujo = false;
  const ouvintes = [];

  const avisar = () => ouvintes.forEach((f) => f());
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

  /* Chamada a uma função do Supabase (RPC). A chave pública vai em "apikey"; só as chaves antigas (JWT) vão também em Authorization. */
  async function rpc(nome, corpo) {
    const h = { 'Content-Type': 'application/json', apikey: CFG.supabaseKey };
    if (CFG.supabaseKey.startsWith('eyJ')) h.Authorization = 'Bearer ' + CFG.supabaseKey;
    const r = await fetch(CFG.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/' + nome, { method: 'POST', headers: h, body: JSON.stringify(corpo || {}), cache: 'no-store' });
    if (!r.ok) throw new Error('Supabase ' + r.status);
    return r.json();
  }

  const normalizar = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const codigo = () => lsGet(CHAVE_COD) || '';
  function erroCodigo(msg) { const e = new Error(msg); e.codigo = true; return e; }

  async function lerNuvem() {
    if (!codigo()) throw erroCodigo('Digite o código de acesso.');
    const j = await rpc('ler_banco', { codigo: codigo() });
    if (j && j.negado) { lsSet(CHAVE_COD, ''); throw erroCodigo('Código de acesso incorreto.'); }
    if (!j || !j.dados) return D.novoBanco();
    const e = D.migrar(j.dados);
    e.rev = j.rev;
    return e;
  }

  async function carregar() {
    if (NUVEM) {
      try {
        estado = await lerNuvem();
        lsSet(CHAVE_CACHE, JSON.stringify(estado));
        modo = 'nuvem';
      } catch (e) {
        if (e.codigo) throw e;
        const copia = lsGet(CHAVE_CACHE);
        if (!copia) throw new Error('Sem conexão com a nuvem e nenhum dado guardado neste aparelho.');
        estado = D.migrar(JSON.parse(copia));
        modo = 'nuvem'; situacao = 'offline';
      }
      return estado;
    }
    try {
      const r = await fetch('/api/banco', { cache: 'no-store' });
      if (!r.ok) throw new Error('sem servidor');
      const j = await r.json();
      estado = j.vazio ? D.novoBanco() : D.migrar(j);
      modo = 'servidor';
    } catch {
      modo = 'local';
      const bruto = lsGet(CHAVE_LOCAL);
      estado = bruto ? D.migrar(JSON.parse(bruto)) : D.novoBanco();
    }
    return estado;
  }

  async function enviar() {
    if (emVoo) { sujo = true; return; }
    emVoo = true; sujo = false; situacao = 'salvando'; avisar();
    try {
      if (modo === 'nuvem') {
        const r = await rpc('salvar_banco', { codigo: codigo(), base_rev: estado.rev || 0, novo: estado });
        if (r && r.negado) { situacao = 'erro'; }
        else if (r && r.conflito) { situacao = 'conflito'; }
        else { estado.rev = r.rev; situacao = 'ok'; lsSet(CHAVE_CACHE, JSON.stringify(estado)); }
      } else if (modo === 'servidor') {
        const corpo = Object.assign({}, estado, { baseRev: estado.rev || 0 });
        const r = await fetch('/api/banco', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        if (r.status === 409) { situacao = 'conflito'; }
        else if (!r.ok) { situacao = 'erro'; }
        else { const j = await r.json(); estado.rev = j.rev; situacao = 'ok'; }
      } else {
        lsSet(CHAVE_LOCAL, JSON.stringify(estado));
        situacao = 'ok';
      }
    } catch { situacao = 'erro'; }
    emVoo = false;
    avisar();
    if (sujo && situacao === 'ok') enviar();
    else if (situacao === 'erro') { clearTimeout(timer); timer = setTimeout(enviar, 8000); } // tenta de novo sozinho
  }
  function agendar() { clearTimeout(timer); timer = setTimeout(enviar, 200); }

  /* Ao voltar para o app (celular), pega o que outro aparelho tiver salvo, se não houver nada pendente aqui. */
  async function atualizar() {
    if (modo !== 'nuvem' || emVoo || sujo || situacao === 'salvando' || situacao === 'conflito') return;
    if (document.querySelector('#modal-root .overlay')) return;
    try {
      const novo = await lerNuvem();
      if (situacao === 'offline') situacao = 'ok';
      if (emVoo || sujo) return;
      if (novo.rev !== estado.rev || situacao !== 'ok') { estado = novo; lsSet(CHAVE_CACHE, JSON.stringify(estado)); avisar(); }
    } catch { /* continua com o que já tem */ }
  }
  if (NUVEM) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizar(); });
    window.addEventListener('online', () => { if (situacao === 'offline') atualizar(); });
  }

  const Store = {
    carregar,
    definirCodigo(c) { lsSet(CHAVE_COD, normalizar(c)); },
    get estado() { return estado; },
    get modo() { return modo; },
    get situacao() { return situacao; },
    ouvir(f) { ouvintes.push(f); },
    usuario() {
      const id = lsGet(CHAVE_USER);
      const ativos = estado.usuarios.filter((u) => u.ativo !== false);
      return ativos.find((u) => u.id === id) || ativos[0];
    },
    trocarUsuario(id) { lsSet(CHAVE_USER, id); avisar(); },
    /* Roda a ação num rascunho. Se der erro, nada muda. */
    agir(fn) {
      if (situacao === 'offline') throw new Error('Sem conexão com a internet. Sem ela só dá para consultar; volte a ficar online para registrar.');
      if (situacao === 'conflito') throw new Error('Os dados foram alterados em outro aparelho. Recarregue a página antes de continuar.');
      const rascunho = JSON.parse(JSON.stringify(estado));
      const res = fn(rascunho, Store.usuario());
      estado = rascunho;
      agendar();
      avisar();
      return res;
    },
    exportar() { return JSON.stringify(estado, null, 1); }
  };
  root.Store = Store;
})(window);
