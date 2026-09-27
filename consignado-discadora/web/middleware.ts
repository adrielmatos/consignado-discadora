import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/leads é a porta do webhook de lead: o visitante do site não tem sessão.
// O que protege aquela rota é o token da campanha + as regras da fn_receber_lead_webhook
// (consentimento, bloqueio, volume) — não o cookie.
const ROTAS_LIVRES = ["/login", "/auth", "/icon", "/api/leads"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // importante: getUser() valida o JWT no servidor de auth do Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = new URL(request.url).pathname;
  const livre = ROTAS_LIVRES.some((r) => path.startsWith(r));

  if (!user && !livre) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
