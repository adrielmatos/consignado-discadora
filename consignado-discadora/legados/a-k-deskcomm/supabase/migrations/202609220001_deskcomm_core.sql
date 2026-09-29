create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create schema if not exists private;

create table public.organizations(
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 2 and 160),
  slug text not null unique check(slug ~ '^[a-z0-9-]{2,80}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

create table public.organization_members(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','manager','operator','viewer')),
  status text not null default 'active' check(status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  unique(organization_id,user_id)
);
alter table public.organization_members enable row level security;

create or replace function private.user_org_ids()
returns setof uuid
language sql stable security definer set search_path=public,private
as $$ select organization_id from public.organization_members where user_id=(select auth.uid()) and status='active' $$;

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path=public,private
as $$ select exists(select 1 from public.organization_members where organization_id=p_org and user_id=(select auth.uid()) and status='active' and role in ('owner','admin','manager')) $$;

create policy org_select on public.organizations for select to authenticated using (id in (select private.user_org_ids()) or created_by=(select auth.uid()));
create policy org_insert on public.organizations for insert to authenticated with check(created_by=(select auth.uid()));
create policy org_update on public.organizations for update to authenticated using(private.is_org_admin(id)) with check(private.is_org_admin(id));

create policy member_select on public.organization_members for select to authenticated using(user_id=(select auth.uid()) or organization_id in (select private.user_org_ids()));
create policy member_insert on public.organization_members for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.organizations o where o.id=organization_id and o.created_by=(select auth.uid())));
create policy member_admin_update on public.organization_members for update to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
create policy member_admin_delete on public.organization_members for delete to authenticated using(private.is_org_admin(organization_id));

create table public.contacts(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  cpf text,
  source text,
  notes text,
  blocked boolean not null default false,
  blocked_reason text,
  npd boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,phone)
);
create index contacts_org_phone_idx on public.contacts(organization_id,phone);
alter table public.contacts enable row level security;

create table public.leads(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  product text not null,
  stage text not null default 'Novo' check(stage in ('Novo','Contato','Proposta','Negociação','Fechado','Perdido')),
  owner_id uuid references auth.users(id) on delete set null,
  priority integer not null default 0 check(priority between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_org_stage_idx on public.leads(organization_id,stage);
create index leads_org_owner_idx on public.leads(organization_id,owner_id);
alter table public.leads enable row level security;

create table public.conversations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check(channel in ('whatsapp','instagram','web','internal')),
  status text not null default 'open' check(status in ('open','pending','closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index conversations_org_status_idx on public.conversations(organization_id,status,last_message_at desc);
alter table public.conversations enable row level security;

create table public.messages(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  direction text not null check(direction in ('inbound','outbound','system')),
  body text not null,
  external_id text,
  created_at timestamptz not null default now(),
  unique(organization_id,external_id)
);
create index messages_conv_created_idx on public.messages(conversation_id,created_at);
alter table public.messages enable row level security;

create table public.followups(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'open' check(status in ('open','done','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);
create index followups_org_due_idx on public.followups(organization_id,status,due_at);
alter table public.followups enable row level security;

create table public.call_logs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  operator_id uuid references auth.users(id) on delete set null,
  phone text not null,
  result text not null check(result in ('Atendeu','Não atendeu','Retornar','Ocupado','Número inválido')),
  duration_seconds integer not null default 0 check(duration_seconds between 0 and 86400),
  external_id text,
  created_at timestamptz not null default now(),
  unique(organization_id,external_id)
);
create index call_logs_org_created_idx on public.call_logs(organization_id,created_at desc);
alter table public.call_logs enable row level security;

create table public.campaigns(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  product text,
  status text not null default 'draft' check(status in ('draft','active','paused','finished')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;

create table public.automation_rules(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_name text not null,
  action_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.automation_rules enable row level security;

create table public.quick_replies(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.quick_replies enable row level security;

create table public.audit_logs(
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  outcome text not null default 'success',
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs(organization_id,created_at desc);
alter table public.audit_logs enable row level security;

create table public.consent_logs(
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  purpose text not null,
  legal_basis text not null,
  granted boolean not null,
  source text,
  created_at timestamptz not null default now()
);
alter table public.consent_logs enable row level security;

create table public.import_jobs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  row_count integer not null default 0,
  status text not null default 'processing' check(status in ('processing','completed','failed')),
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.import_jobs enable row level security;

create table public.blocked_numbers(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  reason text not null check(reason in ('nao_ligar','nao_me_perturbe','opt_out')),
  source text,
  created_at timestamptz not null default now(),
  unique(organization_id,phone)
);
alter table public.blocked_numbers enable row level security;

create table public.ai_agents(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  provider text,
  model text,
  system_prompt text not null default '',
  enabled boolean not null default false,
  budget_cents integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ai_agents enable row level security;

create table public.ai_skills(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  instructions text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ai_skills enable row level security;

create table public.ai_memory(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  content text not null,
  importance integer not null default 50 check(importance between 0 and 100),
  created_at timestamptz not null default now()
);
alter table public.ai_memory enable row level security;

create table public.knowledge_documents(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  source text,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.knowledge_documents enable row level security;

create table public.knowledge_chunks(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  content text not null,
  embedding extensions.vector(384),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);
alter table public.knowledge_chunks enable row level security;

create table public.event_log(
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index event_log_org_created_idx on public.event_log(organization_id,created_at desc);
alter table public.event_log enable row level security;

create table public.api_idempotency(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id,idempotency_key)
);
alter table public.api_idempotency enable row level security;

create or replace function private.touch_updated_at()
returns trigger language plpgsql security definer set search_path=public,private
as $$ begin new.updated_at=now(); return new; end $$;
create trigger contacts_touch before update on public.contacts for each row execute function private.touch_updated_at();
create trigger leads_touch before update on public.leads for each row execute function private.touch_updated_at();

create or replace function private.apply_org_policies(p_table regclass)
returns void language plpgsql security definer set search_path=public,private
as $$ begin execute format('create policy org_select on %s for select to authenticated using (organization_id in (select private.user_org_ids()))',p_table); execute format('create policy org_insert on %s for insert to authenticated with check (organization_id in (select private.user_org_ids()))',p_table); execute format('create policy org_update on %s for update to authenticated using (organization_id in (select private.user_org_ids())) with check (organization_id in (select private.user_org_ids()))',p_table); execute format('create policy org_delete on %s for delete to authenticated using (organization_id in (select private.user_org_ids()))',p_table); end $$;

select private.apply_org_policies('public.contacts');
select private.apply_org_policies('public.leads');
select private.apply_org_policies('public.conversations');
select private.apply_org_policies('public.messages');
select private.apply_org_policies('public.followups');
select private.apply_org_policies('public.call_logs');
select private.apply_org_policies('public.campaigns');
select private.apply_org_policies('public.automation_rules');
select private.apply_org_policies('public.quick_replies');
select private.apply_org_policies('public.consent_logs');
select private.apply_org_policies('public.import_jobs');
select private.apply_org_policies('public.blocked_numbers');
select private.apply_org_policies('public.ai_agents');
select private.apply_org_policies('public.ai_skills');
select private.apply_org_policies('public.ai_memory');
select private.apply_org_policies('public.knowledge_documents');
select private.apply_org_policies('public.knowledge_chunks');
select private.apply_org_policies('public.event_log');
select private.apply_org_policies('public.api_idempotency');

create policy audit_select on public.audit_logs for select to authenticated using(organization_id in (select private.user_org_ids()));
create policy audit_insert on public.audit_logs for insert to authenticated with check(organization_id in (select private.user_org_ids()) and actor_id=(select auth.uid()));
create policy consent_select on public.consent_logs for select to authenticated using(organization_id in (select private.user_org_ids()));

revoke update,delete on public.audit_logs from authenticated;
revoke update,delete on public.event_log from authenticated;
revoke update,delete on public.consent_logs from authenticated;

create or replace function public.match_knowledge(query_embedding extensions.vector(384), match_threshold float, match_count int)
returns table(id uuid, document_id uuid, content text, similarity float)
language sql stable security invoker
as $$ select k.id,k.document_id,k.content,1-(k.embedding <=> query_embedding) from public.knowledge_chunks k where k.organization_id in (select private.user_org_ids()) and k.embedding is not null and 1-(k.embedding <=> query_embedding) >= match_threshold order by k.embedding <=> query_embedding limit least(greatest(match_count,1),50) $$;

-- Least-privilege Data API grants and function exposure.
revoke execute on function private.user_org_ids() from public, anon;
revoke execute on function private.is_org_admin(uuid) from public, anon;
revoke execute on function private.touch_updated_at() from public, anon;
revoke execute on function private.apply_org_policies(regclass) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.user_org_ids() to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
revoke execute on function public.match_knowledge(extensions.vector(384),float,int) from public, anon;
grant execute on function public.match_knowledge(extensions.vector(384),float,int) to authenticated;

revoke all on all tables in schema public from anon;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on all sequences in schema public from anon;
grant usage,select on all sequences in schema public to authenticated;
grant all on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;

-- Private Storage bucket for future customer media/import artifacts.
insert into storage.buckets(id,name,public,file_size_limit)
values('deskcomm-private','deskcomm-private',false,10485760)
on conflict(id) do update set public=false,file_size_limit=10485760;

create policy deskcomm_storage_select on storage.objects for select to authenticated
using(bucket_id='deskcomm-private' and (storage.foldername(name))[1] in (select private.user_org_ids()::text));
create policy deskcomm_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='deskcomm-private' and (storage.foldername(name))[1] in (select private.user_org_ids()::text));
create policy deskcomm_storage_update on storage.objects for update to authenticated
using(bucket_id='deskcomm-private' and (storage.foldername(name))[1] in (select private.user_org_ids()::text))
with check(bucket_id='deskcomm-private' and (storage.foldername(name))[1] in (select private.user_org_ids()::text));
create policy deskcomm_storage_delete on storage.objects for delete to authenticated
using(bucket_id='deskcomm-private' and (storage.foldername(name))[1] in (select private.user_org_ids()::text));
