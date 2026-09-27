"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Tabulacao from "./tabulacao";
import { DISPOSICOES, type LeadFila, type PassoRoteiro } from "@/lib/tipos";
import {
  agendarRetorno,
  despausar,
  marcarPassoRoteiro,
  meuPerfil,
  pausar,
  pegarProximoLead,
  registrarDisposicao,
  registrarOptout,
} from "@/lib/acoes";

type Meu = {
  nome: string | null;
  papel: string;
  limite_diario: number;
  discadas_hoje: number;
  pausado_ate: string | null;
  celular: string | null;
  campanhas: { id: string; nome: string }[];
};

const ROTULO_ORIGEM: Record<string, string> = {
  carteira: "da sua carteira",
  pool: "do pool da campanha",
  overflow: "overflow — campanha de outro colega",
};

export default function PainelOperador({ meu, campanhas }: { meu: Meu; campanhas: { id: string; nome: string }[] }) {
  const [lead, setLead] = useState<LeadFila | null>(null);
  const [campanha, setCampanha] = useState<string>("");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [segundos, setSegundos] = useState(0);
  const [retornarEm, setRetornarEm] = useState("");
  const [celular, setCelular] = useState(meu.celular ?? "");
  // roteiro: o texto chega com o lead (vindo do banco, não de localStorage); a
  // marcação é otimista e o `fn_marcar_passo_roteiro` confere escopo e roteiro.
  const [feitos, setFeitos] = useState<Set<number>>(new Set());
  const [progresso, setProgresso] = useState<{ cumpridos: number; devidos: number } | null>(null);
  const cronometro = useRef<ReturnType<typeof setInterval> | null>(null);

  const pausado = Boolean(meu.pausado_ate && new Date(meu.pausado_ate) > new Date());
  const resto = Math.max(0, meu.limite_diario - meu.discadas_hoje);

  const pararCronometro = useCallback(() => {
    if (cronometro.current) clearInterval(cronometro.current);
    cronometro.current = null;
  }, []);
  useEffect(() => () => pararCronometro(), [pararCronometro]);

  const roteiro = lead?.roteiro ?? null;
  useEffect(() => {
    setFeitos(new Set((lead?.roteiro?.passos ?? []).filter((p) => p.feito).map((p) => p.id)));
    setProgresso(null);
  }, [lead?.lead_id, lead?.roteiro]);

  function marcar(passo: PassoRoteiro, valor: boolean) {
    if (!lead) return;
    setErro(null);
    const inverter = (atual: Set<number>) => {
      const novo = new Set(atual);
      if (valor) novo.add(passo.id);
      else novo.delete(passo.id);
      return novo;
    };
    setFeitos(inverter);
    iniciar(async () => {
      const r = await marcarPassoRoteiro({ leadId: lead.lead_id, passoId: passo.id, feito: valor });
      if (!r.ok) {
        setFeitos(inverter); // volta atrás: o banco negou (fora do escopo / roteiro outro)
        return setErro(r.erro);
      }
      setProgresso({ cumpridos: r.data.cumpridos, devidos: r.data.devidos });
    });
  }

  function ligarCronometro() {
    setSegundos(0);
    pararCronometro();
    cronometro.current = setInterval(() => setSegundos((s) => s + 1), 1000);
  }

  async function proximo() {
    setErro(null);
    setMsg(null);
    iniciar(async () => {
      const r = await pegarProximoLead(campanha || null);
      if (!r.ok) return setErro(r.erro);
      setLead(r.data);
      setNota("");
      if (r.data) {
        setMsg(
          `job criado (${ROTULO_ORIGEM[r.data.origem_fila ?? ""] ?? r.data.origem_fila ?? "fila"}). ` +
            `O agente deve discar para ${r.data.telefone}. Restam ${r.data.pendente_carteira} na carteira.`
        );
        ligarCronometro();
      } else {
        setMsg(
          pausado
            ? "você está pausado — saia da pausa para receber lead"
            : resto === 0
              ? `teto diário atingido (${meu.discadas_hoje}/${meu.limite_diario})`
              : "fila vazia: nada discável agora (fora da janela, consentimento ausente/revogado, bloqueado ou tentativas esgotadas)"
        );
        pararCronometro();
      }
    });
  }

  async function fechar(disposition: string, duracao?: number) {
    if (!lead) return;
    const d = disposition as (typeof DISPOSICOES)[number]["valor"];
    setErro(null);
    iniciar(async () => {
      const r = await registrarDisposicao(lead.job_id, d, duracao ?? segundos, nota);
      if (!r.ok) return setErro(r.erro);
      pararCronometro();
      setLead(null);
      setNota("");
      setMsg("chamada registrada no CDR — próximo?");
    });
  }

  /**
   * A proposta sai do simulador (Tabulacao) com o valor que cabe na margem. O que
   * este callback faz é fechar a ligação como 'atendeu' depois do registro — sem
   * isso o job ficaria aberto e o teto diário do operador não bateria.
   */
  function propostaEnviada(mensagem: string) {
    iniciar(async () => {
      await fechar("atendeu", segundos);
      setLead(null);
      setMsg(mensagem);
    });
  }

  function agendar() {
    if (!lead || !retornarEm) return setErro("escolha data e hora do retorno");
    iniciar(async () => {
      const r = await agendarRetorno({ leadId: lead.lead_id, quando: retornarEm, nota });
      if (!r.ok) return setErro(r.erro);
      setLead(null);
      setRetornarEm("");
      setMsg("retorno agendado — o lead só volta para a fila nesse horário");
    });
  }

  return (
    <div>
      <div className="card">
        <div className="linha">
          <label>
            <span className="mudo">campanha (vazio = qualquer uma do meu escopo)</span>
            <select value={campanha} onChange={(e) => setCampanha(e.target.value)}>
              <option value="">todas as minhas</option>
              {campanhas
                .filter((c) => meu.campanhas.length === 0 || meu.campanhas.some((x) => x.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </select>
          </label>
          <div>
            <span className="mudo">estado</span>
            <div className="linha" style={{ gap: 6, marginTop: 6 }}>
              {pausado ? (
                <button onClick={() => iniciar(async () => {
                  const r = await despausar();
                  setErro(r.ok ? null : r.erro);
                })}>sair da pausa</button>
              ) : (
                <button onClick={() => iniciar(async () => {
                  const r = await pausar(15);
                  setErro(r.ok ? null : r.erro);
                  setMsg(r.ok ? "pausado por 15 min — o claim para de entregar lead" : null);
                })}>pausar 15 min</button>
              )}
              <span className={`chip ${pausado ? "chip-ambar" : "chip-verde"}`}>
                {pausado ? "em pausa" : "disponível"}
              </span>
              <span className={`chip ${resto === 0 ? "chip-vermelho" : "chip-azul"}`}>
                {meu.discadas_hoje}/{meu.limite_diario} hoje
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="linha" style={{ margin: "14px 0" }}>
        <button className="primario" onClick={proximo} disabled={pendente}>
          {lead ? "descartar e ir para o próximo" : "próximo lead"}
        </button>
        {lead ? (
          <button onClick={() => { setLead(null); pararCronometro(); }}>limpar tela</button>
        ) : null}
        <label style={{ flex: "2 1 260px" }}>
          <span className="mudo">celular que aparece no Phone Link</span>
          <div className="linha">
            <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="+5579..." />
            <button type="button" onClick={() => iniciar(async () => {
              const r = await meuPerfil({ celular });
              setErro(r.ok ? null : r.erro);
            })}>salvar</button>
          </div>
        </label>
      </div>

      {erro ? <p className="alerta">erro: {erro}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      {lead ? (
        <div className="card">
          <div className="mudo">
            lead #{lead.lead_id} · {lead.campanha ?? "campanha?"} · {lead.publico ?? "—"} · tentativa{" "}
            {lead.tentativas}
            {lead.origem_fila ? <> · <span className="chip chip-azul">{ROTULO_ORIGEM[lead.origem_fila] ?? lead.origem_fila}</span></> : null}
          </div>
          <div className="grande" style={{ marginTop: 6 }}>{lead.nome || "(sem nome)"}</div>
          <div className="grande">
            <a href={`tel:${lead.telefone}`}>{lead.telefone}</a>
          </div>
          <div className="mudo">
            {lead.cpf_mask ? `CPF ${lead.cpf_mask} · ` : ""}
            {lead.cidade ? `${lead.cidade}/${lead.uf ?? "--"} · ` : ""}
            {lead.banco_folha ? `banco ${lead.banco_folha} · ` : ""}
            {lead.margem_estimada != null
              ? `margem estimada R$ ${Number(lead.margem_estimada).toLocaleString("pt-BR")}`
              : "margem não informada"}
          </div>
          {lead.script_resumo ? (
            <p style={{ borderTop: "1px solid var(--linha)", marginTop: 12, paddingTop: 10 }}>
              <b>recado da campanha:</b> {lead.script_resumo}
            </p>
          ) : null}

          {roteiro ? (
            <div style={{ borderTop: "1px solid var(--linha)", marginTop: 12, paddingTop: 10 }}>
              <div className="linha" style={{ alignItems: "center" }}>
                <b>roteiro: {roteiro.nome}</b>
                <span className="chip">v{roteiro.versao}</span>
                <span className="mudo">
                  {progresso
                    ? `${progresso.cumpridos}/${progresso.devidos} passos obrigatórios`
                    : `${roteiro.passos.filter((p) => p.obrigatorio).length} passos obrigatórios`}
                </span>
              </div>
              {roteiro.aviso ? (
                <p className="alerta" style={{ marginTop: 8 }}>
                  <b>o que não pode ser dito:</b> {roteiro.aviso}
                </p>
              ) : null}
              <ol style={{ marginTop: 8, paddingLeft: 22 }}>
                {roteiro.passos.map((s) => (
                  <li key={s.id} style={{ marginBottom: 6 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={feitos.has(s.id)}
                        disabled={pendente}
                        onChange={(e) => marcar(s, e.target.checked)}
                      />{" "}
                      <b>{s.titulo}</b>
                      {s.obrigatorio ? null : <span className="mudo"> · opcional</span>}
                    </label>
                    <div className="mudo" style={{ marginLeft: 22 }}>{s.texto}</div>
                  </li>
                ))}
              </ol>
              {roteiro.objecoes.length ? (
                <>
                  <b>se a pessoa objeta</b>
                  {roteiro.objecoes.map((o, i) => (
                    <details key={i} style={{ marginTop: 6 }}>
                      <summary>{o.objecao}</summary>
                      <p style={{ margin: "6px 0 0" }}>{o.resposta}</p>
                      {o.proibido ? (
                        <p className="alerta" style={{ margin: "4px 0 0" }}>não: {o.proibido}</p>
                      ) : null}
                    </details>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {lead.obs ? <p className="mudo">obs: {lead.obs}</p> : null}

          <Tabulacao lead={lead} onPropostaEnviada={propostaEnviada} />

          {roteiro?.aviso ? null : (
            <p className="alerta">
              Proibido contratar consignado por telefone (Lei 15.327/2026). Você pode qualificar,
              esclarecer e cobrar a anuência no app Meu INSS — não fechar contrato na ligação. A
              campanha não tem roteiro aprovado: peça ao supervisor para apontar um em /campanhas.
            </p>
          )}

          <div className="linha" style={{ marginTop: 12 }}>
            <div>
              <label className="mudo">duração da chamada: {segundos}s</label>
            </div>
            <button onClick={ligarCronometro}>reiniciar cronômetro</button>
          </div>

          <div className="linha" style={{ marginTop: 12 }}>
            {DISPOSICOES.map((d) => (
              <button
                key={d.valor}
                style={{ borderColor: d.cor, flex: "0 1 auto" }}
                onClick={() => fechar(d.valor, d.valor === "atendeu" ? undefined : 0)}
                disabled={pendente}
              >
                {d.rotulo}
              </button>
            ))}
          </div>

          <div className="linha" style={{ marginTop: 12 }}>
            <input
              placeholder="nota do atendimento (vai para o CDR)"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <button
              onClick={() => {
                iniciar(async () => {
                  const r = await registrarOptout(lead.telefone);
                  if (!r.ok) return setErro(r.erro);
                  setLead(null);
                  setMsg("número bloqueado para toda a base (opt-out)");
                });
              }}
            >
              opt-out / não me perturbe
            </button>
          </div>

          <div className="linha" style={{ marginTop: 12 }}>
            <label style={{ flex: "1 1 240px" }}>
              <span className="mudo">retornar em</span>
              <input type="datetime-local" value={retornarEm} onChange={(e) => setRetornarEm(e.target.value)} />
            </label>
            <button onClick={agendar} disabled={pendente || !retornarEm}>agendar retorno</button>
          </div>
        </div>
      ) : (
        <div className="card mudo">
          nada em tela. clique em <b>próximo lead</b> para receber o da sua fila.
        </div>
      )}
    </div>
  );
}
