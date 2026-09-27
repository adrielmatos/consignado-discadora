import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { sair } from "@/app/login/acoes";
import { quemSou } from "@/lib/acoes";

export const metadata: Metadata = {
  title: "Discadora Consignado",
  description: "CRM + discadora pelo celular (Phone Link) para crédito consignado",
};

/**
 * A nav é montada pelo papel real (fn_quem_sou), não por suposição do cliente.
 * Esconder link não é segurança — a RLS e as funções SQL são a segurança —, mas
 * com 10 pessoas na sala, mostrar "Equipe" para um operador só gera chamado.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  let meu = await quemSou().catch(() => null);
  email = meu?.email ?? null;
  const gerencia = meu && (meu.papel === "admin" || meu.papel === "supervisor");
  const pausado = meu?.pausado_ate && new Date(meu.pausado_ate) > new Date();
  const limite = meu && meu.limite_diario > 0 ? Math.min(100, Math.round((meu.discadas_hoje / meu.limite_diario) * 100)) : 0;

  return (
    <html lang="pt-br">
      <body>
        <nav>
          <b>Discadora Consignado</b>
          <Link href="/operador">Operador</Link>
          <Link href="/leads">Leads</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/relatorios">Relatórios</Link>
          {gerencia ? <Link href="/campanhas">Campanhas</Link> : null}
          {gerencia ? <Link href="/empresa">Empresa</Link> : null}
          {gerencia || meu?.papel === "admin" ? <Link href="/equipe">Equipe</Link> : null}
          <form action={sair} style={{ display: "inline" }}>
            <button type="submit" className="btn" style={{ padding: "6px 10px" }}>sair</button>
          </form>
          <span style={{ marginLeft: "auto" }} className="mudo">
            {meu?.nome ? `${meu.nome}` : (email ?? "não autenticado")}
            {meu && meu.papel !== "ninguem" ? <span className={`chip ${pausado ? "chip-ambar" : "chip-verde"}`} style={{ marginLeft: 8 }}>{meu.papel}</span> : null}
            {meu && meu.papel !== "ninguem" ? (
              <span className={`chip ${limite >= 90 ? "chip-vermelho" : "chip-azul"}`} style={{ marginLeft: 6 }}>
                {meu.discadas_hoje}/{meu.limite_diario} hoje
              </span>
            ) : null}
            {meu && meu.tarefas_abertas > 0 ? (
              <Link href="/crm" className={`chip ${meu.tarefas_abertas > 0 ? "chip-ambar" : ""}`} style={{ marginLeft: 6 }}>
                {meu.tarefas_abertas} tarefa(s)
              </Link>
            ) : null}
          </span>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
