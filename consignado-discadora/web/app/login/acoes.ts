"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export async function entrar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) redirect("/login?erro=" + encodeURIComponent("informe um e-mail válido"));

  const h = await headers();
  const origem =
    process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origem}/auth/callback` },
  });
  if (error) redirect("/login?erro=" + encodeURIComponent(error.message));
  redirect("/login?msg=" + encodeURIComponent(`link de acesso enviado para ${email}`));
}

export async function sair() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
