# A&K Deskcomm

CRM/central de atendimento separado da discadora A&K. A integração com a discadora será feita somente em uma etapa posterior por API autenticada.

## Módulos
Dashboard, Inbox, Radar, Kanban, Clientes, Follow-ups, Ligações de teste, Campanhas, Automações, Respostas rápidas, Equipe, Auditoria e Configurações.

## Segurança de produção
Supabase Auth/SSR, RLS multi-tenant, RBAC server-side, Zod, audit log append-only, consent logs/LGPD, idempotência, rate limiting, CSP/headers, service_role somente no servidor, webhooks assinados e testes E2E.

A versão inicial usa dados locais apenas para prototipagem visual. Não deve ser usada como base de produção até a camada de autenticação/banco e a auditoria de segurança serem concluídas.
