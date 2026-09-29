import { z } from "zod";

export const emailSchema=z.string().trim().email().max(254);
export const passwordSchema=z.string().min(8).max(128);
export const idSchema=z.string().uuid();

export const createLeadSchema=z.object({
 nome:z.string().trim().min(2).max(160),
 cpf:z.string().regex(/^\d{11}$/).optional().or(z.literal("")),
 cidade:z.string().trim().max(120).optional(),
 uf:z.string().trim().length(2).toUpperCase().optional(),
 produto:z.string().trim().max(120).optional(),
 telefone:z.string().regex(/^\d{10,13}$/).optional().or(z.literal(""))
}).strict();

export const returnSchema=z.object({
 lead_id:idSchema,
 data_hora:z.string().datetime(),
 observacao:z.string().trim().max(1000).optional().or(z.literal(""))
}).strict();

export const proposalSchema=z.object({
 lead_id:idSchema,
 produto:z.string().trim().min(1).max(120),
 valor:z.number().nonnegative().max(100000000),
 status:z.enum(["aberta","enviada","aprovada","recusada","cancelada"])
}).strict();

export const automationSchema=z.object({
 evento:z.enum(["ligacao_resultado","retorno_criado","proposta_criada","mensagem_registrada"]),
 ativa:z.boolean(),
 condicoes:z.record(z.string(),z.string()).default({}),
 acoes:z.array(z.record(z.string(),z.unknown())).max(10).default([])
}).strict();
