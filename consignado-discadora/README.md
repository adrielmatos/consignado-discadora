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
