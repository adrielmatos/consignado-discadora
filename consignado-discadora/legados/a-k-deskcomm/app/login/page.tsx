"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [msg, setMsg] = useState(
    params.get("error") === "confirm_failed"
      ? "O link de confirmação não pôde ser validado. Solicite um novo e-mail de confirmação."
      : "",
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const s = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm?next=/`;
    const x = signup
      ? await s.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        })
      : await s.auth.signInWithPassword({ email, password });

    setBusy(false);

    if (x.error) {
      setMsg("Não foi possível concluir. Confira os dados e tente novamente.");
      return;
    }

    if (signup) {
      setMsg("Conta criada. Enviamos um e-mail de confirmação. Abra o link recebido para ativar seu acesso.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login">
      <div className="loginCard">
        <div className="brand big">A&K <em>Deskcomm</em></div>
        <p>CRM e central de atendimento</p>
        <form onSubmit={submit}>
          <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required /></label>
          {msg && <div className="notice">{msg}</div>}
          <button className="btn primary wide" disabled={busy}>{busy ? "Processando..." : signup ? "Criar acesso" : "Entrar"}</button>
        </form>
        <button className="linkBtn" onClick={() => { setSignup(!signup); setMsg(""); }}>
          {signup ? "Já tenho conta" : "Primeiro acesso"}
        </button>
        <small>Supabase Auth + RLS. A discadora/Phone Link permanece isolada.</small>
      </div>
    </main>
  );
}