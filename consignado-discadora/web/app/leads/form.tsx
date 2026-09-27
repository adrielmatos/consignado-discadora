"use client";

import { useState, useTransition } from "react";
import { importarLeads } from "@/lib/acoes";

const CONSENTIMENTOS = [
  { v: "form_proprio", r: "formulário próprio com aceite (recomendado)" },
  { v: "app_banco", r: "autorização registrada no app/ambiente do banco" },
  { v: "presencial", r: "autorização presencial assinada" },
  { v: "lista_compartilhada", r: "lista de terceiros — validar base legal antes" },
];

const EXEMPLO =
  "Nome do Beneficiário;Telefone;CPF;Município;UF;Banco do Benefício;Margem Consignável;Matrícula\n" +
  'Maria de teste;(79) 99999-0001;529.982.247-25;Aracaju;SE;Itaú;"R$ 350,00";1234567\n' +
  "Jose de teste;79988880002;987.654.321-00;N. Sra. do Socorro;SE;Banco do Brasil;510,00;\n";

export default function FormImportacao({ campanhas }: { campanhas: { id: string; nome: string }[] }) {
  const [csv, setCsv] = useState("");
  const [campanha, setCampanha] = useState(campanhas[0]?.id ?? "");
  const [consentimento, setConsentimento] = useState(CONSENTIMENTOS[0].v);
  const [saida, setSaida] = useState<string[] | null>(null);
  const [pendente, iniciar] = useTransition();

  function colarExemplo() {
    setCsv(EXEMPLO);
  }

  function enviar() {
    setSaida(null);
    iniciar(async () => {
      const r = await importarLeads({ campanhaId: campanha, consentimento, csv });
      if (!r.ok) {
        setSaida([`erro: ${r.erro}`]);
        return;
      }
      const d = r.data;
      const mensagens = [
        `gravados na fila: ${d.aceitos}` +
          (d.ignorados.length ? ` · ignoradas: ${d.ignorados.length}` : "") +
          (d.preservadas ? ` · ${d.preservadas} colunas extras preservadas` : ""),
      ];
      if (d.colunas.length) mensagens.push(`colunas reconhecidas: ${d.colunas.join(", ")}`);
      for (const ign of d.ignorados.slice(0, 8)) mensagens.push(`linha ${ign.linha}: ${ign.motivo}`);
      if (d.ignorados.length > 8) mensagens.push(`… e mais ${d.ignorados.length - 8} linhas ignoradas`);
      for (const aviso of d.avisos) mensagens.push(`aviso: ${aviso}`);
      for (const erro of d.erros) mensagens.push(`erro: ${erro}`);
      setSaida(mensagens);
      if (d.aceitos > 0) setCsv("");
    });
  }

  return (
    <div className="card">
      <div className="linha">
        <label>
          <span className="mudo">campanha</span>
          <select value={campanha} onChange={(e) => setCampanha(e.target.value)}>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mudo">base legal do contato (LGPD)</span>
          <select value={consentimento} onChange={(e) => setConsentimento(e.target.value)}>
            {CONSENTIMENTOS.map((c) => (
              <option key={c.v} value={c.v}>{c.r}</option>
            ))}
          </select>
        </label>
      </div>

      <textarea
        rows={8}
        style={{ marginTop: 10 }}
        placeholder={"aceita CSV ou TXT com , ; TAB — com ou sem linha de cabeçalho"}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />

      <div className="linha" style={{ marginTop: 10 }}>
        <button onClick={colarExemplo} type="button">colar exemplo</button>
        <button className="primario" onClick={enviar} disabled={pendente || !csv.trim()}>
          importar para a fila
        </button>
      </div>

      {saida ? (
        <ul className="ok" style={{ marginTop: 10 }}>
          {saida.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : null}

      <p className="mudo" style={{ marginTop: 8 }}>
        O cabeçalho é reconhecido por apelido (telefone/celular/whatsapp, nome/cliente, cpf,
        cidade/município, uf/estado, banco/instituição, margem, renda/benefício, obs,
        matrícula/referência). O que não for reconhecido é guardado em <code>extras</code> e
        aparece no lead — nenhuma coluna da planilha é jogada fora. CPF precisa passar no dígito
        verificador; duplicados na mesma campanha são ignorados (índice único por telefone);
        números em <code>bloqueios</code> nunca entram na fila de discagem.
      </p>
    </div>
  );
}
