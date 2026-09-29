import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request:NextRequest){
  let response=NextResponse.next({request});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://fxwejuwxsnaoqmtwjlxu.supabase.co";
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"sb_publishable_dpcOfTFvmkvgBwZSspp4Ig_9sD_XdlP";
  if(!url||!key) return response;
  const supabase=createServerClient(url,key,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:(cookiesToSet,headers)=>{
      cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
      response=NextResponse.next({request});
      cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      Object.entries(headers||{}).forEach(([k,v])=>response.headers.set(k,v));
    }
  }});
  const {data}=await supabase.auth.getClaims();
  const path=request.nextUrl.pathname;
  const publicPath=path==="/login"||path.startsWith("/auth")||path.startsWith("/_next")||path==="/favicon.ico";
  if(!data?.claims && !publicPath){
    const login=request.nextUrl.clone(); login.pathname="/login"; login.searchParams.set("next",path);
    return NextResponse.redirect(login);
  }
  return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)"]};