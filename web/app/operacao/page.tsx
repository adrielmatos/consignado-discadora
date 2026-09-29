'use client';
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Phone, MessageCircle } from 'lucide-react';
import { telephony } from '@/lib/telephonyService';

export default function OperacaoPage() {
  const [lead,setLead]=useState({id:'123e4567-e89b-12d3-a456-426614174000',nome:'Maria Silva Santos',cpf:'123.456.789-00',telefone:'79999999999',margem_disponivel:'450.00'});
  return <div className="flex bg-slate-950 text-slate-100 min-h-screen"><Sidebar userRole="DONO"/><main className="flex-1 p-8"><div className="bg-slate-900 border border-slate-800 rounded-2xl p-6"><h1 className="text-xl font-bold text-indigo-400">Fila Inteligente &amp; Discador Mobile</h1><p className="text-xs text-slate-400 mt-1">Celular/Phone Link, WhatsApp e Auditoria IA.</p><div className="mt-6 flex gap-2"><button onClick={()=>telephony.openWhatsApp(lead.telefone,`Olá ${lead.nome}, sou da equipe de crédito consignado da A&K. Podemos fazer uma simulação?`)} className="bg-emerald-600 text-white text-xs px-4 py-2.5 rounded-xl flex gap-2"><MessageCircle className="w-4 h-4"/> WhatsApp</button><button onClick={()=>telephony.makeCall(lead.telefone)} className="bg-indigo-600 text-white text-xs px-5 py-2.5 rounded-xl flex gap-2"><Phone className="w-4 h-4"/> Discar no Celular</button></div></div></main></div>;
}
