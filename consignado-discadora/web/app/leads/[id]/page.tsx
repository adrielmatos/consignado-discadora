import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaLead, quemSou } from "@/lib/acoes";
import PainelFicha from "./painel";

export const dynamic = "force-dynamic";

/**
 * Ficha 360º do lead. Um request só: `fn_ficha_lead` monta lead + trilha + CDRs +
 * propostas + tarefas + roteiro + QA + bloqueio no banco, porque o caminho óbvio
 * (sete `from().select()` no navegador) paga sete ida-e-volta por tela aberta e,
 * pior, sete chances de esquecer o recorte de escopo em uma delas.
 */
export default async function PaginaFicha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || leadId <= 0) notFound();

  const [r, meu] = await Promise.all([fichaLead(leadId), quemSou()]);
  if (!r.ok) {
    return (
      <>
        <h1>Ficha do lead</h1>
        <p className="alerta">{r.erro}</p>
        <p className="mudo">
          Se o lead existe, ele está numa campanha fora do seu escopo — a ficha respeita a mesma RLS do
          resto do sistema. Volte para <Link href="/crm">CRM</Link>.
        </p>
      </>
    );
  }

  const f = r.data;
  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";

  return (
    <>
      <div className="linha" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>{(f.lead?.nome as string) ?? `Lead #${leadId}`}</h1>
        <span className="mudo">
          lead #{leadId} · <Link href="/crm">← esteira</Link>
        </span>
      </div>

      <PainelFicha ficha={f} leadId={leadId} gerencia={gerencia} meuId={meu.agente_id ?? ""} />
    </>
  );
}
