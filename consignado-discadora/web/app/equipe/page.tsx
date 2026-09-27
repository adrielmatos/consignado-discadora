import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import PainelEquipe from "./painel";

export const dynamic = "force-dynamic";

async function carregar() {
  const sb = await supabaseServer();
  const [equipe, campanhas, bloqueios] = await Promise.all([
    sb.from("v_equipe").select("*").order("nome"),
    sb.from("campanhas").select("id,nome,ativo").order("nome"),
    sb.from("bloqueios").select("telefone_e164", { count: "exact", head: true }),
  ]);
  return {
    equipe: (equipe.data as Record<string, unknown>[] | null) ?? [],
    erro: equipe.error?.message ?? null,
    campanhas: (campanhas.data as { id: string; nome: string; ativo: boolean }[] | null) ?? [],
    bloqueados: bloqueios.count ?? 0,
  };
}

/**
 * Página de equipe. A lista vem de `v_equipe` (security_invoker): o que o papel
 * enxerga é decidido no banco, não filtrado no cliente — é por isso que o operador
 * não vê o salário de ninguém nem o telefone dos colegas.
 */
export default async function PaginaEquipe() {
  const [d, meu] = await Promise.all([carregar(), quemSou()]);
  const admin = meu.papel === "admin";
  const gerencia = admin || meu.papel === "supervisor";

  return (
    <>
      <h1>Equipe</h1>
      <p className="mudo">
        Quem entra na fila, limite diário de discagem, pausa e acesso a campanha. Operador vê a si
        mesmo; supervisor vê o time das campanhas dele; admin vê todos — decidido pela RLS de{" "}
        <code>agentes</code>, não por esconder linha no front.
      </p>

      <div className="grade">
        <div className="kpi"><span>pessoas visíveis</span><b>{d.equipe.length}</b></div>
        <div className="kpi">
          <span>agente online</span>
          <b>{d.equipe.filter((e) => e.agente_online).length}</b>
        </div>
        <div className="kpi">
          <span>com job aberto</span>
          <b>{d.equipe.filter((e) => Number(e.jobs_abertos) > 0).length}</b>
        </div>
        <div className="kpi"><span>números bloqueados</span><b>{d.bloqueados}</b></div>
      </div>

      <PainelEquipe
        admin={admin}
        gerencia={gerencia}
        meuId={meu.agente_id ?? ""}
        convide={
          admin
            ? null
            : "Só admin convida gente nova e muda papel global. Acesso a campanha o supervisor concede abaixo."
        }
        equipe={d.equipe.map((e) => ({
          id: String(e.id),
          nome: String(e.nome ?? ""),
          email: String(e.email ?? ""),
          papel: String(e.papel ?? "operador"),
          ativo: Boolean(e.ativo),
          auth_id: e.auth_id ? String(e.auth_id) : null,
          campanhas: (e.campanhas as string[] | null) ?? [],
          pausado_ate: e.pausado_ate ? String(e.pausado_ate) : null,
          discadas_hoje: Number(e.discadas_hoje ?? 0),
          limite_diario: Number(e.limite_diario ?? 0),
        }))}
        campanhas={d.campanhas}
      />

      <h2>Time</h2>
      {d.erro ? <p className="alerta">banco indisponível: {d.erro}</p> : null}
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>nome</th>
              <th>e-mail</th>
              <th>papel</th>
              <th>campanhas</th>
              <th>agente</th>
              <th className="num">hoje</th>
              <th className="num">carteira</th>
              <th className="num">jobs</th>
              <th>login</th>
            </tr>
          </thead>
          <tbody>
            {d.equipe.map((e) => {
              const online = Boolean(e.agente_online);
              const pausado = Boolean(e.pausado_ate && new Date(String(e.pausado_ate)) > new Date());
              const camps = (e.campanhas as string[] | null) ?? [];
              return (
                <tr key={String(e.id)}>
                  <td>{String(e.nome ?? "—")}</td>
                  <td className="mudo">{String(e.email ?? "")}</td>
                  <td>
                    <span
                      className={`chip ${
                        e.papel === "admin" ? "chip-vermelho" : e.papel === "supervisor" ? "chip-azul" : ""
                      }`}
                    >
                      {String(e.papel)}
                    </span>
                  </td>
                  <td className="mudo">{camps.length ? camps.join(", ") : "nenhuma"}</td>
                  <td>
                    <span className={`chip ${online ? "chip-verde" : "chip-ambar"}`}>
                      {online ? "online" : "off"}
                    </span>
                    {pausado ? (
                      <span className="chip chip-ambar" style={{ marginLeft: 4 }}>pausado</span>
                    ) : null}
                  </td>
                  <td className="num">
                    {String(e.discadas_hoje ?? 0)}/{String(e.limite_diario ?? "—")}
                  </td>
                  <td className="num">{String(e.carteira_pendente ?? 0)}</td>
                  <td className="num">{String(e.jobs_abertos ?? 0)}</td>
                  <td>
                    {e.auth_id ? (
                      <span className="chip chip-verde">ok</span>
                    ) : (
                      <span className="chip chip-vermelho">sem login</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {d.equipe.length === 0 ? (
              <tr>
                <td colSpan={9} className="mudo">nenhuma pessoa visível para o seu papel</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mudo" style={{ marginTop: 14 }}>
        Nada aqui aparece sem <Link href="/campanhas">acesso a campanha</Link>: convidado sem linha em{" "}
        <code>campanha_equipe</code> loga, vê 0 leads e recebe 0 ligações — por design.
      </p>
    </>
  );
}
