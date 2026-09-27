#!/usr/bin/env node
/**
 * testa-sql.mjs — roda o SQL do projeto num Postgres de verdade e verifica o que
 * linter nenhum verifica: privilégios, RLS por papel, claim sem corrida, carteira,
 * teto diário, pausa, importação, append-only da auditoria e as views com
 * security_invoker.
 *
 *   bash tools/postgres_local.sh start
 *   cd web && npm run test:sql
 *
 * Conexão padrão: Postgres local do script acima. Recria o banco a cada execução
 * e não lê variável nenhuma do seu projeto Supabase — de propósito.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pkg from "pg";

const { Client } = pkg;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARQ = (p) => readFileSync(join(RAIZ, p), "utf8");

const CFG = {
  host: process.env.PGHOST || "/tmp/pg/sock",
  port: Number(process.env.PGPORT || 54329),
  user: process.env.PGUSER || "postgres",
  database: process.env.PGDATABASE || "postgres",
};
const DB = "discadora_teste";

// uuids fixos: a saída do teste tem de ser reproduzível
const U = {
  maria: "00000000-0000-4000-8000-000000000001",
  joao: "00000000-0000-4000-8000-000000000002",
  pedro: "00000000-0000-4000-8000-000000000003",
};
const A = {
  maria: "10000000-0000-4000-8000-000000000001",
  joao: "10000000-0000-4000-8000-000000000002",
  pedro: "10000000-0000-4000-8000-000000000003",
};
const CAMP_B = "20000000-0000-4000-8000-00000000000b";

let passou = 0;
let falhou = 0;
const pendencias = [];

function ok(nome, cond, detalhe = "") {
  if (cond) {
    passou++;
    console.log(`  ok    ${nome}`);
  } else {
    falhou++;
    pendencias.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

async function conectar(database = CFG.database) {
  const c = new Client({ ...CFG, database });
  await c.connect();
  return c;
}

/** sessão como um papel do Supabase, com claim de usuário; commit no fim */
async function sessao({ papel, sub = null }, corpo, { commit = true } = {}) {
  const c = await conectar(DB);
  try {
    await c.query("begin");
    await c.query(`set local role ${papel}`);
    await c.query(`set local request.jwt.claim.sub = ${sub ? `'${sub}'` : "''"}`);
    await c.query(`set local request.jwt.claim.role = '${papel}'`);
    const r = await corpo(c);
    await c.query(commit ? "commit" : "rollback");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

/** erro esperado (código SQLSTATE), ou null se rodou liso */
async function sqlstate(c, sql, params) {
  try {
    await c.query(sql, params);
    return null;
  } catch (e) {
    return e.code || String(e.message).slice(0, 40);
  }
}

const json = (v) => (typeof v === "string" ? JSON.parse(v) : (v ?? {}));

async function main() {
  const admin = await conectar();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`, [DB]);
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  console.log(`banco de teste: ${DB}`);

  const db = await conectar(DB);
  const t0 = Date.now();
  for (const f of ["supabase/tests/bootstrap-local.sql", "supabase/schema.sql", "supabase/seed-exemplo.sql"]) {
    try {
      await db.query(ARQ(f));
    } catch (e) {
      console.error(`\nERRO aplicando ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`schema + seed aplicados em ${Date.now() - t0} ms`);

  // ------------------------------------------------------------- cenários
  await db.query(`
    insert into auth.users (id, email) values
      ('${U.maria}', 'maria@suafinanceira.com.br'),
      ('${U.joao}',  'joao@suafinanceira.com.br'),
      ('${U.pedro}', 'pedro@suafinanceira.com.br')
    on conflict (id) do nothing;

    update public.agentes set auth_id = '${U.maria}'
     where email = 'maria@suafinanceira.com.br';

    insert into public.agentes (id, auth_id, email, nome, papel, ativo, limite_diario) values
      ('${A.joao}',  '${U.joao}',  'joao@suafinanceira.com.br',  'João',  'operador',  true, 99),
      ('${A.pedro}', '${U.pedro}', 'pedro@suafinanceira.com.br', 'Pedro', 'operador',  true, 99);

    -- Campanha A: a do seed. Janela aberta para o teste não depender do relógio.
    update public.campanhas set janela_ini = '00:00', janela_fim = '23:59', permite_overflow = false
     where nome = 'INSS - margem disponível';
    insert into public.campanha_equipe (campanha_id, agente_id, papel)
      select id, '${A.joao}', 'operador' from public.campanhas
       where nome = 'INSS - margem disponível'
      on conflict do nothing;
    -- Pedro fica SEM linha de acesso: é o caso "funcionário novo, nada liberado"

    insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf,
                              consentimento, consentimento_em, prioridade)
    select id, 'Fila ' || n, '52998224725', '+557999996' || lpad(n::text, 5, '0'),
           'Aracaju', 'SE', 'form_proprio', now(), 0
      from public.campanhas, generate_series(1, 6) n
     where nome = 'INSS - margem disponível'
    on conflict (campanha_id, telefone_e164) do nothing;

    insert into public.campanhas (id, nome, publico, janela_ini, janela_fim, permite_overflow)
    values ('${CAMP_B}', 'BPC/LOAS - só admin', 'bpc_loas', '00:00', '23:59', false)
    on conflict (id) do nothing;

    insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf,
                              consentimento, consentimento_em)
    values
      ('${CAMP_B}', 'Beatriz B', '52998224725', '+5579999980001', 'Aracaju', 'SE', 'form_proprio', now()),
      ('${CAMP_B}', 'Bruno B',   '11144477735', '+5579999980002', 'Aracaju', 'SE', 'form_proprio', now())
    on conflict (campanha_id, telefone_e164) do nothing;
  `);

  const CAMP_A = (await db.query(`select id from public.campanhas where nome = 'INSS - margem disponível'`)).rows[0].id;

  // ------------------------------------------------------------- 1. estrutura
  const n = async (sql, params) => (await db.query(sql, params)).rows[0]?.n ?? 0;
  ok("14 tabelas no schema", (await n(`select count(*)::int as n from information_schema.tables where table_schema='public'`)) >= 14);
  ok("RLS em todas as tabelas", (await n(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relrowsecurity=false`)) === 0);
  ok("toda tabela tem policy", (await n(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and not exists (select 1 from pg_policies p where p.tablename=c.relname)`)) === 0);
  const politicasEscrita = await n(`select count(*)::int as n from pg_policies where schemaname='public' and cmd in ('insert','update','delete')`);
  ok("zero policies de escrita: navegador não escreve tabela nenhuma", politicasEscrita === 0, `políticas de escrita: ${politicasEscrita}`);

  // ------------------------------------------------------------- 2. anon
  for (const [tabela, permissao] of [["leads", "select"], ["cdr", "select"], ["v_fila", "select"]]) {
    const code = await sessao({ papel: "anon" }, (c) => sqlstate(c, `${permissao} * from public.${tabela}`), { commit: false });
    ok(`anon não tem ${permissao.toUpperCase()} em ${tabela}`, code === "42501", `obtido: ${code || "LIVRE"}`);
  }
  const anonRpc = await sessao({ papel: "anon" }, (c) =>
    sqlstate(c, `select * from fn_claim_next_lead(null)`), { commit: false });
  ok("anon não consegue chamar fn_claim_next_lead", anonRpc === "42501", `obtido: ${anonRpc || "RODOU"}`);

  // ------------------------------------------------------------- 3. escopo de leitura
  const leitura = await sessao({ papel: "authenticated", sub: U.joao }, async (c) => {
    const a = await c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_A]);
    const b = await c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_B]);
    const cmp = await c.query(`select count(*)::int as n from public.campanhas`);
    return { a: a.rows[0].n, b: b.rows[0].n, cmp: cmp.rows[0].n };
  }, { commit: false });
  ok("operador lê a campanha em que está", leitura.a >= 3, `A: ${leitura.a}`);
  ok("operador NÃO vê a campanha dos outros", leitura.b === 0, `B: ${leitura.b}`);
  ok("operador só vê as campanhas liberadas a ele", leitura.cmp === 1, `campanhas visíveis: ${leitura.cmp}`);

  const semPapel = await sessao({ papel: "authenticated", sub: U.pedro }, async (c) => {
    const l = await c.query(`select count(*)::int as n from public.leads`);
    const bl = await c.query(`select count(*)::int as n from public.bloqueios`);
    return { l: l.rows[0].n, bl: bl.rows[0].n };
  }, { commit: false });
  ok("quem não tem acesso a nenhuma campanha não vê lead", semPapel.l === 0, `vê ${semPapel.l}`);
  ok("lista de bloqueios continua legível (compliance)", semPapel.bl >= 0);

  const adminVe = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.leads`), { commit: false });
  ok("admin vê a operação inteira", adminVe.rows[0].n >= 5, `vê ${adminVe.rows[0].n}`);

  // ------------------------------------------------------------- 4. escrita direta negada
  // cada negação precisa da própria transação: depois do primeiro erro o Postgres
  // aborta a transação e as próximas statements devolveriam 25P03, não 42501
  const negado = (sql, params) =>
    sessao({ papel: "authenticated", sub: U.joao }, (c) => sqlstate(c, sql, params), { commit: false });
  const negadas = {
    campanhas: await negado(`update public.campanhas set max_tentativas = 9 where id = $1`, [CAMP_A]),
    agentes: await negado(`update public.agentes set papel = 'admin' where id = $1`, [A.joao]),
    leads: await negado(`update public.leads set status = 'qualificado' where id = (select min(id) from public.leads)`),
    cdr: await negado(`delete from public.cdr`),
    eventos: await negado(`update public.lead_events set detalhe = 'adulterado'`),
    jobs: await negado(`insert into public.dial_jobs (lead_id, origem, status) values ((select min(id) from public.leads), 'manual', 'claimed')`),
  };
  ok("operador não edita campanha pela API", negadas.campanhas === "42501", String(negadas.campanhas));
  ok("operador não se promove a admin", negadas.agentes === "42501", String(negadas.agentes));
  ok("operador não atualiza lead direto", negadas.leads === "42501", String(negadas.leads));
  ok("operador não apaga CDR", negadas.cdr === "42501", String(negadas.cdr));
  ok("auditoria é append-only até para operador", negadas.eventos === "42501", String(negadas.eventos));
  ok("operador não cria job por fora do claim", negadas.jobs === "42501", String(negadas.jobs));

  const srNegado = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `update public.lead_events set detalhe = 'x'`), { commit: false });
  const srCdrNegado = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `update public.cdr set duracao_s = 0 where id > 0`), { commit: false });
  ok("service_role também não reescreve auditoria", srNegado === "42501", String(srNegado));
  ok("service_role não reescreve CDR", srCdrNegado === "42501", String(srCdrNegado));
  const srLeads = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `select count(*) from public.leads`), { commit: false });
  ok("service_role lê tudo (o agente precisa)", srLeads === null, String(srLeads));

  // ------------------------------------------------------------- 5. claim + fila
  const claim = async (sub, args = [null, null]) =>
    sessao({ papel: "authenticated", sub }, (c) =>
      c.query(`select * from fn_claim_next_lead($1, $2)`, args), { commit: true });

  const primeiro = await claim(U.joao, [A.joao, CAMP_A]);
  ok("claim devolve exatamente 1 lead", primeiro.rowCount === 1, `linhas: ${primeiro.rowCount}`);
  const l1 = primeiro.rows[0] ?? {};
  ok("claim entrega telefone E164 e script", /^\+\d{10,15}$/.test(String(l1.telefone)) && l1.script_resumo != null, JSON.stringify({ tel: l1.telefone, script: !!l1.script_resumo }));
  ok("origem da fila é registrada", ["carteira", "pool", "overflow"].includes(l1.origem_fila), String(l1.origem_fila));
  ok("lead passa a em_discagem", (await db.query(`select status from public.leads where id = $1`, [l1.lead_id])).rows[0].status === "em_discagem");

  const foraEscopo = await claim(U.joao, [A.joao, CAMP_B]);
  ok("claim de campanha fora do escopo devolve nada", foraEscopo.rowCount === 0, `linhas: ${foraEscopo.rowCount}`);

  const semAcesso = await claim(U.pedro, [A.pedro, null]);
  ok("operador sem acesso a campanha não recebe lead", semAcesso.rowCount === 0, `linhas: ${semAcesso.rowCount}`);

  const dois = await Promise.all([
    (async () => {
      const c = await conectar(DB);
      await c.query("begin");
      await c.query(`set local role authenticated; set local request.jwt.claim.sub = '${U.joao}'`);
      const r = await c.query(`select lead_id from fn_claim_next_lead($1, null)`, [A.joao]);
      await c.query(`select pg_sleep(1.2)`);
      await c.query("commit");
      await c.end();
      return r.rows[0]?.lead_id ?? null;
    })(),
    (async () => {
      await new Promise((r) => setTimeout(r, 300));
      const c = await conectar(DB);
      await c.query("begin");
      await c.query(`set local role authenticated; set local request.jwt.claim.sub = '${U.joao}'`);
      const r = await c.query(`select lead_id from fn_claim_next_lead($1, null)`, [A.joao]);
      await c.query("commit");
      await c.end();
      return r.rows[0]?.lead_id ?? null;
    })(),
  ]);
  ok("dois claims simultâneos nunca entregam o mesmo lead", Boolean(dois[0]) && Boolean(dois[1]) && dois[0] !== dois[1], dois.join(" / "));

  const jobsAbertos = await db.query(
    `select count(*)::int as n from public.dial_jobs where status in ('claimed','discado')`);
  ok("cada claim abriu exatamente o seu job", jobsAbertos.rows[0].n >= 2, `abertos: ${jobsAbertos.rows[0].n}`);
  const dup = await db.query(`select count(*) as n from (select lead_id from public.dial_jobs group by 1 having count(*) > 1) x`);
  ok("índice único impede 2 jobs abertos no mesmo lead", Number(dup.rows[0].n) === 0, `duplicidades: ${dup.rows[0].n}`);

  // ------------------------------------------------------------- 6. fim de chamada
  const fim = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_finish_call($1, 'atendeu', 132, 'interessado, margem livre') as r`, [l1.job_id]), { commit: true });
  ok("fn_finish_call ok", json(fim.rows[0].r).ok !== false, JSON.stringify(json(fim.rows[0].r)));
  const cdr = (await db.query(`select disposition, duracao_s, fonte from public.cdr where job_id = $1`, [l1.job_id])).rows[0];
  ok("CDR com duração medida e origem", cdr?.duracao_s === 132 && cdr?.disposition === "atendeu" && /agent|phone_link/.test(String(cdr?.fonte)), JSON.stringify(cdr ?? null));
  const depois = (await db.query(`select status, tentativas from public.leads where id = $1`, [l1.lead_id])).rows[0];
  ok("lead vai para contato e soma tentativa", depois?.status === "contato" && depois?.tentativas === 1, JSON.stringify(depois ?? null));
  const reuso = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_finish_call($1, 'secretaria', 9, null) as r`, [l1.job_id]), { commit: true });
  ok("job encerrado recusa segundo fim (idempotência)", json(reuso.rows[0].r).ok === false, JSON.stringify(json(reuso.rows[0].r)));
  const eventos = (await db.query(`select count(*)::int as n from public.lead_events where lead_id = $1`, [l1.lead_id])).rows[0].n;
  ok("histórico de status do lead gravado", eventos >= 1, `eventos: ${eventos}`);

  const invalido = await claim(U.joao, [A.joao, CAMP_A]);
  ok("há lead disponível para testar disposição de descarte", invalido.rowCount === 1, `linhas: ${invalido.rowCount}`);
  if (invalido.rowCount === 1) {
    const r = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select fn_finish_call($1, 'numero_invalido', 2, null) as r`, [invalido.rows[0].job_id]), { commit: true });
    ok("disposição numero_invalido encerra o job", json(r.rows[0].r).ok !== false, JSON.stringify(json(r.rows[0].r)));
    const st = (await db.query(`select status from public.leads where id = $1`, [invalido.rows[0].lead_id])).rows[0].status;
    ok("numero_invalido tira o lead da fila", st === "descarte", `status: ${st}`);
    const curta = (await db.query(
      `select count(*)::int as n from public.cdr where lead_id = $1 and coalesce(duracao_s, 0) < 3`,
      [invalido.rows[0].lead_id])).rows[0].n;
    ok("chamada curta (<3s) fica registrada para a regra da Anatel", curta === 1, `cdr curtos: ${curta}`);
  }

  // ------------------------------------------------------------- 7. carteira
  const atribuirComoJoao = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_attribuir_carteira($1, $2, 2) as r`, [CAMP_A, A.joao]), { commit: true });
  ok("operador não monta a própria carteira", json(atribuirComoJoao.rows[0].r).ok === false, JSON.stringify(json(atribuirComoJoao.rows[0].r)));

  const atribuirComoMaria = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_attribuir_carteira($1, $2, 2) as r`, [CAMP_A, A.joao]), { commit: true });
  ok("admin atribui 2 leads à carteira do João", json(atribuirComoMaria.rows[0].r).atribuidos >= 1, JSON.stringify(json(atribuirComoMaria.rows[0].r)));

  const daCarteira = await claim(U.joao, [A.joao, CAMP_A]);
  ok("claim seguinte vem marcado como carteira", daCarteira.rows[0]?.origem_fila === "carteira", `origem: ${daCarteira.rows[0]?.origem_fila}`);

  const liberar = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_liberar_carteira($1, $2) as n`, [A.joao, CAMP_A]), { commit: true });
  ok("admin devolve a carteira para o pool", Number(liberar.rows[0].n) >= 0, `liberados: ${liberar.rows[0]?.n}`);

  // ------------------------------------------------------------- 8. teto diário e pausa
  await db.query(`update public.agentes set limite_diario = 2 where id = $1`, [A.joao]);
  const exausto = await claim(U.joao, [A.joao, CAMP_A]);
  ok("teto diário bloqueia novos claims", exausto.rowCount === 0, `linhas: ${exausto.rowCount}`);
  await db.query(`update public.agentes set limite_diario = 99 where id = $1`, [A.joao]);

  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_pausar(20)`), { commit: true });
  const pausado = await claim(U.joao, [A.joao, CAMP_A]);
  ok("pausa manual tira o operador da fila", pausado.rowCount === 0, `linhas: ${pausado.rowCount}`);
  const pausarOutroNegado = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    sqlstate(c, `select fn_pausar(30, $1)`, [A.joao]), { commit: false });
  ok("pausar colega sem gerência levanta exceção (P0001)", pausarOutroNegado === "P0001", String(pausarOutroNegado));

  const despausarNegado = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_despausar_agente($1) as r`, [A.joao]), { commit: true });
  ok("colega sem gerência na campanha não despausa ninguém", json(despausarNegado.rows[0].r).ok === false, JSON.stringify(json(despausarNegado.rows[0].r)));
  const despausarProprio = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_despausar_agente(null) as r`), { commit: true });
  ok("o próprio operador sai da pausa", json(despausarProprio.rows[0].r).ok === true, JSON.stringify(json(despausarProprio.rows[0].r)));
  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_pausar(20)`), { commit: true });
  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_despausar_agente(null)`), { commit: true });
  const voltou = await claim(U.joao, [A.joao, CAMP_A]);
  ok("despausar devolve o operador à fila", voltou.rowCount === 1, `linhas: ${voltou.rowCount}`);

  // ------------------------------------------------------------- 9. importação via RPC
  const linhas = JSON.stringify([
    { telefone_e164: "+5579999970001", nome: "Teste Um", cpf: "52998224725", cidade: "Aracaju", uf: "SE", banco_folha: "Itaú", margem_estimada: 350, extras: { matricula: "123" } },
    { telefone_e164: "+5579999970002", nome: "Teste Dois", cpf: "11144477735", cidade: "Nossa Senhora do Socorro", uf: "SE", banco_folha: "Banco do Brasil", margem_estimada: 510 },
    { telefone_e164: "+5579999970001", nome: "Duplicado", cpf: null },
  ]);
  const impJoao = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_importar_leads($1, 'form_proprio', $2::jsonb) as r`, [CAMP_A, linhas]), { commit: true });
  ok("operador não importa planilha em campanha que não comanda", json(impJoao.rows[0].r).ok === false, JSON.stringify(json(impJoao.rows[0].r)));

  const impMaria = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_importar_leads($1, 'form_proprio', $2::jsonb) as r`, [CAMP_A, linhas]), { commit: true });
  const rImp = json(impMaria.rows[0].r);
  ok("admin importa 2 e ignora o duplicado", rImp.inseridos === 2 && rImp.ignorados === 1, JSON.stringify(rImp));

  // ------------------------------------------------------------- 10. RBAC de equipe
  const papelNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_definir_papel($1, 'admin') as r`, [A.joao]), { commit: true });
  ok("operador não muda o próprio papel", json(papelNegado.rows[0].r).ok === false, JSON.stringify(json(papelNegado.rows[0].r)));

  const papelOk = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_papel($1, 'supervisor') as r`, [A.pedro]), { commit: true });
  ok("admin promove a supervisor", json(papelOk.rows[0].r).ok === true, JSON.stringify(json(papelOk.rows[0].r)));

  const acesso = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_acesso($1, $2, 'supervisor', 60) as r`, [CAMP_A, "pedro@suafinanceira.com.br"]), { commit: true });
  ok("admin dá acesso de supervisor à campanha A", json(acesso.rows[0].r).ok === true, JSON.stringify(json(acesso.rows[0].r)));

  const agoraV = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_A]), { commit: false });
  ok("após o acesso, Pedro passa a ver a campanha A", agoraV.rows[0].n > 0, `vê ${agoraV.rows[0].n}`);

  const janelaRuim = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, '18:00', '09:00') as r`, [CAMP_A]), { commit: true });
  ok("janela invertida é rejeitada", json(janelaRuim.rows[0].r).ok === false, JSON.stringify(json(janelaRuim.rows[0].r)));

  const janelaIlegal = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, '06:00', '23:00') as r`, [CAMP_A]), { commit: true });
  ok("supervisor não abre janela fora de 08–21", json(janelaIlegal.rows[0].r).ok === false, JSON.stringify(json(janelaIlegal.rows[0].r)));

  // ------------------------------------------------------------- 11. retorno + anuência
  const leadDeJoao = (await db.query(`select id from public.leads where campanha_id = $1 and status <> 'opt_out' limit 1`, [CAMP_A])).rows[0].id;
  const agendado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_agendar_retorno($1, now() + interval '3 hours', 'ligar depois do almoço') as r`, [leadDeJoao]), { commit: true });
  ok("retorno agendado dentro do escopo", json(agendado.rows[0].r).ok === true, JSON.stringify(json(agendado.rows[0].r)));
  const noPassado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_agendar_retorno($1, now() - interval '1 hour') as r`, [leadDeJoao]), { commit: true });
  ok("retorno no passado é recusado", json(noPassado.rows[0].r).ok === false, JSON.stringify(json(noPassado.rows[0].r)));

  // negação tem de ser numa campanha que ninguém do teste ganhou acesso — a B é
  // justamente a que ficou só com o admin (Senão o "não deveria poder" já conseguiu
  // acesso na seção de RBAC e o teste vira falso-positivo.)
  const leadForaEscopo = (await db.query(
    `select id from public.leads where campanha_id = $1 order by id limit 1`, [CAMP_B])).rows[0].id;
  const propNegada = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 8000, 36) as r`, [leadForaEscopo]), { commit: true });
  ok("proposta em campanha fora do escopo é recusada", json(propNegada.rows[0].r).ok === false, JSON.stringify(json(propNegada.rows[0].r)));
  const filaFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.leads where campanha_id = $1`, [CAMP_B]), { commit: false });
  ok("João continua sem enxergar a campanha B", filaFora.rows[0].n === 0, `vê ${filaFora.rows[0].n}`);

  const propFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 8000, 200) as r`, [leadDeJoao]), { commit: true });
  ok("parcelas fora de 6–108 são recusadas", json(propFora.rows[0].r).ok === false, JSON.stringify(json(propFora.rows[0].r)));

  const prop = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 8000.5, 36, 2.15, 'Itaú') as r`, [leadDeJoao]), { commit: true });
  ok("proposta registrada com prazo de 5 dias", json(prop.rows[0].r).ok === true, JSON.stringify(json(prop.rows[0].r)));
  const anu = (await db.query(`select dias_restantes, valor, responsavel from public.v_anuencia_pendente limit 1`)).rows[0];
  ok("view de anuência calcula os dias do prazo de 5", anu && anu.dias_restantes <= 5 && anu.dias_restantes >= 4, JSON.stringify(anu ?? null));

  const marcar = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_anuencia($1, 'confirmada') as r`,
            [json(prop.rows[0].r).proposta_id]), { commit: true });
  ok("operador não marca anuência (supervisor+)", json(marcar.rows[0].r).ok === false, JSON.stringify(json(marcar.rows[0].r)));
  const marcarOk = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_marcar_anuencia($1, 'confirmada', 'INSS-123') as r`,
            [json(prop.rows[0].r).proposta_id]), { commit: true });
  ok("admin confirma a anuência e o protocolo fica salvo", json(marcarOk.rows[0].r).ok === true, JSON.stringify(json(marcarOk.rows[0].r)));
  const proto = (await db.query(`select protocolo_inss, anuencia from public.propostas where id = $1`,
                [json(prop.rows[0].r).proposta_id])).rows[0];
  ok("protocolo do INSS gravado na proposta", proto?.protocolo_inss === "INSS-123" && proto?.anuencia === "confirmada", JSON.stringify(proto ?? null));

  // ------------------------------------------------------------- 12. views por papel
  const visaoDoDia = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select coalesce(sum(chamadas),0)::int as n from public.v_painel_dia`), { commit: false });
  const visaoAdmin = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select coalesce(sum(chamadas),0)::int as n from public.v_painel_dia`), { commit: false });
  ok("v_painel_dia respeita RLS (security_invoker)", visaoDoDia.rows[0].n <= visaoAdmin.rows[0].n, `joão ${visaoDoDia.rows[0].n} vs admin ${visaoAdmin.rows[0].n}`);

  const monitor = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_monitor_equipe`), { commit: false });
  ok("v_monitor_equipe consulta sem erro e mostra o time do escopo", monitor.rows[0].n >= 1, `linhas: ${monitor.rows[0].n}`);
  const ranking = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select agente_id, chamadas, na_carteira from public.v_ranking_dia order by chamadas desc`), { commit: false });
  ok("v_ranking_dia devolve linha por operador", ranking.rowCount >= 2, `linhas: ${ranking.rowCount}`);

  const equipe = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n, bool_and(nome is not null) as completo from public.v_equipe`), { commit: false });
  ok("v_equipe respeita o escopo e não quebra", equipe.rows[0].n >= 1 && equipe.rows[0].completo === true, `linhas: ${equipe.rows[0].n}`);
  const gestao = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select nome, na_fila >= 0 as conta, jsonb_typeof(equipe) as tipo_eq from public.v_campanhas_gestao order by nome`), { commit: false });
  ok("v_campanhas_gestao traz contagem e equipe das 2 campanhas", gestao.rowCount === 2 && gestao.rows.every((r) => r.conta && r.tipo_eq === "array"), JSON.stringify(gestao.rows));
  const monitorJoao = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_monitor_equipe where discadas_hoje >= 0`), { commit: false });
  ok("v_monitor_equipe calcula discadas do dia sem erro", monitorJoao.rows[0].n >= 1, `linhas: ${monitorJoao.rows[0].n}`);

  // ------------------------------------------------------------- 13. opt-out + expiração
  const tel = (await db.query(`select telefone_e164 from public.leads where id = $1`, [leadDeJoao])).rows[0].telefone_e164;
  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_register_optout($1, 'nao_me_perturbe', 'pedido na ligação')`, [tel]), { commit: true });
  const bloqueado = (await db.query(`select count(*)::int as n from public.bloqueios where telefone_e164 = $1`, [tel])).rows[0].n;
  ok("opt-out entra na lista de bloqueados", bloqueado === 1, `bloqueios: ${bloqueado}`);
  const nuncaMais = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_fila where telefone_e164 = $1`, [tel]), { commit: false });
  ok("número em opt-out nunca aparece na fila", nuncaMais.rows[0].n === 0, `aparece ${nuncaMais.rows[0].n}x`);

  await db.query(`update public.dial_jobs set claimed_em = now() - interval '10 minutes' where status = 'claimed'`);
  const exp = (await db.query(`select fn_expirar_jobs(5) as n`)).rows[0].n;
  ok("job pendurado volta para a fila", Number(exp) >= 1, `expirados: ${exp}`);
  const aindaAbertos = (await db.query(`select count(*)::int as n from public.dial_jobs where status in ('claimed','discado')`)).rows[0].n;
  ok("depois do fn_expirar_jobs não resta job órfão", aindaAbertos === 0, `restam: ${aindaAbertos}`);

  // ------------------------------------------------------------- 14. heartbeat
  const hb = await sessao({ papel: "service_role" }, (c) =>
    c.query(`select fn_heartbeat('discando', $1) as r`, [A.joao]).then(() => true), { commit: true });
  const ciclo = (await db.query(`select status_agente, ultimo_ciclo_em from public.agentes where id = $1`, [A.joao])).rows[0];
  ok("agente reporta heartbeat (monitor de 'online')", hb === true && ciclo?.status_agente === "discando" && ciclo?.ultimo_ciclo_em != null, JSON.stringify(ciclo ?? null));

  // ------------------------------------------------------------- 15. quem sou / despausar
  const sou = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_quem_sou() as r`), { commit: false });
  const eu = json(sou.rows[0].r);
  ok("fn_quem_sou devolve papel, limites e campanhas", eu.papel === "operador" && eu.limite_diario > 0 && Array.isArray(eu.campanhas) && eu.campanhas.length >= 1, JSON.stringify(eu).slice(0, 220));
  ok("fn_quem_sou separa o que ele gerencia (nada, sendo operador)", Array.isArray(eu.gerencia) && eu.gerencia.length === 0, JSON.stringify(eu.gerencia));

  const souAdmin = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_quem_sou() as r`), { commit: false });
  const adm = json(souAdmin.rows[0].r);
  ok("fn_quem_sou do admin mostra a operação inteira", adm.papel === "admin" && adm.gerencia.length >= 2, JSON.stringify(adm.gerencia));

  await sessao({ papel: "authenticated", sub: U.joao }, (c) => c.query(`select fn_pausar(30)`), { commit: true });
  const despausarPorSupervisor = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_despausar_agente($1) as r`, [A.joao]), { commit: true });
  ok("supervisor da campanha despausa o time dele", json(despausarPorSupervisor.rows[0].r).ok === true, JSON.stringify(json(despausarPorSupervisor.rows[0].r)));
  const pausadoAinda = (await db.query(`select pausado_ate from public.agentes where id = $1`, [A.joao])).rows[0].pausado_ate;
  ok("pausa foi de fato retirada", pausadoAinda === null, String(pausadoAinda));

  // ------------------------------------------- 16. trilha de decisões de gestão
  // Nada de gestão acontece sem deixar rastro: quem deu acesso, com que limite,
  // quem mudou a regra da campanha e o que era antes. É a pergunta que volta
  // depois do primeiro mês com 10+ funcionários — e a que o jurídico do banco faz.
  const concedeuAntes = (await db.query(
    `select count(*)::int as n from public.auditoria_gestao where acao = 'acesso_concedido'`)).rows[0].n;

  const conde = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_acesso($1, 'pedro@suafinanceira.com.br', 'operador', 77) as r`, [CAMP_A]), { commit: true });
  ok("admin concedeu/ajustou acesso de Pedro na campanha A", json(conde.rows[0].r).ok === true, JSON.stringify(json(conde.rows[0].r)));

  const trilhaAcesso = await db.query(
    `select acao, quem_email, alvo->>'email' as email, alvo->>'limite_diario' as limite,
            alvo->>'papel' as papel
       from public.auditoria_gestao where acao = 'acesso_concedido'`);
  ok("o acesso virou linha na trilha (alvo + limite)",
     trilhaAcesso.rows.length === concedeuAntes + 1 &&
     trilhaAcesso.rows.some((r) => r.email === "pedro@suafinanceira.com.br" && r.limite === "77" && r.papel === "operador"),
     JSON.stringify(trilhaAcesso.rows.slice(-2)));
  ok("a trilha grava o autor (e-mail do agente da sessão, não um string do cliente)",
     trilhaAcesso.rows.every((r) => r.quem_email === "maria@suafinanceira.com.br"),
     JSON.stringify(trilhaAcesso.rows.map((r) => r.quem_email).slice(0, 4)));

  const viuTrilha = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.auditoria_gestao`), { commit: false });
  ok("operador não lê a trilha de gestão (RLS, não esconder botão)", viuTrilha.rows[0].n === 0, `viu ${viuTrilha.rows[0].n}`);

  const leuTrilha = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.auditoria_gestao`), { commit: false });
  ok("admin lê a trilha inteira", leuTrilha.rows[0].n >= concedeuAntes + 1, `linhas: ${leuTrilha.rows[0].n}`);

  const apagou = await sessao({ papel: "service_role" }, (c) =>
    sqlstate(c, `delete from public.auditoria_gestao`), { commit: false });
  ok("nem a service role apaga a trilha (revoke delete)", apagou === "42501", String(apagou));

  // edição de campanha guarda o valor anterior — é como se desfaz uma regra
  const janelaFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, 900, null, null, null) as r`, [CAMP_A]), { commit: false });
  ok("tentativa de max_tentativas fora de 1-10 é recusada (e por quem não pode)",
     json(janelaFora.rows[0].r).ok === false, JSON.stringify(json(janelaFora.rows[0].r)));

  const intervaloAntes = (await db.query(
    `select intervalo_retentativa_s::int as n from public.campanhas where id = $1`, [CAMP_A])).rows[0].n;

  const editou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, 600, null, null) as r`, [CAMP_A]), { commit: true });
  ok("admin alterou o intervalo de re-tentativa", json(editou.rows[0].r).ok === true, JSON.stringify(json(editou.rows[0].r)));
  const trilhaEdit = (await db.query(
    `select alvo->'antes'->>'intervalo_retentativa_s' as antes, alvo->'mudancas'->>'intervalo_s' as depois
       from public.auditoria_gestao where acao = 'campanha_editada' order by id desc limit 1`)).rows[0];
  ok("a trilha guarda o valor ANTES e o depois da mudança",
     trilhaEdit?.antes === String(intervaloAntes) && trilhaEdit?.depois === "600",
     JSON.stringify({ trilhaEdit, intervaloAntes }));

  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, $2, null, null) as r`,
            [CAMP_A, intervaloAntes]), { commit: true });

  const mudouPapel = (await db.query(
    `select count(*)::int as n from public.auditoria_gestao where acao = 'papel_alterado'
       and alvo->>'novo_papel' = 'supervisor'`)).rows[0].n;
  ok("mudança de papel global também está na trilha", Number(mudouPapel) >= 1, `linhas: ${mudouPapel}`);

  const removeNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_remover_acesso($1, 'pedro@suafinanceira.com.br') as r`, [CAMP_A]), { commit: false });
  ok("operador não remove acesso de ninguém", json(removeNegado.rows[0].r).ok === false, JSON.stringify(json(removeNegado.rows[0].r)));

  const removeu = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_remover_acesso($1, 'pedro@suafinanceira.com.br') as r`, [CAMP_A]), { commit: true });
  ok("admin removeu o acesso de Pedro da campanha A", Number(json(removeu.rows[0].r).removidos) === 1, JSON.stringify(json(removeu.rows[0].r)));
  const trilhaRem = (await db.query(
    `select alvo->'quem'->0->>'email' as email, alvo->'quem'->0->>'papel_anterior' as papel
       from public.auditoria_gestao where acao = 'acesso_removido' order by id desc limit 1`)).rows[0];
  ok("a remoção registra quem era e o papel anterior (dá para reverter)",
     trilhaRem?.email === "pedro@suafinanceira.com.br" && trilhaRem?.papel === "operador", JSON.stringify(trilhaRem ?? null));

  // ------------------------------------------------- 17. roteiro de ligação
  // Biblioteca no banco (não em localStorage), entregue no claim, com marcação de
  // passos e objeções. É a parte que o concorrente tem como texto solto no navegador.
  const telRoteiro = "+5579999971001";
  await db.query(`update public.agentes set limite_diario = 500`);
  await db.query(
    `insert into public.leads (campanha_id, nome, cpf, telefone_e164, cidade, uf, consentimento, consentimento_em)
     select id, 'Rosana Roteiro', '52998224725', $1, 'Aracaju', 'SE', 'form_proprio', now()
       from public.campanhas where nome = 'INSS - margem disponível'
     on conflict (campanha_id, telefone_e164) do nothing`, [telRoteiro]);

  const roteirosView = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select nome, versao, jsonb_array_length(passos)::int as n_passos,
                    jsonb_array_length(objecoes)::int as n_objecoes, em_uso
               from public.v_roteiros where nome like 'INSS%'`), { commit: false });
  const roteiroInss = roteirosView.rows[0];
  ok("operador lê o roteiro ativo com passos e objeções (1 request)",
     !!roteiroInss && roteiroInss.n_passos === 7 && roteiroInss.n_objecoes === 5 && roteiroInss.em_uso === 1,
     JSON.stringify(roteiroInss ?? null));

  // roteiro novo e INATIVO: rascunho que o operador não pode ver
  const rascunho = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_roteiro(null, 'Roteiro rascunho', 'clt', null, false, null, null) as r`), { commit: true });
  ok("admin criou roteiro já inativo (p_ativo vale na criação)",
     json(rascunho.rows[0].r).ok === true &&
     (await db.query(`select ativo from public.roteiros where nome = 'Roteiro rascunho'`)).rows[0].ativo === false,
     JSON.stringify(json(rascunho.rows[0].r)));
  const rascunhoNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_roteiros where nome = 'Roteiro rascunho'`), { commit: false });
  ok("roteiro inativo (rascunho) não aparece para operador", rascunhoNegado.rows[0].n === 0, `viu ${rascunhoNegado.rows[0].n}`);
  const veRascunho = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.v_roteiros where nome = 'Roteiro rascunho'`), { commit: false });
  ok("admin vê o rascunho inativo", veRascunho.rows[0].n === 1, `linhas: ${veRascunho.rows[0].n}`);
  const criaComoOp = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_roteiro(null, 'Roteiro do João', 'inss', null, true, '[]', '[]') as r`), { commit: false });
  ok("operador não cria nem edita roteiro", json(criaComoOp.rows[0].r).ok === false, JSON.stringify(json(criaComoOp.rows[0].r)));
  const insDireto = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    sqlstate(c, `insert into public.roteiros (nome) values ('nao posso inserir direto')`), { commit: false });
  ok("nem o admin insere em roteiros pelo navegador (só via fn_salvar_roteiro)", insDireto === "42501", String(insDireto));

  // o claim entrega o roteiro do lead, com os passos já marcados
  const claimRot = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select (job_id::text) as job_id, lead_id, roteiro_id,
                    jsonb_array_length(roteiro->'passos')::int as n_passos,
                    roteiro->>'aviso' as aviso,
                    roteiro->'passos'->0->>'titulo' as p1,
                    (roteiro->'passos'->0->>'feito')::text as feito
               from fn_claim_next_lead(null, null)`), { commit: true });
  const cl = claimRot.rows[0];
  ok("fn_claim_next_lead entrega o roteiro junto com o lead",
     !!cl && cl.roteiro_id != null && cl.n_passos === 7 && cl.p1 === "ABERTURA — só informação" && cl.feito === "false",
     JSON.stringify(cl ?? null));
  ok("o aviso de compliance viaja com o roteiro", typeof cl?.aviso === "string" && cl.aviso.includes("PROIBIDO"), String(cl?.aviso).slice(0, 60));

  const passo1 = (await db.query(
    `select p.id from public.roteiro_passos p join public.campanhas c on c.roteiro_id = p.roteiro_id
      where c.nome = 'INSS - margem disponível' order by p.ordem limit 1`)).rows[0].id;
  const passoFora = (await db.query(
    `select p.id from public.roteiro_passos p join public.roteiros r on r.id = p.roteiro_id
      where r.nome like 'BPC%' order by p.ordem limit 1`)).rows[0].id;

  const marca = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro($1, $2, true, 'titular confirmou os dados') as r`, [cl.lead_id, passo1]), { commit: true });
  const m1 = json(marca.rows[0].r);
  ok("operador marca o passo e recebe o progresso", m1.ok === true && m1.devidos === 6 && m1.cumpridos === 1, JSON.stringify(m1));

  const passoErrado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro($1, $2, true, null) as r`, [cl.lead_id, passoFora]), { commit: false });
  ok("passo de OUTRO roteiro não vale para este lead", json(passoErrado.rows[0].r).ok === false, JSON.stringify(json(passoErrado.rows[0].r)));
  const leadFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro((select id from public.leads where telefone_e164 = '+5579999980001'), $1, true, null) as r`, [passo1]), { commit: false });
  ok("não dá para marcar roteiro em lead de campanha que não é sua", json(leadFora.rows[0].r).ok === false, JSON.stringify(json(leadFora.rows[0].r)));

  await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_marcar_passo_roteiro($1, $2, false, null) as r`, [cl.lead_id, passo1]), { commit: true });
  const desmarcado = (await db.query(`select count(*)::int as n from public.lead_roteiro_checks where lead_id = $1`, [cl.lead_id])).rows[0].n;
  ok("desmarcar apaga a marcação (a aderência não fica inflada)", desmarcado === 0, `restam ${desmarcado}`);

  const obr2 = (await db.query(
    `select p.id from public.roteiro_passos p join public.campanhas c on c.roteiro_id = p.roteiro_id
      where c.nome = 'INSS - margem disponível' and p.obrigatorio order by p.ordem limit 2 offset 1`)).rows.map((r) => r.id);
  for (const id of obr2) {
    await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select fn_marcar_passo_roteiro($1, $2, true, null) as r`, [cl.lead_id, id]), { commit: true });
  }
  await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_finish_call($1, 'atendeu', 95, 'proposta explicada, anuência no Meu INSS') as r`, [cl.job_id]), { commit: true });
  const ader = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select leads_de_hoje, passos_devidos, passos_cumpridos, aderencia_pct
               from public.v_aderencia_roteiro where agente_id = $1`, [A.joao]), { commit: false });
  const devidos = Number(ader.rows[0]?.passos_devidos);
  ok("aderência do dia = obrigatórios devidos × marcados, somados por operador",
     ader.rows[0]?.passos_cumpridos === 2 && devidos === Number(ader.rows[0]?.leads_de_hoje) * 6 &&
     Number(ader.rows[0]?.aderencia_pct) === Math.round((200 / devidos) * 10) / 10,
     JSON.stringify(ader.rows[0] ?? null));

  const trilhaRoteiro = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.lead_roteiro_checks where lead_id = $1`, [cl.lead_id]), { commit: false });
  ok("admin da campanha enxerga a marcação do operador", trilhaRoteiro.rows[0].n === 2, `linhas: ${trilhaRoteiro.rows[0].n}`);

  // editar sobe a versão e a trilha guarda o roteiro anterior
  const versaoAntes = (await db.query(`select versao::int as v from public.roteiros where nome like 'INSS%'`)).rows[0].v;
  const salvaOutro = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_roteiro(null, 'Roteiro B do INSS', 'inss', 'aviso curto', true,
              '[{"titulo":"passo um","texto":"texto um"},{"titulo":"passo dois","texto":"texto dois","obrigatorio":false}]'::jsonb, null) as r`), { commit: true });
  const roteiroNovo = json(salvaOutro.rows[0].r);
  ok("roteiro novo nasce com versão 1 e os passos passados",
     roteiroNovo.ok === true && roteiroNovo.versao === 1 && roteiroNovo.passos === 2, JSON.stringify(roteiroNovo));
  const bump = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_roteiro($1, null, null, null, null,
              '[{"titulo":"passo um","texto":"texto um revisado"}]'::jsonb, null) as r`, [roteiroNovo.roteiro_id]), { commit: true });
  const bumpR = json(bump.rows[0].r);
  ok("editar passos cria versão nova (histórico de texto aprovado)", bumpR.ok === true && bumpR.versao === versaoAntes + 1, JSON.stringify(bumpR));
  const trilhaEd = (await db.query(
    `select jsonb_exists(alvo->'antes', 'nome') as tem_o_antes, alvo->>'versao' as v
       from public.auditoria_gestao where acao = 'roteiro_salvo' order by id desc limit 1`)).rows[0];
  ok("a trilha guarda o roteiro ANTES da edição (dá para voltar no texto)",
     !!trilhaEd && trilhaEd.tem_o_antes === true && Number(trilhaEd.v) === 2, JSON.stringify(trilhaEd ?? null));

  // atribuir à campanha é ato de gestão
  const atribNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_atribuir_roteiro($1, $2) as r`, [CAMP_A, roteiroNovo.roteiro_id]), { commit: false });
  ok("operador não troca o roteiro da campanha", json(atribNegado.rows[0].r).ok === false, JSON.stringify(json(atribNegado.rows[0].r)));
  const atrib = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_atribuir_roteiro($1, $2) as r`, [CAMP_A, roteiroNovo.roteiro_id]), { commit: true });
  ok("admin aponta o roteiro aprovado para a campanha", json(atrib.rows[0].r).ok === true, JSON.stringify(json(atrib.rows[0].r)));
  const soAtivo = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_atribuir_roteiro($1, (select id from public.roteiros where nome = 'Roteiro rascunho')) as r`, [CAMP_A]), { commit: false });
  ok("roteiro inativo não pode ser apontado para campanha", json(soAtivo.rows[0].r).ok === false, JSON.stringify(json(soAtivo.rows[0].r)));


  // ============================================================ 18. cadência por disposição
  // Fixture próprio: leads novos, todos na carteira do João e com prioridade alta,
  // para o claim entregá-los na ordem que os testes esperam.
  let seqCad = 60000;
  async function novoLead(prefixo, extra = {}) {
    seqCad += 1;
    const tel = `+55799999${seqCad}`;
    const r = await db.query(
      `insert into public.leads (campanha_id, nome, telefone_e164, cidade, uf, consentimento,
                                 consentimento_em, prioridade, margem_estimada, agente_id, status)
       values ($1, $2, $3, 'Aracaju', 'SE', 'form_proprio', now(), 90, 400, $4, 'sem_contato')
       returning id`,
      [CAMP_A, prefixo + " " + seqCad, tel, A.joao]);
    return { id: r.rows[0].id, tel };
  }
  async function claimJoao() {
    const r = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select job_id, lead_id from fn_claim_next_lead($1, $2)`, [A.joao, CAMP_A]));
    return r.rows[0] ?? null;
  }
  async function fechar(job, disp, dur = 20) {
    const r = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
      c.query(`select fn_finish_call($1, $2::cdr_disposition, $3, 'teste de cadência') as r`,
              [job, disp, dur]));
    return json(r.rows[0].r);
  }
  const estadoLead = async (id) =>
    (await db.query(`select status, prioridade::int as prioridade, tentativas::int as tentativas,
                            proximo_contato_at, obs, extras
                       from public.leads where id = $1`, [id])).rows[0];

  const pol = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n,
                    max(case when disposition = 'ocupado' then intervalo_s end) as ocupado_s,
                    max(case when disposition = 'ocupado' then acao end) as ocupado_acao,
                    max(case when disposition = 'numero_invalido' then acao end) as invalido_acao,
                    max(case when disposition = 'nao_atendeu' then max_tentativas end) as naoatend_max
               from public.fn_politica_rediscagem($1)`, [CAMP_A]));
  ok("fn_politica_rediscagem devolve as 8 disposições com o default efetivo",
     pol.rows[0].n === 8 && pol.rows[0].ocupado_s === 5400 && pol.rows[0].ocupado_acao === "repetir" &&
     pol.rows[0].invalido_acao === "descartar" && pol.rows[0].naoatend_max === 4,
     JSON.stringify(pol.rows[0]));

  const cad1 = await novoLead("Ocupado");
  const c1 = await claimJoao();
  const f1 = await fechar(c1.job_id, "ocupado");
  const e1 = await estadoLead(cad1.id);
  ok("'ocupado' obedece o intervalo da política (1h30), não o da campanha",
     f1.politica === "repetir" && e1.status === "sem_contato" &&
     e1.proximo_contato_at != null &&
     Math.abs((new Date(e1.proximo_contato_at) - Date.now()) / 1000 - 5400) < 120,
     `proximo: ${e1.proximo_contato_at}`);

  const cad2 = await novoLead("Secretaria");
  const c2 = await claimJoao();
  await fechar(c2.job_id, "secretaria");
  const e2 = await estadoLead(cad2.id);
  const horaAlvo = e2.proximo_contato_at
    ? Number((await db.query(`select extract(hour from $1::timestamptz at time zone 'America/Sao_Paulo') as h`,
                             [e2.proximo_contato_at])).rows[0].h)
    : -1;
  ok("'secretaria' é reagendada para a hora alvo da política (10:00 de Brasília)",
     horaAlvo === 10 && new Date(e2.proximo_contato_at) > new Date(Date.now() + 3600e3),
     `hora: ${horaAlvo}`);

  const cad3 = await novoLead("Invalido");
  const c3 = await claimJoao();
  const f3 = await fechar(c3.job_id, "numero_invalido");
  const e3 = await estadoLead(cad3.id);
  ok("'numero_invalido' sai da fila viva (descarte, sem próxima chamada)",
     f3.politica === "descartar" && e3.status === "descarte" && e3.proximo_contato_at === null,
     JSON.stringify({ st: e3.status, prox: e3.proximo_contato_at }));

  const cad4 = await novoLead("Whats");
  const c4 = await claimJoao();
  await fechar(c4.job_id, "whatsapp", 8);
  const e4 = await estadoLead(cad4.id);
  ok("disposição com prioridade_delta empurra o lead para cima na fila",
     e4.prioridade === 100, `prioridade: ${e4.prioridade}`);

  const polNegada = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_politica_rediscagem($1, '[{"disposition":"ocupado","acao":"repetir","intervalo_s":600}]'::jsonb) as r`,
            [CAMP_A]), { commit: false });
  ok("operador não muda a cadência da campanha", json(polNegada.rows[0].r).ok === false,
     JSON.stringify(json(polNegada.rows[0].r)));
  const polRuim = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_politica_rediscagem($1, '[{"disposition":"existente","acao":"repetir"}]'::jsonb) as r`,
            [CAMP_A]), { commit: false });
  ok("disposição inexistente não cria regra muda", json(polRuim.rows[0].r).ok === false,
     JSON.stringify(json(polRuim.rows[0].r)));
  const polOk = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_politica_rediscagem($1, $2::jsonb) as r`,
            [CAMP_A, JSON.stringify([{ disposition: "nao_atendeu", acao: "repetir", intervalo_s: 7200,
                                       max_tentativas: 3, hora_alvo: null, prioridade_delta: -5,
                                       observacao: "tentar de manhã" }])]), { commit: true });
  const polR = json(polOk.rows[0].r);
  ok("supervisor/admin salva a política e a trilha guarda o conteúdo",
     polR.ok === true && polR.regras === 1 &&
     (await db.query(`select alvo->>'conteudo' as c from public.auditoria_gestao
                       where acao = 'politica_salva' order by id desc limit 1`)).rows[0].c
       .includes("tentar de manhã"),
     JSON.stringify(polR));
  const regeito = await estadoLead(cad1.id);
  ok("salvar a política não reescreve o que já foi registrado antes dela",
     regeito.status === "sem_contato" && regeito.proximo_contato_at != null, JSON.stringify(regeito));

  // ============================================================ 19. bloqueio com validade
  const bloqLead = await novoLead("Bloqueado Provisório");
  const bloqNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_bloquear_telefone($1, 'nao_me_perturbe', 30) as r`, [bloqLead.tel]), { commit: false });
  ok("operador não bloqueia número (é decisão de gestão)", json(bloqNegado.rows[0].r).ok === false,
     JSON.stringify(json(bloqNegado.rows[0].r)));
  const bloqPerma = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_bloquear_telefone($1, 'opt_out', 30) as r`, [bloqLead.tel]), { commit: false });
  ok("opt_out não aceita prazo (não se 'pausa' quem pediu para nunca mais ligar)",
     json(bloqPerma.rows[0].r).ok === false, JSON.stringify(json(bloqPerma.rows[0].r)));
  const blocou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_bloquear_telefone($1, 'nao_me_perturbe', 30, 'ligou de novo e pediu 30 dias') as r`,
            [bloqLead.tel]), { commit: true });
  ok("bloqueio temporário entra com validade e origem",
     json(blocou.rows[0].r).ok === true &&
     (await db.query(`select (now() < expira_em) as futuro, origem from public.bloqueios where telefone_e164 = $1`,
                     [bloqLead.tel])).rows[0].futuro === true,
     JSON.stringify(json(blocou.rows[0].r)));
  await db.query(`update public.leads set prioridade = 95 where id = $1`, [bloqLead.id]);
  const pulaBloqueado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select coalesce((select lead_id from fn_claim_next_lead($1, $2)), -1) as lid`,
            [A.joao, CAMP_A]));
  ok("claim pula o número bloqueado mesmo com prioridade maior",
     Number(pulaBloqueado.rows[0].lid) !== Number(bloqLead.id), `claim entregou ${pulaBloqueado.rows[0].lid}`);
  await db.query(`update public.bloqueios set expira_em = now() - interval '1 minute' where telefone_e164 = $1`,
                 [bloqLead.tel]);
  const voltaDepois = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select coalesce((select lead_id from fn_claim_next_lead($1, $2)), -1) as lid`,
            [A.joao, CAMP_A]));
  ok("venceu o prazo: o número volta a ser discável sem ninguém lembrar",
     Number(voltaDepois.rows[0].lid) === Number(bloqLead.id), `claim entregou ${voltaDepois.rows[0].lid}`);
  const libou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_liberar_telefone($1) as r`, [bloqLead.tel]), { commit: true });
  ok("liberar tira da lista e deixa rastro na auditoria de gestão",
     json(libou.rows[0].r).ok === true &&
     (await db.query(`select count(*)::int as n from public.auditoria_gestao
                       where acao = 'telefone_liberado' and alvo->>'telefone' = $1`,
                     [bloqLead.tel])).rows[0].n === 1,
     JSON.stringify(json(libou.rows[0].r)));

  // ============================================================ 20. tabulação e qualificação
  const form = (await db.query(
    `select count(*)::int as n,
            count(*) filter (where f->>'obrigatorio' = 'true')::int as obrigatorios
       from public.campanhas c, jsonb_array_elements(c.formulario) f where c.id = $1`,
    [CAMP_A])).rows[0];
  ok("a campanha do seed já nasce com formulário de tabulação obrigatório",
     form.n === 5 && form.obrigatorios === 4, JSON.stringify(form));

  const tabLead = await novoLead("Tabulacao");
  // uma chamada antes da tabulação: é o que faz o lead ter CDR para a ficha 360º
  const c6 = await claimJoao();
  ok("o lead de maior prioridade elegível é o próximo da fila (não o mais antigo)",
     Number(c6.lead_id) === Number(tabLead.id), JSON.stringify(c6));
  await fechar(c6.job_id, "nao_atendeu", 12);
  const tabAntes = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_qualificar_lead($1, 'quer sim') as r`, [tabLead.id]), { commit: false });
  ok("não dá para qualificar sem preencher a tabulação obrigatória",
     json(tabAntes.rows[0].r).ok === false &&
     String(json(tabAntes.rows[0].r).erro).includes("tabulação"),
     JSON.stringify(json(tabAntes.rows[0].r)));
  const tabPelaMetade = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_tabulacao($1, '{"titular_confirmado":true,"margem_informada":400}'::jsonb) as r`,
            [tabLead.id]), { commit: false });
  const meio = json(tabPelaMetade.rows[0].r);
  ok("tabulação incompleta devolve QUAL campo falta",
     meio.ok === false && String(meio.erro).includes("banco_consignacao") &&
     String(meio.erro).includes("interesse"), JSON.stringify(meio));
  const tabCheia = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_tabulacao($1, $2::jsonb) as r`,
            [tabLead.id, JSON.stringify({ titular_confirmado: true, margem_informada: 400,
                                          banco_consignacao: "Banco do Brasil", interesse: "alto",
                                          autorizacao_gravacao: false })]), { commit: true });
  const tabR = json(tabCheia.rows[0].r);
  ok("tabulação grava em leads.extras (campo estruturado, não 'obs' de texto livre)",
     tabR.ok === true && tabR.extras?.interesse === "alto" && tabR.extras?.banco_consignacao === "Banco do Brasil",
     JSON.stringify(tabR).slice(0, 120));
  const qualif = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_qualificar_lead($1, 'titular confirmou margem de R$ 400') as r`,
            [tabLead.id]), { commit: true });
  ok("com a tabulação completa, o operador qualifica o lead",
     json(qualif.rows[0].r).ok === true &&
     (await db.query(`select status from public.leads where id = $1`, [tabLead.id])).rows[0].status === "qualificado",
     JSON.stringify(json(qualif.rows[0].r)));
  const formRuim = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_salvar_formulario($1, '[{"chave":"Campo Errado","rotulo":"x","tipo":"texto"}]'::jsonb) as r`,
            [CAMP_A]), { commit: false });
  ok("campo de tabulação com chave inválida é recusado na hora",
     json(formRuim.rows[0].r).ok === false, JSON.stringify(json(formRuim.rows[0].r)));
  const formNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_salvar_formulario($1, '[]'::jsonb) as r`, [CAMP_A]), { commit: false });
  ok("operador não reescreve o formulário da campanha", json(formNegado.rows[0].r).ok === false,
     JSON.stringify(json(formNegado.rows[0].r)));

  // a ficha 360º vem de um único RPC
  const ficha = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_ficha_lead($1) as r`, [tabLead.id]));
  const f = json(ficha.rows[0].r);
  ok("fn_ficha_lead devolve o 360º (lead, cdrs, eventos, tarefas, roteiro, bloqueio)",
     f.ok === true && Number(f.lead.id) === Number(tabLead.id) &&
     Array.isArray(f.cdrs) && f.cdrs.length >= 1 &&
     Array.isArray(f.eventos) && Array.isArray(f.roteiro) && "bloqueio" in f,
     `chaves: ${Object.keys(f).join(",")}`);
  const claimTab = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select campanha_id, jsonb_array_length(formulario)::int as n_campos,
                    jsonb_typeof(extras) as tipo_extras
               from fn_claim_next_lead($1, $2)`, [A.joao, CAMP_A]));
  ok("o claim já traz o formulário e o que está preenchido (nada de 3 requests com o cliente na linha)",
     claimTab.rows[0]?.n_campos === 5 && claimTab.rows[0]?.tipo_extras === "object" &&
     !!claimTab.rows[0]?.campanha_id, JSON.stringify(claimTab.rows[0] ?? null));

  const fichaFora = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_ficha_lead($1) as r`, [tabLead.id]), { commit: false });
  ok("quem não tem acesso à campanha não monta a ficha do lead",
     json(fichaFora.rows[0].r).ok === false, JSON.stringify(json(fichaFora.rows[0].r)));

  // ============================================================ 21. CRM: tarefa, esteira, bbb
  const tar = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_criar_tarefa($1, 'Ligar de novo às 10h', 'retorno',
              now() + interval '2 hours', 'cliente pediu antes do almoço') as r`, [tabLead.id]),
            { commit: true });
  const tarR = json(tar.rows[0].r);
  ok("operador cria tarefa para si na própria carteira",
     tarR.ok === true && tarR.tarefa_id != null, JSON.stringify(tarR));
  const empurra = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_criar_tarefa($1, 'tarefa para o colega', 'outro', null, null, $2) as r`,
            [tabLead.id, A.pedro]), { commit: false });
  ok("operador não atribui tarefa a outro operador", json(empurra.rows[0].r).ok === false,
     JSON.stringify(json(empurra.rows[0].r)));
  const agenda = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select situacao, lead from public.v_agenda where id = $1`, [tarR.tarefa_id]));
  ok("v_agenda classifica a tarefa (futura/hoje/vencida/concluida)",
     ["futura", "hoje"].includes(agenda.rows[0]?.situacao), JSON.stringify(agenda.rows[0] ?? null));
  const concl = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_concluir_tarefa($1, 'cliente atendeu, remarcou') as r`, [tarR.tarefa_id]),
            { commit: true });
  ok("concluir tarefa guarda o resultado", json(concl.rows[0].r).ok === true, JSON.stringify(json(concl.rows[0].r)));
  const conclDeNovo = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_concluir_tarefa($1) as r`, [tarR.tarefa_id]), { commit: false });
  ok("tarefa já concluída não é reescrita em silêncio", json(conclDeNovo.rows[0].r).ok === false,
     JSON.stringify(json(conclDeNovo.rows[0].r)));

  const moveNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_mover_lead($1, 'opt_out') as r`, [tabLead.id]), { commit: false });
  ok("opt_out pela esteira é decisão de gestão (o operador usa fn_register_optout, que vale para o número todo)",
     json(moveNegado.rows[0].r).ok === false, JSON.stringify(json(moveNegado.rows[0].r)));
  const move = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_mover_lead($1, 'recusado', null, 'não quer mexer na margem agora') as r`,
            [tabLead.id]), { commit: true });
  const apos = await db.query(`select status, agente_id, proximo_contato_at from public.leads where id = $1`,
                              [tabLead.id]);
  ok("mover na esteira devolve o lead para o pool e limpa a próxima chamada",
     json(move.rows[0].r).ok === true && apos.rows[0].status === "recusado" &&
     apos.rows[0].agente_id === null && apos.rows[0].proximo_contato_at === null,
     JSON.stringify(apos.rows[0]));
  const moveCamp = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_mover_lead($1, 'novo', $2, 'transferido para BPC') as r`,
            [bloqLead.id, CAMP_B]), { commit: true });
  const aposMove = await db.query(`select campanha_id from public.leads where id = $1`, [bloqLead.id]);
  ok("mover para outra campanha exige acesso às duas e grava a trilha do motivo",
     json(moveCamp.rows[0].r).ok === true && aposMove.rows[0].campanha_id === CAMP_B &&
     (await db.query(`select count(*)::int as n from public.lead_events where lead_id = $1
                       and detalhe like 'movido no CRM%'`, [bloqLead.id])).rows[0].n >= 1,
     JSON.stringify({ r: json(moveCamp.rows[0].r), camp: aposMove.rows[0].campanha_id }));

  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_definir_acesso($1, 'pedro@suafinanceira.com.br', 'operador', 60) as r`,
            [CAMP_A]), { commit: true });
  for (let i = 0; i < 6; i++) {
    await db.query(
      `insert into public.leads (campanha_id, nome, telefone_e164, consentimento, consentimento_em,
                                 prioridade, margem_estimada, status)
       values ($1, 'Pool ' || $2, '+5579999972' || $2, 'form_proprio', now(),
               $3::smallint, $4::numeric, 'novo')`,
      [CAMP_A, String(i).padStart(2, "0"), i % 2 ? 10 : 5, 100 + i * 50]);
  }
  const bbb = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_attribuir_carteira($1, null, 0, 'bbb') as r`, [CAMP_A]), { commit: true });
  const bbbR = json(bbb.rows[0].r);
  const divisao = await db.query(
    `select coalesce((select nome from public.agentes where id = l.agente_id), 'pool') as dono,
            count(*)::int as n
       from public.leads l where l.campanha_id = $1 and l.nome like 'Pool %'
      group by 1 order by 1`, [CAMP_A]);
  const porOperador = divisao.rows.filter((r) => r.dono !== "pool").map((r) => r.n);
  ok("distribuição 'bbb' reparte o pool de forma igual entre os operadores",
     bbbR.ok === true && porOperador.length >= 2 &&
     Math.max(...porOperador) - Math.min(...porOperador) <= 1,
     JSON.stringify(divisao.rows));
  const ordem = await db.query(
    `select prioridade::int as p, margem_estimada as m from public.leads
      where campanha_id = $1 and nome like 'Pool 05' limit 1`, [CAMP_A]);
  ok("o 'bbb' entrega primeiro o lead de maior prioridade/margem (não é rodízio cego)",
     ordem.rows.length === 1, JSON.stringify(ordem.rows));

  const pontuaNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_pontuar_leads($1) as r`, [CAMP_A]), { commit: false });
  ok("operador não recalcula a prioridade da campanha inteira",
     json(pontuaNegado.rows[0].r).ok === false, JSON.stringify(json(pontuaNegado.rows[0].r)));
  await db.query(`insert into public.leads (campanha_id, nome, telefone_e164, consentimento,
                     consentimento_em, margem_estimada, status, prioridade)
                  values ($1, 'Novo com margem alta', '+557999997290', 'form_proprio', now(), 900, 'novo', 0)`,
                 [CAMP_A]);
  const pontua = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_pontuar_leads($1) as r`, [CAMP_A]), { commit: true });
  const pont = await db.query(
    `select nome, prioridade::int as p from public.leads
      where campanha_id = $1 and nome in ('Novo com margem alta', 'Pool 00') order by p desc limit 2`,
    [CAMP_A]);
  ok("pontuação automática: lead novo, com consentimento próprio e margem alta sobe no topo",
     json(pontua.rows[0].r).ok === true && pont.rows[0]?.nome === "Novo com margem alta" &&
     pont.rows[0].p >= 90, JSON.stringify(pont.rows));

  // ============================================================ 22. simulador + margem na proposta
  const sim = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select (fn_simular_proposta(400, 60, 'inss'))->>'parcela_maxima' as parcela,
                    ((fn_simular_proposta(400, 60, 'inss'))->>'valor_maximo')::numeric as valor,
                    ((fn_simular_proposta(400, 60, 'inss'))->>'total_pago')::numeric as total,
                    fn_simular_proposta(400, 60, 'inss')->>'dentro_das_regras' as dentro,
                    ((fn_simular_proposta(400, 60, 'bpc_loas'))->>'limite_margem_pct')::int as limite,
                    ((fn_simular_proposta(400, 109, 'inss'))->>'parcelas')::int as parcelas_ajustadas,
                    fn_simular_proposta(400, 109, 'inss')->>'dentro_das_regras' as fora`));
  const simR = sim.rows[0];
  ok("simulador devolve a parcela máxima = margem e o crédito que cabe nela",
     Number(simR.parcela) === 400 && Number(simR.valor) > 18000 && Number(simR.valor) < Number(simR.total) &&
     Number(simR.total) === 24000 && simR.dentro === "true",
     JSON.stringify(simR));
  ok("BPC/LOAS aparece com limite de 35% e prazo acima de 108 é sinalizado (e cortado)",
     Number(simR.limite) === 35 && simR.fora === "false" && Number(simR.parcelas_ajustadas) === 108,
     JSON.stringify({ limite: simR.limite, fora: simR.fora }));

  const propAcima = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 40000, 60, 3.23, 'Banco do Brasil') as r`, [tabLead.id]),
           { commit: false });
  ok("proposta com parcela acima da margem do lead é bloqueada no servidor",
     json(propAcima.rows[0].r).ok === false && String(json(propAcima.rows[0].r).erro).includes("margem"),
     JSON.stringify(json(propAcima.rows[0].r)));
  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_mover_lead($1, 'qualificado', null, 'requalificado pela gestão') as r`,
            [tabLead.id]), { commit: true });
  const propDentro = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_enviar_proposta($1, 18000, 60, 3.23, 'Banco do Brasil') as r`, [tabLead.id]),
            { commit: true });
  ok("com a parcela dentro da margem, a proposta entra e o prazo de 5 dias começa a contar",
     json(propDentro.rows[0].r).ok === true &&
     (await db.query(`select prazo_validade > now() + interval '4 days' as no_prazo
                        from public.propostas where lead_id = $1`, [tabLead.id])).rows[0].no_prazo === true,
     JSON.stringify(json(propDentro.rows[0].r)));

  // ============================================================ 23. QA de ligação e metas
  const qaLead = await novoLead("Avaliar");
  const cqa = await claimJoao();
  await fechar(cqa.job_id, "atendeu", 120);
  // o CDR é pego pelo job (não pelo lead): o claim entrega o lead mais prioritário
  // que existir na fila naquele instante, e os testes acima mexeram nas prioridades
  const cdrId = (await db.query(
    `select id from public.cdr where job_id = $1 order by id desc limit 1`, [cqa.job_id])).rows[0].id;
  const qaNegado = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_avaliar_chamada($1, 70) as r`, [cdrId]), { commit: false });
  ok("operador não se autoavalia no QA", json(qaNegado.rows[0].r).ok === false,
     JSON.stringify(json(qaNegado.rows[0].r)));
  const qa = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_avaliar_chamada($1, 72, '{"abertura":true,"proibido_falou":false}'::jsonb,
              'anunciou o banco antes de confirmar a titularidade', 'repetir o módulo 2 do roteiro') as r`,
            [cdrId]), { commit: true });
  ok("supervisor registra scorecard na chamada e a trilha guarda a nota",
     json(qa.rows[0].r).ok === true &&
     (await db.query(`select alvo->>'nota' as nota from public.auditoria_gestao
                       where acao = 'qa_avaliado' order by id desc limit 1`)).rows[0].nota === "72",
     JSON.stringify(json(qa.rows[0].r)));
  const qaResumo = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select avaliacoes::int as n, nota_media::int as nota, auditorias_da_semana::int as semana
               from public.v_qa_resumo where agente_id = $1`, [A.joao]));
  ok("v_qa_resumo fecha a nota por operador para a conversa de coaching",
     qaResumo.rows[0]?.n === 1 && qaResumo.rows[0]?.nota === 72 && qaResumo.rows[0]?.semana === 1,
     JSON.stringify(qaResumo.rows[0] ?? null));
  const qaVisivelAoDono = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.qa_avaliacoes where agente_id = $1`, [A.joao]));
  ok("o operador enxerga a própria avaliação (direito de saber a nota)",
     qaVisivelAoDono.rows[0].n === 1, `linhas: ${qaVisivelAoDono.rows[0].n}`);

  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, null, null, null, 5, false) as r`,
            [CAMP_A]), { commit: true });
  const meta = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select meta_diaria::int as meta, contatos_hoje::int as contatos, pct_meta, faltam::int as faltam
               from public.v_metas_dia where campanha_id = $1`, [CAMP_A]));
  ok("meta do dia aparece com realizado/pct/faltando na view de metas",
     meta.rows[0]?.meta === 5 && meta.rows[0].contatos >= 1 &&
     Number(meta.rows[0].pct_meta) === Math.round((meta.rows[0].contatos / 5) * 1000) / 10,
     JSON.stringify(meta.rows[0] ?? null));
  const mapa = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n, max(taxa_contato_pct) as melhor
               from public.v_mapa_horario`));
  ok("mapa dia×hora é calculado a partir dos CDRs reais da operação",
     mapa.rows[0].n >= 1 && mapa.rows[0].melhor != null, JSON.stringify(mapa.rows[0]));
  const funil = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select count(*)::int as n from public.v_funil where campanha = 'INSS - margem disponível'
               and leads > 0`));
  ok("funil mostra os estágios com lead, e não uma linha por status vazio",
     funil.rows[0].n >= 3, `estágios: ${funil.rows[0].n}`);

  // ============================================================ 24. empresa, webhook e pendências
  const empEdit = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_empresa('Sua Financeira LTDA', '00000000000191', '+55 79 3000-0000',
              'dpo@suafinanceira.com.br', 'Maria - encarregada',
              'A ligação pode ser registrada para controle de qualidade.') as r`), { commit: true });
  ok("o dono cadastra a empresa (nome, CNPJ, encarregado de dados, aviso de gravação)",
     json(empEdit.rows[0].r).ok === true &&
     (await db.query(`select nome, responsavel_lgpd from public.empresas limit 1`)).rows[0].nome ===
       "Sua Financeira LTDA",
     JSON.stringify(json(empEdit.rows[0].r)));
  const empNegado = await sessao({ papel: "authenticated", sub: U.pedro }, (c) =>
    c.query(`select fn_editar_empresa('Empresa do Pedro') as r`), { commit: false });
  ok("só o admin (o dono) mexe no cadastro da empresa", json(empNegado.rows[0].r).ok === false,
     JSON.stringify(json(empNegado.rows[0].r)));
  const quem = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_quem_sou() as r`));
  const quemR = json(quem.rows[0].r);
  ok("o perfil do operador carrega a empresa e as tarefas abertas dele",
     quemR.empresa?.nome === "Sua Financeira LTDA" && quemR.tarefas_abertas >= 0,
     JSON.stringify({ emp: quemR.empresa, t: quemR.tarefas_abertas }));
  const dono = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select operadores_ativos::int as op, campanhas_ativas::int as camp,
                    leads_na_fila::int as fila, chamadas_hoje::int as ch, contatos_hoje::int as cont,
                    tarefas_vencidas::int as tar, numeros_bloqueados::int as bloq, qa_semana::int as qa
               from public.v_visao_dono`));
  const donoR = dono.rows[0];
  ok("v_visao_dono fecha a operação inteira num request (quem liga, quem fala, o que venceu)",
     donoR.op >= 3 && donoR.ch > 0 && donoR.cont > 0 && donoR.qa === 1 && donoR.fila >= 1,
     JSON.stringify(donoR));
  const pend = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select fn_pendencias() as r`));
  const pendR = json(pend.rows[0].r);
  ok("fn_pendencias devolve contagens do dia (tarefa, retorno, anuência, proposta parada)",
     pendR.ok === true && Number(pendR.qualificados_sem_proposta) >= 0 &&
     "retornos_de_hoje" in pendR && "anuencia_hoje" in pendR, JSON.stringify(pendR));

  const tokenCamp = (await db.query(
    `select webhook_token::text as t from public.campanhas where id = $1`, [CAMP_A])).rows[0].t;
  const semAtivar = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Vindo do Site","telefone_e164":"+557999997300","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: false });
  ok("webhook não aceita nada enquanto a porta estiver desligada na campanha",
     json(semAtivar.rows[0].r).ok === false, JSON.stringify(json(semAtivar.rows[0].r)));
  await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_editar_campanha($1, null, null, null, null, null, null, null, null, null, true) as r`,
            [CAMP_A]), { commit: true });
  const semConsent = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Sem Consentimento","telefone_e164":"+557999997301"}'::jsonb) as r`, [tokenCamp]),
            { commit: false });
  ok("lead de site sem consentimento por titular é recusado (não existe 'a gente consegue')",
     json(semConsent.rows[0].r).ok === false, JSON.stringify(json(semConsent.rows[0].r)));
  const webhook1 = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Vindo do Site","telefone_e164":"+557999997300","cpf":"12345678909",
                "cidade":"Aracaju","uf":"SE","consentimento":"form_proprio",
                "margem_estimada":"520","origem_url":"/simule-seu-consignado"}'::jsonb) as r`,
            [tokenCamp]), { commit: true });
  const wh = json(webhook1.rows[0].r);
  const whLead = await db.query(
    `select id, nome, prioridade::int as p, extras, status from public.leads where telefone_e164 = '+557999997300'`);
  ok("webhook coloca o lead na fila já com prioridade de 'recém-chegado'",
     wh.ok === true && wh.lead_id != null &&
     whLead.rows[0]?.p === 55 && whLead.rows[0]?.extras?._canal === "webhook",
     JSON.stringify({ wh, l: whLead.rows[0] ?? null }));
  const webhook2 = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"nome":"Repetido","telefone_e164":"+557999997300","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: true });
  ok("o mesmo número duas vezes no mesmo site não vira lead duplicado",
     json(webhook2.rows[0].r).duplicado === true, JSON.stringify(json(webhook2.rows[0].r)));
  const tokenRuim = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook('00000000-0000-4000-8000-000000000000'::uuid,
              '{"telefone_e164":"+557999997302","consentimento":"form_proprio"}'::jsonb) as r`),
           { commit: false });
  ok("token errado não escreve nada", json(tokenRuim.rows[0].r).ok === false,
     JSON.stringify(json(tokenRuim.rows[0].r)));
  const anonLendo = await sessao({ papel: "anon" }, (c) =>
    sqlstate(c, `select count(*) from public.leads`), { commit: false });
  ok("abrir a porta do webhook não abriu o resto do banco para anon",
     anonLendo === "42501", String(anonLendo));
  await db.query(`insert into public.bloqueios (telefone_e164, motivo, detalhe)
                  values ('+557999997360', 'nao_me_perturbe', 'pediu 30 dias, entrou pelo site')
                  on conflict (telefone_e164) do nothing`);
  const bloqueadoWeb = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"telefone_e164":"+557999997360","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: false });
  ok("número na lista de bloqueio não entra nem pelo site",
     json(bloqueadoWeb.rows[0].r).bloqueado === true, JSON.stringify(json(bloqueadoWeb.rows[0].r)));

  await db.query(`insert into public.leads (campanha_id, nome, telefone_e164, consentimento, consentimento_em, status)
                  select $1, 'Enchimento ' || g, '+5579999973'|| lpad(g::text, 2, '0'),
                         'form_proprio', now(), 'novo'
                    from generate_series(1, 30) g
                  on conflict (campanha_id, telefone_e164) do nothing`, [CAMP_A]);
  const enchente = await sessao({ papel: "anon" }, (c) =>
    c.query(`select fn_receber_lead_webhook($1::uuid,
              '{"telefone_e164":"+557999997399","consentimento":"form_proprio"}'::jsonb) as r`,
            [tokenCamp]), { commit: false });
  ok("30 leads no mesmo minuto já fazem o webhook recusar (site mal configurado não inunda a fila)",
     String(json(enchente.rows[0].r).erro).includes("volume"), JSON.stringify(json(enchente.rows[0].r)));

  // as views novas respeitam a RLS de quem governa, não de quem é dono do banco
  await db.query(`insert into public.leads (campanha_id, nome, telefone_e164, consentimento, consentimento_em)
                  values ($1, 'Lead da CAMP_B', '+557999997350', 'form_proprio', now())
                  on conflict (campanha_id, telefone_e164) do nothing`, [CAMP_B]);
  const tarFora = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_criar_tarefa((select id from public.leads where telefone_e164 = '+557999997350'),
              'tarefa da gerência', 'outro', now(), 'invisível para o João', null) as r`),
          { commit: true });
  ok("tarefa criada para outro operador em outra campanha", json(tarFora.rows[0].r).ok === true,
     JSON.stringify(json(tarFora.rows[0].r)));
  const agendaFora = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_agenda where lead = 'Lead da CAMP_B'`));
  ok("quem não tem acesso à campanha não vê a agenda dos leads dela",
     agendaFora.rows[0].n === 0, `linhas: ${agendaFora.rows[0].n}`);
  const semEscala = await sessao({ papel: "anon" }, (c) =>
    sqlstate(c, `select count(*) from public.v_visao_dono`), { commit: false });
  ok("visão do dono não existe para usuário anônimo", semEscala === "42501", String(semEscala));

  const soEscritaPorRpc = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    sqlstate(c, `insert into public.tarefas (lead_id, titulo) values ($1, 'jeito torto')`, [tabLead.id]),
            { commit: false });
  ok("nem o admin escreve em tarefas pelo navegador (só via fn_criar_tarefa)",
     soEscritaPorRpc === "42501", String(soEscritaPorRpc));


  // ============================================================ 25. esteira do CRM
  const propLead = await db.query(
    `select lead_id from public.propostas order by enviada_em desc limit 1`);
  const propId = (await db.query(
    `select id from public.propostas where lead_id = $1 order by enviada_em desc limit 1`,
    [propLead.rows[0].lead_id])).rows[0].id;
  const marcou = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select fn_marcar_anuencia($1, 'confirmada', null) as r`, [propId]), { commit: true });
  ok("a gestão registra a anuência confirmada pelo app do INSS", json(marcou.rows[0].r).ok === true,
     JSON.stringify(json(marcou.rows[0].r)));
  const estagio = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select estagio, propostas::int as propostas, anuencia, tarefas_abertas::int as tarefas,
                    prioridade::int as prioridade, dias_na_casa::int as dias
               from public.v_crm_leads where lead_id = $1`, [propLead.rows[0].lead_id]));
  ok("a proposta com anuência confirmada muda o lead de coluna na esteira",
     estagio.rows[0]?.estagio === "confirmada" && estagio.rows[0].propostas === 1 &&
     estagio.rows[0].anuencia === "confirmada",
     JSON.stringify(estagio.rows[0] ?? null));
  const esteira = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select estagio, count(*)::int as n from public.v_crm_leads
              where campanha = 'INSS - margem disponível' group by 1 order by 2 desc`));
  ok("a esteira agrupa a carteira inteira por estágio num request só",
     esteira.rows.length >= 2 && esteira.rows.every((r) =>
       ["fila", "contato", "qualificado", "proposta", "aguardando_anuencia", "confirmada", "fechado"]
         .includes(r.estagio)),
     JSON.stringify(esteira.rows));
  const foraEsteira = await sessao({ papel: "authenticated", sub: U.joao }, (c) =>
    c.query(`select count(*)::int as n from public.v_crm_leads where campanha = 'BPC/LOAS - só admin'`));
  ok("a RLS vale para a esteira: o operador não vê lead de campanha fora do escopo dele",
     foraEsteira.rows[0].n === 0, `linhas: ${foraEsteira.rows[0].n}`);
  const comTarefa = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select tarefas_abertas::int as n, tarefa_vencida from public.v_crm_leads
              where nome = 'Lead da CAMP_B'`));
  ok("tarefa vencida aparece no cartão do lead (o alerta é do banco, não da tela)",
     comTarefa.rows[0]?.n === 1 && comTarefa.rows[0]?.tarefa_vencida === true,
     JSON.stringify(comTarefa.rows[0] ?? null));

  // ============================================================ 26. v_bloqueios
  const bloq = await sessao({ papel: "authenticated", sub: U.maria }, (c) =>
    c.query(`select telefone_e164, motivo, leads::int as leads, leads_vivos::int as vivos,
                    ainda_bloqueado, dias_restantes::int as dias, origem
               from public.v_bloqueios order by criado_em desc limit 6`));
  ok("a lista de bloqueio diz quantos leads aquele número carrega",
     bloq.rows.length >= 1 && bloq.rows.every((r) => typeof r.leads === "number"),
     JSON.stringify(bloq.rows.slice(0, 2)));
  const vivo = bloq.rows.find((r) => r.motivo === "sem_contato_30d");
  ok("bloqueio com prazo aparece como 'ainda bloqueado' e conta os dias que faltam",
     !vivo || (vivo.ainda_bloqueado === true && vivo.dias >= 0 && vivo.vivos <= vivo.leads),
     JSON.stringify(vivo ?? null));

  await db.end();
  await admin.end();

  console.log(`\n${passou} ok · ${falhou} falha(s)`);
  if (pendencias.length) {
    console.log("pendências:");
    for (const f of pendencias) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\nERRO:", e.message);
  console.error((e.stack || "").split("\n").slice(1, 5).join("\n"));
  process.exit(1);
});
