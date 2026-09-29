import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll:()=>request.cookies.getAll(), setAll:(items)=>items.forEach(({name,value,options})=>{request.cookies.set(name,value);response.cookies.set(name,value,options);}) } });
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));
  return response;
}
export const config={matcher:['/dashboard/:path*','/operacao/:path*','/crm/:path*','/leads/:path*','/inbox/:path*','/resultados/:path*','/campanhas/:path*','/retornos/:path*','/telefonia/:path*','/relatorios/:path*','/npo/:path*','/auditoria/:path*','/automacoes/:path*','/configuracoes/:path*','/api/call/complete']};
