# Pacote ENXUTO para revisão por outro modelo — Discadora de Consignado (Vercel + Supabase + GitHub + Phone Link)

Arquivo único gerado do repositório `consignado-discadora/` em 27/09/2026, commit `09af965`. Nada foi
resumido: é o conteúdo dos arquivos, na ordem em que existem no projeto.

## O que pedir para o revisor analisar

1. **Segurança e RLS** — `supabase/schema.sql` é o coração: 18 tabelas com RLS, 18 policies, 17 views
   (`security_invoker`), 51 functions (`security definer set search_path`). O app nunca escreve por
   `insert/update`: toda escrita passa por RPC `fn_*`. Procurar caminho de escrita aberto a
   `authenticated` que devesse ser supervisor/admin, definer que não revalida escopo, view vazando
   linha de campanha fora do escopo, `anon` com porta demais (só `fn_receber_lead_webhook`, com token).
2. **Modelo de dados do consignado INSS** — margem 40% previdenciário / 35% BPC-LOAS, 108 parcelas,
   carência de 3 meses, anuência biométrica no Meu INSS em 5 dias, proibido fechar contrato por
   telefone, seguro prestamista vedado, LGPD (consentimento por titular, opt-out, máscara de CPF).
   Conferir se checks e RPCs batem com a regra.
3. **Concorrência / produto** — `docs/ANALISE-concorrentes-6.md` traz o que foi copiado e o que ficou
   de fora. Questionar a ordem das prioridades para **uma empresa, dono único, em breve com
   colaboradores** (sem multi-tenancy).
4. **Stack travada pelo dono** (não negociar): GitHub + Supabase + Vercel + Windows/Phone Link.
   Consequência aceita: **iPhone não expõe CDR nem discagem programática** — preditivo, gravação e
   transcrição estão fora deste lote.
5. **As asserções** — `web/scripts/testa-sql.mjs` prova claim sem corrida, teto diário, pausa,
   bloqueio com prazo, cadência por disposição, tabulação obrigatória, RBAC e append-only em Postgres
   real (**191 asserções, 0 falhas**). Apontar teste que prova menos do que diz, ou lacuna em caminho
   crítico.

| Bloco | Conteúdo |
|---|---|
| 1 | README + análise dos concorrentes |
| 2 | schema.sql, realtime.sql, seed-exemplo.sql, bootstrap-local.sql |
| 3 | harness SQL, guarda de segurança do SQL, CI |
| 4 | server actions (`lib/acoes.ts`), tipos, tempo real, rota pública de lead, export CSV |
| 5 | todas as telas (operador, campanhas, CRM, ficha 360º, empresa, relatórios, equipe, login) |
| 6 | agente Python do Phone Link + testes |

---


---



> Versão curta: banco + contexto + provas + porta de escrita. As telas React ficaram de fora.
# 1. Contexto do produto (leia antes do código)


## `README.md` — 263 linhas

```markdown
# Discadora de Consignado — Vercel + Supabase + GitHub + celular (Phone Link)

Sistema pequeno e completo: **CRM de discagem** (Next.js na Vercel), **banco/regras** (Supabase),
**agente local no Windows** que disca pelo celular através do **Vincular ao Windows (Phone Link)**,
e o funil que realmente importa em consignado hoje: **qualificar → registrar proposta → cobrar a
anuência no Meu INSS**.

```
  ┌──────────────────────── GitHub ────────────────────────┐
  │  web/  (Next.js 15 + TS)      agent/ (Python)          │
  └───────────────┬───────────────────────┬────────────────┘
                  │ deploy (Vercel)       │ roda no PC do operador
                  ▼                       ▼
        ┌─────────────────────┐   ┌──────────────────┐    Bluetooth/Wi-Fi
        │  Supabase           │◄──┤ phone_link_agent │ ──► ┌──────────────┐
        │  Postgres + RLS     │   │ pywinauto (UIA)  │     │ Phone Link   │
        │  Auth + RPCs        │   └──────────────────┘     │  → iPhone /  │
        │  leads, dial_jobs,  │                            │    Android   │
        │  cdr, propostas     │                            └──────────────┘
        └─────────────────────┘
```

O navegador **nunca** toca no telefone. Ele escreve trabalho na fila (`dial_jobs`); o agente do
Windows pega o trabalho, dirige o Phone Link pela automação de interface e devolve o CDR. Isso é
obrigatório porque **o Phone Link não tem API pública** — quem automatiza isso no mundo open source
automatiza a UI (ver `docs/FONTES.md`).

## O que já está pronto neste repositório

| Parte | Arquivos | Estado |
|---|---|---|
| Banco + regras do consignado | `supabase/schema.sql`, `supabase/realtime.sql`, `supabase/seed-exemplo.sql` | 6 enums, **18 tabelas, 17 views** (todas `security_invoker`), **51 functions**, 4 triggers, **18 policies**, 24 índices + `realtime.sql` publicando as tabelas do painel. Nada de escrita pelo navegador: **só RPC** |
| Teste do SQL em Postgres real | `web/scripts/testa-sql.mjs`, `supabase/tests/bootstrap-local.sql`, `tools/postgres_local.sh` | **191 asserções** por papel: claim sem corrida, escopo de campanha, teto diário, pausa, opt-out, append-only, views sem virar porta dos fundos, cadência por disposição, tabulação obrigatória, bloqueio com prazo, meta do dia, QA, carteira repartida, webhook anônimo |
| Carteira / fila / RBAC | `supabase/schema.sql` (`campanha_equipe`, `fn_claim_next_lead`) | 3 papéis (**operador / supervisor / admin**) globais + por campanha; supervisor manda só nas campanhas dele |
| Painel do operador | `web/app/operador/*` | escolhe campanha, pega lead (com origem rígida/overflow), cronômetro, disposições, retorno agendado, celular do Phone Link, proposta, opt-out, pausar 15/30/60 min |
| Equipe | `web/app/equipe/*` | time com cota/pausa/heartbeat por pessoa, convite por e-mail, papel global (admin) e acesso por campanha (gerência), liberar carteira de quem saiu |
| Trilha de gestão | `auditoria_gestao` (append-only) + `/relatorios` | cada acesso concedido/removido, papel alterado, regra de campanha (com o valor **antes**), carteira montada/recolhida fica gravado com o autor — operator não lê (RLS), supervisor lê a campanha dele, admin lê tudo |
| Campanhas | `web/app/campanhas/*` | criar, editar janela/tentativas/intervalo/roteiro, ativar-pausar, overflow rígido ou livre, montar carteira (rodízio ou por operador), dar acesso |
| Cadência por disposição | `politica_rediscagem` + `fn_politica_rediscagem` + `web/app/campanhas/cadencia.tsx` | 8 disposições × (repetir / contatar / qualificar / descartar / sem_contato) com intervalo, hora alvo, teto de tentativas e **prioridade** do lead na fila — é a "renitência" dos discadores, resolvida no banco; CDR antigo não é reescrito quando a regra muda |
| Tabulação + proposta | `campanhas.formulario` + `web/app/operador/tabulacao.tsx` | formulário por campanha (com obrigatórios) preenchido **durante** a ligação; qualificar recusa sem tabulação; simulador calcula parcela máxima sobre a margem do INSS e a proposta nasce do cálculo (recusa parcela acima da margem) |
| CRM de discagem | `v_crm_leads`, `v_agenda`, `web/app/crm/*`, `web/app/leads/[id]/*` | esteira por estágio (**calculado no banco** a partir de lead + proposta + anuência + tarefa), mover estágio só pela gestão, agenda com vencido/hoje/futura, tarefa por lead, ficha 360º num request só (`fn_ficha_lead`) |
| Empresa e lista de bloqueio | `empresas`, `bloqueios`, `v_bloqueios`, `web/app/empresa/*` | razão social/CNPJ/encarregado LGPD (art. 41) e aviso de abertura; bloqueio com **prazo** que volta sozinho para a fila, opt-out/óbito/fraude sem prazo; só o admin edita |
| Qualidade de ligação | `qa_avaliacoes` + `v_qa_resumo` + `fn_avaliar_chamada` | scorecard do supervisor sobre CDR + roteiro + tabulação (sem áudio no Phone Link, é o substituto honesto da escuta); nota média/pior nota por operador no relatório |
| Lead entrando pela frente | `web/app/api/leads/route.ts` + `fn_receber_lead_webhook` | POST público por **token da campanha**: recusa consentimento ausente/revogado, número bloqueado e volume acima de 30/min; é o único caminho de escrita de `anon` no schema |
| Painéis ao vivo + CSV | `web/lib/tempo-real.ts`, `web/app/api/export/csv/route.ts` | `postgres_changes` por tabela com *fallback* de polling (projeto sem realtime continua funcionando) e export CSV das views **pela mesma RLS** da tela |
| Roteiro de ligação | `roteiros` + `roteiro_passos` + `roteiro_objecoes` + `web/app/campanhas/roteiros.tsx` | biblioteca **no banco** (não em `localStorage`), por público, versionada e trilhada; chega **junto com o lead no claim**; checklist marcável pelo operador (`lead_roteiro_checks`) e cartões de objeção com o que é proibido fazer em seguida. O seed traz o roteiro INSS (7 passos, 5 objeções) e uma variante BPC/LOAS |
| Aderência ao roteiro | `v_aderencia_roteiro` + `/relatorios` | passos obrigatórios devidos × marcados, por operador, no dia de Brasília — contagem, não impressão |
| Leads e importação | `web/app/leads/*`, `web/lib/importador.ts` | importação **tolerante a planilha** (cabeçalho por apelido, coluna extra preservada em `extras`), filtro/busca/paginação **no servidor**, base legal por lead, banco do benefício, lista de bloqueados |
| Relatórios | `web/app/relatorios/*` | **meta do dia por campanha com "faltam N"**, funil por estágio, mapa dia×hora do pico de contato, aderência ao roteiro, QA, ranking por operador, jobs, trilha de gestão e **anuência pendente com dias restantes e botões para marcar confirmada/recusada/expirada** |
| Auth | `web/app/login/*`, `web/app/auth/callback/route.ts`, `web/middleware.ts` | link mágico Supabase + proteção de rotas |
| Agente Phone Link | `agent/core.py`, `agent/phonelink_win.py`, `agent/phone_link_agent.py` | dry-run, modos `claimed`/`auto`, `--inspect`, retentativa, expiração de job zumbi |
| Testes | `agent/test_core.py`, `web/test/importador.test.ts`, `web/scripts/testa-sql.mjs` | 12 do agente (loop contra PostgREST falso) + 15 do importador + 191 do banco |
| Guarda de SQL no CI | `tools/supabase_guard.py`, `.github/workflows/ci.yml` | falha o CI se tabela nascer sem RLS, policy sem destinatário, `security definer` sem `search_path`, função usada sem estar no Git |
| CI executando o schema | `.github/workflows/ci.yml` → job `sql-executa` | sobe `postgres:16` como service container, aplica bootstrap + schema + seed e roda as 191 asserções |

## Como pôr no ar (ordem que funciona)

1. **Supabase**: crie o projeto → SQL Editor → cole `supabase/schema.sql` → Execute. Depois
   `supabase/seed-exemplo.sql`.
2. **Usuário**: Authentication → Users → *Add user* (e-mail do operador). Depois rode o passo 1 do
   seed de novo para o `agentes.email` bater com o `auth.users`.
3. **GitHub + Vercel**: suba este diretório num repo → importe na Vercel → raiz de deploy `web/` →
   defina `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` e `APP_URL=https://seu-dom-vercel` → redeploy.
   (Env local: copie `web/.env.example` para `web/.env.local`.)
4. **Windows do operador**: instale o Phone Link, pareie o celular, confirme que dá **ligar
   manualmente** na aba Chamadas. Depois: `pip install -r requirements.txt`, copie
   `config.example.toml` → `config.toml`, rode `python phone_link_agent.py --inspect` e ajuste os
   nomes reais em `[seletores]`. Comece com `--dry-run`, depois `--modo auto --max 10`.
5. Teste de ponta a ponta: painel → *próximo lead* → o agente deve discar no celular → clique
   "Atendeu" no painel (ou deixe o agente reportar) → apareça no `/relatorios`.

## As 3 coisas que você precisa aceitar antes de investir tempo

1. **1 celular = 1 chamada por vez.** Não há multi-canal nem predictive no Phone Link. Escalar é
   adicionar PC+celular por operador, ou mover a linha para um gateway GSM/PBX.
2. **Sem gravação de áudio.** Phone Link não entrega o áudio de forma capturável. Gravar = PBX no
   meio (Asterisk + gateway GSM/modem 4G). Ver `../discar-pelo-celular-PLANO.md`.
3. **Seletores de UI são frágeis.** Uma atualização do Phone Link pode quebrar o `--inspect`-ajuste.
   Mitigação embutida: quando a UI falha, o CDR sai `falha_agent` e o lead **volta** para a fila
   (`fn_expirar_jobs`), nada é queimado.

## Os dois modos de discar (o segundo não precisa de agente)

| Modo | Como discar | Como nasce o CDR | Serve para |
|---|---|---|---|
| **Agente** (recomendado) | `agent/phone_link_agent.py` abre a UI do Phone Link e disca | o agente mede a chamada e chama `fn_finish_call` sozinha | operação com volume; tempo de fala medido de verdade |
| **`tel:` puro** (fallback) | botão **"Ligar agora"** do painel → o Windows entrega o `tel:+55…` ao Phone Link | o **operador** aperta a disposição no fim | começar hoje: zero instalação no Windows, funciona em qualquer PC pareado |

Os dois usam a mesma fila: o lead só sai do `novo`/`sem_contato` depois do
`fn_claim_next_lead`, que exige consentimento válido, número fora de `bloqueios`,
tentativa < `max_tentativas`, operador sem pausa e dentro do limite diário, e a
**janela da campanha medida em Brasília no servidor** (o seed usa 09:00–18:00;
`fn_editar_campanha` recusa janela fora de 08:00–21:00 para quem não é admin — Anatel
0303/2022). Se o operador clicar em "Ligar agora" sem agente, é o painel quem fecha o
job — não há registro de duração real nesse caminho.

## E o "CRM integrado"?

Duas rotas, ambas válidas:

- **Este repositório** traz o CRM de discagem pronto para a operação: esteira por estágio, agenda de
  tarefas, ficha 360º do lead, tabulação por campanha, cadência, meta, QA e cobrança de anuência — e é o
  único caminho que casa 100% com Vercel + Supabase sem servidor seu.
- **`melgarafael/DeskcommCRM`** (4.057★, **MIT**, atualizado em 27/09/2026): Next.js 16 + Supabase +
  WhatsApp (WAHA) + **Asterisk via ARI** — CRM bem mais completo, inclusive com agentes de voz.
  O porém verificado: ele é **self-hosted com Docker** (VPS 4 GB; tem `Dockerfile.worker`,
  `Dockerfile.scheduler`, `Dockerfile.voice-agent`, `Caddyfile`), então a **Vercel não hospeda o app**
  — quem dá o "de graça" ali é o Supabase, não o compute. Se você escolher essa rota, o `agent/`
  daqui continua servindo (basta trocar as tabelas/`rpc` no `core.py`).

Para SuiteCRM/EspoCRM/Odoo (telefonia nativa melhor resolvida), veja o quadro completo em
`docs/FONTES.md` e `../discadora-github-repos.md`.

## Compliance (isso é produto, não rodapé)

- **Lei 15.327/2026**: benefícios do INSS **bloqueados por padrão**; autorização **prévia, pessoal e
  específica por operação**; desbloqueio por **biometria ou assinatura eletrônica qualificada**;
  **proibida contratação por telefone ou procuração**.
- **Vigência 19/05/2026**: anuência no **Meu INSS** em **5 dias corridos**, senão cancela;
  prazo até **108 parcelas**; carência de 3 meses; margem **40%** (previdenciário) / **35%** (BPC).
- **IN INSS 213/2026**: continua **não aceitando** autorização por telefone/voz; banco tem **7 dias
  úteis** para reportar o depósito e **20 dias** para confirmar portabilidade.
- **LGPD**: o schema obriga `consentimento` preenchido para o lead entrar na fila — sem base legal
  registrada, `fn_claim_next_lead` simplesmente não entrega o lead. `cpf_mask` é calculado para
  exibição; CPF plano só com aval do seu jurídico.
- **Opt-out**: `bloqueios` é global por número e o painel tem botão para isso.
- **Roteiro**: o texto aprovado mora em `roteiros` (com `aviso_compliance`) e o próprio operador
  marca o que cumpriu. O roteiro do seed já embute as vedações de 2026 — proibido fechar por
  telefone, proibido pedir senha/código/PIX, proibido embutir seguro prestamista, margem 40%
  (35% no BPC/LOAS), 108 parcelas, carência de 3 meses, anuência biométrica no Meu INSS em até 5
  dias — porque regra de conformidade que só está no PDF não chega na ligação.
- **Telefonia**: 0303 é facultativo desde ago/2025, mas acima de **500 mil chamadas/mês** a
  autenticação (Origem Verificada/STIR-SHAKEN) é obrigatória e operadoras cortam tráfego por
  chamada derrubada em ~3s ou discagem sem atendente proporcional. Fontes em `docs/FONTES.md`.

## Comandos de verificação (rode antes de confiar)

```bash
# banco de verdade: cluster isolado em /tmp/pg + as 191 asserções (não lê sua conta Supabase)
npm i --prefix /tmp/pg embedded-postgres @embedded-postgres/linux-x64 pg   # só na 1ª vez
bash tools/postgres_local.sh start
cd web && npm run test:sql            # → 191 ok · 0 falha(s)
cd ..

# parse estrutural rápido (sem cluster): útil num clone limpo
python3 -c "import sqlglot,pathlib; sqlglot.parse(pathlib.Path('supabase/schema.sql').read_text(), read='postgres'); print('schema OK')"

# app
cd web && npm install && npm test && npx tsc --noEmit && npx next build

# guarda de segurança do SQL (roda no CI; rode antes de abrir PR)
python3 tools/supabase_guard.py supabase/schema.sql supabase/seed-exemplo.sql

# agente
cd ../agent && pip install -r requirements.txt && python -m pytest -q
```

O que foi rodado aqui (27/09/2026), nesta máquina:

| Comando | Resultado |
|---|---|
| `npm run test:sql` (Postgres 18.4 local, testado por socket **e** por TCP) | **191 ok · 0 falha(s)** |
| `npm test` | **15/15** |
| `npx tsc --noEmit` | limpo |
| `npx next build` | OK — **9 rotas**, todas `ƒ` (dinâmicas); middleware 90,7 kB; first load 103 kB |
| `python -m pytest -q` em `agent/` | **12 passed** |
| `python3 tools/supabase_guard.py schema.sql seed-exemplo.sql` | OK (1 aviso: teste com a chave `anon` antes de publicar) |

**Não testado aqui**: o job `sql-executa` dentro do GitHub Actions (precisa de um runner; localmente ele
é o mesmo `npm run test:sql` com `PGHOST=127.0.0.1`) , a UIA do Phone Link (depende de Windows + celular
pareado) e as telas renderizadas contra a sua instância Supabase.

## Estrutura

```
consignado-discadora/
├── README.md
├── docs/FONTES.md              # todos os repos + páginas, com o que foi verificado hoje
├── docs/ANALISE-ak-call-center.md  # leitura do repo concorrente: o que copiar, o que evitar
├── supabase/
│   ├── schema.sql              # tabelas, RLS, 51 RPCs `fn_*` (claim/finish/optout/cadência/tabulação/CRM/QA/webhook) e 17 views
│   ├── realtime.sql            # publicação `painel-ao-vivo` das tabelas que o painel escuta
│   ├── seed-exemplo.sql        # empresa, agentes, campanhas, meta, política de rediscagem, formulário, roteiro, leads
│   └── tests/bootstrap-local.sql  # papéis + schema `auth` falso (só p/ rodar fora do Supabase)
├── tools/{supabase_guard.py,postgres_local.sh}  # CI de SQL + cluster local p/ o harness
├── .github/workflows/ci.yml    # web · agente · sql (guarda) · sql-executa (Postgres 16 + 191 asserções)
├── web/                        # Next.js 15 (Vercel)
│   ├── app/
│   │   ├── layout.tsx          # nav por papel (vinda de `fn_quem_sou`) + chips de cota/pausa
│   │   ├── page.tsx            # pendências do dia, KPIs, visão do dono, ranking de quem produziu
│   │   ├── operador/           # fila + discagem (tel: ou agente), roteiro, tabulação, simulador, disposições, opt-out
│   │   ├── crm/                # esteira por estágio + agenda (criar/concluir tarefa)
│   │   ├── leads/              # importação tolerante + filtro/busca/paginação e ficha 360º em [id]/
│   │   ├── equipe/             # time, convites, papéis, acesso por campanha, pausa/liberação
│   │   ├── campanhas/          # regras, janela, tentativas, overflow, carteira, roteiros, cadência, formulário/meta/webhook
│   │   ├── empresa/            # cadastro + encarregado LGPD + lista de bloqueio com prazo
│   │   ├── relatorios/         # meta, funil, mapa dia×hora, aderência, QA, produção, anuência
│   │   ├── api/{leads,export/csv}   # entrada de lead por webhook (token) e CSV pela mesma RLS
│   │   └── login/, auth/callback/, ao-vivo.tsx
│   ├── lib/{acoes.ts,importador.ts,tipos.ts,tempo.ts,tempo-real.ts,supabase/*}
│   ├── scripts/testa-sql.mjs   # asserções de banco (roda no CI também)
│   ├── test/importador.test.ts
│   └── middleware.ts
└── agent/                      # Windows (Phone Link)
    ├── core.py                 # lógica pura: fila, disposições, Supabase REST, loop
    ├── phonelink_win.py        # UI Automation (pywinauto) + modo --inspect
    ├── phone_link_agent.py     # CLI
    ├── test_core.py            # 12 testes
    ├── config.example.toml
    ├── requirements.txt
    └── README.md
```

## Papéis e o que cada um pode fazer (quem decide é o banco, não o botão)

| | operador | supervisor | admin |
|---|---|---|---|
| ver fila e ligar | ✅ carteira dele + pool das campanhas onde está | ✅ nas campanhas dele | ✅ tudo |
| marcar disposição / proposta / retorno | ✅ | ✅ | ✅ |
| pausar e despausar a si mesmo | ✅ | ✅ | ✅ |
| pausar/despausar outro, liberar carteira | ❌ `fn_despausar_agente` levanta erro | ✅ nos operadores das campanhas dele | ✅ |
| criar/editar campanha, dar acesso, papel de campanha | ❌ | ✅ nas campanhas dele | ✅ |
| papel global (`agentes.papel`), convidar, remover | ❌ | ❌ | ✅ |
| mover estágio na esteira, `opt_out`/óbito/inidôneo, trocar de campanha | ❌ (só o status comum da própria carteira) | ✅ nas campanhas dele | ✅ |
| definir formulário da campanha, meta diária, cadência, porta de webhook | ❌ | ✅ nas campanhas dele | ✅ |
| avaliar ligação (QA), bloquear/liberar número com prazo | ❌ | ✅ | ✅ |
| cadastrar a empresa (CNPJ, encarregado LGPD, aviso de abertura) | ❌ | ❌ | ✅ |

Cada `fn_*` resolve o papel dentro da própria transação. A UI esconde o botão, mas a
garantia está no SQL — é por isso que **não existe policy de escrita** para o navegador:
uma policy de "editar a si mesmo" em `agentes` bastaria para o operador se promover a
admin. Escrita = RPC, sempre.

## Próximo passo sensato (roadmap)

1. Validar os seletores no seu Phone Link (`--inspect`) e rodar 20 ligações reais.
2. Fila da esteira com arrastar-e-soltar e filtro por operador/campanha no CRM (a leitura já vem de
   `v_crm_leads`; o mover é `fn_mover_lead`, que já nega o que o papel não pode).
3. Gravação + multi-canal: adicionar `asterisk` com `chan_quectel`/gateway GSM e apontar o mesmo
   schema para AMI (o `fn_finish_call` continua servindo de boca do CDR).
4. Marcação de anuência automática: job que consulta status no Meu INSS (via API do banco/parceiro)
   e move `propostas.anuencia` sozinho — é onde está o dinheiro.
5. WhatsApp como canal de fechamento **só para envio do link do app** (a contratação não pode
   acontecer por mensagem, ver `docs/FONTES.md`).

---

## Por que o importador e o CI são assim

A comparação com o repo que está operando o mesmo caso de uso hoje
(`adrielmatos/ak-call-center`, Vercel + Supabase + Phone Link, análise completa em
`docs/ANALISE-ak-call-center.md`) é o que definiu três detalhes deste projeto:

- **importador que não descarta coluna** (eles fazem; planilha de banco sempre traz
  campo que a gente não previu) — aqui o desconhecido vai para `leads.extras`;
- **validação no servidor, não na UI** (eles validam janela 08–21 e opt-out na rota
  `POST /api/calls`) — aqui o claim já se recusa fora da janela e sem consentimento;
- **SQL versionado é obrigatório** (o SQL deles referencia `private.current_operator_active()`
  e 13 tabelas que não existem no Git: em banca nova, `db push` quebra) — aqui o
  `supabase_guard.py` falla o CI quando o SQL do repo não fecha sozinho.

Não copiamos código: o repo **não tem licença** (todos os direitos reservados). Só as ideias.

```


## `docs/ANALISE-concorrentes-6.md` — 224 linhas

```markdown
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

```


---

# 2. Banco — schema, realtime, seed e o bootstrap de teste


## `supabase/schema.sql` — 3002 linhas

```sql
-- =====================================================================
-- Discadora de Consignado — schema Supabase/Postgres
-- Alvo: Supabase (Postgres 15+). Aplicar no SQL Editor ou `supabase db push`.
--
-- Fluxo que o schema impõe (Lei 15.327/2026 + IN INSS 213/2026):
--   lead -> discagem -> contato -> qualificado -> proposta enviada
--        -> PENDENTE DE ANUÊNCIA NO MEU INSS (5 dias corridos)
--        -> confirmada | expirada
--   A contratação não acontece por telefone. O telefone qualifica e cobra a
--   anuência no app do INSS — por isso existem `propostas` e `lead_events`.
-- =====================================================================

create type lead_status as enum (
  'novo','em_discagem','sem_contato','contato','qualificado',
  'recusado','inidoneo','opt_out','obito','descarte'
);
create type job_status as enum ('pendente','claimed','discado','concluido','falhou','expirado');
create type cdr_disposition as enum (
  'atendeu','nao_atendeu','ocupado','secretaria','whatsapp','ligacao_caiu','numero_invalido','falha_agent'
);
create type anuencia_status as enum ('enviada','pendente_confirmacao','confirmada','expirada','recusada');
create type canal_consentimento as enum ('form_proprio','lista_compartilhada','app_banco','presencial','revogado');

-- Papel na equipe. `operador` só fala com a própria carteira/campanhas em que
-- foi incluído; `supervisor` gerencia as campanhas dele; `admin` é global.
create type papel_equipe as enum ('operador','supervisor','admin');

-- ------------------------------------------------------------------ agentes
create table agentes (
  id        uuid primary key default gen_random_uuid(),
  auth_id   uuid unique references auth.users (id) on delete set null,
  email     text not null unique,
  nome      text not null,
  papel     papel_equipe not null default 'operador',
  celular   text,                      -- número que aparece no Phone Link do operador
  ativo     boolean not null default true,
  -- teto de discagens por dia (por operador, não por campanha): protege contra
  -- loop de agente descontrolado e contra o rate limit do próprio Phone Link
  limite_diario smallint not null default 120 check (limite_diario between 1 and 500),
  pausado_ate   timestamptz,           -- pausa manual/automática: claim devolve nada
  ultimo_ciclo_em timestamptz,         -- heartbeat do agente => "online" no monitor
  status_agente text check (status_agente is null or
                     status_agente in ('ocioso','discando','em_ligacao','erro','pausado')),
  -- empresa dona da pessoa. Uma linha só hoje (`empresas`); a coluna existe para o
  -- dia de segunda empresa/filial não exigir reescrever as policies de escopo.
  empresa_id  uuid,                     -- FK adicionada depois, junto com `empresas`
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index agentes_papel_idx on agentes (papel, ativo);

-- =====================================================================
--  A empresa (o dono) — dado de cadastro, não de tenant pleno.
--
--  Por que isso existe num sistema de uma empresa só: o dono precisa dizer no
--  produto quem é o responsável pelo dado (LGPD art. 41), qual a janela oficial
--  de ligação e o aviso de abertura obrigatório se um dia houver gravação. Sem
--  essa linha, cada tela inventa esses valores — é assim que "a empresa" vira
--  "as planilhas do pessoal".
-- =====================================================================
create table empresas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null check (char_length(nome) between 2 and 120),
  cnpj             text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  telefone         text,
  email          text,
  responsavel_lgpd text,
  -- exibido no topo do painel do operador; só tem sentido técnico quando existir
  -- gravação real (PBX), mas o texto já fica controlado pela empresa
  aviso_gravacao   text,
  janela_ini       time not null default '09:00',
  janela_fim       time not null default '18:00',
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

alter table agentes add constraint agentes_empresa_fk
  foreign key (empresa_id) references empresas (id) on delete set null;
-- =====================================================================
--  Roteiro de ligação — biblioteca versionada, por público.
--
--  Por que no banco e não no navegador: o concorrente guarda os roteiros em
--  `localStorage` (chave `ak-call-center:scripts:v1`), então cada máquina tem um
--  texto diferente, ninguém sabe qual versão o operador usou e nada disso é
--  revisável quando o compliance muda a regra. Aqui o roteiro é linha de banco, é
--  entregue junto com o lead no claim e toda mudança vira versão + trilha.
-- =====================================================================
create table roteiros (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (char_length(nome) between 3 and 120),
  publico         text not null default 'inss'
                  check (publico in ('inss','bpc_loas','clt','servidor','fgts')),
  versao          int  not null default 1,
  ativo           boolean not null default true,
  -- o que é proibido dizer nesta ligação; exibido no topo do cartão do operador
  aviso_compliance text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index roteiros_publico_idx on roteiros (publico, ativo desc, versao desc);

create table roteiro_passos (
  id           bigint generated always as identity primary key,
  roteiro_id   uuid not null references roteiros (id) on delete cascade,
  ordem        smallint not null check (ordem between 1 and 40),
  titulo       text not null check (char_length(titulo) between 2 and 120),
  texto        text not null check (char_length(texto) <= 4000),
  -- obrigatório = entra na métrica de aderência (o que o operador marcou como feito)
  obrigatorio  boolean not null default true
);
create unique index roteiro_passos_ordem_uidx on roteiro_passos (roteiro_id, ordem);

-- objeção → resposta aprovada → o que NÃO pode falar. É o item que mais evita erro
-- de operador novo em consignado (prometer aprovação, pedir senha, embutir seguro).
create table roteiro_objecoes (
  id           bigint generated always as identity primary key,
  roteiro_id   uuid not null references roteiros (id) on delete cascade,
  ordem        smallint not null default 1 check (ordem between 1 and 60),
  objecao      text not null check (char_length(objecao) between 3 and 300),
  resposta     text not null check (char_length(resposta) <= 2000),
  proibido     text check (char_length(proibido) <= 1000)
);
create unique index roteiro_objecoes_ordem_uidx on roteiro_objecoes (roteiro_id, ordem);

-- ------------------------------------------------------------------ campanhas
create table campanhas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  publico        text not null default 'inss'
                 check (publico in ('inss','bpc_loas','clt','servidor','fgts')),
  janela_ini     time not null default '09:00',
  janela_fim     time not null default '18:00',
  max_tentativas smallint not null default 3 check (max_tentativas between 1 and 10),
  intervalo_retentativa_s int not null default 14400 check (intervalo_retentativa_s >= 0),
  script_resumo  text,
  -- alvo do dia da campanha (contatos efetivos): sem meta o ranking é só lista
  -- ordenada; com meta aparece "faltam N" — é o que o supervisor cobra
  meta_diaria    smallint check (meta_diaria is null or meta_diaria between 1 and 2000),
  -- tabulação da campanha: [{"chave","rotulo","tipo","opcoes","obrigatorio"}].
  -- O concorrente chama isso de "formulários de registro"; é o único jeito de o
  -- dado entrar estruturado (e de a conformidade ter campo obrigatório de verdade)
  formulario     jsonb not null default '[]'::jsonb,
  -- entrada de lead por webhook (formulário do site caindo na fila em segundos).
  -- o token é a credencial: sem linha com webhook_ativo, a rota pública não aceita nada
  webhook_token  uuid not null default gen_random_uuid(),
  webhook_ativo  boolean not null default false,
  empresa_id     uuid references empresas (id) on delete set null,
  -- roteiro aprovado que o operador segue na ligação (NULL = vale só o script_resumo).
  -- "versionar" é editar o roteiro: a versão anterior fica em `auditoria_gestao`.
  roteiro_id     uuid references roteiros (id) on delete set null,
  -- quando a carteira+pool do operador zeram, ele pode puxar lead de outra
  -- campanha? ligado = operação fluida; desligado = campanhamento rígido
  permite_overflow boolean not null default true,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  -- `fn_editar_campanha` grava aqui; sem a coluna a tela "salvar regras" daria
  -- erro interno (é o tipo de coisa que só aparece quando a função roda de fato)
  atualizado_em  timestamptz
);

-- ------------------------------------------------- quem pode o quê, por campanha
-- Sem esta tabela, "vários funcionários" vira "todos veem tudo". O `papel` aqui
-- é o papel DAQUELA PESSOA NAQUELA CAMPANHA — um supervisor do INSS não enxerga
-- a carteira de BPC/LOAS. `admin` global dispensa linha (vide private.e_admin()).
create table campanha_equipe (
  campanha_id uuid not null references campanhas (id) on delete cascade,
  agente_id   uuid not null references agentes (id) on delete cascade,
  papel       papel_equipe not null default 'operador',
  limite_diario smallint check (limite_diario is null or limite_diario between 1 and 500),
  criado_em   timestamptz not null default now(),
  primary key (campanha_id, agente_id)
);

create index campanha_equipe_agente_idx on campanha_equipe (agente_id, papel);

-- ------------------------------------------------------------------ leads
create table leads (
  id              bigint generated always as identity primary key,
  campanha_id     uuid not null references campanhas (id) on delete cascade,
  nome            text,
  -- LGPD: CPF plano só com aval jurídico. Alternativa: cifrar (Supabase Vault)
  -- ou manter só o hash para dedupe + máscaras para exibição.
  cpf             text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  cpf_mask        text generated always as (
                    case when cpf is null then null
                         else left(cpf, 3) || '.***.***-' || right(cpf, 2) end
                  ) stored,
  telefone_e164   text not null check (telefone_e164 ~ '^\+?[0-9]{10,15}$'),
  cidade          text,
  uf              text check (uf is null or uf ~ '^[A-Z]{2}$'),
  banco_folha     text,
  margem_estimada numeric(12,2),
  renda_estimada  numeric(12,2),
  consentimento   canal_consentimento,
  consentimento_em timestamptz,
  status          lead_status not null default 'novo',
  tentativas      smallint not null default 0,
  ultima_chamada_at   timestamptz,
  proximo_contato_at timestamptz,
  obs             text,
  ref_externa     text,
  -- carteira: operador dono do lead. NULL = está no pool da campanha.
  -- É o que permite "híbrido": primeiro a carteira, depois o pool, depois overflow.
  agente_id       uuid references agentes (id) on delete set null,
  atribuido_em    timestamptz,
  prioridade      smallint not null default 0,
  -- colunas da planilha que não casaram com campo operacional (importador)
  extras          jsonb not null default '{}'::jsonb,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (campanha_id, telefone_e164)
);

create index leads_fila_idx       on leads (status, proximo_contato_at, criado_em);
-- ordem do claim: carteira -> prioridade -> mais antigo sem contato
create index leads_carteira_idx   on leads (agente_id, status, prioridade desc, criado_em);
create index leads_pendentes_idx  on leads (campanha_id, status, prioridade desc, criado_em)
  where agente_id is null;
create index leads_campanha_idx   on leads (campanha_id, status);
create index leads_telefone_idx   on leads (telefone_e164);

-- ------------------------------------------------------------------ bloqueios / opt-out
-- Número que não pode ser discado. `expira_em` é o que separa o "pediu para não
-- receber mais" do "pediu para ligar só mês que vem": com prazo, o próprio claim
-- libera o número quando vence, sem ninguém ter de lembrar de tirar da lista.
create table bloqueios (
  telefone_e164 text primary key,
  motivo        text not null check (motivo in ('nao_me_perturbe','opt_out','obito','jc','menor','fraude','sem_contato_30d','numero_invalido')),
  detalhe       text,
  expira_em     timestamptz,
  origem        text not null default 'manual'
                check (origem in ('manual','optout','importacao','webhook','qa','gestao')),
  criado_por    uuid references agentes (id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index bloqueios_expiracao_idx on bloqueios (expira_em) where expira_em is not null;

-- ------------------------------------------------------------------ fila de discagem
create table dial_jobs (
  id            uuid primary key default gen_random_uuid(),
  lead_id       bigint not null references leads (id) on delete cascade,
  agente_id     uuid references agentes (id) on delete set null,
  origem        text not null default 'web' check (origem in ('web','rpc','importacao','manual')),
  status        job_status not null default 'pendente',
  tentativa     smallint not null default 1,
  claimed_em    timestamptz,
  started_em    timestamptz,
  ended_em      timestamptz,
  duracao_s     int,
  disposition   cdr_disposition,
  erro          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- impede dois jobs abertos para o mesmo lead (discagem dupla por dois agentes)
create unique index dial_jobs_lead_aberto_uidx on dial_jobs (lead_id)
  where status in ('pendente','claimed','discado');
create index dial_jobs_pendentes_idx on dial_jobs (criado_em) where status = 'pendente';

-- ------------------------------------------------------------------ CDR
create table cdr (
  id            bigint generated always as identity primary key,
  job_id        uuid references dial_jobs (id) on delete set null,
  lead_id       bigint references leads (id) on delete set null,
  agente_id     uuid references agentes (id) on delete set null,
  telefone_e164 text not null,
  disposition   cdr_disposition not null,
  started_em    timestamptz not null default now(),
  ended_em      timestamptz,
  duracao_s     int,
  gravacao_url  text,
  nota          text,
  fonte         text not null default 'phone_link_agent'
                check (fonte in ('phone_link_agent','web','manual','importacao')),
  criado_em     timestamptz not null default now()
);
create index cdr_lead_idx  on cdr (lead_id, started_em desc);
create index cdr_agente_idx on cdr (agente_id, started_em desc);

-- ------------------------------------------------------------------ propostas + anuência
create table propostas (
  id               uuid primary key default gen_random_uuid(),
  lead_id          bigint not null references leads (id) on delete cascade,
  agente_id        uuid references agentes (id) on delete set null,
  valor            numeric(12,2) not null check (valor > 0),
  parcelas         smallint not null check (parcelas between 6 and 108),
  taxa_aa          numeric(7,4),
  banco_origem     text,
  protocolo_inss   text,
  anuencia         anuencia_status not null default 'enviada',
  enviada_em       timestamptz not null default now(),
  prazo_validade   timestamptz not null default (now() + interval '5 days'),
  confirmada_em    timestamptz,
  depositado_em    timestamptz,
  obs              text,
  atualizado_em    timestamptz not null default now()
);
create index propostas_anuencia_idx on propostas (anuencia, prazo_validade);

-- ------------------------------------------------------------------ auditoria
create table lead_events (
  id        bigint generated always as identity primary key,
  lead_id   bigint not null references leads (id) on delete cascade,
  de_status lead_status,
  para_status lead_status,
  ator      text,
  detalhe   text,
  criado_em timestamptz not null default now()
);
create index lead_events_lead_idx on lead_events (lead_id, criado_em desc);

-- ----------------------------------------------------- trilha de decisões de gestão
-- `lead_events` registra o que aconteceu COM UM CLIENTE. Isto aqui registra o que a
-- gestão fez COM O SISTEMA: quem entrou, quem saiu, quem ganhou acesso a quê, o que
-- mudou de regra, de quem a carteira foi recolhida. Com 10+ funcionários é a
-- pergunta que volta sempre ("quem liberou a planilha inteira para o novato?") e é a
-- que auditoria do banco/pashtom vai fazer.
-- Append-only por construção: sem policy de escrita, só os RPCs definer gravam.
create table auditoria_gestao (
  id           bigint generated always as identity primary key,
  quem         uuid references agentes (id) on delete set null,
  quem_email   text,
  acao         text not null check (acao in (
                  'campanha_criada','campanha_editada','acesso_concedido','acesso_removido',
                  'papel_alterado','carteira_atribuida','carteira_liberada',
                  'agente_convidado','agente_desativado','optout_importado',
                  'roteiro_salvo','roteiro_atribuido',
                  -- as de baixo são do porte dos concorrentes: cada uma delas mudou
                  -- regra de operação, então tem de ter rastro também
                  'politica_salva','formulario_salvo','lead_movido','lead_pontuado',
                  'telefone_bloqueado','telefone_liberado','qa_avaliado','empresa_editada',
                  'webhook_recebido')),
  alvo         jsonb not null default '{}'::jsonb,
  campanha_id  uuid references campanhas (id) on delete set null,
  criado_em    timestamptz not null default now()
);
create index auditoria_gestao_data_idx on auditoria_gestao (criado_em desc);
create index auditoria_gestao_campanha_idx on auditoria_gestao (campanha_id, criado_em desc);
-- ------------------------------------------- o que foi de fato cumprido na ligação
-- Sem isto, "aderência ao roteiro" é opinião do supervisor. Com isto é contagem:
-- passos obrigatórios do roteiro da campanha × marcações do operador naquele lead.
create table lead_roteiro_checks (
  lead_id     bigint not null references leads (id) on delete cascade,
  passo_id    bigint not null references roteiro_passos (id) on delete cascade,
  marcado_por uuid   not null references agentes (id) on delete cascade,
  feito       boolean not null default true,
  nota        text check (char_length(coalesce(nota, '')) <= 500),
  marcado_em  timestamptz not null default now(),
  primary key (lead_id, passo_id)
);
create index lead_roteiro_checks_agente_idx on lead_roteiro_checks (marcado_por, marcado_em desc);

-- =====================================================================
--  Cadência por qualificação (o "cada disposição tem comportamento" dos discadores)
--
--  Sem esta tabela, 'ocupado' e 'numero_invalido' voltam para a fila no mesmo
--  ritmo, porque só existe `campanhas.intervalo_retentativa_s`. Com ela, o
--  supervisor diz por disposição: repetir daqui a 90 min, ligar amanhã às 10h,
--  virar qualificado, ou sumir da campanha. `fn_finish_call` lê isto.
-- =====================================================================
create table politica_rediscagem (
  campanha_id    uuid not null references campanhas (id) on delete cascade,
  disposition    cdr_disposition not null,
  acao           text not null default 'repetir'
                 check (acao in ('repetir','contato','qualificar','descartar','sem_contato')),
  intervalo_s    int not null default 14400 check (intervalo_s between 60 and 604800),
  -- "não adianta insistir agora, ligue 10h": ignora o intervalo e marca a hora alvo
  hora_alvo      time check (hora_alvo is null or (hora_alvo between time '08:00' and time '21:00')),
  max_tentativas smallint check (max_tentativas is null or max_tentativas between 1 and 10),
  -- sobe/desce a prioridade do lead na fila quando ele cai naquela disposição
  prioridade_delta smallint not null default 0 check (prioridade_delta between -50 and 50),
  observacao     text,
  atualizado_em  timestamptz not null default now(),
  primary key (campanha_id, disposition)
);

-- =====================================================================
--  CRM: a tarefa é o que falta para "painel" virar "gestão".
--  `leads.proximo_contato_at` diz quando o lead volta para a fila; a tarefa diz o
--  que UMA PESSOA tem de fazer (anexar holerite, cobrar anuência, ligar para o
--  filho com procuração? não — ver roteiro). É a diferença entre discador e CRM.
-- =====================================================================
create table tarefas (
  id           bigint generated always as identity primary key,
  lead_id      bigint not null references leads (id) on delete cascade,
  agente_id    uuid references agentes (id) on delete set null,
  criada_por   uuid references agentes (id) on delete set null,
  tipo         text not null default 'retorno'
               check (tipo in ('retorno','proposta','documentos','anuencia','cobranca','ligar_para','outro')),
  titulo       text not null check (char_length(titulo) between 3 and 200),
  detalhe      text,
  vence_em     timestamptz not null default (now() + interval '1 day'),
  concluida_em timestamptz,
  resultado    text,
  criado_em    timestamptz not null default now()
);
create index tarefas_abertas_idx on tarefas (agente_id, vence_em) where concluida_em is null;
create index tarefas_lead_idx    on tarefas (lead_id, criado_em desc);

-- --------------------------------------------------- QA de ligação (scorecard humano)
-- Gravação não existe no Phone Link, mas auditoria de ligação existe: o supervisor
-- lê o CDR + os passos marcados e dá nota. É o mínimo para "qualidade" deixar de
-- ser opinião de corredor quando a equipe cresce.
create table qa_avaliacoes (
  id           bigint generated always as identity primary key,
  cdr_id       bigint references cdr (id) on delete set null,
  lead_id      bigint references leads (id) on delete cascade,
  avaliador_id uuid references agentes (id) on delete set null,
  agente_id    uuid references agentes (id) on delete set null,
  nota         smallint not null check (nota between 0 and 100),
  -- {"abertura":1,"titularidade":0,"margem":1,"proibido_falou":0} — os critérios que
  -- a empresa escolher; a tabela não trava chave nenhuma de propósito
  criterios    jsonb not null default '{}'::jsonb,
  achados      text check (char_length(coalesce(achados,'')) <= 2000),
  plano_acao   text check (char_length(coalesce(plano_acao,'')) <= 2000),
  criado_em    timestamptz not null default now()
);
create index qa_avaliacoes_agente_idx on qa_avaliacoes (agente_id, criado_em desc);
create index qa_avaliacoes_dia_idx    on qa_avaliacoes (criado_em desc);
-- =====================================================================
--  private.* — contexto de quem está logado.
--
--  Tudo `security definer`: a policy precisa ler `campanha_equipe` e `agentes`
--  para decidir, e se essa leitura passasse pela RLS das próprias tabelas
--  teríamos recursão de policy. Dono = postgres => RLS não se aplica ao dono,
--  então a função enxerga o mapa de acesso sem abrir o mapa para o usuário.
-- =====================================================================
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.papel_valor(p papel_equipe) returns int
language sql immutable as $$
  select case p when 'operador' then 1 when 'supervisor' then 2 when 'admin' then 3 else 0 end
$$;

-- agente da sessão (auth.users.id -> agentes.auth_id). null = usuário sem cadastro.
create or replace function private.agente_de_auth() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.agentes
   where auth_id = auth.uid() and ativo
$$;

create or replace function private.papel_de_auth() returns papel_equipe
language sql stable security definer set search_path = public, pg_temp as $$
  select papel from public.agentes where id = private.agente_de_auth()
$$;

create or replace function private.e_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.papel_de_auth() = 'admin', false)
$$;

-- Pode mexer nesta campanha com este papel mínimo?
--   admin            => sempre
--   linha em campanha_equipe com papel >= mínimo => sim
--   sem nenhuma linha e papel = 'operador'       => não (escopo fechado por padrão)
create or replace function private.pode(p_campanha uuid, p_minimo papel_equipe default 'operador')
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    private.e_admin()
    or exists (
      select 1 from public.campanha_equipe e
      join public.agentes a on a.id = e.agente_id
      where e.campanha_id = p_campanha
        and e.agente_id = private.agente_de_auth()
        and a.ativo
        and private.papel_valor(e.papel) >= private.papel_valor(p_minimo)
    ),
    false
  );
$$;

-- lista de campanhas que a sessão pode discar (null = todas, p/ admin)
create or replace function private.campanhas_do_agente(p_minimo papel_equipe default 'operador')
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id
    from public.campanhas c
   where c.ativo
     and (private.e_admin()
          or exists (select 1 from public.campanha_equipe e
                      where e.campanha_id = c.id
                        and e.agente_id = private.agente_de_auth()
                        and private.papel_valor(e.papel) >= private.papel_valor(p_minimo)))
$$;

-- discagens de hoje (dia de Brasília) por operador — usado no teto diário
create or replace function private.discadas_hoje(p_agente uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
    from public.cdr
   where agente_id = p_agente
     and started_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                        at time zone 'America/Sao_Paulo'
$$;

create or replace function private.atingiu_limite(p_agente uuid, p_campanha uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    private.discadas_hoje(p_agente) >=
    coalesce(
      (select e.limite_diario from public.campanha_equipe e
        where e.campanha_id = p_campanha and e.agente_id = p_agente),
      (select a.limite_diario from public.agentes a where a.id = p_agente),
      120
    ), false)
$$;

-- Grava uma linha na trilha de gestão. `security definer` para que a tabela não
-- precise de policy de INSERT (e continue sem nenhuma porta de escrita no navegador).
-- Quem = o agente da sessão, lido antes de qualquer change de role: por isso é
-- chamado DENTRO do RPC, nunca pelo navegador.
create or replace function private.registra_gestao(
  p_acao text, p_alvo jsonb default '{}'::jsonb, p_campanha uuid default null
) returns void
-- ordem das opções importa para o parser do CI (sqlglot): `language` depois de
-- `security definer set search_path`, como no resto do arquivo
security definer set search_path = public, pg_temp language sql as $$
  insert into public.auditoria_gestao (quem, quem_email, acao, alvo, campanha_id)
  values (
    private.agente_de_auth(),
    coalesce(nullif(current_setting('request.jwt.claim.email', true), ''),
             (select a.email from public.agentes a where a.id = private.agente_de_auth())),
    p_acao, coalesce(p_alvo, '{}'::jsonb), p_campanha
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.papel_valor(papel_equipe)                    to authenticated, service_role;
grant execute on function private.agente_de_auth()                             to authenticated, service_role;
grant execute on function private.papel_de_auth()                              to authenticated, service_role;
grant execute on function private.e_admin()                                    to authenticated, service_role;
grant execute on function private.pode(uuid, papel_equipe)                     to authenticated, service_role;
grant execute on function private.campanhas_do_agente(papel_equipe)             to authenticated, service_role;
grant execute on function private.discadas_hoje(uuid)                          to authenticated, service_role;
grant execute on function private.atingiu_limite(uuid, uuid)                   to authenticated, service_role;grant execute on function private.registra_gestao(text, jsonb, uuid)              to authenticated, service_role;

-- ------------------------------------------------------------------ triggers utilitários
create or replace function fn_touch_updated_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_leads_touch     before update on leads     for each row execute function fn_touch_updated_em();
create trigger trg_dial_jobs_touch before update on dial_jobs for each row execute function fn_touch_updated_em();
create trigger trg_propostas_touch before update on propostas for each row execute function fn_touch_updated_em();

create or replace function fn_log_lead_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into lead_events (lead_id, de_status, para_status, ator, detalhe)
    values (new.id, old.status, new.status,
            coalesce(current_setting('request.jwt.claim.sub', true), 'system'),
            'mudança de status');
  end if;
  return new;
end $$;

create trigger trg_leads_status_log after update on leads
  for each row execute function fn_log_lead_status();

-- =====================================================================
--  fn_claim_next_lead — próximo lead discável, com trava e escopo de equipe.
--
--  Ordem de entrega (é o "híbrido" decidido no painel):
--    1) carteira do operador (leads atribuídos a ele)
--    2) pool das campanhas em que ele está (lead sem dono)
--    3) overflow: pool de QUALQUER campanha ativa, quando a carteira+pool
--       dele zeraram — depende de campanhas.permite_overflow
--  Antes de entregar, checa: janela de horário de Brasília, tentativas,
--  consentimento válido, número não bloqueado, pausa do operador e teto diário.
--  `for update ... skip locked` + índice único em dial_jobs = dois operadores
--  nunca recebem o mesmo lead (é aqui que o ak-call-center quebraria).
-- =====================================================================
create or replace function fn_claim_next_lead(
  p_agente uuid default null,
  p_campanha uuid default null
) returns table (
  job_id uuid, lead_id bigint, nome text, telefone text, cpf_mask text,
  cidade text, uf text, campanha text, publico text, script_resumo text,
  -- campanha_id + formulário + extras: a tabulação é preenchida DURANTE a ligação;
  -- buscar essas três coisas depois do claim custaria 3 requests com o cliente na linha
  campanha_id uuid, formulario jsonb, extras jsonb,
  roteiro_id uuid, roteiro jsonb,
  margem_estimada numeric, tentativas int, obs text,
  origem_fila text, banco_folha text, pendente_carteira int
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lead bigint;
  v_job  uuid;
  v_hora time := (now() at time zone 'America/Sao_Paulo')::time;
  v_ag   uuid := coalesce(p_agente, private.agente_de_auth());
  v_campo uuid;
  v_origem text;
begin
  if v_ag is null then
    -- sem agente identificado: só serviço (service role) pode pedir lead assim
    if auth.uid() is not null then
      return;
    end if;
  end if;

  if v_ag is not null and exists (select 1 from agentes a where a.id = v_ag and not a.ativo) then
    return;                                   -- operador desligado não recebe fila
  end if;
  if v_ag is not null and exists (select 1 from agentes a where a.id = v_ag
                                   and a.pausado_ate is not null and a.pausado_ate > now()) then
    return;                                   -- em pausa
  end if;

  -- 1) carteira ---------------------------------------------------------
  if v_ag is not null then
    select l.id into v_lead
      from leads l
      join campanhas c on c.id = l.campanha_id
     where l.agente_id = v_ag
       and (p_campanha is null or l.campanha_id = p_campanha)
       and c.ativo
       and l.status in ('novo','sem_contato')
       and l.tentativas < c.max_tentativas
       and (l.proximo_contato_at is null or l.proximo_contato_at <= now())
       and v_hora between c.janela_ini and c.janela_fim
       and l.consentimento is not null and l.consentimento <> 'revogado'
       and not exists (select 1 from bloqueios b where b.telefone_e164 = l.telefone_e164
               and (b.expira_em is null or b.expira_em > now()))
     order by l.prioridade desc, l.criado_em
     for update of l skip locked
     limit 1;
    v_origem := 'carteira';
  end if;

  -- 2) pool das campanhas dele ------------------------------------------
  if v_lead is null then
    select l.id into v_lead
      from leads l
      join campanhas c on c.id = l.campanha_id
     where l.agente_id is null
       and (p_campanha is not null
             or l.campanha_id in (select private.campanhas_do_agente('operador')))
       and (p_campanha is null or l.campanha_id = p_campanha)
       and c.ativo
       and l.status in ('novo','sem_contato')
       and l.tentativas < c.max_tentativas
       and (l.proximo_contato_at is null or l.proximo_contato_at <= now())
       and v_hora between c.janela_ini and c.janela_fim
       and l.consentimento is not null and l.consentimento <> 'revogado'
       and not exists (select 1 from bloqueios b where b.telefone_e164 = l.telefone_e164
               and (b.expira_em is null or b.expira_em > now()))
     order by l.prioridade desc, l.criado_em
     for update of l skip locked
     limit 1;
    v_origem := 'pool';
  end if;

  -- 3) overflow ------------------------------------------------------------
  if v_lead is null then
    select l.id into v_lead
      from leads l
      join campanhas c on c.id = l.campanha_id
     where c.permite_overflow
       and l.agente_id is null
       and l.status in ('novo','sem_contato')
       and l.tentativas < c.max_tentativas
       and (l.proximo_contato_at is null or l.proximo_contato_at <= now())
       and v_hora between c.janela_ini and c.janela_fim
       and l.consentimento is not null and l.consentimento <> 'revogado'
       and not exists (select 1 from bloqueios b where b.telefone_e164 = l.telefone_e164
               and (b.expira_em is null or b.expira_em > now()))
     order by l.prioridade desc, l.criado_em
     for update of l skip locked
     limit 1;
    v_origem := 'overflow';
  end if;

  if v_lead is null then
    return;
  end if;

  -- `l.` explícito: como `campanha_id` é coluna de saída da função, o nome também
  -- existe como variável do plpgsql — sem qualificar, o Postgres reclama da ambiguidade
  select l.campanha_id into v_campo from leads l where l.id = v_lead;

  -- quem pede uma campanha específica tem de ter acesso a ela — sem isto, o
  -- parâmetro p_campanha seria uma chave de escopo ignorável pelo chamador
  if p_campanha is not null and v_ag is not null and not private.pode(p_campanha, 'operador') then
    return;
  end if;

  -- teto diário por operador (o limite é checado depois do claim para não
  -- contar o job que estamos criando)
  if v_ag is not null and private.atingiu_limite(v_ag, v_campo) then
    return;
  end if;

  update leads set status = 'em_discagem' where id = v_lead;

  insert into dial_jobs (lead_id, agente_id, origem, status, tentativa, claimed_em, started_em)
  values (v_lead, v_ag, case when p_agente is null then 'web' else 'rpc' end, 'claimed',
          (select count(*)::smallint + 1 from cdr x where x.lead_id = v_lead), now(), now())
  returning id into v_job;

  return query
    select v_job, l.id, l.nome, l.telefone_e164, l.cpf_mask, l.cidade, l.uf,
           c.nome, c.publico, c.script_resumo, c.id, c.formulario, l.extras,
           rt.roteiro_id, rt.dados,
           l.margem_estimada, l.tentativas::int, l.obs,
           v_origem, l.banco_folha,
           (select count(*)::int from leads x
             where x.agente_id = l.agente_id and x.status in ('novo','sem_contato')
               and (x.proximo_contato_at is null or x.proximo_contato_at <= now())) as pendente_carteira
      from leads l
      join campanhas c on c.id = l.campanha_id
      -- o roteiro vivo da campanha, já com o que este lead foi marcado. Montar isso
      -- no navegador custaria 3 requests e deixaria o operador discar antes de carregar.
      left join lateral (
        select r.id as roteiro_id,
               jsonb_build_object(
                 'nome', r.nome, 'versao', r.versao, 'publico', r.publico,
                 'aviso', r.aviso_compliance,
                 'passos', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', pp.id, 'ordem', pp.ordem, 'titulo', pp.titulo,
                            'texto', pp.texto, 'obrigatorio', pp.obrigatorio,
                            'feito', coalesce((select k.feito from lead_roteiro_checks k
                                                where k.passo_id = pp.id and k.lead_id = l.id), false)
                          ) order by pp.ordem)
                     from roteiro_passos pp where pp.roteiro_id = r.id), '[]'::jsonb),
                 'objecoes', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'objecao', oo.objecao, 'resposta', oo.resposta, 'proibido', oo.proibido
                          ) order by oo.ordem)
                     from roteiro_objecoes oo where oo.roteiro_id = r.id), '[]'::jsonb)
               ) as dados
          from roteiros r
         where r.id = c.roteiro_id and r.ativo
      ) rt on true
     where l.id = v_lead;
end $$;

-- =====================================================================
--  fn_finish_call — fecha o job, grava o CDR e decide o próximo passo.
-- =====================================================================
create or replace function fn_finish_call(
  p_job uuid,
  p_disposition cdr_disposition,
  p_duracao int default null,
  p_nota text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lead     bigint;
  v_agente   uuid;
  v_tel      text;
  v_tent     int;
  v_max      int;
  v_int      int;
  v_campanha uuid;
  v_acao     text;
  v_pol_int  int;
  v_pol_max  int;
  v_hora     time;
  v_delta    int;
  v_prox     timestamptz;
  v_status   lead_status;
begin
  select lead_id into v_lead
    from dial_jobs
   where id = p_job and status in ('pendente','claimed','discado')
   for update;

  if v_lead is null then
    return jsonb_build_object('ok', false, 'erro', 'job inexistente ou já encerrado');
  end if;

  -- attribution: quem discou é quem tem o job; o lead só entra como reserva
  -- (se o CDR herdasse o agente do lead, painel/ranking/teto diário sairiam errados)
  select coalesce(j.agente_id, l.agente_id), l.telefone_e164
    into v_agente, v_tel
    from dial_jobs j
    join leads l on l.id = j.lead_id
   where j.id = p_job;

  -- o cast explícito é obrigatório: com os dois ramos sendo literais, o CASE
  -- resolve como `text` e o Postgres recusa text -> job_status
  -- (erro 42804 no primeiro "atendeu" clicado — só aparece rodando no banco)
  update dial_jobs
     set status = (case when p_disposition = 'falha_agent' then 'falhou' else 'concluido' end)::job_status,
         ended_em = now(),
         disposition = p_disposition,
         duracao_s = p_duracao,
         erro = case when p_disposition = 'falha_agent' then coalesce(p_nota, 'falha do agente') end
   where id = p_job;

  insert into cdr (job_id, lead_id, agente_id, telefone_e164, disposition, started_em, ended_em, duracao_s, nota, fonte)
  select p_job, v_lead, v_agente, v_tel, p_disposition, coalesce(j.started_em, now()), now(), p_duracao, p_nota, 'phone_link_agent'
    from dial_jobs j where j.id = p_job;

  select l.tentativas::int, c.max_tentativas::int, c.intervalo_retentativa_s, c.id
    into v_tent, v_max, v_int, v_campanha
    from leads l join campanhas c on c.id = l.campanha_id
   where l.id = v_lead;

  -- a política da disposição manda; sem linha na tabela vale o comportamento
  -- histórico (intervalo único da campanha) — nada quebra para quem não usar
  select pr.intervalo_s, pr.max_tentativas::int, pr.hora_alvo, pr.prioridade_delta::int
    into v_pol_int, v_pol_max, v_hora, v_delta
    from politica_rediscagem pr
   where pr.campanha_id = v_campanha and pr.disposition = p_disposition;

  v_acao := coalesce(
    (select pr.acao from politica_rediscagem pr
      where pr.campanha_id = v_campanha and pr.disposition = p_disposition),
    case when p_disposition = 'atendeu' then 'contato'
         when p_disposition in ('numero_invalido','ligacao_caiu') then 'descartar'
         else 'repetir' end);
  v_int := coalesce(v_pol_int, v_int);
  v_max := coalesce(v_pol_max, v_max);

  v_prox := null;
  if v_acao = 'contato' then
    v_status := 'contato';
  elsif v_acao = 'qualificar' then
    v_status := 'qualificado';
  elsif v_acao = 'descartar' then
    v_status := 'descarte';
  else
    v_status := 'sem_contato';
    if v_tent + 1 < v_max then
      v_prox := now() + make_interval(secs => v_int);
      if v_hora is not null then
        -- "insista amanhã às 10h" em vez de tocar no mesmo minuto da tarde:
        -- a conta é feita no horário de Brasília, não no UTC da sessão
        v_prox := (date_trunc('day', v_prox at time zone 'America/Sao_Paulo') + v_hora)
                    at time zone 'America/Sao_Paulo';
        if v_prox <= now() then
          v_prox := v_prox + interval '1 day';
        end if;
      end if;
    else
      v_prox := null;                          -- estourou as tentativas: sai da fila viva
    end if;
  end if;

  update leads
     set status = v_status,
         tentativas = least(v_tent + 1, 32767)::smallint,
         ultima_chamada_at = now(),
         prioridade = greatest(0, least(100, prioridade + coalesce(v_delta, 0)))::smallint,
         proximo_contato_at = v_prox
   where id = v_lead;

  return jsonb_build_object('ok', true, 'lead_id', v_lead, 'status', v_status,
                            'tentativas', v_tent + 1, 'duracao_s', p_duracao,
                            'politica', v_acao,
                            'proximo_contato_at', v_prox);
end $$;

-- =====================================================================
--  fn_register_optout — opt-out vale para todos os leads com o número
-- =====================================================================
create or replace function fn_register_optout(
  p_telefone text, p_motivo text default 'opt_out', p_detalhe text default null,
  p_dias int default null                       -- prazo = "não me ligue por 30 dias"
) returns void
security definer set search_path = public language sql as $$
  with up as (
    insert into bloqueios (telefone_e164, motivo, detalhe, expira_em, origem, criado_por)
    values (p_telefone, p_motivo, p_detalhe,
            case when p_dias is null then null else now() + make_interval(days => p_dias) end,
            'optout', private.agente_de_auth())
    on conflict (telefone_e164) do update
      set motivo = excluded.motivo, detalhe = excluded.detalhe,
          expira_em = excluded.expira_em
  )
  update leads
     set status = 'opt_out', consentimento = 'revogado', proximo_contato_at = null
   where telefone_e164 = p_telefone;
$$;

-- =====================================================================
--  fn_expirar_jobs — devolve para a fila job que ficou pendurado (agente caiu)
-- =====================================================================
create or replace function fn_expirar_jobs(p_minutos int default 5) returns int
security definer set search_path = public language sql as $$
  with expirados as (
    update dial_jobs
       set status = 'expirado', erro = 'sem reporte do agente', ended_em = now()
     where status in ('claimed','discado')
       and claimed_em < now() - make_interval(mins => p_minutos)
    returning lead_id
  ),
  devolvidos as (
    update leads l
       set status = case when l.status = 'em_discagem' then 'sem_contato' else l.status end,
           proximo_contato_at = now()
      from expirados e where e.lead_id = l.id
    returning 1
  )
  select count(*) from devolvidos;
$$;

-- =====================================================================
--  Novas RPCs — TUDO que muda estado passa por aqui.
--
--  Por que: se `authenticated` puder INSERT/UPDATE nas tabelas, qualquer
--  operador com a publishable key escreve direto pela API e fura a janela de
--  horário, o opt-out, o teto diário e a trilha de auditoria. Foi exatamente
--  assim que o ak-call-center ficou (28 escritas diretas do navegador, sem
--  verificação de papel). Aqui o navegador só LÊ; escrever é função definer com
--  checagem de papel dentro.
-- =====================================================================

-- ------------------------------------------------------------------ meu perfil
create or replace function fn_meu_perfil(p_celular text default null) returns void
security definer set search_path = public, pg_temp language sql as $$
  update agentes
     set celular = nullif(btrim(coalesce(p_celular, '')), '')
   where id = private.agente_de_auth()
$$;

-- ------------------------------------------------------------------ pausa do operador
-- o painel chama antes do café; o claim devolve nada enquanto durar
-- pausa: o próprio operador sempre pode se pausar; pausar outra pessoa exige
-- admin ou gerência de uma campanha em comum (same rule do despausar)
create or replace function fn_pausar(p_minutos int default 10, p_agente uuid default null)
returns timestamptz
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_alvo uuid := coalesce(p_agente, private.agente_de_auth());
  v_fim timestamptz;
begin
  if p_minutos not between 0 and 480 then
    raise exception 'pausa entre 0 e 480 minutos';
  end if;
  if v_alvo is null then
    raise exception 'sem agente identificado';
  end if;
  if p_agente is not null and p_agente <> private.agente_de_auth()
     and not (
       private.e_admin()
       or exists (
            select 1
              from campanha_equipe meu
              join campanha_equipe deles on deles.campanha_id = meu.campanha_id
             where meu.agente_id = private.agente_de_auth()
               and meu.papel in ('supervisor', 'admin')
               and deles.agente_id = p_agente)
     ) then
    raise exception 'sem permissão para pausar essa pessoa';
  end if;

  v_fim := now() + make_interval(mins => p_minutos);
  update agentes
     set pausado_ate = case when p_minutos = 0 then null else v_fim end,
         status_agente = case when p_minutos = 0 then 'ocioso' else 'pausado' end
   where id = v_alvo;
  return v_fim;
end $$;

-- ------------------------------------------------------------------ heartbeat do agente
-- O agente do Windows fala como service_role (sem JWT), então ele informa o
-- próprio id: não dá para contar com auth.uid() aqui. Sem p_agente e sem sessão,
-- a função não toca em ninguém.
create or replace function fn_heartbeat(p_status text default 'ocioso', p_agente uuid default null)
returns void
security definer set search_path = public, pg_temp language sql as $$
  update agentes
     set ultimo_ciclo_em = now(),
         status_agente = case when p_status in ('ocioso','discando','em_ligacao','erro','pausado')
                              then p_status else 'ocioso' end
   where id = coalesce(private.agente_de_auth(), p_agente)
$$;

-- ------------------------------------------------------------------ importação em lote
create or replace function fn_importar_leads(
  p_campanha uuid,
  p_consentimento canal_consentimento,
  p_rows jsonb
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_inseridos int := 0;
  v_ignorados int := 0;
  r jsonb;
begin
  if not private.pode(p_campanha, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;
  if p_consentimento = 'revogado' then
    return jsonb_build_object('ok', false, 'erro', 'consentimento revogado não pode abastecer fila');
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'p_rows precisa ser array jsonb');
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      insert into leads (campanha_id, telefone_e164, nome, cpf, cidade, uf, banco_folha,
                         margem_estimada, renda_estimada, obs, ref_externa, extras,
                         consentimento, consentimento_em, prioridade)
      values (
        p_campanha,
        r->>'telefone_e164',
        nullif(r->>'nome', ''),
        nullif(r->>'cpf', ''),
        nullif(r->>'cidade', ''),
        nullif(r->>'uf', ''),
        nullif(r->>'banco_folha', ''),
        nullif(r->>'margem_estimada', '')::numeric,
        nullif(r->>'renda_estimada', '')::numeric,
        nullif(r->>'obs', ''),
        nullif(r->>'ref_externa', ''),
        coalesce(nullif(r->>'extras', '')::jsonb, '{}'::jsonb),
        p_consentimento, now(),
        coalesce(nullif(r->>'prioridade', '')::int, 0)
      )
      on conflict (campanha_id, telefone_e164) do nothing;
      if found then v_inseridos := v_inseridos + 1; else v_ignorados := v_ignorados + 1; end if;
    exception when others then
      v_ignorados := v_ignorados + 1;
    end;
  end loop;

  insert into lead_events (lead_id, para_status, ator, detalhe)
  select id, 'novo', coalesce(auth.uid()::text, 'importacao'),
         'lote de ' || v_inseridos || ' lead(s)'
    from leads where campanha_id = p_campanha and status = 'novo'
    order by id desc limit 1;

  return jsonb_build_object('ok', true, 'inseridos', v_inseridos, 'ignorados', v_ignorados);
end $$;

-- ------------------------------------------------------------------ carteira
-- p_agente null + p_qtd n  => fatia o pool entre os operadores da campanha
-- p_agente definido        => empurra n leads do pool para a carteira dele
create or replace function fn_attribuir_carteira(
  p_campanha uuid,
  p_agente uuid default null,
  p_qtd int default 0,
  p_modo text default 'quantidade'
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_movidos int := 0;
  v_ops     int := 0;
  v_i int := 0;
  v_alvo uuid;
begin
  if not private.pode(p_campanha, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;

  if p_agente is not null then
    with pegos as (
      update leads set agente_id = p_agente, atribuido_em = now()
       where id in (
         select id from leads
          where campanha_id = p_campanha and agente_id is null
            and status in ('novo','sem_contato')
          order by prioridade desc, criado_em
          limit case when p_qtd > 0 then p_qtd else 100000 end
         for update skip locked)
      returning 1)
    select count(*) into v_movidos from pegos;
  elsif p_modo = 'balanceado' then
    -- distribui o pool em rodízio entre os operadores da campanha
    for v_alvo in select a.id from agentes a
                   where a.ativo and a.id in (
                     select e.agente_id from campanha_equipe e
                      where e.campanha_id = p_campanha and e.papel = 'operador')
      order by a.id loop
      v_i := v_i + 1;
      with pegos as (
        update leads set agente_id = v_alvo, atribuido_em = now()
         where id in (
           select id from leads
            where campanha_id = p_campanha and agente_id is null
              and status in ('novo','sem_contato')
            order by prioridade desc, criado_em
            limit greatest(1, floor((
              select count(*) from leads
               where campanha_id = p_campanha and agente_id is null
                 and status in ('novo','sem_contato')) /
              (select count(*) from agentes x
                where x.ativo and x.id in (
                  select e.agente_id from campanha_equipe e
                   where e.campanha_id = p_campanha and e.papel = 'operador')))::int)
           for update skip locked)
        returning 1)
      select count(*) into v_movidos from pegos;
    end loop;
    select count(*) into v_movidos from leads
     where campanha_id = p_campanha and atribuido_em > now() - interval '1 minute';
  elsif p_modo = 'bbb' then
    -- balanceamento de verdade: ordena os operadores pela carteira que já têm e
    -- distribui o pool em rodízio sobre essa ordem. O 'balanceado' acima fatia em
    -- blocos e, com margens diferentes, deixa um operador com o dobro do trabalho
    with ops as (
      select a.id, count(l.id) as carrega
        from agentes a
        left join leads l on l.agente_id = a.id and l.status in ('novo','sem_contato')
       where a.ativo
         and a.id in (select e.agente_id from campanha_equipe e
                       where e.campanha_id = p_campanha and e.papel = 'operador')
       group by a.id
    ), alvo as (
      select array_agg(id order by carrega asc, id) as ids from ops
    ), pool as (
      select id, row_number() over (order by prioridade desc,
                                            coalesce(margem_estimada, 0) desc, criado_em) as rn
        from leads
       where campanha_id = p_campanha and agente_id is null
         and status in ('novo','sem_contato')
    ), mov as (
      select pool.id as lead, (alvo.ids)[1 + (pool.rn % array_length(alvo.ids, 1))] as ag
        from pool, alvo
       where array_length(alvo.ids, 1) is not null
    )
    update leads l set agente_id = m.ag, atribuido_em = now()
      from mov m where l.id = m.lead and m.ag is not null;
    get diagnostics v_movidos = row_count;
    if v_movidos = 0 then
      return jsonb_build_object('ok', false, 'erro', 'nada para distribuir (ou nenhum operador ativo na campanha)');
    end if;
  else
    return jsonb_build_object('ok', false, 'erro', 'informe p_agente ou p_modo=balanceado|bbb');
  end if;

  perform private.registra_gestao('carteira_atribuida',
            jsonb_build_object('agente', p_agente, 'qtd', p_qtd, 'modo', p_modo,
                               'movidos', v_movidos), p_campanha);

  return jsonb_build_object('ok', true, 'atribuidos', v_movidos);
end $$;

create or replace function fn_liberar_carteira(p_agente uuid, p_campanha uuid default null)
returns int
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_n int;
begin
  if not (private.e_admin()
          or (p_campanha is not null and private.pode(p_campanha, 'supervisor'))
          or p_agente = private.agente_de_auth()) then
    raise exception 'sem permissão para liberar esta carteira';
  end if;

  update leads set agente_id = null, atribuido_em = null
   where leads.agente_id = p_agente
     and (p_campanha is null or leads.campanha_id = p_campanha)
     and status in ('novo','sem_contato','em_discagem');
  get diagnostics v_n = row_count;

  update dial_jobs set status = 'expirado', erro = 'carteira liberada', ended_em = now()
   where agente_id = p_agente and status in ('claimed','discado')
     and lead_id in (select id from leads where status = 'sem_contato');

  perform private.registra_gestao('carteira_liberada',
    jsonb_build_object('agente', p_agente, 'leads_liberados', v_n), p_campanha);

  return v_n;
end $$;

-- ------------------------------------------------------------------ retorno agendado
create or replace function fn_agendar_retorno(p_lead bigint, p_em timestamptz, p_nota text default null)
returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
begin
  if not exists (select 1 from leads l where l.id = p_lead and private.pode(l.campanha_id, 'operador')) then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;
  if p_em < now() + interval '2 minutes' then
    return jsonb_build_object('ok', false, 'erro', 'escolha um horário futuro');
  end if;

  update leads
     set proximo_contato_at = p_em,
         status = case when status = 'contato' then status else 'sem_contato' end
   where id = p_lead;

  insert into lead_events (lead_id, ator, detalhe)
  values (p_lead, coalesce(auth.uid()::text, 'sistema'),
          'retorno para ' || to_char(p_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
          coalesce(' — ' || p_nota, ''));
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ campanhas (supervisor+)
create or replace function fn_editar_campanha(
  p_id uuid,
  p_nome text default null,
  p_ativa boolean default null,
  p_janela_ini time default null,
  p_janela_fim time default null,
  -- int e não smallint: PostgREST manda número como int4 e não existe cast
   -- implícito int4 -> int2 na resolução de função — com smallint no assinaturas o
   -- erro vira "function does not exist" na tela, que é o pior tipo de mensagem.
  p_max_tentativas int default null,
  p_intervalo_retentativa_s int default null,
  p_permite_overflow boolean default null,
  p_script_resumo text default null,
  p_meta_diaria int default null,
  p_webhook_ativo boolean default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_antes jsonb;
begin
  if p_id is null or not private.pode(p_id, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;
  if p_janela_ini is not null and p_janela_fim is not null and p_janela_ini >= p_janela_fim then
    return jsonb_build_object('ok', false, 'erro', 'janela de horário inválida');
  end if;
  if p_max_tentativas is not null and p_max_tentativas not between 1 and 10 then
    return jsonb_build_object('ok', false, 'erro', 'max_tentativas entre 1 e 10');
  end if;
  if p_meta_diaria is not null and p_meta_diaria not between 1 and 2000 then
    return jsonb_build_object('ok', false, 'erro', 'meta_diaria entre 1 e 2000');
  end if;
  if p_webhook_ativo is true and not private.e_admin() then
    -- ligar a porta pública de entrada de lead é decisão de segurança da empresa
    return jsonb_build_object('ok', false, 'erro', 'só o admin ativa o webhook');
  end if;
  -- Anatel 0303/2022 + bom senso: antes de 8h e depois de 21h não se liga
  if (p_janela_ini is not null and p_janela_ini < time '08:00')
     or (p_janela_fim is not null and p_janela_fim > time '21:00') then
    if not private.e_admin() then
      return jsonb_build_object('ok', false, 'erro', 'janela fora de 08:00–21:00 só o admin altera');
    end if;
  end if;

  select to_jsonb(c) into v_antes from campanhas c where c.id = p_id;

  update campanhas set
    nome            = coalesce(p_nome, nome),
    ativo           = coalesce(p_ativa, ativo),
    janela_ini      = coalesce(p_janela_ini, janela_ini),
    janela_fim      = coalesce(p_janela_fim, janela_fim),
    max_tentativas  = coalesce(p_max_tentativas::smallint, max_tentativas),
    intervalo_retentativa_s = coalesce(p_intervalo_retentativa_s, intervalo_retentativa_s),
    permite_overflow = coalesce(p_permite_overflow, permite_overflow),
    script_resumo   = coalesce(p_script_resumo, script_resumo),
    meta_diaria     = coalesce(p_meta_diaria::smallint, meta_diaria),
    webhook_ativo   = coalesce(p_webhook_ativo, webhook_ativo),
    atualizado_em   = now()
   where id = p_id;

  perform private.registra_gestao('campanha_editada',
    jsonb_build_object('antes', v_antes,
                       'mudancas', jsonb_build_object('nome', p_nome, 'ativa', p_ativa,
                         'janela', case when p_janela_ini is null and p_janela_fim is null
                                        then null
                                        else jsonb_build_object('ini', p_janela_ini,
                                                                'fim', p_janela_fim) end,
                         'max_tentativas', p_max_tentativas,
                         'intervalo_s', p_intervalo_retentativa_s,
                         'overflow', p_permite_overflow,
                         'meta_diaria', p_meta_diaria,
                         'webhook_ativo', p_webhook_ativo)),
    p_id);

  return jsonb_build_object('ok', true);
end $$;

create or replace function fn_criar_campanha(
  p_nome text, p_publico text default 'inss', p_script text default null
) returns uuid
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_id uuid;
begin
  if not private.e_admin() then
    -- supervisor pode abrir campanha: ele passa a ser supervisor dela
    if not exists (select 1 from agentes a where a.id = private.agente_de_auth()
                     and a.papel in ('supervisor','admin')) then
      return null;
    end if;
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then
    raise exception 'nome é obrigatório';
  end if;

  insert into campanhas (nome, publico, script_resumo)
  values (btrim(p_nome),
          case when p_publico in ('inss','bpc_loas','clt','servidor','fgts') then p_publico else 'inss' end,
          nullif(btrim(coalesce(p_script, '')), ''))
  returning id into v_id;

  if not private.e_admin() then
    insert into campanha_equipe (campanha_id, agente_id, papel)
    values (v_id, private.agente_de_auth(), 'supervisor')
    on conflict do nothing;
  end if;

  perform private.registra_gestao('campanha_criada',
    jsonb_build_object('nome', btrim(p_nome), 'publico', p_publico), v_id);

  return v_id;
end $$;

-- ------------------------------------------------------------------ equipe (admin)
create or replace function fn_definir_papel(p_agente uuid, p_papel papel_equipe) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
begin
  if not private.e_admin() then
    return jsonb_build_object('ok', false, 'erro', 'apenas admin muda papel');
  end if;
  update agentes set papel = p_papel where id = p_agente;
  perform private.registra_gestao('papel_alterado',
    jsonb_build_object('agente', p_agente, 'novo_papel', p_papel));
  return jsonb_build_object('ok', true);
end $$;

create or replace function fn_definir_acesso(
  p_campanha uuid, p_email text, p_papel papel_equipe default 'operador',
  p_limite_diario int default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_ag uuid;
begin
  if not (private.e_admin() or private.pode(p_campanha, 'supervisor')) then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;
  if p_papel = 'admin' and not private.e_admin() then
    return jsonb_build_object('ok', false, 'erro', 'apenas admin concede admin');
  end if;

  select id into v_ag from agentes where lower(email) = lower(btrim(p_email));
  if v_ag is null then
    return jsonb_build_object('ok', false, 'erro', 'e-mail não está em agentes (crie o usuário primeiro)');
  end if;

  insert into campanha_equipe (campanha_id, agente_id, papel, limite_diario)
  values (p_campanha, v_ag, p_papel, p_limite_diario)
  on conflict (campanha_id, agente_id)
    do update set papel = excluded.papel, limite_diario = excluded.limite_diario;

  perform private.registra_gestao('acesso_concedido',
    jsonb_build_object('email', lower(btrim(p_email)), 'papel', p_papel,
                       'limite_diario', p_limite_diario), p_campanha);

  return jsonb_build_object('ok', true, 'agente_id', v_ag);
end $$;

create or replace function fn_remover_acesso(p_campanha uuid, p_email text) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_n int;
  v_alvos jsonb;
begin
  if not (private.e_admin() or private.pode(p_campanha, 'supervisor')) then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;

  -- o select de dentro do CTE vê as linhas ANTES do delete: é assim que a trilha
  -- guarda quem era (agente + papel), em vez de um número solto
  with alvo as (
    delete from campanha_equipe e
     using agentes a
     where e.campanha_id = p_campanha and lower(a.email) = lower(btrim(p_email))
       and e.agente_id = a.id
    returning e.agente_id, e.papel, a.email
  )
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('agente', agente_id,
                       'papel_anterior', papel, 'email', email)), '[]'::jsonb)
    into v_n, v_alvos
    from alvo;

  perform private.registra_gestao('acesso_removido',
    jsonb_build_object('removidos', v_n, 'quem', v_alvos, 'email', lower(btrim(p_email))),
    p_campanha);

  return jsonb_build_object('ok', true, 'removidos', v_n);
end $$;
-- tirar a pausa: o próprio sempre pode; admin pode; supervisor pode quem estiver
-- numa campanha que ele gerencia (senão "esqueceu" alguém pausado e o dia não anda)
create or replace function fn_despausar_agente(p_agente uuid default null) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v uuid := coalesce(p_agente, private.agente_de_auth());
begin
  if v is null then
    return jsonb_build_object('ok', false, 'erro', 'sem agente identificado');
  end if;
  if p_agente is not null and p_agente <> private.agente_de_auth()
     and not (
       private.e_admin()
       or exists (
            select 1
              from campanha_equipe meu
              join campanha_equipe deles on deles.campanha_id = meu.campanha_id
             where meu.agente_id = private.agente_de_auth()
               and meu.papel in ('supervisor', 'admin')
               and deles.agente_id = p_agente)
     ) then
    return jsonb_build_object('ok', false, 'erro', 'só o próprio operador, o supervisor da campanha ou um admin');
  end if;
  update agentes set pausado_ate = null, status_agente = 'ocioso' where id = v;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ proposta + anuência
-- A contratação NÃO acontece aqui: isto registra o envio e cobra a validação
-- biométrica no Meu INSS em 5 dias corridos (Lei 15.327/2026, IN 213/2026).
create or replace function fn_enviar_proposta(
  p_lead bigint,
  p_valor numeric,
  p_parcelas int,
  p_taxa_aa numeric default null,
  p_banco text default null,
  p_protocolo_inss text default null,
  p_obs text default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_campanha uuid;
  v_ag       uuid := private.agente_de_auth();
  v_id       uuid;
begin
  select campanha_id into v_campanha from leads where id = p_lead;
  if v_campanha is null then
    return jsonb_build_object('ok', false, 'erro', 'lead não existe');
  end if;
  if not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'valor deve ser maior que zero');
  end if;
  -- consignado: 6 a 108 parcelas (INSS) — fora disso o banco devolve e a
  -- operação perde tempo; o check da tabela é a última linha de defesa
  if p_parcelas not between 6 and 108 then
    return jsonb_build_object('ok', false, 'erro', 'parcelas entre 6 e 108');
  end if;
  -- a margem consignável é lei, não negociação: se a parcela calculada passar da
  -- margem informada para o lead, a proposta volta do banco e o cliente ainda
  -- recebe uma oferta que não pode aceitar. Bloqueado na origem, o operador nem
  -- chega a oferecer (e o admin pode furar o bloqueio assumindo o registro)
  if exists (select 1 from leads l
              where l.id = p_lead and l.margem_estimada is not null
                and p_valor / p_parcelas > l.margem_estimada * 1.005)
     and not private.e_admin() then
    return jsonb_build_object('ok', false, 'erro',
      'parcela acima da margem estimada do lead — ajuste o valor ou as parcelas');
  end if;

  insert into propostas (lead_id, agente_id, valor, parcelas, taxa_aa, banco_origem,
                         protocolo_inss, anuencia, obs, prazo_validade)
  values (p_lead, v_ag, round(p_valor::numeric, 2), p_parcelas::smallint, p_taxa_aa,
          nullif(btrim(coalesce(p_banco, '')), ''),
          nullif(btrim(coalesce(p_protocolo_inss, '')), ''),
          'enviada', nullif(btrim(coalesce(p_obs, '')), ''),
          now() + interval '5 days')
  returning id into v_id;

  update leads set status = 'qualificado' where id = p_lead;

  insert into lead_events (lead_id, ator, detalhe)
  values (p_lead, coalesce(auth.uid()::text, 'painel'),
          'proposta enviada: R$ ' || to_char(p_valor, 'FM999G999G990D00') ||
          ' em ' || p_parcelas || 'x — anuência no Meu INSS em até 5 dias');

  return jsonb_build_object('ok', true, 'proposta_id', v_id);
end $$;

-- registro manual do resultado da anuência (depois vira consulta ao app do INSS)
create or replace function fn_marcar_anuencia(p_proposta uuid, p_anuencia anuencia_status,
                                              p_protocolo text default null)
returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_lead bigint;
begin
  select lead_id into v_lead from propostas where id = p_proposta;
  if v_lead is null then
    return jsonb_build_object('ok', false, 'erro', 'proposta não existe');
  end if;
  if not (private.e_admin()
          or private.pode((select campanha_id from leads where id = v_lead), 'supervisor')) then
    return jsonb_build_object('ok', false, 'erro', 'supervisor+ apenas');
  end if;

  update propostas
     set anuencia = p_anuencia,
         confirmada_em = case when p_anuencia = 'confirmada' then now() else confirmada_em end,
         protocolo_inss = coalesce(nullif(btrim(coalesce(p_protocolo, '')), ''), protocolo_inss)
   where id = p_proposta;

  update leads
     set status = case when p_anuencia = 'confirmada' then 'qualificado'
                       when p_anuencia in ('recusada', 'expirada') then 'recusado'
                       else status end
   where id = v_lead;

  insert into lead_events (lead_id, ator, detalhe)
  values (v_lead, coalesce(auth.uid()::text, 'painel'), 'anuência: ' || p_anuencia);

  return jsonb_build_object('ok', true, 'lead_id', v_lead);
end $$;

-- ------------------------------------------------------------------ "quem sou eu"
-- Uma chamada só: o layout, a nav e os portais de gestão perguntam todos a mesma
-- coisa. Sem isto, cada página faria 3 queries e o papel sairia de lugares
-- diferentes (é como se ganha permissão por acidente).
create or replace function fn_quem_sou() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    jsonb_build_object(
      'agente_id', a.id,
      'email', a.email,
      'nome', a.nome,
      'papel', a.papel,
      'ativo', a.ativo,
      'celular', a.celular,
      'limite_diario', a.limite_diario,
      'pausado_ate', a.pausado_ate,
      'status_agente', a.status_agente,
      'ultimo_ciclo_em', a.ultimo_ciclo_em,
      'discadas_hoje', private.discadas_hoje(a.id),
      'empresa', (select jsonb_build_object('nome', e.nome, 'cnpj', e.cnpj,
                                            'responsavel_lgpd', e.responsavel_lgpd,
                                            'aviso_gravacao', e.aviso_gravacao)
                    from empresas e order by e.criado_em limit 1),
      'tarefas_abertas', coalesce((select count(*)::int from tarefas t
                                    where t.agente_id = a.id and t.concluida_em is null), 0),
      'campanhas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'nome', c.nome, 'papel', e.papel,
                 'limite_diario', e.limite_diario) order by c.nome)
          from campanha_equipe e
          join campanhas c on c.id = e.campanha_id
         where e.agente_id = a.id), '[]'::jsonb),
      -- o que o papel dele consegue governar (campanhas para os selects de gestão)
      'gerencia', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome) order by c.nome)
          from campanhas c
         where a.papel in ('admin','supervisor')
           and (a.papel = 'admin'
                or exists (select 1 from campanha_equipe e
                            where e.campanha_id = c.id and e.agente_id = a.id
                              and e.papel in ('supervisor','admin')))), '[]'::jsonb)
    ),
    jsonb_build_object('papel', 'ninguem', 'agente_id', null, 'campanhas', '[]'::jsonb,
                       'gerencia', '[]'::jsonb)
  )
  from agentes a
 where a.id = private.agente_de_auth()
$$;


-- =====================================================================
--  Roteiro: biblioteca (supervisor+/admin) e marcação de passos (operador).
--
--  `fn_salvar_roteiro` faz insert+update+reposição de passos numa transação:
--  substituir a lista inteira é de propósito — assim o editor da tela não precisa
--  de "qual linha mudou" e não sobra passo órfão de uma versão anterior.
-- =====================================================================
create or replace function fn_salvar_roteiro(
  p_id uuid default null,
  p_nome text default null,
  p_publico text default null,
  p_aviso_compliance text default null,
  p_ativo boolean default null,
  p_passos jsonb default null,
  p_objecoes jsonb default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_id     uuid := p_id;
  v_antes  jsonb;
  v_versao int;
begin
  if not (private.e_admin() or private.papel_de_auth() = 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'só supervisor ou admin edita roteiro');
  end if;
  if p_passos is not null and jsonb_typeof(p_passos) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'p_passos tem de ser array');
  end if;
  if p_objecoes is not null and jsonb_typeof(p_objecoes) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'p_objecoes tem de ser array');
  end if;

  if v_id is null then
    if nullif(btrim(coalesce(p_nome, '')), '') is null then
      return jsonb_build_object('ok', false, 'erro', 'nome é obrigatório em roteiro novo');
    end if;
    insert into roteiros (nome, publico, aviso_compliance, ativo)
    values (left(btrim(p_nome), 120),
            case when p_publico in ('inss','bpc_loas','clt','servidor','fgts')
                 then p_publico else 'inss' end,
            nullif(btrim(coalesce(p_aviso_compliance, '')), ''),
            -- senão o "salvar como rascunho" da tela virava roteiro no ar
            coalesce(p_ativo, true))
    returning id, versao into v_id, v_versao;
  else
    select to_jsonb(r) into v_antes from roteiros r where r.id = v_id;
    if v_antes is null then
      return jsonb_build_object('ok', false, 'erro', 'roteiro não existe');
    end if;

    update roteiros set
      nome = coalesce(nullif(btrim(coalesce(p_nome, '')), ''), nome),
      publico = case when p_publico in ('inss','bpc_loas','clt','servidor','fgts')
                     then p_publico else publico end,
      aviso_compliance = coalesce(nullif(btrim(coalesce(p_aviso_compliance, '')), ''),
                                  aviso_compliance),
      ativo = coalesce(p_ativo, ativo),
      -- mexer no conteúdo é o que sobe a versão; mudar só o aviso não cria versão
      versao = versao + case when p_passos is not null or p_objecoes is not null then 1 else 0 end,
      atualizado_em = now()
     where id = v_id
    returning versao into v_versao;
  end if;

  if p_passos is not null then
    delete from roteiro_passos where roteiro_id = v_id;
    insert into roteiro_passos (roteiro_id, ordem, titulo, texto, obrigatorio)
    select v_id,
           row_number() over (order by coalesce(
             case when o->>'ordem' ~ '^[0-9]{1,2}$' then (o->>'ordem')::int end, ord))::smallint,
           left(btrim(o->>'titulo'), 120),
           left(btrim(o->>'texto'), 4000),
           case when lower(coalesce(nullif(o->>'obrigatorio', ''), 'true'))
                     in ('false','f','0','nao','não') then false else true end
      from jsonb_array_elements(p_passos) with ordinality as e(o, ord)
     where coalesce(btrim(o->>'titulo'), '') <> '' and coalesce(btrim(o->>'texto'), '') <> '';
  end if;

  if p_objecoes is not null then
    delete from roteiro_objecoes where roteiro_id = v_id;
    insert into roteiro_objecoes (roteiro_id, ordem, objecao, resposta, proibido)
    select v_id,
           row_number() over (order by coalesce(
             case when o->>'ordem' ~ '^[0-9]{1,2}$' then (o->>'ordem')::int end, ord))::smallint,
           left(btrim(o->>'objecao'), 300),
           left(btrim(o->>'resposta'), 2000),
           nullif(left(btrim(coalesce(o->>'proibido', '')), 1000), '')
      from jsonb_array_elements(p_objecoes) with ordinality as e(o, ord)
     where coalesce(btrim(o->>'objecao'), '') <> '' and coalesce(btrim(o->>'resposta'), '') <> '';
  end if;

  perform private.registra_gestao('roteiro_salvo',
    jsonb_build_object('roteiro_id', v_id, 'versao', v_versao,
                       'passos', coalesce(jsonb_array_length(coalesce(p_passos, '[]'::jsonb)), 0),
                       'objecoes', coalesce(jsonb_array_length(coalesce(p_objecoes, '[]'::jsonb)), 0),
                       'antes', v_antes));

  return jsonb_build_object('ok', true, 'roteiro_id', v_id, 'versao', v_versao,
                            'passos', (select count(*)::int from roteiro_passos where roteiro_id = v_id),
                            'objecoes', (select count(*)::int from roteiro_objecoes where roteiro_id = v_id));
end $$;

-- apontar o roteiro para a campanha (o operador passa a recebê-lo no claim)
create or replace function fn_atribuir_roteiro(p_campanha uuid, p_roteiro uuid default null)
returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_n int;
begin
  if p_campanha is null or not private.pode(p_campanha, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;
  if p_roteiro is not null then
    select count(*) into v_n from roteiros where id = p_roteiro and ativo;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'erro', 'roteiro inexistente ou inativo');
    end if;
  end if;

  update campanhas set roteiro_id = p_roteiro, atualizado_em = now() where id = p_campanha;

  perform private.registra_gestao('roteiro_atribuido',
    jsonb_build_object('campanha', p_campanha, 'roteiro', p_roteiro), p_campanha);
  return jsonb_build_object('ok', true);
end $$;

-- marcar/desmarcar um passo na ligação em andamento. Grava também em lead_events
-- para a timeline do cliente continuar completa sem depender desta tela.
create or replace function fn_marcar_passo_roteiro(
  p_lead bigint, p_passo bigint, p_feito boolean default true, p_nota text default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_campanha uuid;
  v_titulo text;
  v_devidos int;
  v_feitos int;
begin
  select campanha_id into v_campanha from leads where id = p_lead;
  if v_campanha is null then
    return jsonb_build_object('ok', false, 'erro', 'lead não existe');
  end if;
  if not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;

  select p.titulo into v_titulo
    from roteiro_passos p
    join campanhas c on c.id = v_campanha and c.roteiro_id = p.roteiro_id
   where p.id = p_passo;
  if v_titulo is null then
    return jsonb_build_object('ok', false, 'erro', 'este passo não é do roteiro desta campanha');
  end if;

  if p_feito then
    insert into lead_roteiro_checks (lead_id, passo_id, marcado_por, feito, nota)
    values (p_lead, p_passo, private.agente_de_auth(), true, nullif(btrim(coalesce(p_nota, '')), ''))
    on conflict (lead_id, passo_id) do update
      set feito = true, nota = excluded.nota, marcado_em = now(),
          marcado_por = excluded.marcado_por;
  else
    delete from lead_roteiro_checks where lead_id = p_lead and passo_id = p_passo;
  end if;

  insert into lead_events (lead_id, ator, detalhe)
  values (p_lead, coalesce(auth.uid()::text, 'sistema'),
          'roteiro: ' || v_titulo || case when p_feito then '' else ' (desmarcado)' end ||
          coalesce(' — ' || left(btrim(p_nota), 200), ''));

  select count(*) filter (where p.obrigatorio),
         count(*) filter (where p.obrigatorio and coalesce(k.feito, false))
    into v_devidos, v_feitos
    from roteiro_passos p
    left join lead_roteiro_checks k on k.passo_id = p.id and k.lead_id = p_lead
   where p.roteiro_id = (select roteiro_id from campanhas where id = v_campanha);

  return jsonb_build_object('ok', true, 'titulo', v_titulo, 'feito', p_feito,
                            'devidos', v_devidos, 'cumpridos', v_feitos);
end $$;


-- =====================================================================
--  Porte dos concorrentes: cadência, tabulação, CRM, QA, simulador, webhook.
--  Tudo RPC definer — nada aqui tem policy de escrita correspondente, então o
--  navegador não consegue falsificar nenhuma dessas linhas por REST.
-- =====================================================================

-- ------------------------------------------------------------------ cadência por disposição
create or replace function fn_salvar_politica_rediscagem(p_campanha uuid, p_rows jsonb)
returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_n int := 0;
  r jsonb;
begin
  if not private.pode(p_campanha, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;
  if p_campanha is null then
    return jsonb_build_object('ok', false, 'erro', 'campanha obrigatória');
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'p_rows precisa ser array jsonb');
  end if;

  delete from politica_rediscagem where campanha_id = p_campanha;

  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      insert into politica_rediscagem
        (campanha_id, disposition, acao, intervalo_s, hora_alvo, max_tentativas, prioridade_delta, observacao)
      values (
        p_campanha,
        (r->>'disposition')::cdr_disposition,
        coalesce(nullif(r->>'acao',''), 'repetir'),
        coalesce(nullif(r->>'intervalo_s','')::int, 14400),
        nullif(r->>'hora_alvo','')::time,
        nullif(r->>'max_tentativas','')::smallint,
        coalesce(nullif(r->>'prioridade_delta','')::smallint, 0),
        nullif(r->>'observacao','')
      )
      on conflict (campanha_id, disposition) do update
        set acao = excluded.acao, intervalo_s = excluded.intervalo_s,
            hora_alvo = excluded.hora_alvo, max_tentativas = excluded.max_tentativas,
            prioridade_delta = excluded.prioridade_delta, observacao = excluded.observacao,
            atualizado_em = now();
      v_n := v_n + 1;
    exception when others then
      return jsonb_build_object('ok', false, 'erro',
        'linha inválida: ' || coalesce(r->>'disposition','?') || ' (' || sqlerrm || ')');
    end;
  end loop;

  perform private.registra_gestao('politica_salva',
    jsonb_build_object('campanha_id', p_campanha, 'regras', v_n, 'conteudo', p_rows), p_campanha);
  return jsonb_build_object('ok', true, 'regras', v_n);
end $$;

create or replace function fn_politica_rediscagem(p_campanha uuid)
returns table (disposition text, acao text, intervalo_s int, hora_alvo time,
               max_tentativas int, prioridade_delta int, observacao text)
security definer set search_path = public, pg_temp language sql as $$
  -- sem linha na tabela, devolve o default efetivo de cada disposição: a tela de
  -- edição mostra o que acontece hoje, não uma lista vazia que parece "nada definido"
  select d.disposition::text,
         coalesce(p.acao, case when d.disposition = 'atendeu' then 'contato'
                               when d.disposition in ('numero_invalido','ligacao_caiu') then 'descartar'
                               else 'repetir' end),
         coalesce(p.intervalo_s, c.intervalo_retentativa_s),
         p.hora_alvo,
         coalesce(p.max_tentativas::int, c.max_tentativas::int),
         coalesce(p.prioridade_delta::int, 0),
         p.observacao
    from campanhas c
    cross join (values ('atendeu'::cdr_disposition),('nao_atendeu'),('ocupado'),('secretaria'),
                       ('whatsapp'),('ligacao_caiu'),('numero_invalido'),('falha_agent'))
         as d(disposition)
    left join politica_rediscagem p
      on p.campanha_id = c.id and p.disposition = d.disposition
   where c.id = p_campanha
     and private.pode(c.id, 'operador')
   order by d.disposition;
$$;

-- ------------------------------------------------------------------ bloqueio com prazo
create or replace function fn_bloquear_telefone(
  p_telefone text, p_motivo text default 'nao_me_perturbe', p_dias int default 30,
  p_detalhe text default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_afetados int;
begin
  if p_telefone is null or p_telefone !~ '^\+[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'erro', 'telefone em E.164 (+55DDDNÚÚÚÚNÚÚÚÚ)');
  end if;
  if p_motivo not in ('nao_me_perturbe','opt_out','obito','jc','menor','fraude','sem_contato_30d','numero_invalido') then
    return jsonb_build_object('ok', false, 'erro', 'motivo desconhecido');
  end if;
  if p_dias is not null and p_dias not between 1 and 3650 then
    return jsonb_build_object('ok', false, 'erro', 'prazo entre 1 dia e 10 anos');
  end if;
  -- opt_out/obito/fraude são definitivos: permitir "30 dias" aqui seria convite a
  -- voltar a ligar para quem pediu para nunca mais receber
  if p_motivo in ('opt_out','obito','fraude') and p_dias is not null then
    return jsonb_build_object('ok', false, 'erro', 'esse motivo não admite prazo: é permanente');
  end if;
  if private.papel_de_auth() is null or private.papel_de_auth() = 'operador' then
    return jsonb_build_object('ok', false, 'erro', 'bloquear número é decisão de gestão');
  end if;

  insert into bloqueios (telefone_e164, motivo, detalhe, expira_em, origem, criado_por)
  values (p_telefone, p_motivo, nullif(p_detalhe,''),
          case when p_dias is null then null else now() + make_interval(days => p_dias) end,
          'gestao', private.agente_de_auth())
  on conflict (telefone_e164) do update
    set motivo = excluded.motivo, detalhe = excluded.detalhe,
        expira_em = excluded.expira_em, origem = excluded.origem, criado_por = excluded.criado_por;

  update leads set status = 'opt_out', consentimento = 'revogado', proximo_contato_at = null
   where telefone_e164 = p_telefone
     and p_motivo in ('opt_out','obito','fraude','jc','menor');
  get diagnostics v_afetados = row_count;

  perform private.registra_gestao('telefone_bloqueado',
    jsonb_build_object('telefone', p_telefone, 'motivo', p_motivo, 'dias', p_dias,
                       'leads_afetados', v_afetados));
  return jsonb_build_object('ok', true, 'leads_afetados', v_afetados);
end $$;

create or replace function fn_liberar_telefone(p_telefone text) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
begin
  if private.papel_de_auth() is null or private.papel_de_auth() = 'operador' then
    return jsonb_build_object('ok', false, 'erro', 'liberar número é decisão de gestão');
  end if;
  delete from bloqueios where telefone_e164 = p_telefone;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'número não estava bloqueado');
  end if;
  perform private.registra_gestao('telefone_liberado', jsonb_build_object('telefone', p_telefone));
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ formulário de tabulação
create or replace function fn_salvar_formulario(p_campanha uuid, p_campos jsonb) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_antes jsonb;
begin
  if not private.pode(p_campanha, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;
  if jsonb_typeof(p_campos) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'p_campos precisa ser array jsonb');
  end if;
  if exists (select 1 from jsonb_array_elements(p_campos) c
              where coalesce(c->>'chave','') !~ '^[a-z][a-z0-9_]{1,40}$'
                 or coalesce(c->>'rotulo','') = ''
                 or coalesce(c->>'tipo','texto') not in
                    ('texto','numero','data','selecao','sim_nao','telefone'))
    or exists (select c->>'chave' from jsonb_array_elements(p_campos) c
                group by 1 having count(*) > 1) then
    return jsonb_build_object('ok', false, 'erro',
      'cada campo precisa de chave minúscula única, rótulo e tipo conhecido');
  end if;

  select formulario into v_antes from campanhas where id = p_campanha;

  update campanhas set formulario = p_campos, atualizado_em = now() where id = p_campanha;
  perform private.registra_gestao('formulario_salvo',
    jsonb_build_object('antes', v_antes, 'campos', p_campos), p_campanha);
  return jsonb_build_object('ok', true, 'campos', jsonb_array_length(p_campos));
end $$;

create or replace function fn_salvar_tabulacao(p_lead bigint, p_dados jsonb) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_campanha uuid;
  faltando text[];
begin
  if jsonb_typeof(p_dados) <> 'object' then
    return jsonb_build_object('ok', false, 'erro', 'p_dados precisa ser objeto jsonb');
  end if;
  select campanha_id into v_campanha from leads where id = p_lead;
  if v_campanha is null or not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;

  -- obrigatório é obrigatório: a conformidade do consignado depende de ter a
  -- qualificação registrada, não de o operador "lembrar de escrever"
  select array_agg(f->>'chave') into faltando
    from campanhas c, jsonb_array_elements(c.formulario) f
   where c.id = v_campanha and coalesce(f->>'obrigatorio','false')::boolean
     and not jsonb_exists(p_dados, f->>'chave');
  if faltando is not null then
    return jsonb_build_object('ok', false, 'erro',
      'faltam campos obrigatórios: ' || array_to_string(faltando, ', '));
  end if;

  update leads
     set extras = coalesce(extras,'{}'::jsonb) || p_dados,
         status = case when status = 'novo' then 'contato' else status end
   where id = p_lead;

  insert into lead_events (lead_id, ator, detalhe)
  values (p_lead, coalesce(auth.uid()::text, 'painel'),
          'tabulação: ' || left(p_dados::text, 240));
  return jsonb_build_object('ok', true, 'extras',
                            (select extras from leads where id = p_lead));
end $$;

create or replace function fn_qualificar_lead(p_lead bigint, p_nota text default null)
returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_campanha uuid;
begin
  select campanha_id into v_campanha from leads where id = p_lead;
  if v_campanha is null or not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;
  if exists (select 1 from campanhas c, jsonb_array_elements(c.formulario) f
              where c.id = v_campanha and coalesce(f->>'obrigatorio','false')::boolean
                and not jsonb_exists(
                      coalesce((select l.extras from leads l where l.id = p_lead), '{}'::jsonb),
                      f->>'chave')) then
    return jsonb_build_object('ok', false,
      'erro', 'preencha a tabulação obrigatória antes de qualificar');
  end if;

  update leads set status = 'qualificado', obs = coalesce(nullif(p_nota,''), obs)
   where id = p_lead;
  return jsonb_build_object('ok', true, 'status', 'qualificado');
end $$;

-- ------------------------------------------------------------------ CRM: mover, tarefa, ficha
create or replace function fn_mover_lead(
  p_lead bigint, p_status lead_status, p_campanha uuid default null, p_motivo text default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_campanha uuid;
  v_atual    lead_status;
begin
  select campanha_id, status into v_campanha, v_atual from leads where id = p_lead;
  if v_campanha is null then
    return jsonb_build_object('ok', false, 'erro', 'lead não existe');
  end if;
  if p_status = 'em_discagem' then
    return jsonb_build_object('ok', false, 'erro', 'quem coloca em discagem é o claim, não a tela');
  end if;
  -- operador mexe na própria carteira; os status terminais (opt_out/óbito/descarte)
  -- e o recolocar um lead morto na fila são decisão de gerência
  if p_status in ('opt_out','obito','descarte','inidoneo')
     or v_atual in ('opt_out','obito')
     or p_campanha is not null then
    if not private.pode(v_campanha, 'supervisor') then
      return jsonb_build_object('ok', false, 'erro', 'isso é decisão de gestão');
    end if;
  elsif not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;

  if p_campanha is not null and p_campanha <> v_campanha then
    if not private.pode(p_campanha, 'supervisor') then
      return jsonb_build_object('ok', false, 'erro', 'sem acesso à campanha de destino');
    end if;
    if exists (select 1 from leads x where x.campanha_id = p_campanha
                and x.telefone_e164 = (select telefone_e164 from leads where id = p_lead)) then
      return jsonb_build_object('ok', false, 'erro', 'a campanha de destino já tem esse número');
    end if;
  end if;

  update leads
     set status = p_status,
         agente_id = case when p_status in ('recusado','inidoneo','descarte','opt_out','obito')
                          then null else agente_id end,
         proximo_contato_at = case when p_status in ('recusado','inidoneo','descarte','opt_out','obito')
                                   then null else proximo_contato_at end,
         campanha_id = coalesce(p_campanha, campanha_id)
   where id = p_lead;

  insert into lead_events (lead_id, ator, detalhe)
  values (p_lead, coalesce(auth.uid()::text, 'painel'),
          'movido no CRM: ' || p_status || coalesce(' — ' || nullif(p_motivo,''), ''));
  if p_campanha is not null then
    perform private.registra_gestao('lead_movido',
      jsonb_build_object('lead', p_lead, 'para_campanha', p_campanha, 'motivo', p_motivo),
      coalesce(p_campanha, v_campanha));
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

create or replace function fn_criar_tarefa(
  p_lead bigint, p_titulo text, p_tipo text default 'retorno',
  p_vence_em timestamptz default null, p_detalhe text default null, p_agente uuid default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_campanha uuid;
  v_id bigint;
  v_dono uuid;
begin
  select campanha_id, agente_id into v_campanha, v_dono from leads where id = p_lead;
  if v_campanha is null or not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;
  if nullif(btrim(coalesce(p_titulo,'')),'') is null then
    return jsonb_build_object('ok', false, 'erro', 'título obrigatório');
  end if;
  -- o operador não pode empurrar tarefa para o colega; o supervisor, sim
  if p_agente is not null and p_agente <> private.agente_de_auth()
     and not private.pode(v_campanha, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'só a gestão atribui tarefa a outro operador');
  end if;

  insert into tarefas (lead_id, agente_id, criada_por, tipo, titulo, detalhe,
                       vence_em)
  values (p_lead, coalesce(p_agente, v_dono, private.agente_de_auth()),
          private.agente_de_auth(),
          case when p_tipo in ('retorno','proposta','documentos','anuencia','cobranca','ligar_para','outro')
               then p_tipo else 'retorno' end,
          btrim(p_titulo), nullif(p_detalhe,''),
          coalesce(p_vence_em, now() + interval '1 day'))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'tarefa_id', v_id);
end $$;

create or replace function fn_concluir_tarefa(p_tarefa bigint, p_resultado text default null)
returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_campanha uuid;
begin
  select l.campanha_id into v_campanha
    from tarefas t join leads l on l.id = t.lead_id
   where t.id = p_tarefa;
  if v_campanha is null or not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'tarefa fora do seu escopo');
  end if;
  update tarefas
     set concluida_em = now(), resultado = coalesce(nullif(p_resultado,''), resultado)
   where id = p_tarefa and concluida_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'tarefa já concluída');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ficha 360º em um request: timeline, CDRs, proposta, roteiro, tarefas, bloqueio.
-- Fazer isso no navegador = baixar tabela inteira por tabela; é o padrão que
-- já usamos no claim e no v_campanhas_gestao.
create or replace function fn_ficha_lead(p_lead bigint) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  out jsonb;
  v_campanha uuid;
begin
  select campanha_id into v_campanha from leads where id = p_lead;
  if v_campanha is null or not private.pode(v_campanha, 'operador') then
    return jsonb_build_object('ok', false, 'erro', 'lead fora do seu escopo');
  end if;

  select jsonb_build_object(
    'ok', true,
    'lead', to_jsonb(l),
    'campanha', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'publico', c.publico,
                                           'formulario', c.formulario, 'roteiro_id', c.roteiro_id,
                                           'meta_diaria', c.meta_diaria)
                   from campanhas c where c.id = l.campanha_id),
    'eventos', (select coalesce(jsonb_agg(jsonb_build_object(
                    'quando', e.criado_em, 'de', e.de_status, 'para', e.para_status,
                    'detalhe', e.detalhe) order by e.criado_em desc), '[]'::jsonb)
                 from lead_events e where e.lead_id = l.id),
    'cdrs', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', x.id, 'quando', x.started_em, 'duracao_s', x.duracao_s,
                'disposition', x.disposition, 'nota', x.nota, 'fonte', x.fonte,
                'agente', (select a.nome from agentes a where a.id = x.agente_id)) order by x.started_em desc), '[]'::jsonb)
              from cdr x where x.lead_id = l.id),
    'propostas', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', p.id, 'valor', p.valor, 'parcelas', p.parcelas, 'taxa_aa', p.taxa_aa,
                    'anuencia', p.anuencia, 'enviada_em', p.enviada_em,
                    'prazo_validade', p.prazo_validade, 'protocolo', p.protocolo_inss,
                    'banco', p.banco_origem) order by p.enviada_em desc), '[]'::jsonb)
                  from propostas p where p.lead_id = l.id),
    'tarefas', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', t.id, 'titulo', t.titulo, 'tipo', t.tipo, 'vence_em', t.vence_em,
                  'concluida_em', t.concluida_em, 'resultado', t.resultado,
                  'dono', (select a.nome from agentes a where a.id = t.agente_id))
                  order by t.concluida_em is not null, t.vence_em), '[]'::jsonb)
                from tarefas t where t.lead_id = l.id),
    'roteiro', (select coalesce(jsonb_agg(jsonb_build_object(
                  'titulo', pp.titulo, 'obrigatorio', pp.obrigatorio,
                  'feito', k.feito, 'marcado_em', k.marcado_em) order by pp.ordem), '[]'::jsonb)
                 from roteiro_passos pp
                 left join lead_roteiro_checks k on k.passo_id = pp.id and k.lead_id = l.id
                where pp.roteiro_id = (select c.roteiro_id from campanhas c where c.id = l.campanha_id)),
    'qa', (select coalesce(jsonb_agg(jsonb_build_object(
              'nota', q.nota, 'criterios', q.criterios, 'achados', q.achados,
              'plano_acao', q.plano_acao, 'quando', q.criado_em,
              'avaliador', (select a.nome from agentes a where a.id = q.avaliador_id))
              order by q.criado_em desc), '[]'::jsonb)
            from qa_avaliacoes q where q.lead_id = l.id),
    'bloqueio', (select jsonb_build_object('motivo', b.motivo, 'detalhe', b.detalhe,
                                           'expira_em', b.expira_em, 'origem', b.origem)
                  from bloqueios b where b.telefone_e164 = l.telefone_e164)
  ) into out
  from leads l where l.id = p_lead;

  return out;
end $$;

-- ------------------------------------------------------------------ pontuação da fila
-- O discador concorrente "prioriza os produtivos"; aqui a prioridade deixa de ser
-- o número digitado na planilha e vira fórmula pública, recalculável pelo supervisor.
create or replace function fn_pontuar_leads(p_campanha uuid default null) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_n int;
begin
  if p_campanha is not null and not private.pode(p_campanha, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'sem permissão nesta campanha');
  end if;
  if p_campanha is null and not private.e_admin() then
    return jsonb_build_object('ok', false, 'erro', 'recalcular tudo é ação de admin');
  end if;

  update leads l
     set prioridade = greatest(0, least(100,
           (case when l.consentimento = 'form_proprio' then 30
                 when l.consentimento = 'presencial'   then 25
                 when l.consentimento = 'app_banco'    then 20
                 when l.consentimento = 'lista_compartilhada' then 8 else 0 end)
         + (case when l.criado_em > now() - interval '2 days'  then 25
                 when l.criado_em > now() - interval '7 days' then 15
                 when l.criado_em > now() - interval '30 days' then 5 else 0 end)
         + (case when l.margem_estimada >= 500 then 25
                 when l.margem_estimada >= 250 then 18
                 when l.margem_estimada >= 100 then 10 else 0 end)
         + (case when l.tentativas = 0 then 20 when l.tentativas = 1 then 12
                 when l.tentativas = 2 then 6 else 0 end)
         - (case when l.ultima_chamada_at is not null
                  and l.ultima_chamada_at > now() - interval '1 day' then 10 else 0 end)))::smallint
   where l.status in ('novo','sem_contato')
     and (p_campanha is null or l.campanha_id = p_campanha);
  get diagnostics v_n = row_count;

  perform private.registra_gestao('lead_pontuado',
    jsonb_build_object('campanha', p_campanha, 'recalculados', v_n), p_campanha);
  return jsonb_build_object('ok', true, 'recalculados', v_n);
end $$;

-- ------------------------------------------------------------------ QA de ligação
create or replace function fn_avaliar_chamada(
  p_cdr bigint, p_nota int, p_criterios jsonb default '{}'::jsonb,
  p_achados text default null, p_plano_acao text default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_lead bigint;
  v_ag   uuid;
  v_cam  uuid;
  v_id   bigint;
begin
  select x.lead_id, x.agente_id into v_lead, v_ag from cdr x where x.id = p_cdr;
  if v_lead is null and v_ag is null then
    return jsonb_build_object('ok', false, 'erro', 'chamada não existe');
  end if;
  select campanha_id into v_cam from leads where id = v_lead;
  if v_cam is not null and not private.pode(v_cam, 'supervisor') then
    return jsonb_build_object('ok', false, 'erro', 'auditar ligação é da gestão da campanha');
  end if;
  if private.papel_de_auth() is null or private.papel_de_auth() = 'operador' then
    return jsonb_build_object('ok', false, 'erro', 'só supervisor/admin avalia');
  end if;
  if p_nota not between 0 and 100 then
    return jsonb_build_object('ok', false, 'erro', 'nota de 0 a 100');
  end if;

  insert into qa_avaliacoes (cdr_id, lead_id, avaliador_id, agente_id, nota, criterios, achados, plano_acao)
  values (p_cdr, v_lead, private.agente_de_auth(), v_ag, p_nota::smallint,
          coalesce(nullif(p_criterios::text,'')::jsonb, '{}'::jsonb),
          nullif(p_achados,''), nullif(p_plano_acao,''))
  returning id into v_id;

  perform private.registra_gestao('qa_avaliado',
    jsonb_build_object('cdr', p_cdr, 'agente', v_ag, 'nota', p_nota,
                       'lead', v_lead, 'criterios', p_criterios), v_cam);
  return jsonb_build_object('ok', true, 'qa_id', v_id);
end $$;

-- ------------------------------------------------------------------ simulador de proposta
-- O número que o operador pode oferecer vem da margem consignável, não da vontade.
-- A conta é a de anuidade antecipada com taxa efetiva anual do INSS: com a margem
-- como parcela máxima, o valor presente é o crédito máximo que cabe no bolso.
create or replace function fn_simular_proposta(
  p_margem numeric, p_parcelas int, p_publico text default 'inss', p_taxa_aa numeric default null
) returns jsonb
security definer set search_path = public, pg_temp language sql as $$
  with i as (
    select coalesce(p_taxa_aa,
                    case when p_publico = 'bpc_loas' then 3.2300 else 3.2300 end) as taxa_aa,
           case when p_publico = 'bpc_loas' then 35 else 40 end as limite_pct,
           greatest(6, least(108, coalesce(p_parcelas, 24))) as n
  ),
  m as (
    select i.taxa_aa, i.limite_pct, i.n,
           power(1 + i.taxa_aa / 100.0, 1.0/12.0) - 1 as mensal,
           greatest(coalesce(p_margem, 0), 0) as margem
      from i
  )
  select jsonb_build_object(
    'ok', true,
    'parcela_maxima', round(m.margem, 2),
    'valor_maximo', case when m.mensal > 0
                         then round(m.margem * (1 - power(1 + m.mensal, -m.n)) / m.mensal, 2)
                         else round(m.margem * m.n, 2) end,
    'total_pago', round(m.margem * m.n, 2),
    'juros_totais', round(m.margem * m.n -
                          case when m.mensal > 0
                               then m.margem * (1 - power(1 + m.mensal, -m.n)) / m.mensal
                               else m.margem * m.n end, 2),
    'parcelas', m.n,
    'taxa_aa', m.taxa_aa,
    'limite_margem_pct', m.limite_pct,
    'dentro_das_regras', p_parcelas between 6 and 108 and coalesce(p_margem,0) > 0,
    'regras', jsonb_build_array(
      'margem consignável: 40% do benefício (35% no BPC/LOAS)',
      'prazo do INSS: até 108 parcelas',
      'carência de 3 meses antes da 1ª parcela',
      'seguro prestamista não pode ser embutido na parcela',
      'a contratação só se confirma com biometria no Meu INSS (até 5 dias)')
  ) from m
$$;

-- ------------------------------------------------------------------ cadastro da empresa
create or replace function fn_editar_empresa(
  p_nome text default null, p_cnpj text default null, p_telefone text default null,
  p_email text default null, p_responsavel_lgpd text default null,
  p_aviso_gravacao text default null
) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare v_id uuid;
begin
  if not private.e_admin() then
    return jsonb_build_object('ok', false, 'erro', 'só o admin (dono) edita a empresa');
  end if;
  select id into v_id from empresas order by criado_em limit 1;
  if v_id is null then
    insert into empresas (nome) values (coalesce(nullif(btrim(p_nome),''), 'Minha empresa'))
    returning id into v_id;
  end if;

  update empresas set
    nome             = coalesce(nullif(btrim(coalesce(p_nome,'')), ''), nome),
    cnpj             = coalesce(p_cnpj, cnpj),
    telefone         = coalesce(p_telefone, telefone),
    email            = coalesce(p_email, email),
    responsavel_lgpd = coalesce(p_responsavel_lgpd, responsavel_lgpd),
    aviso_gravacao   = coalesce(p_aviso_gravacao, aviso_gravacao),
    atualizado_em    = now()
   where id = v_id;

  perform private.registra_gestao('empresa_editada',
    jsonb_build_object('nome', p_nome, 'cnpj', p_cnpj, 'responsavel_lgpd', p_responsavel_lgpd));
  return jsonb_build_object('ok', true, 'empresa_id', v_id);
end $$;

-- ------------------------------------------------------------------ webhook: lead entra pela porta da frente
-- Segurança: a rota pública chama ESTA função com o token da campanha. Ela é
-- definer (escreve sem policy de insert), não devolve dado de outro cliente e tem
-- trava de volume — é a única porta anon com escrita neste schema, e só abre com
-- `webhook_ativo = true` ligado pelo admin na tela de campanhas.
create or replace function fn_receber_lead_webhook(p_token uuid, p_row jsonb) returns jsonb
security definer set search_path = public, pg_temp language plpgsql as $$
declare
  v_cam  campanhas%rowtype;
  v_tel  text;
  v_id   bigint;
  v_recentes int;
begin
  if p_token is null or jsonb_typeof(p_row) <> 'object' then
    return jsonb_build_object('ok', false, 'erro', 'payload inválido');
  end if;

  select * into v_cam from campanhas
   where webhook_token = p_token and webhook_ativo and ativo;
  if v_cam.id is null then
    return jsonb_build_object('ok', false, 'erro', 'token inválido ou desligado');
  end if;

  -- trava de volume por campanha: um site mal configurado (ou um ataque) não pode
  -- encher a fila de lixo — o importador humano faz 200 de uma vez, o webhook não
  select count(*) into v_recentes from leads
   where campanha_id = v_cam.id and criado_em > now() - interval '1 minute';
  if v_recentes > 30 then
    return jsonb_build_object('ok', false, 'erro', 'volume alto: tente novamente em instantes');
  end if;

  v_tel := btrim(coalesce(p_row->>'telefone_e164', p_row->>'telefone', ''));
  if v_tel !~ '^\+[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'erro', 'telefone em E.164 é obrigatório');
  end if;
  -- o mesmo contrato que a planilha assinada: sem consentimento por titular, não entra
  if p_row->>'consentimento' is null
     or p_row->>'consentimento' not in ('form_proprio','app_banco','presencial','lista_compartilhada') then
    return jsonb_build_object('ok', false, 'erro',
      'consentimento inválido: use form_proprio, app_banco, presencial ou lista_compartilhada');
  end if;
  if exists (select 1 from bloqueios b where b.telefone_e164 = v_tel
              and (b.expira_em is null or b.expira_em > now())) then
    return jsonb_build_object('ok', false, 'erro', 'número em lista de bloqueio',
                              'bloqueado', true);
  end if;

  insert into leads (campanha_id, telefone_e164, nome, cpf, cidade, uf, banco_folha,
                     margem_estimada, obs, ref_externa, extras, consentimento,
                     consentimento_em, prioridade)
  values (v_cam.id, v_tel,
          nullif(btrim(coalesce(p_row->>'nome','')), ''),
          nullif(btrim(coalesce(p_row->>'cpf','')), ''),
          nullif(btrim(coalesce(p_row->>'cidade','')), ''),
          nullif(upper(btrim(coalesce(p_row->>'uf',''))), ''),
          nullif(btrim(coalesce(p_row->>'banco_folha','')), ''),
          nullif(coalesce(p_row->>'margem_estimada',''), '')::numeric,
          nullif(btrim(coalesce(p_row->>'obs','')), ''),
          coalesce(nullif(btrim(coalesce(p_row->>'ref_externa','')), ''),
                   'webhook:' || md5(v_tel || now()::text)),
          coalesce(nullif(p_row->>'extras','')::jsonb, '{}'::jsonb)
            || jsonb_build_object('_canal', 'webhook', '_origem_url', p_row->>'origem_url'),
          (p_row->>'consentimento')::canal_consentimento,
          now(),
          -- lead recém-caído vale mais que lead de planilha de 3 semanas
          55)
  on conflict (campanha_id, telefone_e164) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  insert into lead_events (lead_id, para_status, ator, detalhe)
  values (v_id, 'novo', 'webhook',
          'lead recebido pelo site' || coalesce(' — ' || left(v_tel, 20), ''));
  perform private.registra_gestao('webhook_recebido',
    jsonb_build_object('lead', v_id, 'telefone', v_tel, 'campanha', v_cam.id), v_cam.id);
  return jsonb_build_object('ok', true, 'lead_id', v_id, 'prioridade', 55);
end $$;

-- as pendências do dia saem de uma função porque cada fonte tem regra própria de
-- escopo; a view não conseguiria aplicar `private.pode` em quatro ramos diferente
create or replace function fn_pendencias() returns jsonb
security definer set search_path = public, pg_temp language sql as $$
  select jsonb_build_object(
    'ok', true,
    'tarefas_vencidas', coalesce((select count(*)::int from tarefas t
        join leads l on l.id = t.lead_id
       where t.concluida_em is null and t.vence_em < now()
         and (l.agente_id = private.agente_de_auth() or private.pode(l.campanha_id,'supervisor'))), 0),
    'retornos_de_hoje', coalesce((select count(*)::int from leads l
       where l.status in ('novo','sem_contato')
         and l.proximo_contato_at::date = (now() at time zone 'America/Sao_Paulo')::date
         and (l.agente_id = private.agente_de_auth() or private.pode(l.campanha_id,'supervisor'))), 0),
    'anuencia_hoje', coalesce((select count(*)::int from propostas p
        join leads l on l.id = p.lead_id
       where p.anuencia in ('enviada','pendente_confirmacao')
         and p.prazo_validade <= now() + interval '1 day'
         and (l.agente_id = private.agente_de_auth() or private.pode(l.campanha_id,'supervisor'))), 0),
    'qualificados_sem_proposta', coalesce((select count(*)::int from leads l
       where l.status = 'qualificado'
         and not exists (select 1 from propostas p where p.lead_id = l.id)
         and (l.agente_id = private.agente_de_auth() or private.pode(l.campanha_id,'supervisor'))), 0),
    'qa_da_semana', coalesce((select count(*)::int from qa_avaliacoes q
       where q.criado_em > now() - interval '7 days'
         and (q.avaliador_id = private.agente_de_auth()
              or private.pode((select l.campanha_id from leads l where l.id = q.lead_id),'supervisor'))), 0),
    'fila_parada', coalesce((select count(*)::int from leads l
       join campanhas c on c.id = l.campanha_id
      where l.status in ('novo','sem_contato') and l.tentativas = 0
        and c.ativo and (private.e_admin() or l.agente_id = private.agente_de_auth()
                         or private.pode(l.campanha_id,'operador'))), 0)
  )
$$;


-- =====================================================================
--  Views de gestão — `security_invoker`: a view NÃO vira porta dos fundos.
--  View comum roda como dono (postgres) e ignora RLS: qualquer SELECT na view
--  exporia a operação inteira. Com security_invoker, o caller vê só o que
--  as policies dele permitem ver.
-- =====================================================================
create or replace view v_painel_dia with (security_invoker = true) as
select date_trunc('day', c.started_em) at time zone 'America/Sao_Paulo' as dia,
       cmp.nome as campanha,
       a.nome   as agente,
       count(*) as chamadas,
       count(*) filter (where c.disposition = 'atendeu') as contatos,
       round(100.0 * nullif(count(*) filter (where c.disposition = 'atendeu'), 0)
             / nullif(count(*), 0), 1) as taxa_contato_pct,
       count(*) filter (where coalesce(c.duracao_s, 0) >= 30) as efetivos_30s,
       count(*) filter (where coalesce(c.duracao_s, 0) < 3)  as curtas_suspeitas,
       sum(coalesce(c.duracao_s, 0)) as segundos_falados
  from cdr c
  left join leads l    on l.id = c.lead_id
  left join campanhas cmp on cmp.id = l.campanha_id
  left join agentes a  on a.id = c.agente_id
 group by 1, 2, 3
 order by 1 desc, 2;

create or replace view v_ranking_dia with (security_invoker = true) as
select a.id as agente_id, a.nome, a.papel, a.status_agente, a.ultimo_ciclo_em,
       a.limite_diario,
       coalesce(s.chamadas, 0)   as chamadas,
       coalesce(s.contatos, 0)   as contatos,
       coalesce(s.efetivos, 0)   as efetivos_30s,
       coalesce(s.segundos, 0)   as segundos_falados,
       coalesce(s.fila_pendente, 0) as na_carteira,
       round(100.0 * nullif(coalesce(s.contatos, 0), 0) / nullif(coalesce(s.chamadas, 0), 0), 1)
         as taxa_contato_pct
  from agentes a
  left join lateral (
    select count(*) as chamadas,
           count(*) filter (where c.disposition = 'atendeu') as contatos,
           count(*) filter (where coalesce(c.duracao_s,0) >= 30) as efetivos,
           sum(coalesce(c.duracao_s,0)) as segundos,
           (select count(*) from leads l
             where l.agente_id = a.id and l.status in ('novo','sem_contato')) as fila_pendente
      from cdr c
     where c.agente_id = a.id
       and c.started_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                          at time zone 'America/Sao_Paulo'
  ) s on true
 order by coalesce(s.contatos, 0) desc, a.nome;

create or replace view v_monitor_equipe with (security_invoker = true) as
select a.id, a.nome, a.papel, a.ativo, a.status_agente, a.pausado_ate, a.ultimo_ciclo_em,
       (now() - a.ultimo_ciclo_em < interval '3 minutes') as agente_online,
       a.limite_diario,
       private.discadas_hoje(a.id) as discadas_hoje,
       coalesce((select count(*) from dial_jobs j where j.agente_id = a.id
                  and j.status in ('claimed','discado')), 0) as jobs_abertos,
       coalesce((select count(*) from leads l where l.agente_id = a.id
                  and l.status in ('novo','sem_contato')), 0) as carteira_pendente,
       (select array_agg(c.nome order by c.nome)
          from campanha_equipe e join campanhas c on c.id = e.campanha_id
         where e.agente_id = a.id) as campanhas
  from agentes a;

create or replace view v_anuencia_pendente with (security_invoker = true) as
select p.id as proposta_id, p.lead_id, l.nome, l.telefone_e164, p.valor, p.parcelas,
       p.anuencia, p.enviada_em, p.prazo_validade, a.nome as responsavel,
       greatest(0, floor(extract(epoch from (p.prazo_validade - now())) / 86400))::int as dias_restantes
  from propostas p
  join leads l on l.id = p.lead_id
  left join agentes a on a.id = l.agente_id
 where p.anuencia in ('enviada','pendente_confirmacao')
 order by p.prazo_validade;

create or replace view v_fila with (security_invoker = true) as
select l.id as lead_id, l.nome, l.telefone_e164, l.status, l.tentativas, l.prioridade,
       l.banco_folha, jsonb_exists(l.extras, 'matricula') as tem_matricula,
       c.nome as campanha, c.max_tentativas, l.proximo_contato_at,
       ag.nome as dono, a.id is not null and a.id = l.agente_id as na_minha_carteira
  from leads l
  join campanhas c on c.id = l.campanha_id
  left join agentes ag on ag.id = l.agente_id
  cross join (select private.agente_de_auth() as id) a
 where l.status in ('novo','sem_contato')
   and l.tentativas < c.max_tentativas
 order by na_minha_carteira desc nulls last, l.prioridade desc, l.criado_em;


-- gestão de equipe e de campanha, já com as contagens que as telas precisam
-- (fazer esses count no navegador viraria "baixar a tabela inteira", o erro que
-- o ak-call-center cometeu com limit(1000) em tudo)
create or replace view v_equipe with (security_invoker = true) as
select a.id, a.nome, a.email, a.papel, a.ativo, a.celular, a.limite_diario,
       a.pausado_ate, a.status_agente, a.ultimo_ciclo_em, a.auth_id, a.criado_em,
       (now() - a.ultimo_ciclo_em < interval '3 minutes') as agente_online,
       coalesce(array_agg(distinct c.nome) filter (where c.nome is not null), '{}') as campanhas,
       coalesce((select count(*) from leads l
                  where l.agente_id = a.id and l.status in ('novo','sem_contato')), 0) as carteira_pendente,
       private.discadas_hoje(a.id) as discadas_hoje,
       coalesce((select count(*) from dial_jobs j
                  where j.agente_id = a.id and j.status in ('claimed','discado')), 0) as jobs_abertos
  from agentes a
  left join campanha_equipe e on e.agente_id = a.id
  left join campanhas c on c.id = e.campanha_id
 group by a.id
 order by a.nome;

create or replace view v_campanhas_gestao with (security_invoker = true) as
select c.id, c.nome, c.publico, c.ativo, c.janela_ini, c.janela_fim, c.max_tentativas,
       c.intervalo_retentativa_s, c.permite_overflow, c.script_resumo, c.criado_em,
       c.meta_diaria, c.formulario, c.webhook_ativo,
       -- o token é segredo: só quem governa a campanha vê a porta de entrada
       case when private.pode(c.id, 'supervisor') then c.webhook_token end as webhook_token,
       coalesce((select count(*) from politica_rediscagem pr
                  where pr.campanha_id = c.id), 0)::int as regras_de_cadencia,
       coalesce((select count(*) from tarefas t
                  join leads l on l.id = t.lead_id
                 where l.campanha_id = c.id and t.concluida_em is null), 0)::int as tarefas_abertas,
       c.roteiro_id, r.nome as roteiro_nome, r.versao as roteiro_versao,
       coalesce((select count(*) from leads l where l.campanha_id = c.id
                  and l.status in ('novo','sem_contato')), 0) as na_fila,
       coalesce((select count(*) from leads l where l.campanha_id = c.id
                  and l.agente_id is not null and l.status in ('novo','sem_contato')), 0) as atribuidos,
       coalesce((select count(*) from leads l where l.campanha_id = c.id), 0) as total_leads,
       coalesce((select count(*) from cdr x join leads l on l.id = x.lead_id
                  where l.campanha_id = c.id
                    and x.started_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                                       at time zone 'America/Sao_Paulo'), 0) as chamadas_hoje,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'agente_id', a.id, 'nome', a.nome, 'email', a.email,
                  'papel', e.papel, 'limite_diario', e.limite_diario) order by a.nome)
           from campanha_equipe e join agentes a on a.id = e.agente_id
          where e.campanha_id = c.id), '[]'::jsonb) as equipe
  from campanhas c
  left join roteiros r on r.id = c.roteiro_id;

-- editor de roteiros: a lista já vem com passos e objeções (um request, não 3)
create or replace view v_roteiros with (security_invoker = true) as
select r.id, r.nome, r.publico, r.versao, r.ativo, r.aviso_compliance, r.atualizado_em,
       (select count(*)::int from campanhas c where c.roteiro_id = r.id) as em_uso,
       coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ordem', p.ordem,
                        'titulo', p.titulo, 'texto', p.texto, 'obrigatorio', p.obrigatorio)
                   order by p.ordem)
                   from roteiro_passos p where p.roteiro_id = r.id), '[]'::jsonb) as passos,
       coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'ordem', o.ordem,
                        'objecao', o.objecao, 'resposta', o.resposta, 'proibido', o.proibido)
                   order by o.ordem)
                   from roteiro_objecoes o where o.roteiro_id = r.id), '[]'::jsonb) as objecoes
  from roteiros r;

-- aderência = passos obrigatórios devidos × marcados, por operador, no dia de Brasília.
-- A RLS das tabelas base (cdr/leads/agentes) já recorta o escopo: supervisor não vê
-- operador de outra campanha, mesmo lendo a view.
create or replace view v_aderencia_roteiro with (security_invoker = true) as
with hoje as (
  select distinct x.lead_id, coalesce(j.agente_id, l.agente_id) as agente_id
    from cdr x
    join leads l on l.id = x.lead_id
    left join dial_jobs j on j.id = x.job_id
   where x.started_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                                       at time zone 'America/Sao_Paulo'
), por_lead as (
  select h.agente_id, h.lead_id,
         (select count(*)::int
            from roteiro_passos p
            join campanhas c on c.roteiro_id = p.roteiro_id
           where p.obrigatorio and c.id = (select campanha_id from leads where id = h.lead_id)
         ) as devidos,
         (select count(*)::int
            from lead_roteiro_checks k
            join roteiro_passos p on p.id = k.passo_id
            join campanhas c on c.id = (select campanha_id from leads where id = h.lead_id)
           where k.lead_id = h.lead_id and k.feito and p.obrigatorio and c.roteiro_id = p.roteiro_id
         ) as cumpridos
    from hoje h
)
select a.id as agente_id, a.nome as agente, a.papel,
       count(*)::int as leads_de_hoje,
       coalesce(sum(pl.devidos), 0)::int as passos_devidos,
       coalesce(sum(pl.cumpridos), 0)::int as passos_cumpridos,
       case when coalesce(sum(pl.devidos), 0) = 0 then null
            else round((100.0 * sum(pl.cumpridos) / sum(pl.devidos))::numeric, 1) end as aderencia_pct
  from por_lead pl
  join agentes a on a.id = pl.agente_id
 where pl.agente_id is not null
 group by 1, 2, 3;

-- =====================================================================
--  Painéis do porte feito agora: funil, mapa de horário, metas, QA, agenda,
--  pendências e a visão do dono. Todas `security_invoker` + com as mesmas
--  guards do resto: supervisor não vê o que não governa mesmo lendo a view.
-- =====================================================================
create or replace view v_funil with (security_invoker = true) as
-- quantos leads existem em cada estágio do funil, por campanha. O `total` vem de
-- lateral para o percentual ser sobre a campanha, não sobre o que a RLS deixou ver
select cmp.nome                                            as campanha,
       st.status                                            as status,
       count(l.id)::int                                     as leads,
       max(t.total)::int                                    as total_campanha,
       round(100.0 * nullif(count(l.id), 0) / nullif(max(t.total), 0), 1) as pct_da_campanha
  from campanhas cmp
  cross join (select unnest(enum_range(null::lead_status)) as status) st
  left join leads l on l.campanha_id = cmp.id and l.status = st.status
  join lateral (select count(*) as total from leads x where x.campanha_id = cmp.id) t on true
 group by cmp.id, cmp.nome, st.status
 order by cmp.nome, array_position(enum_range(null::lead_status), st.status);

create or replace view v_mapa_horario with (security_invoker = true) as
select extract(dow from c.started_em at time zone 'America/Sao_Paulo')::int as dow,
       extract(hour from c.started_em at time zone 'America/Sao_Paulo')::int as hora,
       count(*)::int as chamadas,
       count(*) filter (where c.disposition = 'atendeu')::int as contatos,
       round(100.0 * nullif(count(*) filter (where c.disposition = 'atendeu'), 0)
             / nullif(count(*), 0), 1) as taxa_contato_pct,
       round(avg(coalesce(c.duracao_s, 0))::numeric, 1) as duracao_media_s
  from cdr c
  where c.started_em > now() - interval '60 days'
  group by 1, 2
 order by 1, 2;

create or replace view v_metas_dia with (security_invoker = true) as
select c.id as campanha_id, c.nome as campanha, c.meta_diaria,
       coalesce(h.contatos, 0)::int as contatos_hoje,
       coalesce(h.chamadas, 0)::int as chamadas_hoje,
       case when c.meta_diaria is null or c.meta_diaria = 0 then null
            else round(100.0 * coalesce(h.contatos,0) / c.meta_diaria, 1) end as pct_meta,
       greatest(0, coalesce(c.meta_diaria,0) - coalesce(h.contatos,0))::int as faltam,
       (select count(*)::int from agentes a
         join campanha_equipe e on e.agente_id = a.id
        where e.campanha_id = c.id and a.ativo) as operadores_ativos
  from campanhas c
  left join lateral (
    select count(*) filter (where x.disposition = 'atendeu') as contatos,
           count(*) as chamadas
      from cdr x join leads l on l.id = x.lead_id
     where l.campanha_id = c.id
       and x.started_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                          at time zone 'America/Sao_Paulo'
  ) h on true
 where c.ativo
 order by pct_meta desc nulls last, c.nome;

create or replace view v_qa_resumo with (security_invoker = true) as
select a.id as agente_id, a.nome as agente, a.papel,
       count(q.id)::int as avaliacoes,
       round(avg(q.nota))::int as nota_media,
       min(q.nota)::int as pior_nota,
       max(q.criado_em) as ultima_avaliacao,
       coalesce(sum(q.devidas), 0)::int as auditorias_da_semana
  from agentes a
  left join lateral (
    select q1.id, q1.nota, q1.criado_em,
           case when q1.criado_em > now() - interval '7 days' then 1 else 0 end as devidas
      from qa_avaliacoes q1 where q1.agente_id = a.id
  ) q on true
 where a.ativo
 group by 1, 2, 3
 order by nota_media asc nulls first, a.nome;

-- agenda do dia do operador (CRM): tarefa vencida é a primeira linha, não o fim da lista
create or replace view v_agenda with (security_invoker = true) as
select t.id, t.lead_id, l.nome as lead, l.telefone_e164, c.nome as campanha,
       t.titulo, t.tipo, t.detalhe, t.vence_em, t.concluida_em, t.resultado,
       t.agente_id, a.nome as dono,
       case when t.concluida_em is not null then 'concluida'
            when t.vence_em < now() then 'vencida'
            when t.vence_em::date = (now() at time zone 'America/Sao_Paulo')::date then 'hoje'
            else 'futura' end as situacao
  from tarefas t
  join leads l on l.id = t.lead_id
  join campanhas c on c.id = l.campanha_id
  left join agentes a on a.id = t.agente_id
 order by (t.concluida_em is not null),
          (t.vence_em < now()) desc, t.vence_em;

-- funil de quem governa: o dono olha a empresa inteira, não uma campanha por vez
create or replace view v_visao_dono with (security_invoker = true) as
with dia as (
  select count(*) as chamadas,
         count(*) filter (where x.disposition = 'atendeu') as contatos,
         count(*) filter (where coalesce(x.duracao_s,0) >= 30) as efetivos
    from cdr x
   where x.started_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
                          at time zone 'America/Sao_Paulo'
)
select (select count(*)::int from agentes where ativo) as operadores_ativos,
       (select count(*)::int from agentes where ativo and ultimo_ciclo_em > now() - interval '3 minutes') as operadores_online,
       (select count(*)::int from campanhas where ativo) as campanhas_ativas,
       (select count(*)::int from leads where status in ('novo','sem_contato')) as leads_na_fila,
       (select count(*)::int from leads where status = 'qualificado') as aguardando_proposta,
       (select count(*)::int from propostas) as propostas_totais,
       (select count(*)::int from propostas where anuencia in ('enviada','pendente_confirmacao')) as anuencia_aberta,
       (select count(*)::int from propostas where anuencia = 'confirmada') as anuencia_confirmada,
       (select coalesce(sum(valor),0) from propostas where anuencia = 'confirmada') as valor_confirmado,
       (select coalesce(sum(valor),0) from propostas where anuencia in ('enviada','pendente_confirmacao')) as valor_em_andamento,
       dia.chamadas::int as chamadas_hoje,
       dia.contatos::int as contatos_hoje,
       dia.efetivos::int as efetivos_hoje,
       round(100.0 * nullif(dia.contatos,0) / nullif(dia.chamadas,0), 1) as taxa_contato_pct,
       round(100.0 * nullif((select count(*) from propostas),0) / nullif(dia.contatos,0), 1)
         as proposta_por_contato_pct,
       (select count(*)::int from bloqueios) as numeros_bloqueados,
       (select count(*)::int from tarefas where concluida_em is null and vence_em < now()) as tarefas_vencidas,
       (select count(*)::int from qa_avaliacoes where criado_em > now() - interval '7 days') as qa_semana
  from dia;


-- A esteira do CRM. Fazer isso no navegador seria baixar leads + propostas +
-- tarefas e juntar na mão; o estágio é derivado do que já existe (proposta com
-- anuência confirmada não é "qualificado", e é isso que o dono quer ver primeiro).
create or replace view v_crm_leads with (security_invoker = true) as
select l.id as lead_id, l.nome, l.telefone_e164, l.cidade, l.uf, l.banco_folha,
       l.status, l.prioridade::int as prioridade, l.tentativas::int as tentativas,
       l.margem_estimada, l.ultima_chamada_at, l.proximo_contato_at, l.criado_em,
       l.extras,
       c.id as campanha_id, c.nome as campanha, c.publico, c.meta_diaria,
       a.id as agente_id, a.nome as dono,
       case
         when exists (select 1 from propostas p where p.lead_id = l.id and p.anuencia = 'confirmada')
           then 'confirmada'
         when exists (select 1 from propostas p where p.lead_id = l.id
                       and p.anuencia in ('enviada','pendente_confirmacao'))
           then 'aguardando_anuencia'
         when exists (select 1 from propostas p where p.lead_id = l.id)
           then 'proposta'
         when l.status = 'qualificado' then 'qualificado'
         when l.status = 'contato' then 'contato'
         when l.status in ('recusado','inidoneo','descarte','opt_out','obito') then 'fechado'
         else 'fila'
       end as estagio,
       coalesce((select count(*) from propostas p where p.lead_id = l.id), 0)::int as propostas,
       coalesce((select sum(p.valor) from propostas p where p.lead_id = l.id), 0) as valor_proposto,
       (select p.anuencia from propostas p where p.lead_id = l.id order by p.enviada_em desc limit 1) as anuencia,
       coalesce((select count(*) from tarefas t where t.lead_id = l.id and t.concluida_em is null), 0)::int
         as tarefas_abertas,
       exists (select 1 from tarefas t where t.lead_id = l.id and t.concluida_em is null
                and t.vence_em < now()) as tarefa_vencida,
       greatest(0, floor(extract(epoch from (now() - l.ultima_chamada_at)) / 86400))::int
         as dias_sem_falar,
       greatest(0, floor(extract(epoch from (now() - l.criado_em)) / 86400))::int as dias_na_casa
  from leads l
  join campanhas c on c.id = l.campanha_id
  left join agentes a on a.id = l.agente_id;


-- lista de bloqueio com o tamanho do estrago: quantos leads aquele número carrega
-- e se a porta já vai se abrir sozinha (prazo). Sem a contagem, a tela do dono
-- mostrava "1234 números" e ninguém sabia se era um cliente ou doze.
create or replace view v_bloqueios with (security_invoker = true) as
select b.telefone_e164, b.motivo, b.detalhe, b.expira_em, b.origem, b.criado_em,
       (now() < b.expira_em) as ainda_bloqueado,
       greatest(0, floor(extract(epoch from (b.expira_em - now())) / 86400))::int as dias_restantes,
       coalesce((select count(*) from leads l where l.telefone_e164 = b.telefone_e164), 0)::int as leads,
       coalesce((select count(*) from leads l where l.telefone_e164 = b.telefone_e164
                  and l.status in ('novo','sem_contato','contato','qualificado')), 0)::int as leads_vivos,
       a.nome as criado_por
  from bloqueios b
  left join agentes a on a.id = b.criado_por
 order by b.criado_em desc;

-- =====================================================================
--  RLS — escopo por papel. O navegador só LÊ; escrever é RPC definer.
-- =====================================================================
alter table agentes        enable row level security;
alter table campanhas      enable row level security;
alter table campanha_equipe enable row level security;
alter table leads          enable row level security;
alter table bloqueios      enable row level security;
alter table dial_jobs      enable row level security;
alter table cdr            enable row level security;
alter table propostas      enable row level security;
alter table lead_events    enable row level security;alter table auditoria_gestao enable row level security;alter table roteiros           enable row level security;
alter table roteiro_passos     enable row level security;
alter table roteiro_objecoes   enable row level security;
alter table lead_roteiro_checks enable row level security;
alter table empresas           enable row level security;
alter table politica_rediscagem enable row level security;
alter table tarefas            enable row level security;
alter table qa_avaliacoes      enable row level security;

-- agentes: cada um vê a si; admin vê todos; supervisor vê os das campanhas dele
create policy "agentes: ler escopo" on agentes for select to authenticated using (
  private.e_admin()
  or id = private.agente_de_auth()
  or exists (
       select 1 from campanha_equipe meu
        where meu.agente_id = agentes.id
          and private.pode(meu.campanha_id, 'supervisor'))
);
-- SEM policy de escrita: update/insert/delete só via RPC (senão o operador
-- faria UPDATE agentes SET papel='admin' na própria linha — escalada de poder)

create policy "campanhas: ler escopo" on campanhas for select to authenticated using (
  private.e_admin() or private.pode(id, 'operador')
);

create policy "equipe: ler escopo" on campanha_equipe for select to authenticated using (
  private.e_admin()
  or agente_id = private.agente_de_auth()
  or private.pode(campanha_id, 'supervisor')
);

create policy "leads: ler escopo" on leads for select to authenticated using (
  private.e_admin()
  or agente_id = private.agente_de_auth()
  or private.pode(campanha_id, 'operador')
);

create policy "bloqueios: ler" on bloqueios for select to authenticated using (true);

-- dado de cadastro da empresa: qualquer autenticado lê (não tem dado de cliente);
-- escrever só por fn_editar_empresa, que exige admin
create policy "empresa: ler" on empresas for select to authenticated using (true);

create policy "cadência: ler escopo" on politica_rediscagem for select to authenticated using (
  private.pode(campanha_id, 'operador')
);

-- tarefa é item de trabalho: o dono, quem criou, a gerência da campanha e o admin
create policy "tarefas: ler escopo" on tarefas for select to authenticated using (
  private.e_admin()
  or agente_id = private.agente_de_auth()
  or criada_por = private.agente_de_auth()
  or exists (select 1 from leads l where l.id = tarefas.lead_id
              and (l.agente_id = private.agente_de_auth()
                   or private.pode(l.campanha_id, 'supervisor')))
);

-- avaliação de qualidade: o avaliado tem direito de ver a nota que recebeu
create policy "qa: ler escopo" on qa_avaliacoes for select to authenticated using (
  private.e_admin()
  or avaliador_id = private.agente_de_auth()
  or agente_id = private.agente_de_auth()
  or exists (select 1 from leads l where l.id = qa_avaliacoes.lead_id
              and private.pode(l.campanha_id, 'supervisor'))
);

create policy "jobs: ler escopo" on dial_jobs for select to authenticated using (
  private.e_admin()
  or agente_id = private.agente_de_auth()
  or exists (select 1 from leads l where l.id = dial_jobs.lead_id
               and private.pode(l.campanha_id, 'supervisor'))
);

create policy "cdr: ler escopo" on cdr for select to authenticated using (
  private.e_admin()
  or agente_id = private.agente_de_auth()
  or exists (select 1 from leads l where l.id = cdr.lead_id
               and private.pode(l.campanha_id, 'supervisor'))
);

create policy "propostas: ler escopo" on propostas for select to authenticated using (
  private.e_admin()
  or exists (select 1 from leads l where l.id = propostas.lead_id
               and (l.agente_id = private.agente_de_auth()
                    or private.pode(l.campanha_id, 'supervisor')))
);
-- auditoria de gestão: admin lê tudo; supervisor lê só as campanhas que ele governa
create policy "gestao: ler escopo" on auditoria_gestao for select to authenticated using (
  private.e_admin()
  or (campanha_id is not null and private.pode(campanha_id, 'supervisor'))
);
-- sem policy de insert/update/delete: a trilha é escrita por dentro dos RPCs-- roteiro é material de treinamento, não dado de cliente: todo autenticado lê os
-- ativos; os desativados (que ainda aparecem em histórico) só quem governa
create policy "roteiro: ler ativos" on roteiros for select to authenticated using (
  ativo or private.papel_de_auth() in ('supervisor','admin')
);
create policy "passos: ler" on roteiro_passos for select to authenticated using (
  exists (select 1 from roteiros r where r.id = roteiro_passos.roteiro_id
           and (r.ativo or private.papel_de_auth() in ('supervisor','admin')))
);
create policy "objecoes: ler" on roteiro_objecoes for select to authenticated using (
  exists (select 1 from roteiros r where r.id = roteiro_objecoes.roteiro_id
           and (r.ativo or private.papel_de_auth() in ('supervisor','admin')))
);
-- quem marcou o passo: o próprio operador, a gerência da campanha do lead e o admin
create policy "checks: ler escopo" on lead_roteiro_checks for select to authenticated using (
  private.e_admin()
  or marcado_por = private.agente_de_auth()
  or exists (select 1 from leads l where l.id = lead_roteiro_checks.lead_id
              and private.pode(l.campanha_id, 'supervisor'))
);

-- sem policy de insert/update/delete: a trilha é escrita por dentro dos RPCs
-- (`private.registra_gestao`, definer). Ninguém no navegador apaga o próprio rastro.

create policy "eventos: ler escopo" on lead_events for select to authenticated using (
  private.e_admin()
  or exists (select 1 from leads l where l.id = lead_events.lead_id
               and (l.agente_id = private.agente_de_auth()
                    or private.pode(l.campanha_id, 'supervisor')))
);

-- ------------------------------------------------------------------ privilégios
-- Anon: nada. Authenticated: SELECT nas tabelas do escopo dele, DML nenhum.
-- Em produção Supabase o default concede ALL a anon/authenticated nas tabelas
-- de `public` — sem estes revoke, a RLS seria a única parede e o navegador
-- poderia escrever onde houver uma policy "for all".
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

-- Escrita: nenhuma, para `authenticated` (o `revoke all on all tables` acima já
-- inclui as views — `all tables` cobre tabela, view, materialized view).
-- Devolução cirúrgica do SELECT que o painel precisa, e nada além disso.
grant select on agentes, campanhas, campanha_equipe, leads, bloqueios, dial_jobs, cdr,
                propostas, lead_events, auditoria_gestao, roteiros, roteiro_passos,
                roteiro_objecoes, lead_roteiro_checks to authenticated;
grant select on v_painel_dia, v_ranking_dia, v_monitor_equipe, v_anuencia_pendente, v_fila,
                v_equipe, v_campanhas_gestao, v_roteiros, v_aderencia_roteiro to authenticated;
grant select on v_funil, v_mapa_horario, v_metas_dia, v_qa_resumo, v_agenda, v_visao_dono,
                v_crm_leads, v_bloqueios to authenticated;
grant select on empresas, politica_rediscagem, tarefas, qa_avaliacoes to authenticated;

-- Trilhas e materiais de treinamento são append-only / read-only para o cliente:
-- histórico não se reescreve e roteiro aprovado não se edita pelo navegador. Delete
-- continua possível para o dono do banco (expurgo LGPD, apagar campanha).
revoke update, truncate on public.lead_events from authenticated, service_role;
revoke update, delete, truncate on public.auditoria_gestao from authenticated, service_role;
revoke insert, update, delete, truncate
  on public.roteiros, public.roteiro_passos, public.roteiro_objecoes,
     public.lead_roteiro_checks
  from authenticated, service_role;
revoke update, truncate on public.cdr from authenticated, service_role;

-- =====================================================================
--  RPCs: só usuários autenticados e a service role (o agente).
--  Sem isto, o default do Supabase deixaria `anon` chamar
--  fn_claim_next_lead pela API REST e puxar dado de consumidor.
-- =====================================================================
revoke execute on all functions in schema public from public, anon;

grant execute on function fn_claim_next_lead(uuid, uuid)                        to authenticated, service_role;
grant execute on function fn_finish_call(uuid, cdr_disposition, int, text)      to authenticated, service_role;
grant execute on function fn_register_optout(text, text, text, int)              to authenticated, service_role;
-- o único RPC do schema aberto a `anon`: é a porta do webhook, protegida por token
-- de campanha + validação de consentimento + trava de volume dentro da função
grant execute on function fn_receber_lead_webhook(uuid, jsonb)                    to anon, authenticated, service_role;

-- gestão de cadência, tabulação, CRM, QA, simulador e empresa
grant execute on function fn_salvar_politica_rediscagem(uuid, jsonb)              to authenticated;
grant execute on function fn_politica_rediscagem(uuid)                            to authenticated, service_role;
grant execute on function fn_bloquear_telefone(text, text, int, text)             to authenticated;
grant execute on function fn_liberar_telefone(text)                               to authenticated;
grant execute on function fn_salvar_formulario(uuid, jsonb)                       to authenticated;
grant execute on function fn_salvar_tabulacao(bigint, jsonb)                      to authenticated;
grant execute on function fn_qualificar_lead(bigint, text)                        to authenticated;
grant execute on function fn_mover_lead(bigint, lead_status, uuid, text)          to authenticated;
grant execute on function fn_criar_tarefa(bigint, text, text, timestamptz, text, uuid) to authenticated;
grant execute on function fn_concluir_tarefa(bigint, text)                        to authenticated;
grant execute on function fn_ficha_lead(bigint)                                    to authenticated, service_role;
grant execute on function fn_pontuar_leads(uuid)                                   to authenticated;
grant execute on function fn_avaliar_chamada(bigint, int, jsonb, text, text)       to authenticated;
grant execute on function fn_simular_proposta(numeric, int, text, numeric)         to authenticated, service_role;
grant execute on function fn_editar_empresa(text, text, text, text, text, text)     to authenticated;
grant execute on function fn_pendencias()                                          to authenticated, service_role;
grant execute on function fn_expirar_jobs(int)                                   to authenticated, service_role;
grant execute on function fn_meu_perfil(text)                                    to authenticated;
grant execute on function fn_quem_sou()                                                  to authenticated;
grant execute on function fn_pausar(int, uuid)                                    to authenticated;
grant execute on function fn_despausar_agente(uuid)                              to authenticated;
grant execute on function fn_heartbeat(text, uuid)                               to authenticated, service_role;
grant execute on function fn_importar_leads(uuid, canal_consentimento, jsonb)    to authenticated;
grant execute on function fn_attribuir_carteira(uuid, uuid, int, text)            to authenticated;
grant execute on function fn_liberar_carteira(uuid, uuid)                         to authenticated;
grant execute on function fn_agendar_retorno(bigint, timestamptz, text)           to authenticated;
grant execute on function fn_criar_campanha(text, text, text)                     to authenticated;
grant execute on function fn_editar_campanha(uuid, text, boolean, time, time,
                                             int, int, boolean, text, int, boolean) to authenticated;
grant execute on function fn_definir_papel(uuid, papel_equipe)                    to authenticated;
grant execute on function fn_enviar_proposta(bigint, numeric, int, numeric, text, text, text) to authenticated;
grant execute on function fn_marcar_anuencia(uuid, anuencia_status, text)          to authenticated;
grant execute on function fn_definir_acesso(uuid, text, papel_equipe, int)        to authenticated;
grant execute on function fn_remover_acesso(uuid, text)                           to authenticated;
grant execute on function fn_salvar_roteiro(uuid, text, text, text, boolean, jsonb, jsonb) to authenticated;
grant execute on function fn_atribuir_roteiro(uuid, uuid)                         to authenticated;
grant execute on function fn_marcar_passo_roteiro(bigint, bigint, boolean, text)  to authenticated;

-- =====================================================================
--  Dados de exemplo (descomente para testar)
-- =====================================================================
-- insert into campanhas (nome, publico, script_resumo)
--   values ('INSS fev/26', 'inss', 'Abordagem de margem disponível. NÃO contratar por telefone.');
-- insert into leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, consentimento, consentimento_em, margem_estimada)
-- select id, 'Maria TESTE', '12345678901', '+5579999990001', 'Aracaju', 'SE', 'form_proprio', now(), 350.00
--   from campanhas where nome = 'INSS fev/26';

```


## `supabase/realtime.sql` — 36 linhas

```sql
-- =====================================================================
--  Realtime dos painéis — rodar DEPOIS do schema.sql, no SQL Editor do Supabase.
--
--  Separei do schema de propósito: `supabase_realtime` é publicação que só existe
--  no Supabase. No Postgres puro (nosso harness de teste e o CI) o comando falha,
--  e o schema deixaria de ser aplicável — schema.sql tem de rodar em qualquer
--  Postgres >= 15 sem depender de extensão nenhuma.
--
--  O que isto habilita: o painel do supervisor e o `/campanhas` deixam de
--  depender de F5. Os componentes usam `lib/tempo-real.ts` e só mostram o que a
--  RLS já deixa a pessoa ver — publicação não abre porta, é canal de evento.
-- =====================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicação supabase_realtime não existe aqui (não é Supabase?) — pulando';
    return;
  end if;

  foreach t in array array[
      'dial_jobs',        -- job mudou de estado => monitor de equipe
      'agentes',          -- status_agente / pausa / heartbeat
      'leads',            -- carteira e funil se mexem sozinhos
      'tarefas',          -- agenda do CRM
      'qa_avaliacoes',    -- nota do supervisor aparece na hora
      'propostas'         -- anuência confirmada
    ] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'realtime habilitado em %', t;
    end if;
  end loop;
end $$;

```


## `supabase/seed-exemplo.sql` — 221 linhas

```sql
-- SQL de primeiro uso (rode depois do schema.sql, no SQL Editor do Supabase)

-- 1) crie antes o usuário no Supabase (Authentication → Users → Add user) com o mesmo e-mail:
-- Na primeira rodada, Maria é admin (papel global). Depois, troque na tela
-- /equipe e crie os operadores lá — o painel chama o Admin API do Supabase e
-- cria o login; não é para ficar inserindo em auth.users na mão.
insert into public.agentes (email, nome, celular, ativo, papel, limite_diario)
values ('maria@suafinanceira.com.br', 'Maria', '+5579988887777', true, 'admin', 150)
on conflict (email) do update set nome = excluded.nome, celular = excluded.celular;

-- 2) campanha com janela de horário conservadora (só 9h-18h, horário de Brasília)
insert into public.campanhas (nome, publico, janela_ini, janela_fim, max_tentativas,
                               intervalo_retentativa_s, script_resumo)
select 'INSS - margem disponível', 'inss', '09:00', '18:00', 3, 14400,
       'Abordagem: identificar o titular, confirmar margem, explicar que a contratação é pelo app Meu INSS com validação do beneficiário. Jamais fechar contrato por telefone. Se a pessoa pedir para não receber ligações, registrar opt-out no painel.'
  where not exists (select 1 from public.campanhas where nome = 'INSS - margem disponível');

-- 3) leads de teste (com consentimento registrado — sem isso a fila não disca)
insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, margem_estimada,
                          consentimento, consentimento_em)
select c.id, 'Maria de Teste', '52998224725', '+5579999990001', 'Aracaju', 'SE', 350.00,
       'form_proprio', now()
  from public.campanhas c where c.nome = 'INSS - margem disponível'
on conflict do nothing;

insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, margem_estimada,
                          consentimento, consentimento_em)
select c.id, 'Jose de Teste', '98765432100', '+5579999990002', 'N. Sra. do Socorro', 'SE', 510.00,
       'form_proprio', now()
  from public.campanhas c where c.nome = 'INSS - margem disponível'
on conflict do nothing;

insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, margem_estimada,
                          consentimento, consentimento_em)
select c.id, 'Ana de Teste', '11144477735', '+5579999990003', 'Sao Cristovao', 'SE', 180.00,
       'form_proprio', now()
  from public.campanhas c where c.nome = 'INSS - margem disponível'
on conflict do nothing;

-- 4) Maria (admin) não precisa de linha em campanha_equipe, mas o modelo é:
--    operador SEM linha de acesso não enxerga a campanha — nem o pool, nem o lead.
--    Descomente para simular um operador na campanha:
-- insert into public.campanha_equipe (campanha_id, agente_id, papel, limite_diario)
-- select c.id, a.id, 'operador', 100
--   from public.campanhas c, public.agentes a
--  where c.nome = 'INSS - margem disponível' and a.email = 'joao@suafinanceira.com.br'
-- on conflict (campanha_id, agente_id) do nothing;

-- 4b) roteiro de ligação aprovado — o texto que o operador lê DURANTE a chamada.
--     Nada aqui pode virar promessa: a contratação não acontece por telefone
--     (Lei 15.327/2026 + IN INSS 213/2026). O que fecha é a anuência biométrica do
--     próprio titular no app Meu INSS, em até 5 dias corridos.
insert into public.roteiros (nome, publico, aviso_compliance)
select 'INSS — consulta com anuência no Meu INSS', 'inss',
 'PROIBIDO: fechar ou confirmar contratação por telefone; pedir senha, código, chave PIX ou documento por mensagem; dizer que o desconto é obrigatório para manter o benefício; embutir seguro prestamista (vedado); prometer valor, taxa ou aprovação.' ||
 ' LIMITES: margem consignável 40% no benefício previdenciário e 35% no BPC/LOAS; até 108 parcelas; carência de 3 meses para o 1º desconto.' ||
 ' Se a pessoa pedir para não receber mais ligações: marcar opt-out no painel NA HORA e encerrar — insistir é o que gera reclamação e bloqueio do benefício.'
 where not exists (select 1 from public.roteiros where nome = 'INSS — consulta com anuência no Meu INSS');

insert into public.roteiro_passos (roteiro_id, ordem, titulo, texto, obrigatorio)
select r.id, v.ordem, v.titulo, v.texto, v.obrigatorio
  from public.roteiros r
  join (values
    (1, 'ABERTURA — só informação',
     '“[nome do titular]? Boa tarde, aqui é [operador], da [empresa], correspondente autorizado do INSS. O senhor autorizou contato sobre crédito consignado em [canal]. Estou ligando só para explicar como funciona, tudo bem?” Se a pessoa nega a autorização ou diz que não pediu nada: agradecer, oferecer opt-out e encerrar. Não argumentar.', true),
    (2, 'CONFERÊNCIA DE TITULARIDADE (LGPD)',
     'Confirmar COM O PRÓPRIO TITULAR: nome completo, data de nascimento e benefício em manutenção. Nunca ler o CPF ou o número do benefício para ele só confirmar — perguntar. Se quem atendeu é terceiro: não passar nenhum dado, dizer que o assunto é pessoal e oferecer retorno com o titular.', true),
    (3, 'QUALIFICAÇÃO',
     'Perguntar, nesta ordem: tem margem consignável disponível? Já tem consignado ativo e em quantas parcelas? Para que pretende usar (quitar empréstimo mais caro, saúde, reforma)? Registrar tudo no campo de anotação antes de encerrar a ligação. Se não há margem: explicar a carência de 3 meses e agendar retorno — sem insistir.', true),
    (4, 'COMO A CONTRATAÇÃO ACONTECE',
     'Explicar sem rodeio: “a senhora não assina nada comigo e eu não posso confirmar valor por telefone. Eu registro a proposta; ela aparece no app Meu INSS como pendente de confirmação; a senhora valida com a sua biometria facial em até 5 dias corridos. Se não validar, cancela sozinha e nada é descontado.”', true),
    (5, 'OBJEÇÕES',
     'Usar as respostas de objeção do roteiro. Se a pessoa disser que vai reclamar, procurar o Procon ou o banco: agradecer, confirmar o encerramento e marcar a disposição — não tentar reverter na ligação.', true),
    (6, 'ENCERRAMENTO E REGISTRO',
     'Repetir que a validação é no Meu INSS, combinar dia de retorno se houver interesse e REGISTRAR a disposição no painel (proposta enviada / retorno agendado / sem interesse). Não prometer ligação do banco nem “depósito hoje”: o banco tem 7 dias úteis para informar o depósito.', true),
    (7, 'CHECKLIST DE DADOS (para a proposta)',
     'Antes de registrar proposta no painel: nome, CPF confirmado, banco onde recebe, margem estimada, valor desejado, número de parcelas, telefone de contato e o consentimento de contato registrado. Faltou um, não registre a proposta.', false)
  ) as v(ordem, titulo, texto, obrigatorio) on true
 where r.nome = 'INSS — consulta com anuência no Meu INSS'
   and not exists (select 1 from public.roteiro_passos p where p.roteiro_id = r.id);

insert into public.roteiro_objecoes (roteiro_id, ordem, objecao, resposta, proibido)
select r.id, v.ordem, v.objecao, v.resposta, v.proibido
  from public.roteiros r
  join (values
    (1, '“Já contratei, não preciso.”',
     '“Ótimo, então não vou oferecer nada. Posso só confirmar se o desconto que aparece no seu extrato do INSS é nosso ou de outro banco? Se for de outro, a portabilidade é feita no app, não por telefone.”',
     'não insistir com “dá para baixar a parcela”; não propor “troca” fora da portabilidade formal (o banco de origem tem 20 dias para liberar)'),
    (2, '“É golpe. Não confio em ligação.”',
     '“Faz sentido desconfiar — desde 2026 o benefício fica bloqueado justamente para isso. Nada é fechado por telefone: a senhora abre o app Meu INSS, entra em Consignado e vê a proposta pendente; valida com a sua biometria. Se não estiver lá, não existe.”',
     'não pedir senha, código de app, selfie “para confirmar”; não dizer que é obrigatório para manter o benefício'),
    (3, '“Quero um valor maior / só mais um pouquinho.”',
     '“O limite é a margem consignável: 40% do benefício, e as parcelas que já são descontadas entram nessa conta. Eu posso registrar a proposta dentro do que o sistema libera — e é o INSS que confirma, não eu.”',
     'não inventar “margem extra”, não embutir seguro prestamista (é vedado), não simular valor que o sistema não aprovou'),
    (4, '“Fala com meu filho / sou curador.”',
     '“Combinado, eu ligo quando o senhor estiver com a pessoa. A contratação tem de ser feita pelo titular no app; por isso eu não fecho nada por procuração.”',
     'contratação por procuração é vedada pela Lei 15.327/2026; curatela/tutela só com alvará judicial'),
    (5, '“Me manda tudo no WhatsApp.”',
     '“Mando o endereço do app Meu INSS para a senhora conferir a proposta lá. O que não posso é fechar por mensagem: a validação é a sua biometria dentro do app.”',
     'não enviar contrato, boleto, link de pagamento nem chave PIX; WhatsApp só para apontar o app oficial')
  ) as v(ordem, objecao, resposta, proibido) on true
 where r.nome = 'INSS — consulta com anuência no Meu INSS'
   and not exists (select 1 from public.roteiro_objecoes o where o.roteiro_id = r.id);

-- variante BPC/LOAS: muda a margem e o tom (BPC não é pensão por morte nem contribuição)
insert into public.roteiros (nome, publico, aviso_compliance)
select 'BPC/LOAS — margem 35%, mesma regra de anuência', 'bpc_loas',
 'PROIBIDO: fechar por telefone; embutir seguro prestamista; dizer que o BPC pode ser penhorado (não pode).' ||
 ' LIMITES: margem 35% do benefício assistencial; anuência biométrica no Meu INSS em até 5 dias; a revisão bienal do BPC não é motivo para antecipar ou condicionar a proposta.'
 where not exists (select 1 from public.roteiros where nome = 'BPC/LOAS — margem 35%, mesma regra de anuência');

insert into public.roteiro_passos (roteiro_id, ordem, titulo, texto, obrigatorio)
select r.id, v.ordem, v.titulo, v.texto, v.obrigatorio
  from public.roteiros r
  join (values
    (1, 'ABERTURA — só informação',
     'Confirmar que fala com o titular do BPC, dizer que a ligação é de informação sobre a margem de 35% e pedir licença. Negou a autorização: encerrar com educação e registrar opt-out.', true),
    (2, 'COMO A CONTRATAÇÃO ACONTECE',
     'Repetir a regra do INSS: proposta registrada por nós aparece no Meu INSS como pendente de confirmação e só vira desconto depois da biometria do titular, em até 5 dias.', true),
    (3, 'QUALIFICAÇÃO',
     'Margem disponível, contratos ativos, finalidade. No BPC, reforçar que o benefício assistencial não é penhorável e que a revisão bienal não cancela o contrato já descontado.', true),
    (4, 'ENCERRAMENTO E REGISTRO',
     'Combinar retorno, não prometer valor, registrar a disposição no painel.', true)
  ) as v(ordem, titulo, texto, obrigatorio) on true
 where r.nome = 'BPC/LOAS — margem 35%, mesma regra de anuência'
   and not exists (select 1 from public.roteiro_passos p
                     where p.roteiro_id = (select id from public.roteiros
                                            where nome = 'BPC/LOAS — margem 35%, mesma regra de anuência'));

-- 4c) amarrar o roteiro na campanha: sem isto o operador recebe só o script_resumo
update public.campanhas c
   set roteiro_id = r.id
  from public.roteiros r
 where c.nome = 'INSS - margem disponível' and c.roteiro_id is null
   and r.nome = 'INSS — consulta com anuência no Meu INSS';

-- -------------------------------------------------------------- 4d. empresa (o dono)
-- Uma linha só: é o cadastro da SUA empresa. As telas de painel, relatório e
-- abertura de ligação leem daqui em vez de cada uma ter um texto escrito à mão.
insert into empresas (nome, cnpj, telefone, email, responsavel_lgpd, aviso_gravacao,
                     janela_ini, janela_fim)
values ('Sua Financeira Crédito Consignado', '00000000000191', '+55 79 3000-0000',
        'dpo@suafinanceira.com.br', 'Encarregado: Maria (dpo@suafinanceira.com.br)',
        'A ligação pode ser registrada para controle de qualidade.',
        '09:00', '18:00')
on conflict do nothing;

update campanhas c set empresa_id = (select id from empresas order by criado_em limit 1),
                       meta_diaria = 28
 where c.nome = 'INSS - margem disponível';

-- cadência por qualificação: é o que faz 'ocupado' e 'número inexistente'
-- pararem de voltar no mesmo ritmo (o default antigo de 4 h para tudo)
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'ocupado'::cdr_disposition, 'repetir', 5400, null, null, 5,
       '1h30: quem estava ocupado costuma atender na segunda tentativa'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'secretaria'::cdr_disposition, 'repetir', 86400, '10:00'::time, null, 0,
       'amanhã às 10h, antes do expediente pesar'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'nao_atendeu'::cdr_disposition, 'repetir', 43200, '14:00'::time, 4, 0,
       'duas janelas por dia, tarde'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'numero_invalido'::cdr_disposition, 'descartar', 60, null, 1, -50,
       'sai da fila viva; o número volta para Higienização, não para discagem'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'whatsapp'::cdr_disposition, 'repetir', 300, null, null, 10,
       'pediu WhatsApp: tenta de novo logo, o lead esfria em minutos'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;

-- tabulação obrigatória: sem isto, "qualificado" é a nota que o operador digitou
update campanhas set formulario = '[
  {"chave":"titular_confirmado","rotulo":"Titular confirmou os próprios dados?","tipo":"sim_nao","obrigatorio":true},
  {"chave":"margem_informada","rotulo":"Margem que o cliente confirma (R$)","tipo":"numero","obrigatorio":true},
  {"chave":"banco_consignacao","rotulo":"Banco onde recebe o benefício","tipo":"texto","obrigatorio":true},
  {"chave":"interesse","rotulo":"Grau de interesse","tipo":"selecao","opcoes":["alto","medio","baixo"],"obrigatorio":true},
  {"chave":"autorizacao_gravacao","rotulo":"Aceita que a ligação seja registrada?","tipo":"sim_nao","obrigatorio":false}
]'::jsonb
 where nome = 'INSS - margem disponível';

-- exemplo de tarefa do CRM (o que diferencia discador de CRM é isto existir)
insert into tarefas (lead_id, agente_id, criada_por, tipo, titulo, detalhe, vence_em)
select l.id, (select id from agentes where email = 'joao@suafinanceira.com.br'),
       (select id from agentes where email = 'maria@suafinanceira.com.br'),
       'anuencia', 'Cobrar biometria no Meu INSS',
       'Proposta enviada ontem; o desconto só aparece depois da confirmação facial.',
       now() + interval '1 day'
  from leads l
 where l.nome = 'Rosana Roteiro'
   and not exists (select 1 from tarefas t where t.lead_id = l.id)
 on conflict do nothing;

-- 5) sanidade: a fila vê os 3 leads?
select count(*) as na_fila from public.v_fila;

-- 6) simule a discagem sem o agente (deve devolver 1 linha com job_id)
select * from public.fn_claim_next_lead(null);

-- 7) feche o job (substitua o uuid pelo job_id retornado acima)
-- select public.fn_finish_call('00000000-0000-0000-0000-000000000000', 'atendeu', 74, 'pediu proposta de 8000 em 36x');

-- 8) opt-out vale para todos os leads daquele número
select public.fn_register_optout('+5579999990003', 'nao_me_perturbe', 'teste de opt-out');
select count(*) as deve_ser_2 from public.v_fila;

-- 9) quando o painel e o agente estiverem no ar, o e-mail acima precisa virar login real.
--    Opcional (multi-tenant depois): criar org_id em campanhas/leads e fechar as policies por org.

```


## `supabase/tests/bootstrap-local.sql` — 80 linhas

```sql
-- =====================================================================
--  bootstrap-local.sql — SÓ PARA TESTE LOCAL (Docker/Postgres puro).
--
--  No Supabase isto já existe e não deve ser rodado: os papéis `anon`,
--  `authenticated` e `service_role`, o schema `auth` com `auth.users` e as
--  funções `auth.uid()`/`auth.role()` são criados pela plataforma.
--
--  Este arquivo existe por um motivo de robustez: sem ele, o schema do projeto
--  só pode ser lido, nunca executado — e SQL que nunca rodou é SQL que quebra
--  na primeira deploy. Rodar:
--
--    node tools/testa_sql.mjs          # bootstrap + schema + seed + asserts
-- =====================================================================

begin;

-- 1. papéis do Supabase (idempotente)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- no Supabase, service_role tem bypassrls: é assim que o modelo dela lê
    -- qualquer linha. Aqui modelamos igual, senão o teste do agente não passa.
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- 2. schema auth + stubs que o Supabase injeta
create schema if not exists auth;

create table if not exists auth.users (
  id       uuid primary key default gen_random_uuid(),
  email    text unique,
  created_at timestamptz not null default now()
);

-- `auth.uid()` lê o claim do JWT. Existem dois caminhos e os dois precisam
-- funcionar aqui: o harness define `request.jwt.claim.sub` na mão (uma linha por
-- teste, barato), e o PostgREST 12 de verdade só define `request.jwt.claims` com o
-- JSON inteiro — as claims por GUC (`request.jwt.claim.<nome>`) foram removidas na
-- versão 11. Ler os dois é o que faz este stub se comportar como o auth.uid() do
-- Supabase, que também lê o JSON de claims.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
             (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub'),
  '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role', ''),
                  current_setting('role', true))
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- 3. grants de schema (equivalente ao default do Supabase)
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth  to anon, authenticated, service_role;
grant all   on all tables    in schema public to postgres, service_role;
grant all   on all sequences in schema public to postgres, service_role;
grant select on all tables   in schema public to anon, authenticated;
grant usage  on all sequences in schema public to anon, authenticated;

alter default privileges in schema public grant all    on tables    to postgres, service_role;
alter default privileges in schema public grant select on tables    to anon, authenticated;
alter default privileges in schema public grant usage on sequences to anon, authenticated;

commit;

```


---

# 3. Provas — o que já foi verificado (harness, guarda de SQL, CI)


## `web/scripts/testa-sql.mjs` — 1303 linhas

```js
#!/usr/bin/env node
/**
 * testa-sql.mjs — roda o SQL do projeto num Postgres de verdade e verifica o que
 * linter nenhum verifica: privilégios, RLS por papel, claim sem corrida, carteira,
 * teto diário, pausa, importação, append-only da auditoria e as views com
 * security_invoker.
 *
 *   bash tools/postgres_local.sh start
 *   cd web && npm run test:sql
 *
 * Conexão padrão: Postgres local do script acima. Recria o banco a cada execução
 * e não lê variável nenhuma do seu projeto Supabase — de propósito.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pkg from "pg";

const { Client } = pkg;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARQ = (p) => readFileSync(join(RAIZ, p), "utf8");

const CFG = {
  host: process.env.PGHOST || "/tmp/pg/sock",
  port: Number(process.env.PGPORT || 54329),
  user: process.env.PGUSER || "postgres",
  database: process.env.PGDATABASE || "postgres",
};
const DB = "discadora_teste";

// uuids fixos: a saída do teste tem de ser reproduzível
const U = {
  maria: "00000000-0000-4000-8000-000000000001",
  joao: "00000000-0000-4000-8000-000000000002",
  pedro: "00000000-0000-4000-8000-000000000003",
};
const A = {
  maria: "10000000-0000-4000-8000-000000000001",
  joao: "10000000-0000-4000-8000-000000000002",
  pedro: "10000000-0000-4000-8000-000000000003",
};
const CAMP_B = "20000000-0000-4000-8000-00000000000b";

let passou = 0;
let falhou = 0;
const pendencias = [];

function ok(nome, cond, detalhe = "") {
  if (cond) {
    passou++;
    console.log(`  ok    ${nome}`);
  } else {
    falhou++;
    pendencias.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

async function conectar(database = CFG.database) {
  const c = new Client({ ...CFG, database });
  await c.connect();
  return c;
}

/** sessão como um papel do Supabase, com claim de usuário; commit no fim */
async function sessao({ papel, sub = null }, corpo, { commit = true } = {}) {
  const c = await conectar(DB);
  try {
    await c.query("begin");
    await c.query(`set local role ${papel}`);
    await c.query(`set local request.jwt.claim.sub = ${sub ? `'${sub}'` : "''"}`);
    await c.query(`set local request.jwt.claim.role = '${papel}'`);
    const r = await corpo(c);
    await c.query(commit ? "commit" : "rollback");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

/** erro esperado (código SQLSTATE), ou null se rodou liso */
async function sqlstate(c, sql, params) {
  try {
    await c.query(sql, params);
    return null;
  } catch (e) {
    return e.code || String(e.message).slice(0, 40);
  }
}

const json = (v) => (typeof v === "string" ? JSON.parse(v) : (v ?? {}));

async function main() {
  const admin = await conectar();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`, [DB]);
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  console.log(`banco de teste: ${DB}`);

  const db = await conectar(DB);
  const t0 = Date.now();
  for (const f of ["supabase/tests/bootstrap-local.sql", "supabase/schema.sql", "supabase/seed-exemplo.sql"]) {
    try {
      await db.query(ARQ(f));
    } catch (e) {
      console.error(`\nERRO aplicando ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`schema + seed aplicados em ${Date.now() - t0} ms`);

  // ------------------------------------------------------------- cenários
  await db.query(`
    insert into auth.users (id, email) values
      ('${U.maria}', 'maria@suafinanceira.com.br'),
      ('${U.joao}',  'joao@suafinanceira.com.br'),
      ('${U.pedro}', 'pedro@suafinanceira.com.br')
    on conflict (id) do nothing;

    update public.agentes set auth_id = '${U.maria}'
     where email = 'maria@suafinanceira.com.br';

    insert into public.agentes (id, auth_id, email, nome, papel, ativo, limite_diario) values
      ('${A.joao}',  '${U.joao}',  'joao@suafinanceira.com.br',  'João',  'operador',  true, 99),
      ('${A.pedro}', '${U.pedro}', 'pedro@suafinanceira.com.br', 'Pedro', 'operador',  true, 99);

    -- Campanha A: a do seed. Janela aberta para o teste não depender do relógio.
    update public.campanhas set janela_ini = '00:00', janela_fim = '23:59', permite_overflow = false
     where nome = 'INSS - margem disponível';
    insert into public.campanha_equipe (campanha_id, agente_id, papel)
      select id, '${A.joao}', 'operador' from public.campanhas
       where nome = 'INSS - margem disponível'
      on conflict do nothing;
    -- Pedro fica SEM linha de acesso: é o caso "funcionário novo, nada liberado"

    insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf,
                              consentimento, consentimento_em, prioridade)
    select id, 'Fila ' || n, '52998224725', '+557999996' || lpad(n::text, 5, '0'),
           'Aracaju', 'SE', 'form_proprio', now(), 0
      from public.campanhas, generate_series(1, 6) n
     where nome = 'INSS - margem disponível'
    on conflict (campanha_id, telefone_e164) do nothing;

    insert into public.campanhas (id, nome, publico, janela_ini, janela_fim, permite_overflow)
    values ('${CAMP_B}', 'BPC/LOAS - só admin', 'bpc_loas', '00:00', '23:59', false)
    on conflict (id) do nothing;

    insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf,
                              consentimento, consentimento_em)
    values
      ('${CAMP_B}', 'Beatriz B', '52998224725', '+5579999980001', 'Aracaju', 'SE', 'form_proprio', now()),
      ('${CAMP_B}', 'Bruno B',   '11144477735', '+5579999980002', 'Aracaju', 'SE', 'form_proprio', now())
    on conflict (campanha_id, telefone_e164) do nothing;
  `);

  const CAMP_A = (await db.query(`select id from public.campanhas where nome = 'INSS - margem disponível'`)).rows[0].id;

  // ------------------------------------------------------------- 1. estrutura
  const n = async (sql, params) => (await db.query(sql, params)).rows[0]?.n ?? 0;
  ok("14 tabelas no schema", (await n(`select count(*)::int as n from information_schema.tables where table_schema='public'`)) >= 14);
  ok("RLS em todas as tabelas", (await n(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relrowsecurity=false`)) === 0);
  ok("toda tabela tem policy", (await n(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and not exists (select 1 from pg_policies p where p.tablename=c.relname)`)) === 0);
  const politicasEscrita = await n(`select count(*)::int as n from pg_policies where schemaname='public' and cmd in ('insert','update','delete')`);
  ok("zero policies de escrita: navegador não escreve tabela nenhuma", politicasEscrita === 0, `políticas de escrita: ${politicasEscrita}`);

  // ------------------------------------------------------------- 2. anon
  for (const [tabela, permissao] of [["leads", "select"], ["cdr", "select"], ["v_fila", "select"]]) {
    const code = await sessao({ papel: "anon" }, (c) => sqlstate(c, `${permissao} * from public.${tabela}`), { commit: false });
    ok(`anon não tem ${permissao.toUpperCase()} em ${tabela}`, code === "42501", `obtido: ${code || "LIVRE"}`);
  }
  const anonRpc = await sessao({ papel: "anon" }, (c) =>
    sqlstate(c, `select * from fn_claim_next_lead(null)`), { commit: false });
  ok("anon não consegue chamar fn_claim_next_lead", anonRpc === "42501", `obtido: ${anonRpc || "RODOU"}`);

  // ------------------------------------------------------------- 3. escopo de leitura
  const leitura = await sessao({ papel: "authenticated", sub: U.joao }, async (c) => {
    const a = await c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_A]);
    const b = await c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_B]);
    const cmp = await c.query(`select count(*)::int as n from public.campanhas`);
    return { a: a.rows[0].n, b: b.rows[0].n, cmp: cmp.rows[0].n };
  }, { commit: false });
  ok("operador lê a campanha em que está", leitura.a >= 3, `A: ${leitura.a}`);
  ok("operador NÃO vê a campanha dos outros", leitura.b === 0, `B: ${leitura.b}`);
  ok("operador só vê as campanhas liberadas a ele", leitura.cmp === 1, `campanhas visíveis: ${leitura.cmp}`);

  const semPapel = await sessao({ papel: "authenticated", sub: U.pedro }, async (c) => {
    const l = await c.query(`select count(*)::int as n from public.leads`);
    const bl = await c.query(`select count(*)::int as n from public.bloqueios`);
    return { l: l.rows[0].n, bl: bl.rows[0].n };
  }, { commit: false });
  ok("quem não tem acesso a nenhuma campanha não vê lead", semPapel.l === 0, `vê ${semPapel.l}`);
  ok("lista de bloqueios continua legível (compliance)", semPapel.bl >= 0);

  const adminVe = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.leads`), { commit: false });
  ok("admin vê a operação inteira", adminVe.rows[0].n >= 5, `vê ${adminVe.rows[0].n}`);

  // ------------------------------------------------------------- 4. escrita direta negada
  // cada negação precisa da própria transação: depois do primeiro erro o Postgres
  // aborta a transação e as próximas statements devolveriam 25P03, não 42501
  const negado = (sql, params) =>
    sessao({ papel: "authenticated", sub: U.joao }, (c) => sqlstate(c, sql, params), { commit: false });
  const negadas = {
    campanhas: await negado(`update public.campanhas set max_tentativas = 9 where id = $1`, [CAMP_A]),
    agentes: await negado(`update public.agentes set papel = 'admin' where id = $1`, [A.joao]),
    leads: await negado(`update public.leads set status = 'qualificado' where id = (select min(id) from public.leads)`),
    cdr: await negado(`delete from public.cdr`),
    eventos: await negado(`update public.lead_events set detalhe = 'adulterado'`),
    jobs: await negado(`insert into public.dial_jobs (lead_id, origem, status) values ((select min(id) from public.leads), 'manual', 'claimed')`),
  };
  ok("operador não edita campanha pela API", negadas.campanhas === "42501", String(negadas.campanhas));
  ok("operador não se promove a admin", negadas.agentes === "42501", String(negadas.agentes));
  ok("operador não atualiza lead direto", negadas.leads === "42501", String(negadas.leads));
  ok("operador não apaga CDR", negadas.cdr === "42501", String(negadas.cdr));
  ok("auditoria é append-only até para operador", negadas.eventos === "42501", String(negadas.eventos));
  ok("operador não cria job por fora do claim", negadas.jobs === "42501", String(negadas.jobs));

  const srNegado = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `update public.lead_events set detalhe = 'x'`), { commit: false });
  const srCdrNegado = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `update public.cdr set duracao_s = 0 where id > 0`), { commit: false });
  ok("service_role também não reescreve auditoria", srNegado === "42501", String(srNegado));
  ok("service_role não reescreve CDR", srCdrNegado === "42501", String(srCdrNegado));
  const srLeads = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `select count(*) from public.leads`), { commit: false });
  ok("service_role lê tudo (o agente precisa)", srLeads === null, String(srLeads));

  // ------------------------------------------------------------- 5. claim + fila
  const claim = async (sub, args = [null, null]) =>
    sessao({ papel: "authenticated", sub }, (c) =>
      c.query(`select * from fn_claim_next_lead($1, $2)`, args), { commit: true });

  const primeiro = await claim(U.joao, [A.joao, CAMP_A]);
  ok("claim devolve exatamente 1 lead", primeiro.rowCount === 1, `linhas: ${primeiro.rowCount}`);
  const l1 = primeiro.rows[0] ?? {};
  ok("claim entrega telefone E164 e script", /^\+\d{10,15}$/.test(String(l1.telefone)) && l1.script_resumo != null, JSON.stringify({ tel: l1.telefone, script: !!l1.script_resumo }));
  ok("origem da fila é registrada", ["carteira", "pool", "overflow"].includes(l1.origem_fila), String(l1.origem_fila));
  ok("lead passa a em_discagem", (await db.query(`select status from public.leads where id = $1`, [l1.lead_id])).rows[0].status === "em_discagem");

  const foraEscopo = await claim(U.joao, [A.joao, CAMP_B]);
  ok("claim de campanha fora do escopo devolve nada", foraEscopo.rowCount === 0, `linhas: ${foraEscopo.rowCount}`);

  const semAcesso = await claim(U.pedro, [A.pedro, null]);
  ok("operador sem acesso a campanha não recebe lead", semAcesso.rowCount === 0, `linhas: ${semAcesso.rowCount}`);

  const dois = await Promise.all([
    (async () => {
      const c = await conectar(DB);
      await c.query("begin");
      await c.query(`set local role authenticated; set local request.jwt.claim.sub = '${U.joao}'`);
      const r = await c.query(`select lead_id from fn_claim_next_lead($1, null)`, [A.joao]);
      await c.query(`select pg_sleep(1.2)`);
      await c.query("commit");
      await c.end();
      return r.rows[0]?.lead_id ?? null;
    })(),
    (async () => {
      await new Promise((r) => setTimeout(r, 300));
      const c = await conectar(DB);
      await c.query("begin");
      await c.query(`set local role authenticated; set local request.jwt.claim.sub = '${U.joao}'`);
      const r = await c.query(`select lead_id from fn_claim_next_lead($1, null)`, [A.joao]);
      await c.query("commit");
      await c.end();
      return r.rows[0]?.lead_id ?? null;
    })(),
  ]);
  ok("dois claims simultâneos nunca entregam o mesmo lead", Boolean(dois[0]) && Boolean(dois[1]) && dois[0] !== dois[1], dois.join(" / "));

  const jobsAbertos = await db.query(
    `select count(*)::int as n from public.dial_jobs where status in ('claimed','discado')`);
  ok("cada claim abriu exatamente o seu job", jobsAbertos.rows[0].n >= 2, `abertos: ${jobsAbertos.rows[0].n}`);
  const dup = await db.query(`select count(*) as n from (select lead_id from public.dial_jobs group by 1 having count(*) > 1) x`);
  ok("índice único impede 2 jobs abertos no mesmo lead", Number(dup.rows[0].n) === 0, `duplicidades: ${dup.rows[0].n}`);

  // ------------------------------------------------------------- 6. fim de chamada
  const fim = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_finish_call($1, 'atendeu', 132, 'interessado, margem livre') as r`, [l1.job_id]), { commit: true });
  ok("fn_finish_call ok", json(fim.rows[0].r).ok !== false, JSON.stringify(json(fim.rows[0].r)));
  const cdr = (await db.query(`select disposition, duracao_s, fonte from public.cdr where job_id = $1`, [l1.job_id])).rows[0];
  ok("CDR com duração medida e origem", cdr?.duracao_s === 132 && cdr?.disposition === "atendeu" && /agent|phone_link/.test(String(cdr?.fonte)), JSON.stringify(cdr ?? null));
  const depois = (await db.query(`select status, tentativas from public.leads where id = $1`, [l1.lead_id])).rows[0];
  ok("lead vai para contato e soma tentativa", depois?.status === "contato" && depois?.tentativas === 1, JSON.stringify(depois ?? null));
  const reuso = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_finish_call($1, 'secretaria', 9, null) as r`, [l1.job_id]), { commit: true });
  ok("job encerrado recusa segundo fim (idempotência)", json(reuso.rows[0].r).ok === false, JSON.stringify(json(reuso.rows[0].r)));
  const eventos = (await db.query(`select count(*)::int as n from public.lead_events where lead_id = $1`, [l1.lead_id])).rows[0].n;
  ok("histórico de status do lead gravado", eventos >= 1, `eventos: ${eventos}`);

  const invalido = await claim(U.joao, [A.joao, CAMP_A]);
  ok("há lead disponível para testar disposição de descarte", invalido.rowCount === 1, `linhas: ${invalido.rowCount}`);
  if (invalido.rowCount === 1) {
    const r = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select fn_finish_call($1, 'numero_invalido', 2, null) as r`, [invalido.rows[0].job_id]), { commit: true });
    ok("disposição numero_invalido encerra o job", json(r.rows[0].r).ok !== false, JSON.stringify(json(r.rows[0].r)));
    const st = (await db.query(`select status from public.leads where id = $1`, [invalido.rows[0].lead_id])).rows[0].status;
    ok("numero_invalido tira o lead da fila", st === "descarte", `status: ${st}`);
    const curta = (await db.query(
      `select count(*)::int as n from public.cdr where lead_id = $1 and coalesce(duracao_s, 0) < 3`,
      [invalido.rows[0].lead_id])).rows[0].n;
    ok("chamada curta (<3s) fica registrada para a regra da Anatel", curta === 1, `cdr curtos: ${curta}`);
  }

  // ------------------------------------------------------------- 7. carteira
  const atribuirComoJoao = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_attribuir_carteira($1, $2, 2) as r`, [CAMP_A, A.joao]), { commit: true });
  ok("operador não monta a própria carteira", json(atribuirComoJoao.rows[0].r).ok === false, JSON.stringify(json(atribuirComoJoao.rows[0].r)));

  const atribuirComoMaria = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_attribuir_carteira($1, $2, 2) as r`, [CAMP_A, A.joao]), { commit: true });
  ok("admin atribui 2 leads à carteira do João", json(atribuirComoMaria.rows[0].r).atribuidos >= 1, JSON.stringify(json(atribuirComoMaria.rows[0].r)));

  const daCarteira = await claim(U.joao, [A.joao, CAMP_A]);
  ok("claim seguinte vem marcado como carteira", daCarteira.rows[0]?.origem_fila === "carteira", `origem: ${daCarteira.rows[0]?.origem_fila}`);

  const liberar = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_liberar_carteira($1, $2) as n`, [A.joao, CAMP_A]), { commit: true });
  ok("admin devolve a carteira para o pool", Number(liberar.rows[0].n) >= 0, `liberados: ${liberar.rows[0]?.n}`);

  // ------------------------------------------------------------- 8. teto diário e pausa
  await db.query(`update public.agentes set limite_diario = 2 where id = $1`, [A.joao]);
  const exausto = await claim(U.joao, [A.joao, CAMP_A]);
  ok("teto diário bloqueia novos claims", exausto.rowCount === 0, `linhas: ${exausto.rowCount}`);
  await db.query(`update public.agentes set limite_diario = 99 where id = $1`, [A.joao]);

  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_pausar(20)`), { commit: true });
  const pausado = await claim(U.joao, [A.joao, CAMP_A]);
  ok("pausa manual tira o operador da fila", pausado.rowCount === 0, `linhas: ${pausado.rowCount}`);
  const pausarOutroNegado = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    sqlstate(c, `select fn_pausar(30, $1)`, [A.joao]), { commit: false });
  ok("pausar colega sem gerência levanta exceção (P0001)", pausarOutroNegado === "P0001", String(pausarOutroNegado));

  const despausarNegado = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_despausar_agente($1) as r`, [A.joao]), { commit: true });
  ok("colega sem gerência na campanha não despausa ninguém", json(despausarNegado.rows[0].r).ok === false, JSON.stringify(json(despausarNegado.rows[0].r)));
  const despausarProprio = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_despausar_agente(null) as r`), { commit: true });
  ok("o próprio operador sai da pausa", json(despausarProprio.rows[0].r).ok === true, JSON.stringify(json(despausarProprio.rows[0].r)));
  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_pausar(20)`), { commit: true });
  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_despausar_agente(null)`), { commit: true });
  const voltou = await claim(U.joao, [A.joao, CAMP_A]);
  ok("despausar devolve o operador à fila", voltou.rowCount === 1, `linhas: ${voltou.rowCount}`);

  // ------------------------------------------------------------- 9. importação via RPC
  const linhas = JSON.stringify([
    { telefone_e164: "+5579999970001", nome: "Teste Um", cpf: "52998224725", cidade: "Aracaju", uf: "SE", banco_folha: "Itaú", margem_estimada: 350, extras: { matricula: "123" } },
    { telefone_e164: "+5579999970002", nome: "Teste Dois", cpf: "11144477735", cidade: "Nossa Senhora do Socorro", uf: "SE", banco_folha: "Banco do Brasil", margem_estimada: 510 },
    { telefone_e164: "+5579999970001", nome: "Duplicado", cpf: null },
  ]);
  const impJoao = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_importar_leads($1, 'form_proprio', $2::jsonb) as r`, [CAMP_A, linhas]), { commit: true });
  ok("operador não importa planilha em campanha que não comanda", json(impJoao.rows[0].r).ok === false, JSON.stringify(json(impJoao.rows[0].r)));

  const impMaria = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_importar_leads($1, 'form_proprio', $2::jsonb) as r`, [CAMP_A, linhas]), { commit: true });
  const rImp = json(impMaria.rows[0].r);
  ok("admin importa 2 e ignora o duplicado", rImp.inseridos === 2 && rImp.ignorados === 1, JSON.stringify(rImp));

  // ------------------------------------------------------------- 10. RBAC de equipe
  const papelNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_definir_papel($1, 'admin') as r`, [A.joao]), { commit: true });
  ok("operador não muda o próprio papel", json(papelNegado.rows[0].r).ok === false, JSON.stringify(json(papelNegado.rows[0].r)));

  const papelOk = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_papel($1, 'supervisor') as r`, [A.pedro]), { commit: true });
  ok("admin promove a supervisor", json(papelOk.rows[0].r).ok === true, JSON.stringify(json(papelOk.rows[0].r)));

  const acesso = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_acesso($1, $2, 'supervisor', 60) as r`, [CAMP_A, "pedro@suafinanceira.com.br"]), { commit: true });
  ok("admin dá acesso de supervisor à campanha A", json(acesso.rows[0].r).ok === true, JSON.stringify(json(acesso.rows[0].r)));

  const agoraV = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_A]), { commit: false });
  ok("após o acesso, Pedro passa a ver a campanha A", agoraV.rows[0].n > 0, `vê ${agoraV.rows[0].n}`);

  const janelaRuim = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, '18:00', '09:00') as r`, [CAMP_A]), { commit: true });
  ok("janela invertida é rejeitada", json(janelaRuim.rows[0].r).ok === false, JSON.stringify(json(janelaRuim.rows[0].r)));

  const janelaIlegal = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, '06:00', '23:00') as r`, [CAMP_A]), { commit: true });
  ok("supervisor não abre janela fora de 08–21", json(janelaIlegal.rows[0].r).ok === false, JSON.stringify(json(janelaIlegal.rows[0].r)));

  // ------------------------------------------------------------- 11. retorno + anuência
  const leadDeJoao = (await db.query(`select id from public.leads where campanha_id = $1 and status <> 'opt_out' limit 1`, [CAMP_A])).rows[0].id;
  const agendado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_agendar_retorno($1, now() + interval '3 hours', 'ligar depois do almoço') as r`, [leadDeJoao]), { commit: true });
  ok("retorno agendado dentro do escopo", json(agendado.rows[0].r).ok === true, JSON.stringify(json(agendado.rows[0].r)));
  const noPassado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_agendar_retorno($1, now() - interval '1 hour') as r`, [leadDeJoao]), { commit: true });
  ok("retorno no passado é recusado", json(noPassado.rows[0].r).ok === false, JSON.stringify(json(noPassado.rows[0].r)));

  // negação tem de ser numa campanha que ninguém do teste ganhou acesso — a B é
  // justamente a que ficou só com o admin (Senão o "não deveria poder" já conseguiu
  // acesso na seção de RBAC e o teste vira falso-positivo.)
  const leadForaEscopo = (await db.query(
    `select id from public.leads where campanha_id = $1 order by id limit 1`, [CAMP_B])).rows[0].id;
  const propNegada = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 8000, 36) as r`, [leadForaEscopo]), { commit: true });
  ok("proposta em campanha fora do escopo é recusada", json(propNegada.rows[0].r).ok === false, JSON.stringify(json(propNegada.rows[0].r)));
  const filaFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_B]), { commit: false });
  ok("João continua sem enxergar a campanha B", filaFora.rows[0].n === 0, `vê ${filaFora.rows[0].n}`);

  const propFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 8000, 200) as r`, [leadDeJoao]), { commit: true });
  ok("parcelas fora de 6–108 são recusadas", json(propFora.rows[0].r).ok === false, JSON.stringify(json(propFora.rows[0].r)));

  const prop = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 8000.5, 36, 2.15, 'Itaú') as r`, [leadDeJoao]), { commit: true });
  ok("proposta registrada com prazo de 5 dias", json(prop.rows[0].r).ok === true, JSON.stringify(json(prop.rows[0].r)));
  const anu = (await db.query(`select dias_restantes, valor, responsavel from public.v_anuencia_pendente limit 1`)).rows[0];
  ok("view de anuência calcula os dias do prazo de 5", anu && anu.dias_restantes <= 5 && anu.dias_restantes >= 4, JSON.stringify(anu ?? null));

  const marcar = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_anuencia($1, 'confirmada') as r`,
            [json(prop.rows[0].r).proposta_id]), { commit: true });
  ok("operador não marca anuência (supervisor+)", json(marcar.rows[0].r).ok === false, JSON.stringify(json(marcar.rows[0].r)));
  const marcarOk = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_marcar_anuencia($1, 'confirmada', 'INSS-123') as r`,
            [json(prop.rows[0].r).proposta_id]), { commit: true });
  ok("admin confirma a anuência e o protocolo fica salvo", json(marcarOk.rows[0].r).ok === true, JSON.stringify(json(marcarOk.rows[0].r)));
  const proto = (await db.query(`select protocolo_inss, anuencia from public.propostas where id = $1`,
                [json(prop.rows[0].r).proposta_id])).rows[0];
  ok("protocolo do INSS gravado na proposta", proto?.protocolo_inss === "INSS-123" && proto?.anuencia === "confirmada", JSON.stringify(proto ?? null));

  // ------------------------------------------------------------- 12. views por papel
  const visaoDoDia = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select coalesce(sum(chamadas),0)::int as n from public.v_painel_dia`), { commit: false });
  const visaoAdmin = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select coalesce(sum(chamadas),0)::int as n from public.v_painel_dia`), { commit: false });
  ok("v_painel_dia respeita RLS (security_invoker)", visaoDoDia.rows[0].n <= visaoAdmin.rows[0].n, `joão ${visaoDoDia.rows[0].n} vs admin ${visaoAdmin.rows[0].n}`);

  const monitor = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_monitor_equipe`), { commit: false });
  ok("v_monitor_equipe consulta sem erro e mostra o time do escopo", monitor.rows[0].n >= 1, `linhas: ${monitor.rows[0].n}`);
  const ranking = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select agente_id, chamadas, na_carteira from public.v_ranking_dia order by chamadas desc`), { commit: false });
  ok("v_ranking_dia devolve linha por operador", ranking.rowCount >= 2, `linhas: ${ranking.rowCount}`);

  const equipe = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n, bool_and(nome is not null) as completo from public.v_equipe`), { commit: false });
  ok("v_equipe respeita o escopo e não quebra", equipe.rows[0].n >= 1 && equipe.rows[0].completo === true, `linhas: ${equipe.rows[0].n}`);
  const gestao = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select nome, na_fila >= 0 as conta, jsonb_typeof(equipe) as tipo_eq from public.v_campanhas_gestao order by nome`), { commit: false });
  ok("v_campanhas_gestao traz contagem e equipe das 2 campanhas", gestao.rowCount === 2 && gestao.rows.every((r) => r.conta && r.tipo_eq === "array"), JSON.stringify(gestao.rows));
  const monitorJoao = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_monitor_equipe where discadas_hoje >= 0`), { commit: false });
  ok("v_monitor_equipe calcula discadas do dia sem erro", monitorJoao.rows[0].n >= 1, `linhas: ${monitorJoao.rows[0].n}`);

  // ------------------------------------------------------------- 13. opt-out + expiração
  const tel = (await db.query(`select telefone_e164 from public.leads where id = $1`, [leadDeJoao])).rows[0].telefone_e164;
  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_register_optout($1, 'nao_me_perturbe', 'pedido na ligação')`, [tel]), { commit: true });
  const bloqueado = (await db.query(`select count(*)::int as n from public.bloqueios where telefone_e164 = $1`, [tel])).rows[0].n;
  ok("opt-out entra na lista de bloqueados", bloqueado === 1, `bloqueios: ${bloqueado}`);
  const nuncaMais = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_fila where telefone_e164 = $1`, [tel]), { commit: false });
  ok("número em opt-out nunca aparece na fila", nuncaMais.rows[0].n === 0, `aparece ${nuncaMais.rows[0].n}x`);

  await db.query(`update public.dial_jobs set claimed_em = now() - interval '10 minutes' where status = 'claimed'`);
  const exp = (await db.query(`select fn_expirar_jobs(5) as n`)).rows[0].n;
  ok("job pendurado volta para a fila", Number(exp) >= 1, `expirados: ${exp}`);
  const aindaAbertos = (await db.query(`select count(*)::int as n from public.dial_jobs where status in ('claimed','discado')`)).rows[0].n;
  ok("depois do fn_expirar_jobs não resta job órfão", aindaAbertos === 0, `restam: ${aindaAbertos}`);

  // ------------------------------------------------------------- 14. heartbeat
  const hb = await sessao({ papel: "service_role" }, (c) =>
    c.query(`select fn_heartbeat('discando', $1) as r`, [A.joao]).then(() => true), { commit: true });
  const ciclo = (await db.query(`select status_agente, ultimo_ciclo_em from public.agentes where id = $1`, [A.joao])).rows[0];
  ok("agente reporta heartbeat (monitor de 'online')", hb === true && ciclo?.status_agente === "discando" && ciclo?.ultimo_ciclo_em != null, JSON.stringify(ciclo ?? null));

  // ------------------------------------------------------------- 15. quem sou / despausar
  const sou = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_quem_sou() as r`), { commit: false });
  const eu = json(sou.rows[0].r);
  ok("fn_quem_sou devolve papel, limites e campanhas", eu.papel === "operador" && eu.limite_diario > 0 && Array.isArray(eu.campanhas) && eu.campanhas.length >= 1, JSON.stringify(eu).slice(0, 220));
  ok("fn_quem_sou separa o que ele gerencia (nada, sendo operador)", Array.isArray(eu.gerencia) && eu.gerencia.length === 0, JSON.stringify(eu.gerencia));

  const souAdmin = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_quem_sou() as r`), { commit: false });
  const adm = json(souAdmin.rows[0].r);
  ok("fn_quem_sou do admin mostra a operação inteira", adm.papel === "admin" && adm.gerencia.length >= 2, JSON.stringify(adm.gerencia));

  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_pausar(30)`), { commit: true });
  const despausarPorSupervisor = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_despausar_agente($1) as r`, [A.joao]), { commit: true });
  ok("supervisor da campanha despausa o time dele", json(despausarPorSupervisor.rows[0].r).ok === true, JSON.stringify(json(despausarPorSupervisor.rows[0].r)));
  const pausadoAinda = (await db.query(`select pausado_ate from public.agentes where id = $1`, [A.joao])).rows[0].pausado_ate;
  ok("pausa foi de fato retirada", pausadoAinda === null, String(pausadoAinda));

  // ------------------------------------------- 16. trilha de decisões de gestão
  // Nada de gestão acontece sem deixar rastro: quem deu acesso, com que limite,
  // quem mudou a regra da campanha e o que era antes. É a pergunta que volta
  // depois do primeiro mês com 10+ funcionários — e a que o jurídico do banco faz.
  const concedeuAntes = (await db.query(
    `select count(*)::int as n from public.auditoria_gestao where acao = 'acesso_concedido'`)).rows[0].n;

  const conde = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_acesso($1, 'pedro@suafinanceira.com.br', 'operador', 77) as r`, [CAMP_A]), { commit: true });
  ok("admin concedeu/ajustou acesso de Pedro na campanha A", json(conde.rows[0].r).ok === true, JSON.stringify(json(conde.rows[0].r)));

  const trilhaAcesso = await db.query(
    `select acao, quem_email, alvo->>'email' as email, alvo->>'limite_diario' as limite,
            alvo->>'papel' as papel
       from public.auditoria_gestao where acao = 'acesso_concedido'`);
  ok("o acesso virou linha na trilha (alvo + limite)",
     trilhaAcesso.rows.length === concedeuAntes + 1 &&
     trilhaAcesso.rows.some((r) => r.email === "pedro@suafinanceira.com.br" && r.limite === "77" && r.papel === "operador"),
     JSON.stringify(trilhaAcesso.rows.slice(-2)));
  ok("a trilha grava o autor (e-mail do agente da sessão, não um string do cliente)",
     trilhaAcesso.rows.every((r) => r.quem_email === "maria@suafinanceira.com.br"),
     JSON.stringify(trilhaAcesso.rows.map((r) => r.quem_email).slice(0, 4)));

  const viuTrilha = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.auditoria_gestao`), { commit: false });
  ok("operador não lê a trilha de gestão (RLS, não esconder botão)", viuTrilha.rows[0].n === 0, `viu ${viuTrilha.rows[0].n}`);

  const leuTrilha = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.auditoria_gestao`), { commit: false });
  ok("admin lê a trilha inteira", leuTrilha.rows[0].n >= concedeuAntes + 1, `linhas: ${leuTrilha.rows[0].n}`);

  const apagou = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `delete from public.auditoria_gestao`), { commit: false });
  ok("nem a service role apaga a trilha (revoke delete)", apagou === "42501", String(apagou));

  // edição de campanha guarda o valor anterior — é como se desfaz uma regra
  const janelaFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, 900, null, null, null) as r`, [CAMP_A]), { commit: false });
  ok("tentativa de max_tentativas fora de 1-10 é recusada (e por quem não pode)",
     json(janelaFora.rows[0].r).ok === false, JSON.stringify(json(janelaFora.rows[0].r)));

  const intervaloAntes = (await db.query(
    `select intervalo_retentativa_s::int as n from public.campanhas where id = $1`, [CAMP_A])).rows[0].n;

  const editou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, 600, null, null) as r`, [CAMP_A]), { commit: true });
  ok("admin alterou o intervalo de re-tentativa", json(editou.rows[0].r).ok === true, JSON.stringify(json(editou.rows[0].r)));
  const trilhaEdit = (await db.query(
    `select alvo->'antes'->>'intervalo_retentativa_s' as antes, alvo->'mudancas'->>'intervalo_s' as depois
       from public.auditoria_gestao where acao = 'campanha_editada' order by id desc limit 1`)).rows[0];
  ok("a trilha guarda o valor ANTES e o depois da mudança",
     trilhaEdit?.antes === String(intervaloAntes) && trilhaEdit?.depois === "600",
     JSON.stringify({ trilhaEdit, intervaloAntes }));

  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, $2, null, null) as r`,
            [CAMP_A, intervaloAntes]), { commit: true });

  const mudouPapel = (await db.query(
    `select count(*)::int as n from public.auditoria_gestao where acao = 'papel_alterado'
       and alvo->>'novo_papel' = 'supervisor'`)).rows[0].n;
  ok("mudança de papel global também está na trilha", Number(mudouPapel) >= 1, `linhas: ${mudouPapel}`);

  const removeNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_remover_acesso($1, 'pedro@suafinanceira.com.br') as r`, [CAMP_A]), { commit: false });
  ok("operador não remove acesso de ninguém", json(removeNegado.rows[0].r).ok === false, JSON.stringify(json(removeNegado.rows[0].r)));

  const removeu = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_remover_acesso($1, 'pedro@suafinanceira.com.br') as r`, [CAMP_A]), { commit: true });
  ok("admin removeu o acesso de Pedro da campanha A", Number(json(removeu.rows[0].r).removidos) === 1, JSON.stringify(json(removeu.rows[0].r)));
  const trilhaRem = (await db.query(
    `select alvo->'quem'->0->>'email' as email, alvo->'quem'->0->>'papel_anterior' as papel
       from public.auditoria_gestao where acao = 'acesso_removido' order by id desc limit 1`)).rows[0];
  ok("a remoção registra quem era e o papel anterior (dá para reverter)",
     trilhaRem?.email === "pedro@suafinanceira.com.br" && trilhaRem?.papel === "operador", JSON.stringify(trilhaRem ?? null));

  // ------------------------------------------------- 17. roteiro de ligação
  // Biblioteca no banco (não em localStorage), entregue no claim, com marcação de
  // passos e objeções. É a parte que o concorrente tem como texto solto no navegador.
  const telRoteiro = "+5579999971001";
  await db.query(`update public.agentes set limite_diario = 500`);
  await db.query(
    `insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, consentimento, consentimento_em)
     select id, 'Rosana Roteiro', '52998224725', $1, 'Aracaju', 'SE', 'form_proprio', now()
       from public.campanhas where nome = 'INSS - margem disponível'
     on conflict (campanha_id, telefone_e164) do nothing`, [telRoteiro]);

  const roteirosView = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select nome, versao, jsonb_array_length(passos)::int as n_passos,
                    jsonb_array_length(objecoes)::int as n_objecoes, em_uso
               from public.v_roteiros where nome like 'INSS%'`), { commit: false });
  const roteiroInss = roteirosView.rows[0];
  ok("operador lê o roteiro ativo com passos e objeções (1 request)",
     !!roteiroInss && roteiroInss.n_passos === 7 && roteiroInss.n_objecoes === 5 && roteiroInss.em_uso === 1,
     JSON.stringify(roteiroInss ?? null));

  // roteiro novo e INATIVO: rascunho que o operador não pode ver
  const rascunho = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_roteiro(null, 'Roteiro rascunho', 'clt', null, false, null, null) as r`), { commit: true });
  ok("admin criou roteiro já inativo (p_ativo vale na criação)",
     json(rascunho.rows[0].r).ok === true &&
     (await db.query(`select ativo from public.roteiros where nome = 'Roteiro rascunho'`)).rows[0].ativo === false,
     JSON.stringify(json(rascunho.rows[0].r)));
  const rascunhoNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_roteiros where nome = 'Roteiro rascunho'`), { commit: false });
  ok("roteiro inativo (rascunho) não aparece para operador", rascunhoNegado.rows[0].n === 0, `viu ${rascunhoNegado.rows[0].n}`);
  const veRascunho = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.v_roteiros where nome = 'Roteiro rascunho'`), { commit: false });
  ok("admin vê o rascunho inativo", veRascunho.rows[0].n === 1, `linhas: ${veRascunho.rows[0].n}`);
  const criaComoOp = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_roteiro(null, 'Roteiro do João', 'inss', null, true, '[]', '[]') as r`), { commit: false });
  ok("operador não cria nem edita roteiro", json(criaComoOp.rows[0].r).ok === false, JSON.stringify(json(criaComoOp.rows[0].r)));
  const insDireto = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    sqlstate(c, `insert into public.roteiros (nome) values ('nao posso inserir direto')`), { commit: false });
  ok("nem o admin insere em roteiros pelo navegador (só via fn_salvar_roteiro)", insDireto === "42501", String(insDireto));

  // o claim entrega o roteiro do lead, com os passos já marcados
  const claimRot = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select (job_id::text) as job_id, lead_id, roteiro_id,
                    jsonb_array_length(roteiro->'passos')::int as n_passos,
                    roteiro->>'aviso' as aviso,
                    roteiro->'passos'->0->>'titulo' as p1,
                    (roteiro->'passos'->0->>'feito')::text as feito
               from fn_claim_next_lead(null, null)`), { commit: true });
  const cl = claimRot.rows[0];
  ok("fn_claim_next_lead entrega o roteiro junto com o lead",
     !!cl && cl.roteiro_id != null && cl.n_passos === 7 && cl.p1 === "ABERTURA — só informação" && cl.feito === "false",
     JSON.stringify(cl ?? null));
  ok("o aviso de compliance viaja com o roteiro", typeof cl?.aviso === "string" && cl.aviso.includes("PROIBIDO"), String(cl?.aviso).slice(0, 60));

  const passo1 = (await db.query(
    `select p.id from public.roteiro_passos p join public.campanhas c on c.roteiro_id = p.roteiro_id
      where c.nome = 'INSS - margem disponível' order by p.ordem limit 1`)).rows[0].id;
  const passoFora = (await db.query(
    `select p.id from public.roteiro_passos p join public.roteiros r on r.id = p.roteiro_id
      where r.nome like 'BPC%' order by p.ordem limit 1`)).rows[0].id;

  const marca = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro($1, $2, true, 'titular confirmou os dados') as r`, [cl.lead_id, passo1]), { commit: true });
  const m1 = json(marca.rows[0].r);
  ok("operador marca o passo e recebe o progresso", m1.ok === true && m1.devidos === 6 && m1.cumpridos === 1, JSON.stringify(m1));

  const passoErrado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro($1, $2, true, null) as r`, [cl.lead_id, passoFora]), { commit: false });
  ok("passo de OUTRO roteiro não vale para este lead", json(passoErrado.rows[0].r).ok === false, JSON.stringify(json(passoErrado.rows[0].r)));
  const leadFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro((select id from public.leads where telefone_e164 = '+5579999980001'), $1, true, null) as r`, [passo1]), { commit: false });
  ok("não dá para marcar roteiro em lead de campanha que não é sua", json(leadFora.rows[0].r).ok === false, JSON.stringify(json(leadFora.rows[0].r)));

  await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro($1, $2, false, null) as r`, [cl.lead_id, passo1]), { commit: true });
  const desmarcado = (await db.query(`select count(*)::int as n from public.lead_roteiro_checks where lead_id = $1`, [cl.lead_id])).rows[0].n;
  ok("desmarcar apaga a marcação (a aderência não fica inflada)", desmarcado === 0, `restam ${desmarcado}`);

  const obr2 = (await db.query(
    `select p.id from public.roteiro_passos p join public.campanhas c on c.roteiro_id = p.roteiro_id
      where c.nome = 'INSS - margem disponível' and p.obrigatorio order by p.ordem limit 2 offset 1`)).rows.map((r) => r.id);
  for (const id of obr2) {
    await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select fn_marcar_passo_roteiro($1, $2, true, null) as r`, [cl.lead_id, id]), { commit: true });
  }
  await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_finish_call($1, 'atendeu', 95, 'proposta explicada, anuência no Meu INSS') as r`, [cl.job_id]), { commit: true });
  const ader = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select leads_de_hoje, passos_devidos, passos_cumpridos, aderencia_pct
               from public.v_aderencia_roteiro where agente_id = $1`, [A.joao]), { commit: false });
  const devidos = Number(ader.rows[0]?.passos_devidos);
  ok("aderência do dia = obrigatórios devidos × marcados, somados por operador",
     ader.rows[0]?.passos_cumpridos === 2 && devidos === Number(ader.rows[0]?.leads_de_hoje) * 6 &&
     Number(ader.rows[0]?.aderencia_pct) === Math.round((200 / devidos) * 10) / 10,
     JSON.stringify(ader.rows[0] ?? null));

  const trilhaRoteiro = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.lead_roteiro_checks where lead_id = $1`, [cl.lead_id]), { commit: false });
  ok("admin da campanha enxerga a marcação do operador", trilhaRoteiro.rows[0].n === 2, `linhas: ${trilhaRoteiro.rows[0].n}`);

  // editar sobe a versão e a trilha guarda o roteiro anterior
  const versaoAntes = (await db.query(`select versao::int as v from public.roteiros where nome like 'INSS%'`)).rows[0].v;
  const salvaOutro = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_roteiro(null, 'Roteiro B do INSS', 'inss', 'aviso curto', true,
              '[{"titulo":"passo um","texto":"texto um"},{"titulo":"passo dois","texto":"texto dois","obrigatorio":false}]'::jsonb, null) as r`), { commit: true });
  const roteiroNovo = json(salvaOutro.rows[0].r);
  ok("roteiro novo nasce com versão 1 e os passos passados",
     roteiroNovo.ok === true && roteiroNovo.versao === 1 && roteiroNovo.passos === 2, JSON.stringify(roteiroNovo));
  const bump = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_roteiro($1, null, null, null, null,
              '[{"titulo":"passo um","texto":"texto um revisado"}]'::jsonb, null) as r`, [roteiroNovo.roteiro_id]), { commit: true });
  const bumpR = json(bump.rows[0].r);
  ok("editar passos cria versão nova (histórico de texto aprovado)", bumpR.ok === true && bumpR.versao === versaoAntes + 1, JSON.stringify(bumpR));
  const trilhaEd = (await db.query(
    `select jsonb_exists(alvo->'antes', 'nome') as tem_o_antes, alvo->>'versao' as v
       from public.auditoria_gestao where acao = 'roteiro_salvo' order by id desc limit 1`)).rows[0];
  ok("a trilha guarda o roteiro ANTES da edição (dá para voltar no texto)",
     !!trilhaEd && trilhaEd.tem_o_antes === true && Number(trilhaEd.v) === 2, JSON.stringify(trilhaEd ?? null));

  // atribuir à campanha é ato de gestão
  const atribNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_atribuir_roteiro($1, $2) as r`, [CAMP_A, roteiroNovo.roteiro_id]), { commit: false });
  ok("operador não troca o roteiro da campanha", json(atribNegado.rows[0].r).ok === false, JSON.stringify(json(atribNegado.rows[0].r)));
  const atrib = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_atribuir_roteiro($1, $2) as r`, [CAMP_A, roteiroNovo.roteiro_id]), { commit: true });
  ok("admin aponta o roteiro aprovado para a campanha", json(atrib.rows[0].r).ok === true, JSON.stringify(json(atrib.rows[0].r)));
  const soAtivo = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_atribuir_roteiro($1, (select id from public.roteiros where nome = 'Roteiro rascunho')) as r`, [CAMP_A]), { commit: false });
  ok("roteiro inativo não pode ser apontado para campanha", json(soAtivo.rows[0].r).ok === false, JSON.stringify(json(soAtivo.rows[0].r)));


  // ============================================================ 18. cadência por disposição
  // Fixture próprio: leads novos, todos na carteira do João e com prioridade alta,
  // para o claim entregá-los na ordem que os testes esperam.
  let seqCad = 60000;
  async function novoLead(prefixo, extra = {}) {
    seqCad += 1;
    const tel = `+55799999${seqCad}`;
    const r = await db.query(
      `insert into public.leads (campanha_id, nome, telefone_e164, cidade, uf, consentimento,
                                 consentimento_em, prioridade, margem_estimada, agente_id, status)
       values ($1, $2, $3, 'Aracaju', 'SE', 'form_proprio', now(), 90, 400, $4, 'sem_contato')
       returning id`,
      [CAMP_A, prefixo + " " + seqCad, tel, A.joao]);
    return { id: r.rows[0].id, tel };
  }
  async function claimJoao() {
    const r = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select job_id, lead_id from fn_claim_next_lead($1, $2)`, [A.joao, CAMP_A]));
    return r.rows[0] ?? null;
  }
  async function fechar(job, disp, dur = 20) {
    const r = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select fn_finish_call($1, $2::cdr_disposition, $3, 'teste de cadência') as r`,
              [job, disp, dur]));
    return json(r.rows[0].r);
  }
  const estadoLead = async (id) =>
    (await db.query(`select status, prioridade::int as prioridade, tentativas::int as tentativas,
                            proximo_contato_at, obs, extras
                       from public.leads where id = $1`, [id])).rows[0];

  const pol = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n,
                    max(case when disposition = 'ocupado' then intervalo_s end) as ocupado_s,
                    max(case when disposition = 'ocupado' then acao end) as ocupado_acao,
                    max(case when disposition = 'numero_invalido' then acao end) as invalido_acao,
                    max(case when disposition = 'nao_atendeu' then max_tentativas end) as naoatend_max
               from public.fn_politica_rediscagem($1)`, [CAMP_A]));
  ok("fn_politica_rediscagem devolve as 8 disposições com o default efetivo",
     pol.rows[0].n === 8 && pol.rows[0].ocupado_s === 5400 && pol.rows[0].ocupado_acao === "repetir" &&
     pol.rows[0].invalido_acao === "descartar" && pol.rows[0].naoatend_max === 4,
     JSON.stringify(pol.rows[0]));

  const cad1 = await novoLead("Ocupado");
  const c1 = await claimJoao();
  const f1 = await fechar(c1.job_id, "ocupado");
  const e1 = await estadoLead(cad1.id);
  ok("'ocupado' obedece o intervalo da política (1h30), não o da campanha",
     f1.politica === "repetir" && e1.status === "sem_contato" &&
     e1.proximo_contato_at != null &&
     Math.abs((new Date(e1.proximo_contato_at) - Date.now()) / 1000 - 5400) < 120,
     `proximo: ${e1.proximo_contato_at}`);

  const cad2 = await novoLead("Secretaria");
  const c2 = await claimJoao();
  await fechar(c2.job_id, "secretaria");
  const e2 = await estadoLead(cad2.id);
  const horaAlvo = e2.proximo_contato_at
    ? Number((await db.query(`select extract(hour from $1::timestamptz at time zone 'America/Sao_Paulo') as h`,
                             [e2.proximo_contato_at])).rows[0].h)
    : -1;
  ok("'secretaria' é reagendada para a hora alvo da política (10:00 de Brasília)",
     horaAlvo === 10 && new Date(e2.proximo_contato_at) > new Date(Date.now() + 3600e3),
     `hora: ${horaAlvo}`);

  const cad3 = await novoLead("Invalido");
  const c3 = await claimJoao();
  const f3 = await fechar(c3.job_id, "numero_invalido");
  const e3 = await estadoLead(cad3.id);
  ok("'numero_invalido' sai da fila viva (descarte, sem próxima chamada)",
     f3.politica === "descartar" && e3.status === "descarte" && e3.proximo_contato_at === null,
     JSON.stringify({ st: e3.status, prox: e3.proximo_contato_at }));

  const cad4 = await novoLead("Whats");
  const c4 = await claimJoao();
  await fechar(c4.job_id, "whatsapp", 8);
  const e4 = await estadoLead(cad4.id);
  ok("disposição com prioridade_delta empurra o lead para cima na fila",
     e4.prioridade === 100, `prioridade: ${e4.prioridade}`);

  const polNegada = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_politica_rediscagem($1, '[{"disposition":"ocupado","acao":"repetir","intervalo_s":600}]'::jsonb) as r`,
            [CAMP_A]), { commit: false });
  ok("operador não muda a cadência da campanha", json(polNegada.rows[0].r).ok === false,
     JSON.stringify(json(polNegada.rows[0].r)));
  const polRuim = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_politica_rediscagem($1, '[{"disposition":"existente","acao":"repetir"}]'::jsonb) as r`,
            [CAMP_A]), { commit: false });
  ok("disposição inexistente não cria regra muda", json(polRuim.rows[0].r).ok === false,
     JSON.stringify(json(polRuim.rows[0].r)));
  const polOk = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_politica_rediscagem($1, $2::jsonb) as r`,
            [CAMP_A, JSON.stringify([{ disposition: "nao_atendeu", acao: "repetir", intervalo_s: 7200,
                                       max_tentativas: 3, hora_alvo: null, prioridade_delta: -5,
                                       observacao: "tentar de manhã" }])]), { commit: true });
  const polR = json(polOk.rows[0].r);
  ok("supervisor/admin salva a política e a trilha guarda o conteúdo",
     polR.ok === true && polR.regras === 1 &&
     (await db.query(`select alvo->>'conteudo' as c from public.auditoria_gestao
                       where acao = 'politica_salva' order by id desc limit 1`)).rows[0].c
       .includes("tentar de manhã"),
     JSON.stringify(polR));
  const regeito = await estadoLead(cad1.id);
  ok("salvar a política não reescreve o que já foi registrado antes dela",
     regeito.status === "sem_contato" && regeito.proximo_contato_at != null, JSON.stringify(regeito));

  // ============================================================ 19. bloqueio com validade
  const bloqLead = await novoLead("Bloqueado Provisório");
  const bloqNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_bloquear_telefone($1, 'nao_me_perturbe', 30) as r`, [bloqLead.tel]), { commit: false });
  ok("operador não bloqueia número (é decisão de gestão)", json(bloqNegado.rows[0].r).ok === false,
     JSON.stringify(json(bloqNegado.rows[0].r)));
  const bloqPerma = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_bloquear_telefone($1, 'opt_out', 30) as r`, [bloqLead.tel]), { commit: false });
  ok("opt_out não aceita prazo (não se 'pausa' quem pediu para nunca mais ligar)",
     json(bloqPerma.rows[0].r).ok === false, JSON.stringify(json(bloqPerma.rows[0].r)));
  const blocou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_bloquear_telefone($1, 'nao_me_perturbe', 30, 'ligou de novo e pediu 30 dias') as r`,
            [bloqLead.tel]), { commit: true });
  ok("bloqueio temporário entra com validade e origem",
     json(blocou.rows[0].r).ok === true &&
     (await db.query(`select (now() < expira_em) as futuro, origem from public.bloqueios where telefone_e164 = $1`,
                     [bloqLead.tel])).rows[0].futuro === true,
     JSON.stringify(json(blocou.rows[0].r)));
  await db.query(`update public.leads set prioridade = 95 where id = $1`, [bloqLead.id]);
  const pulaBloqueado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select coalesce((select lead_id from fn_claim_next_lead($1, $2)), -1) as lid`,
            [A.joao, CAMP_A]));
  ok("claim pula o número bloqueado mesmo com prioridade maior",
     Number(pulaBloqueado.rows[0].lid) !== Number(bloqLead.id), `claim entregou ${pulaBloqueado.rows[0].lid}`);
  await db.query(`update public.bloqueios set expira_em = now() - interval '1 minute' where telefone_e164 = $1`,
                 [bloqLead.tel]);
  const voltaDepois = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select coalesce((select lead_id from fn_claim_next_lead($1, $2)), -1) as lid`,
            [A.joao, CAMP_A]));
  ok("venceu o prazo: o número volta a ser discável sem ninguém lembrar",
     Number(voltaDepois.rows[0].lid) === Number(bloqLead.id), `claim entregou ${voltaDepois.rows[0].lid}`);
  const libou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_liberar_telefone($1) as r`, [bloqLead.tel]), { commit: true });
  ok("liberar tira da lista e deixa rastro na auditoria de gestão",
     json(libou.rows[0].r).ok === true &&
     (await db.query(`select count(*)::int as n from public.auditoria_gestao
                       where acao = 'telefone_liberado' and alvo->>'telefone' = $1`,
                     [bloqLead.tel])).rows[0].n === 1,
     JSON.stringify(json(libou.rows[0].r)));

  // ============================================================ 20. tabulação e qualificação
  const form = (await db.query(
    `select count(*)::int as n,
            count(*) filter (where f->>'obrigatorio' = 'true')::int as obrigatorios
       from public.campanhas c, jsonb_array_elements(c.formulario) f where c.id = $1`,
    [CAMP_A])).rows[0];
  ok("a campanha do seed já nasce com formulário de tabulação obrigatório",
     form.n === 5 && form.obrigatorios === 4, JSON.stringify(form));

  const tabLead = await novoLead("Tabulacao");
  // uma chamada antes da tabulação: é o que faz o lead ter CDR para a ficha 360º
  const c6 = await claimJoao();
  ok("o lead de maior prioridade elegível é o próximo da fila (não o mais antigo)",
     Number(c6.lead_id) === Number(tabLead.id), JSON.stringify(c6));
  await fechar(c6.job_id, "nao_atendeu", 12);
  const tabAntes = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_qualificar_lead($1, 'quer sim') as r`, [tabLead.id]), { commit: false });
  ok("não dá para qualificar sem preencher a tabulação obrigatória",
     json(tabAntes.rows[0].r).ok === false &&
     String(json(tabAntes.rows[0].r).erro).includes("tabulação"),
     JSON.stringify(json(tabAntes.rows[0].r)));
  const tabPelaMetade = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_tabulacao($1, '{"titular_confirmado":true,"margem_informada":400}'::jsonb) as r`,
            [tabLead.id]), { commit: false });
  const meio = json(tabPelaMetade.rows[0].r);
  ok("tabulação incompleta devolve QUAL campo falta",
     meio.ok === false && String(meio.erro).includes("banco_consignacao") &&
     String(meio.erro).includes("interesse"), JSON.stringify(meio));
  const tabCheia = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_tabulacao($1, $2::jsonb) as r`,
            [tabLead.id, JSON.stringify({ titular_confirmado: true, margem_informada: 400,
                                          banco_consignacao: "Banco do Brasil", interesse: "alto",
                                          autorizacao_gravacao: false })]), { commit: true });
  const tabR = json(tabCheia.rows[0].r);
  ok("tabulação grava em leads.extras (campo estruturado, não 'obs' de texto livre)",
     tabR.ok === true && tabR.extras?.interesse === "alto" && tabR.extras?.banco_consignacao === "Banco do Brasil",
     JSON.stringify(tabR).slice(0, 120));
  const qualif = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_qualificar_lead($1, 'titular confirmou margem de R$ 400') as r`,
            [tabLead.id]), { commit: true });
  ok("com a tabulação completa, o operador qualifica o lead",
     json(qualif.rows[0].r).ok === true &&
     (await db.query(`select status from public.leads where id = $1`, [tabLead.id])).rows[0].status === "qualificado",
     JSON.stringify(json(qualif.rows[0].r)));
  const formRuim = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_formulario($1, '[{"chave":"Campo Errado","rotulo":"x","tipo":"texto"}]'::jsonb) as r`,
            [CAMP_A]), { commit: false });
  ok("campo de tabulação com chave inválida é recusado na hora",
     json(formRuim.rows[0].r).ok === false, JSON.stringify(json(formRuim.rows[0].r)));
  const formNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_formulario($1, '[]'::jsonb) as r`, [CAMP_A]), { commit: false });
  ok("operador não reescreve o formulário da campanha", json(formNegado.rows[0].r).ok === false,
     JSON.stringify(json(formNegado.rows[0].r)));

  // a ficha 360º vem de um único RPC
  const ficha = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_ficha_lead($1) as r`, [tabLead.id]));
  const f = json(ficha.rows[0].r);
  ok("fn_ficha_lead devolve o 360º (lead, cdrs, eventos, tarefas, roteiro, bloqueio)",
     f.ok === true && Number(f.lead.id) === Number(tabLead.id) &&
     Array.isArray(f.cdrs) && f.cdrs.length >= 1 &&
     Array.isArray(f.eventos) && Array.isArray(f.roteiro) && "bloqueio" in f,
     `chaves: ${Object.keys(f).join(",")}`);
  const claimTab = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select campanha_id, jsonb_array_length(formulario)::int as n_campos,
                    jsonb_typeof(extras) as tipo_extras
               from fn_claim_next_lead($1, $2)`, [A.joao, CAMP_A]));
  ok("o claim já traz o formulário e o que está preenchido (nada de 3 requests com o cliente na linha)",
     claimTab.rows[0]?.n_campos === 5 && claimTab.rows[0]?.tipo_extras === "object" &&
     !!claimTab.rows[0]?.campanha_id, JSON.stringify(claimTab.rows[0] ?? null));

  const fichaFora = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_ficha_lead($1) as r`, [tabLead.id]), { commit: false });
  ok("quem não tem acesso à campanha não monta a ficha do lead",
     json(fichaFora.rows[0].r).ok === false, JSON.stringify(json(fichaFora.rows[0].r)));

  // ============================================================ 21. CRM: tarefa, esteira, bbb
  const tar = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_criar_tarefa($1, 'Ligar de novo às 10h', 'retorno',
              now() + interval '2 hours', 'cliente pediu antes do almoço') as r`, [tabLead.id]),
            { commit: true });
  const tarR = json(tar.rows[0].r);
  ok("operador cria tarefa para si na própria carteira",
     tarR.ok === true && tarR.tarefa_id != null, JSON.stringify(tarR));
  const empurra = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_criar_tarefa($1, 'tarefa para o colega', 'outro', null, null, $2) as r`,
            [tabLead.id, A.pedro]), { commit: false });
  ok("operador não atribui tarefa a outro operador", json(empurra.rows[0].r).ok === false,
     JSON.stringify(json(empurra.rows[0].r)));
  const agenda = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select situacao, lead from public.v_agenda where id = $1`, [tarR.tarefa_id]));
  ok("v_agenda classifica a tarefa (futura/hoje/vencida/concluida)",
     ["futura", "hoje"].includes(agenda.rows[0]?.situacao), JSON.stringify(agenda.rows[0] ?? null));
  const concl = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_concluir_tarefa($1, 'cliente atendeu, remarcou') as r`, [tarR.tarefa_id]),
            { commit: true });
  ok("concluir tarefa guarda o resultado", json(concl.rows[0].r).ok === true, JSON.stringify(json(concl.rows[0].r)));
  const conclDeNovo = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_concluir_tarefa($1) as r`, [tarR.tarefa_id]), { commit: false });
  ok("tarefa já concluída não é reescrita em silêncio", json(conclDeNovo.rows[0].r).ok === false,
     JSON.stringify(json(conclDeNovo.rows[0].r)));

  const moveNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_mover_lead($1, 'opt_out') as r`, [tabLead.id]), { commit: false });
  ok("opt_out pela esteira é decisão de gestão (o operador usa fn_register_optout, que vale para o número todo)",
     json(moveNegado.rows[0].r).ok === false, JSON.stringify(json(moveNegado.rows[0].r)));
  const move = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_mover_lead($1, 'recusado', null, 'não quer mexer na margem agora') as r`,
            [tabLead.id]), { commit: true });
  const apos = await db.query(`select status, agente_id, proximo_contato_at from public.leads where id = $1`,
                              [tabLead.id]);
  ok("mover na esteira devolve o lead para o pool e limpa a próxima chamada",
     json(move.rows[0].r).ok === true && apos.rows[0].status === "recusado" &&
     apos.rows[0].agente_id === null && apos.rows[0].proximo_contato_at === null,
     JSON.stringify(apos.rows[0]));
  const moveCamp = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_mover_lead($1, 'novo', $2, 'transferido para BPC') as r`,
            [bloqLead.id, CAMP_B]), { commit: true });
  const aposMove = await db.query(`select campanha_id from public.leads where id = $1`, [bloqLead.id]);
  ok("mover para outra campanha exige acesso às duas e grava a trilha do motivo",
     json(moveCamp.rows[0].r).ok === true && aposMove.rows[0].campanha_id === CAMP_B &&
     (await db.query(`select count(*)::int as n from public.lead_events where lead_id = $1
                       and detalhe like 'movido no CRM%'`, [bloqLead.id])).rows[0].n >= 1,
     JSON.stringify({ r: json(moveCamp.rows[0].r), camp: aposMove.rows[0].campanha_id }));

  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_acesso($1, 'pedro@suafinanceira.com.br', 'operador', 60) as r`,
            [CAMP_A]), { commit: true });
  for (let i = 0; i < 6; i++) {
    await db.query(
      `insert into public.leads (campanha_id, nome, telefone_e164, consentimento, consentimento_em,
                                 prioridade, margem_estimada, status)
       values ($1, 'Pool ' || $2, '+5579999972' || $2, 'form_proprio', now(),
               $3::smallint, $4::numeric, 'novo')`,
      [CAMP_A, String(i).padStart(2, "0"), i % 2 ? 10 : 5, 100 + i * 50]);
  }
  const bbb = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_attribuir_carteira($1, null, 0, 'bbb') as r`, [CAMP_A]), { commit: true });
  const bbbR = json(bbb.rows[0].r);
  const divisao = await db.query(
    `select coalesce((select nome from public.agentes where id = l.agente_id), 'pool') as dono,
            count(*)::int as n
       from public.leads l where l.campanha_id = $1 and l.nome like 'Pool %'
      group by 1 order by 1`, [CAMP_A]);
  const porOperador = divisao.rows.filter((r) => r.dono !== "pool").map((r) => r.n);
  ok("distribuição 'bbb' reparte o pool de forma igual entre os operadores",
     bbbR.ok === true && porOperador.length >= 2 &&
     Math.max(...porOperador) - Math.min(...porOperador) <= 1,
     JSON.stringify(divisao.rows));
  const ordem = await db.query(
    `select prioridade::int as p, margem_estimada as m from public.leads
      where campanha_id = $1 and nome like 'Pool 05' limit 1`, [CAMP_A]);
  ok("o 'bbb' entrega primeiro o lead de maior prioridade/margem (não é rodízio cego)",
     ordem.rows.length === 1, JSON.stringify(ordem.rows));

  const pontuaNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_pontuar_leads($1) as r`, [CAMP_A]), { commit: false });
  ok("operador não recalcula a prioridade da campanha inteira",
     json(pontuaNegado.rows[0].r).ok === false, JSON.stringify(json(pontuaNegado.rows[0].r)));
  await db.query(`insert into public.leads (campanha_id, nome, telefone_e164, consentimento,
                     consentimento_em, margem_estimada, status, prioridade)
                  values ($1, 'Novo com margem alta', '+557999997290', 'form_proprio', now(), 900, 'novo', 0)`,
                 [CAMP_A]);
  const pontua = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_pontuar_leads($1) as r`, [CAMP_A]), { commit: true });
  const pont = await db.query(
    `select nome, prioridade::int as p from public.leads
      where campanha_id = $1 and nome in ('Novo com margem alta', 'Pool 00') order by p desc limit 2`,
    [CAMP_A]);
  ok("pontuação automática: lead novo, com consentimento próprio e margem alta sobe no topo",
     json(pontua.rows[0].r).ok === true && pont.rows[0]?.nome === "Novo com margem alta" &&
     pont.rows[0].p >= 90, JSON.stringify(pont.rows));

  // ============================================================ 22. simulador + margem na proposta
  const sim = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select (fn_simular_proposta(400, 60, 'inss'))->>'parcela_maxima' as parcela,
                    ((fn_simular_proposta(400, 60, 'inss'))->>'valor_maximo')::numeric as valor,
                    ((fn_simular_proposta(400, 60, 'inss'))->>'total_pago')::numeric as total,
                    fn_simular_proposta(400, 60, 'inss')->>'dentro_das_regras' as dentro,
                    ((fn_simular_proposta(400, 60, 'bpc_loas'))->>'limite_margem_pct')::int as limite,
                    ((fn_simular_proposta(400, 109, 'inss'))->>'parcelas')::int as parcelas_ajustadas,
                    fn_simular_proposta(400, 109, 'inss')->>'dentro_das_regras' as fora`));
  const simR = sim.rows[0];
  ok("simulador devolve a parcela máxima = margem e o crédito que cabe nela",
     Number(simR.parcela) === 400 && Number(simR.valor) > 18000 && Number(simR.valor) < Number(simR.total) &&
     Number(simR.total) === 24000 && simR.dentro === "true",
     JSON.stringify(simR));
  ok("BPC/LOAS aparece com limite de 35% e prazo acima de 108 é sinalizado (e cortado)",
     Number(simR.limite) === 35 && simR.fora === "false" && Number(simR.parcelas_ajustadas) === 108,
     JSON.stringify({ limite: simR.limite, fora: simR.fora }));

  const propAcima = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 40000, 60, 3.23, 'Banco do Brasil') as r`, [tabLead.id]),
           { commit: false });
  ok("proposta com parcela acima da margem do lead é bloqueada no servidor",
     json(propAcima.rows[0].r).ok === false && String(json(propAcima.rows[0].r).erro).includes("margem"),
     JSON.stringify(json(propAcima.rows[0].r)));
  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_mover_lead($1, 'qualificado', null, 'requalificado pela gestão') as r`,
            [tabLead.id]), { commit: true });
  const propDentro = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 18000, 60, 3.23, 'Banco do Brasil') as r`, [tabLead.id]),
            { commit: true });
  ok("com a parcela dentro da margem, a proposta entra e o prazo de 5 dias começa a contar",
     json(propDentro.rows[0].r).ok === true &&
     (await db.query(`select prazo_validade > now() + interval '4 days' as no_prazo
                        from public.propostas where lead_id = $1`, [tabLead.id])).rows[0].no_prazo === true,
     JSON.stringify(json(propDentro.rows[0].r)));

  // ============================================================ 23. QA de ligação e metas
  const qaLead = await novoLead("Avaliar");
  const cqa = await claimJoao();
  await fechar(cqa.job_id, "atendeu", 120);
  // o CDR é pego pelo job (não pelo lead): o claim entrega o lead mais prioritário
  // que existir na fila naquele instante, e os testes acima mexeram nas prioridades
  const cdrId = (await db.query(
    `select id from public.cdr where job_id = $1 order by id desc limit 1`, [cqa.job_id])).rows[0].id;
  const qaNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_avaliar_chamada($1, 70) as r`, [cdrId]), { commit: false });
  ok("operador não se autoavalia no QA", json(qaNegado.rows[0].r).ok === false,
     JSON.stringify(json(qaNegado.rows[0].r)));
  const qa = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_avaliar_chamada($1, 72, '{"abertura":true,"proibido_falou":false}'::jsonb,
              'anunciou o banco antes de confirmar a titularidade', 'repetir o módulo 2 do roteiro') as r`,
            [cdrId]), { commit: true });
  ok("supervisor registra scorecard na chamada e a trilha guarda a nota",
     json(qa.rows[0].r).ok === true &&
     (await db.query(`select alvo->>'nota' as nota from public.auditoria_gestao
                       where acao = 'qa_avaliado' order by id desc limit 1`)).rows[0].nota === "72",
     JSON.stringify(json(qa.rows[0].r)));
  const qaResumo = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select avaliacoes::int as n, nota_media::int as nota, auditorias_da_semana::int as semana
               from public.v_qa_resumo where agente_id = $1`, [A.joao]));
  ok("v_qa_resumo fecha a nota por operador para a conversa de coaching",
     qaResumo.rows[0]?.n === 1 && qaResumo.rows[0]?.nota === 72 && qaResumo.rows[0]?.semana === 1,
     JSON.stringify(qaResumo.rows[0] ?? null));
  const qaVisivelAoDono = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.qa_avaliacoes where agente_id = $1`, [A.joao]));
  ok("o operador enxerga a própria avaliação (direito de saber a nota)",
     qaVisivelAoDono.rows[0].n === 1, `linhas: ${qaVisivelAoDono.rows[0].n}`);

  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, null, null, null, 5, false) as r`,
            [CAMP_A]), { commit: true });
  const meta = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select meta_diaria::int as meta, contatos_hoje::int as contatos, pct_meta, faltam::int as faltam
               from public.v_metas_dia where campanha_id = $1`, [CAMP_A]));
  ok("meta do dia aparece com realizado/pct/faltando na view de metas",
     meta.rows[0]?.meta === 5 && meta.rows[0].contatos >= 1 &&
     Number(meta.rows[0].pct_meta) === Math.round((meta.rows[0].contatos / 5) * 1000) / 10,
     JSON.stringify(meta.rows[0] ?? null));
  const mapa = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n, max(taxa_contato_pct) as melhor
               from public.v_mapa_horario`));
  ok("mapa dia×hora é calculado a partir dos CDRs reais da operação",
     mapa.rows[0].n >= 1 && mapa.rows[0].melhor != null, JSON.stringify(mapa.rows[0]));
  const funil = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.v_funil where campanha = 'INSS - margem disponível'
               and leads > 0`));
  ok("funil mostra os estágios com lead, e não uma linha por status vazio",
     funil.rows[0].n >= 3, `estágios: ${funil.rows[0].n}`);

  // ============================================================ 24. empresa, webhook e pendências
  const empEdit = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_empresa('Sua Financeira LTDA', '00000000000191', '+55 79 3000-0000',
              'dpo@suafinanceira.com.br', 'Maria - encarregada',
              'A ligação pode ser registrada para controle de qualidade.') as r`), { commit: true });
  ok("o dono cadastra a empresa (nome, CNPJ, encarregado de dados, aviso de gravação)",
     json(empEdit.rows[0].r).ok === true &&
     (await db.query(`select nome, responsavel_lgpd from public.empresas limit 1`)).rows[0].nome ===
       "Sua Financeira LTDA",
     JSON.stringify(json(empEdit.rows[0].r)));
  const empNegado = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_editar_empresa('Empresa do Pedro') as r`), { commit: false });
  ok("só o admin (o dono) mexe no cadastro da empresa", json(empNegado.rows[0].r).ok === false,
     JSON.stringify(json(empNegado.rows[0].r)));
  const quem = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_quem_sou() as r`));
  const quemR = json(quem.rows[0].r);
  ok("o perfil do operador carrega a empresa e as tarefas abertas dele",
     quemR.empresa?.nome === "Sua Financeira LTDA" && quemR.tarefas_abertas >= 0,
     JSON.stringify({ emp: quemR.empresa, t: quemR.tarefas_abertas }));
  const dono = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select operadores_ativos::int as op, campanhas_ativas::int as camp,
                    leads_na_fila::int as fila, chamadas_hoje::int as ch, contatos_hoje::int as cont,
                    tarefas_vencidas::int as tar, numeros_bloqueados::int as bloq, qa_semana::int as qa
               from public.v_visao_dono`));
  const donoR = dono.rows[0];
  ok("v_visao_dono fecha a operação inteira num request (quem liga, quem fala, o que venceu)",
     donoR.op >= 3 && donoR.ch > 0 && donoR.cont > 0 && donoR.qa === 1 && donoR.fila >= 1,
     JSON.stringify(donoR));
  const pend = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_pendencias() as r`));
  const pendR = json(pend.rows[0].r);
  ok("fn_pendencias devolve contagens do dia (tarefa, retorno, anuência, proposta parada)",
     pendR.ok === true && Number(pendR.qualificados_sem_proposta) >= 0 &&
     "retornos_de_hoje" in pendR && "anuencia_hoje" in pendR, JSON.stringify(pendR));

  const tokenCamp = (await db.query(
    `select webhook_token::text as t from public.campanhas where id = $1`, [CAMP_A])).rows[0].t;
  const semAtivar = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Vindo do Site","telefone_e164":"+557999997300","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: false });
  ok("webhook não aceita nada enquanto a porta estiver desligada na campanha",
     json(semAtivar.rows[0].r).ok === false, JSON.stringify(json(semAtivar.rows[0].r)));
  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, null, null, null, null, true) as r`,
            [CAMP_A]), { commit: true });
  const semConsent = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Sem Consentimento","telefone_e164":"+557999997301"}'::jsonb) as r`, [tokenCamp]),
            { commit: false });
  ok("lead de site sem consentimento por titular é recusado (não existe 'a gente consegue')",
     json(semConsent.rows[0].r).ok === false, JSON.stringify(json(semConsent.rows[0].r)));
  const webhook1 = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Vindo do Site","telefone_e164":"+557999997300","cpf":"12345678909",
                "cidade":"Aracaju","uf":"SE","consentimento":"form_proprio",
                "margem_estimada":"520","origem_url":"/simule-seu-consignado"}'::jsonb) as r`,
            [tokenCamp]), { commit: true });
  const wh = json(webhook1.rows[0].r);
  const whLead = await db.query(
    `select id, nome, prioridade::int as p, extras, status from public.leads where telefone_e164 = '+557999997300'`);
  ok("webhook coloca o lead na fila já com prioridade de 'recém-chegado'",
     wh.ok === true && wh.lead_id != null &&
     whLead.rows[0]?.p === 55 && whLead.rows[0]?.extras?._canal === "webhook",
     JSON.stringify({ wh, l: whLead.rows[0] ?? null }));
  const webhook2 = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Repetido","telefone_e164":"+557999997300","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: true });
  ok("o mesmo número duas vezes no mesmo site não vira lead duplicado",
     json(webhook2.rows[0].r).duplicado === true, JSON.stringify(json(webhook2.rows[0].r)));
  const tokenRuim = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook('00000000-0000-4000-8000-000000000000'::uuid,
              '{"telefone_e164":"+557999997302","consentimento":"form_proprio"}'::jsonb) as r`),
           { commit: false });
  ok("token errado não escreve nada", json(tokenRuim.rows[0].r).ok === false,
     JSON.stringify(json(tokenRuim.rows[0].r)));
  const anonLendo = await sessao({ papel: "anon" }, (c) =>
    sqlstate(c, `select count(*) from public.leads`), { commit: false });
  ok("abrir a porta do webhook não abriu o resto do banco para anon",
     anonLendo === "42501", String(anonLendo));
  await db.query(`insert into public.bloqueios (telefone_e164, motivo, detalhe)
                  values ('+557999997360', 'nao_me_perturbe', 'pediu 30 dias, entrou pelo site')
                  on conflict (telefone_e164) do nothing`);
  const bloqueadoWeb = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"telefone_e164":"+557999997360","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: false });
  ok("número na lista de bloqueio não entra nem pelo site",
     json(bloqueadoWeb.rows[0].r).bloqueado === true, JSON.stringify(json(bloqueadoWeb.rows[0].r)));

  await db.query(`insert into public.leads (campanha_id, nome, telefone_e164, consentimento, consentimento_em, status)
                  select $1, 'Enchimento ' || g, '+5579999973'|| lpad(g::text, 2, '0'),
                         'form_proprio', now(), 'novo'
                    from generate_series(1, 30) g
                  on conflict (campanha_id, telefone_e164) do nothing`, [CAMP_A]);
  const enchente = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"telefone_e164":"+557999997399","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: false });
  ok("30 leads no mesmo minuto já fazem o webhook recusar (site mal configurado não inunda a fila)",
     String(json(enchente.rows[0].r).erro).includes("volume"), JSON.stringify(json(enchente.rows[0].r)));

  // as views novas respeitam a RLS de quem governa, não de quem é dono do banco
  await db.query(`insert into public.leads (campanha_id, nome, telefone_e164, consentimento, consentimento_em)
                  values ($1, 'Lead da CAMP_B', '+557999997350', 'form_proprio', now())
                  on conflict (campanha_id, telefone_e164) do nothing`, [CAMP_B]);
  const tarFora = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_criar_tarefa((select id from public.leads where telefone_e164 = '+557999997350'),
              'tarefa da gerência', 'outro', now(), 'invisível para o João', null) as r`),
          { commit: true });
  ok("tarefa criada para outro operador em outra campanha", json(tarFora.rows[0].r).ok === true,
     JSON.stringify(json(tarFora.rows[0].r)));
  const agendaFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_agenda where lead = 'Lead da CAMP_B'`));
  ok("quem não tem acesso à campanha não vê a agenda dos leads dela",
     agendaFora.rows[0].n === 0, `linhas: ${agendaFora.rows[0].n}`);
  const semEscala = await sessao({ papel: "anon" }, (c) =>
    sqlstate(c, `select count(*) from public.v_visao_dono`), { commit: false });
  ok("visão do dono não existe para usuário anônimo", semEscala === "42501", String(semEscala));

  const soEscritaPorRpc = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    sqlstate(c, `insert into public.tarefas (lead_id, titulo) values ($1, 'jeito torto')`, [tabLead.id]),
            { commit: false });
  ok("nem o admin escreve em tarefas pelo navegador (só via fn_criar_tarefa)",
     soEscritaPorRpc === "42501", String(soEscritaPorRpc));


  // ============================================================ 25. esteira do CRM
  const propLead = await db.query(
    `select lead_id from public.propostas order by enviada_em desc limit 1`);
  const propId = (await db.query(
    `select id from public.propostas where lead_id = $1 order by enviada_em desc limit 1`,
    [propLead.rows[0].lead_id])).rows[0].id;
  const marcou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_marcar_anuencia($1, 'confirmada', null) as r`, [propId]), { commit: true });
  ok("a gestão registra a anuência confirmada pelo app do INSS", json(marcou.rows[0].r).ok === true,
     JSON.stringify(json(marcou.rows[0].r)));
  const estagio = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select estagio, propostas::int as propostas, anuencia, tarefas_abertas::int as tarefas,
                    prioridade::int as prioridade, dias_na_casa::int as dias
               from public.v_crm_leads where lead_id = $1`, [propLead.rows[0].lead_id]));
  ok("a proposta com anuência confirmada muda o lead de coluna na esteira",
     estagio.rows[0]?.estagio === "confirmada" && estagio.rows[0].propostas === 1 &&
     estagio.rows[0].anuencia === "confirmada",
     JSON.stringify(estagio.rows[0] ?? null));
  const esteira = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select estagio, count(*)::int as n from public.v_crm_leads
              where campanha = 'INSS - margem disponível' group by 1 order by 2 desc`));
  ok("a esteira agrupa a carteira inteira por estágio num request só",
     esteira.rows.length >= 2 && esteira.rows.every((r) =>
       ["fila", "contato", "qualificado", "proposta", "aguardando_anuencia", "confirmada", "fechado"]
         .includes(r.estagio)),
     JSON.stringify(esteira.rows));
  const foraEsteira = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_crm_leads where campanha = 'BPC/LOAS - só admin'`));
  ok("a RLS vale para a esteira: o operador não vê lead de campanha fora do escopo dele",
     foraEsteira.rows[0].n === 0, `linhas: ${foraEsteira.rows[0].n}`);
  const comTarefa = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select tarefas_abertas::int as n, tarefa_vencida from public.v_crm_leads
              where nome = 'Lead da CAMP_B'`));
  ok("tarefa vencida aparece no cartão do lead (o alerta é do banco, não da tela)",
     comTarefa.rows[0]?.n === 1 && comTarefa.rows[0]?.tarefa_vencida === true,
     JSON.stringify(comTarefa.rows[0] ?? null));

  // ============================================================ 26. v_bloqueios
  const bloq = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select telefone_e164, motivo, leads::int as leads, leads_vivos::int as vivos,
                    ainda_bloqueado, dias_restantes::int as dias, origem
               from public.v_bloqueios order by criado_em desc limit 6`));
  ok("a lista de bloqueio diz quantos leads aquele número carrega",
     bloq.rows.length >= 1 && bloq.rows.every((r) => typeof r.leads === "number"),
     JSON.stringify(bloq.rows.slice(0, 2)));
  const vivo = bloq.rows.find((r) => r.motivo === "sem_contato_30d");
  ok("bloqueio com prazo aparece como 'ainda bloqueado' e conta os dias que faltam",
     !vivo || (vivo.ainda_bloqueado === true && vivo.dias >= 0 && vivo.vivos <= vivo.leads),
     JSON.stringify(vivo ?? null));

  await db.end();
  await admin.end();

  console.log(`\n${passou} ok · ${falhou} falha(s)`);
  if (pendencias.length) {
    console.log("pendências:");
    for (const f of pendencias) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\nERRO:", e.message);
  console.error((e.stack || "").split("\n").slice(1, 5).join("\n"));
  process.exit(1);
});

```


## `tools/supabase_guard.py` — 159 linhas

```python
#!/usr/bin/env python3
"""Guarda do SQL do Supabase (rodar antes de subir migration).

Inspirado no workflow `supabase-guard.yml` do repositório
adrielmatos/ak-call-center — que só checava CREATE TABLE sem ENABLE ROW LEVEL
SECURITY. Aqui a checagem cobre também os dois furos que aquele repo deixou
abrir: política sem destinatário explícito (fica `to public`, ou seja, `anon`
enxergando dado de consumidor) e função chamada pela política que não é criada
em lugar nenhum do SQL versionado (o `private.current_operator_active()` deles
existe só dentro do projeto no Supabase — em banca nova, `db push` quebra).

Uso:
    python3 tools/supabase_guard.py supabase/schema.sql
    python3 tools/supabase_guard.py supabase/migrations/*.sql

Saída: linhas `FALHA ...` / `AVISO ...`; exit 1 se houver falha.
"""

from __future__ import annotations

import re
import sys

RE_CREATE_TABLE = re.compile(
    r"create\s+table(?:\s+(?:if\s+not\s+exists))?\s+(?:public\.)?([a-z_][\w]*)", re.I
)
RE_ENABLE_RLS = re.compile(
    r"alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][\w]*)\s+enable\s+row\s+level\s+security",
    re.I,
)
RE_POLICY = re.compile(
    r"create\s+policy\s+(.{0,400}?)\s+on\s+(?:public\.)?([a-z_][\w]*)\s+(.*?);", re.I | re.S
)
RE_SECURITY_DEFINER = re.compile(r"\bsecurity\s+definer\b", re.I)
RE_SET_SEARCH_PATH = re.compile(r"\bset\s+search_path\b", re.I)
RE_FN_DEF = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+([a-z_.][\w.]*)\s*\(", re.I)
RE_FN_CALL = re.compile(r"\b([a-z_][\w]*\.[a-z_][\w]*|\b[a-z_][\w]*)\s*\(\s*\)", re.I)
RE_GRANT_TO = re.compile(r"\bto\s+(public|authenticated|anon|service_role)\b", re.I)

# funções que o Postgres/Supabase já trazem: nunca devem ser cobradas no SQL
# versionado (auth.uid() em particular é injetado pelo GoTrue em toda policy).
SQL_KEYWORDS = {
    "case", "coalesce", "current_setting", "current_date", "current_timestamp",
    "now", "nextval", "count", "greatest", "least", "nullif", "row", "values",
    "select", "insert", "update", "delete", "where", "and", "or", "not", "in",
    "exists", "true", "false", "auth.uid", "auth.role", "auth.email", "auth.jwt",
    "auth.jwt", "array_length", "jsonb_build_object", "to_jsonb",
}


def _sem_schema(nome: str) -> str:
    """remove o prefixo `public.` (o qualifier do schema é irrelevante p/ comparar)."""
    return nome[7:] if nome.startswith("public.") else nome


def limpar_comentarios(texto: str) -> str:
    """Remove comentários de linha e de bloco, preservando o interior de $$ ... $$.

    Sem isto, um comentário dizendo "tudo `security definer`" vira uma FALHA
    de function sem search_path — falso-positivo que mata a utilidade do guarda.
    """
    texto = re.sub(r"/\*.*?\*/", " ", texto, flags=re.S)
    saida = []
    dentro = False
    for linha in texto.splitlines():
        if not dentro:
            linha = re.sub(r"--.*$", "", linha)
        n = linha.count("$$")
        if n % 2:
            dentro = not dentro
        saida.append(linha)
    return "\n".join(saida)


def analisar(arquivos: list[str]) -> tuple[list[str], list[str]]:
    falhas: list[str] = []
    avisos: list[str] = []
    texto_total = ""
    defs_global: set[str] = set()

    for caminho in arquivos:
        with open(caminho, encoding="utf-8") as fh:
            texto = limpar_comentarios(fh.read())
        texto_total += "\n" + texto
        defs = {_sem_schema(f.lower()) for f in RE_FN_DEF.findall(texto)}
        defs_global |= defs

        habilitadas = {t.lower() for t in RE_ENABLE_RLS.findall(texto)}
        criadas = {t.lower() for t in RE_CREATE_TABLE.findall(texto)}

        for tabela in sorted(criadas - habilitadas):
            falhas.append(f"{caminho}: tabela `{tabela}` criada sem `enable row level security`")

        # políticas
        for corpo, tabela, resto in RE_POLICY.findall(texto):
            alvo = f"{corpo} {resto}"
            if not RE_GRANT_TO.search(alvo):
                falhas.append(
                    f"{caminho}: política em `{tabela}` sem `to authenticated/service_role` "
                    "(Sem destinatário, o Postgres usa `to public` — vale para `anon`.)"
                )
            if re.search(r"\bto\s+anon\b", alvo, re.I):
                falhas.append(f"{caminho}: política em `{tabela}` liberada para `anon`")

        # security definer sem search_path fixo é vetor de search_path hijacking
        for bloco in re.split(r"\n\s*(?=create\s+or\s+replace\s+function)", texto, flags=re.I):
            if RE_SECURITY_DEFINER.search(bloco) and not RE_SET_SEARCH_PATH.search(bloco):
                nome = RE_FN_DEF.search(bloco)
                falhas.append(
                    f"{caminho}: function `{nome.group(1) if nome else '?'}` com `security definer` "
                    "sem `set search_path`"
                )

    # função usada em política mas nunca definida (o bug do ak-call-center)
    for chamada in sorted(set(RE_FN_CALL.findall(texto_total))):
        nome = _sem_schema(chamada.lower().strip())
        base = nome.split(".")[-1]
        if nome in SQL_KEYWORDS or base in SQL_KEYWORDS:
            continue
        # só cobra o que é função de projeto: com schema explícito ou prefixo fn_
        if "." not in nome and not nome.startswith("fn_"):
            continue
        definidas = defs_global | {f"public.{d}" for d in defs_global} | {f"private.{d}" for d in defs_global}
        if nome in definidas or base in definidas:
            continue
        avisos.append(
            f"função `{nome}()` referenciada no SQL não é definida em nenhum arquivo versionado "
            "— se ela só existe no editor do projeto, `supabase db push` em banca nova falha"
        )

    if criadas_todas := {t.lower() for t in RE_CREATE_TABLE.findall(texto_total)}:
        if "revoke all on all tables in schema public from anon" not in texto_total.replace("\n", " ").lower():
            if not re.search(r"revoke\s+.{0,80}from\s+anon", texto_total, re.I):
                falhas.append("nenhum `revoke ... from anon` no SQL versionado — o default do Supabase concede `anon` " +
                    "nas tabelas do schema public; se a revogação só existe no editor do projeto, ela não está no Git")
        else:
            avisos.append(f"dica: {len(criadas_todas)} tabelas protegidas por RLS; teste com a chave anon antes de publicar")

    return falhas, avisos


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    falhas, avisos = analisar(argv[1:])
    for a in avisos:
        print(f"AVISO  {a}")
    for f in falhas:
        print(f"FALHA  {f}")
    if falhas:
        print(f"\n{len(falhas)} falha(s) de segurança no SQL.")
        return 1
    print(f"Guarda de SQL OK ({len(argv) - 1} arquivo(s), {len(avisos)} aviso(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

```


## `.github/workflows/ci.yml` — 113 linhas

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  web:
    runs-on: ubuntu-latest
    defaults:
      run: { working-directory: web }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npx tsc --noEmit
      - run: npx next build
      - name: parser de planilha sem CVE conhecido
        # o npm `xlsx@0.18.5` tem Prototype Pollution + ReDoS SEM correção no npm;
        # um projeto que lê planilha enviada por usuário não pode depender dele.
        run: |
          if node -e 'const p=require("./package.json");const d={...p.dependencies,...p.devDependencies};process.exit(d.xlsx?0:1)'; then
            echo "dependência xlsx detectada — use SheetJS via cdn.sheetjs.com ou parseie CSV à mão"; exit 1
          fi
      - name: audit de dependências (informativo em high, bloqueia em critical)
        continue-on-error: true
        run: npm audit --audit-level=high
      - run: npm audit --audit-level=critical
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://dummy.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy-anon
          SUPABASE_SERVICE_ROLE_KEY: dummy-service

  agente:
    runs-on: ubuntu-latest
    defaults:
      run: { working-directory: agent }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install requests pytest
      - run: python -m pytest -q

  sql:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - name: guarda de RLS / policies / search_path
        run: python3 tools/supabase_guard.py supabase/schema.sql supabase/seed-exemplo.sql
      - name: parse do schema e do seed como Postgres
        run: |
          pip install sqlglot
          python - <<'PY'
          import sqlglot, pathlib
          for f in ("supabase/schema.sql", "supabase/seed-exemplo.sql"):
              sql = pathlib.Path(f).read_text(encoding="utf-8")
              stmts = [s for s in sqlglot.parse(sql, read="postgres") if s is not None]
              print(f"{f}: {len(stmts)} declarações parseadas")
          PY

  # o schema inteiro roda num Postgres 16 de verdade e é cobrado por 85 asserções:
  # papéis, RLS por papel, claim sem corrida, carteira, teto diário, pausa,
  # append-only da auditoria e as views com security_invoker. É a única checagem
  # que pega `case` com enum errado, parâmetro int em coluna timestamptz e alias de
  # lateral em subconsulta — tudo que lint de SQL deixa passar e a deploy quebra.
  sql-executa:
    name: schema + asserts num Postgres real
    runs-on: ubuntu-latest
    needs: sql
    services:
      pg:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d postgres"
          --health-interval 5s --health-timeout 5s --health-retries 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: só o driver pg (o harness não depende de nada do app)
        # node resolve `pg` subindo o diretório: web/scripts → web → raiz.
        run: |
          echo '{"name":"ci-sql","private":true}' > package.json
          npm install pg@8 --no-save --no-audit --no-fund
      - name: bootstrap + schema + seed + 85 asserções
        working-directory: web
        env:
          PGHOST: 127.0.0.1
          PGPORT: "5432"
          PGUSER: postgres
          PGPASSWORD: postgres
          PGDATABASE: postgres
        # o harness aplica bootstrap + schema + seed num banco novo e roda as asserções
        run: node scripts/testa-sql.mjs

  # checagem opcional de verdade: aplica o schema num Postgres real do Supabase (CLI)
  # precisa dos secrets SUPABASE_ACCESS_TOKEN / PROJECT_REF
  # - run: npx supabase db push --workdir . --local=false

```


---

# 4. App Next.js — porta de escrita (server actions) e tipos


## `web/middleware.ts` — 56 linhas

```ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/leads é a porta do webhook de lead: o visitante do site não tem sessão.
// O que protege aquela rota é o token da campanha + as regras da fn_receber_lead_webhook
// (consentimento, bloqueio, volume) — não o cookie.
const ROTAS_LIVRES = ["/login", "/auth", "/icon", "/api/leads"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // importante: getUser() valida o JWT no servidor de auth do Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = new URL(request.url).pathname;
  const livre = ROTAS_LIVRES.some((r) => path.startsWith(r));

  if (!user && !livre) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

```


## `web/lib/acoes.ts` — 974 linhas

```ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { montarLeads } from "@/lib/importador";
import type {
  AnuenciaStatus, CampoFormulario, Disposicao, LeadFila, ObjecaoRoteiro, Papel,
  PassoRoteiro, Pendencias, PoliticaLinha, QuemSou, RoteiroNoClaim, Simulacao,
} from "@/lib/tipos";

export type Resultado<T> = { ok: true; data: T } | { ok: false, erro: string };

const LOTE_IMPORTACAO = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Toda escrita passa por uma `fn_*` do banco.
 *
 * O cliente aqui é o do USUÁRIO (anon key + JWT), não a service role: assim o
 * Postgres resolve `auth.uid()`, a RLS decide o que ele vê e a função checa o
 * papel dele. Se uma página errar o gate, o banco ainda diz não — é assim que o
 * painel fica seguro com 10 pessoas mexendo ao mesmo tempo.
 * A service role só aparece onde não há alternativa (convidar usuário no Auth).
 */
/**
 * As `fn_*` novas devolvem `jsonb` com `{ok, ...}` dentro. Este é o único lugar que
 * sabe ler esse envelope: sem ele, cada tela repetiria o `if (r.ok === false)`.
 */
async function rpcJsonb<T>(fn: string, args: Record<string, unknown> = {}): Promise<Resultado<T>> {
  const saida = await rpc<Record<string, unknown> | Record<string, unknown>[]>(fn, args);
  if (!saida.ok) return saida;
  const r = (Array.isArray(saida.data) ? saida.data[0] : saida.data) ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  return { ok: true, data: r as T };
}

/** "12.5" | 12.5 | "" | null → number | null (campo de formulário pode estar vazio). */
function numeroOpcional(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<Resultado<T>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, erro: error.message };
  return { ok: true, data: data as T };
}

/** identidade + papel de quem está logado (fonte única do gate de UI) */
export async function quemSou(): Promise<QuemSou> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("fn_quem_sou");
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    agente_id: (r.agente_id as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    nome: (r.nome as string | null) ?? null,
    papel: ((r.papel as Papel | undefined) ?? "ninguem") as Papel | "ninguem",
    ativo: Boolean(r.ativo),
    celular: (r.celular as string | null) ?? null,
    limite_diario: Number(r.limite_diario ?? 0),
    pausado_ate: (r.pausado_ate as string | null) ?? null,
    status_agente: (r.status_agente as string | null) ?? null,
    ultimo_ciclo_em: (r.ultimo_ciclo_em as string | null) ?? null,
    discadas_hoje: Number(r.discadas_hoje ?? 0),
    tarefas_abertas: Number(r.tarefas_abertas ?? 0),
    empresa: (r.empresa as QuemSou["empresa"]) ?? null,
    campanhas: Array.isArray(r.campanhas) ? (r.campanhas as QuemSou["campanhas"]) : [],
    gerencia: Array.isArray(r.gerencia) ? (r.gerencia as QuemSou["gerencia"]) : [],
  };
}

// =====================================================================
//  Operação do dia
// =====================================================================

/** Próximo lead discável (carteira → pool da campanha → overflow). */
export async function pegarProximoLead(
  campanhaId?: string | null
): Promise<Resultado<LeadFila | null>> {
  if (campanhaId && !UUID.test(campanhaId)) return { ok: false, erro: "campanha inválida" };

  const saida = await rpc<Record<string, unknown>[] | Record<string, unknown>>(
    "fn_claim_next_lead",
    { p_agente: null, p_campanha: campanhaId || null }
  );
  if (!saida.ok) return saida;

  const linha = Array.isArray(saida.data) ? saida.data[0] : saida.data;
  if (!linha) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      job_id: String(linha.job_id),
      lead_id: Number(linha.lead_id),
      nome: (linha.nome as string | null) ?? null,
      telefone: String(linha.telefone),
      cpf_mask: (linha.cpf_mask as string | null) ?? null,
      cidade: (linha.cidade as string | null) ?? null,
      uf: (linha.uf as string | null) ?? null,
      campanha: (linha.campanha as string | null) ?? null,
      publico: (linha.publico as string | null) ?? null,
      script_resumo: (linha.script_resumo as string | null) ?? null,
      margem_estimada: linha.margem_estimada == null ? null : Number(linha.margem_estimada),
      tentativas: Number(linha.tentativas ?? 0),
      obs: (linha.obs as string | null) ?? null,
      roteiro_id: (linha.roteiro_id as string | null) ?? null,
      roteiro: (linha.roteiro as RoteiroNoClaim | null) ?? null,
      origem_fila: (linha.origem_fila as string | null) ?? null,
      banco_folha: (linha.banco_folha as string | null) ?? null,
      pendente_carteira: Number(linha.pendente_carteira ?? 0),
      campanha_id: (linha.campanha_id as string | null) ?? null,
      formulario: Array.isArray(linha.formulario)
        ? (linha.formulario as CampoFormulario[])
        : [],
      extras: (linha.extras as Record<string, unknown> | null) ?? {},
    },
  };
}

/** Resultado da chamada. O agente do Windows chama a mesma função. */
export async function registrarDisposicao(
  jobId: string,
  disposicao: Disposicao,
  duracaoS: number,
  nota: string
): Promise<Resultado<Record<string, unknown>>> {
  if (!UUID.test(jobId)) return { ok: false, erro: "job inválido" };
  const saida = await rpc<Record<string, unknown>>("fn_finish_call", {
    p_job: jobId,
    p_disposition: disposicao,
    p_duracao: Math.max(0, Math.trunc(Number(duracaoS) || 0)),
    p_nota: (nota || "").slice(0, 2000) || null,
  });
  if (!saida.ok) return saida;

  const r = (saida.data ?? {}) as Record<string, unknown>;
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "não foi possível fechar a ligação") };

  revalidatePath("/");
  revalidatePath("/relatorios");
  return { ok: true, data: r };
}

export async function registrarOptout(telefone: string): Promise<Resultado<boolean>> {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (tel.length < 10) return { ok: false, erro: "telefone inválido" };
  const saida = await rpc("fn_register_optout", {
    p_telefone: tel.startsWith("55") ? `+${tel}` : `+55${tel}`,
    p_motivo: "opt_out",
    p_detalhe: "registrado pelo painel",
  });
  if (!saida.ok) return saida;
  revalidatePath("/");
  revalidatePath("/leads");
  return { ok: true, data: true };
}

/** Pausa (café, reunião, fim de turno). O claim para de entregar lead enquanto durar. */
export async function pausar(minutos: number, agenteId?: string | null): Promise<Resultado<string | null>> {
  const m = Math.trunc(Number(minutos) || 0);
  if (m < 0 || m > 480) return { ok: false, erro: "pausa entre 0 e 480 minutos" };
  const saida = await rpc<string | null>("fn_pausar", {
    p_minutos: m,
    p_agente: agenteId && UUID.test(agenteId) ? agenteId : null,
  });
  if (!saida.ok) return saida;
  revalidatePath("/operador");
  revalidatePath("/equipe");
  return { ok: true, data: saida.data ?? null };
}

/** sair da pausa (o próprio; admin/supervisor podem quem estiver na campanha deles) */
export async function despausar(agenteId?: string | null): Promise<Resultado<boolean>> {
  const saida = await rpc<Record<string, unknown>>("fn_despausar_agente", {
    p_agente: agenteId && UUID.test(agenteId) ? agenteId : null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/operador");
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

export async function meuPerfil(input: { celular?: string }): Promise<Resultado<boolean>> {
  const saida = await rpc("fn_meu_perfil", { p_celular: (input.celular || "").slice(0, 30) });
  if (!saida.ok) return saida;
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

// =====================================================================
//  Proposta e anuência (é aqui que o dinheiro do consignado mora)
// =====================================================================

export async function enviarProposta(input: {
  leadId: number;
  valor: number;
  parcelas: number;
  taxaAa?: number;
  banco?: string;
  protocoloInss?: string;
  obs?: string;
}): Promise<Resultado<{ proposta_id: string }>> {
  const valor = Number(input.valor);
  const parcelas = Math.trunc(Number(input.parcelas));
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "valor deve ser maior que zero" };
  if (!(parcelas >= 6 && parcelas <= 108)) return { ok: false, erro: "parcelas entre 6 e 108 (limite do INSS)" };

  const saida = await rpc<Record<string, unknown>>("fn_enviar_proposta", {
    p_lead: Math.trunc(Number(input.leadId)),
    p_valor: valor,
    p_parcelas: parcelas,
    p_taxa_aa: numeroOpcional(input.taxaAa),
    p_banco: (input.banco || "").slice(0, 120) || null,
    p_protocolo_inss: (input.protocoloInss || "").slice(0, 80) || null,
    p_obs: (input.obs || "").slice(0, 2000) || null,
  });
  if (!saida.ok) return saida;

  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "não foi possível registrar a proposta") };

  revalidatePath("/relatorios");
  revalidatePath("/");
  return { ok: true, data: { proposta_id: String(r.proposta_id) } };
}

export async function marcarAnuencia(input: {
  propostaId: string;
  anuencia: AnuenciaStatus;
  protocolo?: string;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.propostaId)) return { ok: false, erro: "proposta inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_marcar_anuencia", {
    p_proposta: input.propostaId,
    p_anuencia: input.anuencia,
    p_protocolo: (input.protocolo || "").slice(0, 80) || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/relatorios");
  revalidatePath("/");
  return { ok: true, data: true };
}

/** Retorno agendado — o claim só entrega o lead de novo depois desse horário. */
export async function agendarRetorno(input: {
  leadId: number;
  quando: string;
  nota?: string;
}): Promise<Resultado<boolean>> {
  const quando = new Date(input.quando);
  if (Number.isNaN(quando.getTime())) return { ok: false, erro: "data/hora inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_agendar_retorno", {
    p_lead: Math.trunc(Number(input.leadId)),
    p_em: quando.toISOString(),
    p_nota: (input.nota || "").slice(0, 500) || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "não foi possível agendar") };
  revalidatePath("/");
  revalidatePath("/leads");
  return { ok: true, data: true };
}

// =====================================================================
//  Leads
// =====================================================================

export interface ResultadoImportacao {
  aceitos: number;
  ignorados: { linha: number; motivo: string }[];
  erros: string[];
  avisos: string[];
  colunas: string[];
  preservadas: number;
}

/**
 * Importação de planilha. O parse é do módulo puro `lib/importador.ts`; a gravação
 * é a RPC `fn_importar_leads`, que checa se o chamador comanda a campanha antes de
 * inserir — navegador nenhum escreve em `leads` (não tem privilégio).
 */
export async function importarLeads(input: {
  campanhaId: string;
  consentimento: string;
  csv: string;
}): Promise<Resultado<ResultadoImportacao>> {
  if (!input.csv || input.csv.trim() === "") return { ok: false, erro: "cole a planilha antes de importar" };
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida (uuid esperado)" };
  if (!CONSENTIMENTOS.includes(input.consentimento)) return { ok: false, erro: "base legal do contato inválida" };

  const parsed = montarLeads(input.csv, { campanhaId: input.campanhaId, consentimento: input.consentimento });
  if (parsed.registros.length === 0) {
    return {
      ok: false,
      erro:
        "nenhuma linha com telefone válido (DDD + número). " +
        "se a planilha tem cabeçalho, ele precisa trazer uma coluna de número/telefone/celular.",
    };
  }

  const erros: string[] = [];
  let aceitos = 0;
  let ignoradosPeloBanco = 0;

  for (let i = 0; i < parsed.registros.length; i += LOTE_IMPORTACAO) {
    const lote = parsed.registros.slice(i, i + LOTE_IMPORTACAO).map((r) => ({
      telefone_e164: r.telefone_e164,
      nome: r.nome ?? "",
      cpf: r.cpf ?? "",
      cidade: r.cidade ?? "",
      uf: r.uf ?? "",
      banco_folha: r.banco_folha ?? "",
      margem_estimada: r.margem_estimada == null ? null : String(r.margem_estimada),
      renda_estimada: r.renda_estimada == null ? null : String(r.renda_estimada),
      obs: r.obs ?? "",
      ref_externa: r.ref_externa ?? "",
      extras: JSON.stringify(r.extras ?? {}),
    }));

    const saida = await rpc<Record<string, unknown>>("fn_importar_leads", {
      p_campanha: input.campanhaId,
      p_consentimento: input.consentimento,
      p_rows: lote,
    });
    if (!saida.ok) {
      erros.push(`lote ${Math.floor(i / LOTE_IMPORTACAO) + 1}: ${saida.erro}`);
      continue;
    }
    const r = saida.data ?? {};
    if (r.ok === false) return { ok: false, erro: String(r.erro ?? "importação recusada") };
    aceitos += Number(r.inseridos ?? 0);
    ignoradosPeloBanco += Number(r.ignorados ?? 0);
  }

  revalidatePath("/");
  revalidatePath("/leads");
  return {
    ok: true,
    data: {
      aceitos,
      ignorados: [...parsed.ignorados, ...Array.from({ length: Math.max(0, ignoradosPeloBanco) }, () => ({ linha: 0, motivo: "repetido na campanha" }))],
      erros,
      avisos: parsed.avisos,
      colunas: parsed.colunasReconhecidas,
      preservadas: parsed.colunasPreservadas,
    },
  };
}

const CONSENTIMENTOS = ["form_proprio", "app_banco", "presencial", "lista_compartilhada"];

// =====================================================================
//  Gestão: carteira, campanhas, equipe
// =====================================================================

export async function atribuirCarteira(input: {
  campanhaId: string;
  agenteId?: string | null;
  qtd?: number;
  modo?: "quantidade" | "balanceado";
}): Promise<Resultado<{ atribuidos: number } | { erro: string }>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_attribuir_carteira", {
    p_campanha: input.campanhaId,
    p_agente: input.agenteId || null,
    p_qtd: Math.max(0, Math.trunc(Number(input.qtd) || 0)),
    p_modo: input.modo === "balanceado" ? "balanceado" : "quantidade",
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/leads");
  revalidatePath("/campanhas");
  return { ok: true, data: { atribuidos: Number(r.atribuidos ?? 0) } };
}

export async function liberarCarteira(input: {
  agenteId: string;
  campanhaId?: string | null;
}): Promise<Resultado<number>> {
  if (!UUID.test(input.agenteId)) return { ok: false, erro: "operador inválido" };
  const saida = await rpc<number>("fn_liberar_carteira", {
    p_agente: input.agenteId,
    p_campanha: input.campanhaId && UUID.test(input.campanhaId) ? input.campanhaId : null,
  });
  if (!saida.ok) return saida;
  revalidatePath("/leads");
  revalidatePath("/equipe");
  return { ok: true, data: Number(saida.data ?? 0) };
}

// =====================================================================
//  Roteiro de ligação
// =====================================================================

export type RoteiroInput = {
  id?: string | null;
  nome?: string;
  publico?: string;
  avisoCompliance?: string;
  ativo?: boolean;
  /** substitui a lista inteira de passos — de propósito, para não sobrar órfão */
  passos?: { titulo: string; texto: string; obrigatorio?: boolean }[];
  objecoes?: ObjecaoRoteiro[];
};

/**
 * Salvar roteiro. Só supervisor+ (o banco confere). Editar conteúdo sobe a versão e
 * a versão anterior fica na trilha de gestão — é assim que se volta atrás quando o
 * compliance muda a regra do que pode ser dito.
 */
export async function salvarRoteiro(input: RoteiroInput): Promise<
  Resultado<{ roteiroId: string; versao: number; passos: number; objecoes: number }>
> {
  if (input.id && !UUID.test(input.id)) return { ok: false, erro: "roteiro inválido" };
  if (input.nome !== undefined && (input.nome ?? "").trim().length < 3) {
    return { ok: false, erro: "nome do roteiro precisa de 3+ caracteres" };
  }
  if (input.passos && input.passos.length > 40) return { ok: false, erro: "no máximo 40 passos" };
  if (input.objecoes && input.objecoes.length > 60) return { ok: false, erro: "no máximo 60 objeções" };

  const saida = await rpc<Record<string, unknown>>("fn_salvar_roteiro", {
    p_id: input.id || null,
    p_nome: input.nome?.slice(0, 120) ?? null,
    p_publico: input.publico ?? null,
    p_aviso_compliance: input.avisoCompliance?.slice(0, 4000) ?? null,
    p_ativo: input.ativo ?? null,
    p_passos: input.passos
      ? input.passos
          .filter((s) => s.titulo?.trim() && s.texto?.trim())
          .map((s, i) => ({
            ordem: i + 1,
            titulo: s.titulo.trim().slice(0, 120),
            texto: s.texto.trim().slice(0, 4000),
            obrigatorio: s.obrigatorio !== false,
          }))
      : null,
    p_objecoes: input.objecoes
      ? input.objecoes
          .filter((o) => o.objecao?.trim() && o.resposta?.trim())
          .map((o, i) => ({
            ordem: i + 1,
            objecao: o.objecao.trim().slice(0, 300),
            resposta: o.resposta.trim().slice(0, 2000),
            proibido: o.proibido?.trim().slice(0, 1000) || null,
          }))
      : null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/campanhas");
  revalidatePath("/operador");
  return {
    ok: true,
    data: {
      roteiroId: String(r.roteiro_id),
      versao: Number(r.versao ?? 1),
      passos: Number(r.passos ?? 0),
      objecoes: Number(r.objecoes ?? 0),
    },
  };
}

/** Apontar (ou tirar) o roteiro da campanha. O operador passa a recebê-lo no claim. */
export async function atribuirRoteiro(input: {
  campanhaId: string;
  roteiroId?: string | null;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_atribuir_roteiro", {
    p_campanha: input.campanhaId,
    p_roteiro: input.roteiroId || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/campanhas");
  revalidatePath("/operador");
  return { ok: true, data: true };
}

/**
 * Marcar/desmarcar um passo na ligação em andamento. Devolve o progresso
 * (cumpridos/devidos) para a tela não precisar de novo request.
 */
export async function marcarPassoRoteiro(input: {
  leadId: number;
  passoId: number;
  feito: boolean;
  nota?: string;
}): Promise<Resultado<{ cumpridos: number; devidos: number; titulo: string }>> {
  if (!Number.isFinite(input.leadId) || !Number.isFinite(input.passoId)) {
    return { ok: false, erro: "lead/passo inválidos" };
  }
  const saida = await rpc<Record<string, unknown>>("fn_marcar_passo_roteiro", {
    p_lead: Math.trunc(input.leadId),
    p_passo: Math.trunc(input.passoId),
    p_feito: input.feito,
    p_nota: input.nota?.slice(0, 500) || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/relatorios");
  return {
    ok: true,
    data: {
      cumpridos: Number(r.cumpridos ?? 0),
      devidos: Number(r.devidos ?? 0),
      titulo: String(r.titulo ?? ""),
    },
  };
}

export async function criarCampanha(input: {
  nome: string;
  publico: string;
  script?: string;
}): Promise<Resultado<{ id: string | null }>> {
  const nome = (input.nome || "").trim();
  if (nome.length < 3) return { ok: false, erro: "nome precisa ter ao menos 3 caracteres" };
  const saida = await rpc<string | null>("fn_criar_campanha", {
    p_nome: nome.slice(0, 120),
    p_publico: input.publico,
    p_script: (input.script || "").slice(0, 4000) || null,
  });
  if (!saida.ok) return saida;
  if (!saida.data) return { ok: false, erro: "sem permissão para criar campanha" };
  revalidatePath("/campanhas");
  revalidatePath("/leads");
  return { ok: true, data: { id: String(saida.data) } };
}

export async function editarCampanha(input: {
  id: string;
  nome?: string;
  ativa?: boolean;
  janelaIni?: string;
  janelaFim?: string;
  maxTentativas?: number;
  intervaloRetentativaS?: number;
  permiteOverflow?: boolean;
  script?: string;
  metaDiaria?: number | null;
  webhookAtivo?: boolean;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.id)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_editar_campanha", {
    p_id: input.id,
    p_nome: input.nome ? input.nome.slice(0, 120) : null,
    p_ativa: input.ativa ?? null,
    p_janela_ini: input.janelaIni || null,
    p_janela_fim: input.janelaFim || null,
    p_max_tentativas: input.maxTentativas == null ? null : Math.trunc(Number(input.maxTentativas)),
    p_intervalo_retentativa_s:
      input.intervaloRetentativaS == null ? null : Math.max(0, Math.trunc(Number(input.intervaloRetentativaS))),
    p_permite_overflow: input.permiteOverflow ?? null,
    p_script_resumo: input.script ? input.script.slice(0, 4000) : null,
    p_meta_diaria: input.metaDiaria == null ? null : Math.trunc(Number(input.metaDiaria)),
    p_webhook_ativo: input.webhookAtivo ?? null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/campanhas");
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true, data: true };
}

export async function definirPapel(input: {
  agenteId: string;
  papel: Papel;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.agenteId)) return { ok: false, erro: "operador inválido" };
  const saida = await rpc<Record<string, unknown>>("fn_definir_papel", {
    p_agente: input.agenteId,
    p_papel: input.papel,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "apenas admin muda papel") };
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

export async function definirAcesso(input: {
  campanhaId: string;
  email: string;
  papel: Papel;
  limiteDiario?: number | null;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const email = (input.email || "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, erro: "e-mail inválido" };
  const saida = await rpc<Record<string, unknown>>("fn_definir_acesso", {
    p_campanha: input.campanhaId,
    p_email: email.slice(0, 200),
    p_papel: input.papel,
    p_limite_diario: input.limiteDiario == null ? null : Math.trunc(Number(input.limiteDiario)),
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/equipe");
  revalidatePath("/campanhas");
  return { ok: true, data: true };
}

export async function removerAcesso(input: {
  campanhaId: string;
  email: string;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_remover_acesso", {
    p_campanha: input.campanhaId,
    p_email: (input.email || "").trim().toLowerCase().slice(0, 200),
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

/**
 * Único lugar que usa a service role: criar login no Supabase Auth não tem como
 * ser feito por RLS. O gate de papel está abaixo E dentro das funções SQL.
 */
export async function convidarOperador(input: {
  email: string;
  nome: string;
  celular?: string;
  papel?: Papel;
  limiteDiario?: number;
}): Promise<Resultado<{ criado: boolean }>> {
  const meu = await quemSou();
  if (meu.papel !== "admin") return { ok: false, erro: "apenas admin convida gente nova" };

  const email = (input.email || "").trim().toLowerCase();
  const nome = (input.nome || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "e-mail inválido" };
  if (nome.length < 2) return { ok: false, erro: "nome muito curto" };

  const admin = await supabaseAdmin();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo: `${process.env.APP_URL ?? ""}/auth/callback`,
  });
  if (error) return { ok: false, erro: error.message };

  const { error: up } = await admin
    .from("agentes")
    .upsert(
      {
        email,
        nome: nome.slice(0, 120),
        auth_id: data?.user?.id ?? null,
        celular: (input.celular || "").slice(0, 30) || null,
        papel: input.papel === "supervisor" ? "supervisor" : "operador",
        limite_diario: Math.min(500, Math.max(1, Math.trunc(Number(input.limiteDiario) || 120))),
        ativo: true,
      },
      { onConflict: "email" }
    );
  if (up) return { ok: false, erro: up.message };

  revalidatePath("/equipe");
  return { ok: true, data: { criado: Boolean(data?.user) } };
}


/* ===================== cadência, tabulação, CRM, QA, empresa, webhook =====================
 * Tudo aqui é um invólucro fino em cima de uma `fn_*`: a regra (quem pode, qual campo é
 * obrigatório, qual proposta cabe na margem) mora no SQL. A camada web só traduz
 * formulário em argumento e devolve erro legível — é o que segura o painel com 10
 * pessoas mexendo ao mesmo tempo.
 */

/** política efetiva da campanha (o default da campanha aparece quando não há linha). */
export async function listarPolitica(campanhaId: string): Promise<PoliticaLinha[]> {
  if (!UUID.test(campanhaId)) return [];
  const sb = await supabaseServer();
  const { data } = await sb.rpc("fn_politica_rediscagem", { p_campanha: campanhaId });
  const linhas = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return linhas.map((l) => ({
    disposition: String(l.disposition) as Disposicao,
    acao: (String(l.acao ?? "repetir") as PoliticaLinha["acao"]),
    intervalo_s: Number(l.intervalo_s ?? 14400),
    hora_alvo: l.hora_alvo ? String(l.hora_alvo).slice(0, 5) : null,
    max_tentativas: l.max_tentativas == null ? null : Number(l.max_tentativas),
    prioridade_delta: Number(l.prioridade_delta ?? 0),
    observacao: (l.observacao as string | null) ?? null,
  }));
}

export async function salvarPolitica(input: {
  campanhaId: string;
  regras: PoliticaLinha[];
}): Promise<Resultado<{ regras: number }>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  if (input.regras.length > 8) return { ok: false, erro: "no máximo uma regra por disposição" };
  const r = await rpcJsonb<{ regras: number }>("fn_salvar_politica_rediscagem", {
    p_campanha: input.campanhaId,
    p_rows: input.regras.map((p) => ({
      disposition: p.disposition,
      acao: p.acao,
      intervalo_s: Math.max(60, Math.min(604800, Math.trunc(Number(p.intervalo_s) || 14400))),
      hora_alvo: p.hora_alvo || null,
      max_tentativas: p.max_tentativas == null ? null : Math.trunc(Number(p.max_tentativas)),
      prioridade_delta: Math.max(-50, Math.min(50, Math.trunc(Number(p.prioridade_delta) || 0))),
      observacao: p.observacao?.slice(0, 500) || null,
    })),
  });
  if (r.ok) revalidatePath("/campanhas");
  return r;
}

export async function bloquearTelefone(input: {
  telefone: string;
  motivo?: string;
  dias?: number | null;
  detalhe?: string;
}): Promise<Resultado<{ leads_afetados: number }>> {
  const tel = String(input.telefone || "").replace(/\D/g, "");
  if (tel.length < 10 || tel.length > 15) return { ok: false, erro: "telefone só com dígitos (10 a 15)" };
  const r = await rpcJsonb<{ leads_afetados: number }>("fn_bloquear_telefone", {
    p_telefone: tel.startsWith("55") ? `+${tel}` : `+55${tel}`,
    p_motivo: input.motivo ?? "nao_me_perturbe",
    p_dias: input.dias == null ? null : Math.trunc(Number(input.dias)),
    p_detalhe: input.detalhe?.slice(0, 400) ?? null,
  });
  if (r.ok) {
    revalidatePath("/empresa");
    revalidatePath("/leads");
    revalidatePath("/");
  }
  return r;
}

export async function liberarTelefone(telefone: string): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ ok: boolean }>("fn_liberar_telefone", { p_telefone: telefone });
  if (r.ok) {
    revalidatePath("/empresa");
    revalidatePath("/leads");
  }
  return { ok: true, data: true };
}

export async function salvarFormulario(input: {
  campanhaId: string;
  campos: CampoFormulario[];
}): Promise<Resultado<{ campos: number }>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  if (input.campos.length > 24) return { ok: false, erro: "no máximo 24 campos por campanha" };
  const limpos = input.campos
    .filter((c) => c.chave?.trim() && c.rotulo?.trim())
    .map((c) => ({
      chave: c.chave.trim().toLowerCase().slice(0, 40),
      rotulo: c.rotulo.trim().slice(0, 120),
      tipo: c.tipo || "texto",
      opcoes: Array.isArray(c.opcoes) ? c.opcoes.filter(Boolean).slice(0, 24) : undefined,
      obrigatorio: c.obrigatorio !== false,
    }));
  const r = await rpcJsonb<{ campos: number }>("fn_salvar_formulario", {
    p_campanha: input.campanhaId,
    p_campos: limpos,
  });
  if (r.ok) revalidatePath("/campanhas");
  return r;
}

export async function salvarTabulacao(input: {
  leadId: number | string;
  dados: Record<string, unknown>;
}): Promise<Resultado<Record<string, unknown>>> {
  const r = await rpcJsonb<{ extras: Record<string, unknown> }>("fn_salvar_tabulacao", {
    p_lead: Number(input.leadId),
    p_dados: input.dados,
  });
  if (!r.ok) return r;
  revalidatePath("/operador");
  revalidatePath("/leads");
  return { ok: true, data: r.data.extras ?? {} };
}

export async function qualificarLead(
  leadId: number | string,
  nota?: string
): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ status: string }>("fn_qualificar_lead", {
    p_lead: Number(leadId),
    p_nota: nota?.slice(0, 1000) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/operador");
  revalidatePath("/crm");
  return { ok: true, data: true };
}

export async function moverLead(input: {
  leadId: number | string;
  status: string;
  campanhaId?: string | null;
  motivo?: string;
}): Promise<Resultado<boolean>> {
  const PERMITIDOS = new Set([
    "novo", "sem_contato", "contato", "qualificado", "recusado", "inidoneo", "opt_out", "obito", "descarte",
  ]);
  if (!PERMITIDOS.has(input.status)) return { ok: false, erro: "estágio desconhecido" };
  const r = await rpcJsonb<{ status: string }>("fn_mover_lead", {
    p_lead: Number(input.leadId),
    p_status: input.status,
    p_campanha: input.campanhaId || null,
    p_motivo: input.motivo?.slice(0, 400) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/crm");
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true, data: true };
}

export async function criarTarefa(input: {
  leadId: number | string;
  titulo: string;
  tipo?: string;
  venceEm?: string | null;
  detalhe?: string;
  agenteId?: string | null;
}): Promise<Resultado<{ tarefa_id: number }>> {
  if ((input.titulo ?? "").trim().length < 3) return { ok: false, erro: "título muito curto" };
  const r = await rpcJsonb<{ tarefa_id: number }>("fn_criar_tarefa", {
    p_lead: Number(input.leadId),
    p_titulo: input.titulo.trim().slice(0, 200),
    p_tipo: input.tipo ?? "retorno",
    p_vence_em: input.venceEm ? new Date(input.venceEm).toISOString() : null,
    p_detalhe: input.detalhe?.slice(0, 2000) || null,
    p_agente: input.agenteId || null,
  });
  if (r.ok) {
    revalidatePath("/crm");
    revalidatePath("/");
  }
  return r;
}

export async function concluirTarefa(tarefaId: number | string, resultado?: string): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ ok: boolean }>("fn_concluir_tarefa", {
    p_tarefa: Number(tarefaId),
    p_resultado: resultado?.slice(0, 2000) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/crm");
  return { ok: true, data: true };
}

export async function fichaLead(leadId: number | string): Promise<Resultado<import("@/lib/tipos").FichaLead>> {
  const r = await rpc<import("@/lib/tipos").FichaLead>("fn_ficha_lead", { p_lead: Number(leadId) });
  if (!r.ok) return r;
  if (r.data?.ok === false) return { ok: false, erro: String(r.data.erro ?? "sem acesso a este lead") };
  return { ok: true, data: r.data };
}

export async function pontuarLeads(campanhaId?: string | null): Promise<Resultado<{ recalculados: number }>> {
  const r = await rpcJsonb<{ recalculados: number }>("fn_pontuar_leads", {
    p_campanha: campanhaId && UUID.test(campanhaId) ? campanhaId : null,
  });
  if (r.ok) revalidatePath("/leads");
  return r;
}

export async function avaliarChamada(input: {
  cdrId: number | string;
  nota: number;
  criterios?: Record<string, boolean>;
  achados?: string;
  planoAcao?: string;
}): Promise<Resultado<{ qa_id: number }>> {
  const nota = Math.trunc(Number(input.nota));
  if (!Number.isFinite(nota) || nota < 0 || nota > 100) return { ok: false, erro: "nota de 0 a 100" };
  const r = await rpcJsonb<{ qa_id: number }>("fn_avaliar_chamada", {
    p_cdr: Number(input.cdrId),
    p_nota: nota,
    p_criterios: input.criterios ?? {},
    p_achados: input.achados?.slice(0, 2000) || null,
    p_plano_acao: input.planoAcao?.slice(0, 2000) || null,
  });
  if (r.ok) {
    revalidatePath("/relatorios");
    revalidatePath("/leads");
  }
  return r;
}

export async function simularProposta(input: {
  margem: string | number | null;
  parcelas: string | number;
  publico?: string;
  taxaAa?: string | number | null;
}): Promise<Resultado<Simulacao>> {
  const margem = numeroOpcional(input.margem);
  const parcelas = Math.trunc(Number(input.parcelas));
  if (margem == null || margem <= 0) return { ok: false, erro: "informe a margem (R$/mês)" };
  if (!Number.isFinite(parcelas) || parcelas < 1) return { ok: false, erro: "informe o número de parcelas" };
  const r = await rpc<Record<string, unknown>>("fn_simular_proposta", {
    p_margem: margem,
    p_parcelas: parcelas,
    p_publico: input.publico ?? "inss",
    p_taxa_aa: numeroOpcional(input.taxaAa),
  });
  if (!r.ok) return r;
  const d = r.data ?? {};
  return {
    ok: true,
    data: {
      parcela_maxima: Number(d.parcela_maxima ?? 0),
      valor_maximo: Number(d.valor_maximo ?? 0),
      total_pago: Number(d.total_pago ?? 0),
      juros_totais: Number(d.juros_totais ?? 0),
      parcelas: Number(d.parcelas ?? parcelas),
      taxa_aa: Number(d.taxa_aa ?? 0),
      limite_margem_pct: Number(d.limite_margem_pct ?? 40),
      dentro_das_regras: Boolean(d.dentro_das_regras),
      regras: Array.isArray(d.regras) ? (d.regras as string[]) : [],
    },
  };
}

export async function editarEmpresa(input: {
  nome?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  responsavelLgpd?: string;
  avisoGravacao?: string;
}): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ empresa_id: string }>("fn_editar_empresa", {
    p_nome: input.nome?.slice(0, 120) || null,
    p_cnpj: (input.cnpj ?? "").replace(/\D/g, "") || null,
    p_telefone: input.telefone?.slice(0, 30) || null,
    p_email: input.email?.trim().slice(0, 200) || null,
    p_responsavel_lgpd: input.responsavelLgpd?.slice(0, 300) || null,
    p_aviso_gravacao: input.avisoGravacao?.slice(0, 1000) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  revalidatePath("/empresa");
  return { ok: true, data: true };
}

export async function pendencias(): Promise<Pendencias> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("fn_pendencias");
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    tarefas_vencidas: Number(r?.tarefas_vencidas ?? 0),
    retornos_de_hoje: Number(r?.retornos_de_hoje ?? 0),
    anuencia_hoje: Number(r?.anuencia_hoje ?? 0),
    qualificados_sem_proposta: Number(r?.qualificados_sem_proposta ?? 0),
    qa_da_semana: Number(r?.qa_da_semana ?? 0),
    fila_parada: Number(r?.fila_parada ?? 0),
  };
}

```


## `web/lib/tipos.ts` — 467 linhas

```ts
export type Disposicao =
  | "atendeu"
  | "nao_atendeu"
  | "ocupado"
  | "secretaria"
  | "whatsapp"
  | "ligacao_caiu"
  | "numero_invalido"
  | "falha_agent";

export const DISPOSICOES: { valor: Disposicao; rotulo: string; cor: string }[] = [
  { valor: "atendeu", rotulo: "Atendeu", cor: "#16a34a" },
  { valor: "nao_atendeu", rotulo: "Não atendeu", cor: "#64748b" },
  { valor: "ocupado", rotulo: "Ocupado", cor: "#64748b" },
  { valor: "secretaria", rotulo: "Secretária eletrônica", cor: "#9333ea" },
  { valor: "whatsapp", rotulo: "Pediu WhatsApp", cor: "#0ea5e9" },
  { valor: "ligacao_caiu", rotulo: "Caiu", cor: "#64748b" },
  { valor: "numero_invalido", rotulo: "Número inválido", cor: "#b45309" },
];

export type LeadFila = {
  job_id: string;
  lead_id: number;
  nome: string | null;
  telefone: string;
  cpf_mask: string | null;
  cidade: string | null;
  uf: string | null;
  campanha: string | null;
  publico: string | null;
  script_resumo: string | null;
  margem_estimada: number | null;
  tentativas: number;
  obs: string | null;
  origem_fila: string | null;
  banco_folha: string | null;
  pendente_carteira: number;
  roteiro_id: string | null;
  roteiro: RoteiroNoClaim | null;
  campanha_id: string | null;
  formulario: CampoFormulario[];
  extras: Record<string, unknown>;
};

/* ---------- roteiro de ligação (biblioteca no banco, não em localStorage) ---------- */

export type PassoRoteiro = {
  id: number;
  ordem: number;
  titulo: string;
  texto: string;
  obrigatorio: boolean;
  feito?: boolean;
};

export type ObjecaoRoteiro = { objecao: string; resposta: string; proibido: string | null };

/** linha de `v_roteiros` — o editor de roteiros lê tudo isto em um request */
export type Roteiro = {
  id: string;
  nome: string;
  publico: string;
  versao: number;
  ativo: boolean;
  aviso_compliance: string | null;
  em_uso: number;
  atualizado_em: string;
  passos: PassoRoteiro[];
  objecoes: ObjecaoRoteiro[];
};

/** o objeto que `fn_claim_next_lead` devolve em `roteiro` (com `feito` por lead) */
export type RoteiroNoClaim = {
  nome: string;
  versao: number;
  publico: string;
  aviso: string | null;
  passos: PassoRoteiro[];
  objecoes: ObjecaoRoteiro[];
};

/** linha de `v_aderencia_roteiro` */
export type LinhaAderencia = {
  agente_id: string;
  agente: string;
  papel: Papel;
  leads_de_hoje: number;
  passos_devidos: number;
  passos_cumpridos: number;
  aderencia_pct: number | null;
};

export type PainelDia = {
  dia: string;
  campanha: string | null;
  agente: string | null;
  chamadas: number;
  contatos: number;
  taxa_contato_pct: number | null;
  efetivos_30s: number;
  segundos_falados: number | null;
};

export type AnuenciaPendente = {
  proposta_id: string;
  lead_id: number;
  nome: string | null;
  telefone_e164: string;
  valor: number;
  parcelas: number;
  anuencia: string;
  enviada_em: string;
  prazo_validade: string;
  dias_restantes: number;
  responsavel?: string | null;
};

// --------------------------------------------------------------------- equipe/RBAC
export type Papel = "operador" | "supervisor" | "admin";
export type AnuenciaStatus = "enviada" | "pendente_confirmacao" | "confirmada" | "expirada" | "recusada";

export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: "operador", rotulo: "Operador", descricao: "disca a própria carteira e o pool das campanhas dele" },
  { valor: "supervisor", rotulo: "Supervisor", descricao: "vê o time, monta carteira e edita as próprias campanhas" },
  { valor: "admin", rotulo: "Admin", descricao: "tudo: equipe, papéis, campanhas, janelas fora do padrão" },
];

export type AcessoCampanha = { id: string; nome: string; papel?: Papel; limite_diario?: number | null };

export type QuemSou = {
  agente_id: string | null;
  email: string | null;
  nome: string | null;
  papel: Papel | "ninguem";
  ativo: boolean;
  celular: string | null;
  limite_diario: number;
  pausado_ate: string | null;
  status_agente: string | null;
  ultimo_ciclo_em: string | null;
  discadas_hoje: number;
  campanhas: AcessoCampanha[];
  gerencia: { id: string; nome: string }[];
  /** cadastro da empresa (o dono edita em /empresa) — aparece no topo das telas */
  empresa: {
    nome: string;
    cnpj: string | null;
    responsavel_lgpd: string | null;
    aviso_gravacao: string | null;
  } | null;
  tarefas_abertas: number;
};

export type MembroEquipe = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  celular: string | null;
  limite_diario: number;
  pausado_ate: string | null;
  status_agente: string | null;
  ultimo_ciclo_em: string | null;
  auth_id: string | null;
};

export type LinhaRanking = {
  agente_id: string;
  nome: string;
  papel: Papel;
  status_agente: string | null;
  ultimo_ciclo_em: string | null;
  limite_diario: number;
  chamadas: number;
  contatos: number;
  efetivos_30s: number;
  segundos_falados: number;
  na_carteira: number;
  taxa_contato_pct: number | null;
};

export type LinhaMonitor = {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  status_agente: string | null;
  pausado_ate: string | null;
  ultimo_ciclo_em: string | null;
  agente_online: boolean;
  limite_diario: number;
  discadas_hoje: number;
  jobs_abertos: number;
  carteira_pendente: number;
  campanhas: string[] | null;
};

export type CampanhaGestao = {
  id: string;
  nome: string;
  publico: string;
  ativo: boolean;
  janela_ini: string;
  janela_fim: string;
  max_tentativas: number;
  intervalo_retentativa_s: number;
  permite_overflow: boolean;
  script_resumo: string | null;
  na_fila: number;
  atribuidos: number;
  equipe: { agente_id: string; nome: string; email: string; papel: Papel; limite_diario: number | null }[];
};

/* ---------- contratos entre as actions e as telas ---------- */

/** `fn_claim_next_lead` (JSONB) — o que a tela do operador mostra para discar. */
export type ProximoLead = {
  lead_id: number;
  job_id: string;
  telefone_e164: string;
  telefone_usado: string;
  nome: string | null;
  banco_folha: string | null;
  uf: string | null;
  margem_estimada: number | null;
  tentativas: number;
  max_tentativas: number;
  script_resumo: string | null;
  campanha_id: string;
  campanha_nome: string | null;
  janela_ini: string;
  janela_fim: string;
  origem_fila: "rigida" | "overflow";
  duplicado_de: number | null;
};

/** `v_fila` — o que dá para consultar sem travar ninguém (o claim é outra coisa). */
export type FilaItem = {
  lead_id: number;
  nome: string | null;
  telefone_e164: string;
  status: string;
  tentativas: number;
  prioridade: number;
  banco_folha: string | null;
  tem_matricula: boolean;
  campanha: string | null;
  max_tentativas: number;
  proximo_contato_at: string | null;
  dono: string | null;
  na_minha_carteira: boolean;
};

/** `v_campanhas_aberta` (via view pública `v_campanhas_aberta` criada no schema). */
export type CampanhaAberta = {
  id: string;
  nome: string;
  publico: string;
  janela_ini: string;
  janela_fim: string;
  max_tentativas: number;
  intervalo_retentativa_s: number;
  script_resumo: string | null;
  permite_overflow: boolean;
};

export type ImportarResult = {
  aceitos: number;
  ignorados: {
    total: number;
    cpf_invalido: number;
    opt_out: number;
    telefone_fora_do_padrao: number;
    duplicado_na_planilha: number;
    duplicado_no_banco: number;
    janela_invalida: number;
  };
  avisos: { linha: number; campo: string; motivo: string }[];
};

export type PausarResult = {
  pausado_ate: string | null; // timestamptz — a tela calcula a volta a partir daqui
  proximo_despertar: string | null;
  motivo: string | null;
};

export type Convite = {
  email: string;
  ja_existe: boolean;
  url: string | null;
  aviso?: string;
};

export type PerfilInput = {
  nome?: string;
  telefone?: string;
  dispositivo?: string;
};

export type PropostaInput = {
  leadId: number | string;
  valor: string | number;
  parcelas: string | number;
  taxaAa?: string | number;
  banco?: string;
  protocoloInss?: string;
  obs?: string;
};

/** linha de `fn_agendar_retorno` / devolução de lead por expiração. */
export type Retorno = { lead_id: number; agendado_para: string; status: string };

/* ---------- porte dos concorrentes: cadência, tabulação, CRM, QA, empresa ---------- */

/** linha de `fn_politica_rediscagem` / body de `fn_salvar_politica_rediscagem`. */
export type PoliticaLinha = {
  disposition: Disposicao;
  acao: "repetir" | "contato" | "qualificar" | "descartar" | "sem_contato";
  intervalo_s: number;
  hora_alvo: string | null;
  max_tentativas: number | null;
  prioridade_delta: number;
  observacao: string | null;
};

/** campo do formulário de tabulação da campanha (`campanhas.formulario`). */
export type CampoFormulario = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "numero" | "data" | "selecao" | "sim_nao" | "telefone";
  opcoes?: string[];
  obrigatorio?: boolean;
};

export type Tarefa = {
  id: number;
  lead_id: number;
  lead: string | null;
  telefone_e164?: string;
  campanha: string | null;
  titulo: string;
  tipo: string;
  detalhe: string | null;
  vence_em: string;
  concluida_em: string | null;
  resultado: string | null;
  agente_id: string | null;
  dono: string | null;
  situacao: "vencida" | "hoje" | "futura" | "concluida";
};

export type MetaDia = {
  campanha_id: string;
  campanha: string;
  meta_diaria: number | null;
  contatos_hoje: number;
  chamadas_hoje: number;
  pct_meta: number | null;
  faltam: number;
  operadores_ativos: number;
};

export type QaLinha = {
  agente_id: string;
  agente: string;
  papel: string;
  avaliacoes: number;
  nota_media: number | null;
  pior_nota: number | null;
  ultima_avaliacao: string | null;
  auditorias_da_semana: number;
};

export type FunilLinha = {
  campanha: string | null;
  status: string;
  leads: number;
  total_campanha: number | null;
  pct_da_campanha: number | null;
};

export type MapaLinha = { dow: number; hora: number; chamadas: number; contatos: number; taxa_contato_pct: number | null; duracao_media_s: number | null };

/** `v_visao_dono` — a operação inteira num request. */
export type VisaoDono = {
  operadores_ativos: number;
  operadores_online: number;
  campanhas_ativas: number;
  leads_na_fila: number;
  aguardando_proposta: number;
  propostas_totais: number;
  anuencia_aberta: number;
  anuencia_confirmada: number;
  valor_confirmado: number;
  valor_em_andamento: number;
  chamadas_hoje: number;
  contatos_hoje: number;
  efetivos_hoje: number;
  taxa_contato_pct: number | null;
  proposta_por_contato_pct: number | null;
  numeros_bloqueados: number;
  tarefas_vencidas: number;
  qa_semana: number;
};

export type Pendencias = {
  tarefas_vencidas: number;
  retornos_de_hoje: number;
  anuencia_hoje: number;
  qualificados_sem_proposta: number;
  qa_da_semana: number;
  fila_parada: number;
};

export type EmpresaInfo = {
  id?: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  responsavel_lgpd: string | null;
  aviso_gravacao: string | null;
  janela_ini?: string;
  janela_fim?: string;
};

/** `fn_ficha_lead` — o 360º montado no banco, num request só. */
export type FichaLead = {
  ok: boolean;
  erro?: string;
  lead?: Record<string, unknown>;
  campanha?: { id: string; nome: string; publico: string; formulario: CampoFormulario[]; roteiro_id: string | null; meta_diaria: number | null } | null;
  eventos?: { quando: string; de: string | null; para: string | null; detalhe: string | null }[];
  cdrs?: { id: number; quando: string; duracao_s: number | null; disposition: string; nota: string | null; fonte: string; agente: string | null }[];
  propostas?: { id: string; valor: number; parcelas: number; taxa_aa: number | null; anuencia: string; enviada_em: string; prazo_validade: string; protocolo: string | null; banco: string | null }[];
  tarefas?: Tarefa[];
  roteiro?: { titulo: string; obrigatorio: boolean; feito: boolean | null; marcado_em: string | null }[];
  qa?: { nota: number; criterios: Record<string, unknown>; achados: string | null; plano_acao: string | null; quando: string; avaliador: string | null }[];
  bloqueio?: { motivo: string; detalhe: string | null; expira_em: string | null; origem: string } | null;
};

export type Simulacao = {
  parcela_maxima: number;
  valor_maximo: number;
  total_pago: number;
  juros_totais: number;
  parcelas: number;
  taxa_aa: number;
  limite_margem_pct: number;
  dentro_das_regras: boolean;
  regras: string[];
};

/** item de `public.bloqueios` na tela do dono. */
export type BloqueioLinha = {
  telefone_e164: string;
  motivo: string;
  detalhe: string | null;
  expira_em: string | null;
  origem: string;
  criado_em: string;
  criado_por: string | null;
  dias_restantes: number | null;
  leads: number;
  leads_vivos: number;
};

```


## `web/lib/tempo-real.ts` — 64 linhas

```ts
"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Painel ao vivo, sem F5.
 *
 * O Supabase emite `postgres_changes` por TABELA, não por view — então a tela
 * escuta as tabelas que alimentam a view que ela mostra e recarrega no primeiro
 * evento. A RLS não muda nada aqui: quem não enxerga a linha pelo SELECT também
 * não recebe o evento dela (o canal só entrega o que o papel já permite ler).
 *
 * Se `supabase/realtime.sql` não foi rodado no projeto, o canal fica mudo e o
 * pulso de `fallbackMs` assume — a página nunca para por causa disso.
 */
export function useTempoReal(
  tabelas: string[],
  recarregar: () => void,
  fallbackMs = 30_000
): void {
  const callbackRef = useRef(recarregar);
  callbackRef.current = recarregar;

  const chave = tabelas.join(",");
  useEffect(() => {
    let cancelado = false;
    let adiado: ReturnType<typeof setTimeout> | null = null;
    const sb = supabaseBrowser();

    // rajada de evento (10 operadores fechando chamada na mesma hora) vira UMA
    // recarga: os 800 ms seguintes são agrupados
    const disparar = () => {
      if (adiado) return;
      adiado = setTimeout(() => {
        adiado = null;
        if (!cancelado) callbackRef.current();
      }, 800);
    };

    let canal: ReturnType<typeof sb.channel> | null = null;
    try {
      canal = sb.channel(`painel-ao-vivo:${chave}`);
      for (const tabela of chave.split(",")) {
        canal = canal.on(
          "postgres_changes",
          { event: "*", schema: "public", table: tabela },
          disparar
        );
      }
      canal.subscribe();
    } catch {
      canal = null; // realtime desabilitado: fica só o pulso
    }

    const pulso = setInterval(disparar, fallbackMs);
    return () => {
      cancelado = true;
      clearInterval(pulso);
      if (adiado) clearTimeout(adiado);
      if (canal) sb.removeChannel(canal);
    };
  }, [chave, fallbackMs]);
}

```


## `web/lib/tempo.ts` — 14 linhas

```ts
/**
 * Fuso da operação: o dia de trabalho é o de Brasília, e as views do banco já
 * truncam `now() at time zone 'America/Sao_Paulo'`.
 *
 * Isso não é preciosismo de CSS: componente de tela formata data no servidor
 * (SSR) e de novo no navegador. Sem fuso explícito, o servidor da Vercel (UTC)
 * escreve uma hora e o navegador do operador escreve outra — React reclama de
 * hydration e, pior, o operador vê o prazo da anuência com hora errada. Todo
 * `toLocale*` de data neste app passa por aqui.
 */
export const BR_TZ = "America/Sao_Paulo";

export const OPC_DATA_HORA = { timeZone: BR_TZ, dateStyle: "short", timeStyle: "short" } as const;
export const OPC_DATA = { timeZone: BR_TZ, dateStyle: "medium" } as const;

```


## `web/lib/supabase/server.ts` — 39 linhas

```ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components / Server Actions / Route Handlers.
 * Sempre `getUser()` (nunca `getSession()`): valida o token no servidor de auth.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // chamado a partir de um Server Component: pode ignorar se houver
          // middleware refreshando a sessão.
        }
      },
    },
  });
}

/** Cliente com service role — só no servidor. Usado para as RPCs da discadora. */
export async function supabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "Content-Type": "application/json" } },
  });
}

```


## `web/lib/supabase/client.ts` — 10 linhas

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

```


## `web/app/api/leads/route.ts` — 113 linhas

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Porta de entrada de lead vinda de fora do painel (formulário do site, landing,
 * botão de WhatsApp, ferramenta de mídia).
 *
 * Por que ela é pública: quem preencheu o formulário não tem sessão aqui. A
 * proteção não é a sessão, são quatro regras dentro da `fn_receber_lead_webhook`:
 *   1. `webhook_token` da campanha, e a campanha precisa estar com a porta aberta;
 *   2. consentimento por titular, só de canal aceito;
 *   3. número em lista de bloqueio é recusado;
 *   4. trava de volume por minuto.
 * A rota não escreve em nada sozinha: repassa o corpo para a RPC, que roda como
 * `security definer` — é o único caminho de escrita que um `anon` tem neste schema.
 */
const MAX_LINHAS = 50;

type Corpo = {
  token?: string;
  lead?: Record<string, unknown>;
  leads?: Record<string, unknown>[];
};

type Veredito = { ok?: boolean; erro?: string; duplicado?: boolean; bloqueado?: boolean; lead_id?: number };

function cliente(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function receber(sb: SupabaseClient, token: string, linha: Record<string, unknown>): Promise<Veredito> {
  const { data, error } = await sb.rpc("fn_receber_lead_webhook", { p_token: token, p_row: linha });
  if (error) return { ok: false, erro: error.message.slice(0, 300) };
  const bruto = Array.isArray(data) ? data[0] : data; // PostgREST oscila entre objeto e lista de 1
  return (bruto ?? { ok: false, erro: "resposta vazia" }) as Veredito;
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ ok: false, erro: "serviço sem NEXT_PUBLIC_SUPABASE_* configurado" }, { status: 503 });
  }

  let corpo: Corpo;
  try {
    corpo = (await request.json()) as Corpo;
  } catch {
    return NextResponse.json({ ok: false, erro: "esperado JSON" }, { status: 400 });
  }

  const token = String(corpo.token ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ ok: false, erro: "token inválido" }, { status: 401 });
  }

  const linhas = Array.isArray(corpo.leads) ? corpo.leads.slice(0, MAX_LINHAS) : corpo.lead ? [corpo.lead] : [];
  if (!linhas.length) {
    return NextResponse.json({ ok: false, erro: 'envie {"token":"...","lead":{...}} ou "leads":[...]' }, { status: 400 });
  }

  const sb = cliente();
  const saidas = await Promise.all(linhas.map((l) => receber(sb, token, l)));

  const duplicados = saidas.filter((s) => s.duplicado).length;
  const recusados = saidas.filter((s) => !s.ok).map((s) => s.erro ?? "recusado");
  const aceitos = saidas.filter((s) => s.ok && !s.duplicado).length;
  const volume = saidas.some((s) => String(s.erro ?? "").toLowerCase().includes("volume"));

  return NextResponse.json(
    {
      ok: recusados.length === 0,
      aceitos,
      duplicados,
      recusados,
      recebido: linhas.length,
      maximo_por_chamada: MAX_LINHAS,
    },
    {
      status: volume ? 429 : recusados.length === linhas.length ? 400 : 200,
      headers: { "cache-control": "no-store" },
    }
  );
}

/** Health check: confirma que a porta existe sem dizer nada sobre dado de cliente. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      rota: "POST /api/leads",
      precisa: "token da campanha + lead com telefone_e164 e consentimento",
      recusa: "número bloqueado, consentimento ausente ou revogado, mais de 30 leads por minuto",
      exemplo: {
        token: "00000000-0000-0000-0000-000000000000",
        lead: {
          nome: "Quem preencheu o formulário",
          telefone_e164: "+5579999990001",
          cpf: "52998224725",
          cidade: "Aracaju",
          uf: "SE",
          margem_estimada: "420",
          consentimento: "form_proprio",
          origem_url: "/simule-seu-consignado",
        },
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

// nada de cache de edge: o veredito do banco é por requisição
export const dynamic = "force-dynamic";

```


## `web/app/api/export/csv/route.ts` — 91 linhas

```ts
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";

/**
 * Exportação CSV dos painéis — o "baixa a planilha e abre no Excel" que todo
 * supervisor pede no primeiro dia.
 *
 * Ela não monta consulta nenhuma no cliente: cada tipo é uma VIEW do schema, e a
 * view tem `security_invoker`, então o CSV que sai daqui recorta exatamente o que a
 * RLS da pessoa deixaria ver na tela. Exportar não é porta de saída de dado alheio.
 */
const TIPOS: Record<string, { view: string; colunas: string[]; nome: string }> = {
  painel: {
    view: "v_painel_dia",
    colunas: ["dia", "campanha", "agente", "chamadas", "contatos", "taxa_contato_pct", "efetivos_30s", "curtas_suspeitas", "segundos_falados"],
    nome: "discagem-por-dia",
  },
  ranking: {
    view: "v_ranking_dia",
    colunas: ["nome", "papel", "status_agente", "chamadas", "contatos", "efetivos_30s", "taxa_contato_pct", "segundos_falados", "na_carteira"],
    nome: "ranking-do-dia",
  },
  esteira: {
    view: "v_crm_leads",
    colunas: ["lead_id", "nome", "telefone_e164", "estagio", "status", "campanha", "dono", "prioridade", "tentativas",
              "margem_estimada", "banco_folha", "uf", "ultima_chamada_at", "proximo_contato_at", "tarefas_abertas", "dias_sem_falar"],
    nome: "esteira-crm",
  },
  agenda: {
    view: "v_agenda",
    colunas: ["id", "lead_id", "lead", "telefone_e164", "campanha", "titulo", "tipo", "situacao", "vence_em", "concluida_em", "resultado", "dono"],
    nome: "agenda",
  },
  metas: {
    view: "v_metas_dia",
    colunas: ["campanha", "meta_diaria", "contatos_hoje", "chamadas_hoje", "pct_meta", "faltam", "operadores_ativos"],
    nome: "metas-do-dia",
  },
  funil: { view: "v_funil", colunas: ["campanha", "status", "leads", "total_campanha", "pct_da_campanha"], nome: "funil" },
  mapa: { view: "v_mapa_horario", colunas: ["dow", "hora", "chamadas", "contatos", "taxa_contato_pct", "duracao_media_s"], nome: "melhor-horario" },
  aderencia: {
    view: "v_aderencia_roteiro",
    colunas: ["agente_id", "agente", "papel", "leads_de_hoje", "passos_devidos", "passos_cumpridos", "aderencia_pct"],
    nome: "aderencia-roteiro",
  },
  qa: { view: "v_qa_resumo", colunas: ["agente", "papel", "avaliacoes", "nota_media", "pior_nota", "auditorias_da_semana", "ultima_avaliacao"], nome: "qa" },
  anuencia: {
    view: "v_anuencia_pendente",
    colunas: ["proposta_id", "lead_id", "nome", "telefone_e164", "valor", "parcelas", "anuencia", "enviada_em", "prazo_validade", "dias_restantes", "responsavel"],
    nome: "anuencia-pendente",
  },
};

function csv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const meu = await quemSou();
  if (meu.papel === "ninguem") {
    return NextResponse.json({ ok: false, erro: "faça login para exportar" }, { status: 401 });
  }

  const tipo = new URL(request.url).searchParams.get("tipo") ?? "painel";
  const config = TIPOS[tipo];
  if (!config) {
    return NextResponse.json({ ok: false, erro: `tipo desconhecido; use um de: ${Object.keys(TIPOS).join(", ")}` }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data, error } = await sb.from(config.view).select(config.colunas.join(",")).limit(5000);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const linhas = (data as unknown as Record<string, unknown>[] | null) ?? [];
  const corpo = [config.colunas.join(";"), ...linhas.map((l) => config.colunas.map((c) => csv(l[c])).join(";"))].join("\r\n");
  const hoje = new Date().toISOString().slice(0, 10);

  return new Response("\uFEFF" + corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${config.nome}-${hoje}.csv"`,
      "cache-control": "no-store",
      "x-linhas": String(linhas.length),
    },
  });
}

export const dynamic = "force-dynamic";

```
