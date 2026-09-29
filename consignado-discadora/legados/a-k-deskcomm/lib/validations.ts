import { z } from "zod";

export const emailSchema=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
export const passwordSchema=z.string().min(8).max(128);
export const idSchema=z.string().uuid();
export const phoneSchema=z.string().trim().min(8).max(32).regex(/^[0-9+() .-]+$/);
export const createLeadSchema=z.object({
  name:z.string().trim().min(2).max(160),
  phone:phoneSchema,
  product:z.string().trim().min(1).max(80),
  stage:z.enum(["Novo","Contato","Proposta","Negociação","Fechado","Perdido"]).default("Novo"),
  owner_id:idSchema.nullable().optional(),
  notes:z.string().trim().max(5000).optional()
}).strict();
export const updateLeadSchema=z.object({
  id:idSchema,
  stage:z.enum(["Novo","Contato","Proposta","Negociação","Fechado","Perdido"]).optional(),
  blocked:z.boolean().optional(),
  owner_id:idSchema.nullable().optional(),
  notes:z.string().trim().max(5000).optional()
}).strict();
export const messageSchema=z.object({conversation_id:idSchema,text:z.string().trim().min(1).max(10000)}).strict();
export const followupSchema=z.object({lead_id:idSchema,title:z.string().trim().min(2).max(200),due_at:z.string().datetime(),notes:z.string().trim().max(2000).optional()}).strict();
export const callSchema=z.object({lead_id:idSchema.nullable().optional(),phone:phoneSchema,result:z.enum(["Atendeu","Não atendeu","Retornar","Ocupado","Número inválido"]).default("Não atendeu"),duration_seconds:z.number().int().min(0).max(86400)}).strict();
export const quickReplySchema=z.object({name:z.string().trim().min(2).max(80),body:z.string().trim().min(1).max(5000)}).strict();
export const campaignSchema=z.object({name:z.string().trim().min(2).max(120),product:z.string().trim().max(80).optional()}).strict();
export const automationSchema=z.object({name:z.string().trim().min(2).max(120),trigger:z.string().trim().min(2).max(80),action:z.string().trim().min(2).max(200)}).strict();
export const authSchema=z.object({email:emailSchema,password:passwordSchema}).strict();
