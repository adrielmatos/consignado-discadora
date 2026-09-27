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
