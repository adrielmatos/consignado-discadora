create schema if not exists private;

create or replace function private.current_operator_is_owner() returns boolean
language sql stable security definer set search_path=public as $$
select exists(select 1 from public.operadores where auth_user_id=(select auth.uid()) and ativo=true and perfil='admin');
$$;
revoke all on function private.current_operator_is_owner() from public;
grant execute on function private.current_operator_is_owner() to authenticated;

create table if not exists public.audit_logs(
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid references auth.users(id) on delete set null,
 operator_id uuid references public.operadores(id) on delete set null,
 action text not null, resource text, resource_id uuid, request_id text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_user_id,created_at desc);
create index if not exists idx_audit_logs_resource on public.audit_logs(resource,resource_id);
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_insert_active on public.audit_logs;
create policy audit_logs_insert_active on public.audit_logs for insert to authenticated with check((select private.current_operator_active()));
drop policy if exists audit_logs_select_owner on public.audit_logs;
create policy audit_logs_select_owner on public.audit_logs for select to authenticated using((select private.current_operator_is_owner()));

create table if not exists public.consent_logs(
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 operator_id uuid references public.operadores(id) on delete set null,
 lead_id uuid references public.leads(id) on delete set null,
 consent_type text not null, granted boolean not null, source text, request_id text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_consent_logs_lead on public.consent_logs(lead_id,created_at desc);
create index if not exists idx_consent_logs_created_at on public.consent_logs(created_at desc);
alter table public.consent_logs enable row level security;
drop policy if exists consent_logs_insert_active on public.consent_logs;
create policy consent_logs_insert_active on public.consent_logs for insert to authenticated with check((select private.current_operator_active()) and (operator_id is null or operator_id=(select private.current_operator_id())));
drop policy if exists consent_logs_select_owner on public.consent_logs;
create policy consent_logs_select_owner on public.consent_logs for select to authenticated using((select private.current_operator_is_owner()));

drop policy if exists operadores_update on public.operadores;
create policy operadores_update on public.operadores for update to authenticated using((select private.current_operator_is_admin())) with check((select private.current_operator_is_admin()));

create index if not exists idx_leads_status_priority on public.leads(status,prioridade desc,created_at desc);
create index if not exists idx_retornos_abertos on public.retornos(data_hora) where concluido=false;
create index if not exists idx_ligacoes_created_resultado on public.ligacoes(created_at desc,resultado);
