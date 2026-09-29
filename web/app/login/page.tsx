'use client';
import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const [email,setEmail]=useState(''); const [secret,setSecret]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setLoading(true); setError(''); const db=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); const result=await db.auth.signInWithPassword({email,password:secret}); if(result.error) setError(result.error.message); else window.location.assign('/dashboard'); setLoading(false); }
  return <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-7 space-y-5"><div><p className="text-indigo-400 text-xs font-semibold">A&amp;K &amp; DeskComm</p><h1 className="text-2xl font-bold text-white mt-1">CONSIGNADO 360</h1><p className="text-xs text-slate-400 mt-1">Acesso à central operacional</p></div><input required type="email" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white"/><input required type="password" placeholder="Senha" value={secret} onChange={e=>setSecret(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white"/>{error&&<p className="text-xs text-rose-400">{error}</p>}<button disabled={loading} className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-2.5">{loading?'Entrando...':'Entrar'}</button></form></main>;
}
