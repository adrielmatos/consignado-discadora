"use client";

import { useState, useTransition } from "react";
import { avaliarChamada, concluirTarefa, criarTarefa, moverLead, pontuarLeads } from "@/lib/acoes";
import type { FichaLead } from "@/lib/tipos";
import { OPC_DATA_HORA } from "@/lib/tempo";

const ESTAGIOS = ["novo", "sem_contato", "contato", "qualificado", "recusado", "inidoneo", "descarte"];
const MOEDA = (v: unknown) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const DATA = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", OPC_DATA_HORA) : "—";

/**
 * O painel é cliente só onde precisa clicar (mover estágio, tarefa, nota de QA);
 * o conteúdo veio pronto do banco. O formulário de QA só aparece para a gestão —
 * é o scorecard que substitui a escuta de gravação enquanto o meio de discar for o
 * Phone Link: sem áudio, a auditoria é sobre o registro da ligação.
 */
export default function PainelFicha({
  ficha,
  leadId,
  gerencia,
  meuId,
}: {
  ficha: FichaLead;
  leadId: number;
  gerencia: boolean;
  meuId: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [nota, setNota] = useState("85");
  const [achados, setAchados] = useState("");

  const l = ficha.lead ?? {};
  const ultimoCdr = ficha.cdrs?.[0];

  function rodar(nome: string, fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return setErro(r.erro ?? "não foi possível");
      setAviso(`${nome} registrado`);
    });
  }

  return (
    <>
      <div className="grade" style={{ marginBottom: 14 }}>
        <div className="kpi"><span>status</span><b style={{ fontSize: 18 }}>{String(l.status ?? "—")}</b></div>
        <div className="kpi"><span>esteira</span><b style={{ fontSize: 18 }}>{ESTAGIOS.includes(String(l.status)) ? String(l.status) : String(l.status ?? "—")}</b>
          <span className="mudo">{String(l.tentativas ?? 0)} tentativas · prio {String(l.prioridade ?? 0)}</span>
        </div>
        <div className="kpi"><span>margem estimada</span><b style={{ fontSize: 18 }}>{MOEDA(l.margem_estimada)}</b></div>
        <div className="kpi"><span>última chamada</span><b style={{ fontSize: 18 }}>{DATA(String(l.ultima_chamada_at ?? "") || null)}</b></div>
        <div className="kpi"><span>próxima chamada</span><b style={{ fontSize: 18 }}>{DATA(String(l.proximo_contato_at ?? "") || null)}</b></div>
      </div>

      {erro ? <p className="alerta">{erro}</p> : null}
      {aviso ? <p className="ok">{aviso}</p> : null}

      <div className="card">
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="grande"><a href={`tel:${String(l.telefone_e164 ?? "")}`}>{String(l.telefone_e164 ?? "—")}</a></div>
            <div className="mudo">
              {String(l.cidade ?? "—")}/{String(l.uf ?? "--")} · banco {String(l.banco_folha ?? "—")} ·{" "}
              {l.cpf_mask ? `CPF ${String(l.cpf_mask)}` : "sem CPF"} · consentimento{" "}
              {String(l.consentimento ?? "—")}
              {l.consentimento_em ? ` em ${DATA(String(l.consentimento_em))}` : ""}
            </div>
          </div>
          <div className="linha" style={{ gap: 6 }}>
            <a className="btn" href={`tel:${String(l.telefone_e164 ?? "")}`}>discar no Phone Link</a>
          </div>
        </div>

        {ficha.bloqueio ? (
          <p className="alerta" style={{ marginBottom: 0 }}>
            número bloqueado: {String(ficha.bloqueio.motivo)} — {ficha.bloqueio.expira_em
              ? `libera em ${DATA(ficha.bloqueio.expira_em)}`
              : "sem prazo (definitivo)"}
          </p>
        ) : null}

        {ficha.campanha ? (
          <p className="mudo" style={{ marginBottom: 0 }}>
            campanha <b>{ficha.campanha.nome}</b> ({ficha.campanha.publico}) · meta do dia{" "}
            {ficha.campanha.meta_diaria ?? "—"} ·{" "}
            {ficha.campanha.formulario?.length ?? 0} campos de tabulação
          </p>
        ) : null}

        {gerencia ? (
          <div className="linha" style={{ marginTop: 12, alignItems: "flex-end" }}>
            {ESTAGIOS.map((e) => (
              <button
                key={e}
                disabled={pendente || String(l.status) === e}
                onClick={() => rodar(`estágio ${e}`, () => moverLead({ leadId, status: e, motivo: "ajuste na ficha" }))}
              >
                → {e}
              </button>
            ))}
            <button
              disabled={pendente}
              onClick={() => rodar("pontuação", () => pontuarLeads(String(l.campanha_id ?? "") || null))}
            >
              recalcular prioridade da campanha
            </button>
          </div>
        ) : null}
      </div>

      <div className="grade" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <div className="card">
          <b>Histórico ({ficha.eventos?.length ?? 0})</b>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.eventos ?? []).slice(0, 12).map((e, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <span className="mudo">{DATA(e.quando)}</span>{" "}
                {e.de && e.para ? <span className="chip">{String(e.de)} → {String(e.para)}</span> : null}
                <div>{e.detalhe ?? "—"}</div>
              </li>
            ))}
            {!ficha.eventos?.length ? <li className="mudo">nada registrado ainda</li> : null}
          </ul>
        </div>

        <div className="card">
          <b>Ligações ({ficha.cdrs?.length ?? 0})</b>
          <div className="rolagem" style={{ maxHeight: 260, marginTop: 8 }}>
            <table>
              <thead><tr><th>quando</th><th>resultado</th><th className="num">duração</th><th>quem</th><th>nota</th></tr></thead>
              <tbody>
                {(ficha.cdrs ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="mudo">{DATA(c.quando)}</td>
                    <td>{c.disposition}</td>
                    <td className="num">{c.duracao_s ?? 0}s</td>
                    <td className="mudo">{c.agente ?? "—"}</td>
                    <td className="mudo">{c.nota ?? "—"}</td>
                  </tr>
                ))}
                {!ficha.cdrs?.length ? <tr><td colSpan={5} className="mudo">nenhuma chamada</td></tr> : null}
              </tbody>
            </table>
          </div>
          {gerencia && ultimoCdr ? (
            <>
              <div className="linha" style={{ alignItems: "flex-end", marginTop: 10 }}>
                <label style={{ flex: "0 1 90px" }}>
                  <span className="mudo">nota de QA</span>
                  <input type="number" min={0} max={100} value={nota} onChange={(e) => setNota(e.target.value)} />
                </label>
                <label style={{ flex: "1 1 200px" }}>
                  <span className="mudo">o que precisa mudar</span>
                  <input value={achados} onChange={(e) => setAchados(e.target.value)} placeholder="achado da auditoria" />
                </label>
                <button
                  disabled={pendente}
                  onClick={() =>
                    rodar("avaliação de qualidade", () =>
                      avaliarChamada({ cdrId: ultimoCdr.id, nota: Number(nota), achados, planoAcao: achados })
                    )
                  }
                >
                  avaliar a última ligação
                </button>
              </div>
              <p className="mudo" style={{ marginBottom: 0 }}>
                sem áudio no Phone Link, a auditoria é sobre o registro: CDR + passos do roteiro +
                tabulação. A nota entra em <code>qa_avaliacoes</code> e aparece em /relatorios.
              </p>
            </>
          ) : null}
        </div>

        <div className="card">
          <b>Tabulação e dados da planilha</b>
          {(() => {
            const extras = (l.extras ?? {}) as Record<string, unknown>;
            const chaves = Object.keys(extras).filter((k) => !k.startsWith("_"));
            const rotulos = Object.fromEntries((ficha.campanha?.formulario ?? []).map((c) => [c.chave, c.rotulo]));
            if (!chaves.length) return <p className="mudo" style={{ marginBottom: 0 }}>nenhum campo preenchido — o operador tabula na tela dele.</p>;
            return (
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {chaves.map((k) => (
                    <tr key={k}>
                      <td className="mudo">{rotulos[k] ?? k}</td>
                      <td>{typeof extras[k] === "boolean" ? (extras[k] ? "sim" : "não") : String(extras[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>

        <div className="card">
          <b>Propostas e anuência ({ficha.propostas?.length ?? 0})</b>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>valor</th><th className="num">parcelas</th><th>anuência</th><th>prazo</th><th>protocolo</th></tr></thead>
            <tbody>
              {(ficha.propostas ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{MOEDA(p.valor)}</td>
                  <td className="num">{p.parcelas}x</td>
                  <td><span className={`chip ${p.anuencia === "confirmada" ? "chip-verde" : p.anuencia === "expirada" ? "chip-vermelho" : "chip-ambar"}`}>{p.anuencia}</span></td>
                  <td className="mudo">{DATA(p.prazo_validade)}</td>
                  <td className="mudo">{p.protocolo ?? "—"}</td>
                </tr>
              ))}
              {!ficha.propostas?.length ? <tr><td colSpan={5} className="mudo">nenhuma proposta enviada</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="card">
          <b>Tarefas ({(ficha.tarefas ?? []).filter((t) => !t.concluida_em).length} abertas)</b>
          <div className="linha" style={{ marginTop: 8 }}>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="o que fazer com este lead" />
            <button
              disabled={pendente || titulo.trim().length < 3}
              onClick={() =>
                rodar("tarefa", () =>
                  criarTarefa({ leadId, titulo: titulo.trim(), tipo: "retorno" })
                )
              }
            >
              criar
            </button>
          </div>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.tarefas ?? []).slice(0, 8).map((t) => (
              <li key={t.id} style={{ marginBottom: 6 }}>
                {t.concluida_em ? <s>{t.titulo}</s> : <b>{t.titulo}</b>}{" "}
                <span className="mudo">
                  {t.tipo} · vence {DATA(t.vence_em)} · {t.dono ?? "sem dono"}
                </span>
                {!t.concluida_em && (gerencia || t.agente_id === meuId) ? (
                  <button
                    style={{ marginLeft: 8 }}
                    disabled={pendente}
                    onClick={() => rodar("conclusão", () => concluirTarefa(t.id, "feito a partir da ficha"))}
                  >
                    concluir
                  </button>
                ) : null}
              </li>
            ))}
            {!ficha.tarefas?.length ? <li className="mudo">nenhuma tarefa</li> : null}
          </ul>
        </div>

        <div className="card">
          <b>Roteiro cumprido</b>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.roteiro ?? []).map((p, i) => (
              <li key={i}>
                {p.feito ? "✅" : p.obrigatorio ? "⬜" : "▫️"} {p.titulo}
                {p.obrigatorio ? null : <span className="mudo"> · opcional</span>}
                {p.marcado_em ? <span className="mudo"> · {DATA(p.marcado_em)}</span> : null}
              </li>
            ))}
            {!ficha.roteiro?.length ? <li className="mudo">a campanha não tem roteiro apontado</li> : null}
          </ul>
        </div>

        <div className="card">
          <b>Avaliações de QA ({ficha.qa?.length ?? 0})</b>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {(ficha.qa ?? []).map((q, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <b>{q.nota}/100</b> <span className="mudo">{DATA(q.quando)} · por {q.avaliador ?? "—"}</span>
                <div>{q.achados ?? "—"}</div>
                {q.plano_acao ? <div className="mudo">plano: {q.plano_acao}</div> : null}
              </li>
            ))}
            {!ficha.qa?.length ? <li className="mudo">nenhuma auditoria registrada</li> : null}
          </ul>
        </div>
      </div>
    </>
  );
}
