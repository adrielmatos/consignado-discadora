# Agente Windows (Phone Link) — como funciona e o que você precisa ajustar

## O desenho

```
   painel na Vercel  ──►  dial_jobs (Supabase)  ◄──  agente neste PC Windows  ──►  Phone Link  ──►  seu celular
        │                          ▲                                                    (BLE/Wi-Fi)
        └── disposição/anuência ───┘                                                    iPhone ou Android
                                        fn_finish_call ──► cdr + leads.status
```

O browser **nunca** toca no seu telefone. Quem toca é o processo local (`phone_link_agent.py`),
porque o Phone Link não expõe API. Isso é proposital: o navegador na Vercel não tem acesso a
Bluetooth, ao Phone Link, nem a um servidor local seu (CORS/mixed content). O trabalho é:
**fila no banco → agente executa → agente reporta**.

## Antes de rodar, deixe o vínculo de pé

1. Windows 10 (Mai/2019+) ou Windows 11. **Para iPhone o PC precisa de Bluetooth LE.**
2. No iPhone: iOS 16.6+ e o app **Link to Windows**; em Pareamento, habilite **Chamadas**.
   No Android: app **Link to Windows** (em Samsung/HONOR/OPPO/vivo/ASUS já vem).
3. Celular e PC na **mesma rede Wi-Fi** (é o que a Microsoft recomenda; Bluetooth fica para o
   áudio/HFP no caso do iPhone).
4. Abra o Phone Link, vá em **Chamadas**, marque o teclado, e confirme que você consegue
   digitar e ligar **manualmente** ali. Automatizar o que não funciona à mão é perda de tempo.
5. Energia: desligue " suspensão seletiva de USB" e o modo de economia que mata o app à noite.

## Instalação

```bat
cd agent
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt        :: pywinauto só instala no Windows
copy config.example.toml config.toml   :: edite url/chave/e-mail e os seletores
python phone_link_agent.py --dry-run   :: valida config + Supabase sem tocar na UI
python phone_link_agent.py --inspect   :: despeja inspect_controles.txt com a sua UI real
python phone_link_agent.py             :: modo normal (executa jobs criados no painel)
python phone_link_agent.py --modo auto --max 20   :: puxa leads sozinho, 20 ciclos e sai
```

Rodar como serviço (o jeito chato mas correto): agendador de tarefas do Windows → "Ao logar",
ação `python.exe C:\caminho\agent\phone_link_agent.py`, marcar "executar com privilégios mais
elevados" **só se necessário** — UI Automation precisa de uma **sessão interativa ativa**, então
a tela não pode ser bloqueada/lockada. Deixe um monitor ligado ou use "não bloquear" via
política. É por isso que o agente precisa ficar numa máquina de operador, não num servidor.

## O ponto sensível: os seletores

`phonelink_win.py` acha a janela por regex no título (`phone link|vincular`) e depois procura
controles por nome (`calls`/`chamadas`, `keypad`/`teclado`, `enter phone`/`número`, `call`/`ligar`,
`end`/`encerrar`). Essa UI muda com versão **e idioma do Windows** — por isso o modo `--inspect`
existe: ele escreve `inspect_controles.txt` com a árvore real da sua janela, e você copia os
nomes para `[seletores]` no `config.toml`. Não há como eu prever os nomes daqui — essa é a
única parte do projeto que exige você na frente da máquina, e deve levar ~15 minutos.

Se o `campo_numero` não for encontrado, o agente cai para digitação direta na janela (o teclado do
Phone Link aceita dígitos) e `{ENTER}` para ligar. Se mesmo assim falhar, o CDR sai como
`falha_agent` com a mensagem de erro — e o lead **não** é queimado: volta para a fila pela
RPC `fn_expirar_jobs`.

## Duração e "quem atendeu"

Não existe evento de fim de chamada acessível no Phone Link. O agente usa heurística: enquanto
houver na UI marcador de "chamada em andamento" (`in call`, `mic`, `muted`), considera ligado;
quando some, mede o tempo desde o clique. Se a UI da sua versão não expõe nada detectável,
`aguardar_fim` devolve `None` e o `core` registra `ligacao_caiu` — nesse caso use o cronômetro
da tela do operador e clique a disposição (é o caminho honesto para 1-2 atendentes).

## O que o agente **não** faz (e você não deve fingir que faz)

- **Não grava a ligação.** Áudio de chamada no Phone Link não é capturável de forma confiável por
  UI Automation. Gravação exige PBX no meio (Asterisk/`chan_quectel`/gateway GSM) — ver
  `../discar-pelo-celular-PLANO.md` no plano maior.
- **Não disca em paralelo.** 1 Phone Link = 1 chamada por vez por PC. Escalar = mais PCs/celulares.
- **Não marca AMD (secretária eletrônica) automaticamente.** Só classificação por duração.
- **Não contrata consignado na ligação.** Proibido (Lei 15.327/2026); o fluxo certo é registrar
  proposta e cobrar anuência no Meu INSS — o painel já faz isso.
