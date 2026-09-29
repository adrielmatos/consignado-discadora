import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { createLeadSchema, updateLeadSchema, messageSchema, followupSchema, callSchema, quickReplySchema, campaignSchema, automationSchema } from "@/lib/validations";

export const runtime="nodejs";
export const maxDuration=10;

const PRODUCTS=["INSS","Público","Privado","Cartão consignado","Cartão benefício","Crédito pessoal","Seguro médico","Seguro residencial","Seguro funeral","Energia solar","FGTS","Crédito do Trabalhador/CLT","SIAPE","Militar"];

function sameOrigin(req:Request){const origin=req.headers.get("origin");if(!origin)return true;try{return new URL(origin).origin===new URL(req.url).origin}catch{return false}}
function fail(message="Operação não autorizada",status=400){return NextResponse.json({error:message},{status,headers:{"Cache-Control":"private, no-store, no-cache,max-age=0"}});}
async function auth(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getClaims();
  const userId=data?.claims?.sub;
  if(error||!userId) return {supabase,userId:null,orgId:null,role:null};
  const {data:member}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",userId).eq("status","active").limit(1).maybeSingle();
  if(member) return {supabase,userId,orgId:member.organization_id,role:member.role};
  const name="A&K Soluções Financeiras";
  const slug="ak-solucoes-financeiras";
  const org=await supabase.from("organizations").insert({name,slug,created_by:userId}).select("id").single();
  if(org.error) return {supabase,userId,orgId:null,role:null};
  const m=await supabase.from("organization_members").insert({organization_id:org.data.id,user_id:userId,role:"owner"}).select("organization_id,role").single();
  if(m.error) return {supabase,userId,orgId:null,role:null};
  return {supabase,userId,orgId:org.data.id,role:"owner"};
}
async function audit(supabase:Awaited<ReturnType<typeof createClient>>,orgId:string,userId:string,action:string,type:string,id?:string,metadata:Record<string,unknown>={}){if(!orgId||!userId)return;await supabase.from("audit_logs").insert({organization_id:orgId,actor_id:userId,action,resource_type:type,resource_id:id||null,metadata});}

export async function GET(req:Request){
  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const rl=await rateLimit("read:"+ip); if(!rl.ok)return fail("Muitas requisições",429);
  const {supabase,userId,orgId,role}=await auth(); if(!userId||!orgId)return fail("Sessão necessária",401);
  const url=new URL(req.url); const resource=url.searchParams.get("resource")||"dashboard";
  if(resource==="dashboard"){
    const [leads,convs,followups,calls]=await Promise.all([
      supabase.from("leads").select("id,product,stage,priority,created_at,contact:contacts(id,name,phone,blocked,blocked_reason,npd)").order("created_at",{ascending:false}).limit(5000),
      supabase.from("conversations").select("id,channel,status,last_message_at,contact:contacts(id,name,phone)").order("last_message_at",{ascending:false,nullsFirst:false}).limit(50),
      supabase.from("followups").select("id,title,due_at,status,lead_id").eq("status","open").order("due_at").limit(50),
      supabase.from("call_logs").select("id,phone,result,duration_seconds,created_at,lead_id").order("created_at",{ascending:false}).limit(50)
    ]);
    return NextResponse.json({organizationId:orgId,role,products:PRODUCTS,leads:leads.data||[],conversations:convs.data||[],followups:followups.data||[],calls:calls.data||[]});
  }
  if(resource==="messages"){
    const id=url.searchParams.get("conversation_id"); if(!id)return fail("conversation_id obrigatório");
    const {data:conv}=await supabase.from("conversations").select("id").eq("id",id).eq("organization_id",orgId).maybeSingle(); if(!conv)return fail("Conversa não encontrada",404);
    const {data,error}=await supabase.from("messages").select("id,direction,body,created_at,sender_user_id").eq("conversation_id",id).order("created_at").limit(200);
    if(error)return fail("Falha ao carregar mensagens",500); return NextResponse.json({messages:data||[]});
  }
  if(resource==="team"){
    const {data,error}=await supabase.from("organization_members").select("id,user_id,role,status,created_at").eq("organization_id",orgId).order("created_at");
    if(error)return fail("Falha ao carregar equipe",500); return NextResponse.json({team:data||[]});
  }
  if(resource==="audit"){
    const {data,error}=await supabase.from("audit_logs").select("id,actor_id,action,resource_type,resource_id,outcome,metadata,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(200);
    if(error)return fail("Falha ao carregar auditoria",500); return NextResponse.json({audit:data||[]});
  }
  if(resource==="contacts"){
    const {data,error}=await supabase.from("contacts").select("id,name,phone,email,cpf,blocked,blocked_reason,npd,source,notes,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(500);
    if(error)return fail("Falha ao carregar clientes",500); return NextResponse.json({contacts:data||[]});
  }
  if(resource==="import_jobs"){
    const {data,error}=await supabase.from("import_jobs").select("id,file_name,row_count,status,error_message,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(100);
    if(error)return fail("Falha ao carregar importações",500); return NextResponse.json({importJobs:data||[]});
  }
  if(resource==="followups"){
    const {data,error}=await supabase.from("followups").select("id,title,due_at,status,notes,lead_id,assigned_to,lead:leads(id,product,stage,contact:contacts(id,name,phone))").eq("organization_id",orgId).order("due_at",{ascending:true}).limit(200);
    if(error)return fail("Falha ao carregar follow-ups",500); return NextResponse.json({followups:data||[]});
  }
  if(resource==="calls"){
    const {data,error}=await supabase.from("call_logs").select("id,phone,result,duration_seconds,created_at,lead_id").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(200);
    if(error)return fail("Falha ao carregar ligações",500); return NextResponse.json({calls:data||[]});
  }
  if(resource==="ai_agents"){
    const {data,error}=await supabase.from("ai_agents").select("id,name,provider,model,enabled,budget_cents,created_at").eq("organization_id",orgId).order("created_at",{ascending:false});
    if(error)return fail("Falha ao carregar agentes",500); return NextResponse.json({agents:data||[]});
  }
  if(resource==="ai_skills"){
    const {data,error}=await supabase.from("ai_skills").select("id,name,description,enabled,created_at").eq("organization_id",orgId).order("created_at",{ascending:false});
    if(error)return fail("Falha ao carregar skills",500); return NextResponse.json({skills:data||[]});
  }
  if(resource==="import_jobs"){
    const {data,error}=await supabase.from("import_jobs").select("id,file_name,row_count,status,error_message,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(100);
    if(error)return fail("Falha ao carregar importações",500); return NextResponse.json({importJobs:data||[]});
  }
  if(resource==="quick_replies"){
    const {data,error}=await supabase.from("quick_replies").select("id,name,body,created_at").eq("organization_id",orgId).order("created_at");
    if(error)return fail("Falha ao carregar respostas",500); return NextResponse.json({quickReplies:data||[]});
  }
  if(resource==="campaigns"){
    const {data,error}=await supabase.from("campaigns").select("id,name,product,status,created_at").eq("organization_id",orgId).order("created_at",{ascending:false});
    if(error)return fail("Falha ao carregar campanhas",500); return NextResponse.json({campaigns:data||[]});
  }
  if(resource==="automations"){
    const {data,error}=await supabase.from("automation_rules").select("id,name,trigger_name,action_name,enabled,created_at").eq("organization_id",orgId).order("created_at",{ascending:false});
    if(error)return fail("Falha ao carregar automações",500); return NextResponse.json({automations:data||[]});
  }
  return fail("Recurso inválido");
}

export async function POST(req:Request){
  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const rl=await rateLimit("write:"+ip); if(!rl.ok)return fail("Muitas requisições",429);
  if(!sameOrigin(req))return fail("Origem não autorizada",403);
  const {supabase,userId,orgId}=await auth(); if(!userId||!orgId)return fail("Sessão necessária",401);
  const body=await req.json().catch(()=>null); if(!body||typeof body!=="object")return fail("JSON inválido");
  const resource=typeof body.resource==="string"?body.resource:"";
  try{
    if(resource==="conversation"){
      const contactId=String(body.data?.contact_id||"");
      const channel=String(body.data?.channel||"internal");
      if(!contactId||!["whatsapp","instagram","web","internal"].includes(channel))return fail("Conversa inválida");
      const contact=await supabase.from("contacts").select("id,blocked,npd").eq("id",contactId).eq("organization_id",orgId).single();
      if(contact.error||!contact.data)return fail("Cliente não encontrado",404);
      if(contact.data.blocked||contact.data.npd)return fail("Contato bloqueado por Não Ligar/Não Me Perturbe",409);
      const row=await supabase.from("conversations").insert({organization_id:orgId,contact_id:contactId,channel,assigned_to:userId,status:"open",last_message_at:new Date().toISOString()}).select("id").single();
      if(row.error)return fail("Não foi possível abrir conversa",400);
      await audit(supabase,orgId,userId,"conversation.create","conversation",row.data.id,{channel});
      return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="lead"){
      const parsed=createLeadSchema.parse(body.data);
      const contact=await supabase.from("contacts").upsert({organization_id:orgId,name:parsed.name,phone:parsed.phone,notes:parsed.notes||null},{onConflict:"organization_id,phone"}).select("id").single();
      if(contact.error)return fail("Não foi possível criar o cliente",400);
      const lead=await supabase.from("leads").insert({organization_id:orgId,contact_id:contact.data.id,product:parsed.product,stage:parsed.stage,owner_id:parsed.owner_id||userId,notes:parsed.notes||null}).select("id").single();
      if(lead.error)return fail("Não foi possível criar o lead",400);
      await audit(supabase,orgId,userId,"lead.create","lead",lead.data.id,{product:parsed.product});
      return NextResponse.json({ok:true,id:lead.data.id},{status:201});
    }
    if(resource==="contact_update"){
      const id=String(body.data?.id||""); const patch:any={};
      if(typeof body.data?.name==="string")patch.name=body.data.name.trim();
      if(typeof body.data?.email==="string")patch.email=body.data.email.trim()||null;
      if(typeof body.data?.notes==="string")patch.notes=body.data.notes.trim()||null;
      if(!id||!Object.keys(patch).length)return fail("Dados do cliente inválidos");
      const row=await supabase.from("contacts").update(patch).eq("id",id).eq("organization_id",orgId).select("id").single();
      if(row.error)return fail("Cliente não encontrado",404);
      await audit(supabase,orgId,userId,"contact.update","contact",id,{fields:Object.keys(patch)});
      return NextResponse.json({ok:true});
    }
    if(resource==="followup_update"){
      const id=String(body.data?.id||""); const status=String(body.data?.status||"");
      if(!id||!["open","done","cancelled"].includes(status))return fail("Status inválido");
      const row=await supabase.from("followups").update({status}).eq("id",id).eq("organization_id",orgId).select("id").single();
      if(row.error)return fail("Follow-up não encontrado",404);
      await audit(supabase,orgId,userId,"followup.update","followup",id,{status});
      return NextResponse.json({ok:true});
    }
    if(resource==="lead_update"){
      const parsed=updateLeadSchema.parse(body.data);
      const patch={stage:parsed.stage,owner_id:parsed.owner_id,notes:parsed.notes};
      const {data,error}=await supabase.from("leads").update(patch).eq("id",parsed.id).eq("organization_id",orgId).select("id").single();
      if(error||!data)return fail("Lead não encontrado",404);
      await audit(supabase,orgId,userId,"lead.update","lead",parsed.id,patch);
      return NextResponse.json({ok:true});
    }
    if(resource==="message"){
      const parsed=messageSchema.parse(body.data);
      const conv=await supabase.from("conversations").select("id,contact:contacts(blocked,npd)").eq("id",parsed.conversation_id).eq("organization_id",orgId).single();
      if(conv.error||!conv.data)return fail("Conversa não encontrada",404);
      const contact=Array.isArray(conv.data.contact)?conv.data.contact[0]:conv.data.contact;
      if(contact?.blocked||contact?.npd)return fail("Contato bloqueado por Não Ligar/Não Me Perturbe",409);
      const inserted=await supabase.from("messages").insert({organization_id:orgId,conversation_id:parsed.conversation_id,sender_user_id:userId,direction:"outbound",body:parsed.text}).select("id").single();
      if(inserted.error)return fail("Não foi possível registrar a mensagem",400);
      await supabase.from("conversations").update({last_message_at:new Date().toISOString()}).eq("id",parsed.conversation_id).eq("organization_id",orgId);
      await audit(supabase,orgId,userId,"conversation.message","conversation",parsed.conversation_id);
      return NextResponse.json({ok:true,id:inserted.data.id},{status:201});
    }
    if(resource==="followup"){
      const parsed=followupSchema.parse(body.data);
      const row=await supabase.from("followups").insert({organization_id:orgId,lead_id:parsed.lead_id,assigned_to:userId,title:parsed.title,due_at:parsed.due_at,notes:parsed.notes||null}).select("id").single();
      if(row.error)return fail("Não foi possível criar follow-up",400);
      await audit(supabase,orgId,userId,"followup.create","followup",row.data.id); return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="call"){
      const parsed=callSchema.parse(body.data);
      const blocked=await supabase.from("blocked_numbers").select("id").eq("organization_id",orgId).eq("phone",parsed.phone).maybeSingle();
      if(blocked.data)return fail("Número bloqueado: Não Ligar/Não Me Perturbe",409);
      const row=await supabase.from("call_logs").insert({organization_id:orgId,lead_id:parsed.lead_id||null,operator_id:userId,phone:parsed.phone,result:parsed.result,duration_seconds:parsed.duration_seconds,external_id:randomUUID()}).select("id").single();
      if(row.error)return fail("Não foi possível registrar ligação",400);
      await audit(supabase,orgId,userId,"call.create","call_log",row.data.id,{result:parsed.result});
      return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="quick_reply"){
      const parsed=quickReplySchema.parse(body.data);
      const row=await supabase.from("quick_replies").insert({organization_id:orgId,name:parsed.name,body:parsed.body}).select("id").single();
      if(row.error)return fail("Não foi possível criar resposta",400); return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="ai_agent"){
      const name=String(body.data?.name||"").trim(); const model=String(body.data?.model||"").trim();
      if(name.length<2||name.length>120)return fail("Nome do agente inválido");
      const row=await supabase.from("ai_agents").insert({organization_id:orgId,name,model:model||null,enabled:false}).select("id").single();
      if(row.error)return fail("Não foi possível criar agente",400); await audit(supabase,orgId,userId,"ai_agent.create","ai_agent",row.data.id); return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="ai_skill"){
      const name=String(body.data?.name||"").trim();
      if(name.length<2||name.length>120)return fail("Nome da skill inválido");
      const row=await supabase.from("ai_skills").insert({organization_id:orgId,name,description:"",instructions:""}).select("id").single();
      if(row.error)return fail("Não foi possível criar skill",400); await audit(supabase,orgId,userId,"ai_skill.create","ai_skill",row.data.id); return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="campaign_update"){
      const id=String(body.data?.id||""); const status=String(body.data?.status||"");
      if(!id||!["draft","active","paused","finished"].includes(status))return fail("Status de campanha inválido");
      const row=await supabase.from("campaigns").update({status}).eq("id",id).eq("organization_id",orgId).select("id").single();
      if(row.error)return fail("Campanha não encontrada",404); await audit(supabase,orgId,userId,"campaign.update","campaign",id,{status}); return NextResponse.json({ok:true});
    }
    if(resource==="campaign"){
      const parsed=campaignSchema.parse(body.data);
      const row=await supabase.from("campaigns").insert({organization_id:orgId,name:parsed.name,product:parsed.product||null,created_by:userId}).select("id").single();
      if(row.error)return fail("Não foi possível criar campanha",400); return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="automation_toggle"){
      const id=String(body.data?.id||""); const enabled=Boolean(body.data?.enabled);
      if(!id)return fail("Automação inválida");
      const row=await supabase.from("automation_rules").update({enabled}).eq("id",id).eq("organization_id",orgId).select("id").single();
      if(row.error)return fail("Automação não encontrada",404); await audit(supabase,orgId,userId,"automation.update","automation",id,{enabled}); return NextResponse.json({ok:true});
    }
    if(resource==="automation"){
      const parsed=automationSchema.parse(body.data);
      const row=await supabase.from("automation_rules").insert({organization_id:orgId,name:parsed.name,trigger_name:parsed.trigger,action_name:parsed.action}).select("id").single();
      if(row.error)return fail("Não foi possível criar automação",400); return NextResponse.json({ok:true,id:row.data.id},{status:201});
    }
    if(resource==="block"){
      const phone=String(body.data?.phone||"").trim(); const reason=String(body.data?.reason||"nao_ligar");
      if(!/^[0-9+() .-]{8,32}$/.test(phone)||!["nao_ligar","nao_me_perturbe","opt_out"].includes(reason))return fail("Dados de bloqueio inválidos");
      const row=await supabase.from("blocked_numbers").upsert({organization_id:orgId,phone,reason,source:"deskcomm"},{onConflict:"organization_id,phone"}).select("id").single();
      if(row.error)return fail("Não foi possível bloquear",400);
      await supabase.from("contacts").update({blocked:true,blocked_reason:reason,npd:reason==="nao_me_perturbe"}).eq("organization_id",orgId).eq("phone",phone);
      await audit(supabase,orgId,userId,"contact.block","phone",undefined,{reason});
      return NextResponse.json({ok:true});
    }
    return fail("Ação inválida");
  }catch(e){return fail(e instanceof Error&&e.name==="ZodError"?"Dados inválidos":"Falha na operação",400);}
}
