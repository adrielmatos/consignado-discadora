import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const form = await req.formData(); const leadId = String(form.get('lead_id') || ''); const status = String(form.get('status') || 'FINALIZADO'); const schedule = form.get('agendamento'); const file = form.get('file');
    if (!leadId) return NextResponse.json({ error: 'ID do Lead é obrigatório' }, { status: 400 });
    let transcript = ''; let analysis = { resumo:'Atendimento registrado sem áudio anexado.', sentimento:'NEUTRO', nota_qualidade:100, objecao_detectada:'Nenhuma' };
    if (file instanceof File && file.size > 0) {
      if (!['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/m4a'].includes(file.type) && !/\.(mp3|wav|m4a)$/i.test(file.name)) return NextResponse.json({error:'Formato de áudio não permitido'},{status:400});
      const t = await openai.audio.transcriptions.create({ file, model:'whisper-1', language:'pt' }); transcript=t.text;
      const c = await openai.chat.completions.create({ model:'gpt-4o-mini', messages:[{role:'system',content:'Analise uma ligação de crédito consignado. Retorne somente JSON com resumo, sentimento (POSITIVO|NEUTRO|NEGATIVO), nota_qualidade (0-100) e objecao_detectada.'},{role:'user',content:transcript}], response_format:{type:'json_object'} });
      analysis={...analysis,...JSON.parse(c.choices[0].message.content||'{}')};
    }
    const { data: lead, error: leadError } = await supabase.from('leads').select('id').eq('id',leadId).single(); if(leadError||!lead)return NextResponse.json({error:'Lead não encontrado ou sem acesso'},{status:404});
    const { error: historyError } = await supabase.from('historico_chamadas').insert({lead_id:leadId,operador_id:user.id,tipo_telefonia:'PHONE_LINK',transcricao_texto:transcript,resumo_ia:analysis.resumo,sentimento:analysis.sentimento,nota_qualidade:analysis.nota_qualidade,objecao_detectada:analysis.objecao_detectada}); if(historyError)throw historyError;
    const { error:updateError } = await supabase.from('leads').update({status,agendamento_retorno:schedule?new Date(String(schedule)).toISOString():null,updated_at:new Date().toISOString(),operador_id:user.id}).eq('id',leadId); if(updateError)throw updateError;
    const { data: next } = await supabase.from('leads').select('*').eq('status','DISPONIVEL').order('created_at',{ascending:true}).limit(1).maybeSingle();
    let proximoLead=next||null; if(proximoLead){const {data:claimed}=await supabase.from('leads').update({status:'EM_ATENDIMENTO',operador_id:user.id}).eq('id',proximoLead.id).is('operador_id',null).eq('status','DISPONIVEL').select().maybeSingle();proximoLead=claimed||null;}
    return NextResponse.json({success:true,proximoLead,analiseIA:analysis});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Erro interno'},{status:500}); }
}
