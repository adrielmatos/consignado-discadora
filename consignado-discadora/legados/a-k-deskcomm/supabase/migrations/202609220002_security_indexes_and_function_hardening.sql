-- Security and performance hardening for the A&K Deskcomm database.
create or replace function public.match_knowledge(query_embedding extensions.vector(384), match_threshold float, match_count int)
returns table(id uuid, document_id uuid, content text, similarity float)
language sql stable security invoker
set search_path = public, extensions
as $$ select k.id,k.document_id,k.content,1-(k.embedding <=> query_embedding) from public.knowledge_chunks k where k.organization_id in (select private.user_org_ids()) and k.embedding is not null and 1-(k.embedding <=> query_embedding) >= match_threshold order by k.embedding <=> query_embedding limit least(greatest(match_count,1),50) $$;

drop policy if exists consent_select on public.consent_logs;

create index if not exists ai_agents_org_idx on public.ai_agents(organization_id);
create index if not exists ai_memory_org_idx on public.ai_memory(organization_id);
create index if not exists ai_memory_contact_idx on public.ai_memory(contact_id);
create index if not exists ai_skills_org_idx on public.ai_skills(organization_id);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
create index if not exists automation_rules_org_idx on public.automation_rules(organization_id);
create index if not exists call_logs_lead_idx on public.call_logs(lead_id);
create index if not exists call_logs_operator_idx on public.call_logs(operator_id);
create index if not exists campaigns_org_idx on public.campaigns(organization_id);
create index if not exists consent_logs_org_idx on public.consent_logs(organization_id);
create index if not exists consent_logs_contact_idx on public.consent_logs(contact_id);
create index if not exists conversations_contact_idx on public.conversations(contact_id);
create index if not exists conversations_assigned_idx on public.conversations(assigned_to);
create index if not exists followups_lead_idx on public.followups(lead_id);
create index if not exists followups_assigned_idx on public.followups(assigned_to);
create index if not exists import_jobs_org_idx on public.import_jobs(organization_id);
create index if not exists knowledge_chunks_document_idx on public.knowledge_chunks(document_id);
create index if not exists knowledge_documents_org_idx on public.knowledge_documents(organization_id);
create index if not exists leads_contact_idx on public.leads(contact_id);
create index if not exists leads_owner_idx on public.leads(owner_id);
create index if not exists messages_sender_idx on public.messages(sender_user_id);
create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists organizations_created_by_idx on public.organizations(created_by);
create index if not exists quick_replies_org_idx on public.quick_replies(organization_id);
