# Especificação do Sistema — Banca de Palha

Versão: 0.4 (v0.3 + decisões confirmadas da banca, módulo Rasgo, filtros de período e lucro estimado)
Data: 2026-10-13
Situação: **regras parcialmente definidas** — ver seção 12 (pendências).

Convenções deste documento:

- **[DEFINIDO]**: regra confirmada pelo administrador.
- **[PENDENTE]**: depende de decisão ainda não tomada. O sistema não assume valor; o cálculo fica desativado ou marcado como **provisório**.
- **[PREMISSA TÉCNICA]**: escolha de projeto minha, necessária para implementar, que **não** é regra de negócio. Listadas na seção 13 para revisão.

---

## 0. Decisões confirmadas em 2026-10-13 (substituem o texto anterior incompatível)

| Tema | Decisão | Efeito no sistema |
|---|---|---|
| Cortador | Recebe pelo **peso entregue** | `cortador.base_remuneravel = ENTREGUE`, confirmada. Valor = kg entregues × valor por kg, gravado no lançamento |
| Prestador externo | Recebe **pelo que foi registrado** (produzido) | Cada registro de rasgo em casa gera o valor devido: milheiros × valor do milheiro (preço gravado). Devolução e conferência **não** mudam o valor. Opção `DEVOLVIDA_CONFERIDA` removida |
| Rejeitos, perdas, diferenças da produção externa | **Desconsiderar: é lixo** | Podem ser anotados no rasgo (campo opcional), sem efeito em estoque, produção ou pagamento. Sem justificativa obrigatória |
| Custo do vendido e lucro | **Em cima da média de aproveitamento esperada** (rendimento estimado médio) | Lucro **estimado**, sempre marcado "Estimativa" (seção 8A) |
| Unidades | Palha para cortar e **palha cortada em kg** (a palha cortada é vendida/controlada por kg, não por milheiro). Palha rasgada em **milheiros** | Matéria-prima e palha cortada: kg. Palha rasgada: milheiros. Sem conversão kg↔milheiro cadastrada; a estimativa de lucro usa a média de milheiros rasgados por kg de palha cortada usado |
| Baixa da palha cortada | **Módulo próprio**, pois há corte e rasgo na banca e em casa (rota) | Módulo **Rasgo** (seção 5A). Corte também registra o local (banca ou casa) |
| Período | Filtros de **dia, semana e mês** nos valores dos prestadores e no painel inicial | Seção 14 |

Continua **pendente**: qual peso é "aproveitável" no rendimento real (entregue ou aprovado). Provisório: entregue.

Observações sobre a interpretação (confirmar):
1. Corte registra o **peso entregue em kg**, que serve para pagamento, rendimento e estoque de palha cortada. Não há contagem em milheiros no corte.
2. "Corte na banca e em casa (rota)" foi entendido como local do corte e do rasgo. O envio de matéria-prima ao cortador de casa e o retorno posterior **não** são modelados em duas etapas: o registro vale no momento da entrega da palha cortada.

---

## 1. Princípios gerais

1. **Três controles independentes**, ligados por identificadores e históricos [DEFINIDO]:

   | Controle | Responde | Exemplo |
   |---|---|---|
   | Estoque | Onde estão materiais e produtos, em que quantidade e unidade | Enviar palha cortada a um prestador |
   | Produção | O que foi processado, por quem, quando, em qual etapa | Prestador rasgou 5.000 palhas |
   | Financeiro | Valores devidos, pagos, recebidos, custos, despesas | Devido R$ 100,00; pagamento de R$ 100,00 |

2. Um evento pode gerar registros nos três módulos, **sem duplicar quantidades nem valores**. Cada fato tem uma fonte única; os demais módulos o referenciam por ID.
3. **Quantidade física e valor monetário nunca entram no mesmo total** [DEFINIDO].
4. **Valor calculado ≠ valor realizado**: "devido" e "pago" são registros distintos [DEFINIDO].
5. **Saldos são derivados** das movimentações registradas, nunca digitados [DEFINIDO].
6. **Sem inventar regras**: lacunas viram configuração com estado `NÃO DEFINIDO`, e o cálculo dependente fica desativado ou provisório [DEFINIDO].
7. Toda quantidade é gravada com sua **unidade**. Totais nunca somam unidades diferentes.
8. Registros são **imutáveis**: correção por estorno + novo lançamento, com justificativa e responsável.

---

## 2. Cadastros e configurações

### 2.1 Cadastros

| Cadastro | Campos principais |
|---|---|
| Pessoa | Nome, papel(éis): cortador, prestador externo, fornecedor, cliente |
| Material | Nome, categoria (matéria-prima, palha cortada, palha rasgada, placa, outro, produto acabado), unidade |
| Unidade | Código (`kg`, `un`, …). Conversões entre unidades só existem se cadastradas (ver 2.3) |
| Entrada de matéria-prima | Ver seção 4A. **Não há controle físico de lotes**: a entrada é histórico para análise, não identifica o que sobrou no estoque |

### 2.2 Tabelas de preço (versionadas)

| Preço | Padrão | Sobrescrita |
|---|---|---|
| Valor por kg (cortador) | Global | Por cortador (opcional) |
| Valor por milheiro (prestador) | Global | Por prestador (opcional) |

- Cada preço tem **data de início de vigência**. Alterar preço cria nova versão; nunca edita a anterior.
- Cada lançamento **grava o valor aplicado** (snapshot). Mudança posterior de preço **não altera** lançamentos existentes [DEFINIDO].
- Sem preço vigente para a pessoa/data: o cálculo fica bloqueado com aviso explícito.

### 2.3 Unidades e conversões [PENDENTE – item 5]

- Palha cortada: `kg`. Palha rasgada: `un` (unidade; milheiro = 1.000 un apenas para pagamento).
- Não existe conversão kg ↔ un, nem placa ↔ palha [DEFINIDO]. A tabela de conversões nasce **vazia**; nenhum cálculo a usa.
- Se a prática exigir outras pesagens ou conversões, são cadastradas depois, como configuração.

### 2.4 Chaves de decisão pendente

| Chave | Valores possíveis | Estado inicial |
|---|---|---|
| `cortador.base_remuneravel` | `ENTREGUE` \| `APROVADO` | `ENTREGUE` (**provisório**) |
| `prestador.base_remuneravel` | `PRODUZIDA` \| `DEVOLVIDA_CONFERIDA` | `NÃO DEFINIDO` |
| `prestador.tratamento_perdas` | a definir pelo administrador | `NÃO DEFINIDO` |
| `custo.metodo_valorizacao_estoque` | a escolher pelo administrador | `NÃO DEFINIDO` |
| `estoque.usa_transito` | `sim` \| `não` | `não` |
| `rendimento.peso_aproveitavel` | `ENTREGUE` \| `APROVADO` | `ENTREGUE` (**provisório**) |

Alterar uma chave exige perfil administrador, grava data, responsável e valor anterior, e **não recalcula** lançamentos passados automaticamente (ver 12).

---

## 3. Estoque

### 3.1 Modelo

Livro de **movimentações** (append-only). Toda movimentação debita um local e credita outro:

| Campo | Descrição |
|---|---|
| id, data/hora | |
| material, quantidade, unidade | |
| local de origem → local de destino | ver locais abaixo |
| tipo | entrada, transferência, envio, retorno, produção, consumo, venda, ajuste, estorno |
| prestador | quando aplicável |
| referência | ID do evento de origem (entrega, produção, retorno, compra, venda, conferência) |
| responsável, observações | |
| justificativa | **obrigatória** em ajuste e estorno |

**Locais**: `FÁBRICA`, `PRESTADOR(id)`, `EM_TRÂNSITO` (só se `estoque.usa_transito`), `DANIFICADO_PERDIDO`, e os pontos externos `EXTERNO` (compras/vendas) e `CONSUMO`.

### 3.2 Regras

- Saldo de cada material em cada local = soma das movimentações. Não há campo de saldo editável [DEFINIDO].
- Um material está em **um único local** por vez; a dupla entrada impede contagem simultânea na fábrica e no prestador [DEFINIDO].
- Movimentação que deixaria saldo negativo no local de origem é recusada.
- Envio ao prestador: `FÁBRICA → PRESTADOR(id)`. Com trânsito ativo: `FÁBRICA → EM_TRÂNSITO → PRESTADOR(id)`.
- Material enviado permanece sob responsabilidade do prestador até devolução ou ajuste justificado [DEFINIDO].

### 3.3 Placas reutilizáveis [DEFINIDO]

| Indicador | Cálculo |
|---|---|
| Total cadastrado | Entradas de placas − baixas aprovadas |
| Disponível na fábrica | Saldo em `FÁBRICA` |
| Com cada prestador | Saldo em `PRESTADOR(id)` |
| Em trânsito | Saldo em `EM_TRÂNSITO` |
| Devolvidas | Soma das movimentações de retorno (indicador histórico) |
| Danificadas/perdidas | Saldo em `DANIFICADO_PERDIDO` |

Verificação: `total cadastrado = fábrica + prestadores + trânsito + danificadas/perdidas`.

- Placa **não é consumida** por serviço e **não tem conversão** com palhas produzidas.
- **Conferência**: contagem física informada × saldo do sistema → mostra diferença. A diferença fica **aberta** até ajuste manual com justificativa. Nunca há baixa automática [DEFINIDO].

---

## 4. Cortador

### 4.1 Lançamento de corte

| Campo | Observação |
|---|---|
| Cortador, data | Origem do material (entrada) só se houver certeza; padrão: "mistura do estoque" |
| Peso da matéria-prima recebida (kg) | |
| Peso total da palha cortada entregue (kg) | |
| Peso aprovado (kg) | Opcional; só se houver controle de qualidade |
| Peso rejeitado ou perdido (kg) | Opcional |
| Valor por kg aplicado | Snapshot do preço vigente |
| Base utilizada | Snapshot de `cortador.base_remuneravel` |
| kg remuneráveis | Calculado pela base |
| Total calculado | |
| Marca **provisório** | Enquanto a base não estiver confirmada |

### 4.2 Cálculo

```
Pagamento do cortador = kg remuneráveis de palha cortada × valor por kg
```

- Base `ENTREGUE` (inicial): kg remuneráveis = peso entregue. **Provisório [PENDENTE – item 1]**.
- Base `APROVADO`: kg remuneráveis = peso aprovado; se não informado, o cálculo fica bloqueado.
- Peso entregue e peso aprovado **não são presumidos iguais**. Quando ambos existem, a tela mostra os dois totais como comparativo informativo.
- Diferenças entre matéria-prima recebida, entregue, aprovada e rejeitada são **exibidas, não bloqueadas e não corrigidas**.

### 4.3 Efeitos nos outros módulos

- Estoque: consumo de matéria-prima e entrada de palha cortada (kg), referenciando o lançamento.
- Financeiro: obrigação "remuneração do cortador devida", referenciando o lançamento.

---

## 4A. Entrada de matéria-prima e rendimento [DEFINIDO]

### 4A.1 Entrada

| Campo | Observação |
|---|---|
| Data de recebimento | |
| Quantidade de sacos | |
| Peso de cada saco | Todos iguais ou um peso por saco |
| Peso total recebido | **Calculado**, nunca digitado |
| Custo da compra | Gera obrigação financeira (compra de matéria-prima) |
| Época, safra ou período de plantio | Opcional |
| Rendimento estimado (%) | Opcional; só funcionário autorizado; **estimativa manual**, exibida como "Rendimento estimado (%)" com explicação curta |
| Observações sobre qualidade | Opcional |

### 4A.2 Sem lotes físicos

- Um **estoque compartilhado** de matéria-prima. A palha é misturada; o sistema não afirma de qual entrada vem o que resta.
- O **histórico de cada entrada** (pesos, custo, rendimento estimado) serve só para análise e comparação.
- Qualidade do estoque atual **não é calculada**: o sistema informa a limitação.

### 4A.3 Rendimento real

Registrado no corte: peso processado, peso aproveitável, perdas/rejeitos (se medidos).

```
Rendimento real (%) = peso aproveitável ÷ peso processado × 100
Diferença = rendimento real − rendimento estimado   (em pontos percentuais)
```

- O resultado de um corte é uma **medição da operação/período**. Só é associado a uma entrada se o usuário indicar, com certeza, que o material veio apenas dela.
- "Peso aproveitável" = peso entregue ou peso aprovado conforme `rendimento.peso_aproveitavel` [PENDENTE – P7]. Corte sem o peso exigido fica fora das médias.

### 4A.4 Médias e relatórios

- Estimado por entrada; estimado por época/safra; real médio dos cortes; comparação estimado × real; evolução mensal.
- **Médias ponderadas**: estimado ponderado pelo peso recebido (só entradas com estimativa); real = Σ aproveitável ÷ Σ processado. Nunca média simples de percentuais.
- Cada relatório informa período, quantidade de entradas/cortes e quilos considerados, em linguagem simples.

### 4A.5 Rendimento e custo são indicadores diferentes

- Rendimento: quanto material aproveitável se obtém. Custo médio de compra: R$ pagos ÷ kg comprados.
- Rendimento estimado nunca é exibido como real; qualidade média nunca substitui custo médio.
- Referência "custo por kg aproveitável" (custo médio ÷ rendimento real médio) é **estimativa**, só com compra, sem corte e demais custos.

### 4A.6 Correção

Entradas e cortes podem ser corrigidos conforme o perfil; toda correção exige motivo e preserva o histórico (valor anterior, quem, quando).

---

## 5. Produção externa (prestadores)

Módulo individual por prestador. Eventos independentes: **entrega**, **produção**, **retorno**, **conferência**.

### 5.1 Entrega de materiais [DEFINIDO]

Campos: prestador, data, palha cortada (kg), placas (un), outros materiais (material, quantidade, unidade), responsável, observações.

Efeito: movimentações `FÁBRICA → PRESTADOR(id)` por item; saldo da fábrica diminui e o do prestador aumenta.

### 5.2 Registro de produção [DEFINIDO]

Campos: prestador, data, palhas rasgadas (un), placas em posse (informativo, se controlável), perdas/diferenças justificadas, observações. Podem existir vários lançamentos no mesmo dia; os relatórios consolidam por dia.

- Produção **não é devolução**. Registrar produção não move nada para a fábrica.
- Efeito em estoque [PREMISSA TÉCNICA]: entrada de palha rasgada (un) no local `PRESTADOR(id)`, referenciando a produção. Não converte nem baixa palha cortada (não há conversão kg→un).
- **Perdas/diferenças**: registradas com quantidade, unidade, categoria e justificativa. Não alteram saldo de estoque nem quantidade remunerável por conta própria [PENDENTE – item 3].

### 5.3 Retorno à fábrica [DEFINIDO]

Registrado por evento próprio, com quantidade **recebida** e quantidade **conferida** por item:

| Item | Efeito |
|---|---|
| Palhas rasgadas (un) | `PRESTADOR(id) → FÁBRICA` |
| Placas reutilizáveis (un) | `PRESTADOR(id) → FÁBRICA` |
| Palha cortada não utilizada (kg) | `PRESTADOR(id) → FÁBRICA` |
| Materiais danificados ou perdidos | `PRESTADOR(id) → DANIFICADO_PERDIDO`, com motivo |

- **Pendente de retorno** é calculado (saldo no local do prestador), nunca digitado.
- Diferença entre recebido e conferido fica registrada e **aberta**; não gera baixa.

### 5.4 Baixa de palha cortada com o prestador [PENDENTE]

Sem conversão kg→un, o saldo de palha cortada com o prestador só diminui por: (a) devolução de não utilizada, (b) ajuste manual justificado. Ver pendência P6.

---

## 5A. Módulo Rasgo (banca e casa) [DEFINIDO em 2026-10-13]

Um único tipo de registro para o rasgo feito **na banca** ou **em casa (rota)**.

| Campo | Observação |
|---|---|
| Data, local (`BANCA` \| `CASA`) | |
| Prestador | Obrigatório só em casa |
| Palha cortada usada (milheiros) | **Baixa informada**, nunca calculada |
| Palha rasgada obtida (milheiros) | Só o aproveitado; em casa, gera o pagamento |
| Palhas rejeitadas (lixo), placas em posse, observações | Opcionais, sem efeito em estoque ou pagamento |

Efeitos:
- Estoque: palha cortada sai do local (fábrica ou prestador) e a rasgada entra no mesmo local. Saldo insuficiente de palha cortada recusa o registro.
- Financeiro (só em casa): valor devido = milheiros × valor do milheiro vigente na data, gravado no lançamento. Sem preço definido, fica "aguardando" e pode ser recalculado.
- Rasgo na banca não gera pagamento por milheiro.
- Relatórios mostram a relação "rasgadas por cortada" média, calculada dos registros.

---

## 6. Pagamento dos prestadores externos

### 6.1 Apuração (financeiro)

Lançamento de **valor devido**, ligado à(s) produção(ões) de origem:

| Campo | Observação |
|---|---|
| Quantidade produzida | Vem do registro de produção |
| Quantidade remunerável | Definida por `prestador.base_remuneravel` |
| Valor por milheiro aplicado | Snapshot |
| Total devido | |
| Estado | `CALCULADO` \| `AGUARDANDO DEFINIÇÃO` |

```
Total devido = quantidade remunerável ÷ 1.000 × valor do milheiro
```

- `PRODUZIDA`: remunerável = produzida.
- `DEVOLVIDA_CONFERIDA`: remunerável = quantidade conferida nos retornos vinculada à produção.
- `NÃO DEFINIDO` (estado inicial): mostra produzida e devolvida/conferida, mas **não calcula total devido** [PENDENTE – item 2].

### 6.2 Pagamento realizado

Registro **separado**: data, prestador, valor, forma (livre), lançamentos de apuração abrangidos, responsável.

```
Saldo pendente = total devido − total pago
```

- Pagamento acima do devido em aberto é recusado [PREMISSA TÉCNICA].
- Cada produção mostra: produzido, remunerável, valor/milheiro, devido, pago, pendente.

---

## 7. Financeiro

### 7.1 Tipos de lançamento

| Tipo | Natureza |
|---|---|
| Compra de matéria-prima | Custo (por lote) |
| Remuneração devida — cortador / prestador | Obrigação |
| Pagamento realizado | Saída |
| Despesa operacional | Custo |
| Venda | Receita |
| Recebimento | Entrada |

Devido (obrigação/receita) e realizado (pago/recebido) são sempre lançamentos separados e vinculados.

### 7.2 Distinções obrigatórias [DEFINIDO]

| Conceito | Onde nasce |
|---|---|
| Compra de matéria-prima | Financeiro (valor) + estoque (entrada no estoque compartilhado) |
| Matéria-prima consumida | Estoque (`FÁBRICA → CONSUMO`), via produção |
| Produto acabado em estoque | Estoque (saldo do produto) |
| Produto efetivamente vendido | Estoque (saída) + financeiro (venda) |
| Custos associados ao vendido | Cálculo — **desativado** até definir método (seção 8) |

---

## 8. Custo do estoque vendido e lucro [PENDENTE – item 4]

O sistema **registra** (dados brutos, sempre disponíveis):

custo de compra por entrada (sem controle físico de lotes); peso e quantidade recebidos; custos de produção; pagamentos por produção; materiais consumidos; quantidades produzidas e vendidas; despesas operacionais; estoque disponível; receitas de vendas e valores recebidos.

O sistema **não calcula** custo do produto vendido nem lucro líquido enquanto `custo.metodo_valorizacao_estoque` for `NÃO DEFINIDO`. A tela exibe: "Aguardando escolha do método de valorização pelo administrador".

Indicadores com classificação visível:

| Indicador | Classe |
|---|---|
| Total comprado, pago, recebido, a pagar, a receber | Fato |
| Despesas operacionais, receita de vendas | Fato |
| Estoque físico por local e material | Fato |
| Recebido − pago no período (fluxo de caixa; **não é lucro**) | Fato, com aviso |
| Valor do estoque, custo do vendido, lucro bruto/líquido | **Indisponível** (aguarda método) |
| Qualquer valor calculado com base provisória | **Estimativa** (selo visível) |

Ao habilitar o método, o sistema solicita a escolha do administrador e registra data e responsável. Cálculo retroativo é ação explícita, não automática.

---

## 8A. Lucro estimado [DEFINIDO em 2026-10-13]

Método: média de aproveitamento esperada. Resultado sempre exibido como **estimativa**.

```
custo da matéria-prima por milheiro rasgado =
    custo médio de compra (R$/kg) ÷ rendimento estimado médio
    × kg por milheiro cortado (do histórico de cortes)
    ÷ milheiros rasgados por milheiro cortado usado (do histórico de rasgos)
custo do corte por milheiro   = média paga aos cortadores ÷ milheiros cortados ÷ (rasgadas por cortada)
custo do rasgo por milheiro   = média paga aos prestadores por milheiro rasgado em casa
custo estimado do vendido     = milheiros vendidos × soma dos três custos
lucro bruto estimado          = venda dos produtos em milheiro − custo estimado do vendido
lucro líquido estimado        = lucro bruto − despesas operacionais do período
```

Premissas (a confirmar): produto vendido em milheiros; 1 milheiro vendido = 1 milheiro de palha rasgada; custos por milheiro vêm da média de **todos** os registros, vendas e despesas do período escolhido; rasgo na banca, embalagem e outros materiais ainda sem custo. Se faltar dado, o sistema lista o que falta e não calcula.

---

## 9. Ficha individual do prestador (abas)

Cada aba tem totais próprios. **Nenhum total mistura quantidade com valor.**

### 9.1 Materiais

- Palha cortada recebida; palha cortada ainda disponível (com o prestador).
- Placas recebidas, devolvidas, ainda sob responsabilidade.
- Outros materiais pendentes.

### 9.2 Produção

- Palhas rasgadas por dia; totais semanal e mensal.
- Quantidade produzida; devolvida; ainda fora da fábrica.
- Diferenças ou perdas registradas.

### 9.3 Financeiro

- Produção remunerável; valor por milheiro.
- Total devido; total pago; saldo pendente.
- Linhas em `AGUARDANDO DEFINIÇÃO` destacadas, sem valor.

---

## 14. Filtros de período [DEFINIDO em 2026-10-13]

- Tipos: **dia**, **semana** (segunda a domingo), **mês**, **tudo**; navegação anterior/próximo e "Hoje".
- Aplica-se ao painel inicial, ao módulo Prestadores (lista e ficha), ao Rasgo e a Dinheiro.
- Por prestador: rasgado, devolvido, **devido** (calculado) e **pago** no período; **saldo a receber** é sempre o total.
- Estoque é sempre a posição de agora.

---

## 10. Auditoria e integridade

- Todo registro guarda responsável, data/hora de criação e origem.
- Estorno cria registro contrário vinculado ao original; o original permanece visível.
- Verificações automáticas (alertas, sem correção automática):
  - Quantidade em produção ≠ quantidade na movimentação de estoque vinculada.
  - Soma dos pagamentos > total devido.
  - Placas: `total ≠ fábrica + prestadores + trânsito + danificadas`.
  - Mesmo material com saldo positivo em dois locais por falha de lançamento.

---

## 11. Fora de escopo nesta versão

- Qualquer conversão kg ↔ un, placa ↔ palha.
- Cálculo definitivo de custo do vendido e lucro.
- Cálculo de pagamento do prestador com base indefinida.
- Tratamento automático de perdas e rejeições.

---

## 12. Pendências obrigatórias

| # | Decisão necessária | Impacta | Comportamento enquanto pendente |
|---|---|---|---|
| 1 | Cortador recebe por todo o peso entregue ou só pelo aprovado? | Seção 4 | Calcula por peso entregue, **marcado provisório**; mostra comparativo com aprovado |
| 2 | Prestador recebe por tudo que registrou ou só pelo devolvido e conferido? | Seção 6 | Quantidade produzida e conferida exibidas; **total devido não calculado** |
| 3 | Como tratar rejeições, perdas e diferenças na produção externa? | Seções 5, 6 | Registradas e justificadas; **sem efeito** em estoque ou pagamento |
| 4 | Como a banca determina o custo dos produtos acabados vendidos? | Seção 8 | Dados brutos registrados; **custo e lucro indisponíveis** |
| 5 | Palha cortada = só kg e rasgada = só un, ou há outras pesagens/conversões? | Seções 2.3, 5 | Só `kg` e `un`; **tabela de conversão vazia** |
| P6 | *(levantada na modelagem)* Como baixar a palha cortada que o prestador efetivamente rasgou, já que não há conversão kg→un? | Seção 5.4 | Saldo de palha cortada com o prestador só baixa por devolução ou ajuste justificado |
| P7 | *(levantada na modelagem)* Qual peso conta como "aproveitável" no rendimento real: o entregue ou o aprovado? | Seção 4A.3 | Usa peso entregue, **marcado provisório** |

Quando uma decisão for tomada: o administrador altera a chave em 2.4; lançamentos anteriores permanecem com sua base gravada e marcados; a reapuração é uma ação explícita que gera ajustes visíveis, nunca uma reescrita silenciosa.

---

## 13. Premissas técnicas a revisar

Escolhas minhas para viabilizar a implementação. **Não são regras de negócio.**

1. Produção do prestador gera entrada de palha rasgada no local do prestador (5.2).
2. Preço padrão global com sobrescrita opcional por pessoa (2.2).
3. Valores monetários em decimal com 2 casas, arredondamento meia-para-cima por lançamento.
4. Pagamento acima do devido em aberto é recusado (sem adiantamento).
5. Vários lançamentos de produção por prestador no mesmo dia são permitidos.
6. Movimentação que gera saldo negativo na origem é recusada.
7. Perfil "administrador" necessário para alterar chaves de decisão e preços; demais perfis a definir.
8. Trânsito desativado por padrão.
9. Locais virtuais `EXTERNO` (compras, vendas, ajustes positivos) e `PROCESSO` (consumo e produção); substitui o `CONSUMO` da seção 3.1.
10. ~~Pagamento do prestador por ação "calcular"~~ (substituído em 0.4): o valor devido nasce no registro do rasgo, ao preço vigente na data do rasgo.
11. Perfis: administrador (tudo), funcionário (lança, corrige, paga, confere; informa rendimento estimado só se autorizado), consulta. **Sem senha** nesta versão.
12. Gravação em arquivo local (`dados/banco.json`) com uma cópia por dia; detecção de conflito se dois computadores gravam ao mesmo tempo.
13. Custo do vendido: o sistema apenas guarda a escolha do método; nenhum cálculo de custo ou lucro está implementado.
