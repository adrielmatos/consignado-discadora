#!/usr/bin/env python3
"""
Agente Windows da discadora de consignado.

  python phone_link_agent.py --dry-run            # roda sem tocar na UI (para validar config)
  python phone_link_agent.py --inspect            # despeja os controles do Phone Link em arquivo
  python phone_link_agent.py --modo auto --max 20 # o agente puxa os leads da fila sozinho
  python phone_link_agent.py                      # modo padrão: executa os jobs criados no painel

Precisa do pacote `pywinauto` (só instala no Windows) e do Phone Link pareado.
"""

from __future__ import annotations

import argparse
import logging
import sys

from core import DiscadorSimulado, Config, SupabaseRest, limpar_jobs_zumbis, rodar


def montar_discador(cfg: Config) -> object:
    if cfg.seco:
        return DiscadorSimulado()
    if sys.platform != "win32":
        sys.exit("dirigir o Phone Link exige Windows (UI Automation). Use --dry-run para testar.")
    from phonelink_win import PhoneLinkDialer, Seletores  # import tardio, só no Windows

    return PhoneLinkDialer(Seletores(**cfg.seletores) if cfg.seletores else Seletores())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Agente Phone Link -> Supabase")
    ap.add_argument("--url", default=None, help="SUPABASE_URL")
    ap.add_argument("--chave", default=None, help="service_role key (ou use env)")
    ap.add_argument("--email", default=None, help="e-mail do operador (tabela agentes)")
    ap.add_argument("--modo", choices=("claimed", "auto"), default=None)
    ap.add_argument("--dry-run", action="store_true", help="não mexe na UI nem disca")
    ap.add_argument("--max", type=int, default=0, help="encerra após N ciclos (teste)")
    ap.add_argument("--inspect", action="store_true", help="lista controles da janela e sai")
    ap.add_argument("--log", default="INFO")
    args = ap.parse_args(argv)

    logging.basicConfig(level=getattr(logging, args.log.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")

    cfg = Config.from_env({})
    if args.url:
        cfg.url = args.url
    if args.chave:
        cfg.chave = args.chave
    if args.email:
        cfg.email_agente = args.email
    if args.modo:
        cfg.modo = args.modo
    if args.dry_run:
        cfg.seco = True

    if not cfg.url or not cfg.chave:
        sys.exit("faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (env ou config.toml)")

    sb = SupabaseRest(cfg.url, cfg.chave)

    if args.inspect:
        if sys.platform != "win32":
            sys.exit("--inspect precisa do Windows (lê a UI do Phone Link por UI Automation)")
        from phonelink_win import PhoneLinkDialer, Seletores

        destino = PhoneLinkDialer(Seletores()).inspecionar()
        print(f"árvore de controles escrita em {destino}")
        print("use os nomes reais para ajustar Seletores em config.toml -> [seletores]")
        return 0

    agente_id = sb.id_por_email(cfg.email_agente)
    if cfg.email_agente and not agente_id:
        logging.warning("e-mail %s não está na tabela agentes; CDRs ficam sem agente", cfg.email_agente)

    discador = montar_discador(cfg)
    logging.info("agente pronto | url=%s | modo=%s | dry_run=%s | agente=%s",
                 cfg.url, cfg.modo, cfg.seco, agente_id or "-")

    rodar(sb, discador, cfg, agente_id=agente_id,
          parar_depois=args.max if args.max else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
