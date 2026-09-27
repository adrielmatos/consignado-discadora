import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { pendencias, quemSou } from "@/lib/acoes";
import type { AnuenciaPendente, LinhaRanking, PainelDia, VisaoDono } from "@/lib/tipos";
import AoVivo from "./ao-vivo";
import { OPC_DATA, OPC_DATA_HORA } from "@/lib/tempo";

export const dynamic = "force-dynamic";

async function carregar() {
  try {
    const sb = await supabaseServer();
    const [fila, painel, anuencia, leadsTotal, ranking, jobsAbertos, visao] = await Promise.all([
      sb.from("v_fila").select("lead_id, nome, telefone_e164, dono, na_minha_carteira"),
      sb.from("v_ranking_dia").select("*").limit(40),
      sb.from("dial_jobs").select("id", { count: "exact", head: true }).in("status", ["claimed", "discado"]),
      sb.from("v_painel_dia").select("*").order("dia", { ascending: false }).limit(14),
      sb.from("v_anuencia_pendente").select("*").limit(10),
      sb.from("leads").select("id", { count: "exact", head: true }),
      sb.from("v_visao_dono").select("*").limit(40),
    ]);
    return {
      fila: fila.data?.length ?? 0,
      filaAmostra: (fila.data as { lead_id: number; nome: string | null; telefone_e164: string; dono: string | null; na_minha_carteira: boolean }[] | null) ?? [],
      ranking: (ranking.data as LinhaRanking[] | null) ?? [],
      jobsAbertos: jobsAbertos.count ?? 0,
      visao: (visao.data as VisaoDono[] | null) ?? [],
      painel: (painel.data as PainelDia[] | null) ?? [],
      anuencia: (anuencia.data as AnuenciaPendente[] | null) ?? [],
      leadsTotal: leadsTotal.count ?? 0,
      erro: fila.error?.message ?? painel.error?.message ?? null,
    };
  } catch (e) {
    return { fila: 0, filaAmostra: [], ranking: [], jobsAbertos: 0, painel: [], anuencia: [],
             leadsTotal: 0, visao: [], erro: String(e) };
  }
}

export default async function PaginaInicial() {
  const [d, meu, pend] = await Promise.all([carregar(), quemSou(), pendencias()]);
  const paradas =
    pend.tarefas_vencidas + pend.qualificados_sem_proposta + pend.anuencia_hoje + pend.fila_parada;
  const visao = d.visao[0];
  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";
  const hoje = d.painel[0];
  const contatosHoje = d.painel.reduce((s, p) => s + (p.contatos ?? 0), 0);
  const discadasHoje = d.painel.reduce((s, p) => s + (p.chamadas ?? 0), 0);

  return (
    <>
      <AoVivo tabelas={["dial_jobs", "leads", "tarefas", "propostas"]} />
      <h1>Painel</h1>
      {paradas > 0 ? (
        <div className="card" style={{ borderColor: "#7c2d12", marginBottom: 14 }}>
          <b>{paradas} coisa(s) paradas hoje</b>
          <div className="linha" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {pend.tarefas_vencidas ? <Link className="chip chip-vermelho" href="/crm">{pend.tarefas_vencidas} tarefa(s) vencida(s)</Link> : null}
            {pend.retornos_de_hoje ? <Link className="chip chip-ambar" href="/crm">{pend.retornos_de_hoje} retorno(s) prometido(s) para hoje</Link> : null}
            {pend.qualificados_sem_proposta ? <Link className="chip chip-ambar" href="/crm">{pend.qualificados_sem_proposta} qualificado(s) sem proposta</Link> : null}
            {pend.anuencia_hoje ? <Link className="chip chip-vermelho" href="/crm">{pend.anuencia_hoje} anuência(s) vencendo hoje</Link> : null}
            {pend.fila_parada ? <span className="chip chip-azul">{pend.fila_parada} lead(s) nunca discado(s)</span> : null}
            {pend.qa_da_semana === 0 ? <Link className="chip" href="/relatorios">nenhuma auditoria de ligação nesta semana</Link> : null}
          </div>
          <p className="mudo" style={{ marginBottom: 0 }}>
            As contagens vêm de <code>fn_pendencias</code> — o mesmo lugar de que a esteira lê, então o
            alerta e o cartão batem. Nada aqui é calculado no navegador.
          </p>
        </div>
      ) : null}
      <div className="grade">
        <div className="kpi"><span>leads na base</span><b>{d.leadsTotal}</b></div>
        <div className="kpi"><span>na fila p/ discar</span><b>{d.fila}</b></div>
        <div className="kpi"><span>chamadas hoje</span><b>{discadasHoje}</b></div>
        <div className="kpi"><span>contatos hoje</span><b>{contatosHoje}</b></div>
        <div className="kpi">
          <span>taxa de contato</span>
          <b>{discadasHoje ? Math.round((contatosHoje / discadasHoje) * 100) + "%" : "—"}</b>
        </div>
        <div className="kpi"><span>aguardando anuência INSS</span><b>{d.anuencia.length}</b></div>
        <div className="kpi"><span>jobs abertos agora</span><b>{d.jobsAbertos}</b></div>
        <div className="kpi"><span>minha cota de hoje</span>
          <b>{meu.discadas_hoje}/{meu.limite_diario}</b>
        </div>
      </div>

      {meu.papel === "ninguem" ? (
        <p className="alerta" style={{ marginTop: 14 }}>
          Login sem linha em <code>agentes</code> ou sem campanha: nada aparece na fila. Um admin
          precisa te convidar em <Link href="/equipe">Equipe</Link> e dar acesso a uma campanha.
        </p>
      ) : null}
      {meu.pausado_ate && new Date(meu.pausado_ate) > new Date() ? (
        <p className="alerta" style={{ marginTop: 14 }}>
          Você está pausado até {new Date(meu.pausado_ate).toLocaleString("pt-BR", OPC_DATA_HORA)} — saia da pausa na{" "}
          <Link href="/operador">tela do operador</Link>.
        </p>
      ) : null}

      <h2>Amostra da fila (o resto só aparece via claim, com trava)</h2>
      {d.filaAmostra.length === 0 ? (
        <p className="mudo">fila vazia no seu escopo</p>
      ) : (
        <div className="rolagem">
          <table>
            <thead><tr><th>lead</th><th>telefone</th><th>banco/dono</th><th>origem</th></tr></thead>
            <tbody>
              {d.filaAmostra.slice(0, 8).map((l) => (
                <tr key={l.lead_id}>
                  <td>{l.nome ?? "—"}</td>
                  <td className="mudo">{l.telefone_e164}</td>
                  <td className="mudo">{l.dono ?? "pool"}</td>
                  <td>{l.na_minha_carteira ? <span className="chip chip-verde">carteira</span> : <span className="chip">pool</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gerencia ? (
        <>
          <h2>A operação inteira (uma leitura só)</h2>
          {!visao ? <p className="mudo">sem linha em <code>v_visao_dono</code></p> : (
            <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="chip chip-verde">{visao.operadores_online}/{visao.operadores_ativos} online</span>
              <span className="chip">{visao.campanhas_ativas} campanha(s) ativa(s)</span>
              <span className="chip chip-azul">{visao.leads_na_fila} na fila</span>
              <span className="chip chip-ambar">{visao.aguardando_proposta} qualificado(s) sem proposta</span>
              <span className="chip">{visao.propostas_totais} propostas · {visao.anuencia_aberta} com anuência aberta · {visao.anuencia_confirmada} confirmada(s)</span>
              <span className="chip chip-verde">R$ {Number(visao.valor_confirmado).toLocaleString("pt-BR")} confirmado · R$ {Number(visao.valor_em_andamento).toLocaleString("pt-BR")} em andamento</span>
              <span className="chip">{visao.chamadas_hoje} chamadas hoje · {visao.contatos_hoje} contatos · {visao.efetivos_hoje} ≥30s</span>
              <span className="chip">{visao.taxa_contato_pct ?? "—"}% contato · {visao.proposta_por_contato_pct ?? "—"}% proposta por contato</span>
              <span className="chip chip-vermelho">{visao.numeros_bloqueados} números bloqueados</span>
              <span className="chip">{visao.qa_semana} auditoria(s) na semana</span>
            </div>
          )}

          <h2>Quem produziu hoje</h2>
          {d.ranking.length === 0 ? <p className="mudo">nenhum operador no seu escopo</p> : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr><th>operador</th><th>papel</th><th>agente</th><th className="num">chamadas</th>
                      <th className="num">contatos</th><th className="num">≥30s</th><th className="num">%</th>
                      <th className="num">min falados</th><th className="num">carteira</th></tr>
                </thead>
                <tbody>
                  {d.ranking.map((r) => (
                    <tr key={r.agente_id}>
                      <td>{r.nome}</td>
                      <td><span className={`chip ${r.papel === "admin" ? "chip-vermelho" : r.papel === "supervisor" ? "chip-azul" : ""}`}>{r.papel}</span></td>
                      <td>
                        {r.ultimo_ciclo_em && Date.now() - new Date(r.ultimo_ciclo_em).getTime() < 180_000
                          ? <span className="chip chip-verde">{r.status_agente ?? "online"}</span>
                          : <span className="chip chip-ambar">sem heartbeat</span>}
                      </td>
                      <td className="num">{r.chamadas}</td>
                      <td className="num">{r.contatos}</td>
                      <td className="num">{r.efetivos_30s}</td>
                      <td className="num">{r.taxa_contato_pct ?? 0}%</td>
                      <td className="num">{Math.round(Number(r.segundos_falados ?? 0) / 60)}</td>
                      <td className="num">{r.na_carteira}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mudo">
            “sem heartbeat” significa que o agente do Windows daquela pessoa não rodou nos últimos 3
            minutos — o lead dela fica na fila, não é perdido: <code>fn_expirar_jobs</code> devolve
            sozinho.
          </p>
        </>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <Link href="/operador" className="btn" style={{ textDecoration: "none" }}>
          Ir para a tela do operador →
        </Link>
      </div>

      {d.erro ? <p className="alerta">Sem conexão com o Supabase ainda: {d.erro}</p> : null}

      <h2>Discagem por dia</h2>
      {d.painel.length === 0 ? (
        <p className="mudo">nenhuma chamada registrada ainda</p>
      ) : (
        <table>
          <thead>
            <tr><th>dia</th><th>campanha</th><th>agente</th><th>chamadas</th><th>contatos</th><th>% contato</th><th>efetivos ≥30s</th><th>min falados</th></tr>
          </thead>
          <tbody>
            {d.painel.map((p, i) => (
              <tr key={i}>
                <td>{String(p.dia).slice(0, 10)}</td><td>{p.campanha ?? "—"}</td><td>{p.agente ?? "—"}</td>
                <td>{p.chamadas}</td><td>{p.contatos}</td>
                <td>{p.taxa_contato_pct ?? 0}%</td><td>{p.efetivos_30s}</td>
                <td>{Math.round((p.segundos_falados ?? 0) / 60)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hoje ? <p className="mudo">primeiro dia com dados: {String(hoje.dia).slice(0, 10)}</p> : null}

      <h2>Anuência pendente no Meu INSS (prazo 5 dias)</h2>
      {d.anuencia.length === 0 ? (
        <p className="mudo">nada pendente</p>
      ) : (
        <table>
          <thead><tr><th>lead</th><th>telefone</th><th>valor</th><th>parcelas</th><th>status</th><th>dias restantes</th></tr></thead>
          <tbody>
            {d.anuencia.map((a) => (
              <tr key={a.proposta_id}>
                <td>{a.nome ?? a.lead_id}</td><td>{a.telefone_e164}</td>
                <td>R$ {Number(a.valor).toLocaleString("pt-BR")}</td><td>{a.parcelas}</td>
                <td>{a.anuencia}</td>
                <td style={{ color: a.dias_restantes <= 2 ? "#f87171" : undefined }}>{a.dias_restantes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
