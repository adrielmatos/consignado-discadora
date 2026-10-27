import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Discadora Consignado Pro — CRM & Discador pelo Celular para Crédito Consignado',
  description:
    'A única discadora desenvolvida para correspondentes de crédito consignado. Zero custo de telefonia VoIP (disque direto pelo chip do celular via PC), esteira Meu INSS e simulador de margem.',
};

export default async function Home() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect('/dashboard');
    }
  } catch {
    // Se não houver autenticação ou falhar, serve a Landing Page para o visitante
  }

  return (
    <>
      <link rel="stylesheet" href="/assets/index-jLCnV89z.css" />
      <div id="root" />
      <script type="module" src="/assets/index-MlBAo6-l.js" />
    </>
  );
}
