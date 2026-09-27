"""
Testes do núcleo do agente. Rodam em qualquer SO (não precisam de Windows nem do
Supabase): sobem um servidor HTTP falso que fala PostgREST o suficiente para o
`SupabaseRest`, e um discador falso. Para rodar:  python -m pytest -q
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from core import (
    Config,
    DiscadorSimulado,
    SupabaseRest,
    disposicao_por_duracao,
    executar_um_ciclo,
    normalizar_numero,
    rodar,
)


class FalsoSupabase:
    """Guarda jobs/leads em memória e registra o que a discadora chamou."""

    def __init__(self, jobs: list[dict] | None = None):
        self.jobs = jobs if jobs is not None else [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "lead_id": 77,
                "tentativa": 1,
                "claimed_em": "2026-09-27T10:00:00Z",
                "status": "claimed",
                "leads": {"nome": "Maria", "telefone_e164": "+5579999990001", "cpf_mask": "123.***.***-01"},
            }
        ]
        self.rpcs: list[tuple[str, dict]] = []
        self.patches: list[tuple[str, dict, dict]] = []

    # -- handlers chamados pelo SupabaseRest
    def handle_rpc(self, funcao: str, params: dict):
        self.rpcs.append((funcao, params))
        if funcao == "fn_claim_next_lead":
            if not self.jobs:
                return None
            j = self.jobs.pop(0)
            return [{
                "job_id": j["id"], "lead_id": j["lead_id"], "nome": j["leads"]["nome"],
                "telefone": j["leads"]["telefone_e164"], "cpf_mask": j["leads"]["cpf_mask"],
                "tentativas": 1, "cidade": None, "uf": None, "campanha": "INSS",
                "publico": "inss", "script_resumo": None, "margem_estimada": None, "obs": None,
            }]
        if funcao == "fn_finish_call":
            self.jobs = [j for j in self.jobs if j["id"] != params["p_job"]]
            return {"ok": True, "lead_id": params.get("lead_id", 77), "status": "contato",
                    "tentativas": 2, "duracao_s": params.get("p_duracao")}
        if funcao == "fn_expirar_jobs":
            return 2
        return None

    def handle_select(self, tabela: str, params: dict):
        if params.get("select") == "id" or tabela == "agentes":
            return [{"id": "agente-1"}]
        if tabela == "dial_jobs":
            return [j for j in self.jobs if j.get("status") == "claimed"][:1]
        return []

    def handle_patch(self, tabela: str, query: str, corpo: dict):
        self.patches.append((tabela, query, corpo))
        return []


@pytest.fixture()
def servidor():
    estado: dict = {"fake": None}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silencia
            pass

        def _json(self, corpo, code=200):
            dados = json.dumps(corpo).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def do_GET(self):
            from urllib.parse import urlparse, parse_qs

            u = urlparse(self.path)
            tabela = u.path.rsplit("/", 1)[-1]
            params = {k: v[0] for k, v in parse_qs(u.query).items()}
            self._json(estado["fake"].handle_select(tabela, params))

        def do_POST(self):
            from urllib.parse import urlparse

            n = int(self.headers.get("Content-Length") or 0)
            corpo = json.loads(self.rfile.read(n) or b"{}")
            funcao = urlparse(self.path).path.rsplit("/", 1)[-1]
            self._json(estado["fake"].handle_rpc(funcao, corpo))

        def do_PATCH(self):
            from urllib.parse import urlparse, parse_qs

            n = int(self.headers.get("Content-Length") or 0)
            corpo = json.loads(self.rfile.read(n) or b"{}")
            u = urlparse(self.path)
            tabela = u.path.rsplit("/", 1)[-1]
            query = parse_qs(u.query)
            self._json(estado["fake"].handle_patch(tabela, u.query, corpo))

    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv, estado
    srv.shutdown()


def _cfg(base, **kw) -> Config:
    return Config(url=f"http://127.0.0.1:{srv_port(base)}", chave="test-key",
                  seco=kw.pop("seco", False), modo=kw.pop("modo", "claimed"), **kw)


def srv_port(srv) -> int:
    return int(srv.server_address[1])


# ------------------------------------------------------------------ unitários puros


def test_normaliza_numero_br_sem_ddi():
    assert normalizar_numero("(79) 99999-0001") == "5579999990001"
    assert normalizar_numero("7933334444") == "557933334444"
    assert normalizar_numero("+55 79 99999-0001") == "5579999990001"


def test_disposicao_por_duracao():
    assert disposicao_por_duracao(None) == "ligacao_caiu"
    assert disposicao_por_duracao(0) == "nao_atendeu"
    assert disposicao_por_duracao(4) == "ligacao_caiu"
    assert disposicao_por_duracao(61) == "atendeu"
    assert disposicao_por_duracao(61, atendeu=False) == "nao_atendeu"


# ------------------------------------------------------------------ integração do loop


def test_um_ciclo_completo_discando_e_reportando(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv, email_agente="maria@x.com")
    sb = SupabaseRest(cfg.url, cfg.chave)
    discador = DiscadorSimulado(duracao=53)

    resultado = executar_um_ciclo(sb, discador, cfg, "agente-1")

    assert resultado == "ok", "ciclo deveria terminar com sucesso"
    assert discador.ligados == ["5579999990001"], "número discado deveria estar normalizado"
    assert fake.patches, "o job deveria ter sido marcado como discado"
    assert fake.patches[0][0] == "dial_jobs"
    assert fake.patches[0][2]["status"] == "discado"

    finais = [p for (f, p) in fake.rpcs if f == "fn_finish_call"]
    assert len(finais) == 1
    assert finais[0]["p_disposition"] == "atendeu"
    assert finais[0]["p_duracao"] == 53


def test_modo_auto_usa_rpc_de_claim(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv, modo="auto")
    sb = SupabaseRest(cfg.url, cfg.chave)

    assert executar_um_ciclo(sb, DiscadorSimulado(12), cfg, None) == "ok"
    assert [f for (f, _p) in fake.rpcs][0] == "fn_claim_next_lead"


def test_sem_job_retorna_sem_job(servidor):
    srv, estado = servidor
    fake = FalsoSupabase(jobs=[])
    estado["fake"] = fake
    cfg = _cfg(srv)
    assert executar_um_ciclo(SupabaseRest(cfg.url, cfg.chave), DiscadorSimulado(), cfg, None) == "sem_job"


def test_dry_run_nao_discar_mas_reporta(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv, seco=True)
    discador = DiscadorSimulado()

    assert executar_um_ciclo(SupabaseRest(cfg.url, cfg.chave), discador, cfg, None) == "ok"
    assert discador.ligados == [], "dry-run não pode acionar o discador"
    finais = [p for (f, p) in fake.rpcs if f == "fn_finish_call"]
    assert finais[0]["p_disposition"] == "nao_atendeu"


def test_falha_do_discador_vira_falha_agent(servidor):
    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake

    class DiscadorQuebrado:
        def ligar(self, numero):
            raise RuntimeError("janela do Phone Link fechou")
        def aguardar_fim(self, timeout_s):
            return None
        def desligar(self):
            return None

    cfg = _cfg(srv)
    assert executar_um_ciclo(SupabaseRest(cfg.url, cfg.chave), DiscadorQuebrado(), cfg, None) == "falha"
    finais = [p for (f, p) in fake.rpcs if f == "fn_finish_call"]
    assert finais[0]["p_disposition"] == "falha_agent"
    assert "Phone Link fechou" in finais[0]["p_nota"]


def test_loop_para_apos_n_ciclos(servidor):
    srv, estado = servidor
    fake = FalsoSupabase(jobs=[])
    estado["fake"] = fake
    cfg = _cfg(srv, poll_s=0.01)
    feitos = rodar(SupabaseRest(cfg.url, cfg.chave), DiscadorSimulado(), cfg, None, parar_depois=3)
    assert feitos == 3


def test_limpar_zumbis_chama_rpc(servidor):
    from core import limpar_jobs_zumbis

    srv, estado = servidor
    fake = FalsoSupabase()
    estado["fake"] = fake
    cfg = _cfg(srv)
    assert limpar_jobs_zumbis(SupabaseRest(cfg.url, cfg.chave), 6) == 2
    assert ("fn_expirar_jobs", {"p_minutos": 6}) in fake.rpcs


def test_disposicao_invalida_e_recusada(servidor):
    srv, estado = servidor
    estado["fake"] = FalsoSupabase()
    cfg = _cfg(srv)
    with pytest.raises(ValueError):
        SupabaseRest(cfg.url, cfg.chave).finalizar("x", "ligou_e_fugiu", 1, None)


# ------------------------------------------------------------------ config


def test_config_lê_toml_e_env_tem_precedencia(tmp_path, monkeypatch):
    from core import Config

    arq = tmp_path / "config.toml"
    arq.write_text(
        '[agente]\nurl = "https://proj.supabase.co"\nchave = "svc"\npoll_s = 9\nseco = true\n'
        'modo = "auto"\n[seletores]\nbotao_ligar = "(?i)^chamar$"\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "do-ambiente-vence")
    cfg = Config.from_env({}, arquivo=str(arq))

    assert cfg.url == "https://proj.supabase.co"
    assert cfg.poll_s == 9.0
    assert cfg.modo == "auto"
    assert cfg.seco is True
    assert cfg.seletores["botao_ligar"] == "(?i)^chamar$"
    assert cfg.chave == "do-ambiente-vence"


def test_config_sem_arquivo_usa_apenas_env(monkeypatch):
    from core import Config

    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "abc")
    cfg = Config.from_env({}, arquivo="nao-existe.toml")
    assert cfg.url == "https://x.supabase.co" and cfg.chave == "abc"
    assert cfg.seco is False
