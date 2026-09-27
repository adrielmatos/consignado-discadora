"use client";

import { useState, useTransition } from "react";
import { marcarAnuencia } from "@/lib/acoes";
import { OPC_DATA } from "@/lib/tempo";

export type LinhaAnuencia = {
  proposta_id: string;
  lead_id: number;
  nome: string | null;
  telefone_e164: string;
  valor: number;
  parcelas: number;
  anuencia: string;
  enviada_em: string;
  prazo_validade: string;
  dias_restantes: number;
  responsavel: string | null;
};

/**
 * Marcar o resultado da anuência é a única coisa nesta tela que muda dinheiro:
 * confirmada → proposta segue; recusada/expirada → o lead volta para recuperação.
 * Por isso o botões só aparecem para supervisor+ (o banco revalida de qualquer
 * jeito dentro de `fn_marcar_anuencia`).
 */
export default function PainelAnuencia({ linhas, gerencia }: { linhas: LinhaAnuencia[]; gerencia: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [protocolo, setProtocolo] = useState<Record<string, string>>({});

  function marcar(propostaId: string, estado: "confirmada" | "recusada" | "expirada") {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      const r = await marcarAnuencia({
        propostaId,
        anuencia: estado,
        protocolo: protocolo[propostaId] || undefined,
      });
      if (!r.ok) return setErro(r.erro);
      setAviso(`anuência marcada como ${estado} — recarregue a tela`);
    });
  }

  return (
    <>
      {erro ? <p className="alerta">erro: {erro}</p> : null}
      {aviso ? <p className="ok">{aviso}</p> : null}
      <div className="rolagem">
        <table>
          <thead>
            <tr><th>lead</th><th>telefone</th><th className="num">valor</th><th className="num">parcelas</th>
                <th>status</th><th>enviada</th><th className="num">dias restantes</th><th>responsável</th>
                {gerencia ? <th>marcar resultado</th> : null}</tr>
          </thead>
          <tbody>
            {linhas.map((a) => (
              <tr key={a.proposta_id}>
                <td>{a.nome ?? `#${a.lead_id}`}</td>
                <td className="mudo">{a.telefone_e164}</td>
                <td className="num">R$ {Number(a.valor).toLocaleString("pt-BR")}</td>
                <td className="num">{a.parcelas}</td>
                <td>{a.anuencia}</td>
                <td className="mudo">{new Date(a.enviada_em).toLocaleDateString("pt-BR", OPC_DATA)}</td>
                <td className="num" style={{ color: a.dias_restantes <= 2 ? "#f87171" : undefined }}>
                  {a.dias_restantes}
                </td>
                <td className="mudo">{a.responsavel ?? "—"}</td>
                {gerencia ? (
                  <td>
                    <div className="linha" style={{ gap: 6 }}>
                      <input
                        style={{ flex: "2 1 120px" }}
                        placeholder="protocolo INSS"
                        value={protocolo[a.proposta_id] ?? ""}
                        onChange={(e) => setProtocolo({ ...protocolo, [a.proposta_id]: e.target.value })}
                      />
                      <button disabled={pendente} onClick={() => marcar(a.proposta_id, "confirmada")}>confirmada</button>
                      <button disabled={pendente} onClick={() => marcar(a.proposta_id, "recusada")}>recusada</button>
                      <button disabled={pendente} onClick={() => marcar(a.proposta_id, "expirada")}>expirada</button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {linhas.length === 0 ? (
              <tr><td colSpan={gerencia ? 9 : 8} className="mudo">nenhuma proposta aguardando anuência</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mudo" style={{ marginTop: 8 }}>
        O prazo de 5 dias corridos é do INSS (validação biométrica no Meu INSS). Sem anuência, a
        proposta expira sozinha — discar de novo para "fechar" não adianta e é infração.
      </p>
    </>
  );
}
