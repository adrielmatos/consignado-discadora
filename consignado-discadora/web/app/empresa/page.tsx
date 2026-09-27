import { supabaseServer } from "@/lib/supabase/server";
import { quemSou } from "@/lib/acoes";
import type { BloqueioLinha, EmpresaInfo } from "@/lib/tipos";
import PainelEmpresa from "./painel";

export const dynamic = "force-dynamic";

/**
 * A tela do dono: quem somos (para o cliente e para a LGPD) e quem não pode ser
 * discado. Nenhum dos seis concorrentes tem essa tela porque para eles a empresa é
 * um tenant invisível; aqui é o dono quem configura, e com razão social, CNPJ e
 * encarregado registrados a operação para de depender de "fala com o chefe".
 */
export default async function PaginaEmpresa() {
  const meu = await quemSou();
  const admin = meu.papel === "admin";
  const sb = await supabaseServer();

  const [emp, bloq] = await Promise.all([
    sb.from("empresas").select("*").order("criado_em", { ascending: true }).limit(1),
    admin
      ? sb.from("v_bloqueios").select("*").order("criado_em", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const bruto = ((emp.data as Record<string, unknown>[] | null) ?? [])[0];
  const empresa: EmpresaInfo | null = bruto
    ? {
        id: String(bruto.id),
        nome: String(bruto.nome ?? ""),
        cnpj: (bruto.cnpj as string | null) ?? null,
        telefone: (bruto.telefone as string | null) ?? null,
        email: (bruto.email as string | null) ?? null,
        responsavel_lgpd: (bruto.responsavel_lgpd as string | null) ?? null,
        aviso_gravacao: (bruto.aviso_gravacao as string | null) ?? null,
        janela_ini: String(bruto.janela_ini ?? "09:00").slice(0, 5),
        janela_fim: String(bruto.janela_fim ?? "18:00").slice(0, 5),
      }
    : null;

  const bloqueios: BloqueioLinha[] = ((bloq.data as Record<string, unknown>[] | null) ?? []).map((b) => ({
    telefone_e164: String(b.telefone_e164),
    motivo: String(b.motivo),
    detalhe: (b.detalhe as string | null) ?? null,
    expira_em: (b.expira_em as string | null) ?? null,
    origem: String(b.origem ?? "manual"),
    criado_em: String(b.criado_em ?? ""),
    criado_por: (b.criado_por as string | null) ?? null,
    dias_restantes: b.dias_restantes == null ? null : Number(b.dias_restantes),
    leads: Number(b.leads ?? 0),
    leads_vivos: Number(b.leads_vivos ?? 0),
  }));

  return (
    <>
      <h1>Empresa</h1>
      <p className="mudo">
        {admin
          ? "Cadastro da empresa, lista de bloqueio com prazo e a porta de entrada de lead externo."
          : "Você vê o cadastro e a lista de bloqueio; editar é decisão do admin (o dono)."}
      </p>
      <PainelEmpresa empresa={empresa} bloqueios={bloqueios} admin={admin} />
    </>
  );
}
