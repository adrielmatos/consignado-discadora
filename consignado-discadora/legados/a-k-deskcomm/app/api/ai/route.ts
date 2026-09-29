import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { runDeskcommAI, modelAllowed } from "@/lib/ai-gateway";

export const runtime="nodejs";
export const maxDuration=30;

function fail(message:string,status=400){return NextResponse.json({error:message},{status,headers:{"Cache-Control":"private, no-store"}});}
function sameOrigin(req:Request){const origin=req.headers.get("origin");if(!origin)return true;try{return new URL(origin).origin===new URL(req.url).origin}catch{return false}}

export async function POST(req:Request){
  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const rl=await rateLimit("ai:"+ip); if(!rl.ok)return fail("Limite de requisições de IA atingido. Tente novamente em instantes.",429);
  if(!sameOrigin(req))return fail("Origem não autorizada.",403);
  const supabase=await createClient();
  const {data:claims,error}=await supabase.auth.getClaims();
  const userId=claims?.claims?.sub;
  if(error||!userId)return fail("Sessão necessária.",401);
  const {data:member}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",userId).eq("status","active").limit(1).maybeSingle();
  if(!member)return fail("Organização não encontrada.",403);
  const body=await req.json().catch(()=>null);
  const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
  const model=typeof body?.model==="string"?body.model:"openai/gpt-5.6-luna";
  if(prompt.length<2||prompt.length>12000)return fail("Prompt inválido.");
  if(!modelAllowed(model))return fail("Modelo não permitido.");
  try{
    const result=await runDeskcommAI({model,prompt,system:typeof body?.system==="string"?body.system.slice(0,4000):undefined,userId});
    await supabase.from("audit_logs").insert({
      organization_id:member.organization_id,
      actor_id:userId,
      action:"ai.generate",
      resource_type:"ai_gateway",
      outcome:"success",
      metadata:{model,feature:"crm-ai",usage:result.usage},
    });
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"Falha no provedor de IA.";
    await supabase.from("audit_logs").insert({
      organization_id:member.organization_id,
      actor_id:userId,
      action:"ai.generate",
      resource_type:"ai_gateway",
      outcome:"error",
      metadata:{model,feature:"crm-ai",error:message.slice(0,300)},
    });
    return fail("A IA não está disponível neste momento. Verifique a configuração do AI Gateway/chave do provedor.",502);
  }
}
