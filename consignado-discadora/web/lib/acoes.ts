"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { montarLeads } from "@/lib/importador";
import type {
  AnuenciaStatus, CampoFormulario, Disposicao, LeadFila, ObjecaoRoteiro, Papel,
  PassoRoteiro, Pendencias, PoliticaLinha, QuemSou, RoteiroNoClaim, Simulacao,
} from "@/lib/tipos";

export type Resultado<T> = { ok: true; data: T } | { ok: false, erro: string };

const LOTE_IMPORTACAO = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Toda escrita passa por uma `fn_*` do banco.
 *
 * O cliente aqui é o do USUÁRIO (anon key + JWT), não a service role: assim o
 * Postgres resolve `auth.uid()`, a RLS decide o que ele vê e a função checa o
 * papel dele. Se uma página errar o gate, o banco ainda diz não — é assim que o
 * painel fica seguro com 10 pessoas mexendo ao mesmo tempo.
 * A service role só aparece onde não há alternativa (convidar usuário no Auth).
 */
/**
 * As `fn_*` novas devolvem `jsonb` com `{ok, ...}` dentro. Este é o único lugar que
 * sabe ler esse envelope: sem ele, cada tela repetiria o `if (r.ok === false)`.
 */
async function rpcJsonb<T>(fn: string, args: Record<string, unknown> = {}): Promise<Resultado<T>> {
  const saida = await rpc<Record<string, unknown> | Record<string, unknown>[]>(fn, args);
  if (!saida.ok) return saida;
  const r = (Array.isArray(saida.data) ? saida.data[0] : saida.data) ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  return { ok: true, data: r as T };
}

/** "12.5" | 12.5 | "" | null → number | null (campo de formulário pode estar vazio). */
function numeroOpcional(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<Resultado<T>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, erro: error.message };
  return { ok: true, data: data as T };
}

/** identidade + papel de quem está logado (fonte única do gate de UI) */
export async function quemSou(): Promise<QuemSou> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("fn_quem_sou");
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    agente_id: (r.agente_id as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    nome: (r.nome as string | null) ?? null,
    papel: ((r.papel as Papel | undefined) ?? "ninguem") as Papel | "ninguem",
    ativo: Boolean(r.ativo),
    celular: (r.celular as string | null) ?? null,
    limite_diario: Number(r.limite_diario ?? 0),
    pausado_ate: (r.pausado_ate as string | null) ?? null,
    status_agente: (r.status_agente as string | null) ?? null,
    ultimo_ciclo_em: (r.ultimo_ciclo_em as string | null) ?? null,
    discadas_hoje: Number(r.discadas_hoje ?? 0),
    tarefas_abertas: Number(r.tarefas_abertas ?? 0),
    empresa: (r.empresa as QuemSou["empresa"]) ?? null,
    campanhas: Array.isArray(r.campanhas) ? (r.campanhas as QuemSou["campanhas"]) : [],
    gerencia: Array.isArray(r.gerencia) ? (r.gerencia as QuemSou["gerencia"]) : [],
  };
}

// =====================================================================
//  Operação do dia
// =====================================================================

/** Próximo lead discável (carteira → pool da campanha → overflow). */
export async function pegarProximoLead(
  campanhaId?: string | null
): Promise<Resultado<LeadFila | null>> {
  if (campanhaId && !UUID.test(campanhaId)) return { ok: false, erro: "campanha inválida" };

  const saida = await rpc<Record<string, unknown>[] | Record<string, unknown>>(
    "fn_claim_next_lead",
    { p_agente: null, p_campanha: campanhaId || null }
  );
  if (!saida.ok) return saida;

  const linha = Array.isArray(saida.data) ? saida.data[0] : saida.data;
  if (!linha) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      job_id: String(linha.job_id),
      lead_id: Number(linha.lead_id),
      nome: (linha.nome as string | null) ?? null,
      telefone: String(linha.telefone),
      cpf_mask: (linha.cpf_mask as string | null) ?? null,
      cidade: (linha.cidade as string | null) ?? null,
      uf: (linha.uf as string | null) ?? null,
      campanha: (linha.campanha as string | null) ?? null,
      publico: (linha.publico as string | null) ?? null,
      script_resumo: (linha.script_resumo as string | null) ?? null,
      margem_estimada: linha.margem_estimada == null ? null : Number(linha.margem_estimada),
      tentativas: Number(linha.tentativas ?? 0),
      obs: (linha.obs as string | null) ?? null,
      roteiro_id: (linha.roteiro_id as string | null) ?? null,
      roteiro: (linha.roteiro as RoteiroNoClaim | null) ?? null,
      origem_fila: (linha.origem_fila as string | null) ?? null,
      banco_folha: (linha.banco_folha as string | null) ?? null,
      pendente_carteira: Number(linha.pendente_carteira ?? 0),
      campanha_id: (linha.campanha_id as string | null) ?? null,
      formulario: Array.isArray(linha.formulario)
        ? (linha.formulario as CampoFormulario[])
        : [],
      extras: (linha.extras as Record<string, unknown> | null) ?? {},
    },
  };
}

/** Resultado da chamada. O agente do Windows chama a mesma função. */
export async function registrarDisposicao(
  jobId: string,
  disposicao: Disposicao,
  duracaoS: number,
  nota: string
): Promise<Resultado<Record<string, unknown>>> {
  if (!UUID.test(jobId)) return { ok: false, erro: "job inválido" };
  const saida = await rpc<Record<string, unknown>>("fn_finish_call", {
    p_job: jobId,
    p_disposition: disposicao,
    p_duracao: Math.max(0, Math.trunc(Number(duracaoS) || 0)),
    p_nota: (nota || "").slice(0, 2000) || null,
  });
  if (!saida.ok) return saida;

  const r = (saida.data ?? {}) as Record<string, unknown>;
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "não foi possível fechar a ligação") };

  revalidatePath("/");
  revalidatePath("/relatorios");
  return { ok: true, data: r };
}

export async function registrarOptout(telefone: string): Promise<Resultado<boolean>> {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (tel.length < 10) return { ok: false, erro: "telefone inválido" };
  const saida = await rpc("fn_register_optout", {
    p_telefone: tel.startsWith("55") ? `+${tel}` : `+55${tel}`,
    p_motivo: "opt_out",
    p_detalhe: "registrado pelo painel",
  });
  if (!saida.ok) return saida;
  revalidatePath("/");
  revalidatePath("/leads");
  return { ok: true, data: true };
}

/** Pausa (café, reunião, fim de turno). O claim para de entregar lead enquanto durar. */
export async function pausar(minutos: number, agenteId?: string | null): Promise<Resultado<string | null>> {
  const m = Math.trunc(Number(minutos) || 0);
  if (m < 0 || m > 480) return { ok: false, erro: "pausa entre 0 e 480 minutos" };
  const saida = await rpc<string | null>("fn_pausar", {
    p_minutos: m,
    p_agente: agenteId && UUID.test(agenteId) ? agenteId : null,
  });
  if (!saida.ok) return saida;
  revalidatePath("/operador");
  revalidatePath("/equipe");
  return { ok: true, data: saida.data ?? null };
}

/** sair da pausa (o próprio; admin/supervisor podem quem estiver na campanha deles) */
export async function despausar(agenteId?: string | null): Promise<Resultado<boolean>> {
  const saida = await rpc<Record<string, unknown>>("fn_despausar_agente", {
    p_agente: agenteId && UUID.test(agenteId) ? agenteId : null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/operador");
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

export async function meuPerfil(input: { celular?: string }): Promise<Resultado<boolean>> {
  const saida = await rpc("fn_meu_perfil", { p_celular: (input.celular || "").slice(0, 30) });
  if (!saida.ok) return saida;
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

// =====================================================================
//  Proposta e anuência (é aqui que o dinheiro do consignado mora)
// =====================================================================

export async function enviarProposta(input: {
  leadId: number;
  valor: number;
  parcelas: number;
  taxaAa?: number;
  banco?: string;
  protocoloInss?: string;
  obs?: string;
}): Promise<Resultado<{ proposta_id: string }>> {
  const valor = Number(input.valor);
  const parcelas = Math.trunc(Number(input.parcelas));
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "valor deve ser maior que zero" };
  if (!(parcelas >= 6 && parcelas <= 108)) return { ok: false, erro: "parcelas entre 6 e 108 (limite do INSS)" };

  const saida = await rpc<Record<string, unknown>>("fn_enviar_proposta", {
    p_lead: Math.trunc(Number(input.leadId)),
    p_valor: valor,
    p_parcelas: parcelas,
    p_taxa_aa: numeroOpcional(input.taxaAa),
    p_banco: (input.banco || "").slice(0, 120) || null,
    p_protocolo_inss: (input.protocoloInss || "").slice(0, 80) || null,
    p_obs: (input.obs || "").slice(0, 2000) || null,
  });
  if (!saida.ok) return saida;

  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "não foi possível registrar a proposta") };

  revalidatePath("/relatorios");
  revalidatePath("/");
  return { ok: true, data: { proposta_id: String(r.proposta_id) } };
}

export async function marcarAnuencia(input: {
  propostaId: string;
  anuencia: AnuenciaStatus;
  protocolo?: string;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.propostaId)) return { ok: false, erro: "proposta inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_marcar_anuencia", {
    p_proposta: input.propostaId,
    p_anuencia: input.anuencia,
    p_protocolo: (input.protocolo || "").slice(0, 80) || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/relatorios");
  revalidatePath("/");
  return { ok: true, data: true };
}

/** Retorno agendado — o claim só entrega o lead de novo depois desse horário. */
export async function agendarRetorno(input: {
  leadId: number;
  quando: string;
  nota?: string;
}): Promise<Resultado<boolean>> {
  const quando = new Date(input.quando);
  if (Number.isNaN(quando.getTime())) return { ok: false, erro: "data/hora inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_agendar_retorno", {
    p_lead: Math.trunc(Number(input.leadId)),
    p_em: quando.toISOString(),
    p_nota: (input.nota || "").slice(0, 500) || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "não foi possível agendar") };
  revalidatePath("/");
  revalidatePath("/leads");
  return { ok: true, data: true };
}

// =====================================================================
//  Leads
// =====================================================================

export interface ResultadoImportacao {
  aceitos: number;
  ignorados: { linha: number; motivo: string }[];
  erros: string[];
  avisos: string[];
  colunas: string[];
  preservadas: number;
}

/**
 * Importação de planilha. O parse é do módulo puro `lib/importador.ts`; a gravação
 * é a RPC `fn_importar_leads`, que checa se o chamador comanda a campanha antes de
 * inserir — navegador nenhum escreve em `leads` (não tem privilégio).
 */
export async function importarLeads(input: {
  campanhaId: string;
  consentimento: string;
  csv: string;
}): Promise<Resultado<ResultadoImportacao>> {
  if (!input.csv || input.csv.trim() === "") return { ok: false, erro: "cole a planilha antes de importar" };
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida (uuid esperado)" };
  if (!CONSENTIMENTOS.includes(input.consentimento)) return { ok: false, erro: "base legal do contato inválida" };

  const parsed = montarLeads(input.csv, { campanhaId: input.campanhaId, consentimento: input.consentimento });
  if (parsed.registros.length === 0) {
    return {
      ok: false,
      erro:
        "nenhuma linha com telefone válido (DDD + número). " +
        "se a planilha tem cabeçalho, ele precisa trazer uma coluna de número/telefone/celular.",
    };
  }

  const erros: string[] = [];
  let aceitos = 0;
  let ignoradosPeloBanco = 0;

  for (let i = 0; i < parsed.registros.length; i += LOTE_IMPORTACAO) {
    const lote = parsed.registros.slice(i, i + LOTE_IMPORTACAO).map((r) => ({
      telefone_e164: r.telefone_e164,
      nome: r.nome ?? "",
      cpf: r.cpf ?? "",
      cidade: r.cidade ?? "",
      uf: r.uf ?? "",
      banco_folha: r.banco_folha ?? "",
      margem_estimada: r.margem_estimada == null ? null : String(r.margem_estimada),
      renda_estimada: r.renda_estimada == null ? null : String(r.renda_estimada),
      obs: r.obs ?? "",
      ref_externa: r.ref_externa ?? "",
      extras: JSON.stringify(r.extras ?? {}),
    }));

    const saida = await rpc<Record<string, unknown>>("fn_importar_leads", {
      p_campanha: input.campanhaId,
      p_consentimento: input.consentimento,
      p_rows: lote,
    });
    if (!saida.ok) {
      erros.push(`lote ${Math.floor(i / LOTE_IMPORTACAO) + 1}: ${saida.erro}`);
      continue;
    }
    const r = saida.data ?? {};
    if (r.ok === false) return { ok: false, erro: String(r.erro ?? "importação recusada") };
    aceitos += Number(r.inseridos ?? 0);
    ignoradosPeloBanco += Number(r.ignorados ?? 0);
  }

  revalidatePath("/");
  revalidatePath("/leads");
  return {
    ok: true,
    data: {
      aceitos,
      ignorados: [...parsed.ignorados, ...Array.from({ length: Math.max(0, ignoradosPeloBanco) }, () => ({ linha: 0, motivo: "repetido na campanha" }))],
      erros,
      avisos: parsed.avisos,
      colunas: parsed.colunasReconhecidas,
      preservadas: parsed.colunasPreservadas,
    },
  };
}

const CONSENTIMENTOS = ["form_proprio", "app_banco", "presencial", "lista_compartilhada"];

// =====================================================================
//  Gestão: carteira, campanhas, equipe
// =====================================================================

export async function atribuirCarteira(input: {
  campanhaId: string;
  agenteId?: string | null;
  qtd?: number;
  modo?: "quantidade" | "balanceado";
}): Promise<Resultado<{ atribuidos: number } | { erro: string }>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_attribuir_carteira", {
    p_campanha: input.campanhaId,
    p_agente: input.agenteId || null,
    p_qtd: Math.max(0, Math.trunc(Number(input.qtd) || 0)),
    p_modo: input.modo === "balanceado" ? "balanceado" : "quantidade",
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/leads");
  revalidatePath("/campanhas");
  return { ok: true, data: { atribuidos: Number(r.atribuidos ?? 0) } };
}

export async function liberarCarteira(input: {
  agenteId: string;
  campanhaId?: string | null;
}): Promise<Resultado<number>> {
  if (!UUID.test(input.agenteId)) return { ok: false, erro: "operador inválido" };
  const saida = await rpc<number>("fn_liberar_carteira", {
    p_agente: input.agenteId,
    p_campanha: input.campanhaId && UUID.test(input.campanhaId) ? input.campanhaId : null,
  });
  if (!saida.ok) return saida;
  revalidatePath("/leads");
  revalidatePath("/equipe");
  return { ok: true, data: Number(saida.data ?? 0) };
}

// =====================================================================
//  Roteiro de ligação
// =====================================================================

export type RoteiroInput = {
  id?: string | null;
  nome?: string;
  publico?: string;
  avisoCompliance?: string;
  ativo?: boolean;
  /** substitui a lista inteira de passos — de propósito, para não sobrar órfão */
  passos?: { titulo: string; texto: string; obrigatorio?: boolean }[];
  objecoes?: ObjecaoRoteiro[];
};

/**
 * Salvar roteiro. Só supervisor+ (o banco confere). Editar conteúdo sobe a versão e
 * a versão anterior fica na trilha de gestão — é assim que se volta atrás quando o
 * compliance muda a regra do que pode ser dito.
 */
export async function salvarRoteiro(input: RoteiroInput): Promise<
  Resultado<{ roteiroId: string; versao: number; passos: number; objecoes: number }>
> {
  if (input.id && !UUID.test(input.id)) return { ok: false, erro: "roteiro inválido" };
  if (input.nome !== undefined && (input.nome ?? "").trim().length < 3) {
    return { ok: false, erro: "nome do roteiro precisa de 3+ caracteres" };
  }
  if (input.passos && input.passos.length > 40) return { ok: false, erro: "no máximo 40 passos" };
  if (input.objecoes && input.objecoes.length > 60) return { ok: false, erro: "no máximo 60 objeções" };

  const saida = await rpc<Record<string, unknown>>("fn_salvar_roteiro", {
    p_id: input.id || null,
    p_nome: input.nome?.slice(0, 120) ?? null,
    p_publico: input.publico ?? null,
    p_aviso_compliance: input.avisoCompliance?.slice(0, 4000) ?? null,
    p_ativo: input.ativo ?? null,
    p_passos: input.passos
      ? input.passos
          .filter((s) => s.titulo?.trim() && s.texto?.trim())
          .map((s, i) => ({
            ordem: i + 1,
            titulo: s.titulo.trim().slice(0, 120),
            texto: s.texto.trim().slice(0, 4000),
            obrigatorio: s.obrigatorio !== false,
          }))
      : null,
    p_objecoes: input.objecoes
      ? input.objecoes
          .filter((o) => o.objecao?.trim() && o.resposta?.trim())
          .map((o, i) => ({
            ordem: i + 1,
            objecao: o.objecao.trim().slice(0, 300),
            resposta: o.resposta.trim().slice(0, 2000),
            proibido: o.proibido?.trim().slice(0, 1000) || null,
          }))
      : null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/campanhas");
  revalidatePath("/operador");
  return {
    ok: true,
    data: {
      roteiroId: String(r.roteiro_id),
      versao: Number(r.versao ?? 1),
      passos: Number(r.passos ?? 0),
      objecoes: Number(r.objecoes ?? 0),
    },
  };
}

/** Apontar (ou tirar) o roteiro da campanha. O operador passa a recebê-lo no claim. */
export async function atribuirRoteiro(input: {
  campanhaId: string;
  roteiroId?: string | null;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_atribuir_roteiro", {
    p_campanha: input.campanhaId,
    p_roteiro: input.roteiroId || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/campanhas");
  revalidatePath("/operador");
  return { ok: true, data: true };
}

/**
 * Marcar/desmarcar um passo na ligação em andamento. Devolve o progresso
 * (cumpridos/devidos) para a tela não precisar de novo request.
 */
export async function marcarPassoRoteiro(input: {
  leadId: number;
  passoId: number;
  feito: boolean;
  nota?: string;
}): Promise<Resultado<{ cumpridos: number; devidos: number; titulo: string }>> {
  if (!Number.isFinite(input.leadId) || !Number.isFinite(input.passoId)) {
    return { ok: false, erro: "lead/passo inválidos" };
  }
  const saida = await rpc<Record<string, unknown>>("fn_marcar_passo_roteiro", {
    p_lead: Math.trunc(input.leadId),
    p_passo: Math.trunc(input.passoId),
    p_feito: input.feito,
    p_nota: input.nota?.slice(0, 500) || null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/relatorios");
  return {
    ok: true,
    data: {
      cumpridos: Number(r.cumpridos ?? 0),
      devidos: Number(r.devidos ?? 0),
      titulo: String(r.titulo ?? ""),
    },
  };
}

export async function criarCampanha(input: {
  nome: string;
  publico: string;
  script?: string;
}): Promise<Resultado<{ id: string | null }>> {
  const nome = (input.nome || "").trim();
  if (nome.length < 3) return { ok: false, erro: "nome precisa ter ao menos 3 caracteres" };
  const saida = await rpc<string | null>("fn_criar_campanha", {
    p_nome: nome.slice(0, 120),
    p_publico: input.publico,
    p_script: (input.script || "").slice(0, 4000) || null,
  });
  if (!saida.ok) return saida;
  if (!saida.data) return { ok: false, erro: "sem permissão para criar campanha" };
  revalidatePath("/campanhas");
  revalidatePath("/leads");
  return { ok: true, data: { id: String(saida.data) } };
}

export async function editarCampanha(input: {
  id: string;
  nome?: string;
  ativa?: boolean;
  janelaIni?: string;
  janelaFim?: string;
  maxTentativas?: number;
  intervaloRetentativaS?: number;
  permiteOverflow?: boolean;
  script?: string;
  metaDiaria?: number | null;
  webhookAtivo?: boolean;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.id)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_editar_campanha", {
    p_id: input.id,
    p_nome: input.nome ? input.nome.slice(0, 120) : null,
    p_ativa: input.ativa ?? null,
    p_janela_ini: input.janelaIni || null,
    p_janela_fim: input.janelaFim || null,
    p_max_tentativas: input.maxTentativas == null ? null : Math.trunc(Number(input.maxTentativas)),
    p_intervalo_retentativa_s:
      input.intervaloRetentativaS == null ? null : Math.max(0, Math.trunc(Number(input.intervaloRetentativaS))),
    p_permite_overflow: input.permiteOverflow ?? null,
    p_script_resumo: input.script ? input.script.slice(0, 4000) : null,
    p_meta_diaria: input.metaDiaria == null ? null : Math.trunc(Number(input.metaDiaria)),
    p_webhook_ativo: input.webhookAtivo ?? null,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/campanhas");
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true, data: true };
}

export async function definirPapel(input: {
  agenteId: string;
  papel: Papel;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.agenteId)) return { ok: false, erro: "operador inválido" };
  const saida = await rpc<Record<string, unknown>>("fn_definir_papel", {
    p_agente: input.agenteId,
    p_papel: input.papel,
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "apenas admin muda papel") };
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

export async function definirAcesso(input: {
  campanhaId: string;
  email: string;
  papel: Papel;
  limiteDiario?: number | null;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const email = (input.email || "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, erro: "e-mail inválido" };
  const saida = await rpc<Record<string, unknown>>("fn_definir_acesso", {
    p_campanha: input.campanhaId,
    p_email: email.slice(0, 200),
    p_papel: input.papel,
    p_limite_diario: input.limiteDiario == null ? null : Math.trunc(Number(input.limiteDiario)),
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/equipe");
  revalidatePath("/campanhas");
  return { ok: true, data: true };
}

export async function removerAcesso(input: {
  campanhaId: string;
  email: string;
}): Promise<Resultado<boolean>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  const saida = await rpc<Record<string, unknown>>("fn_remover_acesso", {
    p_campanha: input.campanhaId,
    p_email: (input.email || "").trim().toLowerCase().slice(0, 200),
  });
  if (!saida.ok) return saida;
  const r = saida.data ?? {};
  if (r.ok === false) return { ok: false, erro: String(r.erro ?? "sem permissão") };
  revalidatePath("/equipe");
  return { ok: true, data: true };
}

/**
 * Único lugar que usa a service role: criar login no Supabase Auth não tem como
 * ser feito por RLS. O gate de papel está abaixo E dentro das funções SQL.
 */
export async function convidarOperador(input: {
  email: string;
  nome: string;
  celular?: string;
  papel?: Papel;
  limiteDiario?: number;
}): Promise<Resultado<{ criado: boolean }>> {
  const meu = await quemSou();
  if (meu.papel !== "admin") return { ok: false, erro: "apenas admin convida gente nova" };

  const email = (input.email || "").trim().toLowerCase();
  const nome = (input.nome || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "e-mail inválido" };
  if (nome.length < 2) return { ok: false, erro: "nome muito curto" };

  const admin = await supabaseAdmin();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo: `${process.env.APP_URL ?? ""}/auth/callback`,
  });
  if (error) return { ok: false, erro: error.message };

  const { error: up } = await admin
    .from("agentes")
    .upsert(
      {
        email,
        nome: nome.slice(0, 120),
        auth_id: data?.user?.id ?? null,
        celular: (input.celular || "").slice(0, 30) || null,
        papel: input.papel === "supervisor" ? "supervisor" : "operador",
        limite_diario: Math.min(500, Math.max(1, Math.trunc(Number(input.limiteDiario) || 120))),
        ativo: true,
      },
      { onConflict: "email" }
    );
  if (up) return { ok: false, erro: up.message };

  revalidatePath("/equipe");
  return { ok: true, data: { criado: Boolean(data?.user) } };
}


/* ===================== cadência, tabulação, CRM, QA, empresa, webhook =====================
 * Tudo aqui é um invólucro fino em cima de uma `fn_*`: a regra (quem pode, qual campo é
 * obrigatório, qual proposta cabe na margem) mora no SQL. A camada web só traduz
 * formulário em argumento e devolve erro legível — é o que segura o painel com 10
 * pessoas mexendo ao mesmo tempo.
 */

/** política efetiva da campanha (o default da campanha aparece quando não há linha). */
export async function listarPolitica(campanhaId: string): Promise<PoliticaLinha[]> {
  if (!UUID.test(campanhaId)) return [];
  const sb = await supabaseServer();
  const { data } = await sb.rpc("fn_politica_rediscagem", { p_campanha: campanhaId });
  const linhas = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return linhas.map((l) => ({
    disposition: String(l.disposition) as Disposicao,
    acao: (String(l.acao ?? "repetir") as PoliticaLinha["acao"]),
    intervalo_s: Number(l.intervalo_s ?? 14400),
    hora_alvo: l.hora_alvo ? String(l.hora_alvo).slice(0, 5) : null,
    max_tentativas: l.max_tentativas == null ? null : Number(l.max_tentativas),
    prioridade_delta: Number(l.prioridade_delta ?? 0),
    observacao: (l.observacao as string | null) ?? null,
  }));
}

export async function salvarPolitica(input: {
  campanhaId: string;
  regras: PoliticaLinha[];
}): Promise<Resultado<{ regras: number }>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  if (input.regras.length > 8) return { ok: false, erro: "no máximo uma regra por disposição" };
  const r = await rpcJsonb<{ regras: number }>("fn_salvar_politica_rediscagem", {
    p_campanha: input.campanhaId,
    p_rows: input.regras.map((p) => ({
      disposition: p.disposition,
      acao: p.acao,
      intervalo_s: Math.max(60, Math.min(604800, Math.trunc(Number(p.intervalo_s) || 14400))),
      hora_alvo: p.hora_alvo || null,
      max_tentativas: p.max_tentativas == null ? null : Math.trunc(Number(p.max_tentativas)),
      prioridade_delta: Math.max(-50, Math.min(50, Math.trunc(Number(p.prioridade_delta) || 0))),
      observacao: p.observacao?.slice(0, 500) || null,
    })),
  });
  if (r.ok) revalidatePath("/campanhas");
  return r;
}

export async function bloquearTelefone(input: {
  telefone: string;
  motivo?: string;
  dias?: number | null;
  detalhe?: string;
}): Promise<Resultado<{ leads_afetados: number }>> {
  const tel = String(input.telefone || "").replace(/\D/g, "");
  if (tel.length < 10 || tel.length > 15) return { ok: false, erro: "telefone só com dígitos (10 a 15)" };
  const r = await rpcJsonb<{ leads_afetados: number }>("fn_bloquear_telefone", {
    p_telefone: tel.startsWith("55") ? `+${tel}` : `+55${tel}`,
    p_motivo: input.motivo ?? "nao_me_perturbe",
    p_dias: input.dias == null ? null : Math.trunc(Number(input.dias)),
    p_detalhe: input.detalhe?.slice(0, 400) ?? null,
  });
  if (r.ok) {
    revalidatePath("/empresa");
    revalidatePath("/leads");
    revalidatePath("/");
  }
  return r;
}

export async function liberarTelefone(telefone: string): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ ok: boolean }>("fn_liberar_telefone", { p_telefone: telefone });
  if (r.ok) {
    revalidatePath("/empresa");
    revalidatePath("/leads");
  }
  return { ok: true, data: true };
}

export async function salvarFormulario(input: {
  campanhaId: string;
  campos: CampoFormulario[];
}): Promise<Resultado<{ campos: number }>> {
  if (!UUID.test(input.campanhaId)) return { ok: false, erro: "campanha inválida" };
  if (input.campos.length > 24) return { ok: false, erro: "no máximo 24 campos por campanha" };
  const limpos = input.campos
    .filter((c) => c.chave?.trim() && c.rotulo?.trim())
    .map((c) => ({
      chave: c.chave.trim().toLowerCase().slice(0, 40),
      rotulo: c.rotulo.trim().slice(0, 120),
      tipo: c.tipo || "texto",
      opcoes: Array.isArray(c.opcoes) ? c.opcoes.filter(Boolean).slice(0, 24) : undefined,
      obrigatorio: c.obrigatorio !== false,
    }));
  const r = await rpcJsonb<{ campos: number }>("fn_salvar_formulario", {
    p_campanha: input.campanhaId,
    p_campos: limpos,
  });
  if (r.ok) revalidatePath("/campanhas");
  return r;
}

export async function salvarTabulacao(input: {
  leadId: number | string;
  dados: Record<string, unknown>;
}): Promise<Resultado<Record<string, unknown>>> {
  const r = await rpcJsonb<{ extras: Record<string, unknown> }>("fn_salvar_tabulacao", {
    p_lead: Number(input.leadId),
    p_dados: input.dados,
  });
  if (!r.ok) return r;
  revalidatePath("/operador");
  revalidatePath("/leads");
  return { ok: true, data: r.data.extras ?? {} };
}

export async function qualificarLead(
  leadId: number | string,
  nota?: string
): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ status: string }>("fn_qualificar_lead", {
    p_lead: Number(leadId),
    p_nota: nota?.slice(0, 1000) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/operador");
  revalidatePath("/crm");
  return { ok: true, data: true };
}

export async function moverLead(input: {
  leadId: number | string;
  status: string;
  campanhaId?: string | null;
  motivo?: string;
}): Promise<Resultado<boolean>> {
  const PERMITIDOS = new Set([
    "novo", "sem_contato", "contato", "qualificado", "recusado", "inidoneo", "opt_out", "obito", "descarte",
  ]);
  if (!PERMITIDOS.has(input.status)) return { ok: false, erro: "estágio desconhecido" };
  const r = await rpcJsonb<{ status: string }>("fn_mover_lead", {
    p_lead: Number(input.leadId),
    p_status: input.status,
    p_campanha: input.campanhaId || null,
    p_motivo: input.motivo?.slice(0, 400) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/crm");
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true, data: true };
}

export async function criarTarefa(input: {
  leadId: number | string;
  titulo: string;
  tipo?: string;
  venceEm?: string | null;
  detalhe?: string;
  agenteId?: string | null;
}): Promise<Resultado<{ tarefa_id: number }>> {
  if ((input.titulo ?? "").trim().length < 3) return { ok: false, erro: "título muito curto" };
  const r = await rpcJsonb<{ tarefa_id: number }>("fn_criar_tarefa", {
    p_lead: Number(input.leadId),
    p_titulo: input.titulo.trim().slice(0, 200),
    p_tipo: input.tipo ?? "retorno",
    p_vence_em: input.venceEm ? new Date(input.venceEm).toISOString() : null,
    p_detalhe: input.detalhe?.slice(0, 2000) || null,
    p_agente: input.agenteId || null,
  });
  if (r.ok) {
    revalidatePath("/crm");
    revalidatePath("/");
  }
  return r;
}

export async function concluirTarefa(tarefaId: number | string, resultado?: string): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ ok: boolean }>("fn_concluir_tarefa", {
    p_tarefa: Number(tarefaId),
    p_resultado: resultado?.slice(0, 2000) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/crm");
  return { ok: true, data: true };
}

export async function fichaLead(leadId: number | string): Promise<Resultado<import("@/lib/tipos").FichaLead>> {
  const r = await rpc<import("@/lib/tipos").FichaLead>("fn_ficha_lead", { p_lead: Number(leadId) });
  if (!r.ok) return r;
  if (r.data?.ok === false) return { ok: false, erro: String(r.data.erro ?? "sem acesso a este lead") };
  return { ok: true, data: r.data };
}

export async function pontuarLeads(campanhaId?: string | null): Promise<Resultado<{ recalculados: number }>> {
  const r = await rpcJsonb<{ recalculados: number }>("fn_pontuar_leads", {
    p_campanha: campanhaId && UUID.test(campanhaId) ? campanhaId : null,
  });
  if (r.ok) revalidatePath("/leads");
  return r;
}

export async function avaliarChamada(input: {
  cdrId: number | string;
  nota: number;
  criterios?: Record<string, boolean>;
  achados?: string;
  planoAcao?: string;
}): Promise<Resultado<{ qa_id: number }>> {
  const nota = Math.trunc(Number(input.nota));
  if (!Number.isFinite(nota) || nota < 0 || nota > 100) return { ok: false, erro: "nota de 0 a 100" };
  const r = await rpcJsonb<{ qa_id: number }>("fn_avaliar_chamada", {
    p_cdr: Number(input.cdrId),
    p_nota: nota,
    p_criterios: input.criterios ?? {},
    p_achados: input.achados?.slice(0, 2000) || null,
    p_plano_acao: input.planoAcao?.slice(0, 2000) || null,
  });
  if (r.ok) {
    revalidatePath("/relatorios");
    revalidatePath("/leads");
  }
  return r;
}

export async function simularProposta(input: {
  margem: string | number | null;
  parcelas: string | number;
  publico?: string;
  taxaAa?: string | number | null;
}): Promise<Resultado<Simulacao>> {
  const margem = numeroOpcional(input.margem);
  const parcelas = Math.trunc(Number(input.parcelas));
  if (margem == null || margem <= 0) return { ok: false, erro: "informe a margem (R$/mês)" };
  if (!Number.isFinite(parcelas) || parcelas < 1) return { ok: false, erro: "informe o número de parcelas" };
  const r = await rpc<Record<string, unknown>>("fn_simular_proposta", {
    p_margem: margem,
    p_parcelas: parcelas,
    p_publico: input.publico ?? "inss",
    p_taxa_aa: numeroOpcional(input.taxaAa),
  });
  if (!r.ok) return r;
  const d = r.data ?? {};
  return {
    ok: true,
    data: {
      parcela_maxima: Number(d.parcela_maxima ?? 0),
      valor_maximo: Number(d.valor_maximo ?? 0),
      total_pago: Number(d.total_pago ?? 0),
      juros_totais: Number(d.juros_totais ?? 0),
      parcelas: Number(d.parcelas ?? parcelas),
      taxa_aa: Number(d.taxa_aa ?? 0),
      limite_margem_pct: Number(d.limite_margem_pct ?? 40),
      dentro_das_regras: Boolean(d.dentro_das_regras),
      regras: Array.isArray(d.regras) ? (d.regras as string[]) : [],
    },
  };
}

export async function editarEmpresa(input: {
  nome?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  responsavelLgpd?: string;
  avisoGravacao?: string;
}): Promise<Resultado<boolean>> {
  const r = await rpcJsonb<{ empresa_id: string }>("fn_editar_empresa", {
    p_nome: input.nome?.slice(0, 120) || null,
    p_cnpj: (input.cnpj ?? "").replace(/\D/g, "") || null,
    p_telefone: input.telefone?.slice(0, 30) || null,
    p_email: input.email?.trim().slice(0, 200) || null,
    p_responsavel_lgpd: input.responsavelLgpd?.slice(0, 300) || null,
    p_aviso_gravacao: input.avisoGravacao?.slice(0, 1000) || null,
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  revalidatePath("/empresa");
  return { ok: true, data: true };
}

export async function pendencias(): Promise<Pendencias> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("fn_pendencias");
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    tarefas_vencidas: Number(r?.tarefas_vencidas ?? 0),
    retornos_de_hoje: Number(r?.retornos_de_hoje ?? 0),
    anuencia_hoje: Number(r?.anuencia_hoje ?? 0),
    qualificados_sem_proposta: Number(r?.qualificados_sem_proposta ?? 0),
    qa_da_semana: Number(r?.qa_da_semana ?? 0),
    fila_parada: Number(r?.fila_parada ?? 0),
  };
}
