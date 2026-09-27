import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Callback do link mágico / confirmação de e-mail do Supabase. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const tokenHash = url.searchParams.get("token_hash");
  const email = url.searchParams.get("email") ?? "";

  const sb = await supabaseServer();

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(error.message)}`, url.origin));
  }

  if (tokenHash && email) {
    const { error } = await sb.auth.verifyOtp({ token: tokenHash, type: "email", email });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL("/login?erro=link+invalido", url.origin));
}
