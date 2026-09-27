"use client";

import { useState, useTransition } from "react";
import { concluirTarefa } from "@/lib/acoes";
import type { Tarefa } from "@/lib/tipos";
import { OPC_DATA_HORA } from "@/lib/tempo";

const COR: Record<string, string> = {
  vencida: "chip-vermelho",
  hoje: "chip-ambar",
  futura: "chip-azul",
  concluida: "chip-verde",
};

/**
 * Agenda = `v_agenda`. Situação (vencida/hoje/futura/concluída) é calculada no
 * banco, então "atrasado" não depende do relógio do navegador de quem olha.
 */
export default function Agenda({
  tarefas,
  podeConcluir,
  meuId,
}: {
  tarefas: Tarefa[];
  podeConcluir: boolean;
  meuId: string;
}) {
  const [mostrar, setMostrar] = useState<"abertas" | "todas">("abertas");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const lista = tarefas.filter((t) => (mostrar === "abertas" ? !t.concluida_em : true));

  return (
    <div className="card">
      <div className="linha" style={{ alignItems: "center", marginBottom: 8 }}>
        <span className="mudo">{lista.length} tarefa(s) no seu escopo</span>
        <button onClick={() => setMostrar(mostrar === "abertas" ? "todas" : "abertas")}>
          {mostrar === "abertas" ? "ver concluídas" : "ver só abertas"}
        </button>
        {erro ? <span className="alerta">{erro}</span> : null}
      </div>
      {!lista.length ? (
        <p className="mudo" style={{ marginBottom: 0 }}>
          nenhuma tarefa aberta. crie uma no cartão do lead (botão <b>tarefa</b>) — follow-up sem
          registro é follow-up que depende de memória.
        </p>
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>vence</th><th>situação</th><th>lead</th><th>o que fazer</th><th>tipo</th><th>dono</th><th></th></tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id}>
                  <td className="mudo">{new Date(t.vence_em).toLocaleString("pt-BR", OPC_DATA_HORA)}</td>
                  <td><span className={`chip ${COR[t.situacao] ?? ""}`}>{t.situacao}</span></td>
                  <td>
                    {t.lead ?? `#${t.lead_id}`}
                    <div className="mudo">{t.campanha ?? "—"}</div>
                  </td>
                  <td>
                    {t.titulo}
                    {t.detalhe ? <div className="mudo">{t.detalhe}</div> : null}
                    {t.resultado ? <div className="mudo">→ {t.resultado}</div> : null}
                  </td>
                  <td className="mudo">{t.tipo}</td>
                  <td className="mudo">{t.dono ?? "—"}</td>
                  <td>
                    {!t.concluida_em && (podeConcluir || t.agente_id === meuId) ? (
                      <button
                        disabled={pendente}
                        onClick={() =>
                          iniciar(async () => {
                            const r = await concluirTarefa(t.id, "concluída na agenda");
                            setErro(r.ok ? null : r.erro);
                          })
                        }
                      >
                        concluir
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
