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
