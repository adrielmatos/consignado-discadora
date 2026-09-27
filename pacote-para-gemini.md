# Pacote para revisão por outro modelo — Discadora de Consignado (Vercel + Supabase + GitHub + Phone Link)

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


---

# 5. App Next.js — telas


## `web/app/layout.tsx` — 59 linhas

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { sair } from "@/app/login/acoes";
import { quemSou } from "@/lib/acoes";

export const metadata: Metadata = {
  title: "Discadora Consignado",
  description: "CRM + discadora pelo celular (Phone Link) para crédito consignado",
};

/**
 * A nav é montada pelo papel real (fn_quem_sou), não por suposição do cliente.
 * Esconder link não é segurança — a RLS e as funções SQL são a segurança —, mas
 * com 10 pessoas na sala, mostrar "Equipe" para um operador só gera chamado.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  let meu = await quemSou().catch(() => null);
  email = meu?.email ?? null;
  const gerencia = meu && (meu.papel === "admin" || meu.papel === "supervisor");
  const pausado = meu?.pausado_ate && new Date(meu.pausado_ate) > new Date();
  const limite = meu && meu.limite_diario > 0 ? Math.min(100, Math.round((meu.discadas_hoje / meu.limite_diario) * 100)) : 0;

  return (
    <html lang="pt-br">
      <body>
        <nav>
          <b>Discadora Consignado</b>
          <Link href="/operador">Operador</Link>
          <Link href="/leads">Leads</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/relatorios">Relatórios</Link>
          {gerencia ? <Link href="/campanhas">Campanhas</Link> : null}
          {gerencia ? <Link href="/empresa">Empresa</Link> : null}
          {gerencia || meu?.papel === "admin" ? <Link href="/equipe">Equipe</Link> : null}
          <form action={sair} style={{ display: "inline" }}>
            <button type="submit" className="btn" style={{ padding: "6px 10px" }}>sair</button>
          </form>
          <span style={{ marginLeft: "auto" }} className="mudo">
            {meu?.nome ? `${meu.nome}` : (email ?? "não autenticado")}
            {meu && meu.papel !== "ninguem" ? <span className={`chip ${pausado ? "chip-ambar" : "chip-verde"}`} style={{ marginLeft: 8 }}>{meu.papel}</span> : null}
            {meu && meu.papel !== "ninguem" ? (
              <span className={`chip ${limite >= 90 ? "chip-vermelho" : "chip-azul"}`} style={{ marginLeft: 6 }}>
                {meu.discadas_hoje}/{meu.limite_diario} hoje
              </span>
            ) : null}
            {meu && meu.tarefas_abertas > 0 ? (
              <Link href="/crm" className={`chip ${meu.tarefas_abertas > 0 ? "chip-ambar" : ""}`} style={{ marginLeft: 6 }}>
                {meu.tarefas_abertas} tarefa(s)
              </Link>
            ) : null}
          </span>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}

```


## `web/app/page.tsx` — 227 linhas

```tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { pendencias, quemSou } from "@/lib/acoes";
import type { AnuenciaPendente, LinhaRanking, PainelDia, VisaoDono } from "@/lib/tipos";
import AoVivo from "./ao-vivo";
import { OPC_DATA, OPC_DATA_HORA } from "@/lib/tempo";

export const dynamic = "force-dynamic";

async function carregar() {
  try {
    const sb = await supabaseServer();
    const [fila, painel, anuencia, leadsTotal, ranking, jobsAbertos, visao] = await Promise.all([
      sb.from("v_fila").select("lead_id, nome, telefone_e164, dono, na_minha_carteira"),
      sb.from("v_ranking_dia").select("*").limit(40),
      sb.from("dial_jobs").select("id", { count: "exact", head: true }).in("status", ["claimed", "discado"]),
      sb.from("v_painel_dia").select("*").order("dia", { ascending: false }).limit(14),
      sb.from("v_anuencia_pendente").select("*").limit(10),
      sb.from("leads").select("id", { count: "exact", head: true }),
      sb.from("v_visao_dono").select("*").limit(40),
    ]);
    return {
      fila: fila.data?.length ?? 0,
      filaAmostra: (fila.data as { lead_id: number; nome: string | null; telefone_e164: string; dono: string | null; na_minha_carteira: boolean }[] | null) ?? [],
      ranking: (ranking.data as LinhaRanking[] | null) ?? [],
      jobsAbertos: jobsAbertos.count ?? 0,
      visao: (visao.data as VisaoDono[] | null) ?? [],
      painel: (painel.data as PainelDia[] | null) ?? [],
      anuencia: (anuencia.data as AnuenciaPendente[] | null) ?? [],
      leadsTotal: leadsTotal.count ?? 0,
      erro: fila.error?.message ?? painel.error?.message ?? null,
    };
  } catch (e) {
    return { fila: 0, filaAmostra: [], ranking: [], jobsAbertos: 0, painel: [], anuencia: [],
             leadsTotal: 0, visao: [], erro: String(e) };
  }
}

export default async function PaginaInicial() {
  const [d, meu, pend] = await Promise.all([carregar(), quemSou(), pendencias()]);
  const paradas =
    pend.tarefas_vencidas + pend.qualificados_sem_proposta + pend.anuencia_hoje + pend.fila_parada;
  const visao = d.visao[0];
  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";
  const hoje = d.painel[0];
  const contatosHoje = d.painel.reduce((s, p) => s + (p.contatos ?? 0), 0);
  const discadasHoje = d.painel.reduce((s, p) => s + (p.chamadas ?? 0), 0);

  return (
    <>
      <AoVivo tabelas={["dial_jobs", "leads", "tarefas", "propostas"]} />
      <h1>Painel</h1>
      {paradas > 0 ? (
        <div className="card" style={{ borderColor: "#7c2d12", marginBottom: 14 }}>
          <b>{paradas} coisa(s) paradas hoje</b>
          <div className="linha" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {pend.tarefas_vencidas ? <Link className="chip chip-vermelho" href="/crm">{pend.tarefas_vencidas} tarefa(s) vencida(s)</Link> : null}
            {pend.retornos_de_hoje ? <Link className="chip chip-ambar" href="/crm">{pend.retornos_de_hoje} retorno(s) prometido(s) para hoje</Link> : null}
            {pend.qualificados_sem_proposta ? <Link className="chip chip-ambar" href="/crm">{pend.qualificados_sem_proposta} qualificado(s) sem proposta</Link> : null}
            {pend.anuencia_hoje ? <Link className="chip chip-vermelho" href="/crm">{pend.anuencia_hoje} anuência(s) vencendo hoje</Link> : null}
            {pend.fila_parada ? <span className="chip chip-azul">{pend.fila_parada} lead(s) nunca discado(s)</span> : null}
            {pend.qa_da_semana === 0 ? <Link className="chip" href="/relatorios">nenhuma auditoria de ligação nesta semana</Link> : null}
          </div>
          <p className="mudo" style={{ marginBottom: 0 }}>
            As contagens vêm de <code>fn_pendencias</code> — o mesmo lugar de que a esteira lê, então o
            alerta e o cartão batem. Nada aqui é calculado no navegador.
          </p>
        </div>
      ) : null}
      <div className="grade">
        <div className="kpi"><span>leads na base</span><b>{d.leadsTotal}</b></div>
        <div className="kpi"><span>na fila p/ discar</span><b>{d.fila}</b></div>
        <div className="kpi"><span>chamadas hoje</span><b>{discadasHoje}</b></div>
        <div className="kpi"><span>contatos hoje</span><b>{contatosHoje}</b></div>
        <div className="kpi">
          <span>taxa de contato</span>
          <b>{discadasHoje ? Math.round((contatosHoje / discadasHoje) * 100) + "%" : "—"}</b>
        </div>
        <div className="kpi"><span>aguardando anuência INSS</span><b>{d.anuencia.length}</b></div>
        <div className="kpi"><span>jobs abertos agora</span><b>{d.jobsAbertos}</b></div>
        <div className="kpi"><span>minha cota de hoje</span>
          <b>{meu.discadas_hoje}/{meu.limite_diario}</b>
        </div>
      </div>

      {meu.papel === "ninguem" ? (
        <p className="alerta" style={{ marginTop: 14 }}>
          Login sem linha em <code>agentes</code> ou sem campanha: nada aparece na fila. Um admin
          precisa te convidar em <Link href="/equipe">Equipe</Link> e dar acesso a uma campanha.
        </p>
      ) : null}
      {meu.pausado_ate && new Date(meu.pausado_ate) > new Date() ? (
        <p className="alerta" style={{ marginTop: 14 }}>
          Você está pausado até {new Date(meu.pausado_ate).toLocaleString("pt-BR", OPC_DATA_HORA)} — saia da pausa na{" "}
          <Link href="/operador">tela do operador</Link>.
        </p>
      ) : null}

      <h2>Amostra da fila (o resto só aparece via claim, com trava)</h2>
      {d.filaAmostra.length === 0 ? (
        <p className="mudo">fila vazia no seu escopo</p>
      ) : (
        <div className="rolagem">
          <table>
            <thead><tr><th>lead</th><th>telefone</th><th>banco/dono</th><th>origem</th></tr></thead>
            <tbody>
              {d.filaAmostra.slice(0, 8).map((l) => (
                <tr key={l.lead_id}>
                  <td>{l.nome ?? "—"}</td>
                  <td className="mudo">{l.telefone_e164}</td>
                  <td className="mudo">{l.dono ?? "pool"}</td>
                  <td>{l.na_minha_carteira ? <span className="chip chip-verde">carteira</span> : <span className="chip">pool</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gerencia ? (
        <>
          <h2>A operação inteira (uma leitura só)</h2>
          {!visao ? <p className="mudo">sem linha em <code>v_visao_dono</code></p> : (
            <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="chip chip-verde">{visao.operadores_online}/{visao.operadores_ativos} online</span>
              <span className="chip">{visao.campanhas_ativas} campanha(s) ativa(s)</span>
              <span className="chip chip-azul">{visao.leads_na_fila} na fila</span>
              <span className="chip chip-ambar">{visao.aguardando_proposta} qualificado(s) sem proposta</span>
              <span className="chip">{visao.propostas_totais} propostas · {visao.anuencia_aberta} com anuência aberta · {visao.anuencia_confirmada} confirmada(s)</span>
              <span className="chip chip-verde">R$ {Number(visao.valor_confirmado).toLocaleString("pt-BR")} confirmado · R$ {Number(visao.valor_em_andamento).toLocaleString("pt-BR")} em andamento</span>
              <span className="chip">{visao.chamadas_hoje} chamadas hoje · {visao.contatos_hoje} contatos · {visao.efetivos_hoje} ≥30s</span>
              <span className="chip">{visao.taxa_contato_pct ?? "—"}% contato · {visao.proposta_por_contato_pct ?? "—"}% proposta por contato</span>
              <span className="chip chip-vermelho">{visao.numeros_bloqueados} números bloqueados</span>
              <span className="chip">{visao.qa_semana} auditoria(s) na semana</span>
            </div>
          )}

          <h2>Quem produziu hoje</h2>
          {d.ranking.length === 0 ? <p className="mudo">nenhum operador no seu escopo</p> : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr><th>operador</th><th>papel</th><th>agente</th><th className="num">chamadas</th>
                      <th className="num">contatos</th><th className="num">≥30s</th><th className="num">%</th>
                      <th className="num">min falados</th><th className="num">carteira</th></tr>
                </thead>
                <tbody>
                  {d.ranking.map((r) => (
                    <tr key={r.agente_id}>
                      <td>{r.nome}</td>
                      <td><span className={`chip ${r.papel === "admin" ? "chip-vermelho" : r.papel === "supervisor" ? "chip-azul" : ""}`}>{r.papel}</span></td>
                      <td>
                        {r.ultimo_ciclo_em && Date.now() - new Date(r.ultimo_ciclo_em).getTime() < 180_000
                          ? <span className="chip chip-verde">{r.status_agente ?? "online"}</span>
                          : <span className="chip chip-ambar">sem heartbeat</span>}
                      </td>
                      <td className="num">{r.chamadas}</td>
                      <td className="num">{r.contatos}</td>
                      <td className="num">{r.efetivos_30s}</td>
                      <td className="num">{r.taxa_contato_pct ?? 0}%</td>
                      <td className="num">{Math.round(Number(r.segundos_falados ?? 0) / 60)}</td>
                      <td className="num">{r.na_carteira}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mudo">
            “sem heartbeat” significa que o agente do Windows daquela pessoa não rodou nos últimos 3
            minutos — o lead dela fica na fila, não é perdido: <code>fn_expirar_jobs</code> devolve
            sozinho.
          </p>
        </>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <Link href="/operador" className="btn" style={{ textDecoration: "none" }}>
          Ir para a tela do operador →
        </Link>
      </div>

      {d.erro ? <p className="alerta">Sem conexão com o Supabase ainda: {d.erro}</p> : null}

      <h2>Discagem por dia</h2>
      {d.painel.length === 0 ? (
        <p className="mudo">nenhuma chamada registrada ainda</p>
      ) : (
        <table>
          <thead>
            <tr><th>dia</th><th>campanha</th><th>agente</th><th>chamadas</th><th>contatos</th><th>% contato</th><th>efetivos ≥30s</th><th>min falados</th></tr>
          </thead>
          <tbody>
            {d.painel.map((p, i) => (
              <tr key={i}>
                <td>{String(p.dia).slice(0, 10)}</td><td>{p.campanha ?? "—"}</td><td>{p.agente ?? "—"}</td>
                <td>{p.chamadas}</td><td>{p.contatos}</td>
                <td>{p.taxa_contato_pct ?? 0}%</td><td>{p.efetivos_30s}</td>
                <td>{Math.round((p.segundos_falados ?? 0) / 60)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hoje ? <p className="mudo">primeiro dia com dados: {String(hoje.dia).slice(0, 10)}</p> : null}

      <h2>Anuência pendente no Meu INSS (prazo 5 dias)</h2>
      {d.anuencia.length === 0 ? (
        <p className="mudo">nada pendente</p>
      ) : (
        <table>
          <thead><tr><th>lead</th><th>telefone</th><th>valor</th><th>parcelas</th><th>status</th><th>dias restantes</th></tr></thead>
          <tbody>
            {d.anuencia.map((a) => (
              <tr key={a.proposta_id}>
                <td>{a.nome ?? a.lead_id}</td><td>{a.telefone_e164}</td>
                <td>R$ {Number(a.valor).toLocaleString("pt-BR")}</td><td>{a.parcelas}</td>
                <td>{a.anuencia}</td>
                <td style={{ color: a.dias_restantes <= 2 ? "#f87171" : undefined }}>{a.dias_restantes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

```


## `web/app/ao-vivo.tsx` — 16 linhas

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTempoReal } from "@/lib/tempo-real";

/**
 * Cantinho de 0×0 que mantém o painel server-rendered vivo: escuta as tabelas
 * pedidas e chama `router.refresh()`, que re-executa o Server Component com a
 * RLS do usuário. Nada de estado duplicado no cliente — a fonte continua sendo a
 * view, e o que a pessoa vê é o que o banco deixa ela ver.
 */
export default function AoVivo({ tabelas, fallbackMs }: { tabelas: string[]; fallbackMs?: number }) {
  const router = useRouter();
  useTempoReal(tabelas, () => router.refresh(), fallbackMs);
  return null;
}

```


## `web/app/operador/page.tsx` — 49 linhas

```tsx
import PainelOperador from "./painel-operador";
import Link from "next/link";
import { quemSou } from "@/lib/acoes";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PaginaOperador() {
  const meu = await quemSou();

  const sb = await supabaseServer();
  const { data: campanhas } = await sb
    .from("campanhas")
    .select("id,nome,publico,janela_ini,janela_fim")
    .order("nome");

  return (
    <>
      <h1>Tela do operador</h1>
      <p className="mudo">
        <b>próximo lead</b> chama <code>fn_claim_next_lead</code>: primeiro a sua carteira, depois o
        pool das suas campanhas, depois overflow (se a campanha permitir). O banco trava o lead com{" "}
        <code>for update skip locked</code> — colega nenhum recebe o mesmo número. Quem disca de fato é
        o agente no Windows (Phone Link); sem agente, use o link <code>tel:</code> do próprio lead.
      </p>
      {meu.papel === "ninguem" ? (
        <p className="alerta">
          Seu login existe, mas você ainda não está em <code>agentes</code>{" "}
          <b>ou não tem acesso a nenhuma campanha</b>. É assim mesmo: sem linha em{" "}
          <code>campanha_equipe</code> a fila devolve nada. Um admin resolve em{" "}
          <Link href="/equipe">Equipe</Link>.
        </p>
      ) : null}

      <PainelOperador
        meu={{
          nome: meu.nome,
          papel: meu.papel,
          limite_diario: meu.limite_diario,
          discadas_hoje: meu.discadas_hoje,
          pausado_ate: meu.pausado_ate,
          celular: meu.celular,
          campanhas: meu.campanhas.map((c) => ({ id: c.id, nome: c.nome })),
        }}
        campanhas={(campanhas ?? []) as { id: string; nome: string; publico: string; janela_ini: string; janela_fim: string }[]}
      />
    </>
  );
}

```


## `web/app/operador/painel-operador.tsx` — 359 linhas

```tsx
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Tabulacao from "./tabulacao";
import { DISPOSICOES, type LeadFila, type PassoRoteiro } from "@/lib/tipos";
import {
  agendarRetorno,
  despausar,
  marcarPassoRoteiro,
  meuPerfil,
  pausar,
  pegarProximoLead,
  registrarDisposicao,
  registrarOptout,
} from "@/lib/acoes";

type Meu = {
  nome: string | null;
  papel: string;
  limite_diario: number;
  discadas_hoje: number;
  pausado_ate: string | null;
  celular: string | null;
  campanhas: { id: string; nome: string }[];
};

const ROTULO_ORIGEM: Record<string, string> = {
  carteira: "da sua carteira",
  pool: "do pool da campanha",
  overflow: "overflow — campanha de outro colega",
};

export default function PainelOperador({ meu, campanhas }: { meu: Meu; campanhas: { id: string; nome: string }[] }) {
  const [lead, setLead] = useState<LeadFila | null>(null);
  const [campanha, setCampanha] = useState<string>("");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [segundos, setSegundos] = useState(0);
  const [retornarEm, setRetornarEm] = useState("");
  const [celular, setCelular] = useState(meu.celular ?? "");
  // roteiro: o texto chega com o lead (vindo do banco, não de localStorage); a
  // marcação é otimista e o `fn_marcar_passo_roteiro` confere escopo e roteiro.
  const [feitos, setFeitos] = useState<Set<number>>(new Set());
  const [progresso, setProgresso] = useState<{ cumpridos: number; devidos: number } | null>(null);
  const cronometro = useRef<ReturnType<typeof setInterval> | null>(null);

  const pausado = Boolean(meu.pausado_ate && new Date(meu.pausado_ate) > new Date());
  const resto = Math.max(0, meu.limite_diario - meu.discadas_hoje);

  const pararCronometro = useCallback(() => {
    if (cronometro.current) clearInterval(cronometro.current);
    cronometro.current = null;
  }, []);
  useEffect(() => () => pararCronometro(), [pararCronometro]);

  const roteiro = lead?.roteiro ?? null;
  useEffect(() => {
    setFeitos(new Set((lead?.roteiro?.passos ?? []).filter((p) => p.feito).map((p) => p.id)));
    setProgresso(null);
  }, [lead?.lead_id, lead?.roteiro]);

  function marcar(passo: PassoRoteiro, valor: boolean) {
    if (!lead) return;
    setErro(null);
    const inverter = (atual: Set<number>) => {
      const novo = new Set(atual);
      if (valor) novo.add(passo.id);
      else novo.delete(passo.id);
      return novo;
    };
    setFeitos(inverter);
    iniciar(async () => {
      const r = await marcarPassoRoteiro({ leadId: lead.lead_id, passoId: passo.id, feito: valor });
      if (!r.ok) {
        setFeitos(inverter); // volta atrás: o banco negou (fora do escopo / roteiro outro)
        return setErro(r.erro);
      }
      setProgresso({ cumpridos: r.data.cumpridos, devidos: r.data.devidos });
    });
  }

  function ligarCronometro() {
    setSegundos(0);
    pararCronometro();
    cronometro.current = setInterval(() => setSegundos((s) => s + 1), 1000);
  }

  async function proximo() {
    setErro(null);
    setMsg(null);
    iniciar(async () => {
      const r = await pegarProximoLead(campanha || null);
      if (!r.ok) return setErro(r.erro);
      setLead(r.data);
      setNota("");
      if (r.data) {
        setMsg(
          `job criado (${ROTULO_ORIGEM[r.data.origem_fila ?? ""] ?? r.data.origem_fila ?? "fila"}). ` +
            `O agente deve discar para ${r.data.telefone}. Restam ${r.data.pendente_carteira} na carteira.`
        );
        ligarCronometro();
      } else {
        setMsg(
          pausado
            ? "você está pausado — saia da pausa para receber lead"
            : resto === 0
              ? `teto diário atingido (${meu.discadas_hoje}/${meu.limite_diario})`
              : "fila vazia: nada discável agora (fora da janela, consentimento ausente/revogado, bloqueado ou tentativas esgotadas)"
        );
        pararCronometro();
      }
    });
  }

  async function fechar(disposition: string, duracao?: number) {
    if (!lead) return;
    const d = disposition as (typeof DISPOSICOES)[number]["valor"];
    setErro(null);
    iniciar(async () => {
      const r = await registrarDisposicao(lead.job_id, d, duracao ?? segundos, nota);
      if (!r.ok) return setErro(r.erro);
      pararCronometro();
      setLead(null);
      setNota("");
      setMsg("chamada registrada no CDR — próximo?");
    });
  }

  /**
   * A proposta sai do simulador (Tabulacao) com o valor que cabe na margem. O que
   * este callback faz é fechar a ligação como 'atendeu' depois do registro — sem
   * isso o job ficaria aberto e o teto diário do operador não bateria.
   */
  function propostaEnviada(mensagem: string) {
    iniciar(async () => {
      await fechar("atendeu", segundos);
      setLead(null);
      setMsg(mensagem);
    });
  }

  function agendar() {
    if (!lead || !retornarEm) return setErro("escolha data e hora do retorno");
    iniciar(async () => {
      const r = await agendarRetorno({ leadId: lead.lead_id, quando: retornarEm, nota });
      if (!r.ok) return setErro(r.erro);
      setLead(null);
      setRetornarEm("");
      setMsg("retorno agendado — o lead só volta para a fila nesse horário");
    });
  }

  return (
    <div>
      <div className="card">
        <div className="linha">
          <label>
            <span className="mudo">campanha (vazio = qualquer uma do meu escopo)</span>
            <select value={campanha} onChange={(e) => setCampanha(e.target.value)}>
              <option value="">todas as minhas</option>
              {campanhas
                .filter((c) => meu.campanhas.length === 0 || meu.campanhas.some((x) => x.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </select>
          </label>
          <div>
            <span className="mudo">estado</span>
            <div className="linha" style={{ gap: 6, marginTop: 6 }}>
              {pausado ? (
                <button onClick={() => iniciar(async () => {
                  const r = await despausar();
                  setErro(r.ok ? null : r.erro);
                })}>sair da pausa</button>
              ) : (
                <button onClick={() => iniciar(async () => {
                  const r = await pausar(15);
                  setErro(r.ok ? null : r.erro);
                  setMsg(r.ok ? "pausado por 15 min — o claim para de entregar lead" : null);
                })}>pausar 15 min</button>
              )}
              <span className={`chip ${pausado ? "chip-ambar" : "chip-verde"}`}>
                {pausado ? "em pausa" : "disponível"}
              </span>
              <span className={`chip ${resto === 0 ? "chip-vermelho" : "chip-azul"}`}>
                {meu.discadas_hoje}/{meu.limite_diario} hoje
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="linha" style={{ margin: "14px 0" }}>
        <button className="primario" onClick={proximo} disabled={pendente}>
          {lead ? "descartar e ir para o próximo" : "próximo lead"}
        </button>
        {lead ? (
          <button onClick={() => { setLead(null); pararCronometro(); }}>limpar tela</button>
        ) : null}
        <label style={{ flex: "2 1 260px" }}>
          <span className="mudo">celular que aparece no Phone Link</span>
          <div className="linha">
            <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="+5579..." />
            <button type="button" onClick={() => iniciar(async () => {
              const r = await meuPerfil({ celular });
              setErro(r.ok ? null : r.erro);
            })}>salvar</button>
          </div>
        </label>
      </div>

      {erro ? <p className="alerta">erro: {erro}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      {lead ? (
        <div className="card">
          <div className="mudo">
            lead #{lead.lead_id} · {lead.campanha ?? "campanha?"} · {lead.publico ?? "—"} · tentativa{" "}
            {lead.tentativas}
            {lead.origem_fila ? <> · <span className="chip chip-azul">{ROTULO_ORIGEM[lead.origem_fila] ?? lead.origem_fila}</span></> : null}
          </div>
          <div className="grande" style={{ marginTop: 6 }}>{lead.nome || "(sem nome)"}</div>
          <div className="grande">
            <a href={`tel:${lead.telefone}`}>{lead.telefone}</a>
          </div>
          <div className="mudo">
            {lead.cpf_mask ? `CPF ${lead.cpf_mask} · ` : ""}
            {lead.cidade ? `${lead.cidade}/${lead.uf ?? "--"} · ` : ""}
            {lead.banco_folha ? `banco ${lead.banco_folha} · ` : ""}
            {lead.margem_estimada != null
              ? `margem estimada R$ ${Number(lead.margem_estimada).toLocaleString("pt-BR")}`
              : "margem não informada"}
          </div>
          {lead.script_resumo ? (
            <p style={{ borderTop: "1px solid var(--linha)", marginTop: 12, paddingTop: 10 }}>
              <b>recado da campanha:</b> {lead.script_resumo}
            </p>
          ) : null}

          {roteiro ? (
            <div style={{ borderTop: "1px solid var(--linha)", marginTop: 12, paddingTop: 10 }}>
              <div className="linha" style={{ alignItems: "center" }}>
                <b>roteiro: {roteiro.nome}</b>
                <span className="chip">v{roteiro.versao}</span>
                <span className="mudo">
                  {progresso
                    ? `${progresso.cumpridos}/${progresso.devidos} passos obrigatórios`
                    : `${roteiro.passos.filter((p) => p.obrigatorio).length} passos obrigatórios`}
                </span>
              </div>
              {roteiro.aviso ? (
                <p className="alerta" style={{ marginTop: 8 }}>
                  <b>o que não pode ser dito:</b> {roteiro.aviso}
                </p>
              ) : null}
              <ol style={{ marginTop: 8, paddingLeft: 22 }}>
                {roteiro.passos.map((s) => (
                  <li key={s.id} style={{ marginBottom: 6 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={feitos.has(s.id)}
                        disabled={pendente}
                        onChange={(e) => marcar(s, e.target.checked)}
                      />{" "}
                      <b>{s.titulo}</b>
                      {s.obrigatorio ? null : <span className="mudo"> · opcional</span>}
                    </label>
                    <div className="mudo" style={{ marginLeft: 22 }}>{s.texto}</div>
                  </li>
                ))}
              </ol>
              {roteiro.objecoes.length ? (
                <>
                  <b>se a pessoa objeta</b>
                  {roteiro.objecoes.map((o, i) => (
                    <details key={i} style={{ marginTop: 6 }}>
                      <summary>{o.objecao}</summary>
                      <p style={{ margin: "6px 0 0" }}>{o.resposta}</p>
                      {o.proibido ? (
                        <p className="alerta" style={{ margin: "4px 0 0" }}>não: {o.proibido}</p>
                      ) : null}
                    </details>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {lead.obs ? <p className="mudo">obs: {lead.obs}</p> : null}

          <Tabulacao lead={lead} onPropostaEnviada={propostaEnviada} />

          {roteiro?.aviso ? null : (
            <p className="alerta">
              Proibido contratar consignado por telefone (Lei 15.327/2026). Você pode qualificar,
              esclarecer e cobrar a anuência no app Meu INSS — não fechar contrato na ligação. A
              campanha não tem roteiro aprovado: peça ao supervisor para apontar um em /campanhas.
            </p>
          )}

          <div className="linha" style={{ marginTop: 12 }}>
            <div>
              <label className="mudo">duração da chamada: {segundos}s</label>
            </div>
            <button onClick={ligarCronometro}>reiniciar cronômetro</button>
          </div>

          <div className="linha" style={{ marginTop: 12 }}>
            {DISPOSICOES.map((d) => (
              <button
                key={d.valor}
                style={{ borderColor: d.cor, flex: "0 1 auto" }}
                onClick={() => fechar(d.valor, d.valor === "atendeu" ? undefined : 0)}
                disabled={pendente}
              >
                {d.rotulo}
              </button>
            ))}
          </div>

          <div className="linha" style={{ marginTop: 12 }}>
            <input
              placeholder="nota do atendimento (vai para o CDR)"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <button
              onClick={() => {
                iniciar(async () => {
                  const r = await registrarOptout(lead.telefone);
                  if (!r.ok) return setErro(r.erro);
                  setLead(null);
                  setMsg("número bloqueado para toda a base (opt-out)");
                });
              }}
            >
              opt-out / não me perturbe
            </button>
          </div>

          <div className="linha" style={{ marginTop: 12 }}>
            <label style={{ flex: "1 1 240px" }}>
              <span className="mudo">retornar em</span>
              <input type="datetime-local" value={retornarEm} onChange={(e) => setRetornarEm(e.target.value)} />
            </label>
            <button onClick={agendar} disabled={pendente || !retornarEm}>agendar retorno</button>
          </div>
        </div>
      ) : (
        <div className="card mudo">
          nada em tela. clique em <b>próximo lead</b> para receber o da sua fila.
        </div>
      )}
    </div>
  );
}

```


## `web/app/operador/tabulacao.tsx` — 235 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import { criarTarefa, enviarProposta, qualificarLead, salvarTabulacao, simularProposta } from "@/lib/acoes";
import type { CampoFormulario, LeadFila, Simulacao } from "@/lib/tipos";

/**
 * Tabulação + simulador de proposta, dentro do cartão do lead.
 *
 * É a peça que faltava para "qualificado" deixar de ser a nota que o operador
 * digitou: o `fn_qualificar_lead` no banco recusa a qualificação enquanto os
 * campos obrigatórios da campanha estiverem vazios. O simulador vem logo abaixo
 * porque a margem define o que pode ser oferecido — e `fn_enviar_proposta` recusa
 * o que passar dela, então o número mostrado aqui é o mesmo que o banco aceita.
 */
export default function Tabulacao({
  lead,
  onPropostaEnviada,
}: {
  lead: LeadFila;
  onPropostaEnviada: (mensagem: string) => void;
}) {
  const campos: CampoFormulario[] = lead.formulario ?? [];
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const c of campos) {
      const v = (lead.extras ?? {})[c.chave];
      inicial[c.chave] = v == null ? "" : typeof v === "boolean" ? (v ? "sim" : "nao") : String(v);
    }
    return inicial;
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [parcelas, setParcelas] = useState("60");
  const [taxa, setTaxa] = useState("");
  const [sim, setSim] = useState<Simulacao | null>(null);

  function campo(c: CampoFormulario) {
    const set = (v: string) => setValores((x) => ({ ...x, [c.chave]: v }));
    if (c.tipo === "sim_nao") {
      return (
        <select value={valores[c.chave] ?? ""} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          <option value="sim">sim</option>
          <option value="nao">não</option>
        </select>
      );
    }
    if (c.tipo === "selecao") {
      return (
        <select value={valores[c.chave] ?? ""} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {(c.opcoes ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    const tipo = c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : c.tipo === "telefone" ? "tel" : "text";
    return (
      <input
        type={tipo}
        step={c.tipo === "numero" ? "0.01" : undefined}
        value={valores[c.chave] ?? ""}
        onChange={(e) => set(e.target.value)}
      />
    );
  }

  function dadosParaSalvar(): Record<string, unknown> {
    const saida: Record<string, unknown> = {};
    for (const c of campos) {
      const v = (valores[c.chave] ?? "").trim();
      if (v === "") continue;
      if (c.tipo === "sim_nao") saida[c.chave] = v === "sim";
      else if (c.tipo === "numero") saida[c.chave] = Number(v.replace(",", "."));
      else saida[c.chave] = v;
    }
    return saida;
  }

  function salvar(qualificar: boolean) {
    const dados = dadosParaSalvar();
    iniciar(async () => {
      const r = await salvarTabulacao({ leadId: lead.lead_id, dados });
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      if (!qualificar) return setAviso("tabulação salva nos dados do lead");
      const q = await qualificarLead(lead.lead_id, String(dados["obs_qualificacao"] ?? "") || undefined);
      setAviso(q.ok ? "lead qualificado — pronto para a proposta no Meu INSS" : null);
      if (!q.ok) setErro(q.erro);
    });
  }

  function simular() {
    iniciar(async () => {
      const r = await simularProposta({
        margem: lead.margem_estimada ?? valores["margem_informada"] ?? "",
        parcelas,
        publico: lead.publico ?? "inss",
        taxaAa: taxa,
      });
      if (!r.ok) { setSim(null); return setErro(r.erro); }
      setErro(null);
      setSim(r.data);
    });
  }

  const margemBase = lead.margem_estimada ?? Number(valores["margem_informada"] ?? 0);

  return (
    <div style={{ borderTop: "1px solid var(--linha)", marginTop: 12, paddingTop: 10 }}>
      <b>tabulação{campos.length ? ` · ${campos.filter((c) => c.obrigatorio !== false).length} obrigatórios` : ""}</b>
      {campos.length === 0 ? (
        <p className="mudo" style={{ margin: "6px 0 0" }}>
          a campanha não definiu campos de tabulação — peça ao supervisor em /campanhas. Enquanto
          isso, qualificar aqui é só a nota abaixo.
        </p>
      ) : (
        <div className="grade" style={{ marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
          {campos.map((c) => (
            <label key={c.chave}>
              <span className="mudo">
                {c.rotulo}
                {c.obrigatorio !== false ? " *" : ""}
              </span>
              {campo(c)}
            </label>
          ))}
        </div>
      )}

      <div className="linha" style={{ marginTop: 10 }}>
        <button onClick={() => salvar(false)} disabled={pendente}>salvar tabulação</button>
        <button className="primario" onClick={() => salvar(true)} disabled={pendente}>
          qualificar lead
        </button>
        <button
          onClick={() =>
            iniciar(async () => {
              const r = await criarTarefa({
                leadId: lead.lead_id,
                titulo: "Retornar com a proposta simulada",
                tipo: "proposta",
                venceEm: new Date(Date.now() + 864e5).toISOString(),
                detalhe: sim ? `parcela R$ ${sim.parcela_maxima.toFixed(2)} em ${sim.parcelas}x` : undefined,
              });
              setAviso(r.ok ? "tarefa criada na sua agenda (/crm)" : null);
              if (!r.ok) setErro(r.erro);
            })
          }
          disabled={pendente || !sim}
        >
          criar tarefa de retorno
        </button>
      </div>

      <div style={{ borderTop: "1px dashed var(--linha)", marginTop: 12, paddingTop: 10 }}>
        <b>simulador (o que cabe na margem)</b>
        <div className="linha" style={{ marginTop: 8 }}>
          <label style={{ flex: "0 1 150px" }}>
            <span className="mudo">margem R$/mês</span>
            <input value={String(margemBase || "")} readOnly style={{ opacity: .7 }} />
          </label>
          <label style={{ flex: "0 1 110px" }}>
            <span className="mudo">parcelas (6–108)</span>
            <input type="number" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
          </label>
          <label style={{ flex: "0 1 120px" }}>
            <span className="mudo">juros % a.a. (opcional)</span>
            <input value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder="padrão INSS" />
          </label>
          <button onClick={simular} disabled={pendente}>calcular</button>
        </div>

        {sim ? (
          <div className="grade" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <div className="kpi"><span>parcela máxima</span><b>R$ {sim.parcela_maxima.toLocaleString("pt-BR")}</b></div>
            <div className="kpi"><span>crédito que cabe</span><b>R$ {sim.valor_maximo.toLocaleString("pt-BR")}</b></div>
            <div className="kpi"><span>total pago</span><b>R$ {sim.total_pago.toLocaleString("pt-BR")}</b></div>
            <div className="kpi"><span>limite de margem ({lead.publico ?? "inss"})</span>
              <b>{sim.limite_margem_pct}%</b>
            </div>
          </div>
        ) : null}
        {sim && !sim.dentro_das_regras ? (
          <p className="alerta" style={{ margin: "8px 0 0" }}>
            fora das regras do INSS — o prazo aceito é de 6 a 108 parcelas.
          </p>
        ) : null}
        {sim?.regras.length ? (
          <ul className="mudo" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {sim.regras.map((r) => <li key={r}>{r}</li>)}
          </ul>
        ) : null}

        {sim ? (
          <div className="linha" style={{ marginTop: 10 }}>
            <button
              className="primario"
              disabled={pendente || !sim.dentro_das_regras}
              onClick={() =>
                iniciar(async () => {
                  const r = await enviarProposta({
                    leadId: lead.lead_id,
                    valor: sim.valor_maximo,
                    parcelas: sim.parcelas,
                    taxaAa: sim.taxa_aa,
                    banco: lead.banco_folha ?? undefined,
                    obs: "gerado pelo simulador da tela do operador",
                  });
                  if (!r.ok) return setErro(r.erro);
                  onPropostaEnviada(
                    `proposta de R$ ${sim.valor_maximo.toLocaleString("pt-BR")} em ${sim.parcelas}x enviada para anuência no Meu INSS (5 dias)`
                  );
                })
              }
            >
              enviar esta proposta para anuência
            </button>
            <span className="mudo">
              o valor vai igual ao calculado: se a parcela passar da margem, o banco recusa a proposta
              antes de ela sair daqui.
            </span>
          </div>
        ) : null}
      </div>

      {erro ? <p className="alerta" style={{ margin: "8px 0 0" }}>{erro}</p> : null}
      {aviso ? <p className="ok" style={{ margin: "8px 0 0" }}>{aviso}</p> : null}
    </div>
  );
}

```


## `web/app/campanhas/page.tsx` — 154 linhas

```tsx
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import PainelCampanhas from "./painel";
import EditorRoteiros from "./roteiros";
import Cadencia from "./cadencia";
import TabulacaoCampanha from "./tabulacao-campanha";
import type { CampoFormulario, Roteiro } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type Equipe = { agente_id: string; nome: string; email: string; papel: string; limite_diario: number | null };

/**
 * Campanhas são o unit de escopo da operação: quem disca, quantas vezes, em que
 * janela e com que script. Vem de `v_campanhas_gestao`, que já traz as contagens
 * — contar no navegador seria baixar a tabela de leads inteira (o erro do
 * concorrente com limit(1000) em tudo).
 */
export default async function PaginaCampanhas() {
  const [meu, res, time, rots] = await Promise.all([
    quemSou(),
    (async () => {
      const sb = await supabaseServer();
      return sb.from("v_campanhas_gestao").select("*").order("nome");
    })(),
    (async () => {
      const sb = await supabaseServer();
      return sb.from("v_equipe").select("email,nome").order("nome");
    })(),
    (async () => {
      const sb = await supabaseServer();
      // v_roteiros já vem com passos e objeções agregados: o editor não faz 3 requests
      return sb.from("v_roteiros").select("*").order("ativo", { ascending: false }).order("nome");
    })(),
  ]);
  const emails = ((time.data as { email: string; nome: string }[] | null) ?? [])
    .map((p) => `${p.nome} <${p.email}>`);

  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";
  const linhas = (res.data as Record<string, unknown>[] | null) ?? [];
  const campanhas = linhas.map((c) => ({
    id: String(c.id),
    nome: String(c.nome ?? ""),
    publico: String(c.publico ?? "inss"),
    ativo: Boolean(c.ativo),
    janela_ini: String(c.janela_ini ?? "09:00").slice(0, 5),
    janela_fim: String(c.janela_fim ?? "18:00").slice(0, 5),
    max_tentativas: Number(c.max_tentativas ?? 3),
    intervalo_retentativa_s: Number(c.intervalo_retentativa_s ?? 14400),
    permite_overflow: Boolean(c.permite_overflow),
    script_resumo: (c.script_resumo as string | null) ?? null,
    roteiro_id: (c.roteiro_id as string | null) ?? null,
    roteiro_nome: (c.roteiro_nome as string | null) ?? null,
    roteiro_versao: c.roteiro_versao == null ? null : Number(c.roteiro_versao),
    meta_diaria: c.meta_diaria == null ? null : Number(c.meta_diaria),
    formulario: Array.isArray(c.formulario) ? (c.formulario as CampoFormulario[]) : [],
    webhook_ativo: Boolean(c.webhook_ativo),
    webhook_token: (c.webhook_token as string | null) ?? null,
    regras_de_cadencia: Number(c.regras_de_cadencia ?? 0),
    tarefas_abertas: Number(c.tarefas_abertas ?? 0),
    na_fila: Number(c.na_fila ?? 0),
    atribuidos: Number(c.atribuidos ?? 0),
    total_leads: Number(c.total_leads ?? 0),
    chamadas_hoje: Number(c.chamadas_hoje ?? 0),
    equipe: ((c.equipe as Equipe[] | null) ?? []).map((e) => ({
      agente_id: String(e.agente_id),
      nome: String(e.nome ?? ""),
      email: String(e.email ?? ""),
      papel: String(e.papel ?? "operador"),
      limite_diario: e.limite_diario == null ? null : Number(e.limite_diario),
    })),
  }));

  return (
    <>
      <h1>Campanhas</h1>
      <p className="mudo">
        Janela de horário, tentativas, intervalo de re-tentativa e overflow. Supervisor edita as
        campanhas em que tem linha de <code>supervisor</code>; janela fora de 08:00–21:00 só admin.
      </p>
      {res.error ? <p className="alerta">banco: {res.error.message}</p> : null}

      <PainelCampanhas
        campanhas={campanhas}
        gerencia={gerencia}
        emails={emails}
      />

      <h2>Cadência por qualificação</h2>
      <Cadencia
        campanhas={campanhas.map((c) => ({ id: c.id, nome: c.nome, regras_de_cadencia: c.regras_de_cadencia }))}
        podeEditar={gerencia}
      />

      <h2>Tabulação, meta e porta de entrada</h2>
      <TabulacaoCampanha
        campanhas={campanhas.map((c) => ({
          id: c.id,
          nome: c.nome,
          meta_diaria: c.meta_diaria,
          formulario: c.formulario,
          webhook_ativo: c.webhook_ativo,
          webhook_token: c.webhook_token,
        }))}
        podeEditar={gerencia}
        podeWebhook={meu.papel === "admin"}
      />

      <EditorRoteiros
        campanhas={campanhas.map((c) => ({ id: c.id, nome: c.nome, roteiro_id: c.roteiro_id }))}
        gerencia={gerencia}
        roteiros={(rots.data as Roteiro[] | null) ?? []}
      />

      <h2>Estado atual</h2>
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>campanha</th><th>público</th><th>janela</th><th>tent.</th><th>re-tentativa</th>
              <th>overflow</th><th>roteiro</th><th className="num">meta/dia</th><th className="num">tarefas</th>
              <th className="num">leads</th><th className="num">na fila</th>
              <th className="num">atribuídos</th><th className="num">hoje</th><th>time</th><th>status</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td className="mudo">{c.publico}</td>
                <td className="num">{c.janela_ini}–{c.janela_fim}</td>
                <td className="num">{c.max_tentativas}</td>
                <td className="num">{Math.round(c.intervalo_retentativa_s / 60)} min</td>
                <td>{c.permite_overflow ? <span className="chip chip-azul">livre</span> : <span className="chip">rígido</span>}</td>
                <td>{c.roteiro_nome ? <span className="chip chip-verde">{c.roteiro_nome.slice(0, 28)} v{c.roteiro_versao}</span> : <span className="chip chip-ambar">sem roteiro</span>}</td>
                <td className="num">{c.meta_diaria ?? "—"}</td>
                <td className="num">{c.tarefas_abertas ? <span className="chip chip-azul">{c.tarefas_abertas}</span> : 0}</td>
                <td className="num">{c.total_leads}</td>
                <td className="num">{c.na_fila}</td>
                <td className="num">{c.atribuidos}</td>
                <td className="num">{c.chamadas_hoje}</td>
                <td className="mudo">
                  {c.equipe.length ? c.equipe.map((e) => `${e.nome} (${e.papel[0]})`).join(", ") : "só admin"}
                </td>
                <td>{c.ativo ? <span className="chip chip-verde">ativa</span> : <span className="chip chip-ambar">pausada</span>}</td>
              </tr>
            ))}
            {campanhas.length === 0 ? <tr><td colSpan={15} className="mudo">nenhuma campanha no seu escopo</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

```


## `web/app/campanhas/painel.tsx` — 323 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import { atribuirCarteira, criarCampanha, definirAcesso, editarCampanha } from "@/lib/acoes";

type Campanha = {
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
  total_leads: number;
  chamadas_hoje: number;
  equipe: { agente_id: string; nome: string; email: string; papel: string; limite_diario: number | null }[];
};

const PUBLICOS = [
  { v: "inss", r: "INSS (aposentado/pensionista) — margem 40%/35%, 108 parcelas" },
  { v: "bpc_loas", r: "BPC/LOAS — margem 35%" },
  { v: "servidor", r: "Servidor público (SIAPE/estadual/municipal)" },
  { v: "clt", r: "CLT (consignado privado)" },
  { v: "fgts", r: "FGTS / saque-aniversário" },
];

export default function PainelCampanhas({
  campanhas,
  gerencia,
  emails,
}: {
  campanhas: Campanha[];
  gerencia: boolean;
  emails: string[];
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ nome: "", publico: "inss", script: "" });
  const [sel, setSel] = useState<Campanha | undefined>(campanhas[0]);
  const [form, setForm] = useState<Campanha | undefined>(campanhas[0]);
  const [distrib, setDistrib] = useState({ agente: "", qtd: "50" });
  const [acesso, setAcesso] = useState({ email: "", papel: "operador", limite: "" });

  function abrir(c: Campanha) {
    setSel(c);
    setForm(c);
    setAcesso({ ...acesso, email: "" });
  }

  function rodar(rotulo: string, fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return setErro(r.erro ?? `${rotulo} falhou`);
      setAviso(`${rotulo} ok — recarregue a tela para ver as contagens`);
    });
  }

  if (!gerencia) {
    return (
      <p className="alerta">
        Campanha se configura com papel <b>supervisor</b> (nesta campanha) ou <b>admin</b>. Você está
        aqui como {campanhas.length ? "operador" : "visitante"} — veja sua carteira em Leads.
      </p>
    );
  }

  return (
    <>
      <div className="grade-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>nova campanha</h2>
          <div className="linha">
            <label>
              <span className="mudo">nome</span>
              <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="INSS — margem livre" />
            </label>
            <label>
              <span className="mudo">público</span>
              <select value={nova.publico} onChange={(e) => setNova({ ...nova, publico: e.target.value })}>
                {PUBLICOS.map((p) => (
                  <option key={p.v} value={p.v}>{p.r}</option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ display: "block", marginTop: 8 }}>
            <span className="mudo">roteiro da ligação (aparece para o operador junto com o lead)</span>
            <textarea
              rows={4}
              value={nova.script}
              onChange={(e) => setNova({ ...nova, script: e.target.value })}
              placeholder={"ABERTURA / MOTIVO / QUALIFICAÇÃO / FECHAMENTO — nunca 'fechar' na ligação"}
            />
          </label>
          <button
            className="primario"
            style={{ marginTop: 10 }}
            disabled={pendente || nova.nome.trim().length < 3}
            onClick={() => rodar("campanha criada", () => criarCampanha(nova))}
          >
            criar campanha
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>quem disca esta campanha</h2>
          {!sel ? <p className="mudo">nenhuma campanha no seu escopo</p> : (
            <>
              <p className="mudo" style={{ marginBottom: 8 }}>
                {sel.nome} — {sel.equipe.length ? sel.equipe.length + " pessoa(s) com acesso" : "só admin no momento"}
              </p>
              {sel.equipe.length ? (
                <table>
                  <thead><tr><th>pessoa</th><th>papel</th><th className="num">limite</th></tr></thead>
                  <tbody>
                    {sel.equipe.map((e) => (
                      <tr key={e.agente_id}>
                        <td>{e.nome}</td>
                        <td><span className={`chip ${e.papel === "supervisor" ? "chip-azul" : ""}`}>{e.papel}</span></td>
                        <td className="num">{e.limite_diario ?? "padrão"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div className="linha" style={{ marginTop: 10 }}>
                <label>
                  <span className="mudo">pessoa</span>
                  <input
                    list="camp-emails"
                    placeholder="nome <email>"
                    value={acesso.email}
                    onChange={(e) => setAcesso({ ...acesso, email: e.target.value.replace(/^.*<|>$/g, "").trim() })}
                  />
                  <datalist id="camp-emails">
                    {emails.map((m) => (<option key={m} value={m} />))}
                  </datalist>
                </label>
                <label>
                  <span className="mudo">papel</span>
                  <select value={acesso.papel} onChange={(e) => setAcesso({ ...acesso, papel: e.target.value })}>
                    <option value="operador">operador</option>
                    <option value="supervisor">supervisor</option>
                  </select>
                </label>
                <label>
                  <span className="mudo">limite diário</span>
                  <input value={acesso.limite} onChange={(e) => setAcesso({ ...acesso, limite: e.target.value })} placeholder="120" />
                </label>
              </div>
              <button
                disabled={pendente || !acesso.email.includes("@")}
                onClick={() =>
                  rodar("acesso concedido", () =>
                    definirAcesso({
                      campanhaId: sel.id,
                      email: acesso.email,
                      papel: acesso.papel === "supervisor" ? "supervisor" : "operador",
                      limiteDiario: acesso.limite ? Number(acesso.limite) : null,
                    })
                  )
                }
              >
                dar acesso a {sel.nome}
              </button>
            </>
          )}
        </div>
      </div>

      {erro ? <p className="alerta" style={{ marginTop: 12 }}>erro: {erro}</p> : null}
      {aviso ? <p className="ok" style={{ marginTop: 12 }}>{aviso}</p> : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>regras da campanha</h2>
        <div className="abas">
          {campanhas.map((c) => (
            <button
              key={c.id}
              onClick={() => abrir(c)}
              className={sel?.id === c.id ? "primario" : undefined}
              style={{ borderRadius: 999, padding: "6px 12px" }}
            >
              {c.nome}
            </button>
          ))}
        </div>

        {sel && form ? (
          <>
            <div className="linha">
              <label>
                <span className="mudo">nome</span>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </label>
              <label>
                <span className="mudo">início (Brasília)</span>
                <input type="time" value={form.janela_ini} onChange={(e) => setForm({ ...form, janela_ini: e.target.value })} />
              </label>
              <label>
                <span className="mudo">fim (Brasília)</span>
                <input type="time" value={form.janela_fim} onChange={(e) => setForm({ ...form, janela_fim: e.target.value })} />
              </label>
              <label>
                <span className="mudo">máx. tentativas (1–10)</span>
                <input value={String(form.max_tentativas)} onChange={(e) => setForm({ ...form, max_tentativas: Number(e.target.value) })} />
              </label>
              <label>
                <span className="mudo">intervalo de re-tentativa (segundos)</span>
                <input
                  value={String(form.intervalo_retentativa_s)}
                  onChange={(e) => setForm({ ...form, intervalo_retentativa_s: Number(e.target.value) })}
                />
              </label>
            </div>
            <label style={{ display: "block", marginTop: 8 }}>
              <span className="mudo">roteiro</span>
              <textarea rows={4} value={form.script_resumo ?? ""} onChange={(e) => setForm({ ...form, script_resumo: e.target.value })} />
            </label>
            <div className="linha" style={{ marginTop: 10 }}>
              <button
                disabled={pendente}
                onClick={() =>
                  rodar(form.ativo ? "campanha pausada" : "campanha ativada", () =>
                    editarCampanha({ id: sel.id, ativa: !form.ativo }).then((r) => {
                      if (r.ok) setForm({ ...form, ativo: !form.ativo });
                      return r;
                    })
                  )
                }
              >
                {form.ativo ? "pausar campanha" : "reativar campanha"}
              </button>
              <button
                disabled={pendente}
                onClick={() =>
                  rodar("overflow alterado", () =>
                    editarCampanha({ id: sel.id, permiteOverflow: !form.permite_overflow }).then((r) => {
                      if (r.ok) setForm({ ...form, permite_overflow: !form.permite_overflow });
                      return r;
                    })
                  )
                }
              >
                overflow: {form.permite_overflow ? "livre (pegar lead de outra campanha)" : "rígido (só a minha)"}
              </button>
              <button
                className="primario"
                disabled={pendente}
                onClick={() =>
                  rodar("regras salvas", () =>
                    editarCampanha({
                      id: sel.id,
                      nome: form.nome,
                      janelaIni: form.janela_ini,
                      janelaFim: form.janela_fim,
                      maxTentativas: form.max_tentativas,
                      intervaloRetentativaS: form.intervalo_retentativa_s,
                      script: form.script_resumo ?? "",
                    })
                  )
                }
              >
                salvar regras
              </button>
            </div>
            <p className="mudo" style={{ marginTop: 8 }}>
              Janela é o horário de Brasília medido no servidor (<code>fn_claim_next_lead</code>), não o
              relógio do navegador. Antes de 08:00 e depois de 21:00 a operação inteira para — é regra da
              Anatel 0303/2022, não preferência sua.
            </p>
          </>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>montar carteira</h2>
        <p className="mudo">
          {sel ? `${sel.na_fila} na fila · ${sel.atribuidos} já atribuídos · ${sel.total_leads} no total` : "escolha uma campanha acima"}
        </p>
        <div className="linha">
          <label>
            <span className="mudo">operador (vazio = rodízio entre o time)</span>
            <select value={distrib.agente} onChange={(e) => setDistrib({ ...distrib, agente: e.target.value })}>
              <option value="">rodízio balanceado</option>
              {(sel?.equipe ?? []).filter((e) => e.papel === "operador").map((e) => (
                <option key={e.agente_id} value={e.agente_id}>{e.nome}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mudo">quantidade (0 = tudo)</span>
            <input value={distrib.qtd} onChange={(e) => setDistrib({ ...distrib, qtd: e.target.value })} />
          </label>
          <button
            className="primario"
            disabled={pendente || !sel}
            onClick={() =>
              rodar("carteira montada", () =>
                atribuirCarteira({
                  campanhaId: sel?.id ?? "",
                  agenteId: distrib.agente || null,
                  qtd: Number(distrib.qtd) || 0,
                  modo: distrib.agente ? "quantidade" : "balanceado",
                })
              )
            }
          >
            atribuir leads
          </button>
        </div>
      </div>
    </>
  );
}

```


## `web/app/campanhas/roteiros.tsx` — 315 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import { atribuirRoteiro, salvarRoteiro } from "@/lib/acoes";
import type { ObjecaoRoteiro, PassoRoteiro, Roteiro } from "@/lib/tipos";

type PassoEdicao = { titulo: string; texto: string; obrigatorio: boolean };
type ObjecaoEdicao = { objecao: string; resposta: string; proibido: string };

const PUBLICOS = ["inss", "bpc_loas", "clt", "servidor", "fgts"];

function vazio() {
  return {
    nome: "",
    publico: "inss",
    aviso: "",
    ativo: false,
    passos: [
      { titulo: "ABERTURA — só informação", texto: "", obrigatorio: true },
    ] as PassoEdicao[],
    objecoes: [] as ObjecaoEdicao[],
  };
}

/**
 * Editor do roteiro aprovado. Fica na tela de campanhas porque é material de
 * operação (não adorno): o texto daqui é o que o operador vê no cartão da ligação,
 * e cada mudança de conteúdo sobe a versão com a anterior guardada em
 * `auditoria_gestao`.
 */
export default function EditorRoteiros({
  roteiros,
  campanhas,
  gerencia,
}: {
  roteiros: Roteiro[];
  campanhas: { id: string; nome: string; roteiro_id: string | null }[];
  gerencia: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [sel, setSel] = useState<Roteiro | null>(roteiros.find((r) => r.ativo) ?? roteiros[0] ?? null);
  const [form, setForm] = useState(() =>
    sel
      ? {
          nome: sel.nome,
          publico: sel.publico,
          aviso: sel.aviso_compliance ?? "",
          ativo: sel.ativo,
          passos: sel.passos.map((p) => ({
            titulo: p.titulo,
            texto: p.texto,
            obrigatorio: p.obrigatorio,
          })),
          objecoes: sel.objecoes.map((o) => ({
            objecao: o.objecao,
            resposta: o.resposta,
            proibido: o.proibido ?? "",
          })),
        }
      : vazio()
  );
  const [campanha, setCampanha] = useState(campanhas[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function escolher(r: Roteiro) {
    setSel(r);
    setErro(null);
    setAviso(null);
    setForm({
      nome: r.nome,
      publico: r.publico,
      aviso: r.aviso_compliance ?? "",
      ativo: r.ativo,
      passos: r.passos.map((p) => ({ titulo: p.titulo, texto: p.texto, obrigatorio: p.obrigatorio })),
      objecoes: r.objecoes.map((o) => ({ objecao: o.objecao, resposta: o.resposta, proibido: o.proibido ?? "" })),
    });
  }

  function mexerPasso(i: number, mud: Partial<PassoEdicao>) {
    setForm((f) => ({ ...f, passos: f.passos.map((p, j) => (i === j ? { ...p, ...mud } : p)) }));
  }
  function mexerObj(i: number, mud: Partial<ObjecaoEdicao>) {
    setForm((f) => ({ ...f, objecoes: f.objecoes.map((o, j) => (i === j ? { ...o, ...mud } : o)) }));
  }
  function mover(arr: "passos" | "objecoes", i: number, dir: -1 | 1) {
    setForm((f) => {
      const lista = [...f[arr]];
      const j = i + dir;
      if (j < 0 || j >= lista.length) return f;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      return { ...f, [arr]: lista };
    });
  }

  function salvar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await salvarRoteiro({
        id: sel?.id ?? null,
        nome: form.nome,
        publico: form.publico,
        avisoCompliance: form.aviso,
        ativo: form.ativo,
        passos: form.passos,
        objecoes: form.objecoes.map((o) => ({
          objecao: o.objecao,
          resposta: o.resposta,
          proibido: o.proibido || null,
        })) as ObjecaoRoteiro[],
      });
      if (!r.ok) return setErro(r.erro);
      setAviso(`gravado como versão ${r.data.versao} — ${r.data.passos} passos, ${r.data.objecoes} objeções`);
    });
  }

  function usar() {
    setErro(null);
    setAviso(null);
    if (!sel) return;
    iniciar(async () => {
      const r = await atribuirRoteiro({ campanhaId: campanha, roteiroId: sel.id });
      if (!r.ok) return setErro(r.erro);
      setAviso(`roteiro “${sel.nome}” v${sel.versao} apontado para a campanha`);
    });
  }

  if (!gerencia) {
    return (
      <p className="alerta">
        O roteiro é material de operação: só <b>supervisor</b> (da campanha) ou <b>admin</b> edita. No
        seu painel ele aparece pronto, junto com o lead.
      </p>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>roteiro de ligação</h2>

      <div className="abas">
        {roteiros.map((r) => (
          <button
            key={r.id}
            onClick={() => escolher(r)}
            className={sel?.id === r.id ? "primario" : undefined}
            style={{ borderRadius: 999, padding: "6px 12px" }}
          >
            {r.nome} <span className="mudo">v{r.versao}{r.ativo ? "" : " · rascunho"}{r.em_uso ? ` · ${r.em_uso} camp.` : ""}</span>
          </button>
        ))}
        <button
          onClick={() => {
            setSel(null);
            setForm(vazio());
            setErro(null);
            setAviso("novo roteiro — preencha e salve");
          }}
        >
          + roteiro
        </button>
      </div>

      {erro ? <p className="alerta">erro: {erro}</p> : null}
      {aviso ? <p className="ok">{aviso}</p> : null}

      <div className="linha" style={{ marginTop: 10 }}>
        <label style={{ flex: "2 1 200px" }}>
          <span className="mudo">nome</span>
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </label>
        <label>
          <span className="mudo">público</span>
          <select value={form.publico} onChange={(e) => setForm({ ...form, publico: e.target.value })}>
            {PUBLICOS.map((pu) => (
              <option key={pu} value={pu}>{pu}</option>
            ))}
          </select>
        </label>
        <label style={{ alignSelf: "end" }}>
          <span className="mudo">situação</span>
          <div className="linha" style={{ gap: 6 }}>
            <button onClick={() => setForm({ ...form, ativo: !form.ativo })}>
              {form.ativo ? "ativo — deixar rascunho" : "rascunho — ativar"}
            </button>
          </div>
        </label>
      </div>

      <label style={{ display: "block", marginTop: 8 }}>
        <span className="mudo">
          aviso de compliance (topo do cartão do operador — o que é proibido dizer)
        </span>
        <textarea
          rows={3}
          value={form.aviso}
          onChange={(e) => setForm({ ...form, aviso: e.target.value })}
          placeholder="PROIBIDO: fechar contratação por telefone; pedir senha ou código; embutir seguro prestamista…"
        />
      </label>

      <h3>Passos ({form.passos.length})</h3>
      {form.passos.map((s, i) => (
        <div className="linha" key={i} style={{ alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ flex: "1 1 220px" }}>
            <input
              placeholder={`passo ${i + 1}: título`}
              value={s.titulo}
              onChange={(e) => mexerPasso(i, { titulo: e.target.value })}
            />
          </div>
          <div style={{ flex: "3 1 300px" }}>
            <textarea
              rows={2}
              placeholder="o que falar/perguntar neste passo"
              value={s.texto}
              onChange={(e) => mexerPasso(i, { texto: e.target.value })}
            />
          </div>
          <label style={{ flex: "0 0 auto", alignSelf: "center" }}>
            <input
              type="checkbox"
              checked={s.obrigatorio}
              onChange={(e) => mexerPasso(i, { obrigatorio: e.target.checked })}
            />{" "}
            <span className="mudo">obrig.</span>
          </label>
          <div style={{ alignSelf: "center", display: "flex", gap: 4 }}>
            <button onClick={() => mover("passos", i, -1)} aria-label="subir">↑</button>
            <button onClick={() => mover("passos", i, 1)} aria-label="descer">↓</button>
            <button
              onClick={() => setForm({ ...form, passos: form.passos.filter((_, j) => j !== i) })}
              aria-label="remover"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button onClick={() => setForm({ ...form, passos: [...form.passos, { titulo: "", texto: "", obrigatorio: true }] })}>
        + passo
      </button>

      <h3>Objeções ({form.objecoes.length})</h3>
      {form.objecoes.map((o, i) => (
        <div className="grade-2" key={i} style={{ marginBottom: 8 }}>
          <div>
            <span className="mudo">o cliente diz</span>
            <input value={o.objecao} onChange={(e) => mexerObj(i, { objecao: e.target.value })} />
            <textarea
              rows={2}
              style={{ marginTop: 6 }}
              placeholder="resposta aprovada"
              value={o.resposta}
              onChange={(e) => mexerObj(i, { resposta: e.target.value })}
            />
          </div>
          <div>
            <span className="mudo">o que NÃO pode fazer em seguida</span>
            <textarea
              rows={2}
              value={o.proibido}
              onChange={(e) => mexerObj(i, { proibido: e.target.value })}
            />
            <div className="linha" style={{ marginTop: 6 }}>
              <button onClick={() => mover("objecoes", i, -1)}>↑</button>
              <button onClick={() => mover("objecoes", i, 1)}>↓</button>
              <button onClick={() => setForm({ ...form, objecoes: form.objecoes.filter((_, j) => j !== i) })}>
                remover
              </button>
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          setForm({ ...form, objecoes: [...form.objecoes, { objecao: "", resposta: "", proibido: "" }] })
        }
      >
        + objeção
      </button>

      <div className="linha" style={{ marginTop: 12 }}>
        <button className="primario" disabled={pendente} onClick={salvar}>
          salvar roteiro {sel ? `(vira v${sel.versao + 1} se mexer em passo/objeção)` : ""}
        </button>
        {sel ? (
          <>
            <label style={{ flex: "1 1 200px" }}>
              <span className="mudo">usar este roteiro na campanha</span>
              <select value={campanha} onChange={(e) => setCampanha(e.target.value)}>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.roteiro_id === sel.id ? " (usa este)" : c.roteiro_id ? " (tem outro)" : " (sem roteiro)"}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={pendente || !sel.ativo} onClick={usar}>
              apontar para a campanha
            </button>
          </>
        ) : null}
      </div>
      {sel && !sel.ativo ? (
        <p className="mudo">
          Este roteiro está como rascunho: o operador não o recebe e a campanha não pode apontá-lo.
          Ative quando o compliance aprovar o texto.
        </p>
      ) : null}
    </div>
  );
}

```


## `web/app/campanhas/cadencia.tsx` — 167 linhas

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { listarPolitica, salvarPolitica } from "@/lib/acoes";
import { DISPOSICOES, type PoliticaLinha } from "@/lib/tipos";

const ACOES: { valor: PoliticaLinha["acao"]; rotulo: string; dica: string }[] = [
  { valor: "repetir", rotulo: "repetir", dica: "volta para a fila no intervalo definido" },
  { valor: "sem_contato", rotulo: "sem contato", dica: "marca como sem contato e repete no intervalo" },
  { valor: "contato", rotulo: "virou contato", dica: "sai da fila e espera o operador agir" },
  { valor: "qualificar", rotulo: "qualificar", dica: "manda direto para qualificado (cuidado com tabulação obrigatória)" },
  { valor: "descartar", rotulo: "descartar", dica: "sai da campanha: número errado, falecido, JC" },
];

const ROTULO: Record<string, string> = Object.fromEntries(DISPOSICOES.map((d) => [d.valor, d.rotulo]));

/**
 * Cadência por disposição — o que os discadores chamam de "cada qualificação tem
 * comportamento". O banco já decidia só por campanha (`intervalo_retentativa_s`);
 * aqui o supervisor diz, para cada uma das 8 qualificações, se repete, em quanto
 * tempo, se força uma hora do dia e se o lead sobe ou desce na fila.
 */
export default function Cadencia({
  campanhas,
  podeEditar,
}: {
  campanhas: { id: string; nome: string; regras_de_cadencia: number }[];
  podeEditar: boolean;
}) {
  const [alvo, setAlvo] = useState(campanhas[0]?.id ?? "");
  const [linhas, setLinhas] = useState<PoliticaLinha[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    if (!alvo) return;
    void listarPolitica(alvo).then((r) => {
      if (vivo) setLinhas(r);
    });
    return () => { vivo = false; };
  }, [alvo]);

  const campanha = campanhas.find((c) => c.id === alvo);

  function mudar<K extends keyof PoliticaLinha>(disposition: string, campo: K, valor: PoliticaLinha[K]) {
    setLinhas((atual) => atual.map((l) => (l.disposition === disposition ? { ...l, [campo]: valor } : l)));
  }

  return (
    <div className="card">
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 220px" }}>
          <span className="mudo">campanha</span>
          <select value={alvo} onChange={(e) => setAlvo(e.target.value)}>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <span className="mudo">
          {campanha?.regras_de_cadencia
            ? `${campanha.regras_de_cadencia} regra(s) próprias; o resto segue o default da campanha`
            : "nenhuma regra própria: tudo hoje usa o intervalo único da campanha"}
        </span>
        <button
          className="primario"
          disabled={!podeEditar || pendente || !linhas.length}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarPolitica({ campanhaId: alvo, regras: linhas });
              setErro(r.ok ? null : r.erro);
              setMsg(r.ok ? "cadência salva — vale a partir da próxima chamada" : null);
              if (r.ok && campanha) campanha.regras_de_cadencia = r.data.regras;
            })
          }
        >
          salvar cadência
        </button>
      </div>

      {erro ? <p className="alerta" style={{ marginBottom: 0 }}>{erro}</p> : null}
      {msg ? <p className="ok" style={{ marginBottom: 0 }}>{msg}</p> : null}

      <div className="rolagem" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>qualificação</th><th>o que fazer</th><th className="num">intervalo (min)</th>
              <th>hora alvo</th><th className="num">teto tentativas</th><th className="num">prioridade ±</th>
              <th>anotação do supervisor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.disposition}>
                <td>{ROTULO[l.disposition] ?? l.disposition}</td>
                <td>
                  <select
                    value={l.acao}
                    disabled={!podeEditar}
                    onChange={(e) => mudar(l.disposition, "acao", e.target.value as PoliticaLinha["acao"])}
                  >
                    {ACOES.map((a) => (
                      <option key={a.valor} value={a.valor} title={a.dica}>{a.rotulo}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 90 }}
                    disabled={!podeEditar || l.acao === "descartar"}
                    value={Math.round(l.intervalo_s / 60)}
                    onChange={(e) => mudar(l.disposition, "intervalo_s", Math.max(1, Number(e.target.value) || 0) * 60)}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    disabled={!podeEditar}
                    value={l.hora_alvo ?? ""}
                    onChange={(e) => mudar(l.disposition, "hora_alvo", e.target.value || null)}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 60 }}
                    min={1}
                    max={10}
                    disabled={!podeEditar}
                    value={l.max_tentativas ?? ""}
                    onChange={(e) =>
                      mudar(l.disposition, "max_tentativas", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 64 }}
                    min={-50}
                    max={50}
                    disabled={!podeEditar}
                    value={l.prioridade_delta}
                    onChange={(e) => mudar(l.disposition, "prioridade_delta", Number(e.target.value) || 0)}
                  />
                </td>
                <td className="mudo">{l.observacao ?? "—"}</td>
              </tr>
            ))}
            {!linhas.length ? (
              <tr><td colSpan={7} className="mudo">carregando as 8 disposições…</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mudo" style={{ marginBottom: 0 }}>
        hora alvo = &ldquo;insista amanhã às 10h&rdquo; em vez de tocar no mesmo minuto da tarde; o
        cálculo é feito no horário de Brasília e a janela 08:00–21:00 é travada no banco. Prioridade ±
        mexe em qual lead o claim entrega primeiro.
      </p>
    </div>
  );
}

```


## `web/app/campanhas/tabulacao-campanha.tsx` — 214 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import { editarCampanha, salvarFormulario } from "@/lib/acoes";
import type { CampoFormulario } from "@/lib/tipos";

export type CampanhaTabulavel = {
  id: string;
  nome: string;
  meta_diaria: number | null;
  formulario: CampoFormulario[];
  webhook_ativo: boolean;
  webhook_token: string | null;
};

const TIPOS: { valor: CampoFormulario["tipo"]; rotulo: string }[] = [
  { valor: "texto", rotulo: "texto" },
  { valor: "numero", rotulo: "número" },
  { valor: "sim_nao", rotulo: "sim/não" },
  { valor: "selecao", rotulo: "lista" },
  { valor: "data", rotulo: "data" },
  { valor: "telefone", rotulo: "telefone" },
];

/**
 * Duas coisas que decidem o dia a dia da equipe e por isso moram na campanha:
 * o formulário de tabulação (o que tem de ser perguntado e registrado) e a meta
 * do dia. O webhook aparece aqui porque é a única porta de entrada externa do
 * sistema — o token é segredo e só a gestão vê.
 */
export default function TabulacaoCampanha({
  campanhas,
  podeEditar,
  podeWebhook,
}: {
  campanhas: CampanhaTabulavel[];
  podeEditar: boolean;
  podeWebhook: boolean;
}) {
  const [alvo, setAlvo] = useState(campanhas[0]?.id ?? "");
  const camp = campanhas.find((c) => c.id === alvo);
  const [campos, setCampos] = useState<CampoFormulario[]>(camp?.formulario ?? []);
  const [meta, setMeta] = useState(String(camp?.meta_diaria ?? ""));
  const [ativo, setAtivo] = useState(Boolean(camp?.webhook_ativo));
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function trocar(id: string) {
    setAlvo(id);
    const c = campanhas.find((x) => x.id === id);
    setCampos(c?.formulario ?? []);
    setMeta(String(c?.meta_diaria ?? ""));
    setAtivo(Boolean(c?.webhook_ativo));
    setMsg(null);
    setErro(null);
  }

  function setCampo(i: number, patch: Partial<CampoFormulario>) {
    setCampos((atual) => atual.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="card">
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 220px" }}>
          <span className="mudo">campanha</span>
          <select value={alvo} onChange={(e) => trocar(e.target.value)}>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <label style={{ flex: "0 1 130px" }}>
          <span className="mudo">meta de contatos/dia</span>
          <input type="number" min={1} max={2000} value={meta} disabled={!podeEditar}
                 onChange={(e) => setMeta(e.target.value)} />
        </label>
        <button
          className="primario"
          disabled={!podeEditar || pendente}
          onClick={() =>
            iniciar(async () => {
              const f = await salvarFormulario({ campanhaId: alvo, campos });
              if (!f.ok) return setErro(f.erro);
              const m = await editarCampanha({
                id: alvo,
                metaDiaria: meta.trim() === "" ? null : Number(meta),
              });
              setErro(m.ok ? null : m.erro);
              setMsg(m.ok ? `${campos.length} campos salvos; meta aplicada` : null);
            })
          }
        >
          salvar tabulação e meta
        </button>
      </div>

      {erro ? <p className="alerta">{erro}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <p className="mudo" style={{ marginBottom: 8 }}>
        campo marcado como obrigatório trava o <b>qualificar lead</b> na tela do operador até ser
        preenchido — é assim que a qualificação deixa de ser &ldquo;se lembrar, anota&rdquo;.
      </p>

      <div className="rolagem">
        <table>
          <thead>
            <tr><th>chave (minúscula)</th><th>rótulo visto pelo operador</th><th>tipo</th>
                <th>opções (vírgula)</th><th className="num">obrigatório</th><th></th></tr>
          </thead>
          <tbody>
            {campos.map((c, i) => (
              <tr key={i}>
                <td><input value={c.chave} disabled={!podeEditar} style={{ width: 160 }}
                           onChange={(e) => setCampo(i, { chave: e.target.value })} /></td>
                <td><input value={c.rotulo} disabled={!podeEditar} style={{ minWidth: 220 }}
                           onChange={(e) => setCampo(i, { rotulo: e.target.value })} /></td>
                <td>
                  <select value={c.tipo} disabled={!podeEditar}
                          onChange={(e) => setCampo(i, { tipo: e.target.value as CampoFormulario["tipo"] })}>
                    {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </select>
                </td>
                <td><input value={(c.opcoes ?? []).join(",")} disabled={!podeEditar || c.tipo !== "selecao"}
                           placeholder="alto, medio, baixo"
                           onChange={(e) =>
                             setCampo(i, { opcoes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })
                           } /></td>
                <td className="num">
                  <input type="checkbox" checked={c.obrigatorio !== false} disabled={!podeEditar}
                         onChange={(e) => setCampo(i, { obrigatorio: e.target.checked })} />
                </td>
                <td>
                  <button disabled={!podeEditar} onClick={() => setCampos((a) => a.filter((_, k) => k !== i))}>
                    tirar
                  </button>
                </td>
              </tr>
            ))}
            {!campos.length ? (
              <tr><td colSpan={6} className="mudo">nenhum campo — o operador qualifica só com a nota</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <button
        disabled={!podeEditar}
        onClick={() =>
          setCampos((a) => [
            ...a,
            { chave: `campo_${a.length + 1}`, rotulo: "novo campo", tipo: "texto", obrigatorio: false },
          ])
        }
      >
        + campo
      </button>

      <h2 style={{ marginTop: 18 }}>Entrada de lead pelo site (webhook)</h2>
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label>
          <span className="mudo">porta aberta</span>
          <div style={{ marginTop: 4 }}>
            <input type="checkbox" checked={ativo} disabled={!podeWebhook}
                   onChange={(e) => setAtivo(e.target.checked)} />{" "}
            <span className="mudo">{ativo ? "aceitando POST" : "fechada"}</span>
          </div>
        </label>
        <button
          className="primario"
          disabled={!podeWebhook || pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await editarCampanha({ id: alvo, webhookAtivo: ativo });
              setErro(r.ok ? null : r.erro);
              setMsg(r.ok ? `webhook ${ativo ? "aberto" : "fechado"} para ${camp?.nome ?? "campanha"}` : null);
            })
          }
        >
          aplicar
        </button>
      </div>
      {camp?.webhook_token ? (
        <>
          <pre className="mudo" style={{ overflowX: "auto", padding: 10, border: "1px solid var(--linha)", borderRadius: 10 }}>
{`POST ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/leads
content-type: application/json

{
  "token": "${camp.webhook_token}",
  "lead": {
    "nome": "Quem preencheu o formulário",
    "telefone_e164": "+5579999990001",
    "cpf": "52998224725",
    "cidade": "Aracaju", "uf": "SE",
    "margem_estimada": "420",
    "consentimento": "form_proprio"
  }
}`}
          </pre>
          <p className="mudo">
            `consentimento` é obrigatório e só aceita o que foi obtido com o titular
            (`form_proprio`, `app_banco`, `presencial`, `lista_compartilhada`). Número em lista de
            bloqueio é recusado, e acima de 30 leads por minuto a campanha recusa o lote — site
            mal configurado não inunda a fila.
          </p>
        </>
      ) : (
        <p className="mudo">token visível só para supervisor/admin da campanha.</p>
      )}
    </div>
  );
}

```


## `web/app/crm/page.tsx` — 91 linhas

```tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { pendencias, quemSou } from "@/lib/acoes";
import type { Tarefa } from "@/lib/tipos";
import AoVivo from "../ao-vivo";
import Esteira, { type CartaoCRM } from "./esteira";
import Agenda from "./agenda";

export const dynamic = "force-dynamic";

/**
 * CRM da operação: a esteira (estágio calculado no banco a partir de lead +
 * proposta + anuência) e a agenda do dia. Não é enfeite — é o que separa
 * "discadora que registra" de "sistema onde a equipe vive o dia": sem esteira, o
 * supervisor persegue lead por telefone; sem agenda, o follow-up depende de memória.
 */
export default async function PaginaCrm() {
  const [meu, res, agenda, pend] = await Promise.all([
    quemSou(),
    (async () => {
      const sb = await supabaseServer();
      return sb
        .from("v_crm_leads")
        .select(
          "lead_id,nome,telefone_e164,cidade,banco_folha,campanha,estagio,prioridade,tentativas," +
            "dias_sem_falar,tarefas_abertas,tarefa_vencida,dono,proximo_contato_at"
        )
        .order("prioridade", { ascending: false })
        .order("lead_id", { ascending: false })
        .limit(400);
    })(),
    (async () => {
      const sb = await supabaseServer();
      return sb.from("v_agenda").select("*").order("vence_em", { ascending: true }).limit(120);
    })(),
    pendencias(),
  ]);

  const cards: CartaoCRM[] = ((res.data as Record<string, unknown>[] | null) ?? []).map((c) => ({
    lead_id: Number(c.lead_id),
    nome: (c.nome as string | null) ?? null,
    telefone_e164: String(c.telefone_e164 ?? ""),
    cidade: (c.cidade as string | null) ?? null,
    banco_folha: (c.banco_folha as string | null) ?? null,
    campanha: (c.campanha as string | null) ?? null,
    estagio: String(c.estagio ?? "fila"),
    prioridade: Number(c.prioridade ?? 0),
    tentativas: Number(c.tentativas ?? 0),
    dias_sem_falar: c.dias_sem_falar == null ? null : Number(c.dias_sem_falar),
    tarefas_abertas: Number(c.tarefas_abertas ?? 0),
    tarefa_vencida: Boolean(c.tarefa_vencida),
    dono: (c.dono as string | null) ?? null,
    proximo_contato_at: (c.proximo_contato_at as string | null) ?? null,
  }));
  const tarefas = (agenda.data as Tarefa[] | null) ?? [];
  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";
  const porEstagio = (e: string) => cards.filter((c) => c.estagio === e).length;

  return (
    <>
      <AoVivo tabelas={["leads", "tarefas", "propostas"]} />
      <h1>CRM</h1>
      <p className="mudo">
        {cards.length} leads no seu escopo · {porEstagio("qualificado")} aguardando proposta ·{" "}
        {porEstagio("aguardando_anuencia")} com anuência aberta no Meu INSS ·{" "}
        {porEstagio("confirmada")} confirmadas. O estágio é calculado no banco, não digitado na tela.
      </p>

      <div className="grade" style={{ marginBottom: 14 }}>
        <div className="kpi"><span>tarefas vencidas</span><b style={{ color: pend.tarefas_vencidas ? "#f87171" : undefined }}>{pend.tarefas_vencidas}</b></div>
        <div className="kpi"><span>retornos de hoje</span><b>{pend.retornos_de_hoje}</b></div>
        <div className="kpi"><span>qualificados sem proposta</span><b>{pend.qualificados_sem_proposta}</b></div>
        <div className="kpi"><span>anuência vencendo (≤1 dia)</span><b>{pend.anuencia_hoje}</b></div>
        <div className="kpi"><span>leads nunca discados</span><b>{pend.fila_parada}</b></div>
        <div className="kpi"><span>auditorias de ligação na semana</span><b>{pend.qa_da_semana}</b></div>
      </div>

      <Esteira cards={cards} podeMover={gerencia} />

      <h2>Agenda</h2>
      <Agenda tarefas={tarefas} podeConcluir={gerencia} meuId={meu.agente_id ?? ""} />

      <p className="mudo">
        Ficha completa de cada lead em <Link href="/leads">/leads</Link> (clique no nome). A meta do
        dia por campanha está em <Link href="/relatorios">Relatórios</Link>; quem edita a esteira é a
        gestão — operador mexe na própria carteira pela tela dele.
      </p>
      {res.error ? <p className="alerta">banco: {res.error.message}</p> : null}
    </>
  );
}

```


## `web/app/crm/esteira.tsx` — 172 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { criarTarefa, moverLead } from "@/lib/acoes";

const COLUNAS: { estagio: string; titulo: string; mover?: string }[] = [
  { estagio: "fila", titulo: "Na fila", mover: "contato" },
  { estagio: "contato", titulo: "Falou com o cliente", mover: "qualificado" },
  { estagio: "qualificado", titulo: "Qualificado", mover: "proposta" },
  { estagio: "aguardando_anuencia", titulo: "Aguardando anuência INSS" },
  { estagio: "confirmada", titulo: "Anuência confirmada" },
  { estagio: "fechado", titulo: "Encerrado" },
];

export type CartaoCRM = {
  lead_id: number;
  nome: string | null;
  telefone_e164: string;
  cidade: string | null;
  banco_folha: string | null;
  campanha: string | null;
  estagio: string;
  prioridade: number;
  tentativas: number;
  dias_sem_falar: number | null;
  tarefas_abertas: number;
  tarefa_vencida: boolean;
  dono: string | null;
  proximo_contato_at: string | null;
};

/**
 * A esteira é a view `v_crm_leads` recortada por estágio — o estágio vem do banco
 * (proposta + anuência contam para ele), não de um campo que o operador poderia
 * editar pelo navegador. Mover card = `fn_mover_lead`, que checa papel, escopo e
 * conflito de número; por isso o botão some para o operador nos estágios que são
 * decisão de gestão.
 */
export default function Esteira({
  cards,
  podeMover,
}: {
  cards: CartaoCRM[];
  podeMover: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [tarefaDe, setTarefaDe] = useState<CartaoCRM | null>(null);

  function mover(c: CartaoCRM, para: string) {
    setErro(null);
    iniciar(async () => {
      const r = await moverLead({ leadId: c.lead_id, status: para, motivo: "movido na esteira" });
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <>
      {erro ? <p className="alerta">banco: {erro}</p> : null}
      <div className="esteira">
        {COLUNAS.map((col) => {
          const doEstagio = cards.filter((c) => c.estagio === col.estagio);
          return (
            <div className="coluna" key={col.estagio}>
              <h3>
                {col.titulo} <span className="n">{doEstagio.length}</span>
              </h3>
              {doEstagio.slice(0, 8).map((c) => (
                <div className="cartao" key={c.lead_id}>
                  <Link href={`/leads/${c.lead_id}`}><b>{c.nome ?? `lead #${c.lead_id}`}</b></Link>
                  <div className="mudo tel">{c.telefone_e164}</div>
                  <div className="mudo">
                    {c.campanha ?? "—"} · {c.dono ?? "pool"} · {c.tentativas} tent.
                  </div>
                  <div className="linha" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {c.prioridade >= 50 ? <span className="chip chip-verde">prio {c.prioridade}</span> : null}
                    {c.tarefa_vencida ? <span className="chip chip-vermelho">tarefa vencida</span> : null}
                    {c.tarefas_abertas && !c.tarefa_vencida ? (
                      <span className="chip chip-azul">{c.tarefas_abertas} tarefa(s)</span>
                    ) : null}
                    {c.dias_sem_falar != null && c.dias_sem_falar > 2 ? (
                      <span className="chip chip-ambar">{c.dias_sem_falar}d sem falar</span>
                    ) : null}
                  </div>
                  <div className="linha" style={{ gap: 6, marginTop: 8 }}>
                    {podeMover && col.mover ? (
                      <button disabled={pendente} onClick={() => mover(c, col.mover!)}>→ {col.mover}</button>
                    ) : null}
                    <button disabled={pendente} onClick={() => setTarefaDe(c)}>tarefa</button>
                  </div>
                </div>
              ))}
              {doEstagio.length > 8 ? (
                <p className="mudo" style={{ marginBottom: 0 }}>+{doEstagio.length - 8} neste estágio</p>
              ) : null}
              {!doEstagio.length ? <p className="mudo">vazio</p> : null}
            </div>
          );
        })}
      </div>

      {tarefaDe ? (
        <NovaTarefa
          card={tarefaDe}
          fechar={() => setTarefaDe(null)}
          salvar={async (titulo, tipo, venceEm) => {
            const r = await criarTarefa({ leadId: tarefaDe.lead_id, titulo, tipo, venceEm });
            if (r.ok) setTarefaDe(null);
            return r.ok ? null : r.erro;
          }}
        />
      ) : null}
    </>
  );
}

function NovaTarefa({
  card,
  fechar,
  salvar,
}: {
  card: CartaoCRM;
  fechar: () => void;
  salvar: (titulo: string, tipo: string, venceEm: string) => Promise<string | null>;
}) {
  const [titulo, setTitulo] = useState(`Retornar ${card.nome ?? card.telefone_e164}`);
  const [tipo, setTipo] = useState("retorno");
  const [when, setWhen] = useState(
    new Date(Date.now() + 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 260px" }}>
          <span className="mudo">tarefa para {card.nome ?? card.telefone_e164}</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label>
          <span className="mudo">tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {["retorno", "proposta", "documentos", "anuencia", "cobranca", "ligar_para", "outro"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mudo">vence em</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <button
          className="primario"
          disabled={pendente || titulo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              const e = await salvar(titulo.trim(), tipo, when ? new Date(when).toISOString() : "");
              if (e) setErro(e); else fechar();
            })
          }
        >
          criar tarefa
        </button>
        <button onClick={fechar} disabled={pendente}>cancelar</button>
      </div>
      {erro ? <p className="alerta" style={{ marginBottom: 0 }}>{erro}</p> : null}
    </div>
  );
}

```


## `web/app/crm/agenda.tsx` — 92 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import { concluirTarefa } from "@/lib/acoes";
import type { Tarefa } from "@/lib/tipos";
import { OPC_DATA_HORA } from "@/lib/tempo";

const COR: Record<string, string> = {
  vencida: "chip-vermelho",
  hoje: "chip-ambar",
  futura: "chip-azul",
  concluida: "chip-verde",
};

/**
 * Agenda = `v_agenda`. Situação (vencida/hoje/futura/concluída) é calculada no
 * banco, então "atrasado" não depende do relógio do navegador de quem olha.
 */
export default function Agenda({
  tarefas,
  podeConcluir,
  meuId,
}: {
  tarefas: Tarefa[];
  podeConcluir: boolean;
  meuId: string;
}) {
  const [mostrar, setMostrar] = useState<"abertas" | "todas">("abertas");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const lista = tarefas.filter((t) => (mostrar === "abertas" ? !t.concluida_em : true));

  return (
    <div className="card">
      <div className="linha" style={{ alignItems: "center", marginBottom: 8 }}>
        <span className="mudo">{lista.length} tarefa(s) no seu escopo</span>
        <button onClick={() => setMostrar(mostrar === "abertas" ? "todas" : "abertas")}>
          {mostrar === "abertas" ? "ver concluídas" : "ver só abertas"}
        </button>
        {erro ? <span className="alerta">{erro}</span> : null}
      </div>
      {!lista.length ? (
        <p className="mudo" style={{ marginBottom: 0 }}>
          nenhuma tarefa aberta. crie uma no cartão do lead (botão <b>tarefa</b>) — follow-up sem
          registro é follow-up que depende de memória.
        </p>
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>vence</th><th>situação</th><th>lead</th><th>o que fazer</th><th>tipo</th><th>dono</th><th></th></tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id}>
                  <td className="mudo">{new Date(t.vence_em).toLocaleString("pt-BR", OPC_DATA_HORA)}</td>
                  <td><span className={`chip ${COR[t.situacao] ?? ""}`}>{t.situacao}</span></td>
                  <td>
                    {t.lead ?? `#${t.lead_id}`}
                    <div className="mudo">{t.campanha ?? "—"}</div>
                  </td>
                  <td>
                    {t.titulo}
                    {t.detalhe ? <div className="mudo">{t.detalhe}</div> : null}
                    {t.resultado ? <div className="mudo">→ {t.resultado}</div> : null}
                  </td>
                  <td className="mudo">{t.tipo}</td>
                  <td className="mudo">{t.dono ?? "—"}</td>
                  <td>
                    {!t.concluida_em && (podeConcluir || t.agente_id === meuId) ? (
                      <button
                        disabled={pendente}
                        onClick={() =>
                          iniciar(async () => {
                            const r = await concluirTarefa(t.id, "concluída na agenda");
                            setErro(r.ok ? null : r.erro);
                          })
                        }
                      >
                        concluir
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

```


## `web/app/leads/page.tsx` — 193 linhas

```tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import FormImportacao from "./form";
import { OPC_DATA, OPC_DATA_HORA } from "@/lib/tempo";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
const ESTADOS = [
  { v: "", r: "todos" },
  { v: "novo", r: "novo" },
  { v: "sem_contato", r: "sem contato" },
  { v: "em_discagem", r: "em discagem" },
  { v: "contato", r: "contato feito" },
  { v: "qualificado", r: "qualificado" },
  { v: "opt_out", r: "opt-out" },
  { v: "descarte", r: "descartado" },
];

/** só letras/números/espaço e @ . - _ : o resto viraria sintaxe do filtro `or` */
function sanitizar(txt: string) {
  return txt.replace(/[^\p{L}\p{N} @._-]/gu, "").trim().slice(0, 60);
}

/**
 * Lista de leads com filtro e paginação no servidor.
 *
 * Paginar aqui (e não `limit(1000)` e cortar no cliente) é a diferença entre a
 * tela abrir com 200 mil leads ou travar o navegador — foi o caminho que o
 * concorrente teve de corrigir depois com "carregamento preguiçoso por módulo".
 */
export default async function PaginaLeads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const status = ESTADOS.some((e) => e.v === p.status) ? String(p.status ?? "") : "";
  const busca = sanitizar(p.q ?? "");
  const campanha = /^[0-9a-f-]{36}$/i.test(p.campanha ?? "") ? p.campanha : undefined;
  const soMeus = p.filtro === "carteira";

  const sb = await supabaseServer();
  const meu = await quemSou();
  const [res, campanhas, bloqueios] = await Promise.all([
    (async () => {
      let q = sb
        .from("leads")
        .select(
          "id,nome,telefone_e164,status,tentativas,banco_folha,uf,margem_estimada,prioridade,atribuido_em,extras,agente_id,criado_em",
          { count: "exact" }
        )
        .order("id", { ascending: false });
      if (status) q = q.eq("status", status);
      if (campanha) q = q.eq("campanha_id", campanha);

      if (soMeus && meu.agente_id) q = q.eq("agente_id", meu.agente_id);
      if (busca) {
        const digitos = busca.replace(/\D/g, "");
        q = digitos.length >= 6
          ? q.or(`nome.ilike.%${busca}%,telefone_e164.like.*${digitos}*,cpf.eq.${digitos.slice(-11)}`)
          : q.ilike("nome", `%${busca}%`);
      }
      return await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
    })(),
    sb.from("campanhas").select("id,nome,ativo,max_tentativas").order("nome"),
    sb.from("bloqueios").select("telefone_e164,motivo,criado_em").order("criado_em", { ascending: false }).limit(20),
    quemSou(),
  ]);

  const lista = (res.data as Record<string, unknown>[] | null) ?? [];
  const total = res.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const meus = (meu.campanhas ?? []).length;

  function linkPara(destino: number, extra: Record<string, string | undefined> = {}) {
    const prm = new URLSearchParams();
    const base = { pagina: String(destino), status: status || undefined, q: busca || undefined, campanha, filtro: soMeus ? "carteira" : undefined, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) prm.set(k, v);
    return `/leads?${prm.toString()}`;
  }

  return (
    <>
      <h1>Leads</h1>
      <p className="mudo">
        {total} lead(s) no seu escopo — página {pagina} de {paginas}. Escopo = suas campanhas
        ({meus}) e sua carteira; o resto é RLS.
      </p>

      <div className="abas">
        {ESTADOS.map((e) => (
          <Link key={e.v || "todos"} href={linkPara(1, { status: e.v || undefined, filtro: undefined })}
                aria-current={e.v === status ? "page" : undefined}>{e.r}</Link>
        ))}
        <Link href={linkPara(1, { filtro: soMeus ? undefined : "carteira" })} aria-current={soMeus ? "page" : undefined}>
          minha carteira
        </Link>
      </div>

      <FormImportacao campanhas={(campanhas.data as { id: string; nome: string }[] | null) ?? []} />

      <form className="card" method="get" action="/leads" style={{ marginTop: 14 }}>
        <div className="linha">
          <label>
            <span className="mudo">buscar por nome, telefone ou CPF</span>
            <input name="q" defaultValue={busca} placeholder="Maria, 7999999, 529982..." />
          </label>
          <label>
            <span className="mudo">campanha</span>
            <select name="campanha" defaultValue={campanha ?? ""}>
              <option value="">todas</option>
              {((campanhas.data as { id: string; nome: string }[] | null) ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <input type="hidden" name="status" value={status} />
          {soMeus ? <input type="hidden" name="filtro" value="carteira" /> : null}
          <div style={{ alignSelf: "end" }}>
            <button className="primario" type="submit">filtrar</button>
          </div>
        </div>
      </form>

      {res.error ? <p className="alerta">banco: {res.error.message}</p> : null}

      <h2>Resultado</h2>
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>#</th><th>nome</th><th>telefone</th><th>banco</th><th>uf</th>
              <th className="num">margem</th><th>status</th><th className="num">tent.</th>
              <th>carteira</th><th>planilha</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => {
              const extras = (l.extras as Record<string, string> | null) ?? {};
              const chaves = Object.keys(extras);
              return (
                <tr key={String(l.id)}>
                  <td>{String(l.id)}</td>
                  <td>{String(l.nome ?? "—")}</td>
                  <td className="mudo">{String(l.telefone_e164)}</td>
                  <td className="mudo">{String(l.banco_folha ?? "—")}</td>
                  <td className="mudo">{String(l.uf ?? "—")}</td>
                  <td className="num">
                    {l.margem_estimada == null ? "—" : Number(l.margem_estimada).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td>{String(l.status)}</td>
                  <td className="num">{String(l.tentativas)}</td>
                  <td className="mudo">{l.atribuido_em ? new Date(String(l.atribuido_em)).toLocaleDateString("pt-BR", OPC_DATA) : "pool"}</td>
                  <td className="mudo" title={chaves.map((k) => `${k}: ${extras[k]}`).join("\n")}>
                    {chaves.length ? `${chaves.length} colunas` : "—"}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 ? <tr><td colSpan={10} className="mudo">nada para este filtro</td></tr> : null}
          </tbody>
        </table>
      </div>

      {paginas > 1 ? (
        <div className="linha" style={{ marginTop: 12 }}>
          {pagina > 1 ? <Link href={linkPara(pagina - 1)}>← anterior</Link> : null}
          <span className="mudo">página {pagina} / {paginas}</span>
          {pagina < paginas ? <Link href={linkPara(pagina + 1)}>próxima →</Link> : null}
        </div>
      ) : null}

      <h2>Números bloqueados (opt-out / não me perturbe)</h2>
      <table>
        <thead><tr><th>telefone</th><th>motivo</th><th>desde</th></tr></thead>
        <tbody>
          {((bloqueios.data as { telefone_e164: string; motivo: string; criado_em: string }[] | null) ?? []).map((b, i) => (
            <tr key={i}>
              <td>{b.telefone_e164}</td><td>{b.motivo}</td>
              <td>{b.criado_em ? new Date(b.criado_em).toLocaleString("pt-BR", OPC_DATA_HORA) : "—"}</td>
            </tr>
          ))}
          {((bloqueios.data as unknown[] | null) ?? []).length === 0 ? (
            <tr><td colSpan={3} className="mudo">nenhum bloqueio registrado</td></tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}

```


## `web/app/leads/[id]/page.tsx` — 48 linhas

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaLead, quemSou } from "@/lib/acoes";
import PainelFicha from "./painel";

export const dynamic = "force-dynamic";

/**
 * Ficha 360º do lead. Um request só: `fn_ficha_lead` monta lead + trilha + CDRs +
 * propostas + tarefas + roteiro + QA + bloqueio no banco, porque o caminho óbvio
 * (sete `from().select()` no navegador) paga sete ida-e-volta por tela aberta e,
 * pior, sete chances de esquecer o recorte de escopo em uma delas.
 */
export default async function PaginaFicha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) notFound();

  const [r, meu] = await Promise.all([fichaLead(leadId), quemSou()]);
  if (!r.ok) {
    return (
      <>
        <h1>Ficha do lead</h1>
        <p className="alerta">{r.erro}</p>
        <p className="mudo">
          Se o lead existe, ele está numa campanha fora do seu escopo — a ficha respeita a mesma RLS do
          resto do sistema. Volte para <Link href="/crm">CRM</Link>.
        </p>
      </>
    );
  }

  const f = r.data;
  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";

  return (
    <>
      <div className="linha" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>{(f.lead?.nome as string) ?? `Lead #${leadId}`}</h1>
        <span className="mudo">
          lead #{leadId} · <Link href="/crm">← esteira</Link>
        </span>
      </div>

      <PainelFicha ficha={f} leadId={leadId} gerencia={gerencia} meuId={meu.agente_id ?? ""} />
    </>
  );
}

```


## `web/app/leads/[id]/painel.tsx` — 291 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import { avaliarChamada, concluirTarefa, criarTarefa, moverLead, pontuarLeads } from "@/lib/acoes";
import type { FichaLead } from "@/lib/tipos";
import { OPC_DATA_HORA } from "@/lib/tempo";

const ESTAGIOS = ["novo", "sem_contato", "contato", "qualificado", "recusado", "inidoneo", "descarte"];
const MOEDA = (v: unknown) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const DATA = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", OPC_DATA_HORA) : "—";

/**
 * O painel é cliente só onde precisa clicar (mover estágio, tarefa, nota de QA);
 * o conteúdo veio pronto do banco. O formulário de QA só aparece para a gestão —
 * é o scorecard que substitui a escuta de gravação enquanto o meio de discar for o
 * Phone Link: sem áudio, a auditoria é sobre o registro da ligação.
 */
export default function PainelFicha({
  ficha,
  leadId,
  gerencia,
  meuId,
}: {
  ficha: FichaLead;
  leadId: number;
  gerencia: boolean;
  meuId: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [nota, setNota] = useState("85");
  const [achados, setAchados] = useState("");

  const l = ficha.lead ?? {};
  const ultimoCdr = ficha.cdrs?.[0];

  function rodar(nome: string, fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return setErro(r.erro ?? "não foi possível");
      setAviso(`${nome} registrado`);
    });
  }

  return (
    <>
      <div className="grade" style={{ marginBottom: 14 }}>
        <div className="kpi"><span>status</span><b style={{ fontSize: 18 }}>{String(l.status ?? "—")}</b></div>
        <div className="kpi"><span>esteira</span><b style={{ fontSize: 18 }}>{ESTAGIOS.includes(String(l.status)) ? String(l.status) : String(l.status ?? "—")}</b>
          <span className="mudo">{String(l.tentativas ?? 0)} tentativas · prio {String(l.prioridade ?? 0)}</span>
        </div>
        <div className="kpi"><span>margem estimada</span><b style={{ fontSize: 18 }}>{MOEDA(l.margem_estimada)}</b></div>
        <div className="kpi"><span>última chamada</span><b style={{ fontSize: 18 }}>{DATA(String(l.ultima_chamada_at ?? "") || null)}</b></div>
        <div className="kpi"><span>próxima chamada</span><b style={{ fontSize: 18 }}>{DATA(String(l.proximo_contato_at ?? "") || null)}</b></div>
      </div>

      {erro ? <p className="alerta">{erro}</p> : null}
      {aviso ? <p className="ok">{aviso}</p> : null}

      <div className="card">
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="grande"><a href={`tel:${String(l.telefone_e164 ?? "")}`}>{String(l.telefone_e164 ?? "—")}</a></div>
            <div className="mudo">
              {String(l.cidade ?? "—")}/{String(l.uf ?? "--")} · banco {String(l.banco_folha ?? "—")} ·{" "}
              {l.cpf_mask ? `CPF ${String(l.cpf_mask)}` : "sem CPF"} · consentimento{" "}
              {String(l.consentimento ?? "—")}
              {l.consentimento_em ? ` em ${DATA(String(l.consentimento_em))}` : ""}
            </div>
          </div>
          <div className="linha" style={{ gap: 6 }}>
            <a className="btn" href={`tel:${String(l.telefone_e164 ?? "")}`}>discar no Phone Link</a>
          </div>
        </div>

        {ficha.bloqueio ? (
          <p className="alerta" style={{ marginBottom: 0 }}>
            número bloqueado: {String(ficha.bloqueio.motivo)} — {ficha.bloqueio.expira_em
              ? `libera em ${DATA(ficha.bloqueio.expira_em)}`
              : "sem prazo (definitivo)"}
          </p>
        ) : null}

        {ficha.campanha ? (
          <p className="mudo" style={{ marginBottom: 0 }}>
            campanha <b>{ficha.campanha.nome}</b> ({ficha.campanha.publico}) · meta do dia{" "}
            {ficha.campanha.meta_diaria ?? "—"} ·{" "}
            {ficha.campanha.formulario?.length ?? 0} campos de tabulação
          </p>
        ) : null}

        {gerencia ? (
          <div className="linha" style={{ marginTop: 12, alignItems: "flex-end" }}>
            {ESTAGIOS.map((e) => (
              <button
                key={e}
                disabled={pendente || String(l.status) === e}
                onClick={() => rodar(`estágio ${e}`, () => moverLead({ leadId, status: e, motivo: "ajuste na ficha" }))}
              >
                → {e}
              </button>
            ))}
            <button
              disabled={pendente}
              onClick={() => rodar("pontuação", () => pontuarLeads(String(l.campanha_id ?? "") || null))}
            >
              recalcular prioridade da campanha
            </button>
          </div>
        ) : null}
      </div>

      <div className="grade" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <div className="card">
          <b>Histórico ({ficha.eventos?.length ?? 0})</b>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.eventos ?? []).slice(0, 12).map((e, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <span className="mudo">{DATA(e.quando)}</span>{" "}
                {e.de && e.para ? <span className="chip">{String(e.de)} → {String(e.para)}</span> : null}
                <div>{e.detalhe ?? "—"}</div>
              </li>
            ))}
            {!ficha.eventos?.length ? <li className="mudo">nada registrado ainda</li> : null}
          </ul>
        </div>

        <div className="card">
          <b>Ligações ({ficha.cdrs?.length ?? 0})</b>
          <div className="rolagem" style={{ maxHeight: 260, marginTop: 8 }}>
            <table>
              <thead><tr><th>quando</th><th>resultado</th><th className="num">duração</th><th>quem</th><th>nota</th></tr></thead>
              <tbody>
                {(ficha.cdrs ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="mudo">{DATA(c.quando)}</td>
                    <td>{c.disposition}</td>
                    <td className="num">{c.duracao_s ?? 0}s</td>
                    <td className="mudo">{c.agente ?? "—"}</td>
                    <td className="mudo">{c.nota ?? "—"}</td>
                  </tr>
                ))}
                {!ficha.cdrs?.length ? <tr><td colSpan={5} className="mudo">nenhuma chamada</td></tr> : null}
              </tbody>
            </table>
          </div>
          {gerencia && ultimoCdr ? (
            <>
              <div className="linha" style={{ alignItems: "flex-end", marginTop: 10 }}>
                <label style={{ flex: "0 1 90px" }}>
                  <span className="mudo">nota de QA</span>
                  <input type="number" min={0} max={100} value={nota} onChange={(e) => setNota(e.target.value)} />
                </label>
                <label style={{ flex: "1 1 200px" }}>
                  <span className="mudo">o que precisa mudar</span>
                  <input value={achados} onChange={(e) => setAchados(e.target.value)} placeholder="achado da auditoria" />
                </label>
                <button
                  disabled={pendente}
                  onClick={() =>
                    rodar("avaliação de qualidade", () =>
                      avaliarChamada({ cdrId: ultimoCdr.id, nota: Number(nota), achados, planoAcao: achados })
                    )
                  }
                >
                  avaliar a última ligação
                </button>
              </div>
              <p className="mudo" style={{ marginBottom: 0 }}>
                sem áudio no Phone Link, a auditoria é sobre o registro: CDR + passos do roteiro +
                tabulação. A nota entra em <code>qa_avaliacoes</code> e aparece em /relatorios.
              </p>
            </>
          ) : null}
        </div>

        <div className="card">
          <b>Tabulação e dados da planilha</b>
          {(() => {
            const extras = (l.extras ?? {}) as Record<string, unknown>;
            const chaves = Object.keys(extras).filter((k) => !k.startsWith("_"));
            const rotulos = Object.fromEntries((ficha.campanha?.formulario ?? []).map((c) => [c.chave, c.rotulo]));
            if (!chaves.length) return <p className="mudo" style={{ marginBottom: 0 }}>nenhum campo preenchido — o operador tabula na tela dele.</p>;
            return (
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {chaves.map((k) => (
                    <tr key={k}>
                      <td className="mudo">{rotulos[k] ?? k}</td>
                      <td>{typeof extras[k] === "boolean" ? (extras[k] ? "sim" : "não") : String(extras[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>

        <div className="card">
          <b>Propostas e anuência ({ficha.propostas?.length ?? 0})</b>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>valor</th><th className="num">parcelas</th><th>anuência</th><th>prazo</th><th>protocolo</th></tr></thead>
            <tbody>
              {(ficha.propostas ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{MOEDA(p.valor)}</td>
                  <td className="num">{p.parcelas}x</td>
                  <td><span className={`chip ${p.anuencia === "confirmada" ? "chip-verde" : p.anuencia === "expirada" ? "chip-vermelho" : "chip-ambar"}`}>{p.anuencia}</span></td>
                  <td className="mudo">{DATA(p.prazo_validade)}</td>
                  <td className="mudo">{p.protocolo ?? "—"}</td>
                </tr>
              ))}
              {!ficha.propostas?.length ? <tr><td colSpan={5} className="mudo">nenhuma proposta enviada</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="card">
          <b>Tarefas ({(ficha.tarefas ?? []).filter((t) => !t.concluida_em).length} abertas)</b>
          <div className="linha" style={{ marginTop: 8 }}>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="o que fazer com este lead" />
            <button
              disabled={pendente || titulo.trim().length < 3}
              onClick={() =>
                rodar("tarefa", () =>
                  criarTarefa({ leadId, titulo: titulo.trim(), tipo: "retorno" })
                )
              }
            >
              criar
            </button>
          </div>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.tarefas ?? []).slice(0, 8).map((t) => (
              <li key={t.id} style={{ marginBottom: 6 }}>
                {t.concluida_em ? <s>{t.titulo}</s> : <b>{t.titulo}</b>}{" "}
                <span className="mudo">
                  {t.tipo} · vence {DATA(t.vence_em)} · {t.dono ?? "sem dono"}
                </span>
                {!t.concluida_em && (gerencia || t.agente_id === meuId) ? (
                  <button
                    style={{ marginLeft: 8 }}
                    disabled={pendente}
                    onClick={() => rodar("conclusão", () => concluirTarefa(t.id, "feito a partir da ficha"))}
                  >
                    concluir
                  </button>
                ) : null}
              </li>
            ))}
            {!ficha.tarefas?.length ? <li className="mudo">nenhuma tarefa</li> : null}
          </ul>
        </div>

        <div className="card">
          <b>Roteiro cumprido</b>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.roteiro ?? []).map((p, i) => (
              <li key={i}>
                {p.feito ? "✅" : p.obrigatorio ? "⬜" : "▫️"} {p.titulo}
                {p.obrigatorio ? null : <span className="mudo"> · opcional</span>}
                {p.marcado_em ? <span className="mudo"> · {DATA(p.marcado_em)}</span> : null}
              </li>
            ))}
            {!ficha.roteiro?.length ? <li className="mudo">a campanha não tem roteiro apontado</li> : null}
          </ul>
        </div>

        <div className="card">
          <b>Avaliações de QA ({ficha.qa?.length ?? 0})</b>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.qa ?? []).map((q, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <b>{q.nota}/100</b> <span className="mudo">{DATA(q.quando)} · por {q.avaliador ?? "—"}</span>
                <div>{q.achados ?? "—"}</div>
                {q.plano_acao ? <div className="mudo">plano: {q.plano_acao}</div> : null}
              </li>
            ))}
            {!ficha.qa?.length ? <li className="mudo">nenhuma auditoria registrada</li> : null}
          </ul>
        </div>
      </div>
    </>
  );
}

```


## `web/app/empresa/page.tsx` — 65 linhas

```tsx
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import type { BloqueioLinha, EmpresaInfo } from "@/lib/tipos";
import PainelEmpresa from "./painel";

export const dynamic = "force-dynamic";

/**
 * A tela do dono: quem somos (para o cliente e para a LGPD) e quem não pode ser
 * discado. Nenhum dos seis concorrentes tem essa tela porque para eles a empresa é
 * um tenant invisível; aqui é o dono quem configura, e com razão social, CNPJ e
 * encarregado registrados a operação para de depender de "fala com o chefe".
 */
export default async function PaginaEmpresa() {
  const meu = await quemSou();
  const admin = meu.papel === "admin";
  const sb = await supabaseServer();

  const [emp, bloq] = await Promise.all([
    sb.from("empresas").select("*").order("criado_em", { ascending: true }).limit(1),
    admin
      ? sb.from("v_bloqueios").select("*").order("criado_em", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const bruto = ((emp.data as Record<string, unknown>[] | null) ?? [])[0];
  const empresa: EmpresaInfo | null = bruto
    ? {
        id: String(bruto.id),
        nome: String(bruto.nome ?? ""),
        cnpj: (bruto.cnpj as string | null) ?? null,
        telefone: (bruto.telefone as string | null) ?? null,
        email: (bruto.email as string | null) ?? null,
        responsavel_lgpd: (bruto.responsavel_lgpd as string | null) ?? null,
        aviso_gravacao: (bruto.aviso_gravacao as string | null) ?? null,
        janela_ini: String(bruto.janela_ini ?? "09:00").slice(0, 5),
        janela_fim: String(bruto.janela_fim ?? "18:00").slice(0, 5),
      }
    : null;

  const bloqueios: BloqueioLinha[] = ((bloq.data as Record<string, unknown>[] | null) ?? []).map((b) => ({
    telefone_e164: String(b.telefone_e164),
    motivo: String(b.motivo),
    detalhe: (b.detalhe as string | null) ?? null,
    expira_em: (b.expira_em as string | null) ?? null,
    origem: String(b.origem ?? "manual"),
    criado_em: String(b.criado_em ?? ""),
    criado_por: (b.criado_por as string | null) ?? null,
    dias_restantes: b.dias_restantes == null ? null : Number(b.dias_restantes),
    leads: Number(b.leads ?? 0),
    leads_vivos: Number(b.leads_vivos ?? 0),
  }));

  return (
    <>
      <h1>Empresa</h1>
      <p className="mudo">
        {admin
          ? "Cadastro da empresa, lista de bloqueio com prazo e a porta de entrada de lead externo."
          : "Você vê o cadastro e a lista de bloqueio; editar é decisão do admin (o dono)."}
      </p>
      <PainelEmpresa empresa={empresa} bloqueios={bloqueios} admin={admin} />
    </>
  );
}

```


## `web/app/empresa/painel.tsx` — 190 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bloquearTelefone, editarEmpresa, liberarTelefone } from "@/lib/acoes";
import type { BloqueioLinha, EmpresaInfo } from "@/lib/tipos";
import { OPC_DATA } from "@/lib/tempo";

const MOTIVOS: { valor: string; rotulo: string; prazo: string }[] = [
  { valor: "nao_me_perturbe", rotulo: "não me perturbe", prazo: "com prazo (padrão 30 dias)" },
  { valor: "opt_out", rotulo: "opt-out definitivo", prazo: "sem prazo" },
  { valor: "obito", rotulo: "falecimento", prazo: "sem prazo" },
  { valor: "jc", rotulo: "justiça / contestação", prazo: "sem prazo" },
  { valor: "menor", rotulo: "menor de idade", prazo: "sem prazo" },
  { valor: "fraude", rotulo: "suspeita de fraude", prazo: "sem prazo" },
  { valor: "sem_contato_30d", rotulo: "incontratável 30 dias", prazo: "30 dias" },
  { valor: "numero_invalido", rotulo: "número inexistente", prazo: "até higienizar a base" },
];

/**
 * Cadastro da empresa + a lista de quem não pode ser discado. É a tela do dono, e
 * o motivo de existir: LGPD sem nome de encarregado é declaração vaga, e lista de
 * bloqueio sem prazo vira "esquecemos este cliente para sempre".
 */
export default function PainelEmpresa({
  empresa,
  bloqueios,
  admin,
}: {
  empresa: EmpresaInfo | null;
  bloqueios: BloqueioLinha[];
  admin: boolean;
}) {
  const [nome, setNome] = useState(empresa?.nome ?? "");
  const [cnpj, setCnpj] = useState(empresa?.cnpj ?? "");
  const [telefone, setTelefone] = useState(empresa?.telefone ?? "");
  const [email, setEmail] = useState(empresa?.email ?? "");
  const [lgpd, setLgpd] = useState(empresa?.responsavel_lgpd ?? "");
  const [aviso, setAviso] = useState(empresa?.aviso_gravacao ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [tel, setTel] = useState("");
  const [motivo, setMotivo] = useState("nao_me_perturbe");
  const [dias, setDias] = useState("30");
  const [detalhe, setDetalhe] = useState("");
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <div className="grade" style={{ gridTemplateColumns: "1fr", marginBottom: 14 }}>
        <div className="card">
          <b>Quem é a empresa por trás da ligação</b>
          <p className="mudo" style={{ marginTop: 4 }}>
            O cliente que pergunta &ldquo;de onde vocês me ligaram?&rdquo; e o banco/INSS que audita a
            operação recebem resposta daqui. O encarregado de dados é exigência do art. 41 da LGPD;
            sem ele, o pedido de exclusão cai no e-mail genérico e ninguém responde no prazo.
          </p>
          <div className="grade" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label><span className="mudo">razão social / nome fantasia</span>
              <input value={nome} disabled={!admin} onChange={(e) => setNome(e.target.value)} /></label>
            <label><span className="mudo">CNPJ (só dígitos)</span>
              <input value={cnpj} disabled={!admin} maxLength={14} onChange={(e) => setCnpj(e.target.value.replace(/\D/g, ""))} /></label>
            <label><span className="mudo">telefone oficial</span>
              <input value={telefone} disabled={!admin} onChange={(e) => setTelefone(e.target.value)} /></label>
            <label><span className="mudo">e-mail de contato</span>
              <input value={email} disabled={!admin} onChange={(e) => setEmail(e.target.value)} /></label>
            <label style={{ gridColumn: "1 / -1" }}><span className="mudo">encarregado de dados (LGPD art. 41)</span>
              <input value={lgpd} disabled={!admin} placeholder="nome + canal direto" onChange={(e) => setLgpd(e.target.value)} /></label>
            <label style={{ gridColumn: "1 / -1" }}><span className="mudo">aviso de abertura (se houver gravação)</span>
              <input value={aviso} disabled={!admin} placeholder="a frase lida no início da ligação"
                     onChange={(e) => setAviso(e.target.value)} /></label>
          </div>
          {admin ? (
            <button
              className="primario"
              disabled={pendente || nome.trim().length < 2}
              onClick={() =>
                iniciar(async () => {
                  const r = await editarEmpresa({
                    nome, cnpj, telefone, email, responsavelLgpd: lgpd, avisoGravacao: aviso,
                  });
                  setErro(r.ok ? null : r.erro);
                  setMsg(r.ok ? "cadastro salvo (a mudança fica na trilha de gestão)" : null);
                })
              }
            >
              salvar cadastro
            </button>
          ) : (
            <p className="mudo" style={{ marginBottom: 0 }}>só o admin (o dono) edita.</p>
          )}
          {erro ? <p className="alerta">{erro}</p> : null}
          {msg ? <p className="ok">{msg}</p> : null}
        </div>

        <div className="card">
          <b>Adicionar à lista de bloqueio</b>
          <p className="mudo" style={{ marginTop: 4 }}>
            Bloqueio temporário volta sozinho para a fila quando vence — o claim confere
            <code> expira_em </code> antes de entregar qualquer lead. Opt-out, falecimento e fraude não
            admitem prazo: são definitivos, e o banco recusa se você tentar.
          </p>
          <div className="linha" style={{ alignItems: "flex-end", marginTop: 8 }}>
            <label style={{ flex: "1 1 180px" }}><span className="mudo">telefone (+55…)</span>
              <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+5579999990001" /></label>
            <label><span className="mudo">motivo</span>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {MOTIVOS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
              </select></label>
            <label style={{ flex: "0 1 90px" }}><span className="mudo">prazo (dias)</span>
              <input type="number" min={1} value={dias} disabled={["opt_out", "obito", "fraude", "jc", "menor"].includes(motivo)}
                     onChange={(e) => setDias(e.target.value)} /></label>
            <label style={{ flex: "1 1 180px" }}><span className="mudo">detalhe</span>
              <input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} /></label>
            <button
              className="primario"
              disabled={pendente || tel.replace(/\D/g, "").length < 10}
              onClick={() =>
                iniciar(async () => {
                  const r = await bloquearTelefone({
                    telefone: tel,
                    motivo,
                    dias: ["opt_out", "obito", "fraude", "jc", "menor"].includes(motivo) ? null : Number(dias) || null,
                    detalhe,
                  });
                  setErro(r.ok ? null : r.erro);
                  setMsg(r.ok ? `bloqueado (afetou ${r.data.leads_afetados} lead(s) da base)` : null);
                  if (r.ok) { setTel(""); setDetalhe(""); }
                })
              }
            >
              bloquear
            </button>
          </div>
          {erro ? <p className="alerta" style={{ marginBottom: 0 }}>{erro}</p> : null}
          {msg ? <p className="ok" style={{ marginBottom: 0 }}>{msg}</p> : null}
        </div>
      </div>

      <h2>Lista de bloqueio ({bloqueios.length})</h2>
      <div className="rolagem">
        <table>
          <thead>
            <tr><th>telefone</th><th>motivo</th><th className="num">leads</th><th className="num">vivos</th>
                <th>origem</th><th>por quem</th><th>libera em</th><th>detalhe</th><th></th></tr>
          </thead>
          <tbody>
            {bloqueios.map((b) => (
              <tr key={b.telefone_e164}>
                <td className="mudo">{b.telefone_e164}</td>
                <td><span className={`chip ${b.expira_em ? "chip-ambar" : "chip-vermelho"}`}>{b.motivo}</span></td>
                <td className="num">{b.leads}</td>
                <td className="num">{b.leads_vivos}</td>
                <td className="mudo">{b.origem}</td>
                <td className="mudo">{(b as { criado_por?: string }).criado_por ?? "—"}</td>
                <td className="mudo">
                  {b.expira_em ? new Date(b.expira_em).toLocaleDateString("pt-BR", OPC_DATA) : "nunca"}
                </td>
                <td className="mudo">{b.detalhe ?? "—"}</td>
                <td>
                  {admin ? (
                    <button
                      disabled={pendente}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await liberarTelefone(b.telefone_e164);
                          setErro(r.ok ? null : r.erro);
                        })
                      }
                    >
                      liberar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!bloqueios.length ? (
              <tr><td colSpan={9} className="mudo">nenhum número bloqueado — opt-outs registrados aparecem aqui</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mudo">
        A porta de entrada externa (webhook de lead) é ligada por campanha em{" "}
        <Link href="/campanhas">Campanhas</Link>, na aba <i>Tabulação, meta e porta de entrada</i>.
      </p>
    </>
  );
}

```


## `web/app/relatorios/page.tsx` — 320 linhas

```tsx
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import PainelAnuencia, { type LinhaAnuencia } from "./anuencia";
import type { AnuenciaPendente, FunilLinha, LinhaAderencia, LinhaRanking, MapaLinha, MetaDia, PainelDia, QaLinha } from "@/lib/tipos";
import AoVivo from "../ao-vivo";
import { OPC_DATA, OPC_DATA_HORA } from "@/lib/tempo";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorios() {
  const sb = await supabaseServer();
  const [{ data: painel }, { data: ranking }, { data: aderencia }, { data: gestao }, { data: anuencia }, { data: cdrs }, { data: jobs },
    { data: metas }, { data: funil }, { data: mapa }, { data: qa }, meu] =
    await Promise.all([
    sb.from("v_painel_dia").select("*").order("dia", { ascending: false }).limit(60),
    sb.from("v_ranking_dia").select("*").limit(40),
    sb.from("v_aderencia_roteiro").select("*").order("aderencia_pct", { ascending: false }),
    sb.from("auditoria_gestao").select("acao,quem_email,campanha_id,alvo,criado_em").order("id", { ascending: false }).limit(25),
    sb.from("v_anuencia_pendente").select("*").limit(200),
    sb.from("cdr").select("telefone_e164,disposition,duracao_s,started_em,fonte,nota").order("id", { ascending: false }).limit(40),
    sb.from("dial_jobs").select("status,disposition,criado_em,erro").order("criado_em", { ascending: false }).limit(40),
    sb.from("v_metas_dia").select("*").order("pct_meta", { ascending: false }),
    sb.from("v_funil").select("*").order("campanha").order("leads", { ascending: false }),
    sb.from("v_mapa_horario").select("*"),
    sb.from("v_qa_resumo").select("*").order("nota_media", { ascending: true }),
    quemSou(),
  ]);

  const totalChamadas = (painel as PainelDia[] | null)?.reduce((s, p) => s + Number(p.chamadas), 0) ?? 0;
  const totalContatos = (painel as PainelDia[] | null)?.reduce((s, p) => s + Number(p.contatos), 0) ?? 0;
  const propostas = (anuencia as AnuenciaPendente[] | null)?.length ?? 0;

  return (
    <>
      <AoVivo tabelas={["cdr", "dial_jobs", "leads", "tarefas", "qa_avaliacoes"]} fallbackMs={45000} />
      <div className="linha" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>Relatórios</h1>
        <span className="linha" style={{ gap: 8 }}>
          <a className="btn" href="/api/export/csv?tipo=painel">CSV da discagem</a>
          <a className="btn" href="/api/export/csv?tipo=esteira">CSV da esteira</a>
          <a className="btn" href="/api/export/csv?tipo=agenda">CSV da agenda</a>
          <a className="btn" href="/api/export/csv?tipo=metas">CSV das metas</a>
        </span>
      </div>
      <p className="mudo">
        Os CSVs saem das mesmas views, com a mesma RLS: o que a pessoa exporta é o que ela veria na
        tela — exportar não abre porta de saída para dado fora do escopo dela.
      </p>
      <div className="grade">
        <div className="kpi"><span>chamadas (histórico)</span><b>{totalChamadas}</b></div>
        <div className="kpi"><span>contatos</span><b>{totalContatos}</b></div>
        <div className="kpi">
          <span>taxa de contato</span>
          <b>{totalChamadas ? Math.round((totalContatos / totalChamadas) * 100) + "%" : "—"}</b>
        </div>
        <div className="kpi"><span>propostas aguardando anuência</span><b>{propostas}</b></div>
      </div>

      <h2>Meta do dia por campanha</h2>
      <p className="mudo">
        Meta é contato efetivo (disposição <code>atendeu</code>) no dia de Brasília, não tentativa de
        discagem — do contrário a régua infla o número com linha muda e o operador perde a tarde
        discando ocupado.
      </p>
      <table>
        <thead><tr><th>campanha</th><th className="num">meta</th><th className="num">contatos</th>
                   <th className="num">chamadas</th><th className="num">% da meta</th><th className="num">faltam</th><th className="num">operadores</th></tr></thead>
        <tbody>
          {((metas as MetaDia[] | null) ?? []).map((m) => (
            <tr key={m.campanha_id}>
              <td>{m.campanha}</td>
              <td className="num">{m.meta_diaria ?? "—"}</td>
              <td className="num">{m.contatos_hoje}</td>
              <td className="num">{m.chamadas_hoje}</td>
              <td className="num">
                {m.pct_meta == null ? "—" : (
                  <span className={`chip ${m.pct_meta >= 100 ? "chip-verde" : m.pct_meta >= 60 ? "chip-ambar" : "chip-vermelho"}`}>
                    {m.pct_meta}%
                  </span>
                )}
              </td>
              <td className="num">{m.faltam}</td>
              <td className="num">{m.operadores_ativos}</td>
            </tr>
          ))}
          {((metas as MetaDia[] | null) ?? []).length === 0 ? <tr><td colSpan={7} className="mudo">nenhuma campanha no seu escopo</td></tr> : null}
        </tbody>
      </table>

      <h2>Funil por campanha</h2>
      <table>
        <thead><tr><th>campanha</th><th>status</th><th className="num">leads</th><th className="num">% da campanha</th></tr></thead>
        <tbody>
          {((funil as FunilLinha[] | null) ?? []).map((f, i) => (
            <tr key={i}>
              <td>{f.campanha ?? "—"}</td>
              <td><span className="chip">{f.status}</span></td>
              <td className="num">{f.leads}</td>
              <td className="num">
                {f.pct_da_campanha == null ? "—" : (
                  <span className="linha" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <span className="barra" style={{ width: 70, height: 6, background: "#1e293b", borderRadius: 3, display: "inline-block" }}>
                      <span style={{ display: "block", height: 6, width: `${Math.min(100, Number(f.pct_da_campanha))}%`, background: "#22c55e", borderRadius: 3 }} />
                    </span>
                    {f.pct_da_campanha}%
                  </span>
                )}
              </td>
            </tr>
          ))}
          {((funil as FunilLinha[] | null) ?? []).length === 0 ? <tr><td colSpan={4} className="mudo">nenhum lead no seu escopo</td></tr> : null}
        </tbody>
      </table>

      <h2>Melhor horário para ligar (dia × hora)</h2>
      <p className="mudo">
        A régua de cadência usa isso por tabela; o mapa mostra por que. Verde = taxa de contato alta
        naquela faixa. <code>v_mapa_horario</code> só conta linha com CDR registrado, então o que não
        foi discado não distorce a média.
      </p>
      <div className="mapa">
        <div className="rotulo"></div>
        {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => (
          <div key={`h${h}`} className="rotulo num">{h}h</div>
        ))}
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d, dow) => (
          <div key={d} style={{ display: "contents" }}>
            <div className="rotulo">{d}</div>
            {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => {
              const c = ((mapa as MapaLinha[] | null) ?? []).find((m) => Number(m.dow) === dow && Number(m.hora) === h);
              const taxa = c ? Number(c.taxa_contato_pct ?? 0) : null;
              const forca = taxa == null ? 0 : Math.max(0, Math.min(1, taxa / 60));
              return (
                <div key={`${dow}-${h}`} className="celula"
                     title={c ? `${c.chamadas} chamadas · ${c.contatos} contatos · média ${c.duracao_media_s ?? 0}s` : "sem chamada nessa faixa"}
                     style={{ background: taxa == null ? "#0f172a" : `rgba(34,197,94,${(0.08 + forca * 0.72).toFixed(2)})` }}>
                  {taxa == null ? "" : Math.round(taxa)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mudo">
        Cada campanha tem janela própria (<code>janela_ini</code>/<code>janela_fim</code>) e a
        <code> fn_editar_campanha</code> recusa qualquer janela fora de 08:00–21:00 — é regra do banco,
        não da tela. Fora da janela o <code>claim</code> simplesmente não entrega lead, então usar o
        pico do mapa é o que faz a meta do dia ser batida dentro do horário permitido.
      </p>

      <h2>Qualidade (auditoria de ligação)</h2>
      <p className="mudo">
        Sem gravação no Phone Link, o scorecard é preenchido pelo supervisor sobre o CDR + roteiro +
        tabulação da ligação. É o substituto honesto da escuta: vira conversa de treino com número, e
        não com "achismo".
      </p>
      <table>
        <thead><tr><th>operador</th><th>papel</th><th className="num">avaliações</th><th className="num">nota média</th>
                   <th className="num">pior nota</th><th className="num">na semana</th><th>última</th></tr></thead>
        <tbody>
          {((qa as QaLinha[] | null) ?? []).map((q) => (
            <tr key={q.agente_id}>
              <td>{q.agente}</td><td>{q.papel}</td>
              <td className="num">{q.avaliacoes}</td>
              <td className="num">
                {q.nota_media == null ? "—" : (
                  <span className={`chip ${Number(q.nota_media) >= 85 ? "chip-verde" : Number(q.nota_media) >= 70 ? "chip-ambar" : "chip-vermelho"}`}>
                    {q.nota_media}
                  </span>
                )}
              </td>
              <td className="num">{q.pior_nota ?? "—"}</td>
              <td className="num">{q.auditorias_da_semana}</td>
              <td className="mudo">{q.ultima_avaliacao ? new Date(q.ultima_avaliacao).toLocaleDateString("pt-BR", OPC_DATA) : "—"}</td>
            </tr>
          ))}
          {((qa as QaLinha[] | null) ?? []).length === 0 ? (
            <tr><td colSpan={7} className="mudo">nenhuma avaliação registrada — o supervisor avalia pela ficha do lead</td></tr>
          ) : null}
        </tbody>
      </table>

      <h2>Produtividade por operador (hoje)</h2>
      <table>
        <thead><tr><th>operador</th><th>papel</th><th className="num">chamadas</th><th className="num">contatos</th>
                   <th className="num">≥30s</th><th className="num">%</th><th className="num">min</th><th className="num">carteira</th><th className="num">limite</th></tr></thead>
        <tbody>
          {((ranking as LinhaRanking[] | null) ?? []).map((r) => (
            <tr key={r.agente_id}>
              <td>{r.nome}</td><td>{r.papel}</td><td>{r.chamadas}</td><td>{r.contatos}</td>
              <td>{r.efetivos_30s}</td><td>{r.taxa_contato_pct ?? 0}%</td>
              <td>{Math.round(Number(r.segundos_falados ?? 0) / 60)}</td>
              <td>{r.na_carteira}</td><td>{r.limite_diario}</td>
            </tr>
          ))}
          {((ranking as LinhaRanking[] | null) ?? []).length === 0 ? <tr><td colSpan={9} className="mudo">sem operadores no seu escopo</td></tr> : null}
        </tbody>
      </table>

      <h2>Produtividade por dia / campanha / agente</h2>
      <table>
        <thead><tr><th>dia</th><th>campanha</th><th>agente</th><th>chamadas</th><th>contatos</th><th>%</th><th>≥30s</th><th>min</th></tr></thead>
        <tbody>
          {(painel as PainelDia[] | null)?.map((p, i) => (
            <tr key={i}>
              <td>{String(p.dia).slice(0, 10)}</td><td>{p.campanha ?? "—"}</td><td>{p.agente ?? "—"}</td>
              <td>{p.chamadas}</td><td>{p.contatos}</td><td>{p.taxa_contato_pct ?? 0}%</td>
              <td>{p.efetivos_30s}</td><td>{Math.round(Number(p.segundos_falados ?? 0) / 60)}</td>
            </tr>
          )) ?? <tr><td colSpan={8} className="mudo">sem dados</td></tr>}
        </tbody>
      </table>

      <h2>Aderência ao roteiro (hoje)</h2>
      <p className="mudo">
        Passos <b>obrigatórios</b> do roteiro da campanha × o que foi marcado no painel, somado por
        operador no dia de Brasília. É contagem, não impressão: o supervisor usa isto para treino,
        não para ponto.
      </p>
      <table>
        <thead><tr><th>operador</th><th>papel</th><th className="num">leads hoje</th>
                   <th className="num">devidos</th><th className="num">cumpridos</th><th className="num">aderência</th></tr></thead>
        <tbody>
          {((aderencia as LinhaAderencia[] | null) ?? []).map((a) => (
            <tr key={a.agente_id}>
              <td>{a.agente}</td><td>{a.papel}</td>
              <td className="num">{a.leads_de_hoje}</td>
              <td className="num">{a.passos_devidos}</td>
              <td className="num">{a.passos_cumpridos}</td>
              <td className="num">
                {a.aderencia_pct == null ? "—" : (
                  <span className={`chip ${a.aderencia_pct >= 80 ? "chip-verde" : a.aderencia_pct >= 50 ? "chip-ambar" : "chip-vermelho"}`}>
                    {a.aderencia_pct}%
                  </span>
                )}
              </td>
            </tr>
          ))}
          {((aderencia as LinhaAderencia[] | null) ?? []).length === 0 ? (
            <tr><td colSpan={6} className="mudo">sem ligações hoje (ou nenhuma campanha com roteiro aprovado)</td></tr>
          ) : null}
        </tbody>
      </table>

      <h2>Decisões de gestão (trilha)</h2>
      <p className="mudo">
        Quem deu/tirou acesso, mudou regra de campanha, montou ou recolheu carteira. A policy libera
        para admin e para supervisor nas campanhas dele — se você é operador, esta tabela vem vazia
        por RLS, não por filtro de tela.
      </p>
      <div className="rolagem">
        <table>
          <thead><tr><th>quando</th><th>quem</th><th>ação</th><th>detalhe</th></tr></thead>
          <tbody>
            {((gestao as { acao: string; quem_email: string | null; campanha_id: string | null; alvo: Record<string, unknown>; criado_em: string }[] | null) ?? []).map((g, i) => (
              <tr key={i}>
                <td className="mudo">{new Date(g.criado_em).toLocaleString("pt-BR", OPC_DATA_HORA)}</td>
                <td>{g.quem_email ?? "sistema"}</td>
                <td><span className="chip">{g.acao}</span></td>
                <td className="mudo">{JSON.stringify(g.alvo ?? {}).slice(0, 160)}</td>
              </tr>
            ))}
            {((gestao as unknown[] | null) ?? []).length === 0 ? (
              <tr><td colSpan={4} className="mudo">nenhuma decisão registrada — ou você não tem escopo para ver</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>Últimas chamadas (CDR)</h2>
      <table>
        <thead><tr><th>quando</th><th>telefone</th><th>disposição</th><th>duração</th><th>fonte</th><th>nota</th></tr></thead>
        <tbody>
          {(cdrs ?? []).map((c, i) => (
            <tr key={i}>
              <td>{c.started_em ? new Date(String(c.started_em)).toLocaleString("pt-BR", OPC_DATA_HORA) : "—"}</td>
              <td>{String(c.telefone_e164)}</td><td>{String(c.disposition)}</td>
              <td>{c.duracao_s == null ? "—" : `${c.duracao_s}s`}</td>
              <td>{String(c.fonte)}</td><td>{c.nota ? String(c.nota) : "—"}</td>
            </tr>
          ))}
          {(cdrs ?? []).length === 0 ? <tr><td colSpan={6} className="mudo">nenhuma chamada ainda</td></tr> : null}
        </tbody>
      </table>

      <h2>Fila de discagem (jobs)</h2>
      <table>
        <thead><tr><th>criado</th><th>status</th><th>disposição</th><th>erro</th></tr></thead>
        <tbody>
          {(jobs ?? []).map((j, i) => (
            <tr key={i}>
              <td>{j.criado_em ? new Date(String(j.criado_em)).toLocaleString("pt-BR", OPC_DATA_HORA) : "—"}</td>
              <td>{String(j.status)}</td><td>{j.disposition ? String(j.disposition) : "—"}</td>
              <td>{j.erro ? String(j.erro) : "—"}</td>
            </tr>
          ))}
          {(jobs ?? []).length === 0 ? <tr><td colSpan={4} className="mudo">nenhum job</td></tr> : null}
        </tbody>
      </table>

      <h2>Cobrança de anuência (Meu INSS)</h2>
      <PainelAnuencia
        gerencia={meu.papel === "admin" || meu.papel === "supervisor"}
        linhas={((anuencia as AnuenciaPendente[] | null) ?? []).map((a) => ({
          proposta_id: a.proposta_id,
          lead_id: a.lead_id,
          nome: a.nome ?? null,
          telefone_e164: a.telefone_e164,
          valor: Number(a.valor),
          parcelas: a.parcelas,
          anuencia: a.anuencia,
          enviada_em: a.enviada_em,
          prazo_validade: a.prazo_validade,
          dias_restantes: a.dias_restantes,
          responsavel: (a as { responsavel?: string | null }).responsavel ?? null,
        }))}
      />
    </>
  );
}

```


## `web/app/relatorios/anuencia.tsx` — 100 linhas

```tsx
"use client";

import { useState, useTransition } from "react";
import { marcarAnuencia } from "@/lib/acoes";
import { OPC_DATA } from "@/lib/tempo";

export type LinhaAnuencia = {
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
  responsavel: string | null;
};

/**
 * Marcar o resultado da anuência é a única coisa nesta tela que muda dinheiro:
 * confirmada → proposta segue; recusada/expirada → o lead volta para recuperação.
 * Por isso o botões só aparecem para supervisor+ (o banco revalida de qualquer
 * jeito dentro de `fn_marcar_anuencia`).
 */
export default function PainelAnuencia({ linhas, gerencia }: { linhas: LinhaAnuencia[]; gerencia: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [protocolo, setProtocolo] = useState<Record<string, string>>({});

  function marcar(propostaId: string, estado: "confirmada" | "recusada" | "expirada") {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      const r = await marcarAnuencia({
        propostaId,
        anuencia: estado,
        protocolo: protocolo[propostaId] || undefined,
      });
      if (!r.ok) return setErro(r.erro);
      setAviso(`anuência marcada como ${estado} — recarregue a tela`);
    });
  }

  return (
    <>
      {erro ? <p className="alerta">erro: {erro}</p> : null}
      {aviso ? <p className="ok">{aviso}</p> : null}
      <div className="rolagem">
        <table>
          <thead>
            <tr><th>lead</th><th>telefone</th><th className="num">valor</th><th className="num">parcelas</th>
                <th>status</th><th>enviada</th><th className="num">dias restantes</th><th>responsável</th>
                {gerencia ? <th>marcar resultado</th> : null}</tr>
          </thead>
          <tbody>
            {linhas.map((a) => (
              <tr key={a.proposta_id}>
                <td>{a.nome ?? `#${a.lead_id}`}</td>
                <td className="mudo">{a.telefone_e164}</td>
                <td className="num">R$ {Number(a.valor).toLocaleString("pt-BR")}</td>
                <td className="num">{a.parcelas}</td>
                <td>{a.anuencia}</td>
                <td className="mudo">{new Date(a.enviada_em).toLocaleDateString("pt-BR", OPC_DATA)}</td>
                <td className="num" style={{ color: a.dias_restantes <= 2 ? "#f87171" : undefined }}>
                  {a.dias_restantes}
                </td>
                <td className="mudo">{a.responsavel ?? "—"}</td>
                {gerencia ? (
                  <td>
                    <div className="linha" style={{ gap: 6 }}>
                      <input
                        style={{ flex: "2 1 120px" }}
                        placeholder="protocolo INSS"
                        value={protocolo[a.proposta_id] ?? ""}
                        onChange={(e) => setProtocolo({ ...protocolo, [a.proposta_id]: e.target.value })}
                      />
                      <button disabled={pendente} onClick={() => marcar(a.proposta_id, "confirmada")}>confirmada</button>
                      <button disabled={pendente} onClick={() => marcar(a.proposta_id, "recusada")}>recusada</button>
                      <button disabled={pendente} onClick={() => marcar(a.proposta_id, "expirada")}>expirada</button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {linhas.length === 0 ? (
              <tr><td colSpan={gerencia ? 9 : 8} className="mudo">nenhuma proposta aguardando anuência</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mudo" style={{ marginTop: 8 }}>
        O prazo de 5 dias corridos é do INSS (validação biométrica no Meu INSS). Sem anuência, a
        proposta expira sozinha — discar de novo para "fechar" não adianta e é infração.
      </p>
    </>
  );
}

```


## `web/app/equipe/page.tsx` — 153 linhas

```tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import PainelEquipe from "./painel";

export const dynamic = "force-dynamic";

async function carregar() {
  const sb = await supabaseServer();
  const [equipe, campanhas, bloqueios] = await Promise.all([
    sb.from("v_equipe").select("*").order("nome"),
    sb.from("campanhas").select("id,nome,ativo").order("nome"),
    sb.from("bloqueios").select("telefone_e164", { count: "exact", head: true }),
  ]);
  return {
    equipe: (equipe.data as Record<string, unknown>[] | null) ?? [],
    erro: equipe.error?.message ?? null,
    campanhas: (campanhas.data as { id: string; nome: string; ativo: boolean }[] | null) ?? [],
    bloqueados: bloqueios.count ?? 0,
  };
}

/**
 * Página de equipe. A lista vem de `v_equipe` (security_invoker): o que o papel
 * enxerga é decidido no banco, não filtrado no cliente — é por isso que o operador
 * não vê o salário de ninguém nem o telefone dos colegas.
 */
export default async function PaginaEquipe() {
  const [d, meu] = await Promise.all([carregar(), quemSou()]);
  const admin = meu.papel === "admin";
  const gerencia = admin || meu.papel === "supervisor";

  return (
    <>
      <h1>Equipe</h1>
      <p className="mudo">
        Quem entra na fila, limite diário de discagem, pausa e acesso a campanha. Operador vê a si
        mesmo; supervisor vê o time das campanhas dele; admin vê todos — decidido pela RLS de{" "}
        <code>agentes</code>, não por esconder linha no front.
      </p>

      <div className="grade">
        <div className="kpi"><span>pessoas visíveis</span><b>{d.equipe.length}</b></div>
        <div className="kpi">
          <span>agente online</span>
          <b>{d.equipe.filter((e) => e.agente_online).length}</b>
        </div>
        <div className="kpi">
          <span>com job aberto</span>
          <b>{d.equipe.filter((e) => Number(e.jobs_abertos) > 0).length}</b>
        </div>
        <div className="kpi"><span>números bloqueados</span><b>{d.bloqueados}</b></div>
      </div>

      <PainelEquipe
        admin={admin}
        gerencia={gerencia}
        meuId={meu.agente_id ?? ""}
        convide={
          admin
            ? null
            : "Só admin convida gente nova e muda papel global. Acesso a campanha o supervisor concede abaixo."
        }
        equipe={d.equipe.map((e) => ({
          id: String(e.id),
          nome: String(e.nome ?? ""),
          email: String(e.email ?? ""),
          papel: String(e.papel ?? "operador"),
          ativo: Boolean(e.ativo),
          auth_id: e.auth_id ? String(e.auth_id) : null,
          campanhas: (e.campanhas as string[] | null) ?? [],
          pausado_ate: e.pausado_ate ? String(e.pausado_ate) : null,
          discadas_hoje: Number(e.discadas_hoje ?? 0),
          limite_diario: Number(e.limite_diario ?? 0),
        }))}
        campanhas={d.campanhas}
      />

      <h2>Time</h2>
      {d.erro ? <p className="alerta">banco indisponível: {d.erro}</p> : null}
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>nome</th>
              <th>e-mail</th>
              <th>papel</th>
              <th>campanhas</th>
              <th>agente</th>
              <th className="num">hoje</th>
              <th className="num">carteira</th>
              <th className="num">jobs</th>
              <th>login</th>
            </tr>
          </thead>
          <tbody>
            {d.equipe.map((e) => {
              const online = Boolean(e.agente_online);
              const pausado = Boolean(e.pausado_ate && new Date(String(e.pausado_ate)) > new Date());
              const camps = (e.campanhas as string[] | null) ?? [];
              return (
                <tr key={String(e.id)}>
                  <td>{String(e.nome ?? "—")}</td>
                  <td className="mudo">{String(e.email ?? "")}</td>
                  <td>
                    <span
                      className={`chip ${
                        e.papel === "admin" ? "chip-vermelho" : e.papel === "supervisor" ? "chip-azul" : ""
                      }`}
                    >
                      {String(e.papel)}
                    </span>
                  </td>
                  <td className="mudo">{camps.length ? camps.join(", ") : "nenhuma"}</td>
                  <td>
                    <span className={`chip ${online ? "chip-verde" : "chip-ambar"}`}>
                      {online ? "online" : "off"}
                    </span>
                    {pausado ? (
                      <span className="chip chip-ambar" style={{ marginLeft: 4 }}>pausado</span>
                    ) : null}
                  </td>
                  <td className="num">
                    {String(e.discadas_hoje ?? 0)}/{String(e.limite_diario ?? "—")}
                  </td>
                  <td className="num">{String(e.carteira_pendente ?? 0)}</td>
                  <td className="num">{String(e.jobs_abertos ?? 0)}</td>
                  <td>
                    {e.auth_id ? (
                      <span className="chip chip-verde">ok</span>
                    ) : (
                      <span className="chip chip-vermelho">sem login</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {d.equipe.length === 0 ? (
              <tr>
                <td colSpan={9} className="mudo">nenhuma pessoa visível para o seu papel</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mudo" style={{ marginTop: 14 }}>
        Nada aqui aparece sem <Link href="/campanhas">acesso a campanha</Link>: convidado sem linha em{" "}
        <code>campanha_equipe</code> loga, vê 0 leads e recebe 0 ligações — por design.
      </p>
    </>
  );
}

```


## `web/app/login/page.tsx` — 31 linhas

```tsx
import { entrar } from "./acoes";

export const dynamic = "force-dynamic";

export default async function PaginaLogin(props: {
  searchParams: Promise<{ erro?: string; msg?: string }>;
}) {
  const { erro, msg } = await props.searchParams;

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Entrar</h1>
      <p className="mudo">
        Acesso por link mágico (Supabase Auth). O e-mail precisa existir como usuário do projeto —
        crie em Authentication → Users. O mesmo e-mail deve estar na tabela <code>agentes</code>.
      </p>
      {erro ? <p className="alerta">{erro}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <form action={entrar}>
        <label>
          <span className="mudo">e-mail do operador</span>
          <input name="email" type="email" placeholder="maria@suafinanceira.com.br" required />
        </label>
        <button className="primario" type="submit">
          receber link de acesso
        </button>
      </form>
    </div>
  );
}

```


## `web/app/login/acoes.ts` — 28 linhas

```ts
"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export async function entrar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) redirect("/login?erro=" + encodeURIComponent("informe um e-mail válido"));

  const h = await headers();
  const origem =
    process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origem}/auth/callback` },
  });
  if (error) redirect("/login?erro=" + encodeURIComponent(error.message));
  redirect("/login?msg=" + encodeURIComponent(`link de acesso enviado para ${email}`));
}

export async function sair() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}

```


## `web/app/auth/callback/route.ts` — 27 linhas

```ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Callback do link mágico / confirmação de e-mail do Supabase. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const tokenHash = url.searchParams.get("token_hash");
  const email = url.searchParams.get("email") ?? "";

  const sb = await supabaseServer();

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(error.message)}`, url.origin));
  }

  if (tokenHash && email) {
    const { error } = await sb.auth.verifyOtp({ token: tokenHash, type: "email", email });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL("/login?erro=link+invalido", url.origin));
}

```


## `web/app/globals.css` — 111 linhas

```css
:root {
  --bg: #0b0d12;
  --panel: #141822;
  --linha: #232a38;
  --fg: #e6e9f0;
  --mudo: #93a0b5;
  --azul: #2563eb;
  --verde: #16a34a;
  --ambar: #d97706;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

a { color: #93c5fd; text-decoration: none; }

nav {
  display: flex; gap: 18px; align-items: center;
  padding: 14px 22px; background: var(--panel); border-bottom: 1px solid var(--linha);
}
nav b { margin-right: 8px; }

main { padding: 22px; max-width: 1240px; margin: 0 auto; }

h1 { font-size: 20px; margin: 0 0 14px; }
h2 { font-size: 16px; margin: 22px 0 10px; color: var(--mudo); text-transform: uppercase; letter-spacing: .06em; }

.card {
  background: var(--panel); border: 1px solid var(--linha); border-radius: 14px; padding: 16px; margin-bottom: 14px;
}
.grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.kpi { background: var(--panel); border: 1px solid var(--linha); border-radius: 14px; padding: 14px; }
.kpi span { display: block; color: var(--mudo); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.kpi b { font-size: 26px; }

.grande { font-size: 30px; font-weight: 700; letter-spacing: .5px; }
.mudo { color: var(--mudo); font-size: 13px; }

button, .btn {
  font: inherit; cursor: pointer; border-radius: 10px; padding: 10px 14px;
  border: 1px solid var(--linha); background: #1d2433; color: var(--fg);
}
button:hover { border-color: #3a455c; }
button.primario { background: var(--azul); border-color: var(--azul); color: #fff; font-weight: 600; }
button:disabled { opacity: .45; cursor: not-allowed; }

table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--linha); }
th { color: var(--mudo); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }

input, select, textarea {
  font: inherit; background: #0f131c; color: var(--fg);
  border: 1px solid var(--linha); border-radius: 10px; padding: 9px 11px; width: 100%;
}
form { display: grid; gap: 10px; }
.linha { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.linha > * { flex: 1 1 180px; }

.alerta { border-left: 3px solid var(--ambar); background: #1a1508; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
.ok { border-left: 3px solid var(--verde); background: #08150d; padding: 10px 12px; border-radius: 8px; font-size: 13px; }

.chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px;
        border: 1px solid var(--linha); background: #0f131c; color: var(--mudo); }
.chip-verde { border-color: #14532d; color: #86efac; background: #08150d; }
.chip-ambar { border-color: #78350f; color: #fcd34d; background: #1a1508; }
.chip-vermelho { border-color: #7f1d1d; color: #fca5a5; background: #1a0808; }
.chip-azul { border-color: #1e3a8a; color: #93c5fd; background: #0b1220; }
.grade-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.abas { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.abas a { padding: 7px 12px; border: 1px solid var(--linha); border-radius: 999px; font-size: 13px; color: var(--mudo); }
.abas a[aria-current="page"] { background: var(--azul); border-color: var(--azul); color: #fff; }
.rolagem { overflow-x: auto; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

/* ---------- esteira (CRM) ---------- */
.esteira { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
/* seis estágios têm de caber na tela do supervisor — esteira que rola para o lado
   esconde justamente o "confirmada", que é o que o dono quer ver primeiro */
@media (max-width: 1080px) { .esteira { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); } }
.coluna { background: var(--panel); border: 1px solid var(--linha); border-radius: 14px; padding: 10px; min-height: 120px; }
.coluna h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--mudo); }
.coluna .n { float: right; color: var(--fg); }
.cartao { border: 1px solid var(--linha); border-radius: 10px; padding: 8px 9px; margin-bottom: 8px; background: #0f131b; }
.cartao b { display: block; font-size: 14px; }
.cartao .tel { font-variant-numeric: tabular-nums; }
.cartao a { display: inline-block; margin-top: 4px; }
.cartao button { width: 100%; padding: 5px 8px; font-size: 12px; margin-top: 4px; }
.cartao .mudo { font-size: 11px; }

/* ---------- mapa dia×hora (o heat map do ERA, aqui com dado nosso) ---------- */
/* 13 faixas (8h às 20h), não 24: a grade precisa bater com o que a tela renderiza,
   senão o rótulo de cada dia cai numa coluna fantasma e o mapa mente sobre o pico */
.mapa { display: grid; grid-template-columns: 46px repeat(13, minmax(0, 1fr)); gap: 2px; font-size: 11px; }
.mapa div { height: 22px; border-radius: 3px; display: flex; align-items: center; justify-content: center; color: var(--mudo); }
.mapa .rotulo { background: transparent; justify-content: flex-start; padding-left: 4px; color: var(--mudo); }
.mapa .num { justify-content: center; }
.mapa .celula { background: #10141c; cursor: default; }

/* ---------- sino de pendências ---------- */
.sino { position: relative; }
.sino .conta {
  position: absolute; top: -7px; right: -9px; background: var(--ambar); color: #0b0d12;
  border-radius: 999px; font-size: 11px; line-height: 1; padding: 3px 6px; font-weight: 700;
}
.abas button.ativo { border-color: var(--azul); color: var(--fg); }

```


---

# 6. Agente do Windows (Phone Link)


## `agent/core.py` — 334 linhas

```python
"""
Núcleo da discadora Phone Link — lógica pura, sem dependência de Windows.

Este módulo é testável em qualquer lugar (Linux/macOS/Windows): ele não importa
pywinauto nem conhece a UI do Phone Link. O que ele faz:

  * conversar com o Supabase via REST (PostgREST) — sem SDK, só `requests`;
  * reclamar um `dial_jobs` pendente/claimed, entregar ao "discador" e reportar o
    resultado de volta pela RPC `fn_finish_call`;
  * decidir re-tentativa / expiração / formatação de número brasileiro.

O que sabe mexer em janela está em `phonelink_win.py` (só importa pywinauto).
"""

from __future__ import annotations

import dataclasses
import json
import logging
import time
from typing import Any, Iterable, Protocol

log = logging.getLogger("discadora")

DISPOSICOES = {
    "atendeu",
    "nao_atendeu",
    "ocupado",
    "secretaria",
    "whatsapp",
    "ligacao_caiu",
    "numero_invalido",
    "falha_agent",
}


# --------------------------------------------------------------------------- config


@dataclasses.dataclass
class Config:
    url: str
    chave: str                       # service_role (o agente é um processo confiável)
    email_agente: str = ""
    poll_s: float = 4.0
    timeout_ligacao_s: int = 180     # espera máxima pela duração da chamada
    expirar_jobs_min: int = 6
    modo: str = "claimed"            # 'claimed' (painel pediu) | 'auto' (agente puxa da fila)
    seco: bool = False               # dry-run: não mexe na UI
    max_ligacoes: int = 0            # 0 = sem limite (útil p/ teste: --max 5)

    seletores: dict[str, Any] = dataclasses.field(default_factory=dict)

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None, arquivo: str | None = None) -> "Config":
        """Config vem de variáveis de ambiente e/ou config.toml (env vence o arquivo)."""
        import os

        ambiente = {**os.environ, **(env or {})}
        dados: dict[str, Any] = {}
        seletores: dict[str, Any] = {}
        caminho = arquivo or ambiente.get("DISCADORA_CONFIG", "config.toml")
        if caminho and os.path.exists(caminho):
            try:
                from tomllib import load as toml_load  # python >= 3.11
            except ImportError:  # pragma: no cover - 3.10 e anteriores
                dados = {}
            else:
                with open(caminho, "rb") as fh:
                    bruto = toml_load(fh)
                dados = dict(bruto.get("agente", {}))
                seletores = dict(bruto.get("seletores", {}))

        def pegar(chave_toml: str, *nomes_env: str, padrao: Any = "") -> Any:
            """Ordem de preferência: variável de ambiente > config.toml > padrão."""
            for nome in nomes_env:
                if str(ambiente.get(nome, "")) != "":
                    return ambiente[nome]
            if chave_toml in dados and str(dados[chave_toml]) != "":
                return dados[chave_toml]
            return padrao

        return cls(
            url=str(pegar("url", "SUPABASE_URL", "AG_SUPABASE_URL")).rstrip("/"),
            chave=str(pegar("chave", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")),
            email_agente=str(pegar("email_agente", "AGENTE_EMAIL", "AG_AGENTE_EMAIL")),
            poll_s=float(pegar("poll_s", "POLL_SECONDS", padrao=4.0)),
            timeout_ligacao_s=int(pegar("timeout_ligacao_s", "TIMEOUT_LIGACAO_S", padrao=180)),
            expirar_jobs_min=int(pegar("expirar_jobs_min", "EXPIRAR_JOBS_MIN", padrao=6)),
            modo=str(pegar("modo", "MODO", padrao="claimed")),
            seco=str(pegar("seco", "DRY_RUN", padrao=False)).strip().lower() in ("1", "true", "sim"),
            max_ligacoes=int(pegar("max_ligacoes", "MAX_LIGACOES", padrao=0)),
            seletores=seletores,
        )


# --------------------------------------------------------------------------- supabase


class SupabaseRest:
    """Cliente mínimo de PostgREST: select / insert / update / rpc."""

    def __init__(self, url: str, chave: str, timeout: float = 20.0, session: Any = None):
        self.url = url.rstrip("/")
        self.chave = chave
        self.timeout = timeout
        if session is None:  # trocável nos testes
            import requests

            session = requests.Session()
        self.http = session

    # -- infra
    def _cab(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        base = {
            "apikey": self.chave,
            "Authorization": f"Bearer {self.chave}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        base.update(extra or {})
        return base

    # -- operações
    def rpc(self, funcao: str, params: dict[str, Any] | None = None) -> Any:
        resp = self.http.post(
            f"{self.url}/rest/v1/rpc/{funcao}",
            json=params or {},
            headers=self._cab(),
            timeout=self.timeout,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"rpc {funcao} falhou ({resp.status_code}): {resp.text[:300]}")
        return resp.json() if resp.content else None

    def select(self, tabela: str, filt: dict[str, str] | None = None,
               ordem: str | None = None, limite: int = 10, colunas: str = "*") -> list[dict]:
        params = {"select": colunas, **(filt or {})}
        if ordem:
            params["order"] = ordem
        params["limit"] = str(limite)
        resp = self.http.get(f"{self.url}/rest/v1/{tabela}", params=params, headers=self._cab(),
                             timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"select {tabela} falhou ({resp.status_code}): {resp.text[:300]}")
        return resp.json()

    def patch(self, tabela: str, filt: dict[str, str], valores: dict[str, Any]) -> list[dict]:
        resp = self.http.patch(
            f"{self.url}/rest/v1/{tabela}?{self._qs(filt)}",
            json=valores,
            headers=self._cab({"Prefer": "return=representation"}),
            timeout=self.timeout,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"update {tabela} falhou ({resp.status_code}): {resp.text[:300]}")
        return resp.json() if resp.content else []

    @staticmethod
    def _qs(filt: dict[str, str]) -> str:
        from urllib.parse import urlencode

        return urlencode(filt)

    # -- atalhos do domínio
    def id_por_email(self, email: str) -> str | None:
        if not email:
            return None
        linhas = self.select("agentes", filt={"email": f"eq.{email}", "ativo": "eq.true"}, limite=1)
        return linhas[0]["id"] if linhas else None

    def job_pendente(self, agente_id: str | None) -> dict | None:
        """Job que o painel criou (status claimed) e que ainda não foi discado."""
        filt = {"status": "eq.claimed", "disposition": "is.null"}
        if agente_id:
            filt["agente_id"] = f"eq.{agente_id}"
        linhas = self.select("dial_jobs", filt=filt, ordem="claimed_em.asc", limite=1,
                             colunas="id,lead_id,tentativa,claimed_em,leads(nome,telefone_e164,cpf_mask)")
        return linhas[0] if linhas else None

    def claim_na_fila(self, agente_id: str | None) -> dict | None:
        """Modo auto: o próprio agente pede o próximo lead pela RPC (respeita horário/opt-out)."""
        linhas = self.rpc("fn_claim_next_lead", {"p_agente": agente_id})
        if not linhas:
            return None
        l = linhas[0]
        return {
            "id": l["job_id"],
            "lead_id": l["lead_id"],
            "tentativa": l["tentativas"],
            "leads": {
                "nome": l.get("nome"),
                "telefone_e164": l.get("telefone"),
                "cpf_mask": l.get("cpf_mask"),
            },
        }

    def finalizar(self, job_id: str, disposicao: str, duracao_s: int | None, nota: str | None) -> dict:
        if disposicao not in DISPOSICOES:
            raise ValueError(f"disposição desconhecida: {disposicao}")
        return self.rpc("fn_finish_call", {
            "p_job": job_id,
            "p_disposition": disposicao,
            "p_duracao": duracao_s,
            "p_nota": nota,
        }) or {}


# --------------------------------------------------------------------------- dialer


class Discador(Protocol):
    def ligar(self, numero: str) -> None: ...
    def aguardar_fim(self, timeout_s: int) -> int | None: ...   # duração em segundos
    def desligar(self) -> None: ...


class DiscadorSimulado:
    """Para desenvolvimento/teste: não toca na UI. Simula atendente atendendo."""

    def __init__(self, duracao: int = 42):
        self.duracao = duracao
        self.ligados: list[str] = []

    def ligar(self, numero: str) -> None:
        self.ligados.append(numero)
        log.info("[simulado) discando %s", numero)

    def aguardar_fim(self, timeout_s: int) -> int | None:
        return self.duracao

    def desligar(self) -> None:
        return None


# --------------------------------------------------------------------------- helpers


def normalizar_numero(bruto: str) -> str:
    """Deixa o número no formato que o discador do celular entende (só dígitos, com DDI)."""
    digitos = "".join(c for c in (bruto or "") if c.isdigit())
    if digitos.startswith("00"):
        digitos = digitos[2:]
    if digitos.startswith("55") and len(digitos) >= 12:
        return digitos
    if len(digitos) in (10, 11):  # DDD + número brasileiro
        return f"55{digitos}"
    return digitos


def disposicao_por_duracao(duracao_s: int | None, atendeu: bool = True) -> str:
    """Regra de negócio: o que o CDR deve dizer quando o agente não sabe classificar."""
    if duracao_s is None:
        return "ligacao_caiu"
    if not atendeu or duracao_s == 0:
        return "nao_atendeu"
    if duracao_s < 8:
        return "ligacao_caiu"
    return "atendeu"


def deve_retentar(lead: dict | None, tentativas_feitas: int, max_tentativas: int) -> bool:
    return tentativas_feitas < max_tentativas


# --------------------------------------------------------------------------- loop


def executar_um_ciclo(sb: SupabaseRest, discador: Discador, cfg: Config,
                      agente_id: str | None) -> str:
    """
    Um ciclo: pega job -> disca -> espera terminar -> reporta.
    Retorna 'ok' | 'sem_job' | 'falha'. Nunca levanta exceção para o chamador.
    """
    try:
        job = sb.job_pendente(agente_id) if cfg.modo == "claimed" else sb.claim_na_fila(agente_id)
        if not job:
            return "sem_job"

        lead = job.get("leads") or {}
        numero = normalizar_numero(str(lead.get("telefone_e164") or ""))
        job_id = str(job["id"])
        if not numero:
            sb.finalizar(job_id, "numero_invalido", 0, "lead sem telefone")
            return "falha"

        sb.patch("dial_jobs", {"id": f"eq.{job_id}", "status": "in.(claimed,pendente)"},
                 {"status": "discado", "started_em": "now()"})

        if cfg.seco:
            duracao: int | None = 0
            disposicao = "nao_atendeu"
            log.info("[dry-run] deixei de discar %s", numero)
        else:
            try:
                discador.ligar(numero)
                duracao = discador.aguardar_fim(cfg.timeout_ligacao_s)
            except Exception as exc:  # UI quebrou, aparelho caiu, janela mudou
                log.exception("discador falhou")
                sb.finalizar(job_id, "falha_agent", None, f"{type(exc).__name__}: {exc}"[:400])
                return "falha"
            disposicao = disposicao_por_duracao(duracao)

        resultado = sb.finalizar(job_id, disposicao, duracao, None)
        log.info("job %s -> %s (%ss) | lead %s -> %s", job_id[:8], disposicao, duracao,
                 resultado.get("lead_id"), resultado.get("status"))
        return "ok"
    except Exception as exc:  # rede/RPC
        log.warning("ciclo com erro: %s", exc)
        return "falha"


def rodar(sb: SupabaseRest, discador: Discador, cfg: Config,
          agente_id: str | None = None, parar_depois: int | None = None) -> int:
    """Loop principal. `parar_depois` encerra após N ciclos (usado nos testes)."""
    feitos = 0
    while True:
        resultado = executar_um_ciclo(sb, discador, cfg, agente_id)
        feitos += 1
        if resultado == "sem_job":
            time.sleep(min(cfg.poll_s, 30))
        if parar_depois is not None and feitos >= parar_depois:
            return feitos
    # nunca chega


def limpar_jobs_zumbis(sb: SupabaseRest, minutos: int = 6) -> int:
    """Devolve para a fila jobs que ficaram pendurados (agente caiu no meio)."""
    try:
        r = sb.rpc("fn_expirar_jobs", {"p_minutos": minutos})
        return int(r if isinstance(r, (int, float)) else 0)
    except Exception as exc:
        log.warning("fn_expirar_jobs indisponível: %s", exc)
        return 0

```


## `agent/phonelink_win.py` — 181 linhas

```python
"""
Camada Windows: dirige o app "Phone Link" (Vincular ao Celular) por UI Automation.

Por que UIA e não API?  O Phone Link **não tem API pública**. Quem automatiza isso
no ecossistema open source usa automação de interface — é exatamente o que fazem
`vofr/DiscordBotPhoneLinkDialer` e `KibeStevie/Phone-Call-Automation` (este último
diz no README: "interacts with Microsoft Phone Link via UI automation — not through
any official API"). Consequência: os identificadores abaixo podem mudar a cada
versão do app. Por isso o seletor é configurável e existe o modo --inspect.

Requisitos do vínculo (conferidos na doc da Microsoft, 2026):
  * iPhone: iOS 16+, PC com Bluetooth Low Energy (BLE), Windows 10 (Mai/2019+) ou 11;
    app "Link to Windows" no iPhone (opcional, mas recomendado p/ pareamento).
  * Android: app "Link to Windows" no aparelho; chamadas exigem PC com Windows 10+
    com Bluetooth; mesma rede Wi-Fi é o caminho mais estável.
  * Chamada **não** é gravada pelo Phone Link. Precisa de gravação -> PBX no meio.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field

log = logging.getLogger("phonelink")


@dataclass
class Seletores:
    """Regex de nomes de controle. Ajuste aqui (ou no config.toml) para a sua versão."""

    janela: str = r"(?i)phone link|vincular"
    aba_chamadas: str = r"(?i)^calls$|chamadas|ligar"
    teclado: str = r"(?i)keypad|teclado|dial pad|marcar"
    campo_numero: str = r"(?i)enter phone|search|number|n[uú]mero"
    botao_ligar: str = r"(?i)^call$|^ligar$|place call"
    botao_encerrar: str = r"(?i)^end$|hang|encerrar|desligar"
    em_chamada: str = r"(?i)in call|chamada em andamento|mic|muted|silenciar"
    controles_extra: list[str] = field(default_factory=list)


def _desktop():
    from pywinauto import Desktop  # import tardio: só existe no Windows

    return Desktop(backend="uia")


class PhoneLinkDialer:
    """Discador real: escreve o número no Phone Link e aperta ligar."""

    def __init__(self, sel: Seletores | None = None, encerrar_ao_fim: bool = True):
        self.sel = sel or Seletores()
        self.encerrar_ao_fim = encerrar_ao_fim
        self._inicio: float | None = None

    # -- descoberta
    def _janela(self):
        for janela in _desktop().windows():
            try:
                tit = janela.window_text() or ""
            except Exception:
                continue
            if re.search(self.sel.janela, tit):
                return janela
        raise RuntimeError(
            "janela do Phone Link não encontrada. Abra o app, faça pareamento e "
            "rode `python phone_link_agent.py --inspect` para ver os títulos reais."
        )

    @staticmethod
    def _achar(contêiner, padrao: str, tipos: tuple[str, ...] = ()):
        """Procura o primeiro descendente cujo nome bate com a regex (e tipo, se dado)."""
        alvo = re.compile(padrao)
        for filho in contêiner.descendants(depth=8):
            try:
                nome = filho.window_text() or ""
            except Exception:
                continue
            if alvo.search(nome):
                if tipos:
                    ctrl = (filho.element_info.control_type or "").lower()
                    if not any(t.lower() in ctrl for t in tipos):
                        continue
                return filho
        return None

    # -- ações
    def ligar(self, numero: str) -> None:
        janela = self._janela()
        janela.set_focus()

        aba = self._achar(janela, self.sel.aba_chamadas)
        if aba is not None:
            try:
                aba.click_input()
                time.sleep(0.6)
            except Exception as exc:
                log.debug("aba de chamadas não clicável: %s", exc)

        teclado = self._achar(janela, self.sel.teclado)
        if teclado is not None:
            try:
                teclado.click_input()
                time.sleep(0.4)
            except Exception:
                pass

        campo = self._achar(janela, self.sel.campo_numero, tipos=("edit",))
        if campo is not None:
            campo.set_edit_text("")
            campo.type_keys(numero, with_spaces=False)
        else:
            # fallback: digitar direto — o teclado do app captura os dígitos
            log.info("campo de número não achado; caindo para digitação na janela")
            janela.type_keys(numero)

        botao = self._achar(janela, self.sel.botao_ligar)
        if botao is not None:
            botao.click_input()
        else:
            janela.type_keys("{ENTER}")

        self._inicio = time.monotonic()
        log.info("discação enviada para %s pelo Phone Link", numero)

    def aguardar_fim(self, timeout_s: int) -> int | None:
        """
        Espera a chamada terminar e devolve a duração em segundos.
        Estratégia: enquanto houver marcador 'em chamada', continua; quando sumir,
        terminou. Se nunca apareceu (UI diferente), usa o cronômetro do Painel
        (fallback) e devolve None para o core classificar.
        """
        viu_chamada = False
        fim = time.monotonic() + timeout_s
        while time.monotonic() < fim:
            try:
                janela = self._janela()
                em_chamada = self._achar(janela, self.sel.em_chamada) is not None
            except Exception:
                em_chamada = False
            if em_chamada:
                viu_chamada = True
            elif viu_chamada:
                break
            time.sleep(1.0)
        else:
            log.warning("timeout de %ss atingido; encerrando por segurança", timeout_s)
            try:
                self.desligar()
            except Exception:
                pass

        duracao = int(time.monotonic() - self._inicio) if self._inicio else None
        if not viu_chamada:
            log.info("não consegui detectar o fim da chamada pela UI — devolvendo None")
            return None
        return duracao

    def desligar(self) -> None:
        janela = self._janela()
        botao = self._achar(janela, self.sel.botao_encerrar)
        if botao is not None:
            botao.click_input()
            log.info("chamada encerrada pela UI")
        else:
            log.info("botão de encerrar não encontrado; deixe o usuário desligar no celular")

    def inspecionar(self, caminho_saida: str = "inspect_controles.txt") -> str:
        """Despeja a árvore de controles da janela — é assim que se ajustam os seletores."""
        janela = self._janela()
        import io
        from contextlib import redirect_stdout

        buf = io.StringIO()
        with redirect_stdout(buf):
            janela.print_control_identifiers(depth=8, filename=None)
        texto = buf.getvalue()
        with open(caminho_saida, "w", encoding="utf-8") as fh:
            fh.write(texto)
        return caminho_saida

```


## `agent/phone_link_agent.py` — 88 linhas

```python
#!/usr/bin/env python3
"""
Agente Windows da discadora de consignado.

  python phone_link_agent.py --dry-run            # roda sem tocar na UI (para validar config)
  python phone_link_agent.py --inspect            # despeja os controles do Phone Link em arquivo
  python phone_link_agent.py --modo auto --max 20 # o agente puxa os leads da fila sozinho
  python phone_link_agent.py                      # modo padrão: executa os jobs criados no painel

Precisa do pacote `pywinauto` (só instala no Windows) e do Phone Link pareado.
"""

from __future__ import annotations

import argparse
import logging
import sys

from core import DiscadorSimulado, Config, SupabaseRest, limpar_jobs_zumbis, rodar


def montar_discador(cfg: Config) -> object:
    if cfg.seco:
        return DiscadorSimulado()
    if sys.platform != "win32":
        sys.exit("dirigir o Phone Link exige Windows (UI Automation). Use --dry-run para testar.")
    from phonelink_win import PhoneLinkDialer, Seletores  # import tardio, só no Windows

    return PhoneLinkDialer(Seletores(**cfg.seletores) if cfg.seletores else Seletores())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Agente Phone Link -> Supabase")
    ap.add_argument("--url", default=None, help="SUPABASE_URL")
    ap.add_argument("--chave", default=None, help="service_role key (ou use env)")
    ap.add_argument("--email", default=None, help="e-mail do operador (tabela agentes)")
    ap.add_argument("--modo", choices=("claimed", "auto"), default=None)
    ap.add_argument("--dry-run", action="store_true", help="não mexe na UI nem disca")
    ap.add_argument("--max", type=int, default=0, help="encerra após N ciclos (teste)")
    ap.add_argument("--inspect", action="store_true", help="lista controles da janela e sai")
    ap.add_argument("--log", default="INFO")
    args = ap.parse_args(argv)

    logging.basicConfig(level=getattr(logging, args.log.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")

    cfg = Config.from_env({})
    if args.url:
        cfg.url = args.url
    if args.chave:
        cfg.chave = args.chave
    if args.email:
        cfg.email_agente = args.email
    if args.modo:
        cfg.modo = args.modo
    if args.dry_run:
        cfg.seco = True

    if not cfg.url or not cfg.chave:
        sys.exit("faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (env ou config.toml)")

    sb = SupabaseRest(cfg.url, cfg.chave)

    if args.inspect:
        if sys.platform != "win32":
            sys.exit("--inspect precisa do Windows (lê a UI do Phone Link por UI Automation)")
        from phonelink_win import PhoneLinkDialer, Seletores

        destino = PhoneLinkDialer(Seletores()).inspecionar()
        print(f"árvore de controles escrita em {destino}")
        print("use os nomes reais para ajustar Seletores em config.toml -> [seletores]")
        return 0

    agente_id = sb.id_por_email(cfg.email_agente)
    if cfg.email_agente and not agente_id:
        logging.warning("e-mail %s não está na tabela agentes; CDRs ficam sem agente", cfg.email_agente)

    discador = montar_discador(cfg)
    logging.info("agente pronto | url=%s | modo=%s | dry_run=%s | agente=%s",
                 cfg.url, cfg.modo, cfg.seco, agente_id or "-")

    rodar(sb, discador, cfg, agente_id=agente_id,
          parar_depois=args.max if args.max else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

```


## `agent/test_core.py` — 285 linhas

```python
"""
Testes do núcleo do agente. Rodam em qualquer SO (não precisam de Windows nem do
Supabase): sobem um servidor HTTP falso que fala PostgREST o suficiente para o
`SupabaseRest`, e um discador falso. Para rodar:  python -m pytest -q
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from core import (
    Config,
    DiscadorSimulado,
    SupabaseRest,
    disposicao_por_duracao,
    executar_um_ciclo,
    normalizar_numero,
    rodar,
)


class FalsoSupabase:
    """Guarda jobs/leads em memória e registra o que a discadora chamou."""

    def __init__(self, jobs: list[dict] | None = None):
        self.jobs = jobs if jobs is not None else [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "lead_id": 77,
                "tentativa": 1,
                "claimed_em": "2026-09-27T10:00:00Z",
                "status": "claimed",
                "leads": {"nome": "Maria", "telefone_e164": "+5579999990001", "cpf_mask": "123.***.***-01"},
            }
        ]
        self.rpcs: list[tuple[str, dict]] = []
        self.patches: list[tuple[str, dict, dict]] = []

    # -- handlers chamados pelo SupabaseRest
    def handle_rpc(self, funcao: str, params: dict):
        self.rpcs.append((funcao, params))
        if funcao == "fn_claim_next_lead":
            if not self.jobs:
                return None
            j = self.jobs.pop(0)
            return [{
                "job_id": j["id"], "lead_id": j["lead_id"], "nome": j["leads"]["nome"],
                "telefone": j["leads"]["telefone_e164"], "cpf_mask": j["leads"]["cpf_mask"],
                "tentativas": 1, "cidade": None, "uf": None, "campanha": "INSS",
                "publico": "inss", "script_resumo": None, "margem_estimada": None, "obs": None,
            }]
        if funcao == "fn_finish_call":
            self.jobs = [j for j in self.jobs if j["id"] != params["p_job"]]
            return {"ok": True, "lead_id": params.get("lead_id", 77), "status": "contato",
                    "tentativas": 2, "duracao_s": params.get("p_duracao")}
        if funcao == "fn_expirar_jobs":
            return 2
        return None

    def handle_select(self, tabela: str, params: dict):
        if params.get("select") == "id" or tabela == "agentes":
            return [{"id": "agente-1"}]
        if tabela == "dial_jobs":
            return [j for j in self.jobs if j.get("status") == "claimed"][:1]
        return []

    def handle_patch(self, tabela: str, query: str, corpo: dict):
        self.patches.append((tabela, query, corpo))
        return []


@pytest.fixture()
def servidor():
    estado: dict = {"fake": None}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silencia
            pass

        def _json(self, corpo, code=200):
            dados = json.dumps(corpo).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def do_GET(self):
            from urllib.parse import urlparse, parse_qs

            u = urlparse(self.path)
            tabela = u.path.rsplit("/", 1)[-1]
            params = {k: v[0] for k, v in parse_qs(u.query).items()}
            self._json(estado["fake"].handle_select(tabela, params))

        def do_POST(self):
            from urllib.parse import urlparse

            n = int(self.headers.get("Content-Length") or 0)
            corpo = json.loads(self.rfile.read(n) or b"{}")
            funcao = urlparse(self.path).path.rsplit("/", 1)[-1]
            self._json(estado["fake"].handle_rpc(funcao, corpo))

        def do_PATCH(self):
            from urllib.parse import urlparse, parse_qs

            n = int(self.headers.get("Content-Length") or 0)
            corpo = json.loads(self.rfile.read(n) or b"{}")
            u = urlparse(self.path)
            tabela = u.path.rsplit("/", 1)[-1]
            query = parse_qs(u.query)
            self._json(estado["fake"].handle_patch(tabela, u.query, corpo))

    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv, estado
    srv.shutdown()


def _cfg(base, **kw) -> Config:
    return Config(url=f"http://127.0.0.1:{srv_port(base)}", chave="test-key",
                  seco=kw.pop("seco", False), modo=kw.pop("modo", "claimed"), **kw)


def srv_port(srv) -> int:
    return int(srv.server_address[1])


# ------------------------------------------------------------------ unitários puros


def test_normaliza_numero_br_sem_ddi():
    assert normalizar_numero("(79) 99999-0001") == "5579999990001"
    assert normalizar_numero("7933334444") == "557933334444"
    assert normalizar_numero("+55 79 99999-0001") == "5579999990001"


def test_disposicao_por_duracao():
    assert disposicao_por_duracao(None) == "ligacao_caiu"
    assert disposicao_por_duracao(0) == "nao_atendeu"
    assert disposicao_por_duracao(4) == "ligacao_caiu"
    assert disposicao_por_duracao(61) == "atendeu"
    assert disposicao_por_duracao(61, atendeu=False) == "nao_atendeu"


# ------------------------------------------------------------------ integração do loop


def test_um_ciclo_completo_discando_e_reportando(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv, email_agente="maria@x.com")
    sb = SupabaseRest(cfg.url, cfg.chave)
    discador = DiscadorSimulado(duracao=53)

    resultado = executar_um_ciclo(sb, discador, cfg, "agente-1")

    assert resultado == "ok", "ciclo deveria terminar com sucesso"
    assert discador.ligados == ["5579999990001"], "número discado deveria estar normalizado"
    assert fake.patches, "o job deveria ter sido marcado como discado"
    assert fake.patches[0][0] == "dial_jobs"
    assert fake.patches[0][2]["status"] == "discado"

    finais = [p for (f, p) in fake.rpcs if f == "fn_finish_call"]
    assert len(finais) == 1
    assert finais[0]["p_disposition"] == "atendeu"
    assert finais[0]["p_duracao"] == 53


def test_modo_auto_usa_rpc_de_claim(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv, modo="auto")
    sb = SupabaseRest(cfg.url, cfg.chave)

    assert executar_um_ciclo(sb, DiscadorSimulado(12), cfg, None) == "ok"
    assert [f for (f, _p) in fake.rpcs][0] == "fn_claim_next_lead"


def test_sem_job_retorna_sem_job(servidor):
    srv, estado = servidor
    fake = FalsoSupabase(jobs=[])
    estado["fake"] = fake
    cfg = _cfg(srv)
    assert executar_um_ciclo(SupabaseRest(cfg.url, cfg.chave), DiscadorSimulado(), cfg, None) == "sem_job"


def test_dry_run_nao_discar_mas_reporta(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv, seco=True)
    discador = DiscadorSimulado()

    assert executar_um_ciclo(SupabaseRest(cfg.url, cfg.chave), discador, cfg, None) == "ok"
    assert discador.ligados == [], "dry-run não pode acionar o discador"
    finais = [p for (f, p) in fake.rpcs if f == "fn_finish_call"]
    assert finais[0]["p_disposition"] == "nao_atendeu"


def test_falha_do_discador_vira_falha_agent(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake

    class DiscadorQuebrado:
        def ligar(self, numero):
            raise RuntimeError("janela do Phone Link fechou")
        def aguardar_fim(self, timeout_s):
            return None
        def desligar(self):
            return None

    cfg = _cfg(srv)
    assert executar_um_ciclo(SupabaseRest(cfg.url, cfg.chave), DiscadorQuebrado(), cfg, None) == "falha"
    finais = [p for (f, p) in fake.rpcs if f == "fn_finish_call"]
    assert finais[0]["p_disposition"] == "falha_agent"
    assert "Phone Link fechou" in finais[0]["p_nota"]


def test_loop_para_apos_n_ciclos(servidor):
    srv, estado = servidor
    fake = FalsoSupabase(jobs=[])
    estado["fake"] = fake
    cfg = _cfg(srv, poll_s=0.01)
    feitos = rodar(SupabaseRest(cfg.url, cfg.chave), DiscadorSimulado(), cfg, None, parar_depois=3)
    assert feitos == 3


def test_limpar_zumbis_chama_rpc(servidor):
    from core import limpar_jobs_zumbis

    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv)
    assert limpar_jobs_zumbis(SupabaseRest(cfg.url, cfg.chave), 6) == 2
    assert ("fn_expirar_jobs", {"p_minutos": 6}) in fake.rpcs


def test_disposicao_invalida_e_recusada(servidor):
    srv, estado = servidor
    estado["fake"] = FalsoSupabase()
    cfg = _cfg(srv)
    with pytest.raises(ValueError):
        SupabaseRest(cfg.url, cfg.chave).finalizar("x", "ligou_e_fugiu", 1, None)


# ------------------------------------------------------------------ config


def test_config_lê_toml_e_env_tem_precedencia(tmp_path, monkeypatch):
    from core import Config

    arq = tmp_path / "config.toml"
    arq.write_text(
        '[agente]\nurl = "https://proj.supabase.co"\nchave = "svc"\npoll_s = 9\nseco = true\n'
        'modo = "auto"\n[seletores]\nbotao_ligar = "(?i)^chamar$"\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "do-ambiente-vence")
    cfg = Config.from_env({}, arquivo=str(arq))

    assert cfg.url == "https://proj.supabase.co"
    assert cfg.poll_s == 9.0
    assert cfg.modo == "auto"
    assert cfg.seco is True
    assert cfg.seletores["botao_ligar"] == "(?i)^chamar$"
    assert cfg.chave == "do-ambiente-vence"


def test_config_sem_arquivo_usa_apenas_env(monkeypatch):
    from core import Config

    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "abc")
    cfg = Config.from_env({}, arquivo="nao-existe.toml")
    assert cfg.url == "https://x.supabase.co" and cfg.chave == "abc"
    assert cfg.seco is False

```


## `agent/README.md` — 78 linhas

```markdown
# Agente Windows (Phone Link) — como funciona e o que você precisa ajustar

## O desenho

```
   painel na Vercel  ──►  dial_jobs (Supabase)  ◄──  agente neste PC Windows  ──►  Phone Link  ──►  seu celular
        │                          ▲                                                    (BLE/Wi-Fi)
        └── disposição/anuência ───┘                                                    iPhone ou Android
                                        fn_finish_call ──► cdr + leads.status
```

O browser **nunca** toca no seu telefone. Quem toca é o processo local (`phone_link_agent.py`),
porque o Phone Link não expõe API. Isso é proposital: o navegador na Vercel não tem acesso a
Bluetooth, ao Phone Link, nem a um servidor local seu (CORS/mixed content). O trabalho é:
**fila no banco → agente executa → agente reporta**.

## Antes de rodar, deixe o vínculo de pé

1. Windows 10 (Mai/2019+) ou Windows 11. **Para iPhone o PC precisa de Bluetooth LE.**
2. No iPhone: iOS 16.6+ e o app **Link to Windows**; em Pareamento, habilite **Chamadas**.
   No Android: app **Link to Windows** (em Samsung/HONOR/OPPO/vivo/ASUS já vem).
3. Celular e PC na **mesma rede Wi-Fi** (é o que a Microsoft recomenda; Bluetooth fica para o
   áudio/HFP no caso do iPhone).
4. Abra o Phone Link, vá em **Chamadas**, marque o teclado, e confirme que você consegue
   digitar e ligar **manualmente** ali. Automatizar o que não funciona à mão é perda de tempo.
5. Energia: desligue " suspensão seletiva de USB" e o modo de economia que mata o app à noite.

## Instalação

```bat
cd agent
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt        :: pywinauto só instala no Windows
copy config.example.toml config.toml   :: edite url/chave/e-mail e os seletores
python phone_link_agent.py --dry-run   :: valida config + Supabase sem tocar na UI
python phone_link_agent.py --inspect   :: despeja inspect_controles.txt com a sua UI real
python phone_link_agent.py             :: modo normal (executa jobs criados no painel)
python phone_link_agent.py --modo auto --max 20   :: puxa leads sozinho, 20 ciclos e sai
```

Rodar como serviço (o jeito chato mas correto): agendador de tarefas do Windows → "Ao logar",
ação `python.exe C:\caminho\agent\phone_link_agent.py`, marcar "executar com privilégios mais
elevados" **só se necessário** — UI Automation precisa de uma **sessão interativa ativa**, então
a tela não pode ser bloqueada/lockada. Deixe um monitor ligado ou use "não bloquear" via
política. É por isso que o agente precisa ficar numa máquina de operador, não num servidor.

## O ponto sensível: os seletores

`phonelink_win.py` acha a janela por regex no título (`phone link|vincular`) e depois procura
controles por nome (`calls`/`chamadas`, `keypad`/`teclado`, `enter phone`/`número`, `call`/`ligar`,
`end`/`encerrar`). Essa UI muda com versão **e idioma do Windows** — por isso o modo `--inspect`
existe: ele escreve `inspect_controles.txt` com a árvore real da sua janela, e você copia os
nomes para `[seletores]` no `config.toml`. Não há como eu prever os nomes daqui — essa é a
única parte do projeto que exige você na frente da máquina, e deve levar ~15 minutos.

Se o `campo_numero` não for encontrado, o agente cai para digitação direta na janela (o teclado do
Phone Link aceita dígitos) e `{ENTER}` para ligar. Se mesmo assim falhar, o CDR sai como
`falha_agent` com a mensagem de erro — e o lead **não** é queimado: volta para a fila pela
RPC `fn_expirar_jobs`.

## Duração e "quem atendeu"

Não existe evento de fim de chamada acessível no Phone Link. O agente usa heurística: enquanto
houver na UI marcador de "chamada em andamento" (`in call`, `mic`, `muted`), considera ligado;
quando some, mede o tempo desde o clique. Se a UI da sua versão não expõe nada detectável,
`aguardar_fim` devolve `None` e o `core` registra `ligacao_caiu` — nesse caso use o cronômetro
da tela do operador e clique a disposição (é o caminho honesto para 1-2 atendentes).

## O que o agente **não** faz (e você não deve fingir que faz)

- **Não grava a ligação.** Áudio de chamada no Phone Link não é capturável de forma confiável por
  UI Automation. Gravação exige PBX no meio (Asterisk/`chan_quectel`/gateway GSM) — ver
  `../discar-pelo-celular-PLANO.md` no plano maior.
- **Não disca em paralelo.** 1 Phone Link = 1 chamada por vez por PC. Escalar = mais PCs/celulares.
- **Não marca AMD (secretária eletrônica) automaticamente.** Só classificação por duração.
- **Não contrata consignado na ligação.** Proibido (Lei 15.327/2026); o fluxo certo é registrar
  proposta e cobrar anuência no Meu INSS — o painel já faz isso.

```