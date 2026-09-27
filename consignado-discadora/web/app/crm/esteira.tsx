"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { criarTarefa, moverLead } from "@/lib/acoes";

const COLUNAS: { estagio: string; titulo: string; mover?: string }[] = [
  { estagio: "fila", titulo: "Na fila", mover: "contato" },
  { estagio: "contato", titulo: "Falou com o cliente", mover: "qualificado" },
  { estagio: "qualificado", titulo: "Qualificado", mover: "proposta" },
  { estagio: "aguardando_anuencia", titulo: "Aguardando anuência INSS" },
  { estagio: "confirmada", titulo: "Anuência confirmada" },
  { estagio: "fechado", titulo: "Encerrado" },
];

export type CartaoCRM = {
  lead_id: number;
  nome: string | null;
  telefone_e164: string;
  cidade: string | null;
  banco_folha: string | null;
  campanha: string | null;
  estagio: string;
  prioridade: number;
  tentativas: number;
  dias_sem_falar: number | null;
  tarefas_abertas: number;
  tarefa_vencida: boolean;
  dono: string | null;
  proximo_contato_at: string | null;
};

/**
 * A esteira é a view `v_crm_leads` recortada por estágio — o estágio vem do banco
 * (proposta + anuência contam para ele), não de um campo que o operador poderia
 * editar pelo navegador. Mover card = `fn_mover_lead`, que checa papel, escopo e
 * conflito de número; por isso o botão some para o operador nos estágios que são
 * decisão de gestão.
 */
export default function Esteira({
  cards,
  podeMover,
}: {
  cards: CartaoCRM[];
  podeMover: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [tarefaDe, setTarefaDe] = useState<CartaoCRM | null>(null);

  function mover(c: CartaoCRM, para: string) {
    setErro(null);
    iniciar(async () => {
      const r = await moverLead({ leadId: c.lead_id, status: para, motivo: "movido na esteira" });
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <>
      {erro ? <p className="alerta">banco: {erro}</p> : null}
      <div className="esteira">
        {COLUNAS.map((col) => {
          const doEstagio = cards.filter((c) => c.estagio === col.estagio);
          return (
            <div className="coluna" key={col.estagio}>
              <h3>
                {col.titulo} <span className="n">{doEstagio.length}</span>
              </h3>
              {doEstagio.slice(0, 8).map((c) => (
                <div className="cartao" key={c.lead_id}>
                  <Link href={`/leads/${c.lead_id}`}><b>{c.nome ?? `lead #${c.lead_id}`}</b></Link>
                  <div className="mudo tel">{c.telefone_e164}</div>
                  <div className="mudo">
                    {c.campanha ?? "—"} · {c.dono ?? "pool"} · {c.tentativas} tent.
                  </div>
                  <div className="linha" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {c.prioridade >= 50 ? <span className="chip chip-verde">prio {c.prioridade}</span> : null}
                    {c.tarefa_vencida ? <span className="chip chip-vermelho">tarefa vencida</span> : null}
                    {c.tarefas_abertas && !c.tarefa_vencida ? (
                      <span className="chip chip-azul">{c.tarefas_abertas} tarefa(s)</span>
                    ) : null}
                    {c.dias_sem_falar != null && c.dias_sem_falar > 2 ? (
                      <span className="chip chip-ambar">{c.dias_sem_falar}d sem falar</span>
                    ) : null}
                  </div>
                  <div className="linha" style={{ gap: 6, marginTop: 8 }}>
                    {podeMover && col.mover ? (
                      <button disabled={pendente} onClick={() => mover(c, col.mover!)}>→ {col.mover}</button>
                    ) : null}
                    <button disabled={pendente} onClick={() => setTarefaDe(c)}>tarefa</button>
                  </div>
                </div>
              ))}
              {doEstagio.length > 8 ? (
                <p className="mudo" style={{ marginBottom: 0 }}>+{doEstagio.length - 8} neste estágio</p>
              ) : null}
              {!doEstagio.length ? <p className="mudo">vazio</p> : null}
            </div>
          );
        })}
      </div>

      {tarefaDe ? (
        <NovaTarefa
          card={tarefaDe}
          fechar={() => setTarefaDe(null)}
          salvar={async (titulo, tipo, venceEm) => {
            const r = await criarTarefa({ leadId: tarefaDe.lead_id, titulo, tipo, venceEm });
            if (r.ok) setTarefaDe(null);
            return r.ok ? null : r.erro;
          }}
        />
      ) : null}
    </>
  );
}

function NovaTarefa({
  card,
  fechar,
  salvar,
}: {
  card: CartaoCRM;
  fechar: () => void;
  salvar: (titulo: string, tipo: string, venceEm: string) => Promise<string | null>;
}) {
  const [titulo, setTitulo] = useState(`Retornar ${card.nome ?? card.telefone_e164}`);
  const [tipo, setTipo] = useState("retorno");
  const [when, setWhen] = useState(
    new Date(Date.now() + 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 260px" }}>
          <span className="mudo">tarefa para {card.nome ?? card.telefone_e164}</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label>
          <span className="mudo">tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {["retorno", "proposta", "documentos", "anuencia", "cobranca", "ligar_para", "outro"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mudo">vence em</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <button
          className="primario"
          disabled={pendente || titulo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              const e = await salvar(titulo.trim(), tipo, when ? new Date(when).toISOString() : "");
              if (e) setErro(e); else fechar();
            })
          }
        >
          criar tarefa
        </button>
        <button onClick={fechar} disabled={pendente}>cancelar</button>
      </div>
      {erro ? <p className="alerta" style={{ marginBottom: 0 }}>{erro}</p> : null}
    </div>
  );
}
