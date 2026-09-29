-- CRM hardening: automation execution, activity timeline hooks, and FK indexes.
create index if not exists idx_crm_automacao_execucoes_lead on public.crm_automacao_execucoes(lead_id);
create index if not exists idx_crm_automacoes_created_by on public.crm_automacoes(created_by);
create index if not exists idx_crm_mensagens_operador on public.crm_mensagens(operador_id);
create index if not exists idx_crm_propostas_operador on public.crm_propostas(operador_id);

create or replace function private.crm_run_automations(p_event text,p_lead_id uuid,p_context jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public,private as $$
declare a record; action jsonb; depth integer:=coalesce(nullif(current_setting('ak.crm_automation_depth',true),''),'0')::integer;
begin
 if auth.uid() is null or depth>=3 then return; end if;
 perform set_config('ak.crm_automation_depth',(depth+1)::text,true);
 for a in select * from public.crm_automacoes where ativa=true and evento=p_event order by created_at loop
  if nullif(a.condicoes->>'resultado','') is not null and coalesce(p_context->>'resultado','')<>(a.condicoes->>'resultado') then continue; end if;
  if nullif(a.condicoes->>'status','') is not null and coalesce(p_context->>'status','')<>(a.condicoes->>'status') then continue; end if;
  if nullif(a.condicoes->>'canal','') is not null and coalesce(p_context->>'canal','')<>(a.condicoes->>'canal') then continue; end if;
  begin
   insert into public.crm_automacao_execucoes(automacao_id,lead_id,status,detalhes) values(a.id,p_lead_id,'executada',jsonb_build_object('evento',p_event,'contexto',p_context));
   for action in select value from jsonb_array_elements(coalesce(a.acoes,'[]'::jsonb)) loop
    if action->>'tipo'='atualizar_status' and p_lead_id is not null and coalesce(action->>'status','')<>'' then
      update public.leads set status=action->>'status',updated_at=now() where id=p_lead_id;
    elsif action->>'tipo'='criar_tarefa' then
      insert into public.crm_tarefas(lead_id,operador_id,titulo,descricao,prioridade,status,vencimento_at)
      values(p_lead_id,nullif(p_context->>'operador_id','')::uuid,coalesce(nullif(action->>'titulo',''),'Follow-up automático'),nullif(action->>'descricao',''),case when action->>'prioridade' in ('baixa','normal','alta','urgente') then action->>'prioridade' else 'normal' end,'aberta',case when (action->>'minutos')~'^[0-9]+$' then now()+((action->>'minutos')::integer||' minutes')::interval else null end);
    elsif action->>'tipo'='registrar_nota' and p_lead_id is not null then
      insert into public.crm_atividades(lead_id,operador_id,tipo,titulo,descricao,data_hora,concluida)
      values(p_lead_id,nullif(p_context->>'operador_id','')::uuid,'automacao',coalesce(nullif(action->>'titulo',''),'Automação CRM'),nullif(action->>'descricao',''),now(),true);
    end if;
   end loop;
  exception when others then
   insert into public.crm_automacao_execucoes(automacao_id,lead_id,status,detalhes) values(a.id,p_lead_id,'falhou',jsonb_build_object('evento',p_event,'erro',sqlerrm,'contexto',p_context));
  end;
 end loop;
end; $$;

create or replace function private.crm_after_ligacao() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if auth.uid() is null then return new; end if;
 insert into public.crm_atividades(lead_id,operador_id,tipo,titulo,descricao,data_hora,concluida) values(new.lead_id,new.operador_id,'ligacao','Ligação: '||coalesce(new.resultado,'registrada'),nullif(new.observacao,''),coalesce(new.fim,new.inicio,new.created_at),true);
 perform private.crm_run_automations('ligacao_resultado',new.lead_id,jsonb_build_object('resultado',coalesce(new.resultado,''),'operador_id',coalesce(new.operador_id::text,''),'ligacao_id',new.id::text));
 return new;
end; $$;
drop trigger if exists trg_crm_after_ligacao on public.ligacoes;
create trigger trg_crm_after_ligacao after insert on public.ligacoes for each row execute function private.crm_after_ligacao();

create or replace function private.crm_after_retorno() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if auth.uid() is null then return new; end if;
 insert into public.crm_atividades(lead_id,operador_id,tipo,titulo,descricao,data_hora,concluida) values(new.lead_id,new.operador_id,'retorno','Retorno agendado',nullif(new.observacao,''),new.data_hora,new.concluido);
 perform private.crm_run_automations('retorno_criado',new.lead_id,jsonb_build_object('operador_id',coalesce(new.operador_id::text,''),'retorno_id',new.id::text,'data_hora',new.data_hora::text));
 return new;
end; $$;
drop trigger if exists trg_crm_after_retorno on public.retornos;
create trigger trg_crm_after_retorno after insert on public.retornos for each row execute function private.crm_after_retorno();

create or replace function private.crm_after_proposta() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if auth.uid() is null then return new; end if;
 insert into public.crm_atividades(lead_id,operador_id,tipo,titulo,descricao,data_hora,concluida) values(new.lead_id,new.operador_id,'proposta','Proposta criada: '||coalesce(new.produto,'Consignado'),case when new.valor is null then null else 'Valor: R$ '||to_char(new.valor,'FM999G999G990D00') end,new.created_at,true);
 perform private.crm_run_automations('proposta_criada',new.lead_id,jsonb_build_object('operador_id',coalesce(new.operador_id::text,''),'proposta_id',new.id::text,'status',coalesce(new.status,'')));
 return new;
end; $$;
drop trigger if exists trg_crm_after_proposta on public.crm_propostas;
create trigger trg_crm_after_proposta after insert on public.crm_propostas for each row execute function private.crm_after_proposta();

create or replace function private.crm_after_mensagem() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if auth.uid() is null then return new; end if;
 perform private.crm_run_automations('mensagem_registrada',new.lead_id,jsonb_build_object('operador_id',coalesce(new.operador_id::text,''),'conversa_id',new.conversa_id::text,'direcao',new.direcao,'status',new.status));
 return new;
end; $$;
drop trigger if exists trg_crm_after_mensagem on public.crm_mensagens;
create trigger trg_crm_after_mensagem after insert on public.crm_mensagens for each row execute function private.crm_after_mensagem();

revoke all on function private.crm_run_automations(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.crm_after_ligacao() from public,anon,authenticated;
revoke all on function private.crm_after_retorno() from public,anon,authenticated;
revoke all on function private.crm_after_proposta() from public,anon,authenticated;
revoke all on function private.crm_after_mensagem() from public,anon,authenticated;