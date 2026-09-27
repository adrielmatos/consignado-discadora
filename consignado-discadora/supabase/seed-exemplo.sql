-- SQL de primeiro uso (rode depois do schema.sql, no SQL Editor do Supabase)

-- 1) crie antes o usuário no Supabase (Authentication → Users → Add user) com o mesmo e-mail:
-- Na primeira rodada, Maria é admin (papel global). Depois, troque na tela
-- /equipe e crie os operadores lá — o painel chama o Admin API do Supabase e
-- cria o login; não é para ficar inserindo em auth.users na mão.
insert into public.agentes (email, nome, celular, ativo, papel, limite_diario)
values ('maria@suafinanceira.com.br', 'Maria', '+5579988887777', true, 'admin', 150)
on conflict (email) do update set nome = excluded.nome, celular = excluded.celular;

-- 2) campanha com janela de horário conservadora (só 9h-18h, horário de Brasília)
insert into public.campanhas (nome, publico, janela_ini, janela_fim, max_tentativas,
                               intervalo_retentativa_s, script_resumo)
select 'INSS - margem disponível', 'inss', '09:00', '18:00', 3, 14400,
       'Abordagem: identificar o titular, confirmar margem, explicar que a contratação é pelo app Meu INSS com validação do beneficiário. Jamais fechar contrato por telefone. Se a pessoa pedir para não receber ligações, registrar opt-out no painel.'
  where not exists (select 1 from public.campanhas where nome = 'INSS - margem disponível');

-- 3) leads de teste (com consentimento registrado — sem isso a fila não disca)
insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, margem_estimada,
                          consentimento, consentimento_em)
select c.id, 'Maria de Teste', '52998224725', '+5579999990001', 'Aracaju', 'SE', 350.00,
       'form_proprio', now()
  from public.campanhas c where c.nome = 'INSS - margem disponível'
on conflict do nothing;

insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, margem_estimada,
                          consentimento, consentimento_em)
select c.id, 'Jose de Teste', '98765432100', '+5579999990002', 'N. Sra. do Socorro', 'SE', 510.00,
       'form_proprio', now()
  from public.campanhas c where c.nome = 'INSS - margem disponível'
on conflict do nothing;

insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, margem_estimada,
                          consentimento, consentimento_em)
select c.id, 'Ana de Teste', '11144477735', '+5579999990003', 'Sao Cristovao', 'SE', 180.00,
       'form_proprio', now()
  from public.campanhas c where c.nome = 'INSS - margem disponível'
on conflict do nothing;

-- 4) Maria (admin) não precisa de linha em campanha_equipe, mas o modelo é:
--    operador SEM linha de acesso não enxerga a campanha — nem o pool, nem o lead.
--    Descomente para simular um operador na campanha:
-- insert into public.campanha_equipe (campanha_id, agente_id, papel, limite_diario)
-- select c.id, a.id, 'operador', 100
--   from public.campanhas c, public.agentes a
--  where c.nome = 'INSS - margem disponível' and a.email = 'joao@suafinanceira.com.br'
-- on conflict (campanha_id, agente_id) do nothing;

-- 4b) roteiro de ligação aprovado — o texto que o operador lê DURANTE a chamada.
--     Nada aqui pode virar promessa: a contratação não acontece por telefone
--     (Lei 15.327/2026 + IN INSS 213/2026). O que fecha é a anuência biométrica do
--     próprio titular no app Meu INSS, em até 5 dias corridos.
insert into public.roteiros (nome, publico, aviso_compliance)
select 'INSS — consulta com anuência no Meu INSS', 'inss',
 'PROIBIDO: fechar ou confirmar contratação por telefone; pedir senha, código, chave PIX ou documento por mensagem; dizer que o desconto é obrigatório para manter o benefício; embutir seguro prestamista (vedado); prometer valor, taxa ou aprovação.' ||
 ' LIMITES: margem consignável 40% no benefício previdenciário e 35% no BPC/LOAS; até 108 parcelas; carência de 3 meses para o 1º desconto.' ||
 ' Se a pessoa pedir para não receber mais ligações: marcar opt-out no painel NA HORA e encerrar — insistir é o que gera reclamação e bloqueio do benefício.'
 where not exists (select 1 from public.roteiros where nome = 'INSS — consulta com anuência no Meu INSS');

insert into public.roteiro_passos (roteiro_id, ordem, titulo, texto, obrigatorio)
select r.id, v.ordem, v.titulo, v.texto, v.obrigatorio
  from public.roteiros r
  join (values
    (1, 'ABERTURA — só informação',
     '“[nome do titular]? Boa tarde, aqui é [operador], da [empresa], correspondente autorizado do INSS. O senhor autorizou contato sobre crédito consignado em [canal]. Estou ligando só para explicar como funciona, tudo bem?” Se a pessoa nega a autorização ou diz que não pediu nada: agradecer, oferecer opt-out e encerrar. Não argumentar.', true),
    (2, 'CONFERÊNCIA DE TITULARIDADE (LGPD)',
     'Confirmar COM O PRÓPRIO TITULAR: nome completo, data de nascimento e benefício em manutenção. Nunca ler o CPF ou o número do benefício para ele só confirmar — perguntar. Se quem atendeu é terceiro: não passar nenhum dado, dizer que o assunto é pessoal e oferecer retorno com o titular.', true),
    (3, 'QUALIFICAÇÃO',
     'Perguntar, nesta ordem: tem margem consignável disponível? Já tem consignado ativo e em quantas parcelas? Para que pretende usar (quitar empréstimo mais caro, saúde, reforma)? Registrar tudo no campo de anotação antes de encerrar a ligação. Se não há margem: explicar a carência de 3 meses e agendar retorno — sem insistir.', true),
    (4, 'COMO A CONTRATAÇÃO ACONTECE',
     'Explicar sem rodeio: “a senhora não assina nada comigo e eu não posso confirmar valor por telefone. Eu registro a proposta; ela aparece no app Meu INSS como pendente de confirmação; a senhora valida com a sua biometria facial em até 5 dias corridos. Se não validar, cancela sozinha e nada é descontado.”', true),
    (5, 'OBJEÇÕES',
     'Usar as respostas de objeção do roteiro. Se a pessoa disser que vai reclamar, procurar o Procon ou o banco: agradecer, confirmar o encerramento e marcar a disposição — não tentar reverter na ligação.', true),
    (6, 'ENCERRAMENTO E REGISTRO',
     'Repetir que a validação é no Meu INSS, combinar dia de retorno se houver interesse e REGISTRAR a disposição no painel (proposta enviada / retorno agendado / sem interesse). Não prometer ligação do banco nem “depósito hoje”: o banco tem 7 dias úteis para informar o depósito.', true),
    (7, 'CHECKLIST DE DADOS (para a proposta)',
     'Antes de registrar proposta no painel: nome, CPF confirmado, banco onde recebe, margem estimada, valor desejado, número de parcelas, telefone de contato e o consentimento de contato registrado. Faltou um, não registre a proposta.', false)
  ) as v(ordem, titulo, texto, obrigatorio) on true
 where r.nome = 'INSS — consulta com anuência no Meu INSS'
   and not exists (select 1 from public.roteiro_passos p where p.roteiro_id = r.id);

insert into public.roteiro_objecoes (roteiro_id, ordem, objecao, resposta, proibido)
select r.id, v.ordem, v.objecao, v.resposta, v.proibido
  from public.roteiros r
  join (values
    (1, '“Já contratei, não preciso.”',
     '“Ótimo, então não vou oferecer nada. Posso só confirmar se o desconto que aparece no seu extrato do INSS é nosso ou de outro banco? Se for de outro, a portabilidade é feita no app, não por telefone.”',
     'não insistir com “dá para baixar a parcela”; não propor “troca” fora da portabilidade formal (o banco de origem tem 20 dias para liberar)'),
    (2, '“É golpe. Não confio em ligação.”',
     '“Faz sentido desconfiar — desde 2026 o benefício fica bloqueado justamente para isso. Nada é fechado por telefone: a senhora abre o app Meu INSS, entra em Consignado e vê a proposta pendente; valida com a sua biometria. Se não estiver lá, não existe.”',
     'não pedir senha, código de app, selfie “para confirmar”; não dizer que é obrigatório para manter o benefício'),
    (3, '“Quero um valor maior / só mais um pouquinho.”',
     '“O limite é a margem consignável: 40% do benefício, e as parcelas que já são descontadas entram nessa conta. Eu posso registrar a proposta dentro do que o sistema libera — e é o INSS que confirma, não eu.”',
     'não inventar “margem extra”, não embutir seguro prestamista (é vedado), não simular valor que o sistema não aprovou'),
    (4, '“Fala com meu filho / sou curador.”',
     '“Combinado, eu ligo quando o senhor estiver com a pessoa. A contratação tem de ser feita pelo titular no app; por isso eu não fecho nada por procuração.”',
     'contratação por procuração é vedada pela Lei 15.327/2026; curatela/tutela só com alvará judicial'),
    (5, '“Me manda tudo no WhatsApp.”',
     '“Mando o endereço do app Meu INSS para a senhora conferir a proposta lá. O que não posso é fechar por mensagem: a validação é a sua biometria dentro do app.”',
     'não enviar contrato, boleto, link de pagamento nem chave PIX; WhatsApp só para apontar o app oficial')
  ) as v(ordem, objecao, resposta, proibido) on true
 where r.nome = 'INSS — consulta com anuência no Meu INSS'
   and not exists (select 1 from public.roteiro_objecoes o where o.roteiro_id = r.id);

-- variante BPC/LOAS: muda a margem e o tom (BPC não é pensão por morte nem contribuição)
insert into public.roteiros (nome, publico, aviso_compliance)
select 'BPC/LOAS — margem 35%, mesma regra de anuência', 'bpc_loas',
 'PROIBIDO: fechar por telefone; embutir seguro prestamista; dizer que o BPC pode ser penhorado (não pode).' ||
 ' LIMITES: margem 35% do benefício assistencial; anuência biométrica no Meu INSS em até 5 dias; a revisão bienal do BPC não é motivo para antecipar ou condicionar a proposta.'
 where not exists (select 1 from public.roteiros where nome = 'BPC/LOAS — margem 35%, mesma regra de anuência');

insert into public.roteiro_passos (roteiro_id, ordem, titulo, texto, obrigatorio)
select r.id, v.ordem, v.titulo, v.texto, v.obrigatorio
  from public.roteiros r
  join (values
    (1, 'ABERTURA — só informação',
     'Confirmar que fala com o titular do BPC, dizer que a ligação é de informação sobre a margem de 35% e pedir licença. Negou a autorização: encerrar com educação e registrar opt-out.', true),
    (2, 'COMO A CONTRATAÇÃO ACONTECE',
     'Repetir a regra do INSS: proposta registrada por nós aparece no Meu INSS como pendente de confirmação e só vira desconto depois da biometria do titular, em até 5 dias.', true),
    (3, 'QUALIFICAÇÃO',
     'Margem disponível, contratos ativos, finalidade. No BPC, reforçar que o benefício assistencial não é penhorável e que a revisão bienal não cancela o contrato já descontado.', true),
    (4, 'ENCERRAMENTO E REGISTRO',
     'Combinar retorno, não prometer valor, registrar a disposição no painel.', true)
  ) as v(ordem, titulo, texto, obrigatorio) on true
 where r.nome = 'BPC/LOAS — margem 35%, mesma regra de anuência'
   and not exists (select 1 from public.roteiro_passos p
                     where p.roteiro_id = (select id from public.roteiros
                                            where nome = 'BPC/LOAS — margem 35%, mesma regra de anuência'));

-- 4c) amarrar o roteiro na campanha: sem isto o operador recebe só o script_resumo
update public.campanhas c
   set roteiro_id = r.id
  from public.roteiros r
 where c.nome = 'INSS - margem disponível' and c.roteiro_id is null
   and r.nome = 'INSS — consulta com anuência no Meu INSS';

-- -------------------------------------------------------------- 4d. empresa (o dono)
-- Uma linha só: é o cadastro da SUA empresa. As telas de painel, relatório e
-- abertura de ligação leem daqui em vez de cada uma ter um texto escrito à mão.
insert into empresas (nome, cnpj, telefone, email, responsavel_lgpd, aviso_gravacao,
                     janela_ini, janela_fim)
values ('Sua Financeira Crédito Consignado', '00000000000191', '+55 79 3000-0000',
        'dpo@suafinanceira.com.br', 'Encarregado: Maria (dpo@suafinanceira.com.br)',
        'A ligação pode ser registrada para controle de qualidade.',
        '09:00', '18:00')
on conflict do nothing;

update campanhas c set empresa_id = (select id from empresas order by criado_em limit 1),
                       meta_diaria = 28
 where c.nome = 'INSS - margem disponível';

-- cadência por qualificação: é o que faz 'ocupado' e 'número inexistente'
-- pararem de voltar no mesmo ritmo (o default antigo de 4 h para tudo)
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'ocupado'::cdr_disposition, 'repetir', 5400, null, null, 5,
       '1h30: quem estava ocupado costuma atender na segunda tentativa'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'secretaria'::cdr_disposition, 'repetir', 86400, '10:00'::time, null, 0,
       'amanhã às 10h, antes do expediente pesar'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'nao_atendeu'::cdr_disposition, 'repetir', 43200, '14:00'::time, 4, 0,
       'duas janelas por dia, tarde'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'numero_invalido'::cdr_disposition, 'descartar', 60, null, 1, -50,
       'sai da fila viva; o número volta para Higienização, não para discagem'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;
insert into politica_rediscagem (campanha_id, disposition, acao, intervalo_s, hora_alvo,
                                 max_tentativas, prioridade_delta, observacao)
select id, 'whatsapp'::cdr_disposition, 'repetir', 300, null, null, 10,
       'pediu WhatsApp: tenta de novo logo, o lead esfria em minutos'
  from campanhas where nome = 'INSS - margem disponível'
on conflict do nothing;

-- tabulação obrigatória: sem isto, "qualificado" é a nota que o operador digitou
update campanhas set formulario = '[
  {"chave":"titular_confirmado","rotulo":"Titular confirmou os próprios dados?","tipo":"sim_nao","obrigatorio":true},
  {"chave":"margem_informada","rotulo":"Margem que o cliente confirma (R$)","tipo":"numero","obrigatorio":true},
  {"chave":"banco_consignacao","rotulo":"Banco onde recebe o benefício","tipo":"texto","obrigatorio":true},
  {"chave":"interesse","rotulo":"Grau de interesse","tipo":"selecao","opcoes":["alto","medio","baixo"],"obrigatorio":true},
  {"chave":"autorizacao_gravacao","rotulo":"Aceita que a ligação seja registrada?","tipo":"sim_nao","obrigatorio":false}
]'::jsonb
 where nome = 'INSS - margem disponível';

-- exemplo de tarefa do CRM (o que diferencia discador de CRM é isto existir)
insert into tarefas (lead_id, agente_id, criada_por, tipo, titulo, detalhe, vence_em)
select l.id, (select id from agentes where email = 'joao@suafinanceira.com.br'),
       (select id from agentes where email = 'maria@suafinanceira.com.br'),
       'anuencia', 'Cobrar biometria no Meu INSS',
       'Proposta enviada ontem; o desconto só aparece depois da confirmação facial.',
       now() + interval '1 day'
  from leads l
 where l.nome = 'Rosana Roteiro'
   and not exists (select 1 from tarefas t where t.lead_id = l.id)
 on conflict do nothing;

-- 5) sanidade: a fila vê os 3 leads?
select count(*) as na_fila from public.v_fila;

-- 6) simule a discagem sem o agente (deve devolver 1 linha com job_id)
select * from public.fn_claim_next_lead(null);

-- 7) feche o job (substitua o uuid pelo job_id retornado acima)
-- select public.fn_finish_call('00000000-0000-0000-0000-000000000000', 'atendeu', 74, 'pediu proposta de 8000 em 36x');

-- 8) opt-out vale para todos os leads daquele número
select public.fn_register_optout('+5579999990003', 'nao_me_perturbe', 'teste de opt-out');
select count(*) as deve_ser_2 from public.v_fila;

-- 9) quando o painel e o agente estiverem no ar, o e-mail acima precisa virar login real.
--    Opcional (multi-tenant depois): criar org_id em campanhas/leads e fechar as policies por org.
