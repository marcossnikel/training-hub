# Pivot do Training Hub sem dependência de providers

**Data da pesquisa:** 2026-08-25
**Status:** pesquisa exploratória concluída; dor secundária validada, disposição a
pagar inferida, validação primária com compradores ainda pendente
**Escopo:** produtos de corrida, ciclismo e endurance que combinam planejamento,
análise ou conhecimento de treinamento com software/IA; oportunidades cujo MVP
não exige OAuth nem acesso comercial a Strava, Garmin, COROS ou outro provider
**Método:** páginas e preços oficiais, App Store/Google Play, fóruns dos próprios
produtos, comunidades de atletas e literatura científica para as afirmações de
training theory. Todas as fontes foram acessadas em **2026-08-25**.

## Resposta curta

Existe mercado pagante, mas **não recomendo pivotar para “mais um treinador de
corrida com IA” nem para “RestOrTrain para corredores”**. Essa tese já tem
concorrentes fortes no Brasil e fora dele, e os produtos vencedores tratam sync
com relógios como parte central da experiência.

A melhor hipótese encontrada é um produto B2B, provisoriamente chamado de
**Training Decision Inbox**:

> um copiloto para treinadores e pequenas assessorias que recebe check-ins,
> disponibilidade e contexto do atleta, identifica quem precisa de atenção,
> propõe ajustes e redige feedback baseado na metodologia do treinador — sempre
> com aprovação humana antes de qualquer resposta ou alteração.

O MVP não precisa ler um único arquivo de Garmin ou Strava. Seu input natural é
o que os providers não têm: mudança de agenda, sono percebido, esforço percebido,
dor, estresse, confiança, dúvidas e a intenção do bloco. O wedge mais simples é
um check-in de 60 segundos mais uma caixa de decisões para o treinador; PDF/CSV
do plano e resultados manuais podem entrar depois.

Há uma segunda hipótese, mais rápida de testar com atletas, chamada **Plan
Rescue**: o corredor cola ou envia o plano que já segue e relata o que mudou
(`perdi dois dias`, `viajo`, `só tenho 40 minutos`, `o treino pareceu muito
pesado`). O produto propõe uma reorganização limitada que preserva a intenção do
plano e explica o porquê. É fácil de construir, mas tem disposição a pagar e
retenção menos claras, além da concorrência gratuita do ChatGPT.

Entre o B2B completo e esse caso individual há um wedge ainda mais simples:
**Training Plan Workbench/Linter**. Ele recebe qualquer plano em texto, PDF ou
CSV, normaliza sua estrutura e aponta conflitos com disponibilidade, sessões sem
propósito claro, distribuição de intensidade, mudanças de volume e regras da
metodologia escolhida. Não cria “o plano perfeito”; produz perguntas, warnings e
um diff explicável antes de atleta ou coach publicar a semana.

## A provável referência: RestOrTrain

O produto citado como “rest of train” é, com alta probabilidade,
**[RestOrTrain](https://www.restortrain.com/)**. O nome coincide quase
literalmente e a proposta também: uma IA conversacional que lê o histórico,
encontra lacunas, monta e adapta o plano e envia treinos ao dispositivo. É
*cycling-first*, mas declara considerar corrida, natação, força, triatlo e outros
esportes.

Evidência atual:

- A homepage diz **35 mil+ atletas**, nota **4,8/5** e **1.650+ reviews**; a
  [App Store brasileira](https://apps.apple.com/br/app/restortrain/id6752621455)
  mostra **4,9/5 em 74 avaliações**. Esses números são sinais de adoção, não
  número de assinantes.
- O Pro custa **R$ 89,90/mês ou R$ 829,90/ano** no Brasil.
- A [FAQ oficial](https://www.restortrain.com/faq) diz que o produto sincroniza
  Garmin, Wahoo, Hammerhead, Zwift, Rouvy, Intervals.icu e Apple Health. Sem uma
  conexão, o usuário pode enviar o arquivo da atividade manualmente.
- A personalização depende de histórico de potência, frequência cardíaca, carga,
  fadiga e/ou RPE. Medidor de potência é recomendado, embora não obrigatório.
- O caso prova a fragilidade dos providers: o próprio RestOrTrain anunciou que
  [novas conexões Strava já foram desativadas e o sync existente termina em
  1º de setembro de 2026](https://www.restortrain.com/strava), atribuindo a mudança
  à política de IA do Strava.

Se a pista “bem famoso” for mais importante que o som do nome, o segundo
candidato é **Runna**. Mas o encaixe de nome e conceito torna RestOrTrain muito
mais provável. Não encontrei um produto oficial atual chamado “Rest of Run”.

## O que o mercado já vende

| Produto | Promessa e público | Preço oficial atual | Inputs/dependência | Sinal de demanda e implicação |
| --- | --- | --- | --- | --- |
| [RestOrTrain](https://www.restortrain.com/) | Agente conversacional que analisa histórico, decide treino ou descanso, cria/adapta plano e envia workouts; foco em ciclistas, com multisporte | Grátis limitado; **R$ 89,90/mês** ou **R$ 829,90/ano** na [App Store BR](https://apps.apple.com/br/app/restortrain/id6752621455) | Dados de atividades via várias integrações; upload manual é fallback; objetivos e contexto entram por conversa | 35 mil+ atletas e 1.650+ reviews declarados na homepage; a ideia “training theory + agente” já existe e cobra no Brasil |
| [Runna](https://www.runna.com/) | Plano de corrida personalizado, suporte, IA, força/mobilidade e execução no relógio | **R$ 39,90/mês** ou **R$ 229,90/ano** na [App Store BR](https://apps.apple.com/br/app/runna-treinador-de-corrida/id1594204443); preço web global de US$ 19,99/mês ou US$ 119,99/ano | Prova/meta, nível, dias e duração; tracking próprio ou Apple Watch/Garmin/COROS/Strava | 4,9 em **3,9 mil avaliações no Brasil**; [Strava adquiriu a empresa](https://www.runna.com/pt-br/strava-acquires-runna) depois de ela ajudar milhões de corredores; categoria B2C comprovada e muito disputada |
| [TrainAsONE](https://apps.apple.com/br/app/trainasone-ai-running-plans/id1541355896) | Plano de corrida por IA que ajusta disponibilidade, treinos perdidos e retorno após doença, de 5 km a ultra | Grátis com limitações; **R$ 41,90/mês** ou **R$ 419,90/ano** no Brasil | Capacidade, metas, disponibilidade e corridas; GPS do app permite uso sem relógio externo | [Google Play](https://play.google.com/store/apps/details?id=com.trainasone) mostra 10 mil+ downloads, 3,4 e cerca de 200 reviews; adaptabilidade é antiga, não uma lacuna nova |
| [Stridex](https://www.stridex.com.br/) | Treinador de corrida brasileiro por IA, plano semanal, voz e adaptação por resultado, sono, dor e lesões | **R$ 49,90/mês** ou R$ 478,80/ano | Anamnese; Apple Health/Health Connect/Intervals.icu ou GPS próprio; resultado também pode ser registrado manualmente | Concorrente local direto e barato; suas métricas e depoimentos são autodeclarados, então o preço prova oferta, não conversão |
| [Athletica](https://athletica.ai/pricing) | Planos adaptativos e AI coach para corrida, ciclismo, triatlo, remo, duatlo e HYROX, apoiado em base científica curada | **US$ 19,90/mês**, US$ 99/6 meses ou US$ 189/ano | Baseline e dados de desempenho/recuperação; Garmin, Strava, COROS, Wahoo, Concept2 e Intervals.icu | O produto diz explicitamente que o agente explica e sugere, mas não altera o plano sozinho — autonomia humana já é um requisito competitivo |
| [AI Endurance](https://aiendurance.com/en/pricing) | Digital twin, otimização contínua de plano e agente com contexto de corrida/ciclismo/triatlo | Preço não ficou exposto no HTML dinâmico; 14 dias grátis | Para melhor previsão pede histórico; a FAQ fala em cerca de 100 corridas, embora use dados de atletas semelhantes quando faltam dados; múltiplas integrações | Seu [MCP oficial](https://aiendurance.com/docs/mcp) já expõe plano, atividades, recovery, previsão, nutrição e escrita de workouts ao ChatGPT/Claude — “colocar um agente em cima” deixou de ser diferenciação |
| [RUNALYZE](https://runalyze.com/) | Analytics independente de fabricante: VO2max efetivo, previsão, carga, curvas e histórico; Premium inclui MCP read-only | Grátis; Premium **€ 5,50/mês** ou **€ 60/ano**; Supporter € 2,50/mês ou € 27,50/ano em [Pricing](https://runalyze.com/pricing) | Várias integrações e importação de arquivos; o agente exige cliente MCP externo | Analytics profundo e conversa com os dados ficaram baratos; competir em gráficos ou chat genérico tem pouco espaço |
| [Intervals.icu](https://www.intervals.icu/pricing/) | Análise, fitness/fatigue/form, calendário, workout builder, times e coaching | Core grátis; Supporter **US$ 4/mês** | Muitas integrações **ou upload direto de arquivo** | Cria um forte teto de preço para analytics; pode ser infraestrutura/fallback, não a proposta de valor |
| [Train Ultra](https://apps.apple.com/ar/app/train-ultra/id6771837597) | Agente que lê treino, lembra contexto, avalia sessão, resume semana e conversa; não é tracker nem gerador de plano | **US$ 5,99/mês** ou **US$ 49,99/ano** nessa loja | Strava, Garmin ou Apple Health; o posicionamento diz “sem logging manual” | É o concorrente semântico mais próximo do Training Hub antigo, mas ainda tinha avaliações insuficientes para um resumo — existência da ideia, demanda ainda não comprovada |

### O que estes preços realmente provam

Os preços publicados provam que há ofertas, não que todas converteram ou retêm.
Os sinais mais fortes de willingness to pay são:

1. Runna combina assinatura paga com milhares de avaliações brasileiras, dezenas
   de milhares de avaliações globais e aquisição pela Strava.
2. RestOrTrain combina R$ 89,90/mês com adoção/reviews relevantes e linguagem de
   usuários que valorizam conversa, adaptação e análise profunda.
3. A própria App Store do Runna traz um review de comprador dizendo que a
   estrutura e o suporte valeram a assinatura anual; a mesma pessoa valoriza a
   presença humana quando o app parece automatizado.
4. Serviços brasileiros vendem acompanhamento online por valores muito maiores:
   [RT Run Team](https://rtrunteam.com.br/) cobra R$ 119,90/mês;
   [RunFun](https://www.zyla.fit/runfun) anuncia R$ 249/mês;
   [GPA](https://gpa.esp.br/corrida/) anuncia R$ 240/mês no anual; e o
   [Einstein](https://www.einstein.br/n/servicos/assessoria-de-corrida) anuncia
   R$ 450/mês. As páginas destacam personalização, revisão/ajustes, contato com o
   treinador e feedback — não apenas uma planilha.
5. Treinadores também pagam software: o
   [TrainingPeaks Coach Edition](https://www.trainingpeaks.com/pricing/for-coaches/)
   começa em **US$ 21,99/mês** e o
   [V.O2 Coach](https://new.vdoto2.com/vdot-coach) em **US$ 29,99/mês para até
   25 atletas**.

Isso sustenta uma hipótese de cobrança B2B, mas **não valida um preço do novo
produto**. Um piloto pago é necessário antes de construir a plataforma.

## Dores repetidas encontradas

### 1. “A semana real não cabe no plano”

Essa foi a dor mais repetida. Atletas querem reagir a trabalho, viagem, treino
perdido, sono, doença e cross-training sem destruir a lógica do bloco.

- Em uma [discussão de planos adaptativos](https://www.reddit.com/r/running/comments/1ad2a9c/adaptive_training_plans_whats_out_there_today/)
  de 2024, usuários relatam que Runna podia reorganizar dias, mas não reagia a
  uma semana sem atividades; outro descreve o TrainAsONE reconstruindo a semana
  com um longão inesperado de três horas no dia seguinte.
- No [fórum do AI Endurance](https://forum.aiendurance.com/t/ai-endurance-the-new-intervals-icu-atp-builder/66),
  em junho de 2026, um usuário diz que o algoritmo reduzia demais a intensidade
  por interpretar mal restrições de natação e variação de RHR; precisou negociar
  manualmente com o chat e pediu guardrails explícitos de filosofia de treino.
- No [fórum do Intervals.icu](https://forum.intervals.icu/t/athlete-weekly-availability-limitations-input/100187),
  treinadores pediram input estruturado de disponibilidade porque notas e chats
  eram manuais, inconsistentes e se perdiam. O Intervals implementou
  disponibilidade em março de 2026, então **um calendário de disponibilidade
  sozinho já não é uma oportunidade suficiente**.

**Leitura:** a lacuna não é gerar a planilha. É fechar o loop entre contexto,
intenção e decisão sem uma reescrita cega do plano.

### 2. Atletas pagam pelo feedback e pela adaptação, não por uma planilha genérica

- Em [“Running coach expectation”](https://www.reddit.com/r/running/comments/1aruag3/running_coach_expectation/),
  o autor pagava £70/mês e estava insatisfeito com treinos aparentemente
  genéricos; respostas enfatizam feedback rápido, check-in semanal e mudanças
  quando a vida interfere.
- Em [“Bad coaching experiences”](https://www.reddit.com/r/running/comments/1avwzmz/bad_coaching_experiences/),
  atletas reclamam de treinador que apenas replica um plano conhecido, não
  analisa, não dá crítica construtiva, não ouve dores/sensações e não explica o
  objetivo do treino.
- Um review público do Runna na
  [App Store do Reino Unido](https://apps.apple.com/gb/app/runna-running-plans-coach/id1594204443)
  valoriza a estrutura, o freio contra correr forte todo dia e o suporte humano
  quando o app parece automatizado.

**Leitura:** um agente que apenas escreve respostas entusiasmadas piora a dor. O
produto precisa preservar a voz, a decisão e a responsabilidade do treinador.

### 3. O workflow do treinador é fragmentado e operacional

- Em uma [thread de fevereiro de 2026](https://www.reddit.com/r/running/comments/1rbh6cm/what_do_you_actually_use_to_manage_your_athletes/),
  um treinador descreve planilhas + WhatsApp, cobrança de check-ins, reescrita
  de planos e perda de controle de quem fez o quê; respostas citam misturas de
  Google Sheets, TrainingPeaks, Intervals e Final Surge.
- Em maio de 2026, alguém no
  [fórum do Intervals.icu](https://forum.intervals.icu/t/can-athlete-comments-on-activities-be-read-via-api/129465)
  já tentava criar uma plataforma para automatizar feedback e chamou a leitura
  de comentários do atleta de transformadora para comunicação em escala.

**Leitura:** existe dor B2B, mas também existe gente construindo. A oportunidade
é estreita: **triagem e decisão com human-in-the-loop**, não substituir
TrainingPeaks/Intervals, nem ser outro CRM completo.

### 4. “Adaptativo” sem guardrails perde confiança

As reclamações se repetem em sentidos opostos: alguns sistemas prescrevem carga
demais, outros reduzem demais, e ambos parecem arbitrários. Athletica mantém o
agente em modo explicar/sugerir, RestOrTrain vende conversa e customização de
filosofia, e usuários do AI Endurance pedem guardrails que o motor não
sobrescreva.

**Leitura:** o produto deve mostrar:

- o que mudou desde a última decisão;
- qual intenção do plano está sendo preservada;
- qual regra/evidência sustentou a proposta;
- o que não sabe;
- quem aprovou;
- quando escalar para treinador ou profissional de saúde.

## Por que um MVP sem provider é cientificamente defensável — e onde para

Um check-in subjetivo não é apenas uma gambiarra para evitar OAuth:

- A [revisão sistemática de Saw, Main e Gastin](https://pubmed.ncbi.nlm.nih.gov/26423706/)
  encontrou que medidas subjetivas de bem-estar responderam a cargas agudas e
  crônicas com maior sensibilidade e consistência que medidas objetivas comuns.
  Os autores dizem que podem ser usadas sozinhas ou em abordagem mista.
- Um [estudo de implementação](https://pubmed.ncbi.nlm.nih.gov/25729301/)
  descreve questionários/diários como simples e econômicos, mas ressalta que
  adesão e qualidade dependem de acesso, timing, buy-in e reforço.
- O método session-RPE (duração × percepção de esforço) teve correlações
  significativas com métodos baseados em frequência cardíaca em
  [479 sessões de futebol](https://pubmed.ncbi.nlm.nih.gov/15179175/) e não exige
  equipamento caro. É evidência de praticidade do input, não autorização para
  prever lesão.
- O [consenso do IOC sobre carga e risco](https://pubmed.ncbi.nlm.nih.gov/27535989/)
  recomenda considerar carga de treino/competição, carga psicológica, bem-estar
  e lesão. Isso reforça que contexto humano importa, mas também que decisões de
  saúde são multidimensionais.

Limites obrigatórios:

- O produto não pode prometer detectar, prevenir, diagnosticar ou tratar lesão.
- Relato de dor, doença, sinais de alerta ou retorno de lesão deve interromper a
  automação e encaminhar para avaliação profissional conforme regras definidas.
- “Treinar ou descansar” não pode ser vendido como certeza médica.
- Self-report incompleto ou inconsistente precisa aparecer como limitação, não
  ser preenchido por inferência do modelo.

## Propostas priorizadas

Notas de 1 a 5: quanto maior, melhor. Em **risco**, 5 significa risco mais baixo.

| Proposta | Dor | WTP provável | Sem provider | Facilidade do MVP | Espaço competitivo | Risco | Total / 30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **1. Training Decision Inbox para coaches** | 5 | 4 | 5 | 4 | 3 | 3 | **24** |
| **2. Training Plan Workbench/Linter** | 4 | 3 | 5 | 5 | 4 | 3 | **24** |
| **3. Plan Rescue para atletas** | 4 | 3 | 5 | 5 | 2 | 3 | **22** |
| **4. Living Plan Agent para creators/coaches** | 3 | 4 | 5 | 4 | 3 | 3 | **22** |
| **5. Race Week Decision Pack** | 3 | 3 | 5 | 5 | 2 | 3 | **21** |
| **6. Treinador de endurance com IA genérico** | 4 | 4 | 1 | 2 | 1 | 2 | **14** |

As notas são avaliação de produto baseada nesta pesquisa, não medição de mercado.

### 1. Training Decision Inbox — recomendação

**Cliente pagante:** treinador autônomo ou pequena assessoria de corrida,
ciclismo ou triatlo com 10–50 atletas.

**Job to be done:** “Antes de mexer nas próximas semanas, mostre quais atletas
precisam da minha decisão, por quê, o que mudou e qual resposta/ajuste eu poderia
aprovar.”

**MVP:**

1. O treinador configura sua filosofia, limites e vocabulário em texto e adiciona
   o plano da semana por texto, PDF ou CSV.
2. O atleta recebe um link para check-in de 60 segundos: sessões feitas,
   duração, RPE, sono percebido, fadiga, dor, estresse, confiança, disponibilidade
   da próxima semana e observação livre.
3. A inbox ordena atletas por `sem ação`, `revisar` e `parar/escalar`.
4. Cada card mostra mudança, evidência, pergunta faltante, proposta limitada de
   ajuste e rascunho de resposta na voz do treinador.
5. O treinador aprova, edita ou rejeita e copia a resposta para o canal que já
   usa. O MVP **não envia WhatsApp**, não muda plano automaticamente e não dá
   conduta médica.
6. O histórico guarda a decisão, a justificativa, o texto aprovado e o que
   aconteceu no check-in seguinte.

**O que não construir no início:** sync de atividade, app móvel, player de
workout, gráficos de CTL/ATL, pagamentos ao atleta, marketplace, chat livre 24/7
ou um CRM completo.

**Por que alguém pagaria:** o produto reduz trabalho operacional justamente na
parte que sustenta o preço do coaching — personalização, atenção e feedback —
sem fingir substituir o profissional. A disposição a pagar B2B deve ser testada
contra o piso de US$ 21,99–29,99/mês dos softwares de coach e contra a receita
por atleta das assessorias, não assumida.

**Preço a testar, não validado:** R$ 99/mês para até 15 atletas ou R$ 199/mês
para até 50. Um piloto concierge de quatro semanas pode ser R$ 99 pagos antes do
início. Não criar plano gratuito ilimitado antes de provar uso semanal.

**Diferenciação defensável:** metodologia do treinador + memória de decisões +
triagem + aprovação. “Training theory RAG” sozinho é copiável; o histórico de
por que o treinador aprovou/rejeitou cada sugestão pode virar o dado proprietário
mais útil.

### 2. Training Plan Workbench/Linter — melhor wedge técnico

**Cliente:** coach que quer revisar uma semana/bloco antes de publicar e atleta
experiente que quer uma segunda leitura do plano que já escolheu.

**Job to be done:** “Mostre onde este plano entra em conflito consigo mesmo, com
minha agenda ou com as regras que eu disse seguir — sem substituí-lo por outro
plano gerado.”

**Inputs provider-independent:** plano em texto, PDF ou CSV; objetivo/prova;
baseline manual das últimas semanas; dias/tempo disponíveis; sessões fixas;
cross-training; restrições; regras do coach ou metodologia autorizada.

**Output do MVP:**

- calendário normalizado que o usuário confirma antes da análise;
- sessões sem intenção, intensidade ou progressão explicitadas;
- clusters de sessões exigentes e conflitos com descanso/cross-training;
- deltas de duração/volume mostrados como números, sem declarar um limite
  universal “seguro”;
- incompatibilidades entre plano, disponibilidade e objetivo;
- perguntas que faltam responder antes de executar;
- diff entre versão original e cenário ajustado, com rationale e fonte;
- exportação do plano revisado em PDF/CSV/ICS somente após aprovação.

**Evidência da lacuna:** usuários de TrainAsONE dizem reconstruir criativamente
o plano para evitar surpresas; usuários de AI Endurance pedem guardrails que o
motor não sobrescreva; atletas reclamam de planos copiados sem análise nem
explicação do porquê. Os produtos revisados se posicionam principalmente como
**geradores/adaptadores** (Runna, TrainAsONE, RestOrTrain, Athletica) ou
**analytics/builders** (RUNALYZE, Intervals), não como linter neutro de um plano
arbitrário. Isso é uma lacuna na amostra pesquisada, **não prova de mercado
vazio**.

**Monetização a testar:** R$ 29–59 por auditoria B2C ou incluído no plano B2B do
Decision Inbox. Como compra avulsa, a retenção é fraca; como primeiro módulo do
produto para coaches, ele reduz risco e gera um artefato concreto para demonstrar
valor.

**Por que é o melhor wedge técnico:** não exige atividade, histórico longitudinal,
integração, notificação nem comunicação externa; tem entrada e saída verificáveis;
e permite comparar sugestões do agente com decisões reais do treinador antes de
automatizar qualquer workflow.

### 3. Plan Rescue — melhor teste B2C rápido

**Cliente:** corredor com plano de Runna, Garmin, assessoria, livro, PDF ou
planilha que teve uma semana quebrada.

**Promessa:** “Não gere outro plano. Salve a semana sem perder a intenção do plano
que eu já escolhi.”

**Fluxo:** enviar/colar plano → explicar mudança de vida → responder 5–7 perguntas
de contexto → receber `manter`, `mover`, `reduzir`, `substituir` ou `perguntar ao
coach`, com explicação e incertezas.

**Monetização a testar:** R$ 19 por um rescue ou R$ 29/mês. O one-shot mede WTP
mais honestamente que uma lista de espera.

**Vantagem:** MVP muito pequeno e completamente manual-provider-free.

**Fraqueza:** baixa retenção e comparação imediata com ChatGPT. Só merece virar
produto se pessoas pagarem pela estrutura, memória, segurança e preservação do
plano — não pela qualidade de um texto isolado.

### 4. Living Plan Agent — plano vendido com suporte escalável

**Cliente pagante:** coach/creator que já vende planilhas, cursos ou blocos de
treino e não consegue responder cada exceção individual.

**Produto:** cada plano vem com um agente limitado àquele plano e à metodologia
autorizada pelo criador. Ele explica objetivo de sessões, coleta contexto,
responde dúvidas de baixo risco e encaminha exceções para o coach. O criador vê
perguntas recorrentes e lacunas do material.

**Modelo:** mensalidade B2B + adicional por atleta ativo ou revenue share do
add-on. O atleta compra confiança na pessoa/metodologia, não em “IA genérica”.

**Sinal e alerta:** o marketplace do TrainingPeaks já tem plano incluindo
[Alp AI Coach](https://www.trainingpeaks.com/training-plans/running/trail/tp-441697/goal-setting-mental-skills-training),
portanto o conceito existe. O espaço potencial é white-label em português e
workflow de escalada/aprovação, ainda não validado.

### 5. Race Week Decision Pack — produto transacional

**Cliente:** atleta a 7–14 dias de uma prova, com alta intenção e ansiedade.

**Input:** GPX, objetivo, histórico resumido, disponibilidade, equipamento,
restrições e plano existente. **Output:** pacing por trecho, prioridades da
semana, checklist, cenários `calor`, `chuva`, `atraso`, `meta A/B/C` e perguntas
para levar ao coach/nutricionista.

**Preço a testar:** R$ 29–59 por prova.

**Vantagem:** uso episódico e sem provider; RestOrTrain já prova interesse em
análise de GPX e preparação de prova.

**Fraqueza:** retenção baixa, risco elevado em pacing/fueling e concorrência de
ferramentas e conteúdo gratuitos. Serve melhor como lead magnet ou add-on, não
como pivot principal.

## O que eu não faria

1. **Não copiaria RestOrTrain para corrida.** RestOrTrain, Runna, TrainAsONE,
   Stridex, Athletica e AI Endurance já cobrem plano adaptativo/IA em diferentes
   níveis; RUNALYZE e AI Endurance já expõem agentes por MCP.
2. **Não faria um chat de training theory desacoplado de uma decisão.** ChatGPT e
   Claude já respondem perguntas genéricas; o valor vem do contexto, da memória,
   dos guardrails e do workflow.
3. **Não faria analytics manual como produto.** Intervals.icu custa US$ 4/mês e
   RUNALYZE começa grátis. Upload manual só funciona como meio para um outcome de
   alto valor.
4. **Não usaria “previne lesão” como promessa.** Além do risco, concorrentes já
   usam essa linguagem; uma promessa mais honesta é “expõe contexto e incerteza
   antes da decisão”.
5. **Não começaria por consumidor iniciante.** Runna e Stridex têm preços baixos,
   onboarding polido, tracking e execução no relógio; aquisição e retenção são
   mais difíceis que construir um protótipo.

## Plano de validação antes de pivotar o código

### Etapa 1 — cinco dias, zero integração

Recrutar **10 treinadores/assessorias** que hoje usem WhatsApp + planilha,
TrainingPeaks, Treinus, Final Surge ou Intervals. Não perguntar “você usaria
IA?”. Pedir a demonstração do último ciclo real:

- como chegam check-ins e mudanças de agenda;
- quanto tempo gastam por semana triando e respondendo;
- quais mensagens causaram mudança de plano;
- quais respostas nunca delegariam;
- qual erro seria motivo para cancelar;
- o que já pagam de software;
- se entregariam uma semana anonimizada para teste.

Critério para continuar: pelo menos **5 mostram o workflow**, **3 cedem um caso
anonimizado** e **2 aceitam pagar R$ 99 por um piloto de quatro semanas**. “Achei
legal” e lista de espera não contam.

### Etapa 2 — concierge pago, duas semanas

Usar formulário simples e produzir manualmente, com apoio do agente, os cards de
triagem e rascunhos. O coach aprova tudo. Medir:

- minutos por atleta antes/depois;
- percentual de drafts enviados sem edição, com edição e rejeitados;
- falsos alarmes e red flags perdidas;
- check-ins completados;
- decisões lembradas corretamente na semana seguinte;
- se o treinador renovaria e por qual preço.

Critério para produto: reduzir em **30%+** o tempo de triagem sem aumentar o
tempo de correção, nenhum draft de saúde enviado sem escalada e pelo menos **2 de
3 pilotos renovando pagos**. Os percentuais são metas de experimento, não
benchmarks de mercado.

### Etapa 3 — só então escolher a interface

Se o B2B falhar, testar Plan Rescue com 20 corredores e cobrança real de R$ 19.
Continuar apenas se ao menos 5 pagarem, 3 retornarem com uma segunda situação e
os usuários diferenciarem explicitamente o resultado de uma conversa gratuita
com ChatGPT.

## Riscos principais

| Risco | Como aparece | Limite proposto |
| --- | --- | --- |
| Saúde/lesão | Dor, doença, retorno de lesão e excesso de fadiga podem virar recomendação indevida | Regras determinísticas de `parar/escalar`; nada de diagnóstico; aprovação humana no B2B; revisão jurídica/profissional antes de lançamento |
| Alucinação e training theory conflitante | Literatura não determina uma única prescrição individual | Fontes versionadas, política explícita do coach, rationale visível, incerteza e perguntas faltantes; nunca inventar dados |
| LGPD e dados sensíveis | Check-ins podem conter saúde, sono, dor e rotina | Minimização, consentimento específico, retenção curta, exclusão/exportação, segregação por coach e proibição de usar dados para treino de modelo sem autorização |
| Perda da voz/relação humana | Feedback genérico ou “animado demais” destrói confiança | Draft, não auto-send; treinador aprova; aprender apenas com edições autorizadas; audit log |
| Baixa adesão | Self-report perde valor quando é longo ou sem retorno | Check-in de 60 segundos, timing consistente e mostrar ao atleta qual decisão o input produziu |
| Concorrente/plataforma copia | Intervals e TrainingPeaks já têm calendário, comentários e coaching | Não substituir calendário; aprofundar triagem, metodologia e memória de decisões; testar distribuição por assessorias locais |
| Copyright/metodologia | Upload de livros/cursos ou uso não autorizado de conteúdo | Aceitar somente material próprio/licenciado; registrar origem e direitos; não prometer “treinado em todos os livros” |
| Economia de LLM | Conversa longa e arquivos podem consumir a margem | Outputs curtos e estruturados, modelos por tarefa, limites por atleta e preço B2B antes de escala |

## Decisão recomendada

**Explorar, não implementar ainda, o Training Decision Inbox.** A tese é mais
interessante que um clone de RestOrTrain porque:

- escolhe um input naturalmente sem provider;
- vende para quem já paga software e recebe receita recorrente dos atletas;
- complementa, em vez de tentar substituir, TrainingPeaks/Intervals/Treinus;
- usa o conhecimento de training theory com uma decisão concreta;
- mantém o humano no controle, o que aparece repetidamente como parte do valor;
- permite um piloto concierge pago antes de uma reescrita grande do produto.

A unidade de valor não deve ser “uma análise” nem “uma conversa”. Deve ser:

> **uma decisão de treino contextualizada, explicável, aprovada e lembrada.**

O **Training Plan Workbench** é o primeiro módulo recomendado para provar essa
tese. O **Decision Inbox** é o produto recorrente que só deve ser construído se
coaches usarem o linter em casos reais e pagarem pela continuidade.

## Limitações desta pesquisa

- A dor foi validada por reviews, comunidades e fóruns, não por entrevistas
  primárias conduzidas com os compradores-alvo de Marcos.
- Preços e ratings mudam por região e data. Preço publicado não prova receita,
  retenção ou margem.
- Números de usuários das landing pages são autodeclarados. Onde havia números
  diferentes entre páginas, foi usado o número da homepage ou da App Store e
  evitada inferência de assinantes.
- Não foi feito sizing TAM/SAM/SOM. Nesta fase, duas renovações pagas ensinam mais
  que um mercado calculado sem canal validado.
- Não foi analisado o esforço de reaproveitamento técnico do checkout atual;
  esta nota avalia oportunidade, dor e wedge de produto.

## Fontes primárias consultadas

Todas acessadas em 2026-08-25.

### Produtos, preços e políticas

- [RestOrTrain — homepage](https://www.restortrain.com/)
- [RestOrTrain — FAQ](https://www.restortrain.com/faq)
- [RestOrTrain — App Store Brasil](https://apps.apple.com/br/app/restortrain/id6752621455)
- [RestOrTrain — fim do sync Strava em 2026-09-01](https://www.restortrain.com/strava)
- [Runna — pricing](https://www.runna.com/pricing)
- [Runna — App Store Brasil](https://apps.apple.com/br/app/runna-treinador-de-corrida/id1594204443)
- [Runna — aquisição pela Strava](https://www.runna.com/pt-br/strava-acquires-runna)
- [TrainAsONE — App Store Brasil](https://apps.apple.com/br/app/trainasone-ai-running-plans/id1541355896)
- [TrainAsONE — Google Play](https://play.google.com/store/apps/details?id=com.trainasone)
- [Stridex](https://www.stridex.com.br/)
- [Athletica — pricing e funcionamento](https://athletica.ai/pricing)
- [AI Endurance — pricing](https://aiendurance.com/en/pricing)
- [AI Endurance — FAQ e inputs](https://aiendurance.com/en/faq)
- [AI Endurance — MCP](https://aiendurance.com/docs/mcp)
- [RUNALYZE — produto e MCP](https://runalyze.com/)
- [RUNALYZE — pricing](https://runalyze.com/pricing)
- [Intervals.icu — pricing e upload direto](https://www.intervals.icu/pricing/)
- [Train Ultra — App Store](https://apps.apple.com/ar/app/train-ultra/id6771837597)
- [TrainingPeaks — pricing para coaches](https://www.trainingpeaks.com/pricing/for-coaches/)
- [V.O2 — pricing para coaches](https://new.vdoto2.com/vdot-coach)
- [TrainingPeaks — plano com Alp AI Coach](https://www.trainingpeaks.com/training-plans/running/trail/tp-441697/goal-setting-mental-skills-training)
- [RT Run Team — pricing](https://rtrunteam.com.br/)
- [RunFun — pricing](https://www.zyla.fit/runfun)
- [GPA — pricing](https://gpa.esp.br/corrida/)
- [Einstein — assessoria de corrida](https://www.einstein.br/n/servicos/assessoria-de-corrida)

### Linguagem de usuários e workflow

- [Reddit/running — adaptive training plans](https://www.reddit.com/r/running/comments/1ad2a9c/adaptive_training_plans_whats_out_there_today/)
- [AI Endurance Forum — guardrails, estresse de vida e filosofia](https://forum.aiendurance.com/t/ai-endurance-the-new-intervals-icu-atp-builder/66)
- [Intervals.icu Forum — disponibilidade semanal](https://forum.intervals.icu/t/athlete-weekly-availability-limitations-input/100187)
- [Reddit/running — expectativas de coaching](https://www.reddit.com/r/running/comments/1aruag3/running_coach_expectation/)
- [Reddit/running — experiências ruins com coaching](https://www.reddit.com/r/running/comments/1avwzmz/bad_coaching_experiences/)
- [Reddit/running — workflow de coaches](https://www.reddit.com/r/running/comments/1rbh6cm/what_do_you_actually_use_to_manage_your_athletes/)
- [Intervals.icu Forum — automação de feedback](https://forum.intervals.icu/t/can-athlete-comments-on-activities-be-read-via-api/129465)

### Training theory e limites

- [Saw, Main & Gastin — subjective self-report systematic review](https://pubmed.ncbi.nlm.nih.gov/26423706/)
- [Saw, Main & Gastin — implementation of athlete self-report](https://pubmed.ncbi.nlm.nih.gov/25729301/)
- [Impellizzeri et al. — session-RPE](https://pubmed.ncbi.nlm.nih.gov/15179175/)
- [IOC consensus — load and injury risk](https://pubmed.ncbi.nlm.nih.gov/27535989/)
