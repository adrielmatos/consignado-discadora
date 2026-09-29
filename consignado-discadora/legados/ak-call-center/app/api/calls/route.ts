import {NextResponse} from "next/server";
import {z} from "zod";
import {createServerSupabaseClient} from "@/lib/supabase/server";

const schema=z.object({
  lead_id:z.string().uuid(),
  telefone_id:z.string().uuid().optional(),
  campanha_id:z.string().uuid().optional(),
  inicio:z.string().datetime().optional(),
  fim:z.string().datetime().optional(),
  resultado:z.string().trim().min(1).max(80),
  observacao:z.string().trim().max(2000).optional(),
  consentimento:z.boolean().optional(),
  consentimento_tipo:z.string().trim().max(80).optional()
}).strict();

function brasilHour(iso:string){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
  return Number(parts.find(p=>p.type==="hour")?.value??-1);
}

export async function POST(request:Request){
  const requestId=request.headers.get("x-request-id")||crypto.randomUUID();
  const supabase=await createServerSupabaseClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:{code:"unauthenticated",message:"Authentication required"}},{status:401,headers:{"x-request-id":requestId}});

  let body:unknown;
  try{body=await request.json();}catch{
    return NextResponse.json({error:{code:"invalid_json",message:"JSON inválido"}},{status:400,headers:{"x-request-id":requestId}});
  }
  const parsed=schema.safeParse(body);
  if(!parsed.success){
    return NextResponse.json({error:{code:"validation_error",message:"Dados inválidos",details:parsed.error.flatten()}},{status:422,headers:{"x-request-id":requestId}});
  }
  const input=parsed.data;
  const inicio=input.inicio||new Date().toISOString();
  const fim=input.fim||inicio;
  if(!Number.isFinite(new Date(inicio).getTime())||!Number.isFinite(new Date(fim).getTime())){
    return NextResponse.json({error:{code:"invalid_datetime",message:"Data/hora inválida"}},{status:422,headers:{"x-request-id":requestId}});
  }
  const hour=brasilHour(inicio);
  if(hour<8||hour>21){
    return NextResponse.json({error:{code:"calling_window_closed",message:"Chamadas permitidas somente das 08:00 às 21:00 (horário de Brasília)."}},{status:422,headers:{"x-request-id":requestId}});
  }

  const {data:operator,error:oe}=await supabase.from("operadores").select("id,ativo").eq("auth_user_id",user.id).maybeSingle();
  if(oe||!operator?.ativo)return NextResponse.json({error:{code:"operator_not_allowed",message:"Operador ativo não encontrado."}},{status:403,headers:{"x-request-id":requestId}});

  const {data:lead,error:le}=await supabase.from("leads").select("id,bloqueado,opt_out").eq("id",input.lead_id).maybeSingle();
  if(le)return NextResponse.json({error:{code:"lead_lookup_failed",message:le.message}},{status:400,headers:{"x-request-id":requestId}});
  if(!lead)return NextResponse.json({error:{code:"lead_not_found",message:"Lead não encontrado."}},{status:404,headers:{"x-request-id":requestId}});
  if(lead.bloqueado||lead.opt_out)return NextResponse.json({error:{code:"lead_blocked",message:"Lead bloqueado para contato."}},{status:409,headers:{"x-request-id":requestId}});

  const {data:call,error:ce}=await supabase.from("ligacoes").insert({
    lead_id:input.lead_id,telefone_id:input.telefone_id||null,campanha_id:input.campanha_id||null,
    operador_id:operator.id,inicio,fim,resultado:input.resultado,observacao:input.observacao||null
  }).select("*").single();
  if(ce)return NextResponse.json({error:{code:"call_create_failed",message:ce.message}},{status:400,headers:{"x-request-id":requestId}});

  if(input.consentimento!==undefined){
    await supabase.from("consent_logs").insert({
      user_id:user.id,operator_id:operator.id,lead_id:input.lead_id,
      consent_type:input.consentimento_tipo||"contato",
      granted:input.consentimento,source:"call_api",request_id:requestId
    });
  }
  await supabase.from("audit_logs").insert({
    actor_user_id:user.id,operator_id:operator.id,action:"call.created",
    resource:"ligacoes",resource_id:call.id,request_id:requestId,
    metadata:{resultado:input.resultado,lead_id:input.lead_id}
  });

  return NextResponse.json({data:call},{status:201,headers:{"x-request-id":requestId,"cache-control":"no-store"}});
}
