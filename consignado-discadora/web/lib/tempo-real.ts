"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Painel ao vivo, sem F5.
 *
 * O Supabase emite `postgres_changes` por TABELA, não por view — então a tela
 * escuta as tabelas que alimentam a view que ela mostra e recarrega no primeiro
 * evento. A RLS não muda nada aqui: quem não enxerga a linha pelo SELECT também
 * não recebe o evento dela (o canal só entrega o que o papel já permite ler).
 *
 * Se `supabase/realtime.sql` não foi rodado no projeto, o canal fica mudo e o
 * pulso de `fallbackMs` assume — a página nunca para por causa disso.
 */
export function useTempoReal(
  tabelas: string[],
  recarregar: () => void,
  fallbackMs = 30_000
): void {
  const callbackRef = useRef(recarregar);
  callbackRef.current = recarregar;

  const chave = tabelas.join(",");
  useEffect(() => {
    let cancelado = false;
    let adiado: ReturnType<typeof setTimeout> | null = null;
    const sb = supabaseBrowser();

    // rajada de evento (10 operadores fechando chamada na mesma hora) vira UMA
    // recarga: os 800 ms seguintes são agrupados
    const disparar = () => {
      if (adiado) return;
      adiado = setTimeout(() => {
        adiado = null;
        if (!cancelado) callbackRef.current();
      }, 800);
    };

    let canal: ReturnType<typeof sb.channel> | null = null;
    try {
      canal = sb.channel(`painel-ao-vivo:${chave}`);
      for (const tabela of chave.split(",")) {
        canal = canal.on(
          "postgres_changes",
          { event: "*", schema: "public", table: tabela },
          disparar
        );
      }
      canal.subscribe();
    } catch {
      canal = null; // realtime desabilitado: fica só o pulso
    }

    const pulso = setInterval(disparar, fallbackMs);
    return () => {
      cancelado = true;
      clearInterval(pulso);
      if (adiado) clearTimeout(adiado);
      if (canal) sb.removeChannel(canal);
    };
  }, [chave, fallbackMs]);
}
