import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas públicas que não exigem autenticação prévia:
// - "/" é a Landing Page institucional para visitantes
// - "/login" e "/auth" para login e callback de link mágico
// - "/api/leads" para entrada de leads por webhook (protegida por token)
// - "/assets" e "/mockups" para os arquivos estáticos da landing
const ROTAS_LIVRES = ["/", "/login", "/auth", "/icon", "/api/leads", "/assets", "/mockups"];

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
  const livre = ROTAS_LIVRES.some((r) => (r === "/" ? path === "/" : path.startsWith(r)));

  // Se não está autenticado e a rota é restrita, redireciona para login
  if (!user && !livre) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Se já está autenticado e tenta acessar o login ou a landing page, manda direto para o painel
  if (user && (path === "/login" || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)",
  ],
};
