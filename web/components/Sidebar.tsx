'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Phone, Users, BarChart3, Database, Megaphone, Clock, PhoneForwarded, FileText, Ban, Settings, Upload, LogOut, ShieldCheck, Inbox, Bot } from 'lucide-react';

interface SidebarProps { userRole?: 'DONO' | 'GESTOR' | 'OPERADOR'; userName?: string; }

export default function Sidebar({ userRole = 'DONO', userName = 'Adriel (Proprietário)' }: SidebarProps) {
  const pathname = usePathname();
  const menuItems = [
    { label: 'Visão Geral 360', href: '/dashboard', icon: Home, roles: ['DONO', 'GESTOR'] },
    { label: 'Discador / Operação', href: '/operacao', icon: Phone, roles: ['DONO', 'GESTOR', 'OPERADOR'] },
    { label: 'CRM / Customer 360', href: '/crm', icon: Users, roles: ['DONO', 'GESTOR', 'OPERADOR'] },
    { label: 'Resultados / Funil', href: '/resultados', icon: BarChart3, roles: ['DONO', 'GESTOR'] },
    { label: 'Leads na Base', href: '/leads', icon: Database, roles: ['DONO', 'GESTOR', 'OPERADOR'] },
    { label: 'Campanhas', href: '/campanhas', icon: Megaphone, roles: ['DONO', 'GESTOR'] },
    { label: 'Retornos Pendentes', href: '/retornos', icon: Clock, roles: ['DONO', 'GESTOR', 'OPERADOR'] },
    { label: 'Telefonia / PABX', href: '/telefonia', icon: PhoneForwarded, roles: ['DONO', 'GESTOR'] },
    { label: 'Omnichannel / Inbox', href: '/inbox', icon: Inbox, roles: ['DONO', 'GESTOR', 'OPERADOR'] },
    { label: 'Relatórios por Banco', href: '/relatorios', icon: FileText, roles: ['DONO', 'GESTOR'] },
    { label: 'Não Perturbe (NPO)', href: '/npo', icon: Ban, roles: ['DONO', 'GESTOR'] },
    { label: 'Auditoria de IA', href: '/auditoria', icon: ShieldCheck, roles: ['DONO', 'GESTOR'] },
    { label: 'Automações / Script', href: '/automacoes', icon: Bot, roles: ['DONO'] },
    { label: 'Configurações', href: '/configuracoes', icon: Settings, roles: ['DONO'] },
  ];
  return <aside className="w-64 bg-slate-950 border-r border-slate-800 text-slate-300 min-h-screen flex flex-col justify-between p-4 font-sans shrink-0">
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-2">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-[10px] shadow-lg text-center leading-none">DESK 360</div>
        <div><h2 className="font-bold text-white text-sm leading-tight">CONSIGNADO 360</h2><p className="text-[10px] text-slate-400">A&amp;K &amp; DeskComm</p></div>
      </div>
      <nav className="space-y-1">{menuItems.map((item) => { if (!item.roles.includes(userRole)) return null; const active = pathname === item.href; const Icon = item.icon; return <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${active ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}><Icon className="w-4 h-4" />{item.label}</Link>; })}</nav>
    </div>
    <div className="space-y-2 border-t border-slate-800 pt-4">
      <Link href="/leads/importar" className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-medium py-2.5 rounded-xl"><Upload className="w-4 h-4 text-indigo-400"/> Importar Lista</Link>
      <div className="px-2 text-[10px] text-slate-500 truncate">{userName}</div>
      <button onClick={() => (window.location.href = '/login')} className="flex items-center justify-center gap-2 w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium py-2 rounded-xl"><LogOut className="w-3.5 h-3.5"/> Sair</button>
    </div>
  </aside>;
}
