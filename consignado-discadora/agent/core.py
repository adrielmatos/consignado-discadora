"""
Núcleo da discadora Phone Link — lógica pura, sem dependência de Windows.

Este módulo é testável em qualquer lugar (Linux/macOS/Windows): ele não importa
pywinauto nem conhece a UI do Phone Link. O que ele faz:

  * conversar com o Supabase via REST (PostgREST) — sem SDK, só `requests`;
  * reclamar um `dial_jobs` pendente/claimed, entregar ao "discador" e reportar o
    resultado de volta pela RPC `fn_finish_call`;
  * decidir re-tentativa / expiração / formatação de número brasileiro.

O que sabe mexer em janela está em `phonelink_win.py` (só importa pywinauto).
"""

from __future__ import annotations

import dataclasses
import json
import logging
import time
from typing import Any, Iterable, Protocol

log = logging.getLogger("discadora")

DISPOSICOES = {
    "atendeu",
    "nao_atendeu",
    "ocupado",
    "secretaria",
    "whatsapp",
    "ligacao_caiu",
    "numero_invalido",
    "falha_agent",
}


# --------------------------------------------------------------------------- config


@dataclasses.dataclass
class Config:
    url: str
    chave: str                       # service_role (o agente é um processo confiável)
    email_agente: str = ""
    poll_s: float = 4.0
    timeout_ligacao_s: int = 180     # espera máxima pela duração da chamada
    expirar_jobs_min: int = 6
    modo: str = "claimed"            # 'claimed' (painel pediu) | 'auto' (agente puxa da fila)
    seco: bool = False               # dry-run: não mexe na UI
    max_ligacoes: int = 0            # 0 = sem limite (útil p/ teste: --max 5)

    seletores: dict[str, Any] = dataclasses.field(default_factory=dict)

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None, arquivo: str | None = None) -> "Config":
        """Config vem de variáveis de ambiente e/ou config.toml (env vence o arquivo)."""
        import os

        ambiente = {**os.environ, **(env or {})}
        dados: dict[str, Any] = {}
        seletores: dict[str, Any] = {}
        caminho = arquivo or ambiente.get("DISCADORA_CONFIG", "config.toml")
        if caminho and os.path.exists(caminho):
            try:
                from tomllib import load as toml_load  # python >= 3.11
            except ImportError:  # pragma: no cover - 3.10 e anteriores
                dados = {}
            else:
                with open(caminho, "rb") as fh:
                    bruto = toml_load(fh)
                dados = dict(bruto.get("agente", {}))
                seletores = dict(bruto.get("seletores", {}))

        def pegar(chave_toml: str, *nomes_env: str, padrao: Any = "") -> Any:
            """Ordem de preferência: variável de ambiente > config.toml > padrão."""
            for nome in nomes_env:
                if str(ambiente.get(nome, "")) != "":
                    return ambiente[nome]
            if chave_toml in dados and str(dados[chave_toml]) != "":
                return dados[chave_toml]
            return padrao

        return cls(
            url=str(pegar("url", "SUPABASE_URL", "AG_SUPABASE_URL")).rstrip("/"),
            chave=str(pegar("chave", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")),
            email_agente=str(pegar("email_agente", "AGENTE_EMAIL", "AG_AGENTE_EMAIL")),
            poll_s=float(pegar("poll_s", "POLL_SECONDS", padrao=4.0)),
            timeout_ligacao_s=int(pegar("timeout_ligacao_s", "TIMEOUT_LIGACAO_S", padrao=180)),
            expirar_jobs_min=int(pegar("expirar_jobs_min", "EXPIRAR_JOBS_MIN", padrao=6)),
            modo=str(pegar("modo", "MODO", padrao="claimed")),
            seco=str(pegar("seco", "DRY_RUN", padrao=False)).strip().lower() in ("1", "true", "sim"),
            max_ligacoes=int(pegar("max_ligacoes", "MAX_LIGACOES", padrao=0)),
            seletores=seletores,
        )


# --------------------------------------------------------------------------- supabase


class SupabaseRest:
    """Cliente mínimo de PostgREST: select / insert / update / rpc."""

    def __init__(self, url: str, chave: str, timeout: float = 20.0, session: Any = None):
        self.url = url.rstrip("/")
        self.chave = chave
        self.timeout = timeout
        if session is None:  # trocável nos testes
            import requests

            session = requests.Session()
        self.http = session

    # -- infra
    def _cab(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        base = {
            "apikey": self.chave,
            "Authorization": f"Bearer {self.chave}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        base.update(extra or {})
        return base

    # -- operações
    def rpc(self, funcao: str, params: dict[str, Any] | None = None) -> Any:
        resp = self.http.post(
            f"{self.url}/rest/v1/rpc/{funcao}",
            json=params or {},
            headers=self._cab(),
            timeout=self.timeout,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"rpc {funcao} falhou ({resp.status_code}): {resp.text[:300]}")
        return resp.json() if resp.content else None

    def select(self, tabela: str, filt: dict[str, str] | None = None,
               ordem: str | None = None, limite: int = 10, colunas: str = "*") -> list[dict]:
        params = {"select": colunas, **(filt or {})}
        if ordem:
            params["order"] = ordem
        params["limit"] = str(limite)
        resp = self.http.get(f"{self.url}/rest/v1/{tabela}", params=params, headers=self._cab(),
                             timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"select {tabela} falhou ({resp.status_code}): {resp.text[:300]}")
        return resp.json()

    def patch(self, tabela: str, filt: dict[str, str], valores: dict[str, Any]) -> list[dict]:
        resp = self.http.patch(
            f"{self.url}/rest/v1/{tabela}?{self._qs(filt)}",
            json=valores,
            headers=self._cab({"Prefer": "return=representation"}),
            timeout=self.timeout,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"update {tabela} falhou ({resp.status_code}): {resp.text[:300]}")
        return resp.json() if resp.content else []

    @staticmethod
    def _qs(filt: dict[str, str]) -> str:
        from urllib.parse import urlencode

        return urlencode(filt)

    # -- atalhos do domínio
    def id_por_email(self, email: str) -> str | None:
        if not email:
            return None
        linhas = self.select("agentes", filt={"email": f"eq.{email}", "ativo": "eq.true"}, limite=1)
        return linhas[0]["id"] if linhas else None

    def job_pendente(self, agente_id: str | None) -> dict | None:
        """Job que o painel criou (status claimed) e que ainda não foi discado."""
        filt = {"status": "eq.claimed", "disposition": "is.null"}
        if agente_id:
            filt["agente_id"] = f"eq.{agente_id}"
        linhas = self.select("dial_jobs", filt=filt, ordem="claimed_em.asc", limite=1,
                             colunas="id,lead_id,tentativa,claimed_em,leads(nome,telefone_e164,cpf_mask)")
        return linhas[0] if linhas else None

    def claim_na_fila(self, agente_id: str | None) -> dict | None:
        """Modo auto: o próprio agente pede o próximo lead pela RPC (respeita horário/opt-out)."""
        linhas = self.rpc("fn_claim_next_lead", {"p_agente": agente_id})
        if not linhas:
            return None
        l = linhas[0]
        return {
            "id": l["job_id"],
            "lead_id": l["lead_id"],
            "tentativa": l["tentativas"],
            "leads": {
                "nome": l.get("nome"),
                "telefone_e164": l.get("telefone"),
                "cpf_mask": l.get("cpf_mask"),
            },
        }

    def finalizar(self, job_id: str, disposicao: str, duracao_s: int | None, nota: str | None) -> dict:
        if disposicao not in DISPOSICOES:
            raise ValueError(f"disposição desconhecida: {disposicao}")
        return self.rpc("fn_finish_call", {
            "p_job": job_id,
            "p_disposition": disposicao,
            "p_duracao": duracao_s,
            "p_nota": nota,
        }) or {}


# --------------------------------------------------------------------------- dialer


class Discador(Protocol):
    def ligar(self, numero: str) -> None: ...
    def aguardar_fim(self, timeout_s: int) -> int | None: ...   # duração em segundos
    def desligar(self) -> None: ...


class DiscadorSimulado:
    """Para desenvolvimento/teste: não toca na UI. Simula atendente atendendo."""

    def __init__(self, duracao: int = 42):
        self.duracao = duracao
        self.ligados: list[str] = []

    def ligar(self, numero: str) -> None:
        self.ligados.append(numero)
        log.info("[simulado) discando %s", numero)

    def aguardar_fim(self, timeout_s: int) -> int | None:
        return self.duracao

    def desligar(self) -> None:
        return None


# --------------------------------------------------------------------------- helpers


def normalizar_numero(bruto: str) -> str:
    """Deixa o número no formato que o discador do celular entende (só dígitos, com DDI)."""
    digitos = "".join(c for c in (bruto or "") if c.isdigit())
    if digitos.startswith("00"):
        digitos = digitos[2:]
    if digitos.startswith("55") and len(digitos) >= 12:
        return digitos
    if len(digitos) in (10, 11):  # DDD + número brasileiro
        return f"55{digitos}"
    return digitos


def disposicao_por_duracao(duracao_s: int | None, atendeu: bool = True) -> str:
    """Regra de negócio: o que o CDR deve dizer quando o agente não sabe classificar."""
    if duracao_s is None:
        return "ligacao_caiu"
    if not atendeu or duracao_s == 0:
        return "nao_atendeu"
    if duracao_s < 8:
        return "ligacao_caiu"
    return "atendeu"


def deve_retentar(lead: dict | None, tentativas_feitas: int, max_tentativas: int) -> bool:
    return tentativas_feitas < max_tentativas


# --------------------------------------------------------------------------- loop


def executar_um_ciclo(sb: SupabaseRest, discador: Discador, cfg: Config,
                      agente_id: str | None) -> str:
    """
    Um ciclo: pega job -> disca -> espera terminar -> reporta.
    Retorna 'ok' | 'sem_job' | 'falha'. Nunca levanta exceção para o chamador.
    """
    try:
        job = sb.job_pendente(agente_id) if cfg.modo == "claimed" else sb.claim_na_fila(agente_id)
        if not job:
            return "sem_job"

        lead = job.get("leads") or {}
        numero = normalizar_numero(str(lead.get("telefone_e164") or ""))
        job_id = str(job["id"])
        if not numero:
            sb.finalizar(job_id, "numero_invalido", 0, "lead sem telefone")
            return "falha"

        sb.patch("dial_jobs", {"id": f"eq.{job_id}", "status": "in.(claimed,pendente)"},
                 {"status": "discado", "started_em": "now()"})

        if cfg.seco:
            duracao: int | None = 0
            disposicao = "nao_atendeu"
            log.info("[dry-run] deixei de discar %s", numero)
        else:
            try:
                discador.ligar(numero)
                duracao = discador.aguardar_fim(cfg.timeout_ligacao_s)
            except Exception as exc:  # UI quebrou, aparelho caiu, janela mudou
                log.exception("discador falhou")
                sb.finalizar(job_id, "falha_agent", None, f"{type(exc).__name__}: {exc}"[:400])
                return "falha"
            disposicao = disposicao_por_duracao(duracao)

        resultado = sb.finalizar(job_id, disposicao, duracao, None)
        log.info("job %s -> %s (%ss) | lead %s -> %s", job_id[:8], disposicao, duracao,
                 resultado.get("lead_id"), resultado.get("status"))
        return "ok"
    except Exception as exc:  # rede/RPC
        log.warning("ciclo com erro: %s", exc)
        return "falha"


def rodar(sb: SupabaseRest, discador: Discador, cfg: Config,
          agente_id: str | None = None, parar_depois: int | None = None) -> int:
    """Loop principal. `parar_depois` encerra após N ciclos (usado nos testes)."""
    feitos = 0
    while True:
        resultado = executar_um_ciclo(sb, discador, cfg, agente_id)
        feitos += 1
        if resultado == "sem_job":
            time.sleep(min(cfg.poll_s, 30))
        if parar_depois is not None and feitos >= parar_depois:
            return feitos
    # nunca chega


def limpar_jobs_zumbis(sb: SupabaseRest, minutos: int = 6) -> int:
    """Devolve para a fila jobs que ficaram pendurados (agente caiu no meio)."""
    try:
        r = sb.rpc("fn_expirar_jobs", {"p_minutos": minutos})
        return int(r if isinstance(r, (int, float)) else 0)
    except Exception as exc:
        log.warning("fn_expirar_jobs indisponível: %s", exc)
        return 0
