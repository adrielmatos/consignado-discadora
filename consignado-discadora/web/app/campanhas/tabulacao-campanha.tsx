"use client";

import { useState, useTransition } from "react";
import { editarCampanha, salvarFormulario } from "@/lib/acoes";
import type { CampoFormulario } from "@/lib/tipos";

export type CampanhaTabulavel = {
  id: string;
  nome: string;
  meta_diaria: number | null;
  formulario: CampoFormulario[];
  webhook_ativo: boolean;
  webhook_token: string | null;
};

const TIPOS: { valor: CampoFormulario["tipo"]; rotulo: string }[] = [
  { valor: "texto", rotulo: "texto" },
  { valor: "numero", rotulo: "número" },
  { valor: "sim_nao", rotulo: "sim/não" },
  { valor: "selecao", rotulo: "lista" },
  { valor: "data", rotulo: "data" },
  { valor: "telefone", rotulo: "telefone" },
];

/**
 * Duas coisas que decidem o dia a dia da equipe e por isso moram na campanha:
 * o formulário de tabulação (o que tem de ser perguntado e registrado) e a meta
 * do dia. O webhook aparece aqui porque é a única porta de entrada externa do
 * sistema — o token é segredo e só a gestão vê.
 */
export default function TabulacaoCampanha({
  campanhas,
  podeEditar,
  podeWebhook,
}: {
  campanhas: CampanhaTabulavel[];
  podeEditar: boolean;
  podeWebhook: boolean;
}) {
  const [alvo, setAlvo] = useState(campanhas[0]?.id ?? "");
  const camp = campanhas.find((c) => c.id === alvo);
  const [campos, setCampos] = useState<CampoFormulario[]>(camp?.formulario ?? []);
  const [meta, setMeta] = useState(String(camp?.meta_diaria ?? ""));
  const [ativo, setAtivo] = useState(Boolean(camp?.webhook_ativo));
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function trocar(id: string) {
    setAlvo(id);
    const c = campanhas.find((x) => x.id === id);
    setCampos(c?.formulario ?? []);
    setMeta(String(c?.meta_diaria ?? ""));
    setAtivo(Boolean(c?.webhook_ativo));
    setMsg(null);
    setErro(null);
  }

  function setCampo(i: number, patch: Partial<CampoFormulario>) {
    setCampos((atual) => atual.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="card">
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 220px" }}>
          <span className="mudo">campanha</span>
          <select value={alvo} onChange={(e) => trocar(e.target.value)}>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <label style={{ flex: "0 1 130px" }}>
          <span className="mudo">meta de contatos/dia</span>
          <input type="number" min={1} max={2000} value={meta} disabled={!podeEditar}
                 onChange={(e) => setMeta(e.target.value)} />
        </label>
        <button
          className="primario"
          disabled={!podeEditar || pendente}
          onClick={() =>
            iniciar(async () => {
              const f = await salvarFormulario({ campanhaId: alvo, campos });
              if (!f.ok) return setErro(f.erro);
              const m = await editarCampanha({
                id: alvo,
                metaDiaria: meta.trim() === "" ? null : Number(meta),
              });
              setErro(m.ok ? null : m.erro);
              setMsg(m.ok ? `${campos.length} campos salvos; meta aplicada` : null);
            })
          }
        >
          salvar tabulação e meta
        </button>
      </div>

      {erro ? <p className="alerta">{erro}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <p className="mudo" style={{ marginBottom: 8 }}>
        campo marcado como obrigatório trava o <b>qualificar lead</b> na tela do operador até ser
        preenchido — é assim que a qualificação deixa de ser &ldquo;se lembrar, anota&rdquo;.
      </p>

      <div className="rolagem">
        <table>
          <thead>
            <tr><th>chave (minúscula)</th><th>rótulo visto pelo operador</th><th>tipo</th>
                <th>opções (vírgula)</th><th className="num">obrigatório</th><th></th></tr>
          </thead>
          <tbody>
            {campos.map((c, i) => (
              <tr key={i}>
                <td><input value={c.chave} disabled={!podeEditar} style={{ width: 160 }}
                           onChange={(e) => setCampo(i, { chave: e.target.value })} /></td>
                <td><input value={c.rotulo} disabled={!podeEditar} style={{ minWidth: 220 }}
                           onChange={(e) => setCampo(i, { rotulo: e.target.value })} /></td>
                <td>
                  <select value={c.tipo} disabled={!podeEditar}
                          onChange={(e) => setCampo(i, { tipo: e.target.value as CampoFormulario["tipo"] })}>
                    {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </select>
                </td>
                <td><input value={(c.opcoes ?? []).join(",")} disabled={!podeEditar || c.tipo !== "selecao"}
                           placeholder="alto, medio, baixo"
                           onChange={(e) =>
                             setCampo(i, { opcoes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })
                           } /></td>
                <td className="num">
                  <input type="checkbox" checked={c.obrigatorio !== false} disabled={!podeEditar}
                         onChange={(e) => setCampo(i, { obrigatorio: e.target.checked })} />
                </td>
                <td>
                  <button disabled={!podeEditar} onClick={() => setCampos((a) => a.filter((_, k) => k !== i))}>
                    tirar
                  </button>
                </td>
              </tr>
            ))}
            {!campos.length ? (
              <tr><td colSpan={6} className="mudo">nenhum campo — o operador qualifica só com a nota</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <button
        disabled={!podeEditar}
        onClick={() =>
          setCampos((a) => [
            ...a,
            { chave: `campo_${a.length + 1}`, rotulo: "novo campo", tipo: "texto", obrigatorio: false },
          ])
        }
      >
        + campo
      </button>

      <h2 style={{ marginTop: 18 }}>Entrada de lead pelo site (webhook)</h2>
      <div className="linha" style={{ alignItems: "flex-end" }}>
        <label>
          <span className="mudo">porta aberta</span>
          <div style={{ marginTop: 4 }}>
            <input type="checkbox" checked={ativo} disabled={!podeWebhook}
                   onChange={(e) => setAtivo(e.target.checked)} />{" "}
            <span className="mudo">{ativo ? "aceitando POST" : "fechada"}</span>
          </div>
        </label>
        <button
          className="primario"
          disabled={!podeWebhook || pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await editarCampanha({ id: alvo, webhookAtivo: ativo });
              setErro(r.ok ? null : r.erro);
              setMsg(r.ok ? `webhook ${ativo ? "aberto" : "fechado"} para ${camp?.nome ?? "campanha"}` : null);
            })
          }
        >
          aplicar
        </button>
      </div>
      {camp?.webhook_token ? (
        <>
          <pre className="mudo" style={{ overflowX: "auto", padding: 10, border: "1px solid var(--linha)", borderRadius: 10 }}>
{`POST ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/leads
content-type: application/json

{
  "token": "${camp.webhook_token}",
  "lead": {
    "nome": "Quem preencheu o formulário",
    "telefone_e164": "+5579999990001",
    "cpf": "52998224725",
    "cidade": "Aracaju", "uf": "SE",
    "margem_estimada": "420",
    "consentimento": "form_proprio"
  }
}`}
          </pre>
          <p className="mudo">
            `consentimento` é obrigatório e só aceita o que foi obtido com o titular
            (`form_proprio`, `app_banco`, `presencial`, `lista_compartilhada`). Número em lista de
            bloqueio é recusado, e acima de 30 leads por minuto a campanha recusa o lote — site
            mal configurado não inunda a fila.
          </p>
        </>
      ) : (
        <p className="mudo">token visível só para supervisor/admin da campanha.</p>
      )}
    </div>
  );
}
