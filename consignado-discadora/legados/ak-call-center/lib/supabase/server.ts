import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getPublicConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    // Compatibilidade com projetos que ainda possuem a variável anon antiga.
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  };
}

function createSafeServerClient(url: string, key: string, store: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components podem não permitir escrita de cookies.
        }
      },
    },
  });
}

export async function createClient() {
  const store = await cookies();
  const { url, key } = getPublicConfig();

  if (!url || !key) {
    // O Next pode avaliar módulos server durante o build/prerender.
    // Nunca tente acessar Supabase nesse momento e nunca exponha segredo.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return createSafeServerClient("https://placeholder.invalid", "build-placeholder", store);
    }
    throw new Error("Supabase não configurado.");
  }

  return createSafeServerClient(url, key, store);
}

// Compatibilidade com rotas existentes.
export const createServerSupabaseClient = createClient;

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service client não configurado.");

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
