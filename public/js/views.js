/* Telas e ações da Banca de Palha. */
(function (root) {
  'use strict';
  const D = root.Domain, U = root.UI, S = root.Store;
  const { esc, brl, n, q, kg, pct, pp, data, icon, badge } = U;
  const V = { telas: {}, acoes: {}, filtros: { rendDe: '', rendAte: '', estMat: '', cadAba: 'pessoas', dinAba: 'abertos', perTipo: 'semana', perRef: '', rasgoLocal: '' } };

  /* ---------- filtro de período (dia, semana, mês) ---------- */
  const perAtual = () => D.periodo(V.filtros.perTipo, V.filtros.perRef || D.hoje());
  const mil = (v) => (Math.abs(v - 1) < 1e-9 ? '1 milheiro' : n(v) + ' milheiros');
  function barraPeriodo() {
    const p = perAtual();
    const seg = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']];
    return '<div class="periodo"><div class="seg" role="group" aria-label="Período">' +
      seg.map(([k, l]) => '<button type="button" class="' + (p.tipo === k ? 'on' : '') + '" data-acao="per-tipo" data-tipo="' + k + '">' + l + '</button>').join('') + '</div>' +
      (p.tipo === 'tudo' ? '' : '<div class="per-nav"><button type="button" class="btn ghost sm icon" data-acao="per-mov" data-delta="-1" aria-label="Anterior">' + icon('caret-left') + '</button>' +
        '<input type="date" data-filtro="perRef" value="' + esc(p.ref) + '" aria-label="Data de referência">' +
        '<button type="button" class="btn ghost sm icon" data-acao="per-mov" data-delta="1" aria-label="Próximo">' + icon('caret-right') + '</button>' +
        '<button type="button" class="btn ghost sm" data-acao="per-hoje">Hoje</button></div>') +
      '<span class="per-rotulo">' + esc(p.rotulo) + '</span></div>';
  }

  /* ---------- utilitários ---------- */
  const papel = (s, p) => s.pessoas.filter((x) => x.ativo !== false && x.papeis.includes(p));
  const optPessoas = (lista, vazio) => (vazio ? [['', vazio]] : []).concat(lista.map((p) => [p.id, p.nome]));
  const ativos = (arr) => arr.filter((x) => x.estado === 'ATIVO');
  const soma = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const unMat = (s, id) => D.unMat(s, id);
  const outros = (s) => s.materiais.filter((m) => m.cat === 'outro');
  const produtos = (s) => s.materiais.filter((m) => m.cat === 'produto');
  const tile = (k, v, nota, cls) => '<div class="tile ' + (cls || '') + '"><span class="k">' + esc(k) + '</span><span class="v num">' + v + '</span>' + (nota ? '<span class="n">' + nota + '</span>' : '') + '</div>';
  const txt = (t) => '<span style="font-family:var(--font);font-size:1.15rem;font-weight:600">' + esc(t) + '</span>';
  const nomeTipoMov = { ENTRADA_MP: 'Chegada de matéria-prima', CORTE: 'Corte', ENVIO: 'Envio ao prestador', CHEGADA: 'Chegada ao prestador', PRODUCAO: 'Palha rasgada obtida', RASGO: 'Palha cortada usada no rasgo', RETORNO: 'Retorno à fábrica', DANIFICADO: 'Danificado ou perdido', AJUSTE: 'Ajuste justificado', CONSUMO: 'Consumo', PRODUTO_PRONTO: 'Produto acabado', ENTRADA: 'Entrada de material', VENDA: 'Venda', ESTORNO: 'Estorno' };

  function tentar(fn) {
    try { return fn(); } catch (e) { U.toast(e.message || String(e), 'bad'); return null; }
  }
  const salvar = (fn, msg) => { const r = S.agir(fn); if (msg) U.toast(msg); return r; };

  const botoesRegistro = (tipo, r, user, extra) => {
    let h = extra || '';
    if (D.pode(user, 'corrigir')) h += '<button class="btn ghost sm icon" title="Corrigir" data-acao="corrigir" data-tipo="' + tipo + '" data-id="' + r.id + '">' + icon('pencil-simple') + '</button>';
    if (D.pode(user, 'estornar')) h += '<button class="btn ghost sm icon" title="Estornar (desfazer)" data-acao="estornar" data-tipo="' + tipo + '" data-id="' + r.id + '">' + icon('arrow-u-up-left') + '</button>';
    return h ? '<div class="acts">' + h + '</div>' : '';
  };
  const histBadge = (r) => (r.historico && r.historico.some((h) => h.motivo !== 'Conferência') ? ' ' + badge('Corrigido', 'info') : '');
  const emBranco = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

  /* ---------- decisões da banca ---------- */
  function decisoes(s) {
    const c = s.config;
    return [
      { id: 'cortadorBase', icon: 'scissors', titulo: 'O cortador recebe pelo peso entregue ou só pelo peso aprovado?', ok: c.cortadorBaseConfirmada, resposta: c.cortadorBase === 'ENTREGUE' ? 'Pelo peso entregue' : 'Só pelo peso aprovado' },
      { id: 'prestadorBase', icon: 'users-three', titulo: 'O prestador recebe por tudo que produziu ou só pelo que devolveu e foi conferido?', ok: c.prestadorBase === 'PRODUZIDA', resposta: 'Pelo que foi registrado' },
      { id: 'tratamentoPerdas', icon: 'trash', titulo: 'Como tratar palhas rejeitadas, perdas e diferenças da produção externa?', ok: c.tratamentoPerdas === 'DESCONSIDERAR', resposta: 'Desconsiderar: é lixo' },
      { id: 'metodoCusto', icon: 'receipt', titulo: 'Como a banca calcula o custo do produto vendido?', ok: c.metodoCusto === 'MEDIA_APROVEITAMENTO_ESPERADA', resposta: 'Lucro em cima da média de aproveitamento esperada' },
      { id: 'unidades', icon: 'scales', titulo: 'Em que unidade cada palha é controlada?', ok: !!c.unidadesConfirmadas, resposta: 'Matéria-prima e palha cortada em kg. Palha rasgada em milheiros' },
      { id: 'baixaCortada', icon: 'hand-tap', titulo: 'Como dar baixa na palha cortada que já foi rasgada?', ok: c.baixaCortada === 'MODULO_RASGO', resposta: 'No módulo Rasgo (na banca ou em casa)' },
      { id: 'pesoAproveitavel', icon: 'chart-line-up', titulo: 'Qual peso conta como "aproveitável" no rendimento real: o entregue ou o aprovado?', ok: c.pesoAproveitavelConfirmado, resposta: c.pesoAproveitavel === 'ENTREGUE' ? 'Peso entregue (provisório)' : 'Peso aprovado (provisório)' }
    ];
  }
  V.decisoes = decisoes;
  V.pendentes = (s) => decisoes(s).filter((d) => !d.ok).length;

  /* ================= INÍCIO ================= */
  V.telas.inicio = ({ s, user }) => {
    const per = perAtual();
    const loc = D.saldosPorLocal(s, 'FABRICA');
    const comPrest = { cortada: 0, rasgada: 0, placa: 0 };
    for (const p of papel(s, 'prestador')) {
      const x = D.saldosPorLocal(s, D.locPrest(p.id));
      for (const k of Object.keys(comPrest)) comPrest[k] += x[k] || 0;
    }
    const pr = D.resumoProducao(s, per);
    const fp = D.resumoFinanceiro(s, per);
    const fa = D.resumoFinanceiro(s, {});
    const dif = D.diferencasAbertas(s);
    const dec = decisoes(s).filter((d) => !d.ok);
    const pode = D.pode(user, 'lancar');
    const avisos = [];
    if (dec.length) avisos.push(['warn', 'question', dec.length + ' decisão ainda não foi tomada. Enquanto isso, o valor aparece como provisório.', '#/decisoes', 'Ver decisão']);
    if (fa.aguardando) avisos.push(['warn', 'hourglass', fa.aguardando + ' valor(es) sem total calculado (falta definir um preço).', '#/dinheiro', 'Ver dinheiro']);
    if (dif.naoConf.length) avisos.push(['info', 'clipboard-text', dif.naoConf.length + ' devolução(ões) de prestador ainda sem conferência.', '#/prestadores', 'Conferir']);
    if (dif.conf.length) avisos.push(['warn', 'scales', dif.conf.length + ' diferença(s) de contagem aberta(s).', '#/placas', 'Ver diferenças']);
    const primeiros = !s.pessoas.length || !s.precos.length;

    const rapidos = pode ? `<div class="quick">
      <button data-acao="nova-entrada"><span class="ic">${icon('package')}</span><span><b>Chegou palha</b><span>Registrar sacos recebidos</span></span></button>
      <button data-acao="novo-corte"><span class="ic">${icon('scissors')}</span><span><b>Registrar corte</b><span>Na banca ou em casa</span></span></button>
      <button data-acao="nova-entrega"><span class="ic">${icon('truck')}</span><span><b>Enviar ao prestador</b><span>Palha cortada e placas</span></span></button>
      <button data-acao="nova-producao"><span class="ic">${icon('hand-tap')}</span><span><b>Registrar rasgo</b><span>Palhas rasgadas na banca ou em casa</span></span></button>
      <button data-acao="novo-retorno"><span class="ic">${icon('arrow-u-down-left')}</span><span><b>Prestador devolveu</b><span>Palha rasgada e placas</span></span></button>
      <button data-acao="pagar-pessoa"><span class="ic">${icon('hand-coins')}</span><span><b>Pagar alguém</b><span>Cortador, prestador, fornecedor</span></span></button>
    </div>` : U.aviso('info', 'Seu perfil é só de consulta. Você pode ver tudo, mas não registrar.');

    return `
    <div class="page-head"><div><h1>Olá, ${esc(user.nome)}</h1><p>Veja o que aconteceu no período escolhido e o que você quer fazer agora.</p></div></div>
    ${barraPeriodo()}
    <div class="section-title">Produção no período: ${esc(per.rotulo)}</div>
    <div class="tiles">
      ${tile('Palha que chegou', kg(pr.mpRecebida), pr.entradas + ' entrada(s)')}
      ${tile('Palha cortada', kg(pr.cortadaKg), kg(pr.mpProcessada) + ' processados em ' + pr.cortes + ' corte(s)')}
      ${tile('Rendimento real', pct(pr.rendimentoReal), pr.rendimentoEstimado == null ? 'Sem estimativa para comparar' : 'Estimado: ' + pct(pr.rendimentoEstimado), 'accent')}
      ${tile('Palha rasgada', mil(pr.rasgadaCasa + pr.rasgadaBanca), 'Em casa: ' + n(pr.rasgadaCasa) + ' | Na banca: ' + n(pr.rasgadaBanca))}
      ${tile('Devolvida pelos prestadores', mil(pr.devolvida))}
    </div>
    <div class="section-title">Dinheiro no período</div>
    <div class="tiles">
      ${tile('Devido aos prestadores', brl(pr.devidoPrestadores), 'Calculado sobre o que foi registrado')}
      ${tile('Pago no período', brl(fp.pago), 'Tudo que saiu')}
      ${tile('Recebido no período', brl(fp.recebido))}
      ${tile('Ainda a pagar (total)', brl(fa.comprasPend + fa.cortadoresPend + fa.prestadoresPend + fa.despesasPend), 'Todos os períodos', 'accent')}
    </div>
    <div class="cols" style="margin-top:26px">
      <div class="stack">
        ${primeiros ? `<div class="panel"><div class="panel-head"><div><h2>Primeiros passos</h2><p>Faça isso uma vez, na ordem, e o sistema fica pronto para o dia a dia.</p></div></div>
          <div class="list">
            <div class="item">${badge(s.pessoas.length ? 'Feito' : '1', s.pessoas.length ? 'ok' : 'warn')}<div class="grow"><b>Cadastre as pessoas</b><small>Cortadores, prestadores, fornecedores.</small></div><a class="btn sm" href="#/cadastros">Abrir</a></div>
            <div class="item">${badge(s.precos.length ? 'Feito' : '2', s.precos.length ? 'ok' : 'warn')}<div class="grow"><b>Defina os preços</b><small>Valor por kg do corte e valor do milheiro.</small></div><a class="btn sm" href="#/cadastros">Abrir</a></div>
            <div class="item">${badge(s.entradas.length ? 'Feito' : '3', s.entradas.length ? 'ok' : 'warn')}<div class="grow"><b>Registre a primeira chegada de palha</b><small>Sacos, peso, custo e rendimento estimado.</small></div>${pode ? '<button class="btn sm primary" data-acao="nova-entrada">Registrar</button>' : ''}</div>
          </div></div>` : ''}
        <div class="panel"><div class="panel-head"><div><h2>Registrar</h2></div></div>${rapidos}</div>
        <div class="panel"><div class="panel-head"><div><h2>Precisa de atenção</h2></div></div>
          ${avisos.length ? '<div class="stack">' + avisos.map((a) => `<div class="callout ${a[0]}">${icon(a[1])}<div>${esc(a[2])} <a href="${a[3]}"><b>${a[4]}</b></a></div></div>`).join('') + '</div>' : U.aviso('ok', 'Nada pendente no momento.')}
        </div>
      </div>
      <div class="stack">
        <div class="panel"><div class="panel-head"><div><h2>No estoque agora</h2><p>Quantidades de hoje, não do período.</p></div></div>
          <div class="list">
            <div class="item"><div class="grow">Matéria-prima na fábrica<small>estoque misturado</small></div><b class="num">${kg(loc.mp)}</b></div>
            <div class="item"><div class="grow">Palha cortada na fábrica</div><b class="num">${kg(loc.cortada)}</b></div>
            <div class="item"><div class="grow">Palha rasgada na fábrica</div><b class="num">${mil(loc.rasgada)}</b></div>
            <div class="item"><div class="grow">Placas na fábrica</div><b class="num">${n(loc.placa)} un</b></div>
            <div class="item"><div class="grow">Palha cortada com prestadores</div><b class="num">${kg(comPrest.cortada)}</b></div>
            <div class="item"><div class="grow">Palha rasgada com prestadores</div><b class="num">${mil(comPrest.rasgada)}</b></div>
            <div class="item"><div class="grow">Placas com prestadores</div><b class="num">${n(comPrest.placa)} un</b></div>
          </div></div>
      </div>
    </div>`;
  };

  /* ================= MATÉRIA-PRIMA ================= */
  V.telas.materiaPrima = ({ s, user }) => {
    const saldo = D.saldo(s, 'mp', 'FABRICA');
    const lista = ativos(s.entradas).concat(s.entradas.filter((e) => e.estado === 'ESTORNADO')).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
    const linhas = lista.map((e) => `<tr class="${e.estado === 'ESTORNADO' ? 'estornado' : ''}">
      <td class="nowrap">${data(e.data)}</td><td>${esc(e.fornecedorId ? D.nomePessoa(s, e.fornecedorId) : '-')}</td>
      <td class="num r">${e.sacos}</td><td class="num r">${kg(e.pesoTotal)}</td><td class="num r">${brl(e.custo)}</td>
      <td class="num r">${e.pesoTotal > 0 ? brl(e.custo / e.pesoTotal) + '/kg' : '-'}</td>
      <td>${esc(e.epoca || '-')}</td>
      <td class="num r">${e.rendEst == null ? '<span class="faint">não informado</span>' : pct(e.rendEst)}</td>
      <td>${e.estado === 'ATIVO' ? histBadge(e) : badge('Estornada', 'bad')}</td>
      <td class="r">${e.estado === 'ATIVO' ? botoesRegistro('entrada', e, user, (e.historico.length ? `<button class="btn ghost sm icon" title="Ver histórico" data-acao="historico-registro" data-tipo="entrada" data-id="${e.id}">${icon('clock-counter-clockwise')}</button>` : '')) : ''}</td></tr>`).join('');
    return `
    <div class="page-head"><div><h1>Matéria-prima</h1><p>Cada vez que chega palha à fábrica, registre aqui: quantos sacos, quanto pesa, quanto custou e quanto você espera aproveitar.</p></div>
      ${D.pode(user, 'lancar') ? `<button class="btn primary" data-acao="nova-entrada">${icon('plus')} Registrar chegada de palha</button>` : ''}</div>
    <div class="tiles">
      ${tile('Matéria-prima na fábrica agora', kg(saldo), 'Total misturado de todas as entradas', 'accent')}
      ${tile('Recebido no total', kg(soma(ativos(s.entradas), (e) => e.pesoTotal)), ativos(s.entradas).length + ' entradas registradas')}
      ${tile('Gasto em compras', brl(soma(ativos(s.entradas), (e) => e.custo)), 'Só o valor de compra')}
    </div>
    <div class="section-title">Sobre o estoque misturado</div>
    ${U.aviso('info', '<b>A palha é misturada durante o trabalho.</b> Por isso o sistema guarda um único estoque de matéria-prima e o histórico de cada entrada separadamente. O histórico serve para comparar entradas, épocas e períodos. Ele <b>não</b> diz de qual entrada vem o que sobrou no estoque.')}
    <div class="section-title">Histórico de entradas</div>
    <div class="panel">${lista.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Fornecedor</th><th class="r">Sacos</th><th class="r">Peso total</th><th class="r">Custo</th><th class="r">Custo por kg</th><th>Época</th><th class="r">Rend. estimado</th><th></th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : U.vazio('package', 'Nenhuma entrada ainda', 'Quando chegar palha, registre aqui.', D.pode(user, 'lancar') ? `<button class="btn primary" data-acao="nova-entrada">${icon('plus')} Registrar chegada</button>` : '')}</div>`;
  };

  function formEntrada(reg) {
    const s = S.estado, user = S.usuario();
    const pode = D.pode(user, 'estimar');
    const forn = papel(s, 'fornecedor');
    const epocas = [...new Set(s.entradas.map((e) => e.epoca).filter(Boolean))];
    const iguais = reg ? new Set(reg.pesos).size <= 1 : true;
    const campos = [
      { n: 'data', t: 'date', r: 'Data de recebimento', v: reg ? reg.data : D.hoje(), req: true },
      { n: 'fornecedorId', t: 'select', r: 'De quem foi comprado', op: optPessoas(forn, 'Não informar'), v: reg ? reg.fornecedorId || '' : '', ajuda: forn.length ? '' : 'Para aparecer aqui, cadastre o fornecedor em Cadastros.' },
      { n: 'sacos', t: 'num', r: 'Quantidade de sacos', req: true, v: reg ? reg.sacos : '', suf: 'sacos' },
      { n: 'modo', t: 'radio', r: 'Como foram pesados?', op: [['igual', 'Todos pesam igual'], ['cada', 'Cada saco tem um peso']], v: iguais ? 'igual' : 'cada' },
      { n: 'pesoIgual', t: 'num', r: 'Peso de cada saco', suf: 'kg', v: reg && iguais ? emBranco(reg.pesos[0]) : '' },
      { t: 'html', html: '<div class="field hide" id="bloco-cada"><span class="lbl">Peso de cada saco (kg)</span><div class="sacos" id="lista-sacos"></div></div><div class="preview" id="prev-total">Peso total recebido: <b>0 kg</b></div>' },
      { n: 'custo', t: 'brl', r: 'Custo da compra', req: true, v: reg ? emBranco((reg.custo / 100).toFixed(2)) : '', ajuda: 'Valor total pago por esta entrada.' },
      { n: 'epoca', t: 'text', r: 'Época, safra ou período de plantio (se souber)', v: reg ? reg.epoca : '', lista: epocas, ph: 'Ex.: Safra 2026' },
      { n: 'rendEst', t: 'num', r: 'Rendimento estimado (%)', suf: '%', v: reg ? emBranco(reg.rendEst) : '', dis: !pode, ph: 'Ex.: 75',
        ajuda: pode ? 'É um palpite seu: quanto dessa palha deve ser aproveitável depois do corte. 75 significa que de cada 100 kg, 75 kg devem servir. Depois do corte o sistema mostra o resultado real.' : 'Só funcionário autorizado pode informar o rendimento estimado.' },
      { n: 'obs', t: 'area', r: 'Observações sobre a qualidade (opcional)', v: reg ? reg.obs : '' }
    ];
    if (reg) campos.push({ n: 'motivo', t: 'area', r: 'Motivo da correção', req: true, ph: 'Por que está corrigindo?' });
    U.form({
      titulo: reg ? 'Corrigir entrada de palha' : 'Chegou palha', intro: reg ? 'O histórico da correção fica guardado.' : 'Preencha o que chegou à fábrica.',
      campos, enviar: reg ? 'Salvar correção' : 'Registrar chegada',
      onMount(form) {
        const sacosEl = form.elements.sacos, igualEl = form.elements.pesoIgual, lista = form.querySelector('#lista-sacos');
        const bloco = form.querySelector('#bloco-cada'), campoIgual = igualEl.closest('.field'), prev = form.querySelector('#prev-total b');
        const modo = () => form.querySelector('[name=modo]:checked').value;
        let guardados = reg && !iguais ? reg.pesos.slice() : [];
        const lerLista = () => [...lista.querySelectorAll('input')].map((i) => i.value);
        const desenhar = () => {
          let k = 0; try { k = Math.min(500, Math.max(0, Math.floor(U.parseNum(sacosEl.value) || 0))); } catch { k = 0; }
          const atuais = lerLista(); if (atuais.length) guardados = atuais;
          lista.innerHTML = Array.from({ length: k }, (_, i) => `<input type="text" inputmode="decimal" aria-label="Saco ${i + 1}" placeholder="Saco ${i + 1}" value="${guardados[i] != null ? esc(emBranco(guardados[i])) : ''}">`).join('');
        };
        const total = () => {
          let t = 0;
          try {
            const k = Math.floor(U.parseNum(sacosEl.value) || 0);
            if (modo() === 'igual') t = k * (U.parseNum(igualEl.value) || 0);
            else t = lerLista().reduce((a, v) => a + (U.parseNum(v) || 0), 0);
          } catch { t = 0; }
          prev.textContent = U.n(D.r3(t)) + ' kg';
        };
        const alternar = () => { const c = modo() === 'cada'; bloco.classList.toggle('hide', !c); campoIgual.classList.toggle('hide', c); if (c) desenhar(); total(); };
        form.addEventListener('input', (e) => { if (e.target === sacosEl && modo() === 'cada') desenhar(); total(); });
        form.addEventListener('change', (e) => { if (e.target.name === 'modo') alternar(); });
        alternar();
      },
      onSubmit(v, form) {
        const k = v.sacos;
        if (!Number.isInteger(k) || k < 1) throw new Error('A quantidade de sacos precisa ser um número inteiro, 1 ou mais.');
        let pesos;
        if (v.modo === 'igual') {
          if (!(v.pesoIgual > 0)) throw new Error('Informe o peso de cada saco.');
          pesos = Array(k).fill(v.pesoIgual);
        } else {
          pesos = [...form.querySelectorAll('#lista-sacos input')].map((i) => U.parseNum(i.value));
          if (pesos.length !== k || pesos.some((p) => !(p > 0))) throw new Error('Informe o peso de todos os ' + k + ' sacos.');
        }
        const dados = { data: v.data, fornecedorId: v.fornecedorId || null, pesos, custo: v.custo, epoca: v.epoca, rendEst: v.rendEst, obs: v.obs };
        salvar((st, u) => (reg ? D.corrigir(st, u, 'entrada', reg.id, dados, v.motivo) : D.criar(st, u, 'entrada', dados)), reg ? 'Entrada corrigida.' : 'Chegada registrada.');
      }
    });
  }

  /* ================= CORTE ================= */
  V.telas.corte = ({ s, user }) => {
    const r = D.relatorioRendimento(s, {});
    const prov = !s.config.pesoAproveitavelConfirmado;
    const lista = s.cortes.slice().sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
    const lancDe = (id) => s.lanc.find((l) => l.estado === 'ATIVO' && l.ref && l.ref.tipo === 'corte' && l.ref.id === id);
    const linhas = lista.map((c) => {
      const a = D.aproveitavel(s, c), rr = a != null && c.processado > 0 ? a / c.processado * 100 : null;
      const l = c.estado === 'ATIVO' ? lancDe(c.id) : null;
      let rem = '-';
      if (l) rem = l.valor == null ? badge('Aguardando', 'warn') + `<div class="faint" style="font-size:.8rem">${esc(l.aguardando || '')}</div>` : `<span class="num">${brl(l.valor)}</span>` + (l.provisorio ? ' ' + U.provisorio() : '');
      return `<tr class="${c.estado === 'ESTORNADO' ? 'estornado' : ''}"><td class="nowrap">${data(c.data)}</td><td>${esc(D.nomePessoa(s, c.cortadorId))}<br>${badge(c.local === 'CASA' ? 'Em casa (rota)' : 'Na banca', c.local === 'CASA' ? 'info' : '')}</td>
        <td class="num r">${kg(c.processado)}</td><td class="num r">${kg(c.entregue)}</td><td class="num r">${c.aprovado == null ? '-' : kg(c.aprovado)}</td><td class="num r">${c.perdas == null ? '-' : kg(c.perdas)}</td>
        <td class="num r">${rr == null ? '-' : pct(rr)}</td><td class="r">${rem}</td>
        <td class="r">${c.estado === 'ATIVO' ? botoesRegistro('corte', c, user) : badge('Estornado', 'bad')}</td></tr>`;
    }).join('');
    return `
    <div class="page-head"><div><h1>Corte</h1><p>Registre o que cada cortador processou e o que entregou. O sistema calcula o rendimento real e quanto ele tem a receber.</p></div>
      ${D.pode(user, 'lancar') ? `<button class="btn primary" data-acao="novo-corte">${icon('plus')} Registrar corte</button>` : ''}</div>
    <div class="tiles">
      ${tile('Matéria-prima processada', kg(r.kgProcessadoCortes), r.real.nCortes + ' cortes registrados')}
      ${tile('Rendimento real médio', pct(r.real.valor) + (prov && r.real.valor != null ? ' ' + U.provisorio() : ''), r.real.n ? 'Aproveitável total ÷ processado total (' + r.real.n + ' cortes)' : 'Ainda sem dados suficientes', 'accent')}
      ${tile('Rendimento estimado médio', pct(r.estimado.valor), r.estimado.n ? 'Média pelo peso das entradas, ' + r.estimado.n + ' com estimativa' : 'Nenhuma entrada com estimativa')}
    </div>
    ${prov ? '<div style="margin-top:16px">' + U.aviso('warn', '<b>Rendimento real provisório.</b> A banca ainda não confirmou qual peso conta como aproveitável. Hoje o sistema usa o peso <b>' + (s.config.pesoAproveitavel === 'APROVADO' ? 'aprovado' : 'entregue') + '</b>. <a href="#/decisoes"><b>Ver decisão</b></a>') + '</div>' : ''}
    <div class="section-title">Cortes registrados</div>
    <div class="panel">${lista.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cortador e local</th><th class="r">Processou</th><th class="r">Entregou</th><th class="r">Aprovado</th><th class="r">Perdas</th><th class="r">Rend. real</th><th class="r">A receber</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : U.vazio('scissors', 'Nenhum corte ainda', 'Cadastre os cortadores e registre o primeiro corte.', D.pode(user, 'lancar') ? `<button class="btn primary" data-acao="novo-corte">${icon('plus')} Registrar corte</button>` : '')}</div>`;
  };

  function formCorte(reg) {
    const s = S.estado;
    const cort = papel(s, 'cortador');
    const ents = ativos(s.entradas).sort((a, b) => b.data.localeCompare(a.data));
    const campos = [
      { n: 'data', t: 'date', r: 'Data', v: reg ? reg.data : D.hoje(), req: true },
      { n: 'local', t: 'radio', r: 'Onde foi cortado?', op: [['BANCA', 'Na banca'], ['CASA', 'Em casa (rota)']], v: reg ? reg.local || 'BANCA' : 'BANCA' },
      { n: 'cortadorId', t: 'select', r: 'Quem cortou', op: optPessoas(cort, cort.length ? 'Escolha...' : 'Nenhum cortador cadastrado'), v: reg ? reg.cortadorId : '', req: true },
      { n: 'processado', t: 'num', r: 'Matéria-prima processada', suf: 'kg', req: true, v: reg ? emBranco(reg.processado) : '', ajuda: 'A palha para cortar é medida em kg. Na fábrica agora: ' + kg(D.saldo(s, 'mp', 'FABRICA')) + '.' },
      { n: 'entregue', t: 'num', r: 'Peso da palha cortada entregue', suf: 'kg', req: true, v: reg ? emBranco(reg.entregue) : '', ajuda: 'Palha cortada é controlada em kg. Este peso entra no estoque e é usado para o pagamento do cortador e para o rendimento.' },
      { t: 'html', html: '<div class="row2">' },
      { n: 'aprovado', t: 'num', r: 'Palha cortada aprovada (se conferir)', suf: 'kg', v: reg ? emBranco(reg.aprovado) : '', ajuda: 'Deixe em branco se a banca não confere a qualidade.' },
      { n: 'perdas', t: 'num', r: 'Perdas e rejeitos (se medir)', suf: 'kg', v: reg ? emBranco(reg.perdas) : '' },
      { t: 'html', html: '</div>' },
      { n: 'origemEntradaId', t: 'select', r: 'De qual entrada veio este material?', v: reg ? reg.origemEntradaId || '' : '',
        op: [['', 'Não sei: é da mistura do estoque']].concat(ents.map((e) => [e.id, 'Só da entrada de ' + U.data(e.data) + ' (' + U.n(e.pesoTotal) + ' kg' + (e.fornecedorId ? ', ' + D.nomePessoa(s, e.fornecedorId) : '') + ')'])),
        ajuda: 'Como o estoque é misturado, deixe "Não sei" na maioria dos casos. Só escolha uma entrada se tiver certeza de que o corte usou apenas ela.' },
      { t: 'html', html: '<div class="preview" id="prev-corte">Preencha os pesos para ver o rendimento e o valor.</div>' },
      { n: 'obs', t: 'area', r: 'Observações (opcional)', v: reg ? reg.obs : '' }
    ];
    if (reg) campos.push({ n: 'motivo', t: 'area', r: 'Motivo da correção', req: true });
    U.form({
      titulo: reg ? 'Corrigir corte' : 'Registrar corte', campos, enviar: reg ? 'Salvar correção' : 'Registrar corte',
      onMount(form) {
        const prev = form.querySelector('#prev-corte');
        const atualizar = () => {
          try {
            const proc = U.parseNum(form.elements.processado.value), ent = U.parseNum(form.elements.entregue.value), apr = U.parseNum(form.elements.aprovado.value);
            const cId = form.elements.cortadorId.value, dt = form.elements.data.value;
            if (!(proc > 0) || ent == null) { prev.textContent = 'Preencha os pesos para ver o rendimento e o valor.'; return; }
            const tmp = { processado: proc, entregue: ent, aprovado: apr, cortadorId: cId, data: dt };
            const a = D.aproveitavel(s, tmp);
            let h = 'Rendimento real deste corte: <b>' + (a == null ? 'falta o peso aprovado' : U.pct(a / proc * 100)) + '</b>';
            if (cId) {
              const c = D.calcRemuneracaoCorte(s, tmp);
              h += '<br>A receber: <b>' + (c.valor == null ? 'ainda sem total (' + c.aguardando + ')' : U.brl(c.valor)) + '</b>' + (c.valor != null && !s.config.cortadorBaseConfirmada ? ' (provisório)' : '');
            }
            if (apr != null && ent > 0 && apr !== ent) h += '<br><span class="muted">Comparativo: entregue ' + U.kg(ent) + ' | aprovado ' + U.kg(apr) + '.</span>';
            prev.innerHTML = h;
          } catch { prev.textContent = 'Confira os números digitados.'; }
        };
        form.addEventListener('input', atualizar); form.addEventListener('change', atualizar); atualizar();
      },
      onSubmit(v) {
        const dados = { data: v.data, local: v.local, cortadorId: v.cortadorId, processado: v.processado, entregue: v.entregue, aprovado: v.aprovado, perdas: v.perdas, origemEntradaId: v.origemEntradaId || null, obs: v.obs };
        salvar((st, u) => (reg ? D.corrigir(st, u, 'corte', reg.id, dados, v.motivo) : D.criar(st, u, 'corte', dados)), reg ? 'Corte corrigido.' : 'Corte registrado.');
      }
    });
  }

  const noPer = (d, p) => (!p.de || d >= p.de) && (!p.ate || d <= p.ate);
  const lancDe = (s, tipo, id) => s.lanc.find((l) => l.estado === 'ATIVO' && l.ref && l.ref.tipo === tipo && l.ref.id === id);
  const valorLanc = (s, l, vazio) => (!l ? (vazio || '-') : l.valor == null ? badge('Aguardando', 'warn') + '<div class="faint" style="font-size:.8rem">' + esc(l.aguardando || '') + '</div>' : '<span class="num">' + brl(l.valor) + '</span>');
  const recalcBtn = (l, user) => (l && l.valor == null && D.pode(user, 'corrigir') ? `<button class="btn sm" data-acao="recalcular-lanc" data-id="${l.id}">Recalcular</button>` : '');

  /* ================= PRESTADORES ================= */
  V.telas.prestadores = ({ s, user }) => {
    const per = perAtual();
    const lista = papel(s, 'prestador');
    const rs = lista.map((p) => ({ p, r: D.resumoPrestador(s, p.id, per), loc: D.saldosPorLocal(s, D.locPrest(p.id)) }));
    const tot = { produzida: 0, devido: 0, pago: 0, pend: 0 };
    for (const x of rs) { tot.produzida += x.r.produzida; tot.devido += x.r.devido; tot.pago += x.r.pago; tot.pend += x.r.pendenteTotal; }
    const cards = rs.map(({ p, r, loc }) => `<a class="person" href="#/prestadores/${p.id}/financeiro"><h3>${icon('user-circle')} ${esc(p.nome)}</h3><dl>
        <dt>Rasgou no período</dt><dd class="num">${mil(r.produzida)}</dd>
        <dt>Devido no período</dt><dd class="num">${brl(r.devido)}${r.aguardando ? ' ' + badge('sem valor', 'warn') : ''}</dd>
        <dt>Pago no período</dt><dd class="num">${brl(r.pago)}</dd>
        <dt>Saldo a receber (total)</dt><dd class="num"><b>${brl(r.pendenteTotal)}</b></dd>
        <dt>Palha cortada com ele</dt><dd class="num">${kg(loc.cortada)}</dd>
        <dt>Rasgadas fora da fábrica</dt><dd class="num">${mil(loc.rasgada)}</dd>
        <dt>Placas com ele</dt><dd class="num">${n(loc.placa)} un</dd></dl></a>`).join('');
    return `<div class="page-head"><div><h1>Prestadores</h1><p>Pessoas que rasgam a palha em casa (rota). Escolha o período para ver quanto cada uma produziu, quanto tem a receber e quanto já foi pago.</p></div>
      ${D.pode(user, 'lancar') ? `<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-acao="nova-entrega">${icon('truck')} Enviar material</button><button class="btn" data-acao="nova-producao">${icon('hand-tap')} Registrar rasgo</button><button class="btn" data-acao="novo-retorno">${icon('arrow-u-down-left')} Registrar devolução</button></div>` : ''}</div>
    ${barraPeriodo()}
    ${lista.length ? `<div class="tiles" style="margin-top:20px">
      ${tile('Rasgado no período', mil(D.r3(tot.produzida)), 'Todos os prestadores')}
      ${tile('Devido no período', brl(tot.devido), 'Calculado, ainda não é pagamento')}
      ${tile('Pago no período', brl(tot.pago))}
      ${tile('Saldo a receber (total)', brl(tot.pend), 'Devido menos pago, de todos os períodos', 'accent')}</div>
      <div class="section-title">Cada prestador</div><div class="cards">${cards}</div>`
      : '<div class="panel" style="margin-top:20px">' + U.vazio('users-three', 'Nenhum prestador cadastrado', 'Cadastre as pessoas que trabalham em casa para a banca.', D.pode(user, 'cadastros') ? `<a class="btn primary" href="#/cadastros">Ir para Cadastros</a>` : '') + '</div>'}`;
  };

  V.telas.ficha = ({ s, user, params }) => {
    const p = D.pessoa(s, params[0]);
    if (!p) return '<div class="panel">' + U.vazio('user-circle', 'Prestador não encontrado', '', '<a class="btn" href="#/prestadores">Voltar</a>') + '</div>';
    const aba = params[1] || 'materiais';
    const per = perAtual();
    const loc = D.saldosPorLocal(s, D.locPrest(p.id));
    const tr = D.saldosPorLocal(s, D.locTransito(p.id));
    const ent = ativos(s.entregas).filter((e) => e.prestadorId === p.id);
    const prodTodas = ativos(s.producoes).filter((x) => x.local === 'CASA' && x.prestadorId === p.id);
    const retTodos = ativos(s.retornos).filter((x) => x.prestadorId === p.id);
    const prod = prodTodas.filter((x) => noPer(x.data, per));
    const ret = retTodos.filter((x) => noPer(x.data, per));
    const sumItens = (mat) => soma(ent, (e) => soma(e.itens.filter((i) => i.mat === mat), (i) => i.qtd));
    const pode = D.pode(user, 'lancar');
    const r = D.resumoPrestador(s, p.id, per);

    const topo = `<div class="page-head"><div><a href="#/prestadores" class="muted">${icon('arrow-left')} Prestadores</a><h1>${esc(p.nome)}</h1><p>${esc(p.telefone || 'Ficha individual: materiais, produção e financeiro ficam separados nas abas.')}</p></div>
      ${pode ? `<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-acao="nova-entrega" data-prest="${p.id}">${icon('truck')} Enviar material</button><button class="btn" data-acao="nova-producao" data-prest="${p.id}">${icon('hand-tap')} Rasgo</button><button class="btn" data-acao="novo-retorno" data-prest="${p.id}">${icon('arrow-u-down-left')} Devolução</button></div>` : ''}</div>
      <div class="tabs">${[['materiais', 'package', 'Materiais'], ['producao', 'hand-tap', 'Produção'], ['financeiro', 'coins', 'Financeiro']].map(([k, ic, l]) => `<button class="${aba === k ? 'on' : ''}" data-acao="aba-ficha" data-id="${p.id}" data-aba="${k}">${icon(ic)} ${l}</button>`).join('')}</div>
      ${aba === 'materiais' ? '' : barraPeriodo()}`;

    let corpo = '';
    if (aba === 'materiais') {
      const outrosPend = outros(s).map((m) => ({ m, qtd: D.saldo(s, m.id, D.locPrest(p.id)) })).filter((x) => x.qtd);
      const linhas = ent.slice().sort((a, b) => b.data.localeCompare(a.data)).map((e) => `<tr><td class="nowrap">${data(e.data)}</td>
        <td>${e.itens.map((i) => esc(D.nomeMat(s, i.mat)) + ': <span class="num">' + n(i.qtd) + ' ' + unMat(s, i.mat) + '</span>').join('<br>')}</td>
        <td>${e.status === 'EM_TRANSITO' ? badge('Em trânsito', 'info') : badge('Entregue', 'ok')}</td><td>${esc(e.obs)}</td>
        <td class="r">${botoesRegistro('entrega', e, user, e.status === 'EM_TRANSITO' && pode ? `<button class="btn sm" data-acao="chegou" data-id="${e.id}">Chegou</button>` : '')}</td></tr>`).join('');
      corpo = `<div class="tiles" style="margin-top:20px">
        ${tile('Palha cortada recebida', kg(D.r3(sumItens('cortada'))), 'Total enviado desde o início')}
        ${tile('Palha cortada ainda com ele', kg(D.r3(loc.cortada + tr.cortada)), 'Enviada, menos o que foi rasgado ou devolvido', 'accent')}
        ${tile('Placas recebidas', n(sumItens('placa')) + ' un')}
        ${tile('Placas devolvidas', n(soma(retTodos, (x) => x.itens.placa.rec)) + ' un')}
        ${tile('Placas sob responsabilidade', n(loc.placa + tr.placa) + ' un', 'Até devolver ou justificar', 'accent')}
        ${tile('Outros materiais pendentes', outrosPend.length ? outrosPend.map((x) => n(x.qtd) + ' ' + x.m.un + ' ' + esc(x.m.nome)).join('<br>') : txt('Nenhum'))}
      </div>
      <div class="section-title">Materiais enviados</div>
      <div class="panel">${ent.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>O que foi</th><th>Situação</th><th>Obs.</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : U.vazio('truck', 'Nada enviado ainda', '', pode ? `<button class="btn primary" data-acao="nova-entrega" data-prest="${p.id}">${icon('plus')} Enviar material</button>` : '')}</div>`;
    }
    if (aba === 'producao') {
      const porDia = {}; for (const x of prod) porDia[x.data] = (porDia[x.data] || 0) + x.qtd;
      const dias = Object.keys(porDia).sort().reverse();
      const linhasProd = prod.slice().sort((a, b) => b.data.localeCompare(a.data)).map((x) => `<tr><td class="nowrap">${data(x.data)}</td><td class="num r">${n(x.qtd)}</td><td class="num r">${n(x.cortadaUsada)}</td><td>${esc(x.obs)}</td><td class="r">${botoesRegistro('producao', x, user)}</td></tr>`).join('');
      const nomesRet = { rasgada: 'rasgadas', placa: 'placas', cortada: 'palha cortada' };
      const linhasRet = ret.slice().sort((a, b) => b.data.localeCompare(a.data)).map((x) => {
        const cel = ['rasgada', 'placa', 'cortada'].filter((k) => x.itens[k].rec > 0).map((k) => {
          const it = x.itens[k]; const dif = it.conf != null ? it.conf - it.rec : null;
          return `${nomesRet[k]}: <span class="num">${n(it.rec)}</span> recebidas, ${it.conf == null ? badge('sem conferência', 'warn') : '<span class="num">' + n(it.conf) + '</span> conferidas' + (dif ? ' ' + badge('diferença ' + n(dif), 'bad') : '')}`;
        }).join('<br>');
        const dan = x.danificados.map((d) => `${esc(D.nomeMat(s, d.mat))}: <span class="num">${n(d.qtd)}</span> danificado/perdido (${esc(d.motivo)})`).join('<br>');
        return `<tr><td class="nowrap">${data(x.data)}</td><td>${cel}${dan ? '<br>' + dan : ''}</td><td class="r">${botoesRegistro('retorno', x, user, D.pode(user, 'conferir') ? `<button class="btn sm" data-acao="conferir-retorno" data-id="${x.id}">Conferir</button>` : '')}</td></tr>`;
      }).join('');
      corpo = `<div class="tiles" style="margin-top:20px">
        ${tile('Rasgou no período', mil(r.produzida), r.registros + ' registro(s)', 'accent')}
        ${tile('Devolveu no período', mil(r.devolvida), 'Conferidas: ' + n(r.conferida))}
        ${tile('Ainda fora da fábrica (agora)', mil(D.r3(loc.rasgada + tr.rasgada)), 'Rasgado menos devolvido, de todos os períodos')}
        ${tile('Rejeitadas no período', mil(r.lixo), 'Lixo: não entra na conta nem no pagamento')}
      </div>
      <div class="cols" style="margin-top:22px">
        <div class="panel"><div class="panel-head"><div><h2>Produção por dia</h2><p>${esc(per.rotulo)}</p></div></div>
          ${dias.length ? `<div class="table-wrap"><table><thead><tr><th>Dia</th><th class="r">Milheiros rasgados</th></tr></thead><tbody>${dias.map((d) => `<tr><td>${data(d)}</td><td class="num r">${n(D.r3(porDia[d]))}</td></tr>`).join('')}</tbody></table></div>` : U.vazio('hand-tap', 'Nada neste período', '')}</div>
        <div class="panel"><div class="panel-head"><div><h2>Devoluções</h2><p>Rasgar não é devolver. Aqui está o que voltou de fato.</p></div></div>
          ${ret.length ? `<div class="table-wrap"><table><tbody>${linhasRet}</tbody></table></div>` : U.vazio('arrow-u-down-left', 'Nada devolvido neste período', '')}</div>
      </div>
      <div class="section-title">Registros de rasgo</div>
      <div class="panel">${prod.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th class="r">Rasgadas (milheiros)</th><th class="r">Cortada usada (kg)</th><th>Obs.</th><th></th></tr></thead><tbody>${linhasProd}</tbody></table></div>` : U.vazio('hand-tap', 'Sem registros neste período', '')}</div>`;
    }
    if (aba === 'financeiro') {
      const lancs = s.lanc.filter((l) => l.tipo === 'REMUN_PRESTADOR' && l.pessoaId === p.id && l.estado === 'ATIVO' && noPer(l.data, per)).sort((a, b) => b.data.localeCompare(a.data));
      const preco = D.precoVigente(s, 'milheiro_prestador', p.id, D.hoje());
      const linhas = lancs.map((l) => `<tr><td class="nowrap">${data(l.data)}</td><td class="num r">${n(l.snap.qtdRemuneravel)}</td><td class="num r">${l.snap.precoMilheiroCentavos == null ? '-' : brl(l.snap.precoMilheiroCentavos)}</td>
        <td class="r">${valorLanc(s, l)}</td><td class="num r">${l.valor == null ? '-' : brl(D.lancPago(s, l))}</td><td class="num r">${l.valor == null ? '-' : brl(D.lancPendente(s, l))}</td><td class="r">${recalcBtn(l, user)}</td></tr>`).join('');
      corpo = `
      <div style="margin-top:20px">${U.aviso('info', 'O prestador recebe <b>pelo que foi registrado</b>: milheiros rasgados × valor do milheiro. Palhas rejeitadas são lixo e ficam de fora. O valor do milheiro usado em cada registro fica gravado, mesmo que o preço mude depois.')}</div>
      <div class="section-title">Quantidades</div>
      <div class="tiles">
        ${tile('Rasgou no período', mil(r.produzida), 'Esta é a quantidade que gera pagamento', 'accent')}
        ${tile('Devolveu no período', mil(r.devolvida), 'Não muda o valor devido')}
      </div>
      <div class="section-title">Valores (reais)</div>
      <div class="tiles">
        ${tile('Valor do milheiro', preco ? brl(preco.centavos) : txt('Não definido'), preco ? (preco.origem === 'pessoa' ? 'Valor próprio deste prestador' : 'Valor padrão') : 'Defina em Cadastros')}
        ${tile('Devido no período', brl(r.devido), r.aguardando ? r.aguardando + ' registro(s) sem valor' : 'Calculado')}
        ${tile('Pago no período', brl(r.pago))}
        ${tile('Saldo a receber (total)', brl(r.pendenteTotal), 'Devido menos pago, de todos os períodos', r.pendenteTotal > 0 ? 'accent' : '')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        ${D.pode(user, 'pagar') ? `<button class="btn primary" data-acao="pagar-pessoa" data-id="${p.id}" ${r.pendenteTotal > 0 ? '' : 'disabled'}>${icon('hand-coins')} Registrar pagamento</button>` : ''}
      </div>
      <div class="section-title">Valores calculados no período</div>
      <div class="panel">${lancs.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th class="r">Milheiros</th><th class="r">Valor do milheiro</th><th class="r">Total devido</th><th class="r">Pago</th><th class="r">Pendente</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : U.vazio('coins', 'Nada neste período', 'O valor devido aparece sozinho quando você registra o rasgo.')}</div>`;
    }
    return topo + '<div>' + corpo + '</div>';
  };

  /* ================= RASGO (banca e casa) ================= */
  V.telas.rasgo = ({ s, user }) => {
    const per = perAtual();
    const f = V.filtros.rasgoLocal;
    const todos = s.producoes.filter((p) => noPer(p.data, per));
    const lista = todos.filter((p) => !f || p.local === f).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
    const at = todos.filter((p) => p.estado === 'ATIVO');
    const casa = soma(at.filter((p) => p.local === 'CASA'), (p) => p.qtd), banca = soma(at.filter((p) => p.local === 'BANCA'), (p) => p.qtd);
    const usada = soma(at, (p) => p.cortadaUsada), lixo = soma(at, (p) => p.lixo);
    const comUso = at.filter((p) => p.cortadaUsada > 0);
    const razao = comUso.length ? soma(comUso, (p) => p.qtd) / soma(comUso, (p) => p.cortadaUsada) : null;
    const linhas = lista.map((p) => {
      const l = p.estado === 'ATIVO' && p.local === 'CASA' ? lancDe(s, 'producao', p.id) : null;
      return `<tr class="${p.estado === 'ESTORNADO' ? 'estornado' : ''}"><td class="nowrap">${data(p.data)}</td>
        <td>${p.local === 'CASA' ? esc(D.nomePessoa(s, p.prestadorId)) + '<br>' + badge('Em casa (rota)', 'info') : 'Na banca<br>' + badge('Banca')}</td>
        <td class="num r">${n(p.cortadaUsada)}</td><td class="num r">${n(p.qtd)}</td><td class="num r">${p.lixo ? n(p.lixo) : '-'}</td>
        <td class="r">${p.local === 'CASA' ? valorLanc(s, l) : '<span class="faint">sem pagamento por milheiro</span>'}</td>
        <td class="r">${p.estado === 'ATIVO' ? botoesRegistro('producao', p, user, recalcBtn(l, user)) : badge('Estornado', 'bad')}</td></tr>`;
    }).join('');
    return `
    <div class="page-head"><div><h1>Rasgo</h1><p>Aqui a palha cortada é rasgada. Cada registro dá baixa na palha cortada usada (em kg) e entra a palha rasgada (em milheiros), na banca ou em casa (rota).</p></div>
      ${D.pode(user, 'lancar') ? `<button class="btn primary" data-acao="nova-producao">${icon('plus')} Registrar rasgo</button>` : ''}</div>
    ${barraPeriodo()}
    <div class="tiles" style="margin-top:20px">
      ${tile('Rasgado na banca', mil(D.r3(banca)))}
      ${tile('Rasgado em casa (rota)', mil(D.r3(casa)))}
      ${tile('Palha cortada usada', kg(D.r3(usada)), 'Baixa do estoque de palha cortada', 'accent')}
      ${tile('Milheiros por kg cortado', razao == null ? '-' : n(D.r3(razao)), 'Milheiros rasgados para cada kg de palha cortada usado, média do período')}
      ${tile('Rejeitadas (lixo)', mil(D.r3(lixo)), 'Só anotado. Não entra em estoque nem pagamento')}
    </div>
    <div class="section-title">Registros</div>
    <div class="panel"><div class="panel-head"><div><h2>${esc(per.rotulo)}</h2></div>
      <select data-filtro="rasgoLocal" style="max-width:260px"><option value="">Banca e casa</option><option value="BANCA" ${f === 'BANCA' ? 'selected' : ''}>Só na banca</option><option value="CASA" ${f === 'CASA' ? 'selected' : ''}>Só em casa (rota)</option></select></div>
      ${lista.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Onde e quem</th><th class="r">Cortada usada</th><th class="r">Rasgadas</th><th class="r">Lixo</th><th class="r">A receber</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : U.vazio('hand-tap', 'Nenhum rasgo neste período', 'Registre o rasgo feito na banca ou em casa.', D.pode(user, 'lancar') ? `<button class="btn primary" data-acao="nova-producao">${icon('plus')} Registrar rasgo</button>` : '')}</div>`;
  };

  function selPrest(s, id) { const l = papel(s, 'prestador'); return { n: 'prestadorId', t: 'select', r: 'Prestador', op: optPessoas(l, l.length ? 'Escolha...' : 'Nenhum prestador cadastrado'), v: id || '', req: true }; }

  function formEntrega(reg, prestId) {
    const s = S.estado, fab = D.saldosPorLocal(s, 'FABRICA'), out = outros(s);
    const it = (m) => (reg ? (reg.itens.find((i) => i.mat === m) || {}).qtd : '');
    const outro = reg ? reg.itens.find((i) => i.mat !== 'cortada' && i.mat !== 'placa') : null;
    const campos = [
      { n: 'data', t: 'date', r: 'Data da entrega', v: reg ? reg.data : D.hoje(), req: true },
      selPrest(s, reg ? reg.prestadorId : prestId),
      { n: 'cortada', t: 'num', r: 'Palha cortada enviada', suf: 'kg', v: emBranco(it('cortada')), ajuda: 'Na fábrica agora: ' + kg(fab.cortada) },
      { n: 'placa', t: 'num', r: 'Placas reutilizáveis enviadas', suf: 'un', v: emBranco(it('placa')), ajuda: 'Na fábrica agora: ' + n(fab.placa) + ' un. Placa enviada continua sob responsabilidade do prestador até voltar.' }
    ];
    if (out.length) {
      campos.push({ n: 'outroMat', t: 'select', r: 'Outro material (se houver)', op: [['', 'Nenhum']].concat(out.map((m) => [m.id, m.nome + ' (' + m.un + ')'])), v: outro ? outro.mat : '' });
      campos.push({ n: 'outroQtd', t: 'num', r: 'Quantidade do outro material', v: outro ? emBranco(outro.qtd) : '' });
    }
    campos.push({ n: 'obs', t: 'area', r: 'Observações', v: reg ? reg.obs : '' });
    if (reg) campos.push({ n: 'motivo', t: 'area', r: 'Motivo da correção', req: true });
    U.form({
      titulo: reg ? 'Corrigir entrega' : 'Enviar material ao prestador', intro: S.estado.config.usaTransito ? 'O material fica "em trânsito" até você confirmar que chegou.' : 'O material sai do estoque da fábrica e passa a ficar com o prestador.',
      campos, enviar: reg ? 'Salvar correção' : 'Registrar envio',
      onSubmit(v) {
        const itens = [{ mat: 'cortada', qtd: v.cortada || 0 }, { mat: 'placa', qtd: v.placa || 0 }];
        if (v.outroMat && v.outroQtd) itens.push({ mat: v.outroMat, qtd: v.outroQtd });
        const dados = { data: v.data, prestadorId: v.prestadorId, itens, obs: v.obs };
        salvar((st, u) => (reg ? D.corrigir(st, u, 'entrega', reg.id, dados, v.motivo) : D.criar(st, u, 'entrega', dados)), reg ? 'Entrega corrigida.' : 'Envio registrado.');
      }
    });
  }

  function formProducao(reg, prestId) {
    const s = S.estado;
    const campos = [
      { n: 'data', t: 'date', r: 'Data do rasgo', v: reg ? reg.data : D.hoje(), req: true },
      { n: 'local', t: 'radio', r: 'Onde foi rasgado?', op: [['CASA', 'Em casa (prestador)'], ['BANCA', 'Na banca']], v: reg ? reg.local : 'CASA' },
      Object.assign(selPrest(s, reg ? reg.prestadorId : prestId), { req: false, r: 'Quem rasgou (prestador)' }),
      { n: 'cortadaUsada', t: 'num', r: 'Palha cortada usada', suf: 'kg', req: true, v: reg ? emBranco(reg.cortadaUsada) : '', ajuda: 'Quanto de palha cortada foi usado. Isso dá baixa no estoque de palha cortada.' },
      { n: 'qtd', t: 'num', r: 'Palha rasgada obtida', suf: 'milheiros', req: true, v: reg ? emBranco(reg.qtd) : '', ajuda: 'Só o que foi aproveitado. Em casa, é esta quantidade que gera o pagamento.' },
      { n: 'lixo', t: 'num', r: 'Palhas rejeitadas (lixo), se quiser anotar', suf: 'milheiros', v: reg ? emBranco(reg.lixo) : '', ajuda: 'Só anotação. Lixo não entra em estoque, produção nem pagamento.' },
      { n: 'placasPosse', t: 'num', r: 'Placas que ficaram com ele (se souber)', suf: 'un', v: reg ? emBranco(reg.placasPosse) : '' },
      { n: 'obs', t: 'area', r: 'Observações', v: reg ? reg.obs : '' }
    ];
    if (reg) campos.push({ n: 'motivo', t: 'area', r: 'Motivo da correção', req: true });
    U.form({
      titulo: reg ? 'Corrigir rasgo' : 'Registrar rasgo', intro: 'Registre quanto de palha cortada foi usada e quanto de palha rasgada saiu.',
      campos, enviar: reg ? 'Salvar correção' : 'Registrar rasgo',
      onMount(form) {
        const prest = form.elements.prestadorId.closest('.field');
        const ajuda = form.elements.cortadaUsada.closest('.field').querySelector('.help');
        const base = ajuda.textContent;
        const atualizar = () => {
          const casa = form.querySelector('[name=local]:checked').value === 'CASA';
          prest.classList.toggle('hide', !casa);
          const id = form.elements.prestadorId.value;
          const disp = casa ? (id ? D.saldo(S.estado, 'cortada', D.locPrest(id)) : null) : D.saldo(S.estado, 'cortada', 'FABRICA');
          ajuda.textContent = base + (disp == null ? '' : ' Disponível ' + (casa ? 'com ele' : 'na fábrica') + ': ' + mil(disp) + '.');
        };
        form.addEventListener('change', atualizar); atualizar();
      },
      onSubmit(v) {
        const dados = { data: v.data, local: v.local, prestadorId: v.local === 'CASA' ? v.prestadorId : null, qtd: v.qtd, cortadaUsada: v.cortadaUsada, lixo: v.lixo, placasPosse: v.placasPosse, obs: v.obs };
        salvar((st, u) => (reg ? D.corrigir(st, u, 'producao', reg.id, dados, v.motivo) : D.criar(st, u, 'producao', dados)), reg ? 'Rasgo corrigido.' : 'Rasgo registrado.');
      }
    });
  }

  function formRetorno(reg, prestId) {
    const s = S.estado;
    const linha = (k, nome, un) => [
      { t: 'html', html: '<div class="row2">' },
      { n: 'r_' + k, t: 'num', r: nome + ' que voltaram', suf: un, v: reg ? emBranco(reg.itens[k].rec) : '' },
      { n: 'c_' + k, t: 'num', r: 'Conferidas pela banca', suf: un, v: reg ? emBranco(reg.itens[k].conf) : '', ajuda: 'Deixe em branco se ainda não conferiu.' },
      { t: 'html', html: '</div>' }
    ];
    const mats = s.materiais.map((m) => [m.id, m.nome]);
    const campos = [
      { n: 'data', t: 'date', r: 'Data da devolução', v: reg ? reg.data : D.hoje(), req: true },
      selPrest(s, reg ? reg.prestadorId : prestId),
      { t: 'html', html: '<div id="info-saldo" class="preview">Escolha o prestador para ver o que ainda está com ele.</div>' },
      ...linha('rasgada', 'Palhas rasgadas', 'milheiros'), ...linha('placa', 'Placas', 'un'), ...linha('cortada', 'Palha cortada não utilizada', 'kg'),
      { t: 'html', html: '<div class="sub-block"><h4>Material danificado ou perdido (opcional)</h4>' },
      { n: 'dMat', t: 'select', r: 'Qual material', op: [['', 'Nenhum']].concat(mats), v: reg && reg.danificados[0] ? reg.danificados[0].mat : '' },
      { n: 'dQtd', t: 'num', r: 'Quantidade', v: reg && reg.danificados[0] ? emBranco(reg.danificados[0].qtd) : '' },
      { n: 'dMotivo', t: 'text', r: 'O que aconteceu', v: reg && reg.danificados[0] ? reg.danificados[0].motivo : '' },
      { t: 'html', html: '</div>' },
      { n: 'obs', t: 'area', r: 'Observações', v: reg ? reg.obs : '' }
    ];
    if (reg) campos.push({ n: 'motivo', t: 'area', r: 'Motivo da correção', req: true });
    U.form({
      titulo: reg ? 'Corrigir devolução' : 'Prestador devolveu', intro: 'Registre o que voltou à fábrica. A devolução não muda o valor devido ao prestador.',
      campos, enviar: reg ? 'Salvar correção' : 'Registrar devolução',
      onMount(form) {
        const info = form.querySelector('#info-saldo');
        const mostrar = () => {
          const id = form.elements.prestadorId.value; if (!id) return;
          const x = D.saldosPorLocal(S.estado, D.locPrest(id));
          info.innerHTML = 'Ainda com ' + esc(D.nomePessoa(S.estado, id)) + ': <b>' + mil(x.rasgada) + '</b> rasgadas, <b>' + U.n(x.placa) + ' un</b> de placas, <b>' + kg(x.cortada) + '</b> de palha cortada.';
        };
        form.elements.prestadorId.addEventListener('change', mostrar); mostrar();
      },
      onSubmit(v) {
        const itens = {}; for (const k of ['rasgada', 'placa', 'cortada']) itens[k] = { rec: v['r_' + k], conf: v['c_' + k] };
        const dan = v.dMat && v.dQtd ? [{ mat: v.dMat, qtd: v.dQtd, motivo: v.dMotivo }] : [];
        const dados = { data: v.data, prestadorId: v.prestadorId, itens, danificados: dan, obs: v.obs };
        salvar((st, u) => (reg ? D.corrigir(st, u, 'retorno', reg.id, dados, v.motivo) : D.criar(st, u, 'retorno', dados)), reg ? 'Devolução corrigida.' : 'Devolução registrada.');
      }
    });
  }

  /* ================= PLACAS ================= */
  V.telas.placas = ({ s, user }) => {
    const r = D.resumoPlacas(s);
    const confere = Math.abs(r.total - (r.fabrica + r.comPrest + r.transito + r.danificadas)) < 1e-9;
    const cfs = s.conferencias.slice().sort((a, b) => b.em.localeCompare(a.em)).filter((c) => c.mat === 'placa').slice(0, 15);
    const movs = s.movs.filter((m) => m.mat === 'placa').slice().sort((a, b) => b.em.localeCompare(a.em)).slice(0, 15);
    const locs = [['FABRICA', 'Fábrica']].concat(papel(s, 'prestador').map((p) => [D.locPrest(p.id), p.nome]));
    return `
    <div class="page-head"><div><h1>Placas reutilizáveis</h1><p>As placas apoiam o trabalho e voltam para a fábrica. Elas não são gastas a cada serviço. O sistema calcula onde elas estão a partir do que você registra.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${D.pode(user, 'lancar') ? `<button class="btn" data-acao="placas-novas">${icon('plus')} Cadastrar placas novas</button>` : ''}
      ${D.pode(user, 'corrigir') ? `<button class="btn" data-acao="baixa-placa">${icon('trash')} Baixa: danificada ou perdida</button>` : ''}
      ${D.pode(user, 'conferir') ? `<button class="btn primary" data-acao="conferir-estoque" data-mat="placa">${icon('clipboard-text')} Fazer conferência</button>` : ''}</div></div>
    <div class="tiles">
      ${tile('Total cadastrado', n(r.total) + ' un', 'Tudo que existe: fábrica + prestadores + danificadas', 'accent')}
      ${tile('Disponíveis na fábrica', n(r.fabrica) + ' un')}
      ${tile('Com os prestadores', n(r.comPrest) + ' un', r.transito ? n(r.transito) + ' un em trânsito' : '')}
      ${tile('Já devolvidas', n(r.devolvidas) + ' un', 'Soma das devoluções registradas')}
      ${tile('Danificadas ou perdidas', n(r.danificadas) + ' un')}
    </div>
    <div style="margin-top:16px">${confere ? U.aviso('ok', 'As contas fecham: o total é igual à soma dos lugares.') : U.aviso('bad', 'As contas não fecham. Avise o administrador.')}</div>
    <div class="cols" style="margin-top:22px">
      <div class="panel"><div class="panel-head"><div><h2>Com cada prestador</h2></div></div>
        ${r.porPrestador.length ? `<div class="list">${r.porPrestador.map((x) => `<div class="item"><div class="grow"><a href="#/prestadores/${x.pessoaId}/materiais">${esc(D.nomePessoa(s, x.pessoaId))}</a></div><b class="num">${n(x.qtd + x.transito)} un</b></div>`).join('')}</div>` : U.vazio('stack', 'Nenhuma placa fora da fábrica', '')}</div>
      <div class="panel"><div class="panel-head"><div><h2>Conferências</h2><p>Contagem física contra o que o sistema espera. Diferença não gera baixa sozinha.</p></div></div>
        ${cfs.length ? `<div class="list">${cfs.map((c) => `<div class="item"><div class="grow">${esc(D.nomeLoc(s, c.loc))}<small>${data(c.data)}: sistema ${n(c.sistema)}, contado ${n(c.contado)}</small></div>
          ${c.estado === 'OK' ? badge('Confere', 'ok') : c.estado === 'ABERTA' ? `${badge('Diferença ' + n(c.dif), 'bad')}${D.pode(user, 'corrigir') ? `<button class="btn sm" data-acao="resolver-conf" data-id="${c.id}">Resolver</button>` : ''}` : badge(c.estado === 'AJUSTADA' ? 'Ajustada' : 'Encerrada', 'muted')}</div>`).join('')}</div>` : U.vazio('clipboard-text', 'Nenhuma conferência ainda', '')}</div>
    </div>
    <div class="section-title">Últimas movimentações de placas</div>
    <div class="panel">${movs.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>O que aconteceu</th><th class="r">Qtd.</th><th>De</th><th>Para</th></tr></thead><tbody>${movs.map((m) => `<tr><td class="nowrap">${data(m.data)}</td><td>${esc(nomeTipoMov[m.tipo] || m.tipo)}${m.just ? '<br><span class="faint">' + esc(m.just) + '</span>' : ''}</td><td class="num r">${n(m.qtd)}</td><td>${esc(D.nomeLoc(s, m.de))}</td><td>${esc(D.nomeLoc(s, m.para))}</td></tr>`).join('')}</tbody></table></div>` : U.vazio('stack', 'Sem movimentações', '')}</div>`;
  };

  /* ================= ESTOQUE ================= */
  V.telas.estoque = ({ s, user }) => {
    const fab = D.saldosPorLocal(s, 'FABRICA'), dan = D.saldosPorLocal(s, 'DANIFICADO');
    const com = {}, tra = {};
    for (const m of s.materiais) { com[m.id] = 0; tra[m.id] = 0; }
    for (const p of papel(s, 'prestador')) {
      const a = D.saldosPorLocal(s, D.locPrest(p.id)), b = D.saldosPorLocal(s, D.locTransito(p.id));
      for (const m of s.materiais) { com[m.id] += a[m.id] || 0; tra[m.id] += b[m.id] || 0; }
    }
    const f = V.filtros.estMat;
    const movs = s.movs.filter((m) => !f || m.mat === f).slice().sort((a, b) => b.em.localeCompare(a.em)).slice(0, 80);
    const linhas = s.materiais.map((m) => `<tr><td><b>${esc(m.nome)}</b></td><td class="num r">${n(fab[m.id])}</td><td class="num r">${n(D.r3(com[m.id]))}</td><td class="num r">${n(D.r3(tra[m.id]))}</td><td class="num r">${n(dan[m.id])}</td><td class="muted">${m.un}</td></tr>`).join('');
    return `
    <div class="page-head"><div><h1>Estoque</h1><p>Onde está cada material agora. Estes números vêm das movimentações e não podem ser digitados à mão.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${D.pode(user, 'lancar') ? `<button class="btn" data-acao="consumo">${icon('fire')} Registrar consumo</button><button class="btn" data-acao="produto-pronto">${icon('cube')} Produto acabado pronto</button><button class="btn" data-acao="entrada-material">${icon('plus')} Entrada de material</button>` : ''}
      ${D.pode(user, 'conferir') ? `<button class="btn primary" data-acao="conferir-estoque">${icon('clipboard-text')} Conferir contagem</button>` : ''}</div></div>
    <div class="panel"><div class="table-wrap"><table><thead><tr><th>Material</th><th class="r">Na fábrica</th><th class="r">Com prestadores</th><th class="r">Em trânsito</th><th class="r">Danificado ou perdido</th><th>Unidade</th></tr></thead><tbody>${linhas}</tbody></table></div></div>
    <div class="section-title">Movimentações</div>
    <div class="panel"><div class="panel-head"><div><h2>Histórico</h2></div>
      <select data-filtro="estMat" style="max-width:300px"><option value="">Todos os materiais</option>${s.materiais.map((m) => `<option value="${m.id}" ${f === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
      ${movs.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>O que aconteceu</th><th>Material</th><th class="r">Qtd.</th><th>De</th><th>Para</th><th>Quem</th></tr></thead><tbody>${movs.map((m) => `<tr><td class="nowrap">${data(m.data)}</td><td>${esc(nomeTipoMov[m.tipo] || m.tipo)}${m.just ? '<br><span class="faint">' + esc(m.just) + '</span>' : ''}</td><td>${esc(D.nomeMat(s, m.mat))}</td><td class="num r">${n(m.qtd)} ${unMat(s, m.mat)}</td><td>${esc(D.nomeLoc(s, m.de))}</td><td>${esc(D.nomeLoc(s, m.para))}</td><td>${esc(m.por)}</td></tr>`).join('')}</tbody></table></div>` : U.vazio('warehouse', 'Nenhuma movimentação', '')}</div>`;
  };

  /* ================= DINHEIRO ================= */
  V.telas.dinheiro = ({ s, user }) => {
    const per = perAtual();
    const f = D.resumoFinanceiro(s, per);
    const lu = D.lucroEstimado(s, per);
    const aba = V.filtros.dinAba;
    let ls = s.lanc.filter((l) => l.estado === 'ATIVO' && noPer(l.data, per)).slice().sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
    if (aba === 'abertos') ls = ls.filter((l) => l.valor == null || D.lancPendente(s, l) > 0);
    if (aba === 'pagar') ls = ls.filter((l) => l.dir === 'PAGAR');
    if (aba === 'receber') ls = ls.filter((l) => l.dir === 'RECEBER');
    const linhas = ls.slice(0, 150).map((l) => {
      const pend = D.lancPendente(s, l);
      const acao = (D.pode(user, 'pagar') && pend > 0 ? `<button class="btn sm" data-acao="baixar" data-id="${l.id}">${l.dir === 'PAGAR' ? 'Pagar' : 'Receber'}</button>` : '') + recalcBtn(l, user);
      return `<tr><td class="nowrap">${data(l.data)}</td><td>${esc(D.descLanc(s, l))}${l.provisorio ? ' ' + U.provisorio() : ''}</td><td>${l.dir === 'PAGAR' ? badge('A pagar') : badge('A receber', 'ok')}</td>
        <td class="num r">${l.valor == null ? badge('Aguardando', 'warn') + '<div class="faint" style="font-size:.8rem">' + esc(l.aguardando || '') + '</div>' : brl(l.valor)}</td>
        <td class="num r">${l.valor == null ? '-' : brl(D.lancPago(s, l))}</td><td class="num r">${pend == null ? '-' : brl(pend)}</td><td class="r">${acao}</td></tr>`;
    }).join('');
    const abas = [['abertos', 'Em aberto'], ['pagar', 'Tudo a pagar'], ['receber', 'Tudo a receber'], ['todos', 'Todos']];
    return `
    <div class="page-head"><div><h1>Dinheiro</h1><p>Aqui só entram valores em reais. "Devido" e "pago" são coisas diferentes: primeiro o sistema calcula o que se deve, depois você registra o pagamento.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${D.pode(user, 'pagar') ? `<button class="btn primary" data-acao="pagar-pessoa">${icon('hand-coins')} Pagar alguém</button>` : ''}
      ${D.pode(user, 'lancar') ? `<button class="btn" data-acao="nova-venda">${icon('storefront')} Registrar venda</button><button class="btn" data-acao="nova-despesa">${icon('receipt')} Registrar despesa</button>` : ''}</div></div>
    ${barraPeriodo()}
    <div class="section-title">A pagar (lançado no período)</div>
    <div class="tiles">
      ${tile('Fornecedores (matéria-prima)', brl(f.comprasPend), 'de ' + brl(f.compras) + ' comprados')}
      ${tile('Cortadores', brl(f.cortadoresPend) + (f.cortadoresProvisorio ? '' : ''), (f.cortadoresProvisorio ? 'Inclui valores provisórios. ' : '') + 'de ' + brl(f.cortadores) + ' calculados')}
      ${tile('Prestadores', brl(f.prestadoresPend), 'de ' + brl(f.prestadores) + ' calculados')}
      ${tile('Despesas', brl(f.despesasPend), 'de ' + brl(f.despesas) + ' lançadas')}
    </div>
    <div class="section-title">A receber e caixa</div>
    <div class="tiles">
      ${tile('Vendas a receber', brl(f.vendasPend), 'de ' + brl(f.vendas) + ' vendidos')}
      ${tile('Já recebido', brl(f.recebido))}
      ${tile('Já pago', brl(f.pago))}
      ${tile('Recebido menos pago', brl(f.caixa), 'Movimento de caixa. Não é lucro.')}
    </div>
    <div class="section-title">Lucro estimado do período</div>
    <div class="panel"><div class="panel-head"><div><h2>Lucro em cima da média de aproveitamento esperada</h2><p>Vendas e despesas são do período escolhido. Os custos por milheiro vêm da média de todos os registros.</p></div>${U.estimativa()}</div>
      ${lu.completo ? `
        <div class="tiles">
          ${tile('Vendido (em milheiros)', mil(lu.milVendidos), brl(lu.receitaMil) + ' de venda')}
          ${tile('Custo estimado do vendido', brl(lu.custoVendido), 'Custo por milheiro: ' + brl(Math.round(lu.custoUnitario)))}
          ${tile('Lucro bruto estimado', brl(lu.lucroBruto), 'Venda menos custo estimado', 'accent')}
          ${tile('Lucro líquido estimado', brl(lu.lucroLiquido), 'Depois de ' + brl(lu.despesas) + ' de despesas')}
        </div>
        <div class="section-title">Como foi calculado</div>
        <div class="list">
          <div class="item"><div class="grow"><b>Matéria-prima: ${brl(Math.round(lu.parcelas.mp))} por milheiro</b><small>Custo médio de compra ${brl(Math.round(lu.fatores.custoKg))}/kg ÷ rendimento estimado médio ${pct(lu.fatores.rend)}, dividido por ${n(D.r3(lu.fatores.milPorKgCortado))} milheiros rasgados por kg de palha cortada.</small></div></div>
          <div class="item"><div class="grow"><b>Corte: ${brl(Math.round(lu.parcelas.corte))} por milheiro</b><small>Média paga aos cortadores por kg de palha cortada (${brl(Math.round(lu.fatores.custoCortePorKg))}/kg), dividida pelos milheiros rasgados por kg.</small></div></div>
          <div class="item"><div class="grow"><b>Rasgo: ${brl(Math.round(lu.parcelas.rasgo))} por milheiro</b><small>Média paga aos prestadores por milheiro rasgado em casa.</small></div></div>
        </div>
        ${U.aviso('warn', '<b>Estimativa.</b> Usa o rendimento esperado, não o real. Considera que 1 milheiro vendido é 1 milheiro de palha rasgada e que só entram compra, corte e rasgo em casa. Rasgo na banca, embalagem e outros materiais ainda não têm custo no cálculo.')}
        ${lu.foraMilheiro ? '<div style="margin-top:12px">' + U.aviso('info', lu.foraMilheiro + ' venda(s) de produto que não é medido em milheiro ficaram de fora do custo.') + '</div>' : ''}`
      : U.aviso('warn', '<b>Ainda faltam dados para estimar o lucro:</b><ul style="margin:8px 0 0 18px;padding:0">' + lu.faltando.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>')}
    </div>
    <div class="section-title">Lançamentos</div>
    <div class="panel"><div class="tabs" style="margin-bottom:16px">${abas.map(([k, l]) => `<button class="${aba === k ? 'on' : ''}" data-acao="aba-din" data-aba="${k}">${l}</button>`).join('')}</div>
      ${ls.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>O que é</th><th></th><th class="r">Valor</th><th class="r">Pago/recebido</th><th class="r">Pendente</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : U.vazio('coins', 'Nada por aqui', 'Os lançamentos aparecem sozinhos quando você registra compras, cortes e cálculos.')}</div>`;
  };

  function formPagarPessoa(preId) {
    const s = S.estado;
    const pendDe = (id) => soma(s.lanc.filter((l) => l.estado === 'ATIVO' && l.dir === 'PAGAR' && l.pessoaId === id && l.valor != null), (l) => D.lancPendente(s, l));
    const cand = s.pessoas.filter((p) => pendDe(p.id) > 0);
    if (!cand.length) { U.toast('Ninguém tem valor pendente para receber agora.', 'bad'); return; }
    const campos = [
      { n: 'pessoaId', t: 'select', r: 'Quem vai receber', op: cand.map((p) => [p.id, p.nome + ' (pendente ' + U.brl(pendDe(p.id)) + ')']), v: preId || cand[0].id, req: true },
      { n: 'valor', t: 'brl', r: 'Valor pago', req: true, v: '', ajuda: 'Se pagar menos que o pendente, o restante continua em aberto.' },
      { n: 'data', t: 'date', r: 'Data do pagamento', v: D.hoje(), req: true },
      { n: 'forma', t: 'text', r: 'Forma de pagamento (opcional)', ph: 'Dinheiro, Pix...' },
      { n: 'obs', t: 'area', r: 'Observações' }
    ];
    const f = U.form({
      titulo: 'Registrar pagamento', intro: 'O valor é distribuído nos lançamentos mais antigos primeiro.', campos, enviar: 'Registrar pagamento',
      onSubmit(v) { salvar((st, u) => D.pagarPessoa(st, u, { pessoaId: v.pessoaId, tipos: ['COMPRA_MP', 'REMUN_CORTADOR', 'REMUN_PRESTADOR', 'DESPESA'], valor: v.valor, data: v.data, forma: v.forma, obs: v.obs }), 'Pagamento registrado.'); }
    });
    const sel = f.elements.pessoaId, val = f.elements.valor;
    const preencher = () => { val.value = (pendDe(sel.value) / 100).toFixed(2).replace('.', ','); };
    sel.addEventListener('change', preencher); preencher();
  }

  /* ================= RENDIMENTO ================= */
  V.telas.rendimento = ({ s }) => {
    const per = { de: V.filtros.rendDe, ate: V.filtros.rendAte };
    const r = D.relatorioRendimento(s, per);
    const prov = !s.config.pesoAproveitavelConfirmado;
    const periodoTxt = per.de || per.ate ? (per.de ? 'de ' + data(per.de) + ' ' : '') + (per.ate ? 'até ' + data(per.ate) : '') : 'todo o período registrado';
    const cmp = r.comparacao;
    const ent = r.listaEntradas.map((x) => `<tr><td class="nowrap">${data(x.entrada.data)}</td><td>${esc(x.entrada.fornecedorId ? D.nomePessoa(s, x.entrada.fornecedorId) : '-')}</td><td>${esc(x.entrada.epoca || '-')}</td><td class="num r">${kg(x.entrada.pesoTotal)}</td><td class="num r">${x.entrada.rendEst == null ? '<span class="faint">não informado</span>' : pct(x.entrada.rendEst)}</td><td class="num r">${x.centavosPorKg == null ? '-' : brl(x.centavosPorKg) + '/kg'}</td></tr>`).join('');
    const ep = r.porEpoca.map((e) => `<tr><td>${esc(e.epoca || 'Sem época informada')}</td><td class="num r">${e.n}</td><td class="num r">${kg(e.kg)}</td><td class="num r">${e.estimado == null ? '-' : pct(e.estimado)}${e.nSem ? ' <span class="faint">(' + e.nSem + ' sem estimativa)</span>' : ''}</td><td class="num r">${e.centavosPorKg == null ? '-' : brl(e.centavosPorKg) + '/kg'}</td></tr>`).join('');
    const ct = r.detalheCortes.map((x) => `<tr><td class="nowrap">${data(x.corte.data)}</td><td>${esc(D.nomePessoa(s, x.corte.cortadorId))}</td><td class="num r">${kg(x.corte.processado)}</td><td class="num r">${x.aproveitavel == null ? '-' : kg(x.aproveitavel)}</td><td class="num r">${x.real == null ? '<span class="faint">sem dados</span>' : pct(x.real)}</td>
      <td>${x.entrada ? 'Só da entrada de ' + data(x.entrada.data) : '<span class="faint">Mistura do estoque</span>'}</td><td class="num r">${x.difPP == null ? '-' : pp(x.difPP)}</td></tr>`).join('');
    const custoRef = r.custo.centavosPorKg != null && r.real.valor ? r.custo.centavosPorKg / (r.real.valor / 100) : null;
    return `
    <div class="page-head"><div><h1>Rendimento da matéria-prima</h1><p>Compara o que você esperava aproveitar (estimado) com o que realmente saiu no corte (real). Custo é outra coisa e aparece separado.</p></div></div>
    <div class="panel"><div class="row3" style="align-items:end">
      <div class="field" style="margin:0"><label for="rd">Considerar a partir de</label><input type="date" id="rd" data-filtro="rendDe" value="${esc(per.de)}"></div>
      <div class="field" style="margin:0"><label for="ra">Até</label><input type="date" id="ra" data-filtro="rendAte" value="${esc(per.ate)}"></div>
      <div><button class="btn" data-acao="limpar-periodo">Limpar período</button></div></div>
      <p class="muted" style="margin-top:12px">Período considerado: <b>${esc(periodoTxt)}</b>. ${r.estimado.nEntradas} entradas (${kg(r.estimado.kgTotal)}) e ${r.real.nCortes} cortes (${kg(r.kgProcessadoCortes)} processados).</p></div>
    ${prov ? '<div style="margin-top:16px">' + U.aviso('warn', '<b>Rendimento real provisório.</b> Ainda não foi confirmado qual peso conta como aproveitável (hoje: ' + (s.config.pesoAproveitavel === 'APROVADO' ? 'aprovado' : 'entregue') + '). <a href="#/decisoes"><b>Decidir</b></a>') + '</div>' : ''}
    <div class="section-title">Resumo</div>
    <div class="tiles">
      ${tile('Rendimento estimado médio', pct(r.estimado.valor) + ' ' + U.estimativa(), r.estimado.n ? 'Média ponderada pelo peso recebido. Usa ' + r.estimado.n + ' de ' + r.estimado.nEntradas + ' entradas (' + kg(r.estimado.kg) + ').' : 'Nenhuma entrada com estimativa no período.')}
      ${tile('Rendimento real médio', pct(r.real.valor) + (prov && r.real.valor != null ? ' ' + U.provisorio() : ''), r.real.n ? 'Aproveitável ' + kg(r.real.aprov) + ' ÷ processado ' + kg(r.real.proc) + '. ' + r.real.n + ' cortes' + (r.real.nExcl ? ', ' + r.real.nExcl + ' fora por falta de dados.' : '.') : 'Nenhum corte com dados suficientes.', 'accent')}
      ${tile('Diferença (real menos estimado)', pp(cmp.difPP), cmp.difPP == null ? 'Precisa de estimativa e de cortes no período.' : cmp.difPP < 0 ? 'Saiu menos do que o esperado.' : cmp.difPP > 0 ? 'Saiu mais do que o esperado.' : 'Igual ao esperado.')}
      ${tile('Custo médio de compra', r.custo.centavosPorKg == null ? '-' : brl(r.custo.centavosPorKg) + '/kg', 'Total pago ' + brl(r.custo.total) + ' por ' + kg(r.custo.kg) + '. Não depende de rendimento.')}
    </div>
    <div class="section-title">Evolução no tempo</div>
    <div class="panel">${r.evolucao.length ? U.grafico(r.evolucao) : U.vazio('chart-line-up', 'Ainda sem dados para o gráfico', 'Registre entradas com estimativa e cortes.')}
      <p class="muted" style="margin-top:12px">Cada ponto é um mês. A linha tracejada usa as entradas recebidas no mês. A linha cheia usa os cortes feitos no mês. Como o estoque é misturado, os dois não se referem exatamente ao mesmo material.</p></div>
    <div class="section-title">Como ler estes números</div>
    <div class="panel">
      <div class="list">
        <div class="item"><div class="grow"><b>Rendimento estimado</b><small>Palpite informado na chegada da palha. Média ponderada: entrada maior pesa mais.</small></div></div>
        <div class="item"><div class="grow"><b>Rendimento real</b><small>Peso aproveitável obtido ÷ peso processado, somando todos os cortes. Não é média simples de percentuais.</small></div></div>
        <div class="item"><div class="grow"><b>Qualidade do estoque atual</b><small>Não é possível saber com precisão: o estoque é misturado. O sistema não inventa uma qualidade exata para o que está na fábrica agora.</small></div></div>
        ${custoRef != null ? `<div class="item"><div class="grow"><b>Referência de custo por kg aproveitável ${U.estimativa()}</b><small>Custo médio de compra ÷ rendimento real médio = cerca de <b class="num">${brl(custoRef)}</b> por kg aproveitável. Considera só a compra, sem corte nem outros custos.</small></div></div>` : ''}
      </div></div>
    <div class="section-title">Corte na banca e em casa (rota)</div>
    <div class="panel"><div class="table-wrap"><table><thead><tr><th>Onde</th><th class="r">Cortes</th><th class="r">Processado</th><th class="r">Aproveitável</th><th class="r">Rendimento real</th></tr></thead><tbody>
      ${r.porLocal.map((x) => `<tr><td>${x.local === 'CASA' ? 'Em casa (rota)' : 'Na banca'}</td><td class="num r">${x.n}</td><td class="num r">${kg(x.proc)}</td><td class="num r">${kg(x.aprov)}</td><td class="num r">${x.valor == null ? '<span class="faint">sem dados</span>' : pct(x.valor)}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="section-title">Por entrada de palha</div>
    <div class="panel">${ent ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Fornecedor</th><th>Época</th><th class="r">Peso</th><th class="r">Rend. estimado</th><th class="r">Custo por kg</th></tr></thead><tbody>${ent}</tbody></table></div>` : U.vazio('package', 'Nenhuma entrada no período', '')}</div>
    <div class="section-title">Por época ou safra</div>
    <div class="panel">${ep ? `<div class="table-wrap"><table><thead><tr><th>Época</th><th class="r">Entradas</th><th class="r">Peso</th><th class="r">Estimado médio</th><th class="r">Custo por kg</th></tr></thead><tbody>${ep}</tbody></table></div>` : U.vazio('plant', 'Sem dados', '')}</div>
    <div class="section-title">Resultado real de cada corte</div>
    <div class="panel">${ct ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cortador</th><th class="r">Processado</th><th class="r">Aproveitável</th><th class="r">Rend. real</th><th>Origem do material</th><th class="r">Diferença para a estimativa</th></tr></thead><tbody>${ct}</tbody></table></div>
      <p class="muted" style="margin-top:12px">A comparação por corte só aparece quando foi informado, com certeza, que o material veio de uma única entrada.</p>` : U.vazio('scissors', 'Nenhum corte no período', '')}</div>`;
  };

  /* ================= CADASTROS ================= */
  V.telas.cadastros = ({ s, user }) => {
    const aba = V.filtros.cadAba;
    const admin = D.pode(user, 'cadastros');
    const abas = [['pessoas', 'users', 'Pessoas'], ['precos', 'tag', 'Preços'], ['materiais', 'cube', 'Materiais e produtos'], ['usuarios', 'identification-card', 'Usuários']];
    let corpo = '';
    if (aba === 'pessoas') {
      const nomesPapel = { cortador: 'Cortador', prestador: 'Prestador', fornecedor: 'Fornecedor', cliente: 'Cliente' };
      corpo = `<div class="panel"><div class="panel-head"><div><h2>Pessoas</h2><p>Quem trabalha com a banca ou negocia com ela.</p></div>${admin ? `<button class="btn primary" data-acao="nova-pessoa">${icon('plus')} Nova pessoa</button>` : ''}</div>
        ${s.pessoas.length ? `<div class="list">${s.pessoas.map((p) => `<div class="item"><div class="grow"><b>${esc(p.nome)}</b><small>${esc(p.telefone || '')}</small></div>${p.papeis.map((x) => badge(nomesPapel[x])).join(' ')}</div>`).join('')}</div>` : U.vazio('users', 'Ninguém cadastrado', 'Comece pelos cortadores e prestadores.')}</div>`;
    }
    if (aba === 'precos') {
      const nomeTipo = { kg_cortador: 'Valor por kg do corte', milheiro_prestador: 'Valor do milheiro (prestador)' };
      const hist = s.precos.slice().sort((a, b) => b.inicio.localeCompare(a.inicio) || b.criadoEm.localeCompare(a.criadoEm));
      const vig = [['kg_cortador', null], ['milheiro_prestador', null]].map(([t]) => D.precoVigente(s, t, null, D.hoje()));
      corpo = `<div class="tiles">
        ${tile('Padrão: valor por kg do corte', vig[0] ? brl(vig[0].centavos) : txt('Não definido'), 'Vale para todos sem valor próprio')}
        ${tile('Padrão: valor do milheiro', vig[1] ? brl(vig[1].centavos) : txt('Não definido'), '1.000 palhas rasgadas')}</div>
        <div class="panel" style="margin-top:20px"><div class="panel-head"><div><h2>Histórico de preços</h2><p>Mudar um preço nunca altera lançamentos antigos.</p></div>${D.pode(user, 'precos') ? `<button class="btn primary" data-acao="novo-preco">${icon('plus')} Definir preço</button>` : ''}</div>
        ${hist.length ? `<div class="table-wrap"><table><thead><tr><th>Vale desde</th><th>Preço</th><th>Para quem</th><th class="r">Valor</th><th>Definido por</th></tr></thead><tbody>${hist.map((p) => `<tr><td>${data(p.inicio)}</td><td>${nomeTipo[p.tipo]}</td><td>${p.pessoaId ? esc(D.nomePessoa(s, p.pessoaId)) : 'Padrão (todos)'}</td><td class="num r">${brl(p.centavos)}</td><td>${esc(p.por)}</td></tr>`).join('')}</tbody></table></div>` : U.vazio('tag', 'Nenhum preço definido', 'Sem preço, o sistema não calcula o que cada um tem a receber.')}</div>`;
    }
    if (aba === 'materiais') {
      corpo = `<div class="panel"><div class="panel-head"><div><h2>Materiais e produtos</h2><p>Os quatro primeiros já existem. Cadastre outros materiais enviados ao prestador e os produtos acabados que a banca vende.</p></div>
        ${admin ? `<button class="btn primary" data-acao="novo-material">${icon('plus')} Novo item</button>` : ''}</div>
        <div class="list">${s.materiais.map((m) => `<div class="item"><div class="grow"><b>${esc(m.nome)}</b></div>${badge(m.un)} ${m.cat === 'produto' ? badge('Produto acabado', 'ok') : m.fixo ? badge('Padrão') : badge('Outro material')}</div>`).join('')}</div></div>`;
    }
    if (aba === 'usuarios') {
      const nomes = { admin: 'Administrador', operador: 'Funcionário', consulta: 'Só consulta' };
      corpo = `<div class="panel"><div class="panel-head"><div><h2>Usuários</h2><p>Quem usa o sistema. O nome aparece no histórico de tudo que for feito.</p></div>${admin ? `<button class="btn primary" data-acao="novo-usuario">${icon('plus')} Novo usuário</button>` : ''}</div>
        ${U.aviso('warn', 'Atenção: por enquanto não há senha. A troca de usuário serve para registrar quem fez cada coisa e limitar o que cada perfil pode fazer, mas não impede alguém de escolher outro nome.')}
        <div class="list" style="margin-top:12px">${s.usuarios.map((u) => `<div class="item"><div class="grow"><b>${esc(u.nome)}</b></div>${badge(nomes[u.perfil])} ${u.podeEstimar || u.perfil === 'admin' ? badge('Informa rendimento estimado', 'ok') : ''}</div>`).join('')}</div></div>`;
    }
    return `<div class="page-head"><div><h1>Cadastros</h1><p>Pessoas, preços e materiais usados no sistema.</p></div></div>
      <div class="tabs">${abas.map(([k, ic, l]) => `<button class="${aba === k ? 'on' : ''}" data-acao="aba-cad" data-aba="${k}">${icon(ic)} ${l}</button>`).join('')}</div>${corpo}`;
  };

  /* ================= DECISÕES ================= */
  V.telas.decisoes = ({ s, user }) => {
    const c = s.config, admin = D.pode(user, 'config');
    const ds = decisoes(s);
    const D_ = Object.fromEntries(ds.map((d) => [d.id, d]));
    const estadoBadge = (d) => (d.ok ? badge('Decidido', 'ok') : badge('Provisório', 'warn'));
    const card = (d, texto, efeito, controle, editavel) => `<div class="panel"><form data-decisao="${d.id}">
      <div class="panel-head"><div><h2>${esc(d.titulo)}</h2><p>${texto}</p></div>${estadoBadge(d)}</div>
      <div class="callout ${d.ok ? 'ok' : 'warn'}">${icon(d.ok ? 'check-circle' : 'warning')}<div><b>${d.ok ? 'Resposta da banca:' : 'Enquanto não for confirmado:'}</b> ${d.ok ? esc(d.resposta) + '. ' : ''}${efeito}</div></div>
      ${controle ? `<div style="margin-top:16px">${controle}</div>` : ''}
      ${admin && editavel ? `<div style="margin-top:14px"><button class="btn primary" type="submit">${icon('check')} Salvar</button></div>` : ''}</form></div>`;
    const sel = (nome, ops, atual) => `<select name="${nome}" ${admin ? '' : 'disabled'}>${ops.map(([v, l]) => `<option value="${v}" ${String(atual == null ? '' : atual) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const chk = (nome, ok, rot) => `<div class="choice" style="margin-top:12px"><label><input type="checkbox" name="${nome}" ${ok ? 'checked' : ''} ${admin ? '' : 'disabled'}> ${rot}</label></div>`;
    return `
    <div class="page-head"><div><h1>Decisões da banca</h1><p>Regras que a banca já decidiu e o que ainda falta confirmar. O sistema nunca escolhe sozinho: o que não foi decidido aparece como provisório.</p></div></div>
    ${admin ? '' : U.aviso('info', 'Só o administrador pode alterar estas decisões.')}
    <div class="stack" style="margin-top:20px">
      ${card(D_.pesoAproveitavel, 'Define o peso usado no rendimento real: aproveitável ÷ processado.', 'o sistema usa o peso <b>' + (c.pesoAproveitavel === 'ENTREGUE' ? 'entregue' : 'aprovado') + '</b> e o rendimento real aparece como provisório.',
        sel('valor', [['ENTREGUE', 'Peso de palha cortada entregue'], ['APROVADO', 'Peso de palha cortada aprovada']], c.pesoAproveitavel) + chk('confirmado', c.pesoAproveitavelConfirmado, 'Esta decisão está confirmada pela banca'), true)}
      ${card(D_.cortadorBase, 'Define o peso usado para calcular o pagamento do cortador: peso × valor por kg.', 'Cortes já registrados não mudam sozinhos.',
        sel('valor', [['ENTREGUE', 'Pelo peso de palha cortada entregue'], ['APROVADO', 'Só pelo peso aprovado como bom']], c.cortadorBase) + chk('confirmado', c.cortadorBaseConfirmada, 'Esta decisão está confirmada pela banca') +
        (admin ? `<div style="margin-top:12px"><button class="btn" type="button" data-acao="recalcular-cortes">${icon('arrows-clockwise')} Recalcular cortes ainda não pagos com esta regra</button></div>` : ''), true)}
      ${card(D_.prestadorBase, 'O prestador é pago por milheiro rasgado: quantidade registrada ÷ 1.000 × valor do milheiro. A devolução e a conferência não mudam o valor.', 'A conferência continua sendo registrada, só para controle de estoque.', '', false)}
      ${card(D_.tratamentoPerdas, 'Palhas rejeitadas, perdas e diferenças da produção externa.', 'Não entram em estoque, produção nem pagamento. Pode anotar a quantidade no rasgo, só por curiosidade.', '', false)}
      ${card(D_.metodoCusto, 'O lucro é calculado em cima da média de aproveitamento esperada (o rendimento estimado informado nas entradas).', 'O resultado sempre aparece marcado como estimativa. <a href="#/dinheiro"><b>Ver em Dinheiro</b></a>.', '', false)}
      ${card(D_.unidades, 'Palha para cortar e palha cortada são medidas em quilos (kg). A palha rasgada é contada em milheiros.', 'Não existe conversão automática entre kg e milheiros. O rasgo registra os kg de palha cortada usados e os milheiros rasgados, e o sistema usa a média deles apenas na estimativa de lucro.', '', false)}
      ${card(D_.baixaCortada, 'Existe corte e rasgo na banca e em casa (rota). O módulo Rasgo registra a palha cortada usada e a palha rasgada obtida.', 'A baixa é sempre informada por você, nunca calculada. <a href="#/rasgo"><b>Abrir Rasgo</b></a>.', '', false)}
      <div class="panel"><div class="panel-head"><div><h2>Ajustes</h2></div></div>
        <form data-decisao="transito"><div class="choice"><label><input type="checkbox" name="valor" ${c.usaTransito ? 'checked' : ''} ${admin ? '' : 'disabled'}> Controlar material "em trânsito" (confirmar quando chega ao prestador)</label></div>
        ${admin ? `<div style="margin-top:14px"><button class="btn" type="submit">${icon('check')} Salvar</button></div>` : ''}</form></div>
    </div>`;
  };

  /* ================= HISTÓRICO ================= */
  V.telas.historico = ({ s }) => {
    const logs = s.auditoria.slice().sort((a, b) => b.em.localeCompare(a.em)).slice(0, 300);
    return `<div class="page-head"><div><h1>Histórico</h1><p>Tudo que foi feito no sistema, com quem fez e quando. Nada é apagado: correções e estornos ficam registrados.</p></div>
      <button class="btn" data-acao="baixar-copia">${icon('download-simple')} Baixar cópia dos dados</button></div>
      ${U.aviso('info', S.modo === 'servidor' ? 'Os dados ficam salvos no computador onde o programa roda, na pasta <b>dados</b>. Uma cópia por dia é guardada em <b>dados/copias</b>.' : 'Atenção: o programa está funcionando sem o servidor. Os dados ficam só neste navegador. Use "iniciar.bat" para salvar em arquivo.')}
      <div class="panel" style="margin-top:20px">${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>O que foi feito</th><th>Detalhe</th></tr></thead><tbody>${logs.map((l) => `<tr><td class="nowrap">${U.dataHora(l.em)}</td><td>${esc(l.por)}</td><td>${esc(l.acao)}</td><td class="muted">${esc(l.detalhe)}</td></tr>`).join('')}</tbody></table></div>` : U.vazio('clock-counter-clockwise', 'Nada registrado ainda', '')}</div>`;
  };

  /* ================= AÇÕES ================= */
  const reg = (tipo, id) => { const T = { entrada: 'entradas', corte: 'cortes', entrega: 'entregas', producao: 'producoes', retorno: 'retornos' }; return S.estado[T[tipo]].find((x) => x.id === id); };
  const A = V.acoes;
  A['nova-entrada'] = () => formEntrada();
  A['novo-corte'] = () => formCorte();
  A['nova-entrega'] = (el) => formEntrega(null, el.dataset.prest);
  A['nova-producao'] = (el) => formProducao(null, el.dataset.prest);
  A['novo-retorno'] = (el) => formRetorno(null, el.dataset.prest);
  A['pagar-pessoa'] = (el) => formPagarPessoa(el.dataset.id);
  A.corrigir = (el) => {
    const r = reg(el.dataset.tipo, el.dataset.id); if (!r) return;
    ({ entrada: formEntrada, corte: formCorte, entrega: (x) => formEntrega(x), producao: (x) => formProducao(x), retorno: (x) => formRetorno(x) })[el.dataset.tipo](r);
  };
  A.estornar = (el) => {
    const tipo = el.dataset.tipo, id = el.dataset.id;
    U.confirmar({ titulo: 'Estornar registro', texto: 'O registro é cancelado e o estoque e o dinheiro voltam ao que eram. Ele continua visível no histórico, riscado.', motivo: 'Motivo do estorno', enviar: 'Estornar', perigo: true,
      onOk: (m) => salvar((st, u) => D.estornar(st, u, tipo, id, m), 'Registro estornado.') });
  };
  A['historico-registro'] = (el) => {
    const r = reg(el.dataset.tipo, el.dataset.id); if (!r) return;
    const h = r.historico.filter((x) => x.motivo !== 'Conferência');
    U.form({ titulo: 'Histórico de correções', campos: [{ t: 'html', html: '<div class="list">' + h.map((x) => `<div class="item"><div class="grow"><b>${esc(U.dataHora(x.em))}</b> por ${esc(x.por)}<small>Motivo: ${esc(x.motivo)}</small>${x.antes && x.antes.pesoTotal != null ? '<small>Antes: ' + U.kg(x.antes.pesoTotal) + ', custo ' + U.brl(x.antes.custo) + ', estimado ' + U.pct(x.antes.rendEst) + '</small>' : ''}</div></div>`).join('') + '</div>' }], enviar: 'Fechar', onSubmit: () => true });
  };
  A.chegou = (el) => tentar(() => salvar((st, u) => D.confirmarChegada(st, u, el.dataset.id), 'Chegada confirmada.'));
  A['conferir-retorno'] = (el) => {
    const r = S.estado.retornos.find((x) => x.id === el.dataset.id); if (!r) return;
    const nm = { rasgada: ['Palhas rasgadas', 'milheiros'], placa: ['Placas', 'un'], cortada: ['Palha cortada', 'kg'] };
    const campos = ['rasgada', 'placa', 'cortada'].filter((k) => r.itens[k].rec > 0).map((k) => ({ n: k, t: 'num', r: nm[k][0] + ' conferidas', suf: nm[k][1], v: emBranco(r.itens[k].conf), ajuda: 'Recebidas: ' + U.n(r.itens[k].rec) + ' ' + nm[k][1] }));
    U.form({ titulo: 'Conferir devolução', intro: 'Diga quanto você contou ou pesou. Diferença fica registrada, sem baixa automática.', campos, enviar: 'Salvar conferência',
      onSubmit: (v) => salvar((st, u) => D.conferirRetorno(st, u, r.id, v), 'Conferência registrada.') });
  };
  A['per-tipo'] = (el) => { V.filtros.perTipo = el.dataset.tipo; if (!V.filtros.perRef) V.filtros.perRef = D.hoje(); };
  A['per-mov'] = (el) => { V.filtros.perRef = D.deslocarPeriodo(V.filtros.perTipo, V.filtros.perRef || D.hoje(), Number(el.dataset.delta)); };
  A['per-hoje'] = () => { V.filtros.perRef = D.hoje(); };
  A['recalcular-lanc'] = (el) => salvar((st, u) => D.recalcularLanc(st, u, el.dataset.id), 'Valor recalculado.');
  A.baixar = (el) => {
    const s = S.estado, l = s.lanc.find((x) => x.id === el.dataset.id); if (!l) return;
    const pend = D.lancPendente(s, l);
    U.form({ titulo: l.dir === 'PAGAR' ? 'Registrar pagamento' : 'Registrar recebimento', intro: D.descLanc(s, l) + '. Pendente: ' + brl(pend) + '.',
      campos: [{ n: 'valor', t: 'brl', r: 'Valor', req: true, v: (pend / 100).toFixed(2).replace('.', ',') }, { n: 'data', t: 'date', r: 'Data', v: D.hoje(), req: true }, { n: 'forma', t: 'text', r: 'Forma (opcional)' }, { n: 'obs', t: 'area', r: 'Observações' }],
      enviar: 'Registrar', onSubmit: (v) => salvar((st, u) => D.registrarBaixa(st, u, { lancId: l.id, valor: v.valor, data: v.data, forma: v.forma, obs: v.obs }), 'Registrado.') });
  };
  A['placas-novas'] = () => U.form({ titulo: 'Cadastrar placas novas', campos: [{ n: 'qtd', t: 'num', r: 'Quantidade', suf: 'un', req: true }, { n: 'data', t: 'date', r: 'Data', v: D.hoje(), req: true }, { n: 'obs', t: 'area', r: 'Observações' }], enviar: 'Cadastrar',
    onSubmit: (v) => salvar((st, u) => D.entradaMaterial(st, u, { mat: 'placa', qtd: v.qtd, data: v.data, obs: v.obs }), 'Placas cadastradas.') });
  A['baixa-placa'] = () => {
    const s = S.estado;
    const locs = [['FABRICA', 'Na fábrica']].concat(papel(s, 'prestador').map((p) => [D.locPrest(p.id), 'Com ' + p.nome]));
    U.form({ titulo: 'Baixa de placa danificada ou perdida', intro: 'A placa sai da conta de disponíveis e fica registrada como danificada ou perdida.',
      campos: [{ n: 'loc', t: 'select', r: 'Onde estava', op: locs, req: true }, { n: 'qtd', t: 'num', r: 'Quantidade', suf: 'un', req: true }, { n: 'just', t: 'area', r: 'O que aconteceu', req: true }], enviar: 'Dar baixa',
      onSubmit: (v) => salvar((st, u) => D.baixaDanificado(st, u, { mat: 'placa', loc: v.loc, qtd: v.qtd, just: v.just }), 'Baixa registrada.') });
  };
  A['conferir-estoque'] = (el) => {
    const s = S.estado;
    const locs = [['FABRICA', 'Na fábrica']].concat(papel(s, 'prestador').map((p) => [D.locPrest(p.id), 'Com ' + p.nome]));
    const campos = [{ n: 'mat', t: 'select', r: 'Material', op: s.materiais.map((m) => [m.id, m.nome]), v: el.dataset.mat || 'placa' }, { n: 'loc', t: 'select', r: 'Onde você contou', op: locs },
      { n: 'contado', t: 'num', r: 'Quantidade contada ou pesada', req: true }, { n: 'obs', t: 'area', r: 'Observações' }];
    U.form({ titulo: 'Conferir contagem', intro: 'O sistema compara com o que espera encontrar. Se houver diferença, ela fica aberta até você resolver com justificativa.', campos, enviar: 'Registrar conferência',
      onSubmit: (v) => { const c = salvar((st, u) => D.conferir(st, u, { mat: v.mat, loc: v.loc, contado: v.contado, obs: v.obs })); U.toast(c.estado === 'OK' ? 'Confere: nenhuma diferença.' : 'Diferença de ' + n(c.dif) + ' registrada.'); } });
  };
  A['resolver-conf'] = (el) => {
    const c = S.estado.conferencias.find((x) => x.id === el.dataset.id); if (!c) return;
    U.form({ titulo: 'Resolver diferença', intro: 'Sistema esperava ' + n(c.sistema) + ' e foi contado ' + n(c.contado) + ' (' + (c.dif > 0 ? '+' : '') + n(c.dif) + ').',
      campos: [{ n: 'modo', t: 'radio', r: 'O que fazer?', op: [['ajustar', 'Ajustar o estoque para a contagem'], ['encerrar', 'Encerrar sem ajustar']], v: 'ajustar' }, { n: 'just', t: 'area', r: 'Justificativa', req: true }], enviar: 'Resolver',
      onSubmit: (v) => salvar((st, u) => D.resolverConferencia(st, u, c.id, v.modo, v.just), 'Diferença resolvida.') });
  };
  A.consumo = () => {
    const s = S.estado;
    U.form({ titulo: 'Registrar consumo de material', intro: 'Material que saiu do estoque para ser usado.', campos: [{ n: 'mat', t: 'select', r: 'Material', op: s.materiais.map((m) => [m.id, m.nome + ' (' + m.un + ')']) }, { n: 'qtd', t: 'num', r: 'Quantidade', req: true }, { n: 'data', t: 'date', r: 'Data', v: D.hoje(), req: true }, { n: 'obs', t: 'area', r: 'Observações' }], enviar: 'Registrar',
      onSubmit: (v) => salvar((st, u) => D.consumo(st, u, v), 'Consumo registrado.') });
  };
  A['entrada-material'] = () => {
    const s = S.estado;
    U.form({ titulo: 'Entrada de material', intro: 'Material que chegou à fábrica sem ser matéria-prima (para matéria-prima use "Chegou palha").', campos: [{ n: 'mat', t: 'select', r: 'Material', op: s.materiais.filter((m) => m.id !== 'mp').map((m) => [m.id, m.nome + ' (' + m.un + ')']) }, { n: 'qtd', t: 'num', r: 'Quantidade', req: true }, { n: 'data', t: 'date', r: 'Data', v: D.hoje(), req: true }, { n: 'obs', t: 'area', r: 'Observações' }], enviar: 'Registrar',
      onSubmit: (v) => salvar((st, u) => D.entradaMaterial(st, u, v), 'Entrada registrada.') });
  };
  A['produto-pronto'] = () => {
    const s = S.estado, pr = produtos(s);
    if (!pr.length) { U.toast('Cadastre um produto acabado primeiro, em Cadastros > Materiais e produtos.', 'bad'); return; }
    U.form({ titulo: 'Produto acabado pronto', intro: 'Registre o produto que ficou pronto e entrou no estoque.', campos: [{ n: 'mat', t: 'select', r: 'Produto', op: pr.map((m) => [m.id, m.nome + ' (' + m.un + ')']) }, { n: 'qtd', t: 'num', r: 'Quantidade', req: true }, { n: 'data', t: 'date', r: 'Data', v: D.hoje(), req: true }, { n: 'obs', t: 'area', r: 'Observações' }], enviar: 'Registrar',
      onSubmit: (v) => salvar((st, u) => D.entradaProduto(st, u, v), 'Produto registrado.') });
  };
  A['nova-venda'] = () => {
    const s = S.estado, pr = produtos(s);
    if (!pr.length) { U.toast('Cadastre um produto acabado primeiro, em Cadastros > Materiais e produtos.', 'bad'); return; }
    U.form({ titulo: 'Registrar venda', intro: 'O produto sai do estoque e o valor fica "a receber".', campos: [
      { n: 'data', t: 'date', r: 'Data', v: D.hoje(), req: true }, { n: 'produtoId', t: 'select', r: 'Produto', op: pr.map((m) => [m.id, m.nome + ' (na fábrica: ' + n(D.saldo(s, m.id, 'FABRICA')) + ' ' + m.un + ')']) },
      { n: 'qtd', t: 'num', r: 'Quantidade vendida', req: true }, { n: 'valor', t: 'brl', r: 'Valor total da venda', req: true },
      { n: 'clienteId', t: 'select', r: 'Cliente', op: optPessoas(papel(s, 'cliente'), 'Não informar') }, { n: 'obs', t: 'area', r: 'Observações' }], enviar: 'Registrar venda',
      onSubmit: (v) => salvar((st, u) => D.registrarVenda(st, u, v), 'Venda registrada.') });
  };
  A['nova-despesa'] = () => U.form({ titulo: 'Registrar despesa', campos: [{ n: 'data', t: 'date', r: 'Data', v: D.hoje(), req: true }, { n: 'descricao', t: 'text', r: 'O que foi', req: true, ph: 'Ex.: energia, frete, manutenção' }, { n: 'valor', t: 'brl', r: 'Valor', req: true }], enviar: 'Registrar',
    onSubmit: (v) => salvar((st, u) => D.registrarDespesa(st, u, v), 'Despesa registrada.') });
  A['nova-pessoa'] = () => U.form({ titulo: 'Nova pessoa', campos: [{ n: 'nome', t: 'text', r: 'Nome', req: true }, { n: 'telefone', t: 'text', r: 'Telefone (opcional)' },
    { t: 'html', html: '<div class="field"><span class="lbl">Função (marque uma ou mais)</span><div class="choice">' + [['cortador', 'Cortador'], ['prestador', 'Prestador (rasga em casa)'], ['fornecedor', 'Fornecedor de palha'], ['cliente', 'Cliente']].map(([v, l]) => `<label><input type="checkbox" name="papel" value="${v}"> ${l}</label>`).join('') + '</div></div>' }], enviar: 'Cadastrar',
    onSubmit: (v, form) => salvar((st, u) => D.novaPessoa(st, u, { nome: v.nome, telefone: v.telefone, papeis: [...form.querySelectorAll('[name=papel]:checked')].map((x) => x.value) }), 'Pessoa cadastrada.') });
  A['novo-preco'] = () => {
    const s = S.estado;
    U.form({ titulo: 'Definir preço', intro: 'O novo valor vale a partir da data escolhida. Lançamentos antigos não mudam.', campos: [
      { n: 'tipo', t: 'select', r: 'Qual preço', op: [['kg_cortador', 'Valor por kg do corte (cortador)'], ['milheiro_prestador', 'Valor do milheiro (prestador)']] },
      { n: 'quem', t: 'select', r: 'Para quem', op: [['', 'Padrão: vale para todos']].concat(s.pessoas.filter((p) => p.papeis.includes('cortador') || p.papeis.includes('prestador')).map((p) => [p.id, p.nome + ' (só esta pessoa)'])) },
      { n: 'valor', t: 'brl', r: 'Valor em reais', req: true }, { n: 'inicio', t: 'date', r: 'Vale a partir de', v: D.hoje(), req: true }], enviar: 'Salvar preço',
      onSubmit: (v) => salvar((st, u) => D.definirPreco(st, u, { tipo: v.tipo, pessoaId: v.quem || null, centavos: v.valor, inicio: v.inicio }), 'Preço salvo.') });
  };
  A['novo-material'] = () => U.form({ titulo: 'Novo item', campos: [{ n: 'nome', t: 'text', r: 'Nome', req: true }, { n: 'cat', t: 'select', r: 'O que é', op: [['produto', 'Produto acabado (para vender)'], ['outro', 'Outro material (enviado ao prestador)']] }, { n: 'un', t: 'select', r: 'Unidade', op: [['milheiro', 'milheiro'], ['un', 'unidade'], ['kg', 'quilo (kg)'], ['pacote', 'pacote']] }], enviar: 'Cadastrar',
    onSubmit: (v) => salvar((st, u) => D.novoMaterial(st, u, v), 'Item cadastrado.') });
  A['novo-usuario'] = () => U.form({ titulo: 'Novo usuário', campos: [{ n: 'nome', t: 'text', r: 'Nome', req: true }, { n: 'perfil', t: 'select', r: 'Perfil', op: [['operador', 'Funcionário: registra e corrige'], ['consulta', 'Só consulta'], ['admin', 'Administrador: tudo']] }, { n: 'podeEstimar', t: 'check', r: 'Pode informar o rendimento estimado' }], enviar: 'Cadastrar',
    onSubmit: (v) => salvar((st, u) => D.novoUsuario(st, u, v), 'Usuário cadastrado.') });
  A['recalcular-cortes'] = () => U.confirmar({ titulo: 'Recalcular cortes', texto: 'Recalcula o valor dos cortes que ainda não têm pagamento, usando a regra atual. Cortes já pagos não mudam.', enviar: 'Recalcular',
    onOk: () => { const k = S.agir((st, u) => D.recalcularCortes(st, u)); U.toast(k + ' lançamento(s) recalculado(s).'); } });
  A['baixar-copia'] = () => {
    const blob = new Blob([S.exportar()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'banca-palha-copia-' + D.hoje() + '.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  A['limpar-periodo'] = () => { V.filtros.rendDe = ''; V.filtros.rendAte = ''; };

  /* salvar decisões */
  V.salvarDecisao = function (id, form) {
    const val = form.elements.valor ? form.elements.valor.value : null;
    const conf = form.elements.confirmado ? form.elements.confirmado.checked : false;
    salvar((st, u) => {
      if (id === 'cortadorBase') D.definirConfig(st, u, 'cortadorBase', val, conf);
      if (id === 'pesoAproveitavel') D.definirConfig(st, u, 'pesoAproveitavel', val, conf);
      if (id === 'transito') D.definirConfig(st, u, 'usaTransito', form.elements.valor.checked);
    }, 'Decisão salva.');
  };

  V.tentar = tentar;
  root.Views = V;
})(window);
