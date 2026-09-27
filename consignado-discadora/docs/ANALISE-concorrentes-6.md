# O que 3C Plus, JoyTec, Talkover, Native IP, Let's Call e ERA têm — e o nosso sistema não

Análise feita em 27/09/2026 a partir das páginas públicas dos seis (links no fim). Nosso estado foi
conferido no repositório, não de memória: `supabase/schema.sql` (34 functions, 14 tabelas),
`web/app/*` (9 rotas), `agent/` (agente Phone Link).

---

## 1. O que cada um é (uma frase cada)

| Quem | O que é | Base do que importa |
|---|---|---|
| **3C Plus** (3cplusnow.com) | Plataforma all-in-one de call center com **telefonia própria** (3C Voice): discador preditivo, receptivo, PABX, URA, SMS, WhatsApp, CRM e "Insights IA" | +1.000 empresas; descarte de improdutivas; modo spy com 3 opções; bina inteligente; renitência |
| **JoyTec** (joytec.com.br) | Sistema para **CORBAN/consignado** com robô "Titan" que atende, filtra e qualifica antes de passar ao vendedor; telefonia própria e **venda de base de contatos INSS/SIAPE** | "100% tecnologia própria"; CRM com esteira; **simulador de propostas**; gravação e monitoramento |
| **Talkover AI** (talkover.ai) | **Só agente de voz com IA**: chamadas automatizadas de entrada/saída, qualificação, agendamento, recuperação de vendas | usa Twilio/Vonage/Telnyx/SIP; integra HubSpot/Salesforce/Zendesk/GoHighLevel; transcrição + sentimento + analytics pós-chamada; LGPD declarado |
| **Native IP** (nativeip.com.br) | Operadora VoIP/PABX em nuvem com o módulo **Native Infinity** (discador) | preditivo com detecção de caixa postal/máquina; cobrança automática; URA que resolve 60% sem atendente; integração CRM/ERP |
| **Let's Call One** (letscall.io/br) | Call center **no navegador (WebRTC)**, preço de PME, com telefonia nativa, QA por IA e agentes de IA | R$99–249/agente/mês; numeração local por DDD e "bina correta"; gravação 100% + transcrição; **scripting com lógica condicional**; **detecção de desvio ao roteiro por IA**; DNC automático; campanhas híbridas outbound+inbound; **tem página dedicada a "Crédito Consignado"** |
| **ERA** (era.com.br) | Plataforma omnichannel (PABX em nuvem + WhatsApp API oficial + chatbot/IA), usada por Decathlon, Cobasi, Unimed | filas com skills; escuta/whisper; URA multinível; **+50 integrações de CRM/ERP**; métricas de resposta por atendente; mapa de calor semanal; discador preditivo como add-on |

**Leitura que importa antes da lista:** cinco dos seis são **plataformas de telefonia** (PBX/rotas próprias).
Quase todo o resto da diferença — gravação, preditivo, bina, whisper, URA, transcrição — nasce daí, não do
software de gestão. O nosso meio de discar é o **Phone Link** (sua decisão de stack), então parte dos gaps
abaixo **não é atraso de código: é arquitetura**. Está marcado como tal.

---

## 2. O que eles têm que a gente não tem

### A. Telefonia e canais — na maioria **travada pelo Phone Link**

| Recurso | Quem tem | Nosso estado | Dá para fechar no nosso stack? |
|---|---|---|---|
| Números **locais por DDD** e bina correta | Let's Call, 3C (bina inteligente), ERA | não existe | **Não** — Phone Link usa o chip do celular do operador |
| **Gravação** de 100% das chamadas | todos os 5 de telefonia | não existe | **Não** (política do Windows/iOS não entrega o áudio) |
| **Transcrição** + resumo automático da ligação | Let's Call, Talkover, 3C (Insights IA) | não existe | **Parcial** — só com áudio; dá para transcrever anotações, não o áudio |
| **Monitoramento ao vivo**: escutar, whisper (sussurrar), barge-in | 3C (modo spy 3 opções), JoyTec, Let's Call, ERA | não existe | **Não** |
| **Discador preditivo** com pacing (várias linhas por agente, algoritmo de ociosidade) | 3C, Native, Let's Call (Power/Progressive/Preview), ERA | nosso discador é **1 chamada por vez por operador** | **Não** no Phone Link; sim se entrar um PBX/SIP |
| **URA / IVR** receptivo e pós-atendimento | 3C, Native, ERA, JoyTec | não existe | **Não** |
| **Receptivo** com filas, skills, transbordo | 3C, ERA, Let's Call | não existe (recebemos a chamada no Phone Link, sem fila) | **Não** |
| **Multicanal**: SMS, e-mail, WhatsApp oficial, chat do site | 3C, Native, ERA, Let's Call | não existe | **Sim** — é integração de API (Meta/WhatsApp BSP, provedor SMS), não telefonia |
| Detecção/descarte de **caixa postal, número mudo, ocupado** | todos | nosso `cdr.disposition` é escolhido **pelo operador** (atendeu/secretaria/…) | **Parcial** — sem áudio/mídias não há como classificar sozinho; o agente pode classificar por duração+padrão |
| Chamadas **simultâneas** (N linhas por agente) | todos | 1 linha por PC | **Não** |

### B. Motor de campanha (aqui dá para copiar muito, é software puro)

| Recurso | Quem tem | Nosso estado | Como ficaria no nosso |
|---|---|---|---|
| **Cadência por disposição**: cada qualificação tem cor + comportamento próprio de re-discagem | 3C (por qualificação), Let's Call | a cadência existe e o claim respeita `proximo_contato_at` nos 3 ramos (schema.sql:503/525/544) — mas **um intervalo só por campanha** (`intervalo_retentativa_s`, schema.sql:105) e 3 ramos fixos no `fn_finish_call` — `cdr_disposition` tem 8 valores (schema.sql:18), então 5 deles herdam o intervalo genérico | tabela `politica_rediscagem (campanha, disposition, intervalo, max_tentativas, hora preferida)` lida no `fn_finish_call`, com o valor da campanha de fallback |
| **Regra de discagem por DDD** (e janela local) | 3C, Let's Call | janela única `America/Sao_Paulo` | `leads.ddd` + `campanhas.janela_local` e ordenar o claim por fuso (Brasil tem UTC-3/-4/-5) |
| **Renitência** inteligente (rechama no melhor horário do contato, não fixo) | 3C, Native | intervalo fixo | pontuar por taxa de atendimento histórica por hora do dia do lead |
| **Higienização de mailing** antes de discar (inválidos, inexistentes, operadora) | 3C (Filtro Inteligente), Let's Call (DNC), Native | validamos formato/CPF/opt-out no importador; **não** consultamos operadora/validade | validador de número (API paga) no `fn_importar_leads` + flag `inhigido` |
| **DNC automático** e lista de bloqueio **por tempo determinado** | Let's Call, 3C | `bloqueios` é **permanente** | coluna `expira_em` + liberação automática no claim |
| **Lead scoring** / priorização por propensão | Let's Call (distribuição por regra), Native (relatórios) | `prioridade` manual (smallint) | pontuar por margem, banco, idade do lead, tentativas, canal de consentimento |
| **Movimento de contato entre campanhas** ("2ª tentativa em 30 dias") | Let's Call | só `atribuir/liberar carteira` | `fn_mover_lead(p_lead, p_campanha)` com trilha |
| **Campanha híbrida** (outbound + inbound na mesma sessão) | Let's Call | não | depende de fila/URA → travado |
| **Distribuição automática de leads** por regra/disponibilidade | Let's Call, 3C | `fn_attribuir_carteira` só tem `p_agente` ou `p_modo='balanceado'` (schema.sql:900) — sem rodízio por skill/horário | `modo = 'regra'` com `jsonb` de pesos |
| **Callback agendado com notificação** | Let's Call, ERA | o agendamento **funciona**: `fn_agendar_retorno` (schema.sql:969) grava `proximo_contato_at` e o claim só libera o lead depois disso — falta **avisar** o operador na hora | Edge Function (cron) que notifica e dá bump de `prioridade` na janela |
| **Dashboard ao vivo** (KPIs e estado de cada agente em tempo real) | todos | recarregamos a página: nenhuma subscription em `web/` e nenhum `alter publication supabase_realtime` no schema | **Sim, fácil**: `supabase.channel(...).on('postgres_changes', …)` + habilitar as tabelas na publicação `supabase_realtime` |

### C. CRM e gestão

| Recurso | Quem tem | Nosso estado | Como ficaria |
|---|---|---|---|
| **Esteira/kanban de vendas** | JoyTec, 3C, Let's Call | temos `status` listado em `/leads`, sem kanban | `lead.status` já é o estágio; kanban é 1 componente com `fn_mover_lead` |
| **Formulário estruturado durante a ligação** | Let's Call | `obs` (texto livre) + `extras` (jsonb) na importação | `campanhas.formulario jsonb` (rótulos, opções, obrigatórios) + renderer no `/operador`, gravando em `leads.extras` |
| **Roteiro com lógica condicional** (mostra o passo certo conforme a resposta) | Let's Call (dinâmico), JoyTec (robô) | **acabamos de fazer** o roteiro com passos/objeções, mas é linear | `roteiro_passos.pai`/`mostra_se jsonb` + botão "resposta do cliente foi X" |
| **Simulador de proposta** (margem × parcelas → valor) | **JoyTec** (plano básico) | `fn_enviar_proposta` recebe valor/parcelas/taxa **digitados**; nenhum cálculo | `fn_simular_proposta(p_margem, p_parcelas, p_taxa)` com as regras do INSS (40/35%, 108×, carência 3 meses) |
| **Ficha 360º do cliente** (tudo de uma pessoa num lugar) | Let's Call ("visão 360º"), ERA | os dados existem (`lead_events`, `cdr`, `propostas`, checks) espalhados por tela | `/leads/[id]` montando a timeline |
| **Pesquisa de satisfação** (pós-atendimento) | 3C (URA pós), ERA | não | sem URA dá para fazer por SMS/WhatsApp, se adicionar canal |
| **Tickets/SAC** | Let's Call, ERA | não | tabela `tickets` — fora do caso de uso "captação" |
| **Metas, quebra de meta, ranking com alvo** | 3C, ERA, JoyTec (painel) | ranking do dia sem meta | `campanha.meta_diaria` e `aderência`/`conversão` contra meta |
| **Relatório de ligações improdutivas** (muda/ocupado/inválido como KPI) | 3C, Native | `v_painel_dia` já traz `taxa_contato_pct`, `efetivos_30s` e `curtas_suspeitas` (<3s), mas não a quebra por `disposition` | mais 2 colunas com `count(*) filter (where c.disposition in (…))` |
| **Exportar** CSV/XLSX do relatório | todos | não | rota `GET /api/relatorio.csv` (streaming) ou view + `npm` client |
| **Histórico mais longo / busca global** | ERA (30 dias de conversa), todos | buscamos por nome/telefone/CPF com paginação | ok — não é gap |

### D. IA e QA

| Recurso | Quem tem | Nosso estado | Observação |
|---|---|---|---|
| **Scorecard de QA** configurável + amostragem de ligações | Let's Call (add-on), 3C, Native | **temos o esqueleto**: `v_aderencia_roteiro` (devidos × marcados) | falta nota do supervisor por ligação (tabela nova `qa_avaliacoes`) e amostragem semanal |
| **Detecção de desvio ao roteiro por IA** | Let's Call | não | precisa de transcrição (áudio) → travado no Phone Link |
| **Análise de sentimento** | Let's Call, Talkover, 3C | não | idem |
| **Agente de voz autônomo** que atende/filtra/qualifica | **JoyTec (Titan), Talkover, Let's Call (AI Agents)** | não — e **aqui está a maior diferença de produto** | ver §3: em consignado, IA autônoma não pode fechar, mas pode qualificar |
| **Resumo pós-chamada escrito por IA** a partir das anotações | 3C (Insights), Talkover | não | **dá para fazer hoje** com o `nota` do CDR + passos marcados |

### E. Integração e plataforma

| Recurso | Quem tem | Nosso estado |
|---|---|---|
| **API aberta + webhooks** (sua operação empurra/puxa lead) | 3C, Let's Call, Talkover | **não temos nenhuma rota pública**: `web/app/api` não existe; entrada é o importador de planilha |
| Conectores prontos **HubSpot/Salesforce/RD/Pipedrive/GoHighLevel/Zapier/n8n** | Let's Call, Talkover, ERA (+50) | não — e é de propósito: nosso banco **é** o CRM |
| **Multi-empresa (org_id)** | Let's Call, ERA implícito | **não** — está como nota no roadmap ("multi-tenant depois") |
| **App de celular / PWA** para o operador | Let's Call ("navegador ou app incluídos") | não |
| SSO/SAML, 2FA, log de acesso por IP | players enterprise | só magic link do Supabase |
| Billing/planos por assento | todos | não (e não precisa: seu custo é Supabase + Vercel) |
| Onboarding por convite | todos | **temos** (`convidarOperador` + `definirAcesso`) |
| Trilha de auditoria de **decisões de gestão** | ninguém anuncia | **temos** (`auditoria_gestao`, com valor antes/depois) |
| Limite diário por operador e pausa controlada | ninguém anuncia | **temos** |
| Cobrança da **anuência INSS em 5 dias** no núcleo do produto | **ninguém** | **temos** (`v_anuencia_pendente`) |

### F. O que eles oferecem e você **não deve** copiar

1. **"Base de contatos INSS/SIAPE" vendida pronta** (JoyTec anuncia; outros fazem com "enriquecimento").
   É a origem do problema que a **Lei 15.327/2026** criou: benefício bloqueado, autorização **prévia,
   pessoal e específica** por operação. Lista comprada não tem consentimento válido por titular, e o
   nosso `fn_claim_next_lead` **recusa** lead sem consentimento registrado. Não dá para ligar isso no
   nosso sistema sem virar passivo de LGPD + reclamação no INSS.
2. **Fechar/confirmar contrato por WhatsApp ou mensagem** (fluxo de "reativação D+3" dos discadores).
   A IN 213/2026 mantém: não é aceita autorização por telefone/voz; o que fecha é a biometria no Meu INSS.
3. **Gravação sem aviso** — vários não mencionam o aviso de gravação. Se um dia houver áudio no meio,
   a mensagem de aviso tem de vir antes, e o roteiro precisa do campo.

---

## 3. Onde eles estão indo e a gente ainda não pensou

O padrão dos seis é **a ligação deixar de ser feita por humano**: JoyTec tem robô que filtra e entrega
"cliente pronto"; Talkover é 100% agente de voz; Let's Call oferece o agente "autônomo, copiloto ou
handoff com contexto". Mesmo no consignado — onde a **contratação** não pode ser fechada por voz — a
**qualificação** (confirmar titularidade, margem, intenção, agendar) já está sendo automatizada.

Isso é compatível com o nosso desenho? Sim, em uma faixa estreita:

* o agente de IA **pode** fazer a triagem e registrar `lead_events` + `qualificado`;
* o agente de IA **não pode** registrar proposta como se fosse consentimento, nem "fechar", nem pedir
  documento/senha — exatamente o que o nosso roteiro já proíbe no `aviso_compliance`.

Ou seja: o caminho de produto é nosso `fn_marcar_passo_roteiro` virar **saída de um robô**, com o humano
entrando só depois do "sim, quero a proposta". E o nosso gargalo real continua sendo o meio de discar:
sem PBX/SIP não há áudio, e sem áudio não há transcrição, QA, sentimento nem voz sintética —
** Phone Link é o teto dessas features, não o nosso código.**

---

## 4. Lista de compras, por esforço real no nosso repositório

| # | Fechar o gap | Esforço | Where |
|---|---|---|---|
| 1 | **Dashboard ao vivo** (Realtime em `v_monitor_equipe`/`v_ranking_dia`) | pequeno | `web/app/page.tsx` + `realtime` no schema |
| 2 | **Cadência por disposição** (tabela de política lida no `fn_finish_call`) | pequeno-médio | `schema.sql` + `/campanhas` |
| 3 | **Bloqueio com expiração** (`bloqueios.expira_em`) + DNN/higienização | pequeno | `schema.sql`, `lib/importador.ts` |
| 4 | **Simulador de proposta** com regras do INSS | pequeno | nova `fn_simular_proposta` + `/operador` |
| 5 | **Formulário estruturado por campanha** (`campanhas.formulario jsonb`) | médio | `schema.sql` + painel operador |
| 6 | **Webhook de entrada de leads** (formulário do site → `/api/leads` com token) | médio | nova rota + validação no servidor |
| 7 | **Kanban/esteira** + `fn_mover_lead` | médio | `/leads` |
| 8 | **Ficha 360º** por lead | médio | `/leads/[id]` |
| 9 | **Export CSV** dos relatórios | pequeno | rota de leitura |
| 10 | **Meta + aderência QA** (nota do supervisor por ligação, amostragem) | médio | `lead_roteiro_checks`/`qa_avaliacoes` |
| 11 | **Notificação de retorno/anuência** (cron avisando operador no dia) | médio | Edge Function + e-mail |
| 12 | Multi-tenant `org_id` | grande | todas as policies |
| — | Preditivo / gravação / URA / bina / whisper | **arquitectura nova** | exige PBX/SIP (Asterisk + gateway ou operadora) no lugar do Phone Link |

**Contra-argumento econômico que vale registrar:** Let's Call cobra **R$99–249 por agente/mês** (e os
outros cinco também são por assento + minutos). O nosso custo por operador é o plano de celular dele +
Supabase/Vercel. Com 10 operadores, "não ter gravação nem preditivo" custa ~R$1.000–2.500/mês a menos —
é esse o trade-off real, não o recurso em si.

---

## 5. Fontes

* 3C Plus: https://3cplusnow.com/ · https://3cplusnow.com/lp/call-center/ · https://3cplusnow.com/lp/solucoes-call-center/ · https://3cplusnow.com/call-center-discadora-preditiva-em-10-minutos/
* JoyTec: https://www.joytec.com.br/
* Talkover AI: https://talkover.ai/en
* Native IP: https://nativeip.com.br/ · https://nativeip.com.br/discador-automatico/
* Let's Call: https://letscall.io/br/campanhas/ · https://letscall.io/br/precos/ · https://letscall.io/br/ai-agents/ (cuidado ao pesquisar: existe também a letscall.pt, operadora de VoIP/SMS de Coimbra — homônima, não é o produto comparado aqui)
* ERA: https://era.com.br/ · https://era.com.br/planos · https://era.com.br/blog/o-que-e-discador-preditivo

---

## 6. O que dá para juntar agora (plano de porte)

Regra de triagem: **entra o que é software de gestão, fica de fora o que exige áudio/fila**. Os três
lotes abaixo não tocam no Phone Link nem no `agent/` — e cada item tem teste no harness
`web/scripts/testa-sql.mjs`, que hoje está em 118 asserções.

### Lote 1 — um dia, melhora o que o operador sente na hora

| # | O que entra | Onde mexe | Teste |
|---|---|---|---|
| 1 | **Painel ao vivo** (Realtime) | `alter publication supabase_realtime add table dial_jobs, agentes, lead_roteiro_checks` + `createChannel().on('postgres_changes')` em `web/app/page.tsx` e `/campanhas`; hoje não há nenhuma subscription (`grep` vazio) nem a publicação no schema | manual + `tsc` |
| 2 | **Cadência por disposição** | tabela nova `politica_rediscagem(campanha_id, disposition, intervalo_s, max_tentativas, hora_ini)`; `fn_finish_call` passa a lê-la com fallback em `campanhas.intervalo_retentativa_s`; editor na aba de campanha | seção 18 no harness: `ocupado` volta em 90 min, `numero_invalido` sai do ciclo, `whatsapp` vira retorno em 20 min, `secretaria` só no dia seguinte |
| 3 | **Bloqueio com vencimento + DNC no importador** | `alter table bloqueios add column expira_em timestamptz, add column origem text` (schema.sql:182); os 3 ramos do claim já usam `not exists (…)`, basta acrescentar a condição de prazo; `fn_importar_leads` conta "descartado por bloqueio/validade" | seção 19: bloqueio com `expira_em` no passado **volta** a ser discável |
| 4 | **Simulador de proposta** | `fn_simular_proposta(p_margem, p_parcelas, p_taxa)` com as travas do INSS (108 parcelas, carência de 3 meses, margem 40%/35%, sem seguro prestamista); pré-preenche o formulário do `/operador` quando `margem_estimada` existe; `fn_enviar_proposta` rejeita o que passar da margem | seção 20: 108× ok, 109× rejeita, BPC a 40% rejeita |
| 5 | **Export CSV dos relatórios** | rota `web/app/api/relatorios/export/route.ts` (a pasta `web/app/api` **não existe** hoje) lendo `v_painel_dia` e `v_aderencia_roteiro` com `private.pode` + botão em `/relatorios`; CSV puro com BOM (o `xlsx` foi banido do repo) | `npm run build` + teste de rota |

### Lote 2 — dois a três dias, é o "CRM" que eles vendem

6. **Formulário de tabulação por campanha** — `campanhas.formulario jsonb` (rótulos/opções/obrigatório)
   com renderer no `/operador` gravando em `leads.extras` (coluna já existe, `default '{}'::jsonb`, hoje
   só escrita pelo importador). Vale mais que kanban: é o campo que a conformidade exige (margem, banco,
   anuência, consentimento de gravação).
7. **`fn_mover_lead(lead, campanha, motivo)`** + kanban leve em `/leads` por `status` (o enum já é a
   esteira) — com trilha em `auditoria_gestao` via `private.registra_gestao`, que já existe.
8. **Ficha 360º `/leads/[id]`** — `lead_events` + `cdr` + `propostas` + `lead_roteiro_checks` +
   `bloqueios` numa timeline. *Já está no roadmap do README, item 2.*
9. **Distribuição por regra** — estender `fn_attribuir_carteira` (schema.sql:900 só conhece `balanceado`)
   com `p_modo='regra'` e pesos por `banco_folha`/`uf`.
10. **Meta + QA humano** — `campanhas.meta_diaria smallint` (nenhuma coluna `meta` no schema hoje) e
    `qa_avaliacoes(lead_id, avaliador_id, nota, comentarios)` legível só por supervisor/admin; na tela,
    amostra de 3 ligações/semana por operador com a nota ao lado da aderência do roteiro.

### Lote 3 — uma semana, e só se a operação crescer

11. **Webhook de entrada** `POST /api/leads` com token por campanha, idempotência por `ref_externa` e
    rate limit — é o "lead do site cai na fila em segundos" que o Let's Call vende como 5h→2min.
12. **Notificações** (retorno agendado, anuência `dias_restantes <= 1`) — exige escolher canal de
    entrega (e-mail via provedor externo ou push), portanto nova variável de ambiente.
13. **Multi-tenant `org_id`** — mexe em todas as policies; só quando houver a segunda empresa pagando.

### O que não entra, e por quê

* **Preditivo, gravação, transcrição, whisper/barge, URA, filas, bina por DDD, chamadas simultâneas** —
  todos os seis têm porque são **telefonia** (PBX/rotas próprias). Com Phone Link não há áudio nem fila:
  o caminho é o `asterisk` + gateway GSM do roadmap (item 3), que manteria o mesmo schema e usaria o
  `fn_finish_call` como boca do CDR. É decisão de arquitetura, não de sprint.
* **Base de contatos INSS/SIAPE "enriquecida"** (JoyTec vende), **fechamento por WhatsApp** (fluxo
  "D+3" do Let's Call) e **gravação sem aviso** — incompatível com a Lei 15.327/2026 e a IN 213/2026
  (autorização prévia por operação, biometria no Meu INSS, nada de telefone/procuração).
* **IA de voz atendendo sozinha** (JoyTec Titan, Talkover, Let's Call AI Agents) — é o único item grande
  da lista que dá para imaginar **sem** telefonia própria, mas não com Phone Link: precisa de áudio
  bidirecional. Fica para depois do item de arquitetura acima. Quando der, a regra de ouro já está
  escrita no nosso `roteiros.aviso_compliance`: a IA pode triar e registrar `qualificado`; não pode
  registrar proposta como consentimento nem "fechar".
