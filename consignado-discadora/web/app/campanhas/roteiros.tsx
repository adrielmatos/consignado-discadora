"use client";

import { useState, useTransition } from "react";
import { atribuirRoteiro, salvarRoteiro } from "@/lib/acoes";
import type { ObjecaoRoteiro, PassoRoteiro, Roteiro } from "@/lib/tipos";

type PassoEdicao = { titulo: string; texto: string; obrigatorio: boolean };
type ObjecaoEdicao = { objecao: string; resposta: string; proibido: string };

const PUBLICOS = ["inss", "bpc_loas", "clt", "servidor", "fgts"];

function vazio() {
  return {
    nome: "",
    publico: "inss",
    aviso: "",
    ativo: false,
    passos: [
      { titulo: "ABERTURA — só informação", texto: "", obrigatorio: true },
    ] as PassoEdicao[],
    objecoes: [] as ObjecaoEdicao[],
  };
}

/**
 * Editor do roteiro aprovado. Fica na tela de campanhas porque é material de
 * operação (não adorno): o texto daqui é o que o operador vê no cartão da ligação,
 * e cada mudança de conteúdo sobe a versão com a anterior guardada em
 * `auditoria_gestao`.
 */
export default function EditorRoteiros({
  roteiros,
  campanhas,
  gerencia,
}: {
  roteiros: Roteiro[];
  campanhas: { id: string; nome: string; roteiro_id: string | null }[];
  gerencia: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [sel, setSel] = useState<Roteiro | null>(roteiros.find((r) => r.ativo) ?? roteiros[0] ?? null);
  const [form, setForm] = useState(() =>
    sel
      ? {
          nome: sel.nome,
          publico: sel.publico,
          aviso: sel.aviso_compliance ?? "",
          ativo: sel.ativo,
          passos: sel.passos.map((p) => ({
            titulo: p.titulo,
            texto: p.texto,
            obrigatorio: p.obrigatorio,
          })),
          objecoes: sel.objecoes.map((o) => ({
            objecao: o.objecao,
            resposta: o.resposta,
            proibido: o.proibido ?? "",
          })),
        }
      : vazio()
  );
  const [campanha, setCampanha] = useState(campanhas[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function escolher(r: Roteiro) {
    setSel(r);
    setErro(null);
    setAviso(null);
    setForm({
      nome: r.nome,
      publico: r.publico,
      aviso: r.aviso_compliance ?? "",
      ativo: r.ativo,
      passos: r.passos.map((p) => ({ titulo: p.titulo, texto: p.texto, obrigatorio: p.obrigatorio })),
      objecoes: r.objecoes.map((o) => ({ objecao: o.objecao, resposta: o.resposta, proibido: o.proibido ?? "" })),
    });
  }

  function mexerPasso(i: number, mud: Partial<PassoEdicao>) {
    setForm((f) => ({ ...f, passos: f.passos.map((p, j) => (i === j ? { ...p, ...mud } : p)) }));
  }
  function mexerObj(i: number, mud: Partial<ObjecaoEdicao>) {
    setForm((f) => ({ ...f, objecoes: f.objecoes.map((o, j) => (i === j ? { ...o, ...mud } : o)) }));
  }
  function mover(arr: "passos" | "objecoes", i: number, dir: -1 | 1) {
    setForm((f) => {
      const lista = [...f[arr]];
      const j = i + dir;
      if (j < 0 || j >= lista.length) return f;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      return { ...f, [arr]: lista };
    });
  }

  function salvar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await salvarRoteiro({
        id: sel?.id ?? null,
        nome: form.nome,
        publico: form.publico,
        avisoCompliance: form.aviso,
        ativo: form.ativo,
        passos: form.passos,
        objecoes: form.objecoes.map((o) => ({
          objecao: o.objecao,
          resposta: o.resposta,
          proibido: o.proibido || null,
        })) as ObjecaoRoteiro[],
      });
      if (!r.ok) return setErro(r.erro);
      setAviso(`gravado como versão ${r.data.versao} — ${r.data.passos} passos, ${r.data.objecoes} objeções`);
    });
  }

  function usar() {
    setErro(null);
    setAviso(null);
    if (!sel) return;
    iniciar(async () => {
      const r = await atribuirRoteiro({ campanhaId: campanha, roteiroId: sel.id });
      if (!r.ok) return setErro(r.erro);
      setAviso(`roteiro “${sel.nome}” v${sel.versao} apontado para a campanha`);
    });
  }

  if (!gerencia) {
    return (
      <p className="alerta">
        O roteiro é material de operação: só <b>supervisor</b> (da campanha) ou <b>admin</b> edita. No
        seu painel ele aparece pronto, junto com o lead.
      </p>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>roteiro de ligação</h2>

      <div className="abas">
        {roteiros.map((r) => (
          <button
            key={r.id}
            onClick={() => escolher(r)}
            className={sel?.id === r.id ? "primario" : undefined}
            style={{ borderRadius: 999, padding: "6px 12px" }}
          >
            {r.nome} <span className="mudo">v{r.versao}{r.ativo ? "" : " · rascunho"}{r.em_uso ? ` · ${r.em_uso} camp.` : ""}</span>
          </button>
        ))}
        <button
          onClick={() => {
            setSel(null);
            setForm(vazio());
            setErro(null);
            setAviso("novo roteiro — preencha e salve");
          }}
        >
          + roteiro
        </button>
      </div>

      {erro ? <p className="alerta">erro: {erro}</p> : null}
      {aviso ? <p className="ok">{aviso}</p> : null}

      <div className="linha" style={{ marginTop: 10 }}>
        <label style={{ flex: "2 1 200px" }}>
          <span className="mudo">nome</span>
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </label>
        <label>
          <span className="mudo">público</span>
          <select value={form.publico} onChange={(e) => setForm({ ...form, publico: e.target.value })}>
            {PUBLICOS.map((pu) => (
              <option key={pu} value={pu}>{pu}</option>
            ))}
          </select>
        </label>
        <label style={{ alignSelf: "end" }}>
          <span className="mudo">situação</span>
          <div className="linha" style={{ gap: 6 }}>
            <button onClick={() => setForm({ ...form, ativo: !form.ativo })}>
              {form.ativo ? "ativo — deixar rascunho" : "rascunho — ativar"}
            </button>
          </div>
        </label>
      </div>

      <label style={{ display: "block", marginTop: 8 }}>
        <span className="mudo">
          aviso de compliance (topo do cartão do operador — o que é proibido dizer)
        </span>
        <textarea
          rows={3}
          value={form.aviso}
          onChange={(e) => setForm({ ...form, aviso: e.target.value })}
          placeholder="PROIBIDO: fechar contratação por telefone; pedir senha ou código; embutir seguro prestamista…"
        />
      </label>

      <h3>Passos ({form.passos.length})</h3>
      {form.passos.map((s, i) => (
        <div className="linha" key={i} style={{ alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ flex: "1 1 220px" }}>
            <input
              placeholder={`passo ${i + 1}: título`}
              value={s.titulo}
              onChange={(e) => mexerPasso(i, { titulo: e.target.value })}
            />
          </div>
          <div style={{ flex: "3 1 300px" }}>
            <textarea
              rows={2}
              placeholder="o que falar/perguntar neste passo"
              value={s.texto}
              onChange={(e) => mexerPasso(i, { texto: e.target.value })}
            />
          </div>
          <label style={{ flex: "0 0 auto", alignSelf: "center" }}>
            <input
              type="checkbox"
              checked={s.obrigatorio}
              onChange={(e) => mexerPasso(i, { obrigatorio: e.target.checked })}
            />{" "}
            <span className="mudo">obrig.</span>
          </label>
          <div style={{ alignSelf: "center", display: "flex", gap: 4 }}>
            <button onClick={() => mover("passos", i, -1)} aria-label="subir">↑</button>
            <button onClick={() => mover("passos", i, 1)} aria-label="descer">↓</button>
            <button
              onClick={() => setForm({ ...form, passos: form.passos.filter((_, j) => j !== i) })}
              aria-label="remover"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button onClick={() => setForm({ ...form, passos: [...form.passos, { titulo: "", texto: "", obrigatorio: true }] })}>
        + passo
      </button>

      <h3>Objeções ({form.objecoes.length})</h3>
      {form.objecoes.map((o, i) => (
        <div className="grade-2" key={i} style={{ marginBottom: 8 }}>
          <div>
            <span className="mudo">o cliente diz</span>
            <input value={o.objecao} onChange={(e) => mexerObj(i, { objecao: e.target.value })} />
            <textarea
              rows={2}
              style={{ marginTop: 6 }}
              placeholder="resposta aprovada"
              value={o.resposta}
              onChange={(e) => mexerObj(i, { resposta: e.target.value })}
            />
          </div>
          <div>
            <span className="mudo">o que NÃO pode fazer em seguida</span>
            <textarea
              rows={2}
              value={o.proibido}
              onChange={(e) => mexerObj(i, { proibido: e.target.value })}
            />
            <div className="linha" style={{ marginTop: 6 }}>
              <button onClick={() => mover("objecoes", i, -1)}>↑</button>
              <button onClick={() => mover("objecoes", i, 1)}>↓</button>
              <button onClick={() => setForm({ ...form, objecoes: form.objecoes.filter((_, j) => j !== i) })}>
                remover
              </button>
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          setForm({ ...form, objecoes: [...form.objecoes, { objecao: "", resposta: "", proibido: "" }] })
        }
      >
        + objeção
      </button>

      <div className="linha" style={{ marginTop: 12 }}>
        <button className="primario" disabled={pendente} onClick={salvar}>
          salvar roteiro {sel ? `(vira v${sel.versao + 1} se mexer em passo/objeção)` : ""}
        </button>
        {sel ? (
          <>
            <label style={{ flex: "1 1 200px" }}>
              <span className="mudo">usar este roteiro na campanha</span>
              <select value={campanha} onChange={(e) => setCampanha(e.target.value)}>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.roteiro_id === sel.id ? " (usa este)" : c.roteiro_id ? " (tem outro)" : " (sem roteiro)"}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={pendente || !sel.ativo} onClick={usar}>
              apontar para a campanha
            </button>
          </>
        ) : null}
      </div>
      {sel && !sel.ativo ? (
        <p className="mudo">
          Este roteiro está como rascunho: o operador não o recebe e a campanha não pode apontá-lo.
          Ative quando o compliance aprovar o texto.
        </p>
      ) : null}
    </div>
  );
}
