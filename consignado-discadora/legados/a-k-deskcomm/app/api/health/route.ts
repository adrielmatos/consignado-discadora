import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=10;
export async function GET(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getClaims();
  if(error||!data?.claims?.sub)return NextResponse.json({ok:false,error:"Sessão necessária"},{status:401,headers:{"Cache-Control":"private, no-store, no-cache"}});
  const {error:dbError}=await supabase.from("organizations").select("id").limit(1);
  if(dbError)return NextResponse.json({ok:false,error:"Banco indisponível"},{status:503,headers:{"Cache-Control":"private, no-store, no-cache"}});
  return NextResponse.json({ok:true,service:"ak-deskcomm",database:"ok"},{headers:{"Cache-Control":"private, no-store, no-cache"}});
}
