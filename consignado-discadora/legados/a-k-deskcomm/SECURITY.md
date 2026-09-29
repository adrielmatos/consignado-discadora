# Security Policy — A&K Deskcomm

## Escopo
Este projeto trata dados pessoais e operacionais de atendimento. Vulnerabilidades devem ser tratadas como incidentes de segurança.

## Reporte
Não publique credenciais, PII ou detalhes exploráveis em issues públicas. Envie um relatório privado aos mantenedores do repositório com:
- impacto e pré-condições;
- rota/arquivo afetado;
- passos mínimos para reproduzir;
- evidência sanitizada;
- sugestão de correção, se houver.

SLA operacional: confirmação em até 24h; correção ou plano de mitigação em até 72h para falhas críticas/altas.

## Regras obrigatórias
- Nenhum segredo em GitHub, código, comentários ou frontend.
- `service_role`/secret keys somente no backend; módulos que as usam devem declarar `server-only`.
- Toda tabela exposta deve ter RLS.
- Toda mutação de API valida payload com Zod e autorização server-side.
- Dados de organização sempre filtrados por `organization_id`.
- Logs de auditoria são append-only.
- Uploads têm limite de tamanho, extensão/MIME permitido e limite de linhas.
- PII autenticada usa `Cache-Control: private, no-store`.
- Webhooks externos devem usar assinatura/HMAC e idempotência.
- Nunca usar `eval`, SQL concatenado, redirects externos não permitidos ou CORS wildcard em rotas autenticadas.
- Segredos devem ser configurados pela Vercel/Supabase, nunca em arquivos locais versionados.

## Divulgação
Após a correção, a divulgação pública deve ocorrer de forma coordenada, sem expor dados pessoais, tokens ou vetores ainda exploráveis.