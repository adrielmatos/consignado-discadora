"use client";

import { useState, useTransition } from "react";
import {
  convidarOperador,
  definirAcesso,
  definirPapel,
  despausar,
  liberarCarteira,
  meuPerfil,
  pausar,
  removerAcesso,
} from "@/lib/acoes";

type Linha = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  auth_id: string | null;
  campanhas: string[];
  pausado_ate: string | null;
  discadas_hoje: number;
  limite_diario: number;
};

type Props = {
  admin: boolean;
  gerencia: boolean;
  meuId: string;
  convide: string | null;
  equipe: Linha[];
  campanhas: { id: string; nome: string; ativo: boolean }[];
};

/**
 * Painel de equipe. Cada botão chama uma RPC que revalida papel dentro do banco:
 * esta tela esconde o que você não pode fazer, mas a resposta "não" viria do
 * Postgres de qualquer forma — é assim que se mantém confiável com 10 pessoas.
 */
export default function PainelEquipe({ admin, gerencia, meuId, convide, equipe, campanhas }: Props) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convite, setConvite] = useState({ email: "", nome: "", celular: "", papel: "operador", limite: "120" });
  const [acesso, setAcesso] = useState({
    campanha: campanhas[0]?.id ?? "",
    email: "",
    papel: "operador",
    limite: "",
  });
  const [celular, setCelular] = useState("");

  function rodar(rotulo: string, fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return setErro(r.erro ?? `${rotulo} falhou`);
      setAviso(`${rotulo} ok`);
    });
  }

  return (
    <>
      {admin ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>convidar operador</h2>
          <p className="mudo">
            Cria o login no Supabase Auth (convite por e-mail) e a linha em <code>agentes</code>. Sem a
            linha de acesso abaixo, a pessoa loga e não recebe fila.
          </p>
          <div className="linha">
            <label>
              <span className="mudo">nome</span>
              <input value={convite.nome} onChange={(e) => setConvite({ ...convite, nome: e.target.value })} />
            </label>
            <label>
              <span className="mudo">e-mail</span>
              <input value={convite.email} onChange={(e) => setConvite({ ...convite, email: e.target.value })} />
            </label>
            <label>
              <span className="mudo">celular no Phone Link</span>
              <input value={convite.celular} onChange={(e) => setConvite({ ...convite, celular: e.target.value })} placeholder="+5579..." />
            </label>
            <label>
              <span className="mudo">papel</span>
              <select value={convite.papel} onChange={(e) => setConvite({ ...convite, papel: e.target.value })}>
                <option value="operador">operador</option>
                <option value="supervisor">supervisor</option>
              </select>
            </label>
            <label>
              <span className="mudo">limite diário</span>
              <input value={convite.limite} onChange={(e) => setConvite({ ...convite, limite: e.target.value })} />
            </label>
          </div>
          <button
            className="primario"
            disabled={pendente || !convite.email.includes("@") || convite.nome.trim().length < 2}
            onClick={() =>
              rodar("convite", () =>
                convidarOperador({
                  email: convite.email,
                  nome: convite.nome,
                  celular: convite.celular,
                  papel: convite.papel === "supervisor" ? "supervisor" : "operador",
                  limiteDiario: Number(convite.limite) || undefined,
                })
              )
            }
          >
            enviar convite
          </button>
        </div>
      ) : null}

      {convide ? <p className="alerta" style={{ marginTop: 16 }}>{convide}</p> : null}
      {erro ? <p className="alerta" style={{ marginTop: 12 }}>erro: {erro}</p> : null}
      {aviso ? <p className="ok" style={{ marginTop: 12 }}>{aviso}</p> : null}

      {gerencia ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>acesso a campanha</h2>
          <p className="mudo">
            É isto que coloca (ou tira) alguém da fila. Papel <b>operador</b> disca; <b>supervisor</b>{" "}
            ainda edita a campanha e monta carteira.
          </p>
          <div className="linha">
            <label>
              <span className="mudo">campanha</span>
              <select value={acesso.campanha} onChange={(e) => setAcesso({ ...acesso, campanha: e.target.value })}>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}{c.ativo ? "" : " (pausada)"}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mudo">e-mail da pessoa</span>
              <input
                list="eq-emails"
                value={acesso.email}
                onChange={(e) => setAcesso({ ...acesso, email: e.target.value })}
              />
              <datalist id="eq-emails">
                {equipe.map((p) => (
                  <option key={p.id} value={p.email} />
                ))}
              </datalist>
            </label>
            <label>
              <span className="mudo">papel na campanha</span>
              <select value={acesso.papel} onChange={(e) => setAcesso({ ...acesso, papel: e.target.value })}>
                <option value="operador">operador</option>
                <option value="supervisor">supervisor</option>
              </select>
            </label>
            <label>
              <span className="mudo">limite diário (vazio = padrão)</span>
              <input value={acesso.limite} onChange={(e) => setAcesso({ ...acesso, limite: e.target.value })} />
            </label>
          </div>
          <div className="linha">
            <button
              className="primario"
              disabled={pendente || !acesso.campanha || !acesso.email.includes("@")}
              onClick={() =>
                rodar("acesso salvo", () =>
                  definirAcesso({
                    campanhaId: acesso.campanha,
                    email: acesso.email,
                    papel: acesso.papel === "supervisor" ? "supervisor" : "operador",
                    limiteDiario: acesso.limite ? Number(acesso.limite) : null,
                  })
                )
              }
            >
              dar acesso
            </button>
            <button
              disabled={pendente || !acesso.campanha || !acesso.email.includes("@")}
              onClick={() =>
                rodar("acesso removido", () =>
                  removerAcesso({ campanhaId: acesso.campanha, email: acesso.email })
                )
              }
            >
              remover acesso
            </button>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>minha linha</h2>
        <p className="mudo">
          O celular é o número que o Phone Link mostra para o agente achar a sua conversa no aplicativo.
        </p>
        <div className="linha">
          <label>
            <span className="mudo">celular do Phone Link</span>
            <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="+5579..." />
          </label>
          <button
            disabled={pendente || !celular.trim()}
            onClick={() => rodar("perfil salvo", () => meuPerfil({ celular }))}
          >
            salvar
          </button>
        </div>
      </div>

      {gerencia && equipe.length > 1 ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>pessoas</h2>
          <div className="rolagem">
            <table>
              <thead>
                <tr><th>nome</th><th>e-mail</th><th>papel global</th><th>pausa</th><th>ações</th></tr>
              </thead>
              <tbody>
                {equipe.map((p) => {
                  const pausado = Boolean(p.pausado_ate && new Date(p.pausado_ate) > new Date());
                  return (
                    <tr key={p.id}>
                      <td>{p.nome}{p.id === meuId ? " (você)" : ""}</td>
                      <td className="mudo">{p.email}</td>
                      <td>
                        {admin ? (
                          <select
                            value={p.papel}
                            disabled={pendente}
                            onChange={(e) =>
                              rodar(`papel de ${p.nome}`, () =>
                                definirPapel({
                                  agenteId: p.id,
                                  papel: e.target.value === "admin" ? "admin" : e.target.value === "supervisor" ? "supervisor" : "operador",
                                })
                              )
                            }
                          >
                            <option value="operador">operador</option>
                            <option value="supervisor">supervisor</option>
                            <option value="admin">admin</option>
                          </select>
                        ) : (
                          <span className="chip">{p.papel}</span>
                        )}
                      </td>
                      <td>
                        {pausado ? <span className="chip chip-ambar">pausado</span> : <span className="chip chip-verde">livre</span>}
                      </td>
                      <td>
                        <div className="linha" style={{ gap: 6 }}>
                          {pausado ? (
                            <button
                              disabled={pendente}
                              onClick={() => rodar(`${p.nome} despausado`, () => despausar(p.id))}
                            >
                              despausar
                            </button>
                          ) : (
                            <button
                              disabled={pendente || p.id === meuId}
                              onClick={() => rodar(`${p.nome} pausado`, () => pausar(30, p.id))}
                            >
                              pausar 30 min
                            </button>
                          )}
                          <button
                            disabled={pendente}
                            onClick={() =>
                              rodar("carteira devolvida ao pool", () =>
                                liberarCarteira({ agenteId: p.id, campanhaId: acesso.campanha || null })
                              )
                            }
                          >
                            liberar carteira
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
