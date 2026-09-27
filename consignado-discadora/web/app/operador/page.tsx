import PainelOperador from "./painel-operador";
import Link from "next/link";
import { quemSou } from "@/lib/acoes";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PaginaOperador() {
  const meu = await quemSou();

  const sb = await supabaseServer();
  const { data: campanhas } = await sb
    .from("campanhas")
    .select("id,nome,publico,janela_ini,janela_fim")
    .order("nome");

  return (
    <>
      <h1>Tela do operador</h1>
      <p className="mudo">
        <b>próximo lead</b> chama <code>fn_claim_next_lead</code>: primeiro a sua carteira, depois o
        pool das suas campanhas, depois overflow (se a campanha permitir). O banco trava o lead com{" "}
        <code>for update skip locked</code> — colega nenhum recebe o mesmo número. Quem disca de fato é
        o agente no Windows (Phone Link); sem agente, use o link <code>tel:</code> do próprio lead.
      </p>
      {meu.papel === "ninguem" ? (
        <p className="alerta">
          Seu login existe, mas você ainda não está em <code>agentes</code>{" "}
          <b>ou não tem acesso a nenhuma campanha</b>. É assim mesmo: sem linha em{" "}
          <code>campanha_equipe</code> a fila devolve nada. Um admin resolve em{" "}
          <Link href="/equipe">Equipe</Link>.
        </p>
      ) : null}

      <PainelOperador
        meu={{
          nome: meu.nome,
          papel: meu.papel,
          limite_diario: meu.limite_diario,
          discadas_hoje: meu.discadas_hoje,
          pausado_ate: meu.pausado_ate,
          celular: meu.celular,
          campanhas: meu.campanhas.map((c) => ({ id: c.id, nome: c.nome })),
        }}
        campanhas={(campanhas ?? []) as { id: string; nome: string; publico: string; janela_ini: string; janela_fim: string }[]}
      />
    </>
  );
}
