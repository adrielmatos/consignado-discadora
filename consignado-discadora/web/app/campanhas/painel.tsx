"use client";

import { useState, useTransition } from "react";
import { atribuirCarteira, criarCampanha, definirAcesso, editarCampanha } from "@/lib/acoes";

type Campanha = {
  id: string;
  nome: string;
  publico: string;
  ativo: boolean;
  janela_ini: string;
  janela_fim: string;
  max_tentativas: number;
  intervalo_retentativa_s: number;
  permite_overflow: boolean;
  script_resumo: string | null;
  na_fila: number;
  atribuidos: number;
  total_leads: number;
  chamadas_hoje: number;
  equipe: { agente_id: string; nome: string; email: string; papel: string; limite_diario: number | null }[];
};

const PUBLICOS = [
  { v: "inss", r: "INSS (aposentado/pensionista) — margem 40%/35%, 108 parcelas" },
  { v: "bpc_loas", r: "BPC/LOAS — margem 35%" },
  { v: "servidor", r: "Servidor público (SIAPE/estadual/municipal)" },
  { v: "clt", r: "CLT (consignado privado)" },
  { v: "fgts", r: "FGTS / saque-aniversário" },
];

export default function PainelCampanhas({
  campanhas,
  gerencia,
  emails,
}: {
  campanhas: Campanha[];
  gerencia: boolean;
  emails: string[];
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ nome: "", publico: "inss", script: "" });
  const [sel, setSel] = useState<Campanha | undefined>(campanhas[0]);
  const [form, setForm] = useState<Campanha | undefined>(campanhas[0]);
  const [distrib, setDistrib] = useState({ agente: "", qtd: "50" });
  const [acesso, setAcesso] = useState({ email: "", papel: "operador", limite: "" });

  function abrir(c: Campanha) {
    setSel(c);
    setForm(c);
    setAcesso({ ...acesso, email: "" });
  }

  function rodar(rotulo: string, fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return setErro(r.erro ?? `${rotulo} falhou`);
      setAviso(`${rotulo} ok — recarregue a tela para ver as contagens`);
    });
  }

  if (!gerencia) {
    return (
      <p className="alerta">
        Campanha se configura com papel <b>supervisor</b> (nesta campanha) ou <b>admin</b>. Você está
        aqui como {campanhas.length ? "operador" : "visitante"} — veja sua carteira em Leads.
      </p>
    );
  }

  return (
    <>
      <div className="grade-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>nova campanha</h2>
          <div className="linha">
            <label>
              <span className="mudo">nome</span>
              <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="INSS — margem livre" />
            </label>
            <label>
              <span className="mudo">público</span>
              <select value={nova.publico} onChange={(e) => setNova({ ...nova, publico: e.target.value })}>
                {PUBLICOS.map((p) => (
                  <option key={p.v} value={p.v}>{p.r}</option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ display: "block", marginTop: 8 }}>
            <span className="mudo">roteiro da ligação (aparece para o operador junto com o lead)</span>
            <textarea
              rows={4}
              value={nova.script}
              onChange={(e) => setNova({ ...nova, script: e.target.value })}
              placeholder={"ABERTURA / MOTIVO / QUALIFICAÇÃO / FECHAMENTO — nunca 'fechar' na ligação"}
            />
          </label>
          <button
            className="primario"
            style={{ marginTop: 10 }}
            disabled={pendente || nova.nome.trim().length < 3}
            onClick={() => rodar("campanha criada", () => criarCampanha(nova))}
          >
            criar campanha
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>quem disca esta campanha</h2>
          {!sel ? <p className="mudo">nenhuma campanha no seu escopo</p> : (
            <>
              <p className="mudo" style={{ marginBottom: 8 }}>
                {sel.nome} — {sel.equipe.length ? sel.equipe.length + " pessoa(s) com acesso" : "só admin no momento"}
              </p>
              {sel.equipe.length ? (
                <table>
                  <thead><tr><th>pessoa</th><th>papel</th><th className="num">limite</th></tr></thead>
                  <tbody>
                    {sel.equipe.map((e) => (
                      <tr key={e.agente_id}>
                        <td>{e.nome}</td>
                        <td><span className={`chip ${e.papel === "supervisor" ? "chip-azul" : ""}`}>{e.papel}</span></td>
                        <td className="num">{e.limite_diario ?? "padrão"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div className="linha" style={{ marginTop: 10 }}>
                <label>
                  <span className="mudo">pessoa</span>
                  <input
                    list="camp-emails"
                    placeholder="nome <email>"
                    value={acesso.email}
                    onChange={(e) => setAcesso({ ...acesso, email: e.target.value.replace(/^.*<|>$/g, "").trim() })}
                  />
                  <datalist id="camp-emails">
                    {emails.map((m) => (<option key={m} value={m} />))}
                  </datalist>
                </label>
                <label>
                  <span className="mudo">papel</span>
                  <select value={acesso.papel} onChange={(e) => setAcesso({ ...acesso, papel: e.target.value })}>
                    <option value="operador">operador</option>
                    <option value="supervisor">supervisor</option>
                  </select>
                </label>
                <label>
                  <span className="mudo">limite diário</span>
                  <input value={acesso.limite} onChange={(e) => setAcesso({ ...acesso, limite: e.target.value })} placeholder="120" />
                </label>
              </div>
              <button
                disabled={pendente || !acesso.email.includes("@")}
                onClick={() =>
                  rodar("acesso concedido", () =>
                    definirAcesso({
                      campanhaId: sel.id,
                      email: acesso.email,
                      papel: acesso.papel === "supervisor" ? "supervisor" : "operador",
                      limiteDiario: acesso.limite ? Number(acesso.limite) : null,
                    })
                  )
                }
              >
                dar acesso a {sel.nome}
              </button>
            </>
          )}
        </div>
      </div>

      {erro ? <p className="alerta" style={{ marginTop: 12 }}>erro: {erro}</p> : null}
      {aviso ? <p className="ok" style={{ marginTop: 12 }}>{aviso}</p> : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>regras da campanha</h2>
        <div className="abas">
          {campanhas.map((c) => (
            <button
              key={c.id}
              onClick={() => abrir(c)}
              className={sel?.id === c.id ? "primario" : undefined}
              style={{ borderRadius: 999, padding: "6px 12px" }}
            >
              {c.nome}
            </button>
          ))}
        </div>

        {sel && form ? (
          <>
            <div className="linha">
              <label>
                <span className="mudo">nome</span>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </label>
              <label>
                <span className="mudo">início (Brasília)</span>
                <input type="time" value={form.janela_ini} onChange={(e) => setForm({ ...form, janela_ini: e.target.value })} />
              </label>
              <label>
                <span className="mudo">fim (Brasília)</span>
                <input type="time" value={form.janela_fim} onChange={(e) => setForm({ ...form, janela_fim: e.target.value })} />
              </label>
              <label>
                <span className="mudo">máx. tentativas (1–10)</span>
                <input value={String(form.max_tentativas)} onChange={(e) => setForm({ ...form, max_tentativas: Number(e.target.value) })} />
              </label>
              <label>
                <span className="mudo">intervalo de re-tentativa (segundos)</span>
                <input
                  value={String(form.intervalo_retentativa_s)}
                  onChange={(e) => setForm({ ...form, intervalo_retentativa_s: Number(e.target.value) })}
                />
              </label>
            </div>
            <label style={{ display: "block", marginTop: 8 }}>
              <span className="mudo">roteiro</span>
              <textarea rows={4} value={form.script_resumo ?? ""} onChange={(e) => setForm({ ...form, script_resumo: e.target.value })} />
            </label>
            <div className="linha" style={{ marginTop: 10 }}>
              <button
                disabled={pendente}
                onClick={() =>
                  rodar(form.ativo ? "campanha pausada" : "campanha ativada", () =>
                    editarCampanha({ id: sel.id, ativa: !form.ativo }).then((r) => {
                      if (r.ok) setForm({ ...form, ativo: !form.ativo });
                      return r;
                    })
                  )
                }
              >
                {form.ativo ? "pausar campanha" : "reativar campanha"}
              </button>
              <button
                disabled={pendente}
                onClick={() =>
                  rodar("overflow alterado", () =>
                    editarCampanha({ id: sel.id, permiteOverflow: !form.permite_overflow }).then((r) => {
                      if (r.ok) setForm({ ...form, permite_overflow: !form.permite_overflow });
                      return r;
                    })
                  )
                }
              >
                overflow: {form.permite_overflow ? "livre (pegar lead de outra campanha)" : "rígido (só a minha)"}
              </button>
              <button
                className="primario"
                disabled={pendente}
                onClick={() =>
                  rodar("regras salvas", () =>
                    editarCampanha({
                      id: sel.id,
                      nome: form.nome,
                      janelaIni: form.janela_ini,
                      janelaFim: form.janela_fim,
                      maxTentativas: form.max_tentativas,
                      intervaloRetentativaS: form.intervalo_retentativa_s,
                      script: form.script_resumo ?? "",
                    })
                  )
                }
              >
                salvar regras
              </button>
            </div>
            <p className="mudo" style={{ marginTop: 8 }}>
              Janela é o horário de Brasília medido no servidor (<code>fn_claim_next_lead</code>), não o
              relógio do navegador. Antes de 08:00 e depois de 21:00 a operação inteira para — é regra da
              Anatel 0303/2022, não preferência sua.
            </p>
          </>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>montar carteira</h2>
        <p className="mudo">
          {sel ? `${sel.na_fila} na fila · ${sel.atribuidos} já atribuídos · ${sel.total_leads} no total` : "escolha uma campanha acima"}
        </p>
        <div className="linha">
          <label>
            <span className="mudo">operador (vazio = rodízio entre o time)</span>
            <select value={distrib.agente} onChange={(e) => setDistrib({ ...distrib, agente: e.target.value })}>
              <option value="">rodízio balanceado</option>
              {(sel?.equipe ?? []).filter((e) => e.papel === "operador").map((e) => (
                <option key={e.agente_id} value={e.agente_id}>{e.nome}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mudo">quantidade (0 = tudo)</span>
            <input value={distrib.qtd} onChange={(e) => setDistrib({ ...distrib, qtd: e.target.value })} />
          </label>
          <button
            className="primario"
            disabled={pendente || !sel}
            onClick={() =>
              rodar("carteira montada", () =>
                atribuirCarteira({
                  campanhaId: sel?.id ?? "",
                  agenteId: distrib.agente || null,
                  qtd: Number(distrib.qtd) || 0,
                  modo: distrib.agente ? "quantidade" : "balanceado",
                })
              )
            }
          >
            atribuir leads
          </button>
        </div>
      </div>
    </>
  );
}
