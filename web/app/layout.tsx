import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'CONSIGNADO 360 — A&K & DeskComm', description: 'Central operacional de consignado, CRM, telefonia e auditoria de IA.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
