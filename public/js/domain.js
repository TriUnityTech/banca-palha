/* Regras de negócio da Banca de Palha. Sem acesso a tela: roda no navegador e no Node (testes).
   Dinheiro sempre em CENTAVOS (inteiro). Pesos em kg com 3 casas. Palhas rasgadas em unidades. */
(function (root) {
  'use strict';
  const D = {};

  /* ---------- utilitários ---------- */
  const r3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;
  const r1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
  const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const agora = () => new Date().toISOString();
  const soma = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  D.r3 = r3; D.r1 = r1; D.hoje = hoje; D.uid = uid;

  /* ---------- locais e materiais ---------- */
  D.LOC = { FABRICA: 'FABRICA', DANIFICADO: 'DANIFICADO', EXTERNO: 'EXTERNO', PROCESSO: 'PROCESSO' };
  D.locPrest = (id) => 'P:' + id;
  D.locTransito = (id) => 'T:' + id;
  D.ehVirtual = (l) => l === 'EXTERNO' || l === 'PROCESSO';
  D.MAT = { MP: 'mp', CORTADA: 'cortada', RASGADA: 'rasgada', PLACA: 'placa' };

  D.novoBanco = function () {
    return {
      versao: 3, rev: 0,
      config: {
        /* Decisões da banca (2026-10-13) */
        cortadorBase: 'ENTREGUE', cortadorBaseConfirmada: true,     // cortador recebe pelo peso entregue
        prestadorBase: 'PRODUZIDA',                                 // prestador recebe pelo que foi registrado
        tratamentoPerdas: 'DESCONSIDERAR',                          // rejeitos e perdas são lixo
        metodoCusto: 'MEDIA_APROVEITAMENTO_ESPERADA',               // lucro sobre o rendimento estimado médio
        unidadesConfirmadas: true,                                  // matéria-prima e palha cortada em kg; palha rasgada em milheiros
        baixaCortada: 'MODULO_RASGO',                               // baixa feita no módulo de rasgo (banca ou casa)
        /* ainda pendente */
        pesoAproveitavel: 'ENTREGUE', pesoAproveitavelConfirmado: false,
        usaTransito: false
      },
      usuarios: [{ id: 'u_admin', nome: 'Administrador', perfil: 'admin', podeEstimar: true, ativo: true }],
      pessoas: [],
      materiais: [
        { id: 'mp', nome: 'Matéria-prima (palha em sacos)', un: 'kg', cat: 'materia_prima', fixo: true },
        { id: 'cortada', nome: 'Palha cortada', un: 'kg', cat: 'cortada', fixo: true },
        { id: 'rasgada', nome: 'Palha rasgada', un: 'milheiro', cat: 'rasgada', fixo: true },
        { id: 'placa', nome: 'Placa reutilizável', un: 'un', cat: 'placa', fixo: true }
      ],
      precos: [],
      entradas: [], cortes: [], entregas: [], producoes: [], retornos: [],
      movs: [], lanc: [], baixas: [], conferencias: [], auditoria: []
    };
  };

  D.migrar = function (s) {
    const base = D.novoBanco();
    for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
    for (const k of Object.keys(base.config)) if (s.config[k] === undefined) s.config[k] = base.config[k];
    if ((s.versao || 1) < 2) {
      // v2: decisões da banca aplicadas uma única vez; palha cortada e rasgada passam a milheiros
      Object.assign(s.config, { cortadorBase: 'ENTREGUE', cortadorBaseConfirmada: true, prestadorBase: 'PRODUZIDA', tratamentoPerdas: 'DESCONSIDERAR', metodoCusto: 'MEDIA_APROVEITAMENTO_ESPERADA', unidadesConfirmadas: true, baixaCortada: 'MODULO_RASGO' });
      for (const m of s.materiais) if (m.id === 'rasgada') m.un = 'milheiro';
      for (const p of s.producoes) { if (!p.local) p.local = 'CASA'; if (p.cortadaUsada === undefined) p.cortadaUsada = 0; }
      for (const c of s.cortes) if (!c.local) c.local = 'BANCA';
      s.versao = 2;
    }
    if (s.versao < 3) {
      // v3: palha cortada é controlada em kg (não em milheiros). O estoque que entrou pelo corte passa a valer o peso entregue.
      const m = s.materiais.find((x) => x.id === 'cortada');
      if (m) m.un = 'kg';
      for (const mv of s.movs) {
        if (mv.mat !== 'cortada' || mv.tipo !== 'CORTE' || !mv.ref) continue;
        const c = s.cortes.find((x) => x.id === mv.ref.id);
        if (c) mv.qtd = c.entregue;
      }
      s.versao = 3;
    }
    return s;
  };

  /* ---------- permissões ---------- */
  const OPERADOR = ['lancar', 'corrigir', 'pagar', 'conferir'];
  D.pode = function (user, acao) {
    if (!user) return false;
    if (user.perfil === 'admin') return true;
    if (user.perfil === 'operador') {
      if (acao === 'estimar') return !!user.podeEstimar;
      return OPERADOR.includes(acao);
    }
    return false;
  };
  const NOME_ACAO = { lancar: 'registrar lançamentos', corrigir: 'corrigir registros', pagar: 'registrar pagamentos', conferir: 'fazer conferências', estornar: 'estornar registros', config: 'alterar decisões e regras', precos: 'alterar preços', cadastros: 'alterar cadastros', estimar: 'informar o rendimento estimado' };
  const exigir = (user, acao) => { if (!D.pode(user, acao)) throw new Error('Seu perfil não permite ' + (NOME_ACAO[acao] || 'esta ação') + '.'); };
  D.exigir = exigir;

  /* ---------- nomes ---------- */
  D.mat = (s, id) => s.materiais.find((m) => m.id === id);
  D.nomeMat = (s, id) => (D.mat(s, id) || { nome: id }).nome;
  D.unMat = (s, id) => (D.mat(s, id) || { un: 'un' }).un;
  D.pessoa = (s, id) => s.pessoas.find((p) => p.id === id);
  D.nomePessoa = (s, id) => (D.pessoa(s, id) || { nome: '(removida)' }).nome;
  D.nomeLoc = function (s, l) {
    if (l === 'FABRICA') return 'a fábrica';
    if (l === 'DANIFICADO') return 'danificado/perdido';
    if (l === 'EXTERNO') return 'fora da banca';
    if (l === 'PROCESSO') return 'o processo';
    if (l.startsWith('P:')) return 'com ' + D.nomePessoa(s, l.slice(2));
    if (l.startsWith('T:')) return 'em trânsito para ' + D.nomePessoa(s, l.slice(2));
    return l;
  };
  const fmtQ = (q, un) => String(r3(q)).replace('.', ',') + ' ' + un;

  /* ---------- auditoria ---------- */
  function log(s, user, acao, detalhe) {
    s.auditoria.push({ id: uid('au'), em: agora(), por: user ? user.nome : '-', acao, detalhe: detalhe || '' });
  }
  D.log = log;

  /* ---------- estoque (livro de movimentações) ---------- */
  D.saldo = function (s, mat, loc) {
    let t = 0;
    for (const m of s.movs) {
      if (m.mat !== mat) continue;
      if (m.para === loc) t += m.qtd;
      if (m.de === loc) t -= m.qtd;
    }
    return r3(t);
  };
  D.saldosPorLocal = function (s, loc) {
    const out = {};
    for (const m of s.materiais) out[m.id] = 0;
    for (const m of s.movs) {
      if (m.para === loc) out[m.mat] = (out[m.mat] || 0) + m.qtd;
      if (m.de === loc) out[m.mat] = (out[m.mat] || 0) - m.qtd;
    }
    for (const k of Object.keys(out)) out[k] = r3(out[k]);
    return out;
  };
  D.locaisAtivos = function (s) {
    const set = new Set(['FABRICA', 'DANIFICADO']);
    for (const p of s.pessoas) if (p.papeis.includes('prestador')) { set.add(D.locPrest(p.id)); set.add(D.locTransito(p.id)); }
    return [...set];
  };

  function addMov(s, m) {
    const qtd = r3(m.qtd);
    if (!(qtd > 0)) throw new Error('A quantidade precisa ser maior que zero.');
    if (m.de === m.para) throw new Error('Origem e destino não podem ser o mesmo local.');
    if (!D.ehVirtual(m.de)) {
      const disp = D.saldo(s, m.mat, m.de);
      if (qtd > disp + 1e-9) {
        throw new Error('Não há ' + D.nomeMat(s, m.mat).toLowerCase() + ' suficiente em ' + D.nomeLoc(s, m.de) +
          '. Disponível: ' + fmtQ(disp, D.unMat(s, m.mat)) + '. Pedido: ' + fmtQ(qtd, D.unMat(s, m.mat)) + '.');
      }
    }
    const mov = {
      id: uid('mv'), em: agora(), data: m.data || hoje(), mat: m.mat, qtd, de: m.de, para: m.para,
      tipo: m.tipo, prestadorId: m.prestadorId || null, ref: m.ref || null, por: m.por || '-',
      obs: m.obs || '', just: m.just || '', estornoDe: m.estornoDe || null
    };
    s.movs.push(mov);
    return mov;
  }
  D.addMov = addMov;

  function estornarMovs(s, ref, user, just) {
    const ja = new Set(s.movs.filter((m) => m.estornoDe).map((m) => m.estornoDe));
    const alvo = s.movs.filter((m) => m.ref && m.ref.tipo === ref.tipo && m.ref.id === ref.id && !m.estornoDe && !ja.has(m.id));
    for (let i = alvo.length - 1; i >= 0; i--) {
      const m = alvo[i];
      try {
        addMov(s, { mat: m.mat, qtd: m.qtd, de: m.para, para: m.de, tipo: 'ESTORNO', prestadorId: m.prestadorId, ref: m.ref, por: user.nome, just, estornoDe: m.id });
      } catch (e) {
        throw new Error('Não dá para corrigir ou estornar: o material deste registro já foi movimentado depois. (' + e.message + ')');
      }
    }
  }

  /* ---------- preços ---------- */
  D.precoVigente = function (s, tipo, pessoaId, data) {
    const ok = (p) => p.tipo === tipo && p.inicio <= data;
    const pick = (lista) => lista.sort((a, b) => (b.inicio.localeCompare(a.inicio)) || b.criadoEm.localeCompare(a.criadoEm))[0];
    const propria = pick(s.precos.filter((p) => ok(p) && p.pessoaId === pessoaId));
    if (propria) return { centavos: propria.centavos, id: propria.id, origem: 'pessoa' };
    const padrao = pick(s.precos.filter((p) => ok(p) && !p.pessoaId));
    if (padrao) return { centavos: padrao.centavos, id: padrao.id, origem: 'padrao' };
    return null;
  };
  D.definirPreco = function (s, user, { tipo, pessoaId, centavos, inicio }) {
    exigir(user, 'precos');
    if (!(centavos > 0)) throw new Error('Informe um valor maior que zero.');
    if (!inicio) throw new Error('Informe a data a partir da qual o preço vale.');
    s.precos.push({ id: uid('pr'), tipo, pessoaId: pessoaId || null, centavos, inicio, criadoEm: agora(), por: user.nome });
    log(s, user, 'Preço definido', tipo + (pessoaId ? ' (' + D.nomePessoa(s, pessoaId) + ')' : ' (padrão)') + ': ' + centavos + ' centavos a partir de ' + inicio);
  };

  /* ---------- financeiro ---------- */
  D.lancPago = (s, l) => soma(s.baixas.filter((b) => b.lancId === l.id && !b.estornada), (b) => b.valor);
  D.lancPendente = (s, l) => (l.valor == null ? null : l.valor - D.lancPago(s, l));

  function novoLanc(s, d) {
    const l = {
      id: uid('lc'), tipo: d.tipo, dir: d.dir, pessoaId: d.pessoaId || null, valor: d.valor == null ? null : d.valor,
      data: d.data, desc: d.desc || '', ref: d.ref || null, estado: 'ATIVO', aguardando: d.aguardando || null,
      provisorio: !!d.provisorio, snap: d.snap || {}, criadoEm: agora()
    };
    s.lanc.push(l);
    return l;
  }
  function cancelarLancs(s, ref, user, just) {
    for (const l of s.lanc.filter((x) => x.estado === 'ATIVO' && x.ref && x.ref.tipo === ref.tipo && x.ref.id === ref.id)) {
      if (D.lancPago(s, l) > 0) throw new Error('Já existe pagamento/recebimento registrado para este lançamento. Estorne o pagamento antes de corrigir.');
      l.estado = 'ESTORNADO'; l.estornoPor = user.nome; l.estornoJust = just || '';
    }
  }

  D.registrarBaixa = function (s, user, { lancId, valor, data, forma, obs, pagamentoId }) {
    exigir(user, 'pagar');
    const l = s.lanc.find((x) => x.id === lancId);
    if (!l || l.estado !== 'ATIVO') throw new Error('Lançamento não encontrado.');
    if (l.valor == null) throw new Error('Este lançamento ainda não tem valor calculado (' + (l.aguardando || 'aguardando definição') + ').');
    if (!(valor > 0)) throw new Error('Informe um valor maior que zero.');
    const pend = D.lancPendente(s, l);
    if (valor > pend) throw new Error('O valor é maior que o saldo pendente deste lançamento.');
    const b = { id: uid('bx'), lancId, valor, data: data || hoje(), forma: forma || '', obs: obs || '', por: user.nome, em: agora(), pagamentoId: pagamentoId || uid('pg'), estornada: false };
    s.baixas.push(b);
    log(s, user, l.dir === 'PAGAR' ? 'Pagamento registrado' : 'Recebimento registrado', D.descLanc(s, l) + ' | ' + valor + ' centavos');
    return b;
  };

  /* paga uma pessoa distribuindo o valor entre os lançamentos em aberto, do mais antigo para o mais novo */
  D.pagarPessoa = function (s, user, { pessoaId, tipos, valor, data, forma, obs }) {
    exigir(user, 'pagar');
    const abertos = s.lanc.filter((l) => l.estado === 'ATIVO' && l.pessoaId === pessoaId && tipos.includes(l.tipo) && l.valor != null && D.lancPendente(s, l) > 0)
      .sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm));
    const total = soma(abertos, (l) => D.lancPendente(s, l));
    if (!(valor > 0)) throw new Error('Informe um valor maior que zero.');
    if (valor > total) throw new Error('O valor passa do que está pendente (' + total + ' centavos).');
    let resto = valor; const pagamentoId = uid('pg');
    for (const l of abertos) {
      if (resto <= 0) break;
      const v = Math.min(resto, D.lancPendente(s, l));
      D.registrarBaixa(s, user, { lancId: l.id, valor: v, data, forma, obs, pagamentoId });
      resto -= v;
    }
    return pagamentoId;
  };

  D.estornarBaixa = function (s, user, baixaId, just) {
    exigir(user, 'estornar');
    if (!just || !just.trim()) throw new Error('Explique o motivo do estorno.');
    const b = s.baixas.find((x) => x.id === baixaId);
    if (!b || b.estornada) throw new Error('Pagamento não encontrado.');
    b.estornada = true; b.estornoPor = user.nome; b.estornoJust = just; b.estornoEm = agora();
    log(s, user, 'Pagamento estornado', just);
  };

  D.descLanc = function (s, l) {
    const nomes = { COMPRA_MP: 'Compra de matéria-prima', REMUN_CORTADOR: 'Corte', REMUN_PRESTADOR: 'Produção externa', DESPESA: 'Despesa', VENDA: 'Venda' };
    return (nomes[l.tipo] || l.tipo) + (l.pessoaId ? ' - ' + D.nomePessoa(s, l.pessoaId) : '') + (l.desc ? ' - ' + l.desc : '');
  };

  /* ---------- tipos de registro (criar, corrigir, estornar de forma uniforme) ---------- */
  const TIPOS = {};

  function num(v, nome, { min = 0, max = Infinity, obrigatorio = true, inteiro = false } = {}) {
    if (v === null || v === undefined || v === '') {
      if (obrigatorio) throw new Error('Preencha: ' + nome + '.');
      return null;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('Valor inválido em: ' + nome + '.');
    if (n < min) throw new Error(nome + ' não pode ser menor que ' + min + '.');
    if (n > max) throw new Error(nome + ' não pode ser maior que ' + max + '.');
    if (inteiro && !Number.isInteger(n)) throw new Error(nome + ' precisa ser um número inteiro.');
    return r3(n);
  }
  const exigirData = (d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) throw new Error('Informe a data.'); return d; };
  const exigirPessoa = (s, id, papel) => {
    const p = D.pessoa(s, id);
    if (!p) throw new Error('Escolha ' + (papel === 'cortador' ? 'o cortador' : papel === 'prestador' ? 'o prestador' : 'a pessoa') + '.');
    if (papel && !p.papeis.includes(papel)) throw new Error(p.nome + ' não está cadastrado como ' + papel + '.');
    return p;
  };

  /* Entrada de matéria-prima */
  TIPOS.entrada = {
    col: 'entradas', nome: 'Entrada de matéria-prima', permissao: 'lancar',
    validar(s, d, user, anterior) {
      const pesos = (d.pesos || []).map((p) => num(p, 'Peso do saco', { min: 0.001 }));
      if (!pesos.length) throw new Error('Informe a quantidade de sacos e o peso.');
      const rendEst = num(d.rendEst, 'Rendimento estimado (%)', { min: 0, max: 100, obrigatorio: false });
      const antes = anterior ? anterior.rendEst : null;
      if (rendEst !== antes) exigir(user, 'estimar');
      if (d.fornecedorId) exigirPessoa(s, d.fornecedorId);
      return {
        data: exigirData(d.data), fornecedorId: d.fornecedorId || null, pesos, sacos: pesos.length,
        pesoTotal: r3(soma(pesos, (x) => x)), custo: Math.round(num(d.custo, 'Custo da compra', { min: 0 })),
        epoca: (d.epoca || '').trim(), rendEst, obs: (d.obs || '').trim()
      };
    },
    gerar(s, r, user) {
      addMov(s, { mat: 'mp', qtd: r.pesoTotal, de: 'EXTERNO', para: 'FABRICA', tipo: 'ENTRADA_MP', ref: { tipo: 'entrada', id: r.id }, por: user.nome, data: r.data });
      if (r.custo > 0) {
        novoLanc(s, { tipo: 'COMPRA_MP', dir: 'PAGAR', pessoaId: r.fornecedorId, valor: r.custo, data: r.data, desc: 'Entrada de ' + fmtQ(r.pesoTotal, 'kg'), ref: { tipo: 'entrada', id: r.id } });
      }
    }
  };

  /* Corte */
  function calcRemuneracaoCorte(s, r) {
    const base = s.config.cortadorBase;
    const preco = D.precoVigente(s, 'kg_cortador', r.cortadorId, r.data);
    const kgRem = base === 'APROVADO' ? r.aprovado : r.entregue;
    let valor = null, aguardando = null;
    if (kgRem == null) aguardando = 'falta informar o peso aprovado';
    else if (!preco) aguardando = 'falta definir o valor por kg';
    else valor = Math.round(kgRem * preco.centavos);
    return { base, preco, kgRem, valor, aguardando };
  }
  function lancCorte(s, r) {
    const c = calcRemuneracaoCorte(s, r);
    return novoLanc(s, {
      tipo: 'REMUN_CORTADOR', dir: 'PAGAR', pessoaId: r.cortadorId, valor: c.valor, data: r.data, aguardando: c.aguardando,
      desc: 'Corte de ' + fmtQ(c.kgRem == null ? r.entregue : c.kgRem, 'kg'), ref: { tipo: 'corte', id: r.id },
      provisorio: !s.config.cortadorBaseConfirmada,
      snap: { base: c.base, kgRemuneravel: c.kgRem, precoKgCentavos: c.preco ? c.preco.centavos : null, entregue: r.entregue, aprovado: r.aprovado, processado: r.processado }
    });
  }
  TIPOS.corte = {
    col: 'cortes', nome: 'Corte', permissao: 'lancar',
    validar(s, d) {
      exigirPessoa(s, d.cortadorId, 'cortador');
      const processado = num(d.processado, 'Matéria-prima processada (kg)', { min: 0.001 });
      const entregue = num(d.entregue, 'Peso da palha cortada entregue (kg)', { min: 0 });
      const aprovado = num(d.aprovado, 'Palha aprovada (kg)', { min: 0, obrigatorio: false });
      const perdas = num(d.perdas, 'Perdas e rejeitos (kg)', { min: 0, obrigatorio: false });
      if (aprovado != null && aprovado > entregue) throw new Error('A palha aprovada não pode ser maior que a entregue.');
      if (d.origemEntradaId && !s.entradas.find((e) => e.id === d.origemEntradaId && e.estado === 'ATIVO')) throw new Error('Entrada de origem não encontrada.');
      return { data: exigirData(d.data), local: d.local === 'CASA' ? 'CASA' : 'BANCA', cortadorId: d.cortadorId, processado, entregue, aprovado, perdas, origemEntradaId: d.origemEntradaId || null, obs: (d.obs || '').trim() };
    },
    gerar(s, r, user) {
      addMov(s, { mat: 'mp', qtd: r.processado, de: 'FABRICA', para: 'PROCESSO', tipo: 'CORTE', ref: { tipo: 'corte', id: r.id }, por: user.nome, data: r.data });
      if (r.entregue > 0) addMov(s, { mat: 'cortada', qtd: r.entregue, de: 'PROCESSO', para: 'FABRICA', tipo: 'CORTE', ref: { tipo: 'corte', id: r.id }, por: user.nome, data: r.data });
      lancCorte(s, r);
    }
  };
  D.calcRemuneracaoCorte = calcRemuneracaoCorte;

  /* Entrega de materiais ao prestador */
  TIPOS.entrega = {
    col: 'entregas', nome: 'Entrega ao prestador', permissao: 'lancar',
    validar(s, d) {
      exigirPessoa(s, d.prestadorId, 'prestador');
      const itens = (d.itens || []).map((i) => ({ mat: i.mat, qtd: num(i.qtd, 'Quantidade', { min: 0 }) })).filter((i) => i.qtd > 0);
      if (!itens.length) throw new Error('Informe ao menos um material enviado.');
      for (const i of itens) if (!D.mat(s, i.mat)) throw new Error('Material inválido.');
      return { data: exigirData(d.data), prestadorId: d.prestadorId, itens, obs: (d.obs || '').trim() };
    },
    gerar(s, r, user) {
      const transito = s.config.usaTransito;
      r.status = transito ? 'EM_TRANSITO' : 'ENTREGUE';
      for (const i of r.itens) {
        addMov(s, { mat: i.mat, qtd: i.qtd, de: 'FABRICA', para: transito ? D.locTransito(r.prestadorId) : D.locPrest(r.prestadorId), tipo: 'ENVIO', prestadorId: r.prestadorId, ref: { tipo: 'entrega', id: r.id }, por: user.nome, data: r.data });
      }
    }
  };
  D.confirmarChegada = function (s, user, id) {
    exigir(user, 'lancar');
    const r = s.entregas.find((e) => e.id === id);
    if (!r || r.estado !== 'ATIVO' || r.status !== 'EM_TRANSITO') throw new Error('Esta entrega não está em trânsito.');
    for (const i of r.itens) addMov(s, { mat: i.mat, qtd: i.qtd, de: D.locTransito(r.prestadorId), para: D.locPrest(r.prestadorId), tipo: 'CHEGADA', prestadorId: r.prestadorId, ref: { tipo: 'chegada', id: r.id }, por: user.nome });
    r.status = 'ENTREGUE';
    log(s, user, 'Chegada confirmada', 'Entrega para ' + D.nomePessoa(s, r.prestadorId));
  };

  /* Rasgo (produção): na banca ou em casa (rota). Aqui é feita a baixa da palha cortada. */
  function lancProducao(s, r) {
    const preco = D.precoVigente(s, 'milheiro_prestador', r.prestadorId, r.data);
    const valor = preco ? Math.round(r.qtd * preco.centavos) : null;
    return novoLanc(s, {
      tipo: 'REMUN_PRESTADOR', dir: 'PAGAR', pessoaId: r.prestadorId, valor, data: r.data,
      aguardando: preco ? null : 'falta definir o valor do milheiro',
      desc: fmtQ(r.qtd, 'milheiros') + ' rasgados', ref: { tipo: 'producao', id: r.id },
      snap: { base: 'PRODUZIDA', qtdProduzida: r.qtd, qtdRemuneravel: r.qtd, precoMilheiroCentavos: preco ? preco.centavos : null }
    });
  }
  TIPOS.producao = {
    col: 'producoes', nome: 'Rasgo', permissao: 'lancar',
    validar(s, d) {
      const local = d.local === 'BANCA' ? 'BANCA' : 'CASA';
      if (local === 'CASA') exigirPessoa(s, d.prestadorId, 'prestador');
      const qtd = num(d.qtd, 'Palhas rasgadas (milheiros)', { min: 0.001 });
      const cortadaUsada = num(d.cortadaUsada, 'Palha cortada usada (kg)', { min: 0 });
      const lixo = num(d.lixo, 'Palhas rejeitadas (milheiros)', { min: 0, obrigatorio: false });
      const placasPosse = num(d.placasPosse, 'Placas em posse', { min: 0, obrigatorio: false, inteiro: true });
      return { data: exigirData(d.data), local, prestadorId: local === 'CASA' ? d.prestadorId : null, qtd, cortadaUsada, lixo, placasPosse, obs: (d.obs || '').trim() };
    },
    gerar(s, r, user) {
      const onde = r.local === 'CASA' ? D.locPrest(r.prestadorId) : 'FABRICA';
      const ref = { tipo: 'producao', id: r.id };
      const base = { prestadorId: r.prestadorId, ref, por: user.nome, data: r.data };
      if (r.cortadaUsada > 0) addMov(s, Object.assign({ mat: 'cortada', qtd: r.cortadaUsada, de: onde, para: 'PROCESSO', tipo: 'RASGO' }, base));
      addMov(s, Object.assign({ mat: 'rasgada', qtd: r.qtd, de: 'PROCESSO', para: onde, tipo: 'PRODUCAO' }, base));
      if (r.local === 'CASA') lancProducao(s, r);
    }
  };

  /* Retorno à fábrica */
  TIPOS.retorno = {
    col: 'retornos', nome: 'Retorno à fábrica', permissao: 'lancar',
    validar(s, d) {
      exigirPessoa(s, d.prestadorId, 'prestador');
      const it = {};
      for (const k of ['rasgada', 'placa', 'cortada']) {
        const x = (d.itens && d.itens[k]) || {};
        const rec = num(x.rec, 'Quantidade recebida', { min: 0, obrigatorio: false }) || 0;
        const conf = num(x.conf, 'Quantidade conferida', { min: 0, obrigatorio: false });
        it[k] = { rec, conf };
      }
      const danificados = (d.danificados || []).map((x) => ({ mat: x.mat, qtd: num(x.qtd, 'Quantidade danificada/perdida', { min: 0 }), motivo: (x.motivo || '').trim() })).filter((x) => x.qtd > 0);
      for (const x of danificados) { if (!D.mat(s, x.mat)) throw new Error('Material inválido.'); if (!x.motivo) throw new Error('Explique o motivo do material danificado ou perdido.'); }
      if (!it.rasgada.rec && !it.placa.rec && !it.cortada.rec && !danificados.length) throw new Error('Informe ao menos um item que voltou.');
      return { data: exigirData(d.data), prestadorId: d.prestadorId, itens: it, danificados, obs: (d.obs || '').trim() };
    },
    gerar(s, r, user) {
      const de = D.locPrest(r.prestadorId);
      const ref = { tipo: 'retorno', id: r.id };
      for (const k of ['rasgada', 'placa', 'cortada']) {
        if (r.itens[k].rec > 0) addMov(s, { mat: k, qtd: r.itens[k].rec, de, para: 'FABRICA', tipo: 'RETORNO', prestadorId: r.prestadorId, ref, por: user.nome, data: r.data });
      }
      for (const x of r.danificados) addMov(s, { mat: x.mat, qtd: x.qtd, de, para: 'DANIFICADO', tipo: 'DANIFICADO', prestadorId: r.prestadorId, ref, por: user.nome, data: r.data, just: x.motivo });
    }
  };

  /* operações genéricas */
  D.criar = function (s, user, tipo, dados) {
    const T = TIPOS[tipo];
    exigir(user, T.permissao);
    const campos = T.validar(s, dados, user, null);
    const r = Object.assign({ id: uid(tipo.slice(0, 3)), estado: 'ATIVO', criadoEm: agora(), criadoPor: user.nome, historico: [] }, campos);
    T.gerar(s, r, user);
    s[T.col].push(r);
    log(s, user, T.nome + ' registrado', resumo(s, tipo, r));
    return r;
  };
  D.corrigir = function (s, user, tipo, id, dados, just) {
    const T = TIPOS[tipo];
    exigir(user, 'corrigir');
    if (!just || !just.trim()) throw new Error('Explique o motivo da correção.');
    const r = s[T.col].find((x) => x.id === id);
    if (!r || r.estado !== 'ATIVO') throw new Error('Registro não encontrado.');
    const campos = T.validar(s, dados, user, r);
    const ref = { tipo, id };
    cancelarLancs(s, ref, user, just);
    estornarMovs(s, ref, user, just);
    const antes = JSON.parse(JSON.stringify(r));
    delete antes.historico;
    r.historico.push({ em: agora(), por: user.nome, motivo: just, antes });
    Object.assign(r, campos);
    T.gerar(s, r, user);
    log(s, user, T.nome + ' corrigido', just + ' | ' + resumo(s, tipo, r));
    return r;
  };
  D.estornar = function (s, user, tipo, id, just) {
    const T = TIPOS[tipo];
    exigir(user, 'estornar');
    if (!just || !just.trim()) throw new Error('Explique o motivo do estorno.');
    const r = s[T.col].find((x) => x.id === id);
    if (!r || r.estado !== 'ATIVO') throw new Error('Registro não encontrado.');
    const ref = { tipo, id };
    cancelarLancs(s, ref, user, just);
    estornarMovs(s, ref, user, just);
    if (tipo === 'entrega' && r.status === 'ENTREGUE' && s.movs.some((m) => m.ref && m.ref.tipo === 'chegada' && m.ref.id === id)) {
      estornarMovs(s, { tipo: 'chegada', id }, user, just);
    }
    r.estado = 'ESTORNADO'; r.estornoPor = user.nome; r.estornoJust = just; r.estornoEm = agora();
    log(s, user, T.nome + ' estornado', just);
  };
  function resumo(s, tipo, r) {
    switch (tipo) {
      case 'entrada': return fmtQ(r.pesoTotal, 'kg') + ' em ' + r.sacos + ' sacos';
      case 'corte': return D.nomePessoa(s, r.cortadorId) + ': processou ' + fmtQ(r.processado, 'kg') + ', entregou ' + fmtQ(r.entregue, 'kg');
      case 'entrega': return D.nomePessoa(s, r.prestadorId) + ': ' + r.itens.map((i) => fmtQ(i.qtd, D.unMat(s, i.mat)) + ' de ' + D.nomeMat(s, i.mat).toLowerCase()).join(', ');
      case 'producao': return (r.local === 'CASA' ? D.nomePessoa(s, r.prestadorId) + ' (em casa)' : 'Na banca') + ': ' + r.qtd + ' milheiros rasgados, ' + r.cortadaUsada + ' kg de palha cortada usada';
      case 'retorno': return D.nomePessoa(s, r.prestadorId) + ': ' + ['rasgada', 'placa', 'cortada'].filter((k) => r.itens[k].rec > 0).map((k) => r.itens[k].rec + ' ' + D.nomeMat(s, k).toLowerCase()).join(', ');
      default: return '';
    }
  }
  D.resumo = resumo;

  D.conferirRetorno = function (s, user, id, valores) {
    exigir(user, 'conferir');
    const r = s.retornos.find((x) => x.id === id && x.estado === 'ATIVO');
    if (!r) throw new Error('Retorno não encontrado.');
    const antes = JSON.parse(JSON.stringify(r.itens));
    for (const k of ['rasgada', 'placa', 'cortada']) {
      if (r.itens[k].rec > 0 || (valores[k] != null && valores[k] !== '')) {
        r.itens[k].conf = num(valores[k], 'Quantidade conferida', { min: 0, obrigatorio: false });
      }
    }
    r.historico.push({ em: agora(), por: user.nome, motivo: 'Conferência', antes: { itens: antes } });
    log(s, user, 'Retorno conferido', resumo(s, 'retorno', r));
  };

  /* ---------- operações de estoque avulsas ---------- */
  D.consumo = function (s, user, { mat, qtd, data, obs }) {
    exigir(user, 'lancar');
    addMov(s, { mat, qtd: num(qtd, 'Quantidade', { min: 0.001 }), de: 'FABRICA', para: 'PROCESSO', tipo: 'CONSUMO', por: user.nome, data: exigirData(data), obs });
    log(s, user, 'Consumo de material', D.nomeMat(s, mat) + ': ' + qtd);
  };
  D.entradaProduto = function (s, user, { mat, qtd, data, obs }) {
    exigir(user, 'lancar');
    const m = D.mat(s, mat);
    if (!m || m.cat !== 'produto') throw new Error('Escolha um produto acabado.');
    addMov(s, { mat, qtd: num(qtd, 'Quantidade', { min: 0.001 }), de: 'PROCESSO', para: 'FABRICA', tipo: 'PRODUTO_PRONTO', por: user.nome, data: exigirData(data), obs });
    log(s, user, 'Produto acabado em estoque', m.nome + ': ' + qtd);
  };
  D.entradaMaterial = function (s, user, { mat, qtd, data, obs }) {
    exigir(user, 'lancar');
    addMov(s, { mat, qtd: num(qtd, 'Quantidade', { min: 0.001 }), de: 'EXTERNO', para: 'FABRICA', tipo: 'ENTRADA', por: user.nome, data: exigirData(data), obs });
    log(s, user, 'Entrada de material', D.nomeMat(s, mat) + ': ' + qtd);
  };
  D.baixaDanificado = function (s, user, { mat, loc, qtd, just, data }) {
    exigir(user, 'corrigir');
    if (!just || !just.trim()) throw new Error('Explique o motivo (obrigatório).');
    addMov(s, { mat, qtd: num(qtd, 'Quantidade', { min: 0.001 }), de: loc, para: 'DANIFICADO', tipo: 'DANIFICADO', por: user.nome, just, data: data || hoje(), prestadorId: loc.startsWith('P:') ? loc.slice(2) : null });
    log(s, user, 'Material baixado como danificado/perdido', D.nomeMat(s, mat) + ' ' + qtd + ' | ' + just);
  };
  D.ajuste = function (s, user, { mat, loc, delta, just }) {
    exigir(user, 'corrigir');
    if (!just || !just.trim()) throw new Error('Explique o motivo do ajuste (obrigatório).');
    const d = r3(delta);
    if (!d) throw new Error('Não há diferença para ajustar.');
    const prest = loc.startsWith('P:') ? loc.slice(2) : null;
    if (d < 0) addMov(s, { mat, qtd: -d, de: loc, para: 'DANIFICADO', tipo: 'AJUSTE', por: user.nome, just, prestadorId: prest });
    else addMov(s, { mat, qtd: d, de: 'EXTERNO', para: loc, tipo: 'AJUSTE', por: user.nome, just, prestadorId: prest });
    log(s, user, 'Ajuste de estoque', D.nomeMat(s, mat) + ' em ' + D.nomeLoc(s, loc) + ': ' + (d > 0 ? '+' : '') + d + ' | ' + just);
  };

  /* ---------- conferência de estoque ---------- */
  D.conferir = function (s, user, { mat, loc, contado, obs }) {
    exigir(user, 'conferir');
    const c = num(contado, 'Quantidade contada', { min: 0 });
    const sistema = D.saldo(s, mat, loc);
    const x = { id: uid('cf'), data: hoje(), em: agora(), mat, loc, sistema, contado: c, dif: r3(c - sistema), estado: Math.abs(c - sistema) < 1e-9 ? 'OK' : 'ABERTA', por: user.nome, obs: obs || '' };
    s.conferencias.push(x);
    log(s, user, 'Conferência de estoque', D.nomeMat(s, mat) + ' em ' + D.nomeLoc(s, loc) + ': sistema ' + sistema + ', contado ' + c);
    return x;
  };
  D.resolverConferencia = function (s, user, id, modo, just) {
    exigir(user, 'corrigir');
    const x = s.conferencias.find((c) => c.id === id && c.estado === 'ABERTA');
    if (!x) throw new Error('Conferência não encontrada.');
    if (!just || !just.trim()) throw new Error('Explique o motivo (obrigatório).');
    if (modo === 'ajustar') {
      const atual = D.saldo(s, x.mat, x.loc);
      D.ajuste(s, user, { mat: x.mat, loc: x.loc, delta: r3(x.contado - atual), just });
      x.estado = 'AJUSTADA';
    } else x.estado = 'ENCERRADA';
    x.resolucao = just; x.resolvidaPor = user.nome; x.resolvidaEm = agora();
  };

  /* ---------- vendas, despesas, produtos ---------- */
  D.novoMaterial = function (s, user, { nome, un, cat }) {
    exigir(user, 'cadastros');
    nome = (nome || '').trim();
    if (!nome) throw new Error('Informe o nome.');
    if (s.materiais.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) throw new Error('Já existe um item com esse nome.');
    const m = { id: uid('mat'), nome, un: un || 'un', cat: cat || 'outro', fixo: false };
    s.materiais.push(m);
    log(s, user, 'Cadastro de ' + (cat === 'produto' ? 'produto acabado' : 'material'), nome);
    return m;
  };
  D.registrarVenda = function (s, user, { data, clienteId, produtoId, qtd, valor, obs }) {
    exigir(user, 'lancar');
    const m = D.mat(s, produtoId);
    if (!m || m.cat !== 'produto') throw new Error('Escolha o produto vendido.');
    const q = num(qtd, 'Quantidade vendida', { min: 0.001 });
    const v = Math.round(num(valor, 'Valor da venda', { min: 0.01 }));
    addMov(s, { mat: produtoId, qtd: q, de: 'FABRICA', para: 'EXTERNO', tipo: 'VENDA', por: user.nome, data: exigirData(data), obs });
    const l = novoLanc(s, { tipo: 'VENDA', dir: 'RECEBER', pessoaId: clienteId || null, valor: v, data, desc: fmtQ(q, m.un) + ' de ' + m.nome, snap: { produtoId, qtd: q } });
    log(s, user, 'Venda registrada', m.nome + ' ' + q + ' por ' + v + ' centavos');
    return l;
  };
  D.registrarDespesa = function (s, user, { data, descricao, valor, pessoaId }) {
    exigir(user, 'lancar');
    if (!(descricao || '').trim()) throw new Error('Descreva a despesa.');
    const v = Math.round(num(valor, 'Valor', { min: 0.01 }));
    const l = novoLanc(s, { tipo: 'DESPESA', dir: 'PAGAR', pessoaId: pessoaId || null, valor: v, data: exigirData(data), desc: descricao.trim() });
    log(s, user, 'Despesa registrada', descricao + ' ' + v + ' centavos');
    return l;
  };

  /* ---------- pessoas e usuários ---------- */
  D.novaPessoa = function (s, user, { nome, papeis, telefone }) {
    exigir(user, 'cadastros');
    nome = (nome || '').trim();
    if (!nome) throw new Error('Informe o nome.');
    if (!papeis || !papeis.length) throw new Error('Marque ao menos uma função.');
    const p = { id: uid('pe'), nome, papeis, telefone: (telefone || '').trim(), ativo: true };
    s.pessoas.push(p);
    log(s, user, 'Pessoa cadastrada', nome + ' (' + papeis.join(', ') + ')');
    return p;
  };
  D.novoUsuario = function (s, user, { nome, perfil, podeEstimar }) {
    exigir(user, 'cadastros');
    nome = (nome || '').trim();
    if (!nome) throw new Error('Informe o nome.');
    if (!['admin', 'operador', 'consulta'].includes(perfil)) throw new Error('Perfil inválido.');
    s.usuarios.push({ id: uid('u'), nome, perfil, podeEstimar: !!podeEstimar, ativo: true });
    log(s, user, 'Usuário cadastrado', nome + ' (' + perfil + ')');
  };

  /* ---------- decisões pendentes ---------- */
  D.definirConfig = function (s, user, chave, valor, confirmado) {
    exigir(user, 'config');
    const antes = s.config[chave];
    s.config[chave] = valor;
    if (chave === 'cortadorBase') s.config.cortadorBaseConfirmada = !!confirmado;
    if (chave === 'pesoAproveitavel') s.config.pesoAproveitavelConfirmado = !!confirmado;
    log(s, user, 'Decisão alterada', chave + ': ' + antes + ' -> ' + valor + (confirmado ? ' (confirmada)' : ''));
  };
  /* Recalcula remunerações de corte ainda sem pagamento, usando a base atual. Ação explícita. */
  D.recalcularCortes = function (s, user) {
    exigir(user, 'config');
    let n = 0;
    for (const c of s.cortes.filter((x) => x.estado === 'ATIVO')) {
      const l = s.lanc.find((x) => x.estado === 'ATIVO' && x.ref && x.ref.tipo === 'corte' && x.ref.id === c.id);
      if (!l || D.lancPago(s, l) > 0) continue;
      const novo = calcRemuneracaoCorte(s, c);
      const mudou = l.valor !== novo.valor || l.snap.base !== novo.base;
      if (!mudou && l.provisorio === !s.config.cortadorBaseConfirmada) continue;
      l.estado = 'ESTORNADO'; l.estornoPor = user.nome; l.estornoJust = 'Recalculado após decisão';
      lancCorte(s, c);
      n++;
    }
    log(s, user, 'Remunerações de corte recalculadas', n + ' lançamento(s)');
    return n;
  };

  /* Recalcula um lançamento que ficou sem valor (ex.: faltava definir preço). Só se ainda não tem pagamento. */
  D.recalcularLanc = function (s, user, lancId) {
    exigir(user, 'corrigir');
    const l = s.lanc.find((x) => x.id === lancId && x.estado === 'ATIVO');
    if (!l || !l.ref) throw new Error('Lançamento não encontrado.');
    if (D.lancPago(s, l) > 0) throw new Error('Este lançamento já tem pagamento registrado.');
    const rec = l.ref.tipo === 'corte' ? s.cortes.find((x) => x.id === l.ref.id) : l.ref.tipo === 'producao' ? s.producoes.find((x) => x.id === l.ref.id) : null;
    if (!rec || rec.estado !== 'ATIVO') throw new Error('Não é possível recalcular este lançamento.');
    l.estado = 'ESTORNADO'; l.estornoPor = user.nome; l.estornoJust = 'Recalculado';
    const novo = l.ref.tipo === 'corte' ? lancCorte(s, rec) : lancProducao(s, rec);
    log(s, user, 'Lançamento recalculado', D.descLanc(s, novo));
    return novo;
  };

  /* ---------- prestador: situação e períodos ---------- */
  D.situacaoPrestador = function (s, prestadorId) {
    const prod = s.producoes.filter((p) => p.estado === 'ATIVO' && p.local === 'CASA' && p.prestadorId === prestadorId);
    const ret = s.retornos.filter((r) => r.estado === 'ATIVO' && r.prestadorId === prestadorId);
    const produzida = r3(soma(prod, (p) => p.qtd));
    const devolvida = r3(soma(ret, (r) => r.itens.rasgada.rec));
    const conferida = r3(soma(ret, (r) => r.itens.rasgada.conf));
    const semConferencia = r3(soma(ret, (r) => (r.itens.rasgada.conf == null ? r.itens.rasgada.rec : 0)));
    const foraDaFabrica = D.saldo(s, 'rasgada', D.locPrest(prestadorId)) + D.saldo(s, 'rasgada', D.locTransito(prestadorId));
    return { produzida, devolvida, conferida, semConferencia, foraDaFabrica: r3(foraDaFabrica), base: s.config.prestadorBase };
  };

  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseD = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const br = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  /* tipo: dia | semana (segunda a domingo) | mes | tudo */
  D.periodo = function (tipo, ref) {
    ref = ref || hoje();
    if (tipo === 'tudo') return { tipo, ref, de: '', ate: '', rotulo: 'Todo o período' };
    const d = parseD(ref);
    if (tipo === 'dia') return { tipo, ref, de: ref, ate: ref, rotulo: ref === hoje() ? 'Hoje, ' + br(ref) : 'Dia ' + br(ref) + '/' + ref.slice(0, 4) };
    if (tipo === 'semana') {
      const ini = new Date(d); ini.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
      return { tipo, ref, de: ymd(ini), ate: ymd(fim), rotulo: 'Semana de ' + br(ymd(ini)) + ' a ' + br(ymd(fim)) };
    }
    const ini = new Date(d.getFullYear(), d.getMonth(), 1, 12), fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
    return { tipo: 'mes', ref, de: ymd(ini), ate: ymd(fim), rotulo: MESES[d.getMonth()][0].toUpperCase() + MESES[d.getMonth()].slice(1) + ' de ' + d.getFullYear() };
  };
  D.deslocarPeriodo = function (tipo, ref, delta) {
    const d = parseD(ref || hoje());
    if (tipo === 'dia') d.setDate(d.getDate() + delta);
    else if (tipo === 'semana') d.setDate(d.getDate() + 7 * delta);
    else if (tipo === 'mes') { d.setDate(1); d.setMonth(d.getMonth() + delta); }
    return ymd(d);
  };
  const noPer = (d, p) => (!p.de || d >= p.de) && (!p.ate || d <= p.ate);

  /* Valores de um prestador num período. Calculado ≠ pago. */
  D.resumoPrestador = function (s, id, per) {
    const prod = s.producoes.filter((p) => p.estado === 'ATIVO' && p.local === 'CASA' && p.prestadorId === id && noPer(p.data, per));
    const ret = s.retornos.filter((r) => r.estado === 'ATIVO' && r.prestadorId === id && noPer(r.data, per));
    const lancs = s.lanc.filter((l) => l.estado === 'ATIVO' && l.tipo === 'REMUN_PRESTADOR' && l.pessoaId === id);
    const doPer = lancs.filter((l) => noPer(l.data, per));
    const pagoPer = soma(s.baixas.filter((b) => !b.estornada && noPer(b.data, per) && lancs.some((l) => l.id === b.lancId)), (b) => b.valor);
    return {
      produzida: r3(soma(prod, (p) => p.qtd)), lixo: r3(soma(prod, (p) => p.lixo)), registros: prod.length,
      devolvida: r3(soma(ret, (r) => r.itens.rasgada.rec)), conferida: r3(soma(ret, (r) => r.itens.rasgada.conf)),
      devido: soma(doPer.filter((l) => l.valor != null), (l) => l.valor), pago: pagoPer,
      aguardando: doPer.filter((l) => l.valor == null).length,
      pendenteTotal: soma(lancs.filter((l) => l.valor != null), (l) => D.lancPendente(s, l))
    };
  };

  /* Números de produção do período para o painel inicial. */
  D.resumoProducao = function (s, per) {
    const ent = s.entradas.filter((e) => e.estado === 'ATIVO' && noPer(e.data, per));
    const cor = s.cortes.filter((c) => c.estado === 'ATIVO' && noPer(c.data, per));
    const pro = s.producoes.filter((p) => p.estado === 'ATIVO' && noPer(p.data, per));
    const ret = s.retornos.filter((r) => r.estado === 'ATIVO' && noPer(r.data, per));
    const rel = D.relatorioRendimento(s, per);
    return {
      mpRecebida: r3(soma(ent, (e) => e.pesoTotal)), mpCusto: soma(ent, (e) => e.custo), entradas: ent.length,
      mpProcessada: r3(soma(cor, (c) => c.processado)), cortadaKg: r3(soma(cor, (c) => c.entregue)), cortes: cor.length,
      rendimentoReal: rel.real.valor, rendimentoEstimado: rel.estimado.valor,
      rasgadaCasa: r3(soma(pro.filter((p) => p.local === 'CASA'), (p) => p.qtd)), rasgadaBanca: r3(soma(pro.filter((p) => p.local === 'BANCA'), (p) => p.qtd)),
      cortadaUsada: r3(soma(pro, (p) => p.cortadaUsada)), devolvida: r3(soma(ret, (r) => r.itens.rasgada.rec)),
      devidoPrestadores: soma(s.lanc.filter((l) => l.estado === 'ATIVO' && l.tipo === 'REMUN_PRESTADOR' && l.valor != null && noPer(l.data, per)), (l) => l.valor)
    };
  };

  /* ---------- lucro estimado (método: média de aproveitamento esperada) ----------
     Estimativa. Premissas explícitas, todas mostradas na tela:
     - produto vendido em milheiros; 1 milheiro vendido = 1 milheiro de palha rasgada;
     - fatores (milheiros rasgados por kg de palha cortada, custos por kg e por milheiro) vêm da média de todos os registros;
     - matéria-prima custa: custo médio de compra ÷ rendimento estimado médio. */
  D.lucroEstimado = function (s, per) {
    const rel = D.relatorioRendimento(s, {});
    const custoKg = rel.custo.centavosPorKg;
    const rend = rel.estimado.valor;
    const lcCorte = s.lanc.filter((l) => l.estado === 'ATIVO' && l.tipo === 'REMUN_CORTADOR' && l.valor != null && l.ref);
    const kgCortesPagos = soma(lcCorte, (l) => (s.cortes.find((c) => c.id === l.ref.id) || {}).entregue);
    const custoCortePorKg = kgCortesPagos > 0 ? soma(lcCorte, (l) => l.valor) / kgCortesPagos : null;
    const prods = s.producoes.filter((p) => p.estado === 'ATIVO' && p.cortadaUsada > 0);
    const milPorKgCortado = prods.length ? soma(prods, (p) => p.qtd) / soma(prods, (p) => p.cortadaUsada) : null;
    const lcPrest = s.lanc.filter((l) => l.estado === 'ATIVO' && l.tipo === 'REMUN_PRESTADOR' && l.valor != null && l.ref);
    const milRasgoPagos = soma(lcPrest, (l) => l.snap.qtdRemuneravel);
    const custoRasgoPorMil = milRasgoPagos > 0 ? soma(lcPrest, (l) => l.valor) / milRasgoPagos : null;

    const faltando = [];
    if (custoKg == null) faltando.push('registrar compras de matéria-prima');
    if (rend == null) faltando.push('informar o rendimento estimado nas entradas');
    if (custoCortePorKg == null) faltando.push('definir o valor por kg do corte');
    if (milPorKgCortado == null) faltando.push('registrar rasgos com os kg de palha cortada usada');
    if (custoRasgoPorMil == null) faltando.push('registrar produção em casa com valor do milheiro definido');

    const vendas = s.lanc.filter((l) => l.estado === 'ATIVO' && l.tipo === 'VENDA' && noPer(l.data, per));
    const emMilheiro = vendas.filter((l) => l.snap && l.snap.produtoId && D.unMat(s, l.snap.produtoId) === 'milheiro');
    const foraMilheiro = vendas.length - emMilheiro.length;
    const receita = soma(vendas, (l) => l.valor);
    const receitaMil = soma(emMilheiro, (l) => l.valor);
    const milVendidos = r3(soma(emMilheiro, (l) => l.snap.qtd));
    const despesas = soma(s.lanc.filter((l) => l.estado === 'ATIVO' && l.tipo === 'DESPESA' && noPer(l.data, per)), (l) => l.valor);

    const completo = faltando.length === 0;
    let unit = null, parcelas = null;
    if (completo) {
      const mp = custoKg / (rend / 100) / milPorKgCortado;
      const cor = custoCortePorKg / milPorKgCortado;
      parcelas = { mp, corte: cor, rasgo: custoRasgoPorMil };
      unit = mp + cor + custoRasgoPorMil;
    }
    const custoVendido = unit == null ? null : Math.round(unit * milVendidos);
    const bruto = custoVendido == null ? null : receitaMil - custoVendido;
    return {
      completo, faltando, foraMilheiro, receita, receitaMil, milVendidos, despesas, custoVendido, lucroBruto: bruto, lucroLiquido: bruto == null ? null : bruto - despesas,
      custoUnitario: unit, parcelas, fatores: { custoKg, rend, custoCortePorKg, milPorKgCortado, custoRasgoPorMil }
    };
  };

  /* ---------- placas ---------- */
  D.resumoPlacas = function (s) {
    const m = 'placa';
    const entradas = soma(s.movs.filter((x) => x.mat === m && x.tipo === 'ENTRADA'), (x) => x.qtd) +
      soma(s.movs.filter((x) => x.mat === m && x.tipo === 'AJUSTE' && x.de === 'EXTERNO'), (x) => x.qtd);
    const fabrica = D.saldo(s, m, 'FABRICA');
    const danificadas = D.saldo(s, m, 'DANIFICADO');
    let comPrest = 0, transito = 0;
    const porPrestador = [];
    for (const p of s.pessoas.filter((p) => p.papeis.includes('prestador'))) {
      const q = D.saldo(s, m, D.locPrest(p.id)); const t = D.saldo(s, m, D.locTransito(p.id));
      comPrest += q; transito += t;
      if (q || t) porPrestador.push({ pessoaId: p.id, qtd: q, transito: t });
    }
    const devolvidas = soma(s.movs.filter((x) => x.mat === m && x.tipo === 'RETORNO'), (x) => x.qtd);
    const total = r3(fabrica + comPrest + transito + danificadas);
    return { total, entradas: r3(entradas), fabrica, comPrest: r3(comPrest), transito: r3(transito), danificadas, devolvidas: r3(devolvidas), porPrestador };
  };

  /* ---------- rendimento ---------- */
  D.aproveitavel = (s, c) => (s.config.pesoAproveitavel === 'APROVADO' ? c.aprovado : c.entregue);
  const noPeriodo = (d, p) => (!p.de || d >= p.de) && (!p.ate || d <= p.ate);
  const mesDe = (d) => d.slice(0, 7);

  function mediaPonderada(itens, valor, peso) {
    const ok = itens.filter((i) => valor(i) != null && peso(i) > 0);
    const kg = soma(ok, peso);
    if (!ok.length || kg <= 0) return { valor: null, kg: 0, n: 0 };
    return { valor: soma(ok, (i) => valor(i) * peso(i)) / kg, kg: r3(kg), n: ok.length };
  }

  D.relatorioRendimento = function (s, periodo) {
    const p = periodo || {};
    const entradas = s.entradas.filter((e) => e.estado === 'ATIVO' && noPeriodo(e.data, p));
    const cortes = s.cortes.filter((c) => c.estado === 'ATIVO' && noPeriodo(c.data, p));

    const est = mediaPonderada(entradas, (e) => e.rendEst, (e) => e.pesoTotal);
    est.nSem = entradas.filter((e) => e.rendEst == null).length;
    est.nEntradas = entradas.length;
    est.kgTotal = r3(soma(entradas, (e) => e.pesoTotal));

    const custoKg = soma(entradas, (e) => e.pesoTotal) > 0 ? soma(entradas, (e) => e.custo) / soma(entradas, (e) => e.pesoTotal) : null;
    const custo = { centavosPorKg: custoKg, kg: est.kgTotal, total: soma(entradas, (e) => e.custo), n: entradas.length };

    const grupos = {};
    for (const e of entradas) { const k = e.epoca || ''; (grupos[k] = grupos[k] || []).push(e); }
    const porEpoca = Object.keys(grupos).sort().map((k) => {
      const g = grupos[k]; const m = mediaPonderada(g, (e) => e.rendEst, (e) => e.pesoTotal);
      const kg = soma(g, (e) => e.pesoTotal);
      return { epoca: k, n: g.length, kg: r3(kg), estimado: m.valor, nSem: g.filter((e) => e.rendEst == null).length, centavosPorKg: kg > 0 ? soma(g, (e) => e.custo) / kg : null };
    });

    const validos = cortes.filter((c) => c.processado > 0 && D.aproveitavel(s, c) != null);
    const aprov = soma(validos, (c) => D.aproveitavel(s, c));
    const proc = soma(validos, (c) => c.processado);
    const real = { valor: proc > 0 ? aprov / proc * 100 : null, aprov: r3(aprov), proc: r3(proc), n: validos.length, nExcl: cortes.length - validos.length, nCortes: cortes.length };

    const porLocal = ['BANCA', 'CASA'].map((loc) => {
      const v = validos.filter((c) => (c.local || 'BANCA') === loc);
      const pr = soma(v, (c) => c.processado);
      return { local: loc, n: v.length, proc: r3(pr), aprov: r3(soma(v, (c) => D.aproveitavel(s, c))), valor: pr > 0 ? soma(v, (c) => D.aproveitavel(s, c)) / pr * 100 : null };
    });

    const detalheCortes = cortes.map((c) => {
      const a = D.aproveitavel(s, c);
      const rr = a != null && c.processado > 0 ? a / c.processado * 100 : null;
      const ent = c.origemEntradaId ? s.entradas.find((e) => e.id === c.origemEntradaId) : null;
      const estE = ent && ent.rendEst != null ? ent.rendEst : null;
      return { corte: c, aproveitavel: a, real: rr, entrada: ent || null, estimado: estE, difPP: rr != null && estE != null ? rr - estE : null };
    }).sort((x, y) => y.corte.data.localeCompare(x.corte.data));

    const comparacao = { estimado: est.valor, real: real.valor, difPP: est.valor != null && real.valor != null ? real.valor - est.valor : null };

    const meses = [...new Set([...entradas.map((e) => mesDe(e.data)), ...cortes.map((c) => mesDe(c.data))])].sort();
    const evolucao = meses.map((mes) => {
      const es = entradas.filter((e) => mesDe(e.data) === mes);
      const cs = cortes.filter((c) => mesDe(c.data) === mes && c.processado > 0 && D.aproveitavel(s, c) != null);
      const m = mediaPonderada(es, (e) => e.rendEst, (e) => e.pesoTotal);
      const pr = soma(cs, (c) => c.processado);
      return { mes, estimado: m.valor, real: pr > 0 ? soma(cs, (c) => D.aproveitavel(s, c)) / pr * 100 : null, kgRecebido: r3(soma(es, (e) => e.pesoTotal)), kgProcessado: r3(pr) };
    });

    const listaEntradas = entradas.map((e) => ({ entrada: e, centavosPorKg: e.pesoTotal > 0 ? e.custo / e.pesoTotal : null }))
      .sort((a, b) => b.entrada.data.localeCompare(a.entrada.data));

    const pagCorte = soma(s.lanc.filter((l) => l.estado === 'ATIVO' && l.tipo === 'REMUN_CORTADOR' && l.valor != null && l.ref && cortes.some((c) => c.id === l.ref.id)), (l) => l.valor);

    return { periodo: p, estimado: est, custo, porEpoca, real, porLocal, detalheCortes, comparacao, evolucao, listaEntradas, pagamentoCortes: pagCorte, kgProcessadoCortes: r3(soma(cortes, (c) => c.processado)) };
  };

  /* ---------- painel financeiro ---------- */
  D.resumoFinanceiro = function (s, periodo) {
    const p = periodo || {};
    const ls = s.lanc.filter((l) => l.estado === 'ATIVO' && noPeriodo(l.data, p));
    const por = (tipo) => ls.filter((l) => l.tipo === tipo);
    const dev = (arr) => soma(arr.filter((l) => l.valor != null), (l) => l.valor);
    const pend = (arr) => soma(arr.filter((l) => l.valor != null), (l) => D.lancPendente(s, l));
    const baixas = s.baixas.filter((b) => !b.estornada && noPeriodo(b.data, p));
    const dirDe = (b) => (s.lanc.find((l) => l.id === b.lancId) || {}).dir;
    const pago = soma(baixas.filter((b) => dirDe(b) === 'PAGAR'), (b) => b.valor);
    const recebido = soma(baixas.filter((b) => dirDe(b) === 'RECEBER'), (b) => b.valor);
    return {
      compras: dev(por('COMPRA_MP')), comprasPend: pend(por('COMPRA_MP')),
      cortadores: dev(por('REMUN_CORTADOR')), cortadoresPend: pend(por('REMUN_CORTADOR')),
      cortadoresProvisorio: por('REMUN_CORTADOR').some((l) => l.provisorio),
      prestadores: dev(por('REMUN_PRESTADOR')), prestadoresPend: pend(por('REMUN_PRESTADOR')),
      despesas: dev(por('DESPESA')), despesasPend: pend(por('DESPESA')),
      vendas: dev(por('VENDA')), vendasPend: pend(por('VENDA')),
      pago, recebido, caixa: recebido - pago,
      aguardando: ls.filter((l) => l.valor == null).length
    };
  };

  D.diferencasAbertas = function (s) {
    const ret = s.retornos.filter((r) => r.estado === 'ATIVO' && ['rasgada', 'placa', 'cortada'].some((k) => r.itens[k].conf != null && r.itens[k].conf !== r.itens[k].rec));
    const naoConf = s.retornos.filter((r) => r.estado === 'ATIVO' && ['rasgada', 'placa', 'cortada'].some((k) => r.itens[k].rec > 0 && r.itens[k].conf == null));
    const conf = s.conferencias.filter((c) => c.estado === 'ABERTA');
    return { ret, naoConf, conf }; // rejeitos da produção externa são lixo: não geram pendência
  };

  /* ---------- transação: aplica no rascunho, só confirma se tudo deu certo ---------- */
  D.transacao = function (s, fn) {
    const rascunho = JSON.parse(JSON.stringify(s));
    const res = fn(rascunho);
    return { estado: rascunho, resultado: res };
  };

  root.Domain = D;
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
