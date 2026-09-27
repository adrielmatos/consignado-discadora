"use client";

import { useRouter } from "next/navigation";
import { useTempoReal } from "@/lib/tempo-real";

/**
 * Cantinho de 0×0 que mantém o painel server-rendered vivo: escuta as tabelas
 * pedidas e chama `router.refresh()`, que re-executa o Server Component com a
 * RLS do usuário. Nada de estado duplicado no cliente — a fonte continua sendo a
 * view, e o que a pessoa vê é o que o banco deixa ela ver.
 */
export default function AoVivo({ tabelas, fallbackMs }: { tabelas: string[]; fallbackMs?: number }) {
  const router = useRouter();
  useTempoReal(tabelas, () => router.refresh(), fallbackMs);
  return null;
}
