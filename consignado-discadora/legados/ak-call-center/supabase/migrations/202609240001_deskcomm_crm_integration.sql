create table if not exists public.crm_conversas(
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
 canal text not null default 'whatsapp', status text not null default 'aberta', assunto text,
 responsavel_id uuid references public.operadores(id) on delete set null, ultima_mensagem_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(canal in ('whatsapp','instagram','messenger','email','sms','interno')),
 check(status in ('aberta','pendente','resolvida','arquivada'))
);
create index if not exists idx_crm_conversas_lead on public.crm_conversas(lead_id,updated_at desc);
create index if not exists idx_crm_conversas_responsavel on public.crm_conversas(responsavel_id,updated_at desc);
create table if not exists public.crm_mensagens(
 id uuid primary key default gen_random_uuid(), conversa_id uuid not null references public.crm_conversas(id) on delete cascade,
 lead_id uuid not null references public.leads(id) on delete cascade, operador_id uuid references public.operadores(id) on delete set null,
 direcao text not null, conteudo text not null, status text not null default 'registrada', created_at timestamptz not null default now(),
 check(direcao in ('entrada','saida','nota')), check(status in ('registrada','enviada','lida','falhou'))
);
create index if not exists idx_crm_mensagens_conversa on public.crm_mensagens(conversa_id,created_at);
create index if not exists idx_crm_mensagens_lead on public.crm_mensagens(lead_id,created_at desc);
create table if not exists public.crm_tarefas(
 id uuid primary key default gen_random_uuid(), lead_id uuid references public.leads(id) on delete cascade,
 operador_id uuid references public.operadores(id) on delete set null, titulo text not null, descricao text,
 prioridade text not null default 'normal', status text not null default 'aberta', vencimento_at timestamptz,
 concluida_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(prioridade in ('baixa','normal','alta','urgente')), check(status in ('aberta','em_andamento','concluida','cancelada'))
);
create index if not exists idx_crm_tarefas_operador_status on public.crm_tarefas(operador_id,status,vencimento_at);
create index if not exists idx_crm_tarefas_lead on public.crm_tarefas(lead_id,status);
create table if not exists public.crm_tags(
 id uuid primary key default gen_random_uuid(), nome text not null unique, cor text not null default '#146bd8', created_at timestamptz not null default now()
);
create table if not exists public.crm_lead_tags(
 lead_id uuid not null references public.leads(id) on delete cascade, tag_id uuid not null references public.crm_tags(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(lead_id,tag_id)
);
create index if not exists idx_crm_lead_tags_tag on public.crm_lead_tags(tag_id);
create table if not exists public.crm_propostas(
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
 operador_id uuid references public.operadores(id) on delete set null, produto text, valor numeric(14,2),
 status text not null default 'rascunho', observacao text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status in ('rascunho','enviada','em_analise','aprovada','recusada','cancelada'))
);
create index if not exists idx_crm_propostas_lead on public.crm_propostas(lead_id,created_at desc);
create table if not exists public.crm_automacoes(
 id uuid primary key default gen_random_uuid(), nome text not null, evento text not null, ativa boolean not null default true,
 condicoes jsonb not null default '{}'::jsonb, acoes jsonb not null default '[]'::jsonb,
 created_by uuid references public.operadores(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_automacao_execucoes(
 id uuid primary key default gen_random_uuid(), automacao_id uuid not null references public.crm_automacoes(id) on delete cascade,
 lead_id uuid references public.leads(id) on delete set null, status text not null default 'executada',
 detalhes jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 check(status in ('executada','ignorada','falhou'))
);
create index if not exists idx_crm_automacao_execucoes_automacao on public.crm_automacao_execucoes(automacao_id,created_at desc);
alter table public.crm_conversas enable row level security; alter table public.crm_mensagens enable row level security;
alter table public.crm_tarefas enable row level security; alter table public.crm_tags enable row level security;
alter table public.crm_lead_tags enable row level security; alter table public.crm_propostas enable row level security;
alter table public.crm_automacoes enable row level security; alter table public.crm_automacao_execucoes enable row level security;
drop policy if exists crm_conversas_active on public.crm_conversas;
create policy crm_conversas_active on public.crm_conversas for all to authenticated using((select private.current_operator_active())) with check((select private.current_operator_active()));
drop policy if exists crm_mensagens_active on public.crm_mensagens;
create policy crm_mensagens_active on public.crm_mensagens for all to authenticated using((select private.current_operator_active())) with check((select private.current_operator_active()));
drop policy if exists crm_tarefas_active on public.crm_tarefas;
create policy crm_tarefas_active on public.crm_tarefas for all to authenticated using((select private.current_operator_active())) with check((select private.current_operator_active()));
drop policy if exists crm_tags_active on public.crm_tags;
create policy crm_tags_active on public.crm_tags for all to authenticated using((select private.current_operator_active())) with check((select private.current_operator_active()));
drop policy if exists crm_lead_tags_active on public.crm_lead_tags;
create policy crm_lead_tags_active on public.crm_lead_tags for all to authenticated using((select private.current_operator_active())) with check((select private.current_operator_active()));
drop policy if exists crm_propostas_active on public.crm_propostas;
create policy crm_propostas_active on public.crm_propostas for all to authenticated using((select private.current_operator_active())) with check((select private.current_operator_active()));
drop policy if exists crm_automacoes_active on public.crm_automacoes;
create policy crm_automacoes_active on public.crm_automacoes for all to authenticated using((select private.current_operator_is_admin())) with check((select private.current_operator_is_admin()));
drop policy if exists crm_automacao_execucoes_active on public.crm_automacao_execucoes;
create policy crm_automacao_execucoes_active on public.crm_automacao_execucoes for all to authenticated using((select private.current_operator_is_admin())) with check((select private.current_operator_is_admin()));
create or replace function private.touch_crm_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_crm_conversas_updated on public.crm_conversas; create trigger trg_crm_conversas_updated before update on public.crm_conversas for each row execute function private.touch_crm_updated_at();
drop trigger if exists trg_crm_tarefas_updated on public.crm_tarefas; create trigger trg_crm_tarefas_updated before update on public.crm_tarefas for each row execute function private.touch_crm_updated_at();
