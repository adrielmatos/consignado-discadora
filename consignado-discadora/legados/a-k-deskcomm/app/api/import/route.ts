import { NextResponse } from "next/server";
import * as XLSX from "@keep-lts/xlsx";
import { createClient } from "@/lib/supabase/server";

export const runtime="nodejs";
export const maxDuration=60;
const MAX_FILE_BYTES=10*1024*1024;
const MAX_TOTAL_BYTES=40*1024*1024;
const MAX_FILES=20;
const MAX_ROWS_PER_FILE=5000;
const allowed=new Set([".csv",".xls",".xlsx",".ods"]);
const norm=(v:unknown)=>String(v??"").trim();
const key=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
async function auth(){const supabase=await createClient();const {data,error}=await supabase.auth.getClaims();const userId=data?.claims?.sub;if(error||!userId)return {supabase,userId:null,orgId:null};const {data:member}=await supabase.from("organization_members").select("organization_id").eq("user_id",userId).eq("status","active").limit(1).maybeSingle();return {supabase,userId,orgId:member?.organization_id??null};}
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}})}
export async function POST(req:Request){
 const origin=req.headers.get("origin");if(origin){try{if(new URL(origin).origin!==new URL(req.url).origin)return json({error:"Origem não autorizada"},403)}catch{return json({error:"Origem inválida"},403)}}
 const {supabase,userId,orgId}=await auth();if(!userId||!orgId)return json({error:"Sessão/organização necessária"},401);
 const form=await req.formData();const files=form.getAll("files").filter((x):x is File=>x instanceof File);const legacy=form.get("file");if(!files.length&&legacy instanceof File)files.push(legacy);
 if(!files.length)return json({error:"Selecione pelo menos uma planilha"},400);if(files.length>MAX_FILES)return json({error:"Máximo de "+MAX_FILES+" planilhas por importação"},400);
 const total=files.reduce((n,f)=>n+f.size,0);if(total>MAX_TOTAL_BYTES)return json({error:"O tamanho total das planilhas excede 40 MB"},400);
 const results:{file:string;read:number;imported:number;skipped:number;error?:string}[]=[];let totalImported=0,totalRead=0,totalSkipped=0;
 for(const file of files){let imported=0,read=0,skipped=0;try{
   const ext="."+file.name.toLowerCase().split(".").pop();if(!allowed.has(ext)||file.size>MAX_FILE_BYTES)throw new Error("Formato ou tamanho inválido (máx. 10 MB por arquivo)");
   const wb=XLSX.read(Buffer.from(await file.arrayBuffer()),{type:"buffer",cellFormula:false,cellHTML:false,cellDates:true,WTF:false});
   const rawRows:Record<string,unknown>[]=[];
   for(const sheetName of wb.SheetNames){
     const sheet=wb.Sheets[sheetName];
     if(!sheet)continue;
     const remaining=MAX_ROWS_PER_FILE-rawRows.length;
     if(remaining<=0)break;
     const sheetRows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:"",raw:false}).slice(0,remaining);
     rawRows.push(...sheetRows);
   }
   read=rawRows.length;if(!read)throw new Error("Nenhuma linha encontrada");
   const rows=rawRows.map(raw=>{const r:Record<string,string>={};for(const[k,v]of Object.entries(raw))r[key(k)]=norm(v);return r;}).map(r=>({name:r.nome||r.name||r.cliente||r.contato,phone:r.telefone||r.phone||r.celular||r.whatsapp,product:r.produto||r.product||"Não informado",cpf:r.cpf||null,email:r.email||null,notes:r.observacoes||r.observacoes_cliente||r.notes||null})).filter(r=>r.name&&r.phone&&r.phone.length<=32);
   skipped=read-rows.length;
   const phones=[...new Set(rows.map(r=>r.phone))];
   const blockedSet=new Set<string>();
   for(let i=0;i<phones.length;i+=500){const {data}=await supabase.from("blocked_numbers").select("phone").eq("organization_id",orgId).in("phone",phones.slice(i,i+500));(data||[]).forEach(x=>blockedSet.add(x.phone));}
   const allowedRows=rows.filter(r=>!blockedSet.has(r.phone));skipped+=rows.length-allowedRows.length;
   for(let i=0;i<allowedRows.length;i+=500){
     const chunk=allowedRows.slice(i,i+500);
     const contactsByPhone=new Map<string,typeof chunk[number]>();for(const row of chunk)contactsByPhone.set(row.phone,row);
     const c=await supabase.from("contacts").upsert([...contactsByPhone.values()].map(r=>({organization_id:orgId,name:r.name,phone:r.phone,cpf:r.cpf,email:r.email,notes:r.notes,source:"importacao"})),{onConflict:"organization_id,phone"}).select("id,phone");if(c.error)throw new Error("Falha ao salvar clientes");
     const ids=new Map((c.data||[]).map(x=>[x.phone,x.id]));
     const inserts=chunk.map(r=>({organization_id:orgId,contact_id:ids.get(r.phone)!,product:r.product}));
     if(inserts.length){const l=await supabase.from("leads").insert(inserts);if(l.error)throw new Error("Falha ao salvar leads");imported+=inserts.length;}
   }
   await supabase.from("import_jobs").insert({organization_id:orgId,file_name:file.name,row_count:imported,status:"completed",created_by:userId});
  }catch(e){const message=e instanceof Error?e.message:"Arquivo não pôde ser processado";await supabase.from("import_jobs").insert({organization_id:orgId,file_name:file.name,row_count:imported,status:"failed",error_message:message,created_by:userId});results.push({file:file.name,read,imported,skipped,error:message});totalRead+=read;totalImported+=imported;totalSkipped+=skipped;continue;}
  results.push({file:file.name,read,imported,skipped});totalRead+=read;totalImported+=imported;totalSkipped+=skipped;
 }
 return json({ok:results.every(x=>!x.error),files:results,read:totalRead,imported:totalImported,skipped:totalSkipped});
}
