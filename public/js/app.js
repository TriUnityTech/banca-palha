/* Casca do aplicativo: menu, rotas, eventos. */
(async function () {
  'use strict';
  const D = window.Domain, U = window.UI, S = window.Store, V = window.Views;
  const { esc, icon } = U;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

  document.documentElement.dataset.theme = lsGet('banca-tema') || 'dark';
  try { await S.carregar(); } catch (e) {
    if (e.codigo) {
      const msgErro = e.message !== 'Digite o código de acesso.';
      document.getElementById('app').innerHTML =
        '<div class="boot" style="padding:24px"><form id="form-codigo" class="panel" style="width:min(380px,100%)" autocomplete="off">' +
        '<h2 style="margin-bottom:6px">Banca de Palha</h2><p class="muted" style="margin-bottom:16px">Digite o código de acesso. Só é preciso uma vez neste aparelho.</p>' +
        (msgErro ? '<div class="form-erro">' + esc(e.message) + '</div>' : '') +
        '<div class="field"><label for="codigo">Código de acesso</label><input id="codigo" name="codigo" type="password" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" required autofocus></div>' +
        '<button class="btn primary" type="submit" style="width:100%">Entrar</button></form></div>';
      document.getElementById('form-codigo').addEventListener('submit', (ev) => {
        ev.preventDefault();
        S.definirCodigo(ev.target.elements.codigo.value);
        location.reload();
      });
    } else {
      document.getElementById('app').innerHTML = '<div class="boot" style="padding:24px;text-align:center">' + esc(e.message) + '<br><br><button class="btn primary" onclick="location.reload()">Tentar de novo</button></div>';
    }
    return;
  }

  const NAV = [
    ['inicio', 'house', 'Início'],
    ['materia-prima', 'package', 'Matéria-prima'],
    ['corte', 'scissors', 'Corte'],
    ['rasgo', 'hand-tap', 'Rasgo'],
    ['prestadores', 'users-three', 'Prestadores'],
    ['placas', 'stack', 'Placas'],
    ['estoque', 'warehouse', 'Estoque'],
    ['dinheiro', 'coins', 'Dinheiro'],
    ['rendimento', 'chart-line-up', 'Rendimento'],
    ['-'],
    ['cadastros', 'address-book', 'Cadastros'],
    ['decisoes', 'seal-question', 'Decisões pendentes'],
    ['historico', 'clock-counter-clockwise', 'Histórico']
  ];
  const TELAS = { inicio: 'inicio', 'materia-prima': 'materiaPrima', corte: 'corte', rasgo: 'rasgo', prestadores: 'prestadores', placas: 'placas', estoque: 'estoque', dinheiro: 'dinheiro', rendimento: 'rendimento', cadastros: 'cadastros', decisoes: 'decisoes', historico: 'historico' };

  const rota = () => {
    const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { tela: partes[0] || 'inicio', params: partes.slice(1) };
  };

  let ultimaRota = null, ultimaRotaScroll = null;
  function render() {
    const s = S.estado, user = S.usuario(), r = rota();
    const chaveRota = r.tela + '/' + r.params.join('/');
    const y = window.scrollY;
    let corpo;
    try {
      if (r.tela === 'prestadores' && r.params.length) corpo = V.telas.ficha({ s, user, params: r.params });
      else corpo = (V.telas[TELAS[r.tela]] || V.telas.inicio)({ s, user, params: r.params });
    } catch (e) {
      console.error(e);
      corpo = '<div class="panel">' + U.aviso('bad', 'Não foi possível mostrar esta tela: ' + esc(e.message)) + '</div>';
    }
    const pend = V.pendentes(s);
    const sit = S.situacao;
    const salvoTxt = { ok: ['cloud-check', 'Tudo salvo'], salvando: ['cloud-arrow-up', 'Salvando...'], erro: ['cloud-slash', 'Não foi possível salvar'], conflito: ['warning', 'Dados mudaram em outro aparelho'], offline: ['wifi-slash', 'Sem internet (só consulta)'] }[sit];
    const nomePerfil = { admin: 'Administrador', operador: 'Funcionário', consulta: 'Só consulta' };
    const nav = NAV.map((i) => {
      if (i[0] === '-') return '<div class="sep"></div>';
      const on = r.tela === i[0] ? ' on' : '';
      return '<a class="' + on.trim() + '" href="#/' + i[0] + '">' + icon(i[1]) + '<span>' + i[2] + '</span>' + (i[0] === 'decisoes' && pend ? '<span class="count">' + pend + '</span>' : '') + '</a>';
    }).join('');

    document.getElementById('app').innerHTML =
      '<aside class="side" id="side"><div class="brand"><div class="brand-mark">' + icon('plant') + '</div><div><b>Banca de Palha</b><span>Gestão da produção</span></div></div>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="side-foot">' +
        '<div class="save-state ' + (sit === 'erro' || sit === 'conflito' || sit === 'offline' ? 'err' : '') + '">' + icon(salvoTxt[0]) + '<span>' + salvoTxt[1] + '</span></div>' +
        '<div class="user-pick">' + icon('user-circle') + '<select data-user aria-label="Quem está usando">' +
          s.usuarios.filter((u) => u.ativo !== false).map((u) => '<option value="' + u.id + '"' + (u.id === user.id ? ' selected' : '') + '>' + esc(u.nome) + '</option>').join('') + '</select></div>' +
        '<div class="muted" style="font-size:.78rem;padding-left:2px">' + nomePerfil[user.perfil] + '</div>' +
        '<button class="btn ghost sm" data-acao="tema">' + icon('circle-half') + ' Tema claro ou escuro</button>' +
      '</div></aside>' +
      '<div><div class="topbar"><button class="btn ghost icon sm" data-acao="menu" aria-label="Abrir menu">' + icon('list') + '</button><b>Banca de Palha</b></div>' +
      '<main class="main">' +
        (sit === 'conflito' ? '<div style="margin-bottom:20px">' + U.aviso('bad', '<b>Os dados foram alterados em outro aparelho.</b> Para não perder nada, recarregue a página antes de continuar.<br><button class="btn" onclick="location.reload()">Recarregar agora</button>') + '</div>' : '') +
        (sit === 'offline' ? '<div style="margin-bottom:20px">' + U.aviso('warn', '<b>Sem internet.</b> Mostrando os últimos dados que este aparelho guardou. Dá para consultar, mas não para registrar.<br><button class="btn" onclick="location.reload()">Tentar de novo</button>') + '</div>' : '') +
        (S.modo === 'local' ? '<div style="margin-bottom:20px">' + U.aviso('warn', location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'Sem servidor: os dados estão sendo guardados só neste navegador. Para salvar em arquivo, abra o programa por <b>iniciar.bat</b>.' : '<b>Sem ligação com a nuvem.</b> Os dados estão sendo guardados só neste aparelho. Falta preencher <b>js/config.js</b> com os dados do Supabase.') + '</div>' : '') +
        '<div class="' + (chaveRota !== ultimaRota ? 'view' : '') + '">' + corpo + '</div></main></div>';
    ultimaRota = chaveRota;
    window.scrollTo(0, chaveRota === ultimaRotaScroll ? y : 0);
    ultimaRotaScroll = chaveRota;
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-acao]');
    if (!el) { const lk = e.target.closest('.nav a'); if (lk) document.getElementById('side')?.classList.remove('open'); return; }
    const nome = el.dataset.acao;
    if (el.disabled) return;
    if (nome === 'menu') { document.getElementById('side').classList.toggle('open'); return; }
    if (nome === 'tema') {
      const novo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = novo; lsSet('banca-tema', novo); return;
    }
    if (nome === 'aba-ficha') { location.hash = '#/prestadores/' + el.dataset.id + '/' + el.dataset.aba; return; }
    if (nome === 'aba-din') { V.filtros.dinAba = el.dataset.aba; render(); return; }
    if (nome === 'aba-cad') { V.filtros.cadAba = el.dataset.aba; render(); return; }
    const f = V.acoes[nome];
    if (f) { V.tentar(() => f(el, e)); render(); }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-user]')) { S.trocarUsuario(t.value); return; }
    if (t.dataset && t.dataset.filtro) { V.filtros[t.dataset.filtro] = t.value; render(); }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-decisao]');
    if (!form) return;
    e.preventDefault();
    V.tentar(() => V.salvarDecisao(form.dataset.decisao, form));
  });

  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  S.ouvir(render);
  render();
})();
