"""
Camada Windows: dirige o app "Phone Link" (Vincular ao Celular) por UI Automation.

Por que UIA e não API?  O Phone Link **não tem API pública**. Quem automatiza isso
no ecossistema open source usa automação de interface — é exatamente o que fazem
`vofr/DiscordBotPhoneLinkDialer` e `KibeStevie/Phone-Call-Automation` (este último
diz no README: "interacts with Microsoft Phone Link via UI automation — not through
any official API"). Consequência: os identificadores abaixo podem mudar a cada
versão do app. Por isso o seletor é configurável e existe o modo --inspect.

Requisitos do vínculo (conferidos na doc da Microsoft, 2026):
  * iPhone: iOS 16+, PC com Bluetooth Low Energy (BLE), Windows 10 (Mai/2019+) ou 11;
    app "Link to Windows" no iPhone (opcional, mas recomendado p/ pareamento).
  * Android: app "Link to Windows" no aparelho; chamadas exigem PC com Windows 10+
    com Bluetooth; mesma rede Wi-Fi é o caminho mais estável.
  * Chamada **não** é gravada pelo Phone Link. Precisa de gravação -> PBX no meio.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field

log = logging.getLogger("phonelink")


@dataclass
class Seletores:
    """Regex de nomes de controle. Ajuste aqui (ou no config.toml) para a sua versão."""

    janela: str = r"(?i)phone link|vincular"
    aba_chamadas: str = r"(?i)^calls$|chamadas|ligar"
    teclado: str = r"(?i)keypad|teclado|dial pad|marcar"
    campo_numero: str = r"(?i)enter phone|search|number|n[uú]mero"
    botao_ligar: str = r"(?i)^call$|^ligar$|place call"
    botao_encerrar: str = r"(?i)^end$|hang|encerrar|desligar"
    em_chamada: str = r"(?i)in call|chamada em andamento|mic|muted|silenciar"
    controles_extra: list[str] = field(default_factory=list)


def _desktop():
    from pywinauto import Desktop  # import tardio: só existe no Windows

    return Desktop(backend="uia")


class PhoneLinkDialer:
    """Discador real: escreve o número no Phone Link e aperta ligar."""

    def __init__(self, sel: Seletores | None = None, encerrar_ao_fim: bool = True):
        self.sel = sel or Seletores()
        self.encerrar_ao_fim = encerrar_ao_fim
        self._inicio: float | None = None

    # -- descoberta
    def _janela(self):
        for janela in _desktop().windows():
            try:
                tit = janela.window_text() or ""
            except Exception:
                continue
            if re.search(self.sel.janela, tit):
                return janela
        raise RuntimeError(
            "janela do Phone Link não encontrada. Abra o app, faça pareamento e "
            "rode `python phone_link_agent.py --inspect` para ver os títulos reais."
        )

    @staticmethod
    def _achar(contêiner, padrao: str, tipos: tuple[str, ...] = ()):
        """Procura o primeiro descendente cujo nome bate com a regex (e tipo, se dado)."""
        alvo = re.compile(padrao)
        for filho in contêiner.descendants(depth=8):
            try:
                nome = filho.window_text() or ""
            except Exception:
                continue
            if alvo.search(nome):
                if tipos:
                    ctrl = (filho.element_info.control_type or "").lower()
                    if not any(t.lower() in ctrl for t in tipos):
                        continue
                return filho
        return None

    # -- ações
    def ligar(self, numero: str) -> None:
        janela = self._janela()
        janela.set_focus()

        aba = self._achar(janela, self.sel.aba_chamadas)
        if aba is not None:
            try:
                aba.click_input()
                time.sleep(0.6)
            except Exception as exc:
                log.debug("aba de chamadas não clicável: %s", exc)

        teclado = self._achar(janela, self.sel.teclado)
        if teclado is not None:
            try:
                teclado.click_input()
                time.sleep(0.4)
            except Exception:
                pass

        campo = self._achar(janela, self.sel.campo_numero, tipos=("edit",))
        if campo is not None:
            campo.set_edit_text("")
            campo.type_keys(numero, with_spaces=False)
        else:
            # fallback: digitar direto — o teclado do app captura os dígitos
            log.info("campo de número não achado; caindo para digitação na janela")
            janela.type_keys(numero)

        botao = self._achar(janela, self.sel.botao_ligar)
        if botao is not None:
            botao.click_input()
        else:
            janela.type_keys("{ENTER}")

        self._inicio = time.monotonic()
        log.info("discação enviada para %s pelo Phone Link", numero)

    def aguardar_fim(self, timeout_s: int) -> int | None:
        """
        Espera a chamada terminar e devolve a duração em segundos.
        Estratégia: enquanto houver marcador 'em chamada', continua; quando sumir,
        terminou. Se nunca apareceu (UI diferente), usa o cronômetro do Painel
        (fallback) e devolve None para o core classificar.
        """
        viu_chamada = False
        fim = time.monotonic() + timeout_s
        while time.monotonic() < fim:
            try:
                janela = self._janela()
                em_chamada = self._achar(janela, self.sel.em_chamada) is not None
            except Exception:
                em_chamada = False
            if em_chamada:
                viu_chamada = True
            elif viu_chamada:
                break
            time.sleep(1.0)
        else:
            log.warning("timeout de %ss atingido; encerrando por segurança", timeout_s)
            try:
                self.desligar()
            except Exception:
                pass

        duracao = int(time.monotonic() - self._inicio) if self._inicio else None
        if not viu_chamada:
            log.info("não consegui detectar o fim da chamada pela UI — devolvendo None")
            return None
        return duracao

    def desligar(self) -> None:
        janela = self._janela()
        botao = self._achar(janela, self.sel.botao_encerrar)
        if botao is not None:
            botao.click_input()
            log.info("chamada encerrada pela UI")
        else:
            log.info("botão de encerrar não encontrado; deixe o usuário desligar no celular")

    def inspecionar(self, caminho_saida: str = "inspect_controles.txt") -> str:
        """Despeja a árvore de controles da janela — é assim que se ajustam os seletores."""
        janela = self._janela()
        import io
        from contextlib import redirect_stdout

        buf = io.StringIO()
        with redirect_stdout(buf):
            janela.print_control_identifiers(depth=8, filename=None)
        texto = buf.getvalue()
        with open(caminho_saida, "w", encoding="utf-8") as fh:
            fh.write(texto)
        return caminho_saida
