"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bloquearTelefone, editarEmpresa, liberarTelefone } from "@/lib/acoes";
import type { BloqueioLinha, EmpresaInfo } from "@/lib/tipos";
import { OPC_DATA } from "@/lib/tempo";

const MOTIVOS: { valor: string; rotulo: string; prazo: string }[] = [
  { valor: "nao_me_perturbe", rotulo: "não me perturbe", prazo: "com prazo (padrão 30 dias)" },
  { valor: "opt_out", rotulo: "opt-out definitivo", prazo: "sem prazo" },
  { valor: "obito", rotulo: "falecimento", prazo: "sem prazo" },
  { valor: "jc", rotulo: "justiça / contestação", prazo: "sem prazo" },
  { valor: "menor", rotulo: "menor de idade", prazo: "sem prazo" },
  { valor: "fraude", rotulo: "suspeita de fraude", prazo: "sem prazo" },
  { valor: "sem_contato_30d", rotulo: "incontratável 30 dias", prazo: "30 dias" },
  { valor: "numero_invalido", rotulo: "número inexistente", prazo: "até higienizar a base" },
];

/**
 * Cadastro da empresa + a lista de quem não pode ser discado. É a tela do dono, e
 * o motivo de existir: LGPD sem nome de encarregado é declaração vaga, e lista de
 * bloqueio sem prazo vira "esquecemos este cliente para sempre".
 */
export default function PainelEmpresa({
  empresa,
  bloqueios,
  admin,
}: {
  empresa: EmpresaInfo | null;
  bloqueios: BloqueioLinha[];
  admin: boolean;
}) {
  const [nome, setNome] = useState(empresa?.nome ?? "");
  const [cnpj, setCnpj] = useState(empresa?.cnpj ?? "");
  const [telefone, setTelefone] = useState(empresa?.telefone ?? "");
  const [email, setEmail] = useState(empresa?.email ?? "");
  const [lgpd, setLgpd] = useState(empresa?.responsavel_lgpd ?? "");
  const [aviso, setAviso] = useState(empresa?.aviso_gravacao ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [tel, setTel] = useState("");
  const [motivo, setMotivo] = useState("nao_me_perturbe");
  const [dias, setDias] = useState("30");
  const [detalhe, setDetalhe] = useState("");
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <div className="grade" style={{ gridTemplateColumns: "1fr", marginBottom: 14 }}>
        <div className="card">
          <b>Quem é a empresa por trás da ligação</b>
          <p className="mudo" style={{ marginTop: 4 }}>
            O cliente que pergunta &ldquo;de onde vocês me ligaram?&rdquo; e o banco/INSS que audita a
            operação recebem resposta daqui. O encarregado de dados é exigência do art. 41 da LGPD;
            sem ele, o pedido de exclusão cai no e-mail genérico e ninguém responde no prazo.
          </p>
          <div className="grade" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <label><span className="mudo">razão social / nome fantasia</span>
              <input value={nome} disabled={!admin} onChange={(e) => setNome(e.target.value)} /></label>
            <label><span className="mudo">CNPJ (só dígitos)</span>
              <input value={cnpj} disabled={!admin} maxLength={14} onChange={(e) => setCnpj(e.target.value.replace(/\D/g, ""))} /></label>
            <label><span className="mudo">telefone oficial</span>
              <input value={telefone} disabled={!admin} onChange={(e) => setTelefone(e.target.value)} /></label>
            <label><span className="mudo">e-mail de contato</span>
              <input value={email} disabled={!admin} onChange={(e) => setEmail(e.target.value)} /></label>
            <label style={{ gridColumn: "1 / -1" }}><span className="mudo">encarregado de dados (LGPD art. 41)</span>
              <input value={lgpd} disabled={!admin} placeholder="nome + canal direto" onChange={(e) => setLgpd(e.target.value)} /></label>
            <label style={{ gridColumn: "1 / -1" }}><span className="mudo">aviso de abertura (se houver gravação)</span>
              <input value={aviso} disabled={!admin} placeholder="a frase lida no início da ligação"
                     onChange={(e) => setAviso(e.target.value)} /></label>
          </div>
          {admin ? (
            <button
              className="primario"
              disabled={pendente || nome.trim().length < 2}
              onClick={() =>
                iniciar(async () => {
                  const r = await editarEmpresa({
                    nome, cnpj, telefone, email, responsavelLgpd: lgpd, avisoGravacao: aviso,
                  });
                  setErro(r.ok ? null : r.erro);
                  setMsg(r.ok ? "cadastro salvo (a mudança fica na trilha de gestão)" : null);
                })
              }
            >
              salvar cadastro
            </button>
          ) : (
            <p className="mudo" style={{ marginBottom: 0 }}>só o admin (o dono) edita.</p>
          )}
          {erro ? <p className="alerta">{erro}</p> : null}
          {msg ? <p className="ok">{msg}</p> : null}
        </div>

        <div className="card">
          <b>Adicionar à lista de bloqueio</b>
          <p className="mudo" style={{ marginTop: 4 }}>
            Bloqueio temporário volta sozinho para a fila quando vence — o claim confere
            <code> expira_em </code> antes de entregar qualquer lead. Opt-out, falecimento e fraude não
            admitem prazo: são definitivos, e o banco recusa se você tentar.
          </p>
          <div className="linha" style={{ alignItems: "flex-end", marginTop: 8 }}>
            <label style={{ flex: "1 1 180px" }}><span className="mudo">telefone (+55…)</span>
              <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+5579999990001" /></label>
            <label><span className="mudo">motivo</span>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {MOTIVOS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
              </select></label>
            <label style={{ flex: "0 1 90px" }}><span className="mudo">prazo (dias)</span>
              <input type="number" min={1} value={dias} disabled={["opt_out", "obito", "fraude", "jc", "menor"].includes(motivo)}
                     onChange={(e) => setDias(e.target.value)} /></label>
            <label style={{ flex: "1 1 180px" }}><span className="mudo">detalhe</span>
              <input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} /></label>
            <button
              className="primario"
              disabled={pendente || tel.replace(/\D/g, "").length < 10}
              onClick={() =>
                iniciar(async () => {
                  const r = await bloquearTelefone({
                    telefone: tel,
                    motivo,
                    dias: ["opt_out", "obito", "fraude", "jc", "menor"].includes(motivo) ? null : Number(dias) || null,
                    detalhe,
                  });
                  setErro(r.ok ? null : r.erro);
                  setMsg(r.ok ? `bloqueado (afetou ${r.data.leads_afetados} lead(s) da base)` : null);
                  if (r.ok) { setTel(""); setDetalhe(""); }
                })
              }
            >
              bloquear
            </button>
          </div>
          {erro ? <p className="alerta" style={{ marginBottom: 0 }}>{erro}</p> : null}
          {msg ? <p className="ok" style={{ marginBottom: 0 }}>{msg}</p> : null}
        </div>
      </div>

      <h2>Lista de bloqueio ({bloqueios.length})</h2>
      <div className="rolagem">
        <table>
          <thead>
            <tr><th>telefone</th><th>motivo</th><th className="num">leads</th><th className="num">vivos</th>
                <th>origem</th><th>por quem</th><th>libera em</th><th>detalhe</th><th></th></tr>
          </thead>
          <tbody>
            {bloqueios.map((b) => (
              <tr key={b.telefone_e164}>
                <td className="mudo">{b.telefone_e164}</td>
                <td><span className={`chip ${b.expira_em ? "chip-ambar" : "chip-vermelho"}`}>{b.motivo}</span></td>
                <td className="num">{b.leads}</td>
                <td className="num">{b.leads_vivos}</td>
                <td className="mudo">{b.origem}</td>
                <td className="mudo">{(b as { criado_por?: string }).criado_por ?? "—"}</td>
                <td className="mudo">
                  {b.expira_em ? new Date(b.expira_em).toLocaleDateString("pt-BR", OPC_DATA) : "nunca"}
                </td>
                <td className="mudo">{b.detalhe ?? "—"}</td>
                <td>
                  {admin ? (
                    <button
                      disabled={pendente}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await liberarTelefone(b.telefone_e164);
                          setErro(r.ok ? null : r.erro);
                        })
                      }
                    >
                      liberar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!bloqueios.length ? (
              <tr><td colSpan={9} className="mudo">nenhum número bloqueado — opt-outs registrados aparecem aqui</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mudo">
        A porta de entrada externa (webhook de lead) é ligada por campanha em{" "}
        <Link href="/campanhas">Campanhas</Link>, na aba <i>Tabulação, meta e porta de entrada</i>.
      </p>
    </>
  );
}
