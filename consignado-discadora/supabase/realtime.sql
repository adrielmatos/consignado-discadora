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
