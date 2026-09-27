import { entrar } from "./acoes";

export const dynamic = "force-dynamic";

export default async function PaginaLogin(props: {
  searchParams: Promise<{ erro?: string; msg?: string }>;
}) {
  const { erro, msg } = await props.searchParams;

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Entrar</h1>
      <p className="mudo">
        Acesso por link mágico (Supabase Auth). O e-mail precisa existir como usuário do projeto —
        crie em Authentication → Users. O mesmo e-mail deve estar na tabela <code>agentes</code>.
      </p>
      {erro ? <p className="alerta">{erro}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <form action={entrar}>
        <label>
          <span className="mudo">e-mail do operador</span>
          <input name="email" type="email" placeholder="maria@suafinanceira.com.br" required />
        </label>
        <button className="primario" type="submit">
          receber link de acesso
        </button>
      </form>
    </div>
  );
}
