import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Porta de entrada de lead vinda de fora do painel (formulário do site, landing,
 * botão de WhatsApp, ferramenta de mídia).
 *
 * Por que ela é pública: quem preencheu o formulário não tem sessão aqui. A
 * proteção não é a sessão, são quatro regras dentro da `fn_receber_lead_webhook`:
 *   1. `webhook_token` da campanha, e a campanha precisa estar com a porta aberta;
 *   2. consentimento por titular, só de canal aceito;
 *   3. número em lista de bloqueio é recusado;
 *   4. trava de volume por minuto.
 * A rota não escreve em nada sozinha: repassa o corpo para a RPC, que roda como
 * `security definer` — é o único caminho de escrita que um `anon` tem neste schema.
 */
const MAX_LINHAS = 50;

type Corpo = {
  token?: string;
  lead?: Record<string, unknown>;
  leads?: Record<string, unknown>[];
};

type Veredito = { ok?: boolean; erro?: string; duplicado?: boolean; bloqueado?: boolean; lead_id?: number };

function cliente(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function receber(sb: SupabaseClient, token: string, linha: Record<string, unknown>): Promise<Veredito> {
  const { data, error } = await sb.rpc("fn_receber_lead_webhook", { p_token: token, p_row: linha });
  if (error) return { ok: false, erro: error.message.slice(0, 300) };
  const bruto = Array.isArray(data) ? data[0] : data; // PostgREST oscila entre objeto e lista de 1
  return (bruto ?? { ok: false, erro: "resposta vazia" }) as Veredito;
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ ok: false, erro: "serviço sem NEXT_PUBLIC_SUPABASE_* configurado" }, { status: 503 });
  }

  let corpo: Corpo;
  try {
    corpo = (await request.json()) as Corpo;
  } catch {
    return NextResponse.json({ ok: false, erro: "esperado JSON" }, { status: 400 });
  }

  const token = String(corpo.token ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ ok: false, erro: "token inválido" }, { status: 401 });
  }

  const linhas = Array.isArray(corpo.leads) ? corpo.leads.slice(0, MAX_LINHAS) : corpo.lead ? [corpo.lead] : [];
  if (!linhas.length) {
    return NextResponse.json({ ok: false, erro: 'envie {"token":"...","lead":{...}} ou "leads":[...]' }, { status: 400 });
  }

  const sb = cliente();
  const saidas = await Promise.all(linhas.map((l) => receber(sb, token, l)));

  const duplicados = saidas.filter((s) => s.duplicado).length;
  const recusados = saidas.filter((s) => !s.ok).map((s) => s.erro ?? "recusado");
  const aceitos = saidas.filter((s) => s.ok && !s.duplicado).length;
  const volume = saidas.some((s) => String(s.erro ?? "").toLowerCase().includes("volume"));

  return NextResponse.json(
    {
      ok: recusados.length === 0,
      aceitos,
      duplicados,
      recusados,
      recebido: linhas.length,
      maximo_por_chamada: MAX_LINHAS,
    },
    {
      status: volume ? 429 : recusados.length === linhas.length ? 400 : 200,
      headers: { "cache-control": "no-store" },
    }
  );
}

/** Health check: confirma que a porta existe sem dizer nada sobre dado de cliente. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      rota: "POST /api/leads",
      precisa: "token da campanha + lead com telefone_e164 e consentimento",
      recusa: "número bloqueado, consentimento ausente ou revogado, mais de 30 leads por minuto",
      exemplo: {
        token: "00000000-0000-0000-0000-000000000000",
        lead: {
          nome: "Quem preencheu o formulário",
          telefone_e164: "+5579999990001",
          cpf: "52998224725",
          cidade: "Aracaju",
          uf: "SE",
          margem_estimada: "420",
          consentimento: "form_proprio",
          origem_url: "/simule-seu-consignado",
        },
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

// nada de cache de edge: o veredito do banco é por requisição
export const dynamic = "force-dynamic";
