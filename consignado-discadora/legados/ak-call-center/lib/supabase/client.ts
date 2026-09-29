"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

type PublicConfig = { url: string; key: string };
type AuthSubscription = ReturnType<SupabaseClient["auth"]["onAuthStateChange"]>;

let browserClient: SupabaseClient | null = null;
let configPromise: Promise<PublicConfig> | null = null;

const BUILD_URL = "https://placeholder.invalid";
const BUILD_KEY = "build-placeholder-key";

function getEmbeddedConfig(): PublicConfig {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  ).trim();

  return { url, key };
}

export function isSupabaseConfigured() {
  const { url, key } = getEmbeddedConfig();
  return Boolean(url && key);
}

/**
 * The browser bundle normally receives NEXT_PUBLIC_* at build time.
 * The runtime endpoint is a deliberate fallback for Vercel deployments where
 * public configuration was changed after a build or was not embedded in the
 * bundle. /api/config is public by design and never returns a secret key.
 */
export async function ensureSupabaseConfig(): Promise<PublicConfig> {
  const embedded = getEmbeddedConfig();
  if (embedded.url && embedded.key) return embedded;

  if (!configPromise) {
    configPromise = fetch("/api/config", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.configured || !body.url || !body.key) {
          throw new Error(
            "Conexão com o banco não foi configurada no servidor. Verifique NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY na Vercel.",
          );
        }
        return {
          url: String(body.url).trim(),
          key: String(body.key).trim(),
        };
      })
      .catch((error) => {
        configPromise = null;
        throw error;
      });
  }

  return configPromise;
}

function createBrowserClientFromConfig(config: PublicConfig) {
  if (!config.url || !config.key) {
    throw new Error("Configuração pública do Supabase inválida.");
  }

  browserClient = createBrowserClient(config.url, config.key);
  return browserClient;
}

/**
 * Synchronous accessor used by the existing `supabase.from(...)` API.
 * It is intentionally browser-only. Server Components/API routes must use
 * lib/supabase/server.ts instead.
 */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;

  if (typeof window === "undefined") {
    return createBrowserClient(BUILD_URL, BUILD_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  const embedded = getEmbeddedConfig();
  if (!embedded.url || !embedded.key) {
    throw new Error(
      "Supabase ainda não foi inicializado no navegador. Use ensureClient() antes de acessar o cliente quando NEXT_PUBLIC_* não estiver embutido no build.",
    );
  }

  return createBrowserClientFromConfig(embedded);
}

export async function ensureClient(): Promise<SupabaseClient> {
  if (browserClient) return browserClient;
  if (typeof window === "undefined") return createClient();

  const config = await ensureSupabaseConfig();
  return createBrowserClientFromConfig(config);
}

/**
 * Compatibility proxy for the existing application. Unlike the previous
 * implementation, auth listeners are queued while the runtime client is
 * bootstrapping instead of being replaced by a no-op subscription. This fixes
 * the login race that appeared when the public config was loaded at runtime.
 */
const authProxy = new Proxy({} as SupabaseClient["auth"], {
  get(_target, property) {
    if (property === "getSession") {
      return () => ensureClient().then((client) => client.auth.getSession());
    }

    if (property === "onAuthStateChange") {
      return (
        callback: Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0],
      ): AuthSubscription => {
        let active = true;
        let subscription: AuthSubscription["data"]["subscription"] | null = null;

        void ensureClient()
          .then((client) => {
            if (!active) return;
            const result = client.auth.onAuthStateChange(callback);
            subscription = result.data.subscription;
          })
          .catch(() => {
            // getSession/login reports the actual configuration error. The
            // listener itself must never crash the React effect cleanup path.
          });

        return {
          data: {
            subscription: {
              unsubscribe() {
                active = false;
                subscription?.unsubscribe();
              },
            },
          },
        } as AuthSubscription;
      };
    }

    if (browserClient) {
      const value = Reflect.get(browserClient.auth as object, property);
      return typeof value === "function" ? value.bind(browserClient.auth) : value;
    }

    return undefined;
  },
});

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    if (property === "auth") return authProxy;

    const client = createClient();
    const value = Reflect.get(client as object, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
