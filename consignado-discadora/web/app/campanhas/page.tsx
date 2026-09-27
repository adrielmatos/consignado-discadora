import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import PainelCampanhas from "./painel";
import EditorRoteiros from "./roteiros";
import Cadencia from "./cadencia";
import TabulacaoCampanha from "./tabulacao-campanha";
import type { CampoFormulario, Roteiro } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type Equipe = { agente_id: string; nome: string; email: string; papel: string; limite_diario: number | null };

/**
 * Campanhas são o unit de escopo da operação: quem disca, quantas vezes, em que
 * janela e com que script. Vem de `v_campanhas_gestao`, que já traz as contagens
 * — contar no navegador seria baixar a tabela de leads inteira (o erro do
 * concorrente com limit(1000) em tudo).
 */
export default async function PaginaCampanhas() {
  const [meu, res, time, rots] = await Promise.all([
    quemSou(),
    (async () => {
      const sb = await supabaseServer();
      return sb.from("v_campanhas_gestao").select("*").order("nome");
    })(),
    (async () => {
      const sb = await supabaseServer();
      return sb.from("v_equipe").select("email,nome").order("nome");
    })(),
    (async () => {
      const sb = await supabaseServer();
      // v_roteiros já vem com passos e objeções agregados: o editor não faz 3 requests
      return sb.from("v_roteiros").select("*").order("ativo", { ascending: false }).order("nome");
    })(),
  ]);
  const emails = ((time.data as { email: string; nome: string }[] | null) ?? [])
    .map((p) => `${p.nome} <${p.email}>`);

  const gerencia = meu.papel === "admin" || meu.papel === "supervisor";
  const linhas = (res.data as Record<string, unknown>[] | null) ?? [];
  const campanhas = linhas.map((c) => ({
    id: String(c.id),
    nome: String(c.nome ?? ""),
    publico: String(c.publico ?? "inss"),
    ativo: Boolean(c.ativo),
    janela_ini: String(c.janela_ini ?? "09:00").slice(0, 5),
    janela_fim: String(c.janela_fim ?? "18:00").slice(0, 5),
    max_tentativas: Number(c.max_tentativas ?? 3),
    intervalo_retentativa_s: Number(c.intervalo_retentativa_s ?? 14400),
    permite_overflow: Boolean(c.permite_overflow),
    script_resumo: (c.script_resumo as string | null) ?? null,
    roteiro_id: (c.roteiro_id as string | null) ?? null,
    roteiro_nome: (c.roteiro_nome as string | null) ?? null,
    roteiro_versao: c.roteiro_versao == null ? null : Number(c.roteiro_versao),
    meta_diaria: c.meta_diaria == null ? null : Number(c.meta_diaria),
    formulario: Array.isArray(c.formulario) ? (c.formulario as CampoFormulario[]) : [],
    webhook_ativo: Boolean(c.webhook_ativo),
    webhook_token: (c.webhook_token as string | null) ?? null,
    regras_de_cadencia: Number(c.regras_de_cadencia ?? 0),
    tarefas_abertas: Number(c.tarefas_abertas ?? 0),
    na_fila: Number(c.na_fila ?? 0),
    atribuidos: Number(c.atribuidos ?? 0),
    total_leads: Number(c.total_leads ?? 0),
    chamadas_hoje: Number(c.chamadas_hoje ?? 0),
    equipe: ((c.equipe as Equipe[] | null) ?? []).map((e) => ({
      agente_id: String(e.agente_id),
      nome: String(e.nome ?? ""),
      email: String(e.email ?? ""),
      papel: String(e.papel ?? "operador"),
      limite_diario: e.limite_diario == null ? null : Number(e.limite_diario),
    })),
  }));

  return (
    <>
      <h1>Campanhas</h1>
      <p className="mudo">
        Janela de horário, tentativas, intervalo de re-tentativa e overflow. Supervisor edita as
        campanhas em que tem linha de <code>supervisor</code>; janela fora de 08:00–21:00 só admin.
      </p>
      {res.error ? <p className="alerta">banco: {res.error.message}</p> : null}

      <PainelCampanhas
        campanhas={campanhas}
        gerencia={gerencia}
        emails={emails}
      />

      <h2>Cadência por qualificação</h2>
      <Cadencia
        campanhas={campanhas.map((c) => ({ id: c.id, nome: c.nome, regras_de_cadencia: c.regras_de_cadencia }))}
        podeEditar={gerencia}
      />

      <h2>Tabulação, meta e porta de entrada</h2>
      <TabulacaoCampanha
        campanhas={campanhas.map((c) => ({
          id: c.id,
          nome: c.nome,
          meta_diaria: c.meta_diaria,
          formulario: c.formulario,
          webhook_ativo: c.webhook_ativo,
          webhook_token: c.webhook_token,
        }))}
        podeEditar={gerencia}
        podeWebhook={meu.papel === "admin"}
      />

      <EditorRoteiros
        campanhas={campanhas.map((c) => ({ id: c.id, nome: c.nome, roteiro_id: c.roteiro_id }))}
        gerencia={gerencia}
        roteiros={(rots.data as Roteiro[] | null) ?? []}
      />

      <h2>Estado atual</h2>
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>campanha</th><th>público</th><th>janela</th><th>tent.</th><th>re-tentativa</th>
              <th>overflow</th><th>roteiro</th><th className="num">meta/dia</th><th className="num">tarefas</th>
              <th className="num">leads</th><th className="num">na fila</th>
              <th className="num">atribuídos</th><th className="num">hoje</th><th>time</th><th>status</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td className="mudo">{c.publico}</td>
                <td className="num">{c.janela_ini}–{c.janela_fim}</td>
                <td className="num">{c.max_tentativas}</td>
                <td className="num">{Math.round(c.intervalo_retentativa_s / 60)} min</td>
                <td>{c.permite_overflow ? <span className="chip chip-azul">livre</span> : <span className="chip">rígido</span>}</td>
                <td>{c.roteiro_nome ? <span className="chip chip-verde">{c.roteiro_nome.slice(0, 28)} v{c.roteiro_versao}</span> : <span className="chip chip-ambar">sem roteiro</span>}</td>
                <td className="num">{c.meta_diaria ?? "—"}</td>
                <td className="num">{c.tarefas_abertas ? <span className="chip chip-azul">{c.tarefas_abertas}</span> : 0}</td>
                <td className="num">{c.total_leads}</td>
                <td className="num">{c.na_fila}</td>
                <td className="num">{c.atribuidos}</td>
                <td className="num">{c.chamadas_hoje}</td>
                <td className="mudo">
                  {c.equipe.length ? c.equipe.map((e) => `${e.nome} (${e.papel[0]})`).join(", ") : "só admin"}
                </td>
                <td>{c.ativo ? <span className="chip chip-verde">ativa</span> : <span className="chip chip-ambar">pausada</span>}</td>
              </tr>
            ))}
            {campanhas.length === 0 ? <tr><td colSpan={15} className="mudo">nenhuma campanha no seu escopo</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
