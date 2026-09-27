"use client";

import { useState, useTransition } from "react";
import { criarTarefa, enviarProposta, qualificarLead, salvarTabulacao, simularProposta } from "@/lib/acoes";
import type { CampoFormulario, LeadFila, Simulacao } from "@/lib/tipos";

/**
 * Tabulação + simulador de proposta, dentro do cartão do lead.
 *
 * É a peça que faltava para "qualificado" deixar de ser a nota que o operador
 * digitou: o `fn_qualificar_lead` no banco recusa a qualificação enquanto os
 * campos obrigatórios da campanha estiverem vazios. O simulador vem logo abaixo
 * porque a margem define o que pode ser oferecido — e `fn_enviar_proposta` recusa
 * o que passar dela, então o número mostrado aqui é o mesmo que o banco aceita.
 */
export default function Tabulacao({
  lead,
  onPropostaEnviada,
}: {
  lead: LeadFila;
  onPropostaEnviada: (mensagem: string) => void;
}) {
  const campos: CampoFormulario[] = lead.formulario ?? [];
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const c of campos) {
      const v = (lead.extras ?? {})[c.chave];
      inicial[c.chave] = v == null ? "" : typeof v === "boolean" ? (v ? "sim" : "nao") : String(v);
    }
    return inicial;
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [parcelas, setParcelas] = useState("60");
  const [taxa, setTaxa] = useState("");
  const [sim, setSim] = useState<Simulacao | null>(null);

  function campo(c: CampoFormulario) {
    const set = (v: string) => setValores((x) => ({ ...x, [c.chave]: v }));
    if (c.tipo === "sim_nao") {
      return (
        <select value={valores[c.chave] ?? ""} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          <option value="sim">sim</option>
          <option value="nao">não</option>
        </select>
      );
    }
    if (c.tipo === "selecao") {
      return (
        <select value={valores[c.chave] ?? ""} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {(c.opcoes ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    const tipo = c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : c.tipo === "telefone" ? "tel" : "text";
    return (
      <input
        type={tipo}
        step={c.tipo === "numero" ? "0.01" : undefined}
        value={valores[c.chave] ?? ""}
        onChange={(e) => set(e.target.value)}
      />
    );
  }

  function dadosParaSalvar(): Record<string, unknown> {
    const saida: Record<string, unknown> = {};
    for (const c of campos) {
      const v = (valores[c.chave] ?? "").trim();
      if (v === "") continue;
      if (c.tipo === "sim_nao") saida[c.chave] = v === "sim";
      else if (c.tipo === "numero") saida[c.chave] = Number(v.replace(",", "."));
      else saida[c.chave] = v;
    }
    return saida;
  }

  function salvar(qualificar: boolean) {
    const dados = dadosParaSalvar();
    iniciar(async () => {
      const r = await salvarTabulacao({ leadId: lead.lead_id, dados });
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      if (!qualificar) return setAviso("tabulação salva nos dados do lead");
      const q = await qualificarLead(lead.lead_id, String(dados["obs_qualificacao"] ?? "") || undefined);
      setAviso(q.ok ? "lead qualificado — pronto para a proposta no Meu INSS" : null);
      if (!q.ok) setErro(q.erro);
    });
  }

  function simular() {
    iniciar(async () => {
      const r = await simularProposta({
        margem: lead.margem_estimada ?? valores["margem_informada"] ?? "",
        parcelas,
        publico: lead.publico ?? "inss",
        taxaAa: taxa,
      });
      if (!r.ok) { setSim(null); return setErro(r.erro); }
      setErro(null);
      setSim(r.data);
    });
  }

  const margemBase = lead.margem_estimada ?? Number(valores["margem_informada"] ?? 0);

  return (
    <div style={{ borderTop: "1px solid var(--linha)", marginTop: 12, paddingTop: 10 }}>
      <b>tabulação{campos.length ? ` · ${campos.filter((c) => c.obrigatorio !== false).length} obrigatórios` : ""}</b>
      {campos.length === 0 ? (
        <p className="mudo" style={{ margin: "6px 0 0" }}>
          a campanha não definiu campos de tabulação — peça ao supervisor em /campanhas. Enquanto
          isso, qualificar aqui é só a nota abaixo.
        </p>
      ) : (
        <div className="grade" style={{ marginTop: 8, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
          {campos.map((c) => (
            <label key={c.chave}>
              <span className="mudo">
                {c.rotulo}
                {c.obrigatorio !== false ? " *" : ""}
              </span>
              {campo(c)}
            </label>
          ))}
        </div>
      )}

      <div className="linha" style={{ marginTop: 10 }}>
        <button onClick={() => salvar(false)} disabled={pendente}>salvar tabulação</button>
        <button className="primario" onClick={() => salvar(true)} disabled={pendente}>
          qualificar lead
        </button>
        <button
          onClick={() =>
            iniciar(async () => {
              const r = await criarTarefa({
                leadId: lead.lead_id,
                titulo: "Retornar com a proposta simulada",
                tipo: "proposta",
                venceEm: new Date(Date.now() + 864e5).toISOString(),
                detalhe: sim ? `parcela R$ ${sim.parcela_maxima.toFixed(2)} em ${sim.parcelas}x` : undefined,
              });
              setAviso(r.ok ? "tarefa criada na sua agenda (/crm)" : null);
              if (!r.ok) setErro(r.erro);
            })
          }
          disabled={pendente || !sim}
        >
          criar tarefa de retorno
        </button>
      </div>

      <div style={{ borderTop: "1px dashed var(--linha)", marginTop: 12, paddingTop: 10 }}>
        <b>simulador (o que cabe na margem)</b>
        <div className="linha" style={{ marginTop: 8 }}>
          <label style={{ flex: "0 1 150px" }}>
            <span className="mudo">margem R$/mês</span>
            <input value={String(margemBase || "")} readOnly style={{ opacity: .7 }} />
          </label>
          <label style={{ flex: "0 1 110px" }}>
            <span className="mudo">parcelas (6–108)</span>
            <input type="number" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
          </label>
          <label style={{ flex: "0 1 120px" }}>
            <span className="mudo">juros % a.a. (opcional)</span>
            <input value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder="padrão INSS" />
          </label>
          <button onClick={simular} disabled={pendente}>calcular</button>
        </div>

        {sim ? (
          <div className="grade" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <div className="kpi"><span>parcela máxima</span><b>R$ {sim.parcela_maxima.toLocaleString("pt-BR")}</b></div>
            <div className="kpi"><span>crédito que cabe</span><b>R$ {sim.valor_maximo.toLocaleString("pt-BR")}</b></div>
            <div className="kpi"><span>total pago</span><b>R$ {sim.total_pago.toLocaleString("pt-BR")}</b></div>
            <div className="kpi"><span>limite de margem ({lead.publico ?? "inss"})</span>
              <b>{sim.limite_margem_pct}%</b>
            </div>
          </div>
        ) : null}
        {sim && !sim.dentro_das_regras ? (
          <p className="alerta" style={{ margin: "8px 0 0" }}>
            fora das regras do INSS — o prazo aceito é de 6 a 108 parcelas.
          </p>
        ) : null}
        {sim?.regras.length ? (
          <ul className="mudo" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {sim.regras.map((r) => <li key={r}>{r}</li>)}
          </ul>
        ) : null}

        {sim ? (
          <div className="linha" style={{ marginTop: 10 }}>
            <button
              className="primario"
              disabled={pendente || !sim.dentro_das_regras}
              onClick={() =>
                iniciar(async () => {
                  const r = await enviarProposta({
                    leadId: lead.lead_id,
                    valor: sim.valor_maximo,
                    parcelas: sim.parcelas,
                    taxaAa: sim.taxa_aa,
                    banco: lead.banco_folha ?? undefined,
                    obs: "gerado pelo simulador da tela do operador",
                  });
                  if (!r.ok) return setErro(r.erro);
                  onPropostaEnviada(
                    `proposta de R$ ${sim.valor_maximo.toLocaleString("pt-BR")} em ${sim.parcelas}x enviada para anuência no Meu INSS (5 dias)`
                  );
                })
              }
            >
              enviar esta proposta para anuência
            </button>
            <span className="mudo">
              o valor vai igual ao calculado: se a parcela passar da margem, o banco recusa a proposta
              antes de ela sair daqui.
            </span>
          </div>
        ) : null}
      </div>

      {erro ? <p className="alerta" style={{ margin: "8px 0 0" }}>{erro}</p> : null}
      {aviso ? <p className="ok" style={{ margin: "8px 0 0" }}>{aviso}</p> : null}
    </div>
  );
}
