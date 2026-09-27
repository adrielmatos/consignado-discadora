import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { pendencias, quemSou } from "@/lib/acoes";
import type { Tarefa } from "@/lib/tipos";
import AoVivo from "../ao-vivo";
import Esteira, { type CartaoCRM } from "./esteira";
import Agenda from "./agenda";

export const dynamic = "force-dynamic";

/**
 * CRM da operação: a esteira (estágio calculado no banco a partir de lead +
 * proposta + anuência) e a agenda do dia. Não é enfeite — é o que separa
 * "discadora que registra" de "sistema onde a equipe vive o dia": sem esteira, o
 * supervisor persegue lead por telefone; sem agenda, o follow-up depende de memória.
 */
export default async function PaginaCrm() {
  const [meu, res, agenda, pend] = await Promise.all([
    quemSou(),
    (async () => {
      const sb = await supabaseServer();
      return sb
        .from("v_crm_leads")
        .select(
          "lead_id,nome,telefone_e164,cidade,banco_folha,campanha,estagio,prioridade,tentativas," +
            "dias_sem_falar,tarefas_abertas,tarefa_vencida,dono,proximo_contato_at"
        )
        .order("prioridade", { ascending: false })
        .order("lead_id", { ascending: false })
        .limit(400);
    })(),
    (async () => {
      const sb = await supabaseServer();
      return sb.from("v_agenda").select("*").order("vence_em", { ascending: true }).limit(120);
    })(),
    pendencias(),
  ]);

  const cards: CartaoCRM[] = ((res.data as Record<string, unknown>[] | null) ?? []).map((c) => ({
    lead_id: Number(c.lead_id),
    nome: (c.nome as string | null) ?? null,
    telefone_e164: String(c.telefone_e164 ?? ""),
    cidade: (c.cidade as string | null) ?? null,
    banco_folha: (c.banco_folha as string | null) ?? null,
    campanha: (c.campanha as string | null) ?? null,
    estagio: String(c.estagio ?? "fila"),
    prioridade: Number(c.prioridade ?? 0),
    tentativas: Number(c.tentativas ?? 0),
    dias_sem_falar: c.dias_sem_falar == null ? null : Number(c.dias_sem_falar),
    tarefas_abertas: Number(c.tarefas_abertas ?? 0),
    tarefa_vencida: Boolean(c.tarefa_vencida),
    dono: (c.dono as string | null) ?? null,
    proximo_contato_at: (c.proximo_contato_at as string | null) ?? null,
  }));
  const tarefas = (agenda.data as Tarefa[] | null) ?? [];
  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";
  const porEstagio = (e: string) => cards.filter((c) => c.estagio === e).length;

  return (
    <>
      <AoVivo tabelas={["leads", "tarefas", "propostas"]} />
      <h1>CRM</h1>
      <p className="mudo">
        {cards.length} leads no seu escopo · {porEstagio("qualificado")} aguardando proposta ·{" "}
        {porEstagio("aguardando_anuencia")} com anuência aberta no Meu INSS ·{" "}
        {porEstagio("confirmada")} confirmadas. O estágio é calculado no banco, não digitado na tela.
      </p>

      <div className="grade" style={{ marginBottom: 14 }}>
        <div className="kpi"><span>tarefas vencidas</span><b style={{ color: pend.tarefas_vencidas ? "#f87171" : undefined }}>{pend.tarefas_vencidas}</b></div>
        <div className="kpi"><span>retornos de hoje</span><b>{pend.retornos_de_hoje}</b></div>
        <div className="kpi"><span>qualificados sem proposta</span><b>{pend.qualificados_sem_proposta}</b></div>
        <div className="kpi"><span>anuência vencendo (≤1 dia)</span><b>{pend.anuencia_hoje}</b></div>
        <div className="kpi"><span>leads nunca discados</span><b>{pend.fila_parada}</b></div>
        <div className="kpi"><span>auditorias de ligação na semana</span><b>{pend.qa_da_semana}</b></div>
      </div>

      <Esteira cards={cards} podeMover={gerencia} />

      <h2>Agenda</h2>
      <Agenda tarefas={tarefas} podeConcluir={gerencia} meuId={meu.agente_id ?? ""} />

      <p className="mudo">
        Ficha completa de cada lead em <Link href="/leads">/leads</Link> (clique no nome). A meta do
        dia por campanha está em <Link href="/relatorios">Relatórios</Link>; quem edita a esteira é a
        gestão — operador mexe na própria carteira pela tela dele.
      </p>
      {res.error ? <p className="alerta">banco: {res.error.message}</p> : null}
    </>
  );
}
