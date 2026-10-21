// Testes das regras de negócio. Rodar: node testes.js
const D = require('./public/js/domain.js');
const assert = require('assert');
let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('ok   ' + nome); } catch (e) { console.log('FALHA ' + nome + '\n     ' + e.message); process.exitCode = 1; } };
const falha = (fn, trecho) => { try { fn(); } catch (e) { if (trecho && !e.message.includes(trecho)) throw new Error('Mensagem inesperada: ' + e.message); return; } throw new Error('Deveria ter falhado'); };

function cenario() {
  const s = D.novoBanco();
  const adm = s.usuarios[0];
  const cortador = D.novaPessoa(s, adm, { nome: 'Dona Maria', papeis: ['cortador'] });
  const prest = D.novaPessoa(s, adm, { nome: 'Seu José', papeis: ['prestador'] });
  const forn = D.novaPessoa(s, adm, { nome: 'Sítio Boa Vista', papeis: ['fornecedor'] });
  return { s, adm, cortador, prest, forn };
}
const entrada = (c, extra) => D.criar(c.s, c.adm, 'entrada', Object.assign({ data: '2026-03-01', fornecedorId: c.forn.id, pesos: [40, 40, 40], custo: 120000, epoca: 'Safra 2026', rendEst: 75 }, extra));
const corte = (c, extra) => D.criar(c.s, c.adm, 'corte', Object.assign({ data: '2026-03-05', cortadorId: c.cortador.id, processado: 50, entregue: 36, aprovado: null, perdas: 14 }, extra));

t('decisões da banca já vêm aplicadas', () => {
  const s = D.novoBanco();
  assert.strictEqual(s.config.cortadorBase, 'ENTREGUE'); assert.strictEqual(s.config.cortadorBaseConfirmada, true);
  assert.strictEqual(s.config.prestadorBase, 'PRODUZIDA');
  assert.strictEqual(s.config.tratamentoPerdas, 'DESCONSIDERAR');
  assert.strictEqual(D.unMat(s, 'mp'), 'kg'); assert.strictEqual(D.unMat(s, 'cortada'), 'kg'); assert.strictEqual(D.unMat(s, 'rasgada'), 'milheiro');
});

t('banco antigo (v1) migra para as decisões, palha cortada em kg e rasgada em milheiros', () => {
  const s = D.novoBanco(); s.versao = 1; s.config.prestadorBase = null; s.materiais[1].un = 'milheiro'; s.materiais[2].un = 'un';
  D.migrar(s);
  assert.strictEqual(s.config.prestadorBase, 'PRODUZIDA'); assert.strictEqual(D.unMat(s, 'cortada'), 'kg'); assert.strictEqual(D.unMat(s, 'rasgada'), 'milheiro'); assert.strictEqual(s.versao, 3);
});

t('banco v2 migra: palha cortada passa de milheiros para kg, com o estoque do corte valendo o peso entregue', () => {
  const c = cenario(); entrada(c); const r = corte(c, { entregue: 36 });
  const s = JSON.parse(JSON.stringify(c.s)); s.versao = 2; s.materiais.find((m) => m.id === 'cortada').un = 'milheiro';
  s.movs.find((m) => m.mat === 'cortada' && m.tipo === 'CORTE').qtd = 12; // antes: 12 milheiros
  D.migrar(s);
  assert.strictEqual(D.unMat(s, 'cortada'), 'kg'); assert.strictEqual(D.saldo(s, 'cortada', 'FABRICA'), 36); assert.strictEqual(s.versao, 3);
});

t('entrada soma pesos e entra no estoque compartilhado', () => {
  const c = cenario(); const e = entrada(c);
  assert.strictEqual(e.pesoTotal, 120);
  assert.strictEqual(D.saldo(c.s, 'mp', 'FABRICA'), 120);
  assert.strictEqual(c.s.lanc[0].valor, 120000);
});

t('rendimento estimado exige permissão', () => {
  const c = cenario();
  const op = { id: 'u2', nome: 'Ana', perfil: 'operador', podeEstimar: false };
  falha(() => D.criar(c.s, op, 'entrada', { data: '2026-03-01', pesos: [10], custo: 0, rendEst: 70 }), 'rendimento estimado');
  D.criar(c.s, op, 'entrada', { data: '2026-03-01', pesos: [10], custo: 0, rendEst: null });
});

t('corte: rendimento real = aproveitável / processado; estoque de palha cortada em kg', () => {
  const c = cenario(); entrada(c); corte(c);
  const r = D.relatorioRendimento(c.s, {});
  assert.strictEqual(r.real.valor, 72);
  assert.strictEqual(r.comparacao.difPP, 72 - 75);
  assert.strictEqual(D.saldo(c.s, 'mp', 'FABRICA'), 70);
  assert.strictEqual(D.saldo(c.s, 'cortada', 'FABRICA'), 36);
});

t('rendimento por local: banca e casa separados', () => {
  const c = cenario(); entrada(c, { pesos: [100, 100] });
  corte(c, { processado: 10, entregue: 9, local: 'BANCA' });
  corte(c, { processado: 90, entregue: 45, local: 'CASA' });
  const r = D.relatorioRendimento(c.s, {});
  assert.strictEqual(r.real.valor, 54);
  assert.strictEqual(r.porLocal.find((x) => x.local === 'BANCA').valor, 90);
  assert.strictEqual(r.porLocal.find((x) => x.local === 'CASA').valor, 50);
});

t('média real ponderada pelo peso processado, não média simples', () => {
  const c = cenario(); entrada(c, { pesos: [100, 100] });
  corte(c, { processado: 10, entregue: 9 });
  corte(c, { processado: 90, entregue: 45 });
  assert.strictEqual(D.relatorioRendimento(c.s, {}).real.valor, 54);
});

t('estimado ponderado ignora entradas sem estimativa', () => {
  const c = cenario();
  entrada(c, { pesos: [100], rendEst: 80 }); entrada(c, { pesos: [300], rendEst: 60 }); entrada(c, { pesos: [600], rendEst: null });
  const r = D.relatorioRendimento(c.s, {});
  assert.strictEqual(r.estimado.valor, (80 * 100 + 60 * 300) / 400);
  assert.strictEqual(r.estimado.nSem, 1);
});

t('cortador: pago pelo peso entregue x valor por kg, confirmado (não provisório)', () => {
  const c = cenario(); entrada(c);
  D.definirPreco(c.s, c.adm, { tipo: 'kg_cortador', centavos: 250, inicio: '2026-01-01' });
  corte(c, { entregue: 36.5, aprovado: 20 });
  const l = c.s.lanc.find((x) => x.tipo === 'REMUN_CORTADOR');
  assert.strictEqual(l.valor, 9125);
  assert.strictEqual(l.provisorio, false);
});

t('preço novo não altera lançamento antigo', () => {
  const c = cenario(); entrada(c);
  D.definirPreco(c.s, c.adm, { tipo: 'kg_cortador', centavos: 250, inicio: '2026-01-01' });
  corte(c, { processado: 10, entregue: 10 });
  D.definirPreco(c.s, c.adm, { tipo: 'kg_cortador', centavos: 400, inicio: '2026-03-10' });
  assert.strictEqual(c.s.lanc.find((x) => x.tipo === 'REMUN_CORTADOR').valor, 2500);
  corte(c, { data: '2026-03-12', processado: 10, entregue: 10 });
  assert.strictEqual(c.s.lanc.filter((x) => x.tipo === 'REMUN_CORTADOR')[1].valor, 4000);
});

t('corte sem preço fica aguardando e pode ser recalculado depois', () => {
  const c = cenario(); entrada(c); corte(c);
  const l = c.s.lanc.find((x) => x.tipo === 'REMUN_CORTADOR');
  assert.strictEqual(l.valor, null);
  D.definirPreco(c.s, c.adm, { tipo: 'kg_cortador', centavos: 100, inicio: '2026-01-01' });
  const novo = D.recalcularLanc(c.s, c.adm, l.id);
  assert.strictEqual(novo.valor, 3600);
  assert.strictEqual(l.estado, 'ESTORNADO');
});

t('estoque: saldo negativo é recusado', () => {
  const c = cenario(); entrada(c); corte(c, { entregue: 10 });
  D.criar(c.s, c.adm, 'entrega', { data: '2026-03-06', prestadorId: c.prest.id, itens: [{ mat: 'cortada', qtd: 8 }] });
  assert.strictEqual(D.saldo(c.s, 'cortada', 'FABRICA'), 2);
  assert.strictEqual(D.saldo(c.s, 'cortada', D.locPrest(c.prest.id)), 8);
  falha(() => D.criar(c.s, c.adm, 'entrega', { data: '2026-03-07', prestadorId: c.prest.id, itens: [{ mat: 'cortada', qtd: 3 }] }), 'suficiente');
});

t('rasgo em casa: baixa a palha cortada do prestador e gera rasgada com ele', () => {
  const c = cenario(); entrada(c); corte(c, { entregue: 10 });
  D.criar(c.s, c.adm, 'entrega', { data: '2026-03-06', prestadorId: c.prest.id, itens: [{ mat: 'cortada', qtd: 10 }] });
  D.criar(c.s, c.adm, 'producao', { data: '2026-03-08', local: 'CASA', prestadorId: c.prest.id, qtd: 5.2, cortadaUsada: 4 });
  assert.strictEqual(D.saldo(c.s, 'cortada', D.locPrest(c.prest.id)), 6);
  assert.strictEqual(D.saldo(c.s, 'rasgada', D.locPrest(c.prest.id)), 5.2);
  assert.strictEqual(D.saldo(c.s, 'rasgada', 'FABRICA'), 0);
});

t('rasgo na banca: usa a palha cortada da fábrica e não gera pagamento de prestador', () => {
  const c = cenario(); entrada(c); corte(c, { entregue: 10 });
  D.criar(c.s, c.adm, 'producao', { data: '2026-03-08', local: 'BANCA', qtd: 7, cortadaUsada: 5 });
  assert.strictEqual(D.saldo(c.s, 'cortada', 'FABRICA'), 5);
  assert.strictEqual(D.saldo(c.s, 'rasgada', 'FABRICA'), 7);
  assert.strictEqual(c.s.lanc.filter((l) => l.tipo === 'REMUN_PRESTADOR').length, 0);
});

t('rasgo em casa sem palha cortada suficiente com o prestador é recusado', () => {
  const c = cenario();
  falha(() => D.criar(c.s, c.adm, 'producao', { data: '2026-03-08', local: 'CASA', prestadorId: c.prest.id, qtd: 5, cortadaUsada: 4 }), 'suficiente');
});

t('prestador: 5 milheiros x R$ 20 = R$ 100, pelo que foi registrado, preço gravado', () => {
  const c = cenario();
  D.definirPreco(c.s, c.adm, { tipo: 'milheiro_prestador', centavos: 2000, inicio: '2026-01-01' });
  D.criar(c.s, c.adm, 'producao', { data: '2026-03-08', local: 'CASA', prestadorId: c.prest.id, qtd: 5, cortadaUsada: 0 });
  const l = c.s.lanc.find((x) => x.tipo === 'REMUN_PRESTADOR');
  assert.strictEqual(l.valor, 10000);
  assert.strictEqual(l.snap.precoMilheiroCentavos, 2000);
  D.definirPreco(c.s, c.adm, { tipo: 'milheiro_prestador', centavos: 3000, inicio: '2026-03-09' });
  assert.strictEqual(l.valor, 10000);
  D.pagarPessoa(c.s, c.adm, { pessoaId: c.prest.id, tipos: ['REMUN_PRESTADOR'], valor: 4000, data: '2026-03-11' });
  assert.strictEqual(D.lancPendente(c.s, l), 6000);
  falha(() => D.pagarPessoa(c.s, c.adm, { pessoaId: c.prest.id, tipos: ['REMUN_PRESTADOR'], valor: 6001, data: '2026-03-11' }), 'passa do que');
});

t('prestador: devolução não muda o valor devido; rejeitos (lixo) não entram em nada', () => {
  const c = cenario();
  D.definirPreco(c.s, c.adm, { tipo: 'milheiro_prestador', centavos: 2000, inicio: '2026-01-01' });
  D.criar(c.s, c.adm, 'producao', { data: '2026-03-08', local: 'CASA', prestadorId: c.prest.id, qtd: 5, cortadaUsada: 0, lixo: 0.8 });
  D.criar(c.s, c.adm, 'retorno', { data: '2026-03-09', prestadorId: c.prest.id, itens: { rasgada: { rec: 3, conf: 2.9 } } });
  assert.strictEqual(D.resumoPrestador(c.s, c.prest.id, {}).devido, 10000);
  assert.strictEqual(D.saldo(c.s, 'rasgada', D.locPrest(c.prest.id)), 2);
  assert.strictEqual(D.saldo(c.s, 'rasgada', 'FABRICA'), 3);
  assert.strictEqual(D.diferencasAbertas(c.s).perdas, undefined);
});

t('períodos: dia, semana (seg a dom) e mês', () => {
  const d = D.periodo('dia', '2026-10-14'); assert.deepStrictEqual([d.de, d.ate], ['2026-10-14', '2026-10-14']);
  const s = D.periodo('semana', '2026-10-14'); assert.deepStrictEqual([s.de, s.ate], ['2026-10-12', '2026-10-18']);
  const m = D.periodo('mes', '2026-02-10'); assert.deepStrictEqual([m.de, m.ate], ['2026-02-01', '2026-02-28']);
  assert.strictEqual(D.deslocarPeriodo('mes', '2026-01-31', 1), '2026-02-01');
  assert.strictEqual(D.deslocarPeriodo('semana', '2026-10-14', -1), '2026-10-07');
});

t('resumo do prestador respeita o período', () => {
  const c = cenario();
  D.definirPreco(c.s, c.adm, { tipo: 'milheiro_prestador', centavos: 2000, inicio: '2026-01-01' });
  D.criar(c.s, c.adm, 'producao', { data: '2026-10-12', local: 'CASA', prestadorId: c.prest.id, qtd: 2, cortadaUsada: 0 });
  D.criar(c.s, c.adm, 'producao', { data: '2026-10-14', local: 'CASA', prestadorId: c.prest.id, qtd: 3, cortadaUsada: 0 });
  D.criar(c.s, c.adm, 'producao', { data: '2026-10-20', local: 'CASA', prestadorId: c.prest.id, qtd: 4, cortadaUsada: 0 });
  D.pagarPessoa(c.s, c.adm, { pessoaId: c.prest.id, tipos: ['REMUN_PRESTADOR'], valor: 4000, data: '2026-10-15' });
  const sem = D.resumoPrestador(c.s, c.prest.id, D.periodo('semana', '2026-10-14'));
  assert.strictEqual(sem.produzida, 5); assert.strictEqual(sem.devido, 10000); assert.strictEqual(sem.pago, 4000);
  assert.strictEqual(sem.pendenteTotal, 18000 - 4000);
  assert.strictEqual(D.resumoPrestador(c.s, c.prest.id, D.periodo('dia', '2026-10-14')).produzida, 3);
  assert.strictEqual(D.resumoPrestador(c.s, c.prest.id, D.periodo('mes', '2026-10-14')).produzida, 9);
});

t('corrigir registro estorna movimentos e guarda histórico', () => {
  const c = cenario(); const e = entrada(c);
  D.corrigir(c.s, c.adm, 'entrada', e.id, { data: '2026-03-01', fornecedorId: c.forn.id, pesos: [50, 50], custo: 100000, epoca: 'Safra 2026', rendEst: 70 }, 'peso errado');
  assert.strictEqual(D.saldo(c.s, 'mp', 'FABRICA'), 100);
  assert.strictEqual(e.historico.length, 1);
  falha(() => D.corrigir(c.s, c.adm, 'entrada', e.id, { data: '2026-03-01', pesos: [1], custo: 0 }, ''), 'motivo');
});

t('não estorna entrada cujo material já foi consumido; nem lançamento já pago', () => {
  const c = cenario(); const e = entrada(c, { pesos: [10] });
  corte(c, { processado: 10, entregue: 7 });
  falha(() => D.estornar(c.s, c.adm, 'entrada', e.id, 'teste'), 'já foi movimentado');
  const c2 = cenario(); const e2 = entrada(c2);
  D.registrarBaixa(c2.s, c2.adm, { lancId: c2.s.lanc[0].id, valor: 1000, data: '2026-03-02' });
  falha(() => D.estornar(c2.s, c2.adm, 'entrada', e2.id, 'teste'), 'pagamento');
});

t('placas: total = fábrica + prestadores + danificadas; conferência não baixa sozinha', () => {
  const c = cenario();
  D.entradaMaterial(c.s, c.adm, { mat: 'placa', qtd: 100, data: '2026-03-01' });
  D.criar(c.s, c.adm, 'entrega', { data: '2026-03-02', prestadorId: c.prest.id, itens: [{ mat: 'placa', qtd: 30 }] });
  D.criar(c.s, c.adm, 'retorno', { data: '2026-03-10', prestadorId: c.prest.id, itens: { placa: { rec: 10 } }, danificados: [{ mat: 'placa', qtd: 2, motivo: 'quebraram' }] });
  const p = D.resumoPlacas(c.s);
  assert.strictEqual(p.fabrica, 80); assert.strictEqual(p.comPrest, 18); assert.strictEqual(p.danificadas, 2); assert.strictEqual(p.total, 100);
  const cf = D.conferir(c.s, c.adm, { mat: 'placa', loc: D.locPrest(c.prest.id), contado: 15 });
  assert.strictEqual(cf.estado, 'ABERTA');
  assert.strictEqual(D.saldo(c.s, 'placa', D.locPrest(c.prest.id)), 18);
  D.resolverConferencia(c.s, c.adm, cf.id, 'ajustar', 'Placas sumiram');
  assert.strictEqual(D.resumoPlacas(c.s).total, 100);
});

t('perfil consulta não altera nada', () => {
  const c = cenario();
  falha(() => D.criar(c.s, { id: 'x', nome: 'X', perfil: 'consulta' }, 'entrada', { data: '2026-03-01', pesos: [10], custo: 0 }), 'não permite');
});

t('transação: erro não deixa o estado pela metade', () => {
  const c = cenario(); entrada(c);
  const antes = JSON.stringify(c.s);
  try { D.transacao(c.s, (r) => { corte({ s: r, adm: c.adm, cortador: c.cortador }); corte({ s: r, adm: c.adm, cortador: c.cortador }, { processado: 999 }); }); } catch (e) { /* esperado */ }
  assert.strictEqual(JSON.stringify(c.s), antes);
});

t('lucro estimado: desligado até ter todos os dados; depois usa a média de aproveitamento esperada', () => {
  const c = cenario();
  assert.strictEqual(D.lucroEstimado(c.s, {}).completo, false);
  D.definirPreco(c.s, c.adm, { tipo: 'kg_cortador', centavos: 100, inicio: '2026-01-01' });       // R$ 1,00/kg
  D.definirPreco(c.s, c.adm, { tipo: 'milheiro_prestador', centavos: 2000, inicio: '2026-01-01' }); // R$ 20/milheiro
  D.entradaMaterial(c.s, c.adm, { mat: 'placa', qtd: 1, data: '2026-03-01' });
  D.criar(c.s, c.adm, 'entrada', { data: '2026-03-01', pesos: [100], custo: 20000, rendEst: 50 });    // R$ 2,00/kg, 50% => R$ 4,00 por kg aproveitável
  D.criar(c.s, c.adm, 'corte', { data: '2026-03-02', cortadorId: c.cortador.id, processado: 100, entregue: 50 }); // 50 kg cortados; corte R$ 1,00/kg
  D.criar(c.s, c.adm, 'entrega', { data: '2026-03-03', prestadorId: c.prest.id, itens: [{ mat: 'cortada', qtd: 50 }] });
  D.criar(c.s, c.adm, 'producao', { data: '2026-03-04', local: 'CASA', prestadorId: c.prest.id, qtd: 10, cortadaUsada: 50 });          // 0,2 milheiro por kg cortado; rasgo R$ 20/milheiro
  D.criar(c.s, c.adm, 'retorno', { data: '2026-03-05', prestadorId: c.prest.id, itens: { rasgada: { rec: 10 } } });
  const prod = D.novoMaterial(c.s, c.adm, { nome: 'Palha pronta', un: 'milheiro', cat: 'produto' });
  D.entradaProduto(c.s, c.adm, { mat: prod.id, qtd: 4, data: '2026-03-06' });
  D.registrarVenda(c.s, c.adm, { data: '2026-03-07', produtoId: prod.id, qtd: 4, valor: 40000 });   // R$ 400
  D.registrarDespesa(c.s, c.adm, { data: '2026-03-07', descricao: 'Frete', valor: 3000 });
  const r = D.lucroEstimado(c.s, {});
  assert.strictEqual(r.completo, true);
  // MP: 2,00 / 0,50 = 4,00 por kg aproveitável / 0,2 milheiro por kg = 20,00; corte 1,00 / 0,2 = 5,00; rasgo 20,00 => 4.500 centavos por milheiro
  assert.strictEqual(Math.round(r.custoUnitario), 4500);
  assert.strictEqual(r.custoVendido, 18000);
  assert.strictEqual(r.lucroBruto, 40000 - 18000);
  assert.strictEqual(r.lucroLiquido, 40000 - 18000 - 3000);
});

console.log('\n' + ok + ' testes passaram' + (process.exitCode ? ', COM FALHAS' : '.'));
