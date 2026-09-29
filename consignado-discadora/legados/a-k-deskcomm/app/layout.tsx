import './globals.css';
import './deskcomm-fixes.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'A&K Deskcomm', description: 'CRM e central de atendimento da A&K Soluções Financeiras' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
