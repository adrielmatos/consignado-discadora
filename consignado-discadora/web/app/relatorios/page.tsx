import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import PainelAnuencia, { type LinhaAnuencia } from "./anuencia";
import type { AnuenciaPendente, FunilLinha, LinhaAderencia, LinhaRanking, MapaLinha, MetaDia, PainelDia, QaLinha } from "@/lib/tipos";
import AoVivo from "../ao-vivo";
import { OPC_DATA, OPC_DATA_HORA } from "@/lib/tempo";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorios() {
  const sb = await supabaseServer();
  const [{ data: painel }, { data: ranking }, { data: aderencia }, { data: gestao }, { data: anuencia }, { data: cdrs }, { data: jobs },
    { data: metas }, { data: funil }, { data: mapa }, { data: qa }, meu] =
    await Promise.all([
    sb.from("v_painel_dia").select("*").order("dia", { ascending: false }).limit(60),
    sb.from("v_ranking_dia").select("*").limit(40),
    sb.from("v_aderencia_roteiro").select("*").order("aderencia_pct", { ascending: false }),
    sb.from("auditoria_gestao").select("acao,quem_email,campanha_id,alvo,criado_em").order("id", { ascending: false }).limit(25),
    sb.from("v_anuencia_pendente").select("*").limit(200),
    sb.from("cdr").select("telefone_e164,disposition,duracao_s,started_em,fonte,nota").order("id", { ascending: false }).limit(40),
    sb.from("dial_jobs").select("status,disposition,criado_em,erro").order("criado_em", { ascending: false }).limit(40),
    sb.from("v_metas_dia").select("*").order("pct_meta", { ascending: false }),
    sb.from("v_funil").select("*").order("campanha").order("leads", { ascending: false }),
    sb.from("v_mapa_horario").select("*"),
    sb.from("v_qa_resumo").select("*").order("nota_media", { ascending: true }),
    quemSou(),
  ]);

  const totalChamadas = (painel as PainelDia[] | null)?.reduce((s, p) => s + Number(p.chamadas), 0) ?? 0;
  const totalContatos = (painel as PainelDia[] | null)?.reduce((s, p) => s + Number(p.contatos), 0) ?? 0;
  const propostas = (anuencia as AnuenciaPendente[] | null)?.length ?? 0;

  return (
    <>
      <AoVivo tabelas={["cdr", "dial_jobs", "leads", "tarefas", "qa_avaliacoes"]} fallbackMs={45000} />
      <div className="linha" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>Relatórios</h1>
        <span className="linha" style={{ gap: 8 }}>
          <a className="btn" href="/api/export/csv?tipo=painel">CSV da discagem</a>
          <a className="btn" href="/api/export/csv?tipo=esteira">CSV da esteira</a>
          <a className="btn" href="/api/export/csv?tipo=agenda">CSV da agenda</a>
          <a className="btn" href="/api/export/csv?tipo=metas">CSV das metas</a>
        </span>
      </div>
      <p className="mudo">
        Os CSVs saem das mesmas views, com a mesma RLS: o que a pessoa exporta é o que ela veria na
        tela — exportar não abre porta de saída para dado fora do escopo dela.
      </p>
      <div className="grade">
        <div className="kpi"><span>chamadas (histórico)</span><b>{totalChamadas}</b></div>
        <div className="kpi"><span>contatos</span><b>{totalContatos}</b></div>
        <div className="kpi">
          <span>taxa de contato</span>
          <b>{totalChamadas ? Math.round((totalContatos / totalChamadas) * 100) + "%" : "—"}</b>
        </div>
        <div className="kpi"><span>propostas aguardando anuência</span><b>{propostas}</b></div>
      </div>

      <h2>Meta do dia por campanha</h2>
      <p className="mudo">
        Meta é contato efetivo (disposição <code>atendeu</code>) no dia de Brasília, não tentativa de
        discagem — do contrário a régua infla o número com linha muda e o operador perde a tarde
        discando ocupado.
      </p>
      <table>
        <thead><tr><th>campanha</th><th className="num">meta</th><th className="num">contatos</th>
                   <th className="num">chamadas</th><th className="num">% da meta</th><th className="num">faltam</th><th className="num">operadores</th></tr></thead>
        <tbody>
          {((metas as MetaDia[] | null) ?? []).map((m) => (
            <tr key={m.campanha_id}>
              <td>{m.campanha}</td>
              <td className="num">{m.meta_diaria ?? "—"}</td>
              <td className="num">{m.contatos_hoje}</td>
              <td className="num">{m.chamadas_hoje}</td>
              <td className="num">
                {m.pct_meta == null ? "—" : (
                  <span className={`chip ${m.pct_meta >= 100 ? "chip-verde" : m.pct_meta >= 60 ? "chip-ambar" : "chip-vermelho"}`}>
                    {m.pct_meta}%
                  </span>
                )}
              </td>
              <td className="num">{m.faltam}</td>
              <td className="num">{m.operadores_ativos}</td>
            </tr>
          ))}
          {((metas as MetaDia[] | null) ?? []).length === 0 ? <tr><td colSpan={7} className="mudo">nenhuma campanha no seu escopo</td></tr> : null}
        </tbody>
      </table>

      <h2>Funil por campanha</h2>
      <table>
        <thead><tr><th>campanha</th><th>status</th><th className="num">leads</th><th className="num">% da campanha</th></tr></thead>
        <tbody>
          {((funil as FunilLinha[] | null) ?? []).map((f, i) => (
            <tr key={i}>
              <td>{f.campanha ?? "—"}</td>
              <td><span className="chip">{f.status}</span></td>
              <td className="num">{f.leads}</td>
              <td className="num">
                {f.pct_da_campanha == null ? "—" : (
                  <span className="linha" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <span className="barra" style={{ width: 70, height: 6, background: "#1e293b", borderRadius: 3, display: "inline-block" }}>
                      <span style={{ display: "block", height: 6, width: `${Math.min(100, Number(f.pct_da_campanha))}%`, background: "#22c55e", borderRadius: 3 }} />
                    </span>
                    {f.pct_da_campanha}%
                  </span>
                )}
              </td>
            </tr>
          ))}
          {((funil as FunilLinha[] | null) ?? []).length === 0 ? <tr><td colSpan={4} className="mudo">nenhum lead no seu escopo</td></tr> : null}
        </tbody>
      </table>

      <h2>Melhor horário para ligar (dia × hora)</h2>
      <p className="mudo">
        A régua de cadência usa isso por tabela; o mapa mostra por que. Verde = taxa de contato alta
        naquela faixa. <code>v_mapa_horario</code> só conta linha com CDR registrado, então o que não
        foi discado não distorce a média.
      </p>
      <div className="mapa">
        <div className="rotulo"></div>
        {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => (
          <div key={`h${h}`} className="rotulo num">{h}h</div>
        ))}
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d, dow) => (
          <div key={d} style={{ display: "contents" }}>
            <div className="rotulo">{d}</div>
            {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => {
              const c = ((mapa as MapaLinha[] | null) ?? []).find((m) => Number(m.dow) === dow && Number(m.hora) === h);
              const taxa = c ? Number(c.taxa_contato_pct ?? 0) : null;
              const forca = taxa == null ? 0 : Math.max(0, Math.min(1, taxa / 60));
              return (
                <div key={`${dow}-${h}`} className="celula"
                     title={c ? `${c.chamadas} chamadas · ${c.contatos} contatos · média ${c.duracao_media_s ?? 0}s` : "sem chamada nessa faixa"}
                     style={{ background: taxa == null ? "#0f172a" : `rgba(34,197,94,${(0.08 + forca * 0.72).toFixed(2)})` }}>
                  {taxa == null ? "" : Math.round(taxa)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mudo">
        Cada campanha tem janela própria (<code>janela_ini</code>/<code>janela_fim</code>) e a
        <code> fn_editar_campanha</code> recusa qualquer janela fora de 08:00–21:00 — é regra do banco,
        não da tela. Fora da janela o <code>claim</code> simplesmente não entrega lead, então usar o
        pico do mapa é o que faz a meta do dia ser batida dentro do horário permitido.
      </p>

      <h2>Qualidade (auditoria de ligação)</h2>
      <p className="mudo">
        Sem gravação no Phone Link, o scorecard é preenchido pelo supervisor sobre o CDR + roteiro +
        tabulação da ligação. É o substituto honesto da escuta: vira conversa de treino com número, e
        não com "achismo".
      </p>
      <table>
        <thead><tr><th>operador</th><th>papel</th><th className="num">avaliações</th><th className="num">nota média</th>
                   <th className="num">pior nota</th><th className="num">na semana</th><th>última</th></tr></thead>
        <tbody>
          {((qa as QaLinha[] | null) ?? []).map((q) => (
            <tr key={q.agente_id}>
              <td>{q.agente}</td><td>{q.papel}</td>
              <td className="num">{q.avaliacoes}</td>
              <td className="num">
                {q.nota_media == null ? "—" : (
                  <span className={`chip ${Number(q.nota_media) >= 85 ? "chip-verde" : Number(q.nota_media) >= 70 ? "chip-ambar" : "chip-vermelho"}`}>
                    {q.nota_media}
                  </span>
                )}
              </td>
              <td className="num">{q.pior_nota ?? "—"}</td>
              <td className="num">{q.auditorias_da_semana}</td>
              <td className="mudo">{q.ultima_avaliacao ? new Date(q.ultima_avaliacao).toLocaleDateString("pt-BR", OPC_DATA) : "—"}</td>
            </tr>
          ))}
          {((qa as QaLinha[] | null) ?? []).length === 0 ? (
            <tr><td colSpan={7} className="mudo">nenhuma avaliação registrada — o supervisor avalia pela ficha do lead</td></tr>
          ) : null}
        </tbody>
      </table>

      <h2>Produtividade por operador (hoje)</h2>
      <table>
        <thead><tr><th>operador</th><th>papel</th><th className="num">chamadas</th><th className="num">contatos</th>
                   <th className="num">≥30s</th><th className="num">%</th><th className="num">min</th><th className="num">carteira</th><th className="num">limite</th></tr></thead>
        <tbody>
          {((ranking as LinhaRanking[] | null) ?? []).map((r) => (
            <tr key={r.agente_id}>
              <td>{r.nome}</td><td>{r.papel}</td><td>{r.chamadas}</td><td>{r.contatos}</td>
              <td>{r.efetivos_30s}</td><td>{r.taxa_contato_pct ?? 0}%</td>
              <td>{Math.round(Number(r.segundos_falados ?? 0) / 60)}</td>
              <td>{r.na_carteira}</td><td>{r.limite_diario}</td>
            </tr>
          ))}
          {((ranking as LinhaRanking[] | null) ?? []).length === 0 ? <tr><td colSpan={9} className="mudo">sem operadores no seu escopo</td></tr> : null}
        </tbody>
      </table>

      <h2>Produtividade por dia / campanha / agente</h2>
      <table>
        <thead><tr><th>dia</th><th>campanha</th><th>agente</th><th>chamadas</th><th>contatos</th><th>%</th><th>≥30s</th><th>min</th></tr></thead>
        <tbody>
          {(painel as PainelDia[] | null)?.map((p, i) => (
            <tr key={i}>
              <td>{String(p.dia).slice(0, 10)}</td><td>{p.campanha ?? "—"}</td><td>{p.agente ?? "—"}</td>
              <td>{p.chamadas}</td><td>{p.contatos}</td><td>{p.taxa_contato_pct ?? 0}%</td>
              <td>{p.efetivos_30s}</td><td>{Math.round(Number(p.segundos_falados ?? 0) / 60)}</td>
            </tr>
          )) ?? <tr><td colSpan={8} className="mudo">sem dados</td></tr>}
        </tbody>
      </table>

      <h2>Aderência ao roteiro (hoje)</h2>
      <p className="mudo">
        Passos <b>obrigatórios</b> do roteiro da campanha × o que foi marcado no painel, somado por
        operador no dia de Brasília. É contagem, não impressão: o supervisor usa isto para treino,
        não para ponto.
      </p>
      <table>
        <thead><tr><th>operador</th><th>papel</th><th className="num">leads hoje</th>
                   <th className="num">devidos</th><th className="num">cumpridos</th><th className="num">aderência</th></tr></thead>
        <tbody>
          {((aderencia as LinhaAderencia[] | null) ?? []).map((a) => (
            <tr key={a.agente_id}>
              <td>{a.agente}</td><td>{a.papel}</td>
              <td className="num">{a.leads_de_hoje}</td>
              <td className="num">{a.passos_devidos}</td>
              <td className="num">{a.passos_cumpridos}</td>
              <td className="num">
                {a.aderencia_pct == null ? "—" : (
                  <span className={`chip ${a.aderencia_pct >= 80 ? "chip-verde" : a.aderencia_pct >= 50 ? "chip-ambar" : "chip-vermelho"}`}>
                    {a.aderencia_pct}%
                  </span>
                )}
              </td>
            </tr>
          ))}
          {((aderencia as LinhaAderencia[] | null) ?? []).length === 0 ? (
            <tr><td colSpan={6} className="mudo">sem ligações hoje (ou nenhuma campanha com roteiro aprovado)</td></tr>
          ) : null}
        </tbody>
      </table>

      <h2>Decisões de gestão (trilha)</h2>
      <p className="mudo">
        Quem deu/tirou acesso, mudou regra de campanha, montou ou recolheu carteira. A policy libera
        para admin e para supervisor nas campanhas dele — se você é operador, esta tabela vem vazia
        por RLS, não por filtro de tela.
      </p>
      <div className="rolagem">
        <table>
          <thead><tr><th>quando</th><th>quem</th><th>ação</th><th>detalhe</th></tr></thead>
          <tbody>
            {((gestao as { acao: string; quem_email: string | null; campanha_id: string | null; alvo: Record<string, unknown>; criado_em: string }[] | null) ?? []).map((g, i) => (
              <tr key={i}>
                <td className="mudo">{new Date(g.criado_em).toLocaleString("pt-BR", OPC_DATA_HORA)}</td>
                <td>{g.quem_email ?? "sistema"}</td>
                <td><span className="chip">{g.acao}</span></td>
                <td className="mudo">{JSON.stringify(g.alvo ?? {}).slice(0, 160)}</td>
              </tr>
            ))}
            {((gestao as unknown[] | null) ?? []).length === 0 ? (
              <tr><td colSpan={4} className="mudo">nenhuma decisão registrada — ou você não tem escopo para ver</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>Últimas chamadas (CDR)</h2>
      <table>
        <thead><tr><th>quando</th><th>telefone</th><th>disposição</th><th>duração</th><th>fonte</th><th>nota</th></tr></thead>
        <tbody>
          {(cdrs ?? []).map((c, i) => (
            <tr key={i}>
              <td>{c.started_em ? new Date(String(c.started_em)).toLocaleString("pt-BR", OPC_DATA_HORA) : "—"}</td>
              <td>{String(c.telefone_e164)}</td><td>{String(c.disposition)}</td>
              <td>{c.duracao_s == null ? "—" : `${c.duracao_s}s`}</td>
              <td>{String(c.fonte)}</td><td>{c.nota ? String(c.nota) : "—"}</td>
            </tr>
          ))}
          {(cdrs ?? []).length === 0 ? <tr><td colSpan={6} className="mudo">nenhuma chamada ainda</td></tr> : null}
        </tbody>
      </table>

      <h2>Fila de discagem (jobs)</h2>
      <table>
        <thead><tr><th>criado</th><th>status</th><th>disposição</th><th>erro</th></tr></thead>
        <tbody>
          {(jobs ?? []).map((j, i) => (
            <tr key={i}>
              <td>{j.criado_em ? new Date(String(j.criado_em)).toLocaleString("pt-BR", OPC_DATA_HORA) : "—"}</td>
              <td>{String(j.status)}</td><td>{j.disposition ? String(j.disposition) : "—"}</td>
              <td>{j.erro ? String(j.erro) : "—"}</td>
            </tr>
          ))}
          {(jobs ?? []).length === 0 ? <tr><td colSpan={4} className="mudo">nenhum job</td></tr> : null}
        </tbody>
      </table>

      <h2>Cobrança de anuência (Meu INSS)</h2>
      <PainelAnuencia
        gerencia={meu.papel === "admin" || meu.papel === "supervisor"}
        linhas={((anuencia as AnuenciaPendente[] | null) ?? []).map((a) => ({
          proposta_id: a.proposta_id,
          lead_id: a.lead_id,
          nome: a.nome ?? null,
          telefone_e164: a.telefone_e164,
          valor: Number(a.valor),
          parcelas: a.parcelas,
          anuencia: a.anuencia,
          enviada_em: a.enviada_em,
          prazo_validade: a.prazo_validade,
          dias_restantes: a.dias_restantes,
          responsavel: (a as { responsavel?: string | null }).responsavel ?? null,
        }))}
      />
    </>
  );
}
