import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discadora Consignado Pro — CRM & Discador pelo Celular para Crédito Consignado",
  description:
    "A única discadora desenvolvida para correspondentes de crédito consignado. Zero custo de telefonia VoIP (disque direto pelo chip do celular via PC), esteira Meu INSS e simulador de margem.",
};

export default async function PaginaLanding() {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (user) {
      redirect("/painel");
    }
  } catch {
    // se supabase falhar na checagem, renderiza a landing page normalmente
  }

  return (
    <>
      <link rel="stylesheet" href="/assets/index-jLCnV89z.css" />
      <div id="root" />
      <script type="module" src="/assets/index-MlBAo6-l.js" />
    </>
  );
}
