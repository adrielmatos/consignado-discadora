import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import FormImportacao from "./form";
import { OPC_DATA, OPC_DATA_HORA } from "@/lib/tempo";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
const ESTADOS = [
  { v: "", r: "todos" },
  { v: "novo", r: "novo" },
  { v: "sem_contato", r: "sem contato" },
  { v: "em_discagem", r: "em discagem" },
  { v: "contato", r: "contato feito" },
  { v: "qualificado", r: "qualificado" },
  { v: "opt_out", r: "opt-out" },
  { v: "descarte", r: "descartado" },
];

/** só letras/números/espaço e @ . - _ : o resto viraria sintaxe do filtro `or` */
function sanitizar(txt: string) {
  return txt.replace(/[^\p{L}\p{N} @._-]/gu, "").trim().slice(0, 60);
}

/**
 * Lista de leads com filtro e paginação no servidor.
 *
 * Paginar aqui (e não `limit(1000)` e cortar no cliente) é a diferença entre a
 * tela abrir com 200 mil leads ou travar o navegador — foi o caminho que o
 * concorrente teve de corrigir depois com "carregamento preguiçoso por módulo".
 */
export default async function PaginaLeads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const status = ESTADOS.some((e) => e.v === p.status) ? String(p.status ?? "") : "";
  const busca = sanitizar(p.q ?? "");
  const campanha = /^[0-9a-f-]{36}$/i.test(p.campanha ?? "") ? p.campanha : undefined;
  const soMeus = p.filtro === "carteira";

  const sb = await supabaseServer();
  const meu = await quemSou();
  const [res, campanhas, bloqueios] = await Promise.all([
    (async () => {
      let q = sb
        .from("leads")
        .select(
          "id,nome,telefone_e164,status,tentativas,banco_folha,uf,margem_estimada,prioridade,atribuido_em,extras,agente_id,criado_em",
          { count: "exact" }
        )
        .order("id", { ascending: false });
      if (status) q = q.eq("status", status);
      if (campanha) q = q.eq("campanha_id", campanha);

      if (soMeus && meu.agente_id) q = q.eq("agente_id", meu.agente_id);
      if (busca) {
        const digitos = busca.replace(/\D/g, "");
        q = digitos.length >= 6
          ? q.or(`nome.ilike.%${busca}%,telefone_e164.like.*${digitos}*,cpf.eq.${digitos.slice(-11)}`)
          : q.ilike("nome", `%${busca}%`);
      }
      return await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
    })(),
    sb.from("campanhas").select("id,nome,ativo,max_tentativas").order("nome"),
    sb.from("bloqueios").select("telefone_e164,motivo,criado_em").order("criado_em", { ascending: false }).limit(20),
    quemSou(),
  ]);

  const lista = (res.data as Record<string, unknown>[] | null) ?? [];
  const total = res.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const meus = (meu.campanhas ?? []).length;

  function linkPara(destino: number, extra: Record<string, string | undefined> = {}) {
    const prm = new URLSearchParams();
    const base = { pagina: String(destino), status: status || undefined, q: busca || undefined, campanha, filtro: soMeus ? "carteira" : undefined, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) prm.set(k, v);
    return `/leads?${prm.toString()}`;
  }

  return (
    <>
      <h1>Leads</h1>
      <p className="mudo">
        {total} lead(s) no seu escopo — página {pagina} de {paginas}. Escopo = suas campanhas
        ({meus}) e sua carteira; o resto é RLS.
      </p>

      <div className="abas">
        {ESTADOS.map((e) => (
          <Link key={e.v || "todos"} href={linkPara(1, { status: e.v || undefined, filtro: undefined })}
                aria-current={e.v === status ? "page" : undefined}>{e.r}</Link>
        ))}
        <Link href={linkPara(1, { filtro: soMeus ? undefined : "carteira" })} aria-current={soMeus ? "page" : undefined}>
          minha carteira
        </Link>
      </div>

      <FormImportacao campanhas={(campanhas.data as { id: string; nome: string }[] | null) ?? []} />

      <form className="card" method="get" action="/leads" style={{ marginTop: 14 }}>
        <div className="linha">
          <label>
            <span className="mudo">buscar por nome, telefone ou CPF</span>
            <input name="q" defaultValue={busca} placeholder="Maria, 7999999, 529982..." />
          </label>
          <label>
            <span className="mudo">campanha</span>
            <select name="campanha" defaultValue={campanha ?? ""}>
              <option value="">todas</option>
              {((campanhas.data as { id: string; nome: string }[] | null) ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <input type="hidden" name="status" value={status} />
          {soMeus ? <input type="hidden" name="filtro" value="carteira" /> : null}
          <div style={{ alignSelf: "end" }}>
            <button className="primario" type="submit">filtrar</button>
          </div>
        </div>
      </form>

      {res.error ? <p className="alerta">banco: {res.error.message}</p> : null}

      <h2>Resultado</h2>
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>#</th><th>nome</th><th>telefone</th><th>banco</th><th>uf</th>
              <th className="num">margem</th><th>status</th><th className="num">tent.</th>
              <th>carteira</th><th>planilha</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => {
              const extras = (l.extras as Record<string, string> | null) ?? {};
              const chaves = Object.keys(extras);
              return (
                <tr key={String(l.id)}>
                  <td>{String(l.id)}</td>
                  <td>{String(l.nome ?? "—")}</td>
                  <td className="mudo">{String(l.telefone_e164)}</td>
                  <td className="mudo">{String(l.banco_folha ?? "—")}</td>
                  <td className="mudo">{String(l.uf ?? "—")}</td>
                  <td className="num">
                    {l.margem_estimada == null ? "—" : Number(l.margem_estimada).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td>{String(l.status)}</td>
                  <td className="num">{String(l.tentativas)}</td>
                  <td className="mudo">{l.atribuido_em ? new Date(String(l.atribuido_em)).toLocaleDateString("pt-BR", OPC_DATA) : "pool"}</td>
                  <td className="mudo" title={chaves.map((k) => `${k}: ${extras[k]}`).join("\n")}>
                    {chaves.length ? `${chaves.length} colunas` : "—"}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 ? <tr><td colSpan={10} className="mudo">nada para este filtro</td></tr> : null}
          </tbody>
        </table>
      </div>

      {paginas > 1 ? (
        <div className="linha" style={{ marginTop: 12 }}>
          {pagina > 1 ? <Link href={linkPara(pagina - 1)}>← anterior</Link> : null}
          <span className="mudo">página {pagina} / {paginas}</span>
          {pagina < paginas ? <Link href={linkPara(pagina + 1)}>próxima →</Link> : null}
        </div>
      ) : null}

      <h2>Números bloqueados (opt-out / não me perturbe)</h2>
      <table>
        <thead><tr><th>telefone</th><th>motivo</th><th>desde</th></tr></thead>
        <tbody>
          {((bloqueios.data as { telefone_e164: string; motivo: string; criado_em: string }[] | null) ?? []).map((b, i) => (
            <tr key={i}>
              <td>{b.telefone_e164}</td><td>{b.motivo}</td>
              <td>{b.criado_em ? new Date(b.criado_em).toLocaleString("pt-BR", OPC_DATA_HORA) : "—"}</td>
            </tr>
          ))}
          {((bloqueios.data as unknown[] | null) ?? []).length === 0 ? (
            <tr><td colSpan={3} className="mudo">nenhum bloqueio registrado</td></tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}
