"use client";

import { useEffect, useState, useTransition } from "react";
import { listarPolitica, salvarPolitica } from "@/lib/acoes";
import { DISPOSICOES, type PoliticaLinha } from "@/lib/tipos";

const ACOES: { valor: PoliticaLinha["acao"]; rotulo: string; dica: string }[] = [
  { valor: "repetir", rotulo: "repetir", dica: "volta para a fila no intervalo definido" },
  { valor: "sem_contato", rotulo: "sem contato", dica: "marca como sem contato e repete no intervalo" },
  { valor: "contato", rotulo: "virou contato", dica: "sai da fila e espera o operador agir" },
  { valor: "qualificar", rotulo: "qualificar", dica: "manda direto para qualificado (cuidado com tabulação obrigatória)" },
  { valor: "descartar", rotulo: "descartar", dica: "sai da campanha: número errado, falecido, JC" },
];

const ROTULO: Record<string, string> = Object.fromEntries(DISPOSICOES.map((d) => [d.valor, d.rotulo]));

/**
 * Cadência por disposição — o que os discadores chamam de "cada qualificação tem
 * comportamento". O banco já decidia só por campanha (`intervalo_retentativa_s`);
 * aqui o supervisor diz, para cada uma das 8 qualificações, se repete, em quanto
 * tempo, se força uma hora do dia e se o lead sobe ou desce na fila.
 */
export default function Cadencia({
  campanhas,
  podeEditar,
}: {
  campanhas: { id: string; nome: string; regras_de_cadencia: number }[];
  podeEditar: boolean;
}) {
  const [alvo, setAlvo] = useState(campanhas[0]?.id ?? "");
  const [linhas, setLinhas] = useState<PoliticaLinha[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    if (!alvo) return;
    void listarPolitica(alvo).then((r) => {
      if (vivo) setLinhas(r);
    });
    return () => { vivo = false; };
  }, [alvo]);

  const campanha = campanhas.find((c) => c.id === alvo);

  function mudar<K extends keyof PoliticaLinha>(disposition: string, campo: K, valor: PoliticaLinha[K]) {
    setLinhas((atual) => atual.map((l) => (l.disposition === disposition ? { ...l, [campo]: valor } : l)));
  }

  return (
    <div className="card">
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 220px" }}>
          <span className="mudo">campanha</span>
          <select value={alvo} onChange={(e) => setAlvo(e.target.value)}>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <span className="mudo">
          {campanha?.regras_de_cadencia
            ? `${campanha.regras_de_cadencia} regra(s) próprias; o resto segue o default da campanha`
            : "nenhuma regra própria: tudo hoje usa o intervalo único da campanha"}
        </span>
        <button
          className="primario"
          disabled={!podeEditar || pendente || !linhas.length}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarPolitica({ campanhaId: alvo, regras: linhas });
              setErro(r.ok ? null : r.erro);
              setMsg(r.ok ? "cadência salva — vale a partir da próxima chamada" : null);
              if (r.ok && campanha) campanha.regras_de_cadencia = r.data.regras;
            })
          }
        >
          salvar cadência
        </button>
      </div>

      {erro ? <p className="alerta" style={{ marginBottom: 0 }}>{erro}</p> : null}
      {msg ? <p className="ok" style={{ marginBottom: 0 }}>{msg}</p> : null}

      <div className="rolagem" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>qualificação</th><th>o que fazer</th><th className="num">intervalo (min)</th>
              <th>hora alvo</th><th className="num">teto tentativas</th><th className="num">prioridade ±</th>
              <th>anotação do supervisor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.disposition}>
                <td>{ROTULO[l.disposition] ?? l.disposition}</td>
                <td>
                  <select
                    value={l.acao}
                    disabled={!podeEditar}
                    onChange={(e) => mudar(l.disposition, "acao", e.target.value as PoliticaLinha["acao"])}
                  >
                    {ACOES.map((a) => (
                      <option key={a.valor} value={a.valor} title={a.dica}>{a.rotulo}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 90 }}
                    disabled={!podeEditar || l.acao === "descartar"}
                    value={Math.round(l.intervalo_s / 60)}
                    onChange={(e) => mudar(l.disposition, "intervalo_s", Math.max(1, Number(e.target.value) || 0) * 60)}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    disabled={!podeEditar}
                    value={l.hora_alvo ?? ""}
                    onChange={(e) => mudar(l.disposition, "hora_alvo", e.target.value || null)}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 60 }}
                    min={1}
                    max={10}
                    disabled={!podeEditar}
                    value={l.max_tentativas ?? ""}
                    onChange={(e) =>
                      mudar(l.disposition, "max_tentativas", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    style={{ width: 64 }}
                    min={-50}
                    max={50}
                    disabled={!podeEditar}
                    value={l.prioridade_delta}
                    onChange={(e) => mudar(l.disposition, "prioridade_delta", Number(e.target.value) || 0)}
                  />
                </td>
                <td className="mudo">{l.observacao ?? "—"}</td>
              </tr>
            ))}
            {!linhas.length ? (
              <tr><td colSpan={7} className="mudo">carregando as 8 disposições…</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mudo" style={{ marginBottom: 0 }}>
        hora alvo = &ldquo;insista amanhã às 10h&rdquo; em vez de tocar no mesmo minuto da tarde; o
        cálculo é feito no horário de Brasília e a janela 08:00–21:00 é travada no banco. Prioridade ±
        mexe em qual lead o claim entrega primeiro.
      </p>
    </div>
  );
}
