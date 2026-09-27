#!/usr/bin/env python3
"""Guarda do SQL do Supabase (rodar antes de subir migration).

Inspirado no workflow `supabase-guard.yml` do repositório
adrielmatos/ak-call-center — que só checava CREATE TABLE sem ENABLE ROW LEVEL
SECURITY. Aqui a checagem cobre também os dois furos que aquele repo deixou
abrir: política sem destinatário explícito (fica `to public`, ou seja, `anon`
enxergando dado de consumidor) e função chamada pela política que não é criada
em lugar nenhum do SQL versionado (o `private.current_operator_active()` deles
existe só dentro do projeto no Supabase — em banca nova, `db push` quebra).

Uso:
    python3 tools/supabase_guard.py supabase/schema.sql
    python3 tools/supabase_guard.py supabase/migrations/*.sql

Saída: linhas `FALHA ...` / `AVISO ...`; exit 1 se houver falha.
"""

from __future__ import annotations

import re
import sys

RE_CREATE_TABLE = re.compile(
    r"create\s+table(?:\s+(?:if\s+not\s+exists))?\s+(?:public\.)?([a-z_][\w]*)", re.I
)
RE_ENABLE_RLS = re.compile(
    r"alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][\w]*)\s+enable\s+row\s+level\s+security",
    re.I,
)
RE_POLICY = re.compile(
    r"create\s+policy\s+(.{0,400}?)\s+on\s+(?:public\.)?([a-z_][\w]*)\s+(.*?);", re.I | re.S
)
RE_SECURITY_DEFINER = re.compile(r"\bsecurity\s+definer\b", re.I)
RE_SET_SEARCH_PATH = re.compile(r"\bset\s+search_path\b", re.I)
RE_FN_DEF = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+([a-z_.][\w.]*)\s*\(", re.I)
RE_FN_CALL = re.compile(r"\b([a-z_][\w]*\.[a-z_][\w]*|\b[a-z_][\w]*)\s*\(\s*\)", re.I)
RE_GRANT_TO = re.compile(r"\bto\s+(public|authenticated|anon|service_role)\b", re.I)

# funções que o Postgres/Supabase já trazem: nunca devem ser cobradas no SQL
# versionado (auth.uid() em particular é injetado pelo GoTrue em toda policy).
SQL_KEYWORDS = {
    "case", "coalesce", "current_setting", "current_date", "current_timestamp",
    "now", "nextval", "count", "greatest", "least", "nullif", "row", "values",
    "select", "insert", "update", "delete", "where", "and", "or", "not", "in",
    "exists", "true", "false", "auth.uid", "auth.role", "auth.email", "auth.jwt",
    "auth.jwt", "array_length", "jsonb_build_object", "to_jsonb",
}


def _sem_schema(nome: str) -> str:
    """remove o prefixo `public.` (o qualifier do schema é irrelevante p/ comparar)."""
    return nome[7:] if nome.startswith("public.") else nome


def limpar_comentarios(texto: str) -> str:
    """Remove comentários de linha e de bloco, preservando o interior de $$ ... $$.

    Sem isto, um comentário dizendo "tudo `security definer`" vira uma FALHA
    de function sem search_path — falso-positivo que mata a utilidade do guarda.
    """
    texto = re.sub(r"/\*.*?\*/", " ", texto, flags=re.S)
    saida = []
    dentro = False
    for linha in texto.splitlines():
        if not dentro:
            linha = re.sub(r"--.*$", "", linha)
        n = linha.count("$$")
        if n % 2:
            dentro = not dentro
        saida.append(linha)
    return "\n".join(saida)


def analisar(arquivos: list[str]) -> tuple[list[str], list[str]]:
    falhas: list[str] = []
    avisos: list[str] = []
    texto_total = ""
    defs_global: set[str] = set()

    for caminho in arquivos:
        with open(caminho, encoding="utf-8") as fh:
            texto = limpar_comentarios(fh.read())
        texto_total += "\n" + texto
        defs = {_sem_schema(f.lower()) for f in RE_FN_DEF.findall(texto)}
        defs_global |= defs

        habilitadas = {t.lower() for t in RE_ENABLE_RLS.findall(texto)}
        criadas = {t.lower() for t in RE_CREATE_TABLE.findall(texto)}

        for tabela in sorted(criadas - habilitadas):
            falhas.append(f"{caminho}: tabela `{tabela}` criada sem `enable row level security`")

        # políticas
        for corpo, tabela, resto in RE_POLICY.findall(texto):
            alvo = f"{corpo} {resto}"
            if not RE_GRANT_TO.search(alvo):
                falhas.append(
                    f"{caminho}: política em `{tabela}` sem `to authenticated/service_role` "
                    "(Sem destinatário, o Postgres usa `to public` — vale para `anon`.)"
                )
            if re.search(r"\bto\s+anon\b", alvo, re.I):
                falhas.append(f"{caminho}: política em `{tabela}` liberada para `anon`")

        # security definer sem search_path fixo é vetor de search_path hijacking
        for bloco in re.split(r"\n\s*(?=create\s+or\s+replace\s+function)", texto, flags=re.I):
            if RE_SECURITY_DEFINER.search(bloco) and not RE_SET_SEARCH_PATH.search(bloco):
                nome = RE_FN_DEF.search(bloco)
                falhas.append(
                    f"{caminho}: function `{nome.group(1) if nome else '?'}` com `security definer` "
                    "sem `set search_path`"
                )

    # função usada em política mas nunca definida (o bug do ak-call-center)
    for chamada in sorted(set(RE_FN_CALL.findall(texto_total))):
        nome = _sem_schema(chamada.lower().strip())
        base = nome.split(".")[-1]
        if nome in SQL_KEYWORDS or base in SQL_KEYWORDS:
            continue
        # só cobra o que é função de projeto: com schema explícito ou prefixo fn_
        if "." not in nome and not nome.startswith("fn_"):
            continue
        definidas = defs_global | {f"public.{d}" for d in defs_global} | {f"private.{d}" for d in defs_global}
        if nome in definidas or base in definidas:
            continue
        avisos.append(
            f"função `{nome}()` referenciada no SQL não é definida em nenhum arquivo versionado "
            "— se ela só existe no editor do projeto, `supabase db push` em banca nova falha"
        )

    if criadas_todas := {t.lower() for t in RE_CREATE_TABLE.findall(texto_total)}:
        if "revoke all on all tables in schema public from anon" not in texto_total.replace("\n", " ").lower():
            if not re.search(r"revoke\s+.{0,80}from\s+anon", texto_total, re.I):
                falhas.append("nenhum `revoke ... from anon` no SQL versionado — o default do Supabase concede `anon` " +
                    "nas tabelas do schema public; se a revogação só existe no editor do projeto, ela não está no Git")
        else:
            avisos.append(f"dica: {len(criadas_todas)} tabelas protegidas por RLS; teste com a chave anon antes de publicar")

    return falhas, avisos


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    falhas, avisos = analisar(argv[1:])
    for a in avisos:
        print(f"AVISO  {a}")
    for f in falhas:
        print(f"FALHA  {f}")
    if falhas:
        print(f"\n{len(falhas)} falha(s) de segurança no SQL.")
        return 1
    print(f"Guarda de SQL OK ({len(argv) - 1} arquivo(s), {len(avisos)} aviso(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
