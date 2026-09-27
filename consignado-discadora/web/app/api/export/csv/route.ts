import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";

/**
 * Exportação CSV dos painéis — o "baixa a planilha e abre no Excel" que todo
 * supervisor pede no primeiro dia.
 *
 * Ela não monta consulta nenhuma no cliente: cada tipo é uma VIEW do schema, e a
 * view tem `security_invoker`, então o CSV que sai daqui recorta exatamente o que a
 * RLS da pessoa deixaria ver na tela. Exportar não é porta de saída de dado alheio.
 */
const TIPOS: Record<string, { view: string; colunas: string[]; nome: string }> = {
  painel: {
    view: "v_painel_dia",
    colunas: ["dia", "campanha", "agente", "chamadas", "contatos", "taxa_contato_pct", "efetivos_30s", "curtas_suspeitas", "segundos_falados"],
    nome: "discagem-por-dia",
  },
  ranking: {
    view: "v_ranking_dia",
    colunas: ["nome", "papel", "status_agente", "chamadas", "contatos", "efetivos_30s", "taxa_contato_pct", "segundos_falados", "na_carteira"],
    nome: "ranking-do-dia",
  },
  esteira: {
    view: "v_crm_leads",
    colunas: ["lead_id", "nome", "telefone_e164", "estagio", "status", "campanha", "dono", "prioridade", "tentativas",
              "margem_estimada", "banco_folha", "uf", "ultima_chamada_at", "proximo_contato_at", "tarefas_abertas", "dias_sem_falar"],
    nome: "esteira-crm",
  },
  agenda: {
    view: "v_agenda",
    colunas: ["id", "lead_id", "lead", "telefone_e164", "campanha", "titulo", "tipo", "situacao", "vence_em", "concluida_em", "resultado", "dono"],
    nome: "agenda",
  },
  metas: {
    view: "v_metas_dia",
    colunas: ["campanha", "meta_diaria", "contatos_hoje", "chamadas_hoje", "pct_meta", "faltam", "operadores_ativos"],
    nome: "metas-do-dia",
  },
  funil: { view: "v_funil", colunas: ["campanha", "status", "leads", "total_campanha", "pct_da_campanha"], nome: "funil" },
  mapa: { view: "v_mapa_horario", colunas: ["dow", "hora", "chamadas", "contatos", "taxa_contato_pct", "duracao_media_s"], nome: "melhor-horario" },
  aderencia: {
    view: "v_aderencia_roteiro",
    colunas: ["agente_id", "agente", "papel", "leads_de_hoje", "passos_devidos", "passos_cumpridos", "aderencia_pct"],
    nome: "aderencia-roteiro",
  },
  qa: { view: "v_qa_resumo", colunas: ["agente", "papel", "avaliacoes", "nota_media", "pior_nota", "auditorias_da_semana", "ultima_avaliacao"], nome: "qa" },
  anuencia: {
    view: "v_anuencia_pendente",
    colunas: ["proposta_id", "lead_id", "nome", "telefone_e164", "valor", "parcelas", "anuencia", "enviada_em", "prazo_validade", "dias_restantes", "responsavel"],
    nome: "anuencia-pendente",
  },
};

function csv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const meu = await quemSou();
  if (meu.papel === "ninguem") {
    return NextResponse.json({ ok: false, erro: "faça login para exportar" }, { status: 401 });
  }

  const tipo = new URL(request.url).searchParams.get("tipo") ?? "painel";
  const config = TIPOS[tipo];
  if (!config) {
    return NextResponse.json({ ok: false, erro: `tipo desconhecido; use um de: ${Object.keys(TIPOS).join(", ")}` }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data, error } = await sb.from(config.view).select(config.colunas.join(",")).limit(5000);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const linhas = (data as unknown as Record<string, unknown>[] | null) ?? [];
  const corpo = [config.colunas.join(";"), ...linhas.map((l) => config.colunas.map((c) => csv(l[c])).join(";"))].join("\r\n");
  const hoje = new Date().toISOString().slice(0, 10);

  return new Response("\uFEFF" + corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${config.nome}-${hoje}.csv"`,
      "cache-control": "no-store",
      "x-linhas": String(linhas.length),
    },
  });
}

export const dynamic = "force-dynamic";
