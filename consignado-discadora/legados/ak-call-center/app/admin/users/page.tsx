import {redirect} from "next/navigation";
import {createServerSupabaseClient} from "@/lib/supabase/server";

export default async function AdminUsersPage(){
  const supabase=await createServerSupabaseClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/");
  const {data:me}=await supabase.from("operadores").select("id,nome,email,perfil,ativo").eq("auth_user_id",user.id).maybeSingle();
  if(me?.perfil!=="admin")redirect("/");
  const {data:users}=await supabase.from("operadores").select("id,nome,email,perfil,ativo,created_at").order("created_at",{ascending:true});
  return <main style={{minHeight:"100vh",padding:32,fontFamily:"Arial,sans-serif"}}>
    <h1>A&K — Usuários</h1>
    <p>Área administrativa protegida pelo perfil de proprietário.</p>
    <div style={{display:"grid",gap:12,maxWidth:900}}>
      {(users||[]).map(u=><section key={u.id} style={{border:"1px solid #ddd",borderRadius:12,padding:16}}>
        <b>{u.nome}</b><div>{u.email||"sem e-mail"}</div><div>Perfil: {u.perfil} • {u.ativo?"Ativo":"Inativo"}</div>
      </section>)}
    </div>
    <p style={{marginTop:24}}>A troca de identidade/impersonação não é habilitada no navegador: qualquer suporte deve preservar a sessão do proprietário e ser auditado no backend.</p>
  </main>;
}
