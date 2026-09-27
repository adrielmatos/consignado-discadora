# Discar PELO CELULAR: o que é possível, onde está no GitHub, e o que eu sugiro

Pesquisa de **27/09/2026**. Repositórios conferidos um a um na API do GitHub (estrelas, licença,
data do último push). Sites conferidos por busca na web. Nada aqui é de memória.

---

## 1. Resposta direta

**Sim, é possível.** Mas "é possível" tem dois graus muito diferentes de robustez, e isso define
todo o resto:

| Caminho | O celular continua sendo a linha? | Resultado da ligação (CDR) automático? | Grava a conversa? | Multi-canal (2+ chamadas ao mesmo tempo)? | Vai pra produção? | Risco |
|---|---|---|---|---|---|---|
| **A. ADB / app-agente no celular** | sim, exatamente como hoje | sim (lendo call log ou agente postando) | **não** | **não** — 1 ligação por vez, 1 aparelho | protótipo OK, produção ruim | Android mata o processo, ADB cai, update quebra |
| **B. Celular como tronco do Asterisk via Bluetooth** (`chan_mobile`) | sim | sim | sim | 1 linha por pareamento | frágil | driver sem mantenedor |
| **C. SIM sai do celular → modem USB 4G** (`chan_dongle`/`chan_quectel`) | o mesmo chip, outro aparelho | sim | sim | 1 linha por modem | **estável** | precisa comprar modem (~R$ 100-250) |
| **D. Gateway GSM de mesa (banco de chips)** | o mesmo chip, 4-8 linhas | sim | sim | sim | **estável** | equipamento dedicado |

Sua pergunta ("sistema vai ser discado pelo celular no momento") é o caminho **A**. Ele funciona —
eu escrevi e testei um bridge que faz exatamente isso, está neste diretório. Mas ele é **bom para
validar a operação com 1 atendente e algumas dezenas de ligações/dia**, e é **ruim como produto**.
Os motivos são concretos: Android bloqueia `ACTION_CALL` de apps comuns, o `shell` do ADB perdeu
acesso ao `call_log` em vários Android 13+, o sistema operacional mata o processo em segundo plano,
e a discagem fica limitada ao tempo de uma chamada humana (sem AMD, sem pacing).

---

## 2. O que existe no GitHub para o cenário "disco pelo celular"

### 2a. Diretamente o seu caso (celular físico = linha)

| Repo | ★ | Licença | Último push | O que é |
|---|---|---|---|---|
| `k-chatz/bluetooth-gsm-sip-gateway` | 21 | (sem arquivo de licença) | **2026-05-25** | **Mais próximo do seu pedido.** Docker com Asterisk + `chan_mobile` + BlueZ: seu celular vira tronco GSM por Bluetooth HFP. Discar de um softphone/SIP → a chamada sai pelo aparelho. Tem `extensions.conf`, `sip.conf`, `chan_mobile.conf` prontos e receita de teste com Linphone. Base Ubuntu 18.04 (EOL — eles admitem), precisa Docker Engine nativo e adaptador Bluetooth real. |
| `geekydoodle/android-ivr` | 2 | — | 2026-08-13 | Python: controla celular Android via **ADB** para chamadas de saída e toca áudio. É o esqueleto do modo A. |
| `bg111/asterisk-chan-dongle` | 384 | (NOASSERTION) | 2023-12-26 | `chan_dongle` — trunk GSM com modem USB Huawei (SIM dentro do modem, não no celular). |
| `IchthysMaranatha/asterisk-chan-quectel` | 174 | (NOASSERTION) | **2025-04-24** | Sucessor moderno para **4G**: Quectel **e Simcom** (SIM7600/SIM800 — aqueles módulos USB baratos), "works with Asterisk-13+". É o caminho C e o mais vivo dos três. |
| `garronej/chan-dongle-extended` | 31 | — | 2022-10-20 | Extensão do chan_dongle: PIN do chip, SMS multipart, contatos. |
| `navanchauhan/freepbx-gsm-gateway` | 2 | — | **2026-03-31** | Receita Python/FreePBX com `chan_dongle` para **SIM7600G-H** e parecidos. |
| `Source-Gate/Dongle-Issabel-5` | 2 | — | **2026-01-29** | Modem USB GSM funcionando dentro do **Issabel 5** (a suíte que muita gente no Brasil já usa). |
| `Sheepsticked/asterisk-dongle-quectel-docker` | 0 | — | 2025-12-16 | Docker de Asterisk + chan_dongle + chan_quectel para Raspberry Pi. |
| `scjtqs2/docker-asterisk-freepbx` | 14 | — | 2026-01-03 | Docker com EC20 + chan_quectel (chinesa, mas o Dockerfile é leitura útil). |
| `Cykebs/orquestador-gsm` | 1 | — | 2026-03-18 | Painel em tempo real do estado dos canais de gateways GOIP/Dinstar/OpenVox. |

### 2b. A parte "discadora + o meu sistema" depois que a linha virar SIP

Já listados em `discadora-github-repos.md`; os que valem repetir para o seu caso:
`serfreeman1337/asterlink` (42★, MIT — click2dial + registro no CRM via AMI),
`marcelog/PAGI` (190★, Apache-2.0 — CDR e auto-dial agendado por call file),
`carpenox/vicidial-install-scripts` (15★ — instala VICIdial/Asterisk 18 em Alma 9),
`goautodial/v4.0` (143★, push 2026-09-21), `ictinnovations/ictdialer` (128★, GPL-3.0),
`alejandrozf/ominicontacto` (71★, LGPL-3.0), `IssabelFoundation/issabelPBX` (177★),
`asternic/asternic-cdr-module` (6★, GPL-3.0 — relatórios de CDR),
`masterfermin02/vicidial-api-wrapper` (31★) e `thornebridge/vicijs` (SDK TS) para a API.

### 2c. Sites/páginas que sustentam a decisão (fora do GitHub)

- **Asterisk Community — "Chan_mobile module" (jun/2026)**: confirma que `chan_mobile` é
  *community supported, sem mantenedor ativo*; um PR grande de reescrita (HFP/SMS/status) foi
  fechado e o autor foi manter fork próprio. → ou seja, no caminho B você fica sozinho com o driver.
- **asterisk/asterisk PR #1665**: a tal reescrita do chan_mobile, não fundida.
- **voip-info.org/chanmobile**: referência histórica do chan_mobile como "celular via Bluetooth
  como dispositivo FXO" + lista de aparelhos/dongles compatíveis (a lista é antiga, confira a sua
  linha de celular antes de comprar adaptador Bluetooth).
- **jtanx.github.io — "Using a Raspberry Pi, Asterisk and a Bluetooth dongle to route phone calls
  through a mobile phone"**: o tutorial completo do caminho B, passo a passo de pareamento e
  dialplan (`Dial(MOBILE/nome/numero)`).
- **community.asterisk.org thread 93902**: alerta técnico importante — **IVR/fax/DTMF por GSM é
  problemático** (codecs GSM não são compatíveis com DTMF de banda), e `chan_dongle` foi feito para
  dongles Huawei de ~2010. Ou seja: para "tocar gravação + capturar tecla 1", celular como tronco é
  o pior lugar; trunk SIP é o certo.
- **stackoverflow 32342198**: "como usar meu telefone como gateway GSM" — mesmo roteiro de pareamento.
- **Play Store — Tasker** (`net.dinglisch.android.taskerm`) e **Automate** (`com.llamalab.automate`):
  automação no celular com HTTP request/eventos de chamada; existe o plugin **"ADB Shell [Tasker
  Plugin]"** (`com.ADBPlugin`) que roda comando adb no próprio aparelho por Wi-Fi. É o "modo agente"
  sem escrever app.
- **fiverr `janakackv` "install android mobile bluetooth GSM gateway using asterisk" — US$ 25**:
  existem pessoas que vendem essa instalação. Serve de referência do esforço real envolvido
  (e de preço de quem faz isso manualmente).

---

## 3. O que eu sugiro, em ordem — sem enrolação

**Etapa 0 — hoje, zero custo (o bridge deste diretório).**
Ligue o celular por ADB (ou use Tasker chamando `GET /leads/next` e `POST /cdr`), rode o bridge,
e descubra em 2 dias a coisa que realmente importa antes de gastar em hardware: **quantas
ligações/hora o seu processo aguenta com 1 aparelho e 1 atendente**. Rode 3 dias com 50 leads.

**Etapa 1 — quando passar de ~100 ligações/dia ou quiser 2+ linhas: tire o chip do celular.**
Compre 1 modem 4G com suporte a voz (Simcom SIM7600 / Quectel EC20) e monte **Asterisk +
`IchthysMaranatha/asterisk-chan-quectel`** num mini-PC ou Raspberry Pi 4. Você continua no **mesmo
número/chip**, mas passa a ter: `originate` via AMI, estado de canal, gravação, CDR e a liberdade de
plugar VICIdial/GOautodial em cima depois. É o mesmo celular, só que virando tronco telefônico.

**Etapa 2 — quando tiver 3+ atendentes, esqueça a gambiarra e avalie gateway GSM de mesa**
(Yeastar TG / Dinstar / OpenVox, 4-8 chips). `striker24x7/dinstar-gsm-gateway-asterisk-vicidial-freepbx`
é um guia passo a passo disso no GitHub, e `Cykebs/orquestador-gsm` monitora os canais.

**Etapa 3 — o que te libera de verdade: trunk SIP com o seu número.**
A regra do jogo no Brasil em 2026 não é mais o prefixo 0303, é **autenticação STIR/SHAKEN /
Origem Verificada** (obrigatória acima de 500 mil chamadas/mês) e os critérios que fazem operadora
**derrubar canal**: chamada derrubada em ~3s, volume de discagem sem atendente humano proporcional,
ocultação de CID (Correio Braziliense, ago/2026; Folha/InfoMoney, ago/2025). Linha de celular comum
com discadora automática em massa é o retrato exato do que eles cortam. Antes de escalar, confirme
com a sua operadora se o chip aceita tráfego outbound de discadora — e avalie portar o número para
um trunk VoIP empresarial.

---

## 4. O protótipo que está neste diretório (e o que foi testado de fato)

`dialer_bridge.py` — stdlib pura, ~250 linhas:

- `--leads leads.csv` (colunas `numero,nome,origem`), estado persistido em `discadora_state.json`
- `GET /leads/next` → entrega o próximo lead e marca `discando` (com `tentativas` e re-reclamação
  automática depois de `timeout_s`, para lead que ficou pendurado)
- `POST /cdr` → o celular devolve `{"call_id":2,"result":"answered","duration":84,"note":"..."}`;
  o bridge traduz o resultado para disposição (`contato`, `nao_atendeu`, `ocupado`, `secretaria`…)
- `GET /status` → contadores e **taxa de contato efetivo** (chamadas ≥ 30s)
- `GET /report.csv` → CDR pra importar em qualquer sistema
- modo ADB: poller interno chama `am start -a android.intent.action.CALL -d tel:<num>`; `Adb.call_log()`
  lê `content://call_log/calls` e faz parse de `number/date/duration/type`
- o endpoint `/leads/next` **não** discar quando o poller ADB está ativo — evita discagem dupla

**Rodei aqui**: `py_compile`; claim via `--once`; parser do call log contra saída real do
`content query`; servidor de pé com um `adb`-stub simulando o aparelho — GET /leads/next (claim +
discação via poller), POST /cdr válido (virou `contato`, duração 84s), POST /cdr de outro lead
(`no_answer`→`nao_atendeu`), /status (`contato_efetivo: 1`), /report.csv, e as duas respostas de erro
(`400 json invalido`, `400 campo call_id obrigatorio`). Depois ajustei o reaper e testei: um lead
preso em `discando` com timeout estourado volta para a fila com `tentativas 1→2`. ✅

**NÃO testei**: nada com celular Android real conectado — não há aparelho neste sandbox. Portanto o
que permanece em aberto e é justamente onde esse tipo de projeto costuma quebrar: (a) se o SEU
Android mantém ADB por Wi-Fi estável por horas, (b) se `content query content://call_log/calls` é
permitido pelo `shell` no seu Android/fabricante, (c) se a Intent `ACTION_CALL` dispara sem pedir
confirmação (em Android 10+ com app não-padrao isso é bloqueado — daí a opção de usar `ACTION_DIAL`
e deixar o atendente apertar "ligar", que é mais honesto com o celular). Se (a)/(b) falharem, o modo
agente (Tasker/HTTP Shortcuts) contorna sem ADB. Trate o bridge como **esqueleto do protocolo**, não
como produto instalado.

---

## 5. Próxima decisão (me responda isto e eu escrevo a integração no seu formato)

1. Android ou iPhone? Modelo/versão, e quantos atendentes discam?
2. Topa tirar o chip do celular e pôr num modem USB (etapa 1), ou o celular tem que continuar na mão?
3. Volume por dia: dezenas ou milhares de leads?
4. Seu sistema: PHP/Laravel, Python/Django, Node, planilha? E ele só precisa do **log** da ligação
   ou precisa **controlar** a discagem (pausar, priorizar, recidivar)?

Com isso eu adapto o bridge ao seu banco/CRM (endpoint REST que o seu sistema já fala, ou INSERT
direto na sua tabela) e escrevo o passo a passo do Tasker com as telas exatas.

---

## 6. iPhone no meio: o que muda (verificado hoje, nas fontes da Apple)

**Não existe CDR automático a partir de um iPhone. Nunca vai existir por app.** Não é limitação de
esforço, é decisão de produto da Apple. Fontes conferidas agora:

- Fórum de desenvolvedores da Apple (thread 764958, respondendo sobre os novos comandos do **iOS 18**):
  *"Não. Não existe nenhuma API no sistema que dê acesso ao histórico de chamadas do usuário"*.
  Ainda: *"Todo app que oferece esse tipo de serviço no iOS o faz integrando com serviços VoIP ou da
  operadora, obtendo os dados dessa fonte externa, e não por alguma API do iOS"*.
- Ask Different (236573): abrir `tel:` de um **app em foreground** disca sem perguntar; de uma
  **página web** o iOS mostra o alerta "Ligar para X?" — um toque. Nada disso roda em background.
- Suporte Apple (guia do app Atalhos): existe o URL scheme oficial
  `shortcuts://run-shortcut?name=[nome]&input=text&text=[texto]` — é a ponte entre o seu CRM e o
  iPhone, mas com confirmação manual no caminho.
- Consequência técnica: o **Live Caller ID Lookup** (o que Truecaller usa) é *mão única* — o app
  fornece informação ao sistema, não lê as chamadas de volta.

### O que isso significa para o seu projeto

| | Android | iPhone |
|---|---|---|
| Discar sem tocar em nada | dá (ADB com `ACTION_CALL` — **device-dependente**: em muitos aparelhos o `shell` recebe `SecurityException: Permission Denial ... requires android.permission.CALL_PHONE`; o contorno é `ACTION_DIAL` + `input keyevent 5`/`KEYCODE_CALL`) | **não dá** — 1 toque no alerta do iOS é obrigatório |
| Ler o call log automaticamente | dá (ADB `content://call_log/calls`, se o fabricante permitir) | **não dá** |
| Gravar | fora do app, não | **não** |
| CDR/recording ao usar **app SIP (CallKit)** | sim (o Asterisk registra) | **sim** (o Asterisk registra — é a única saída realista no iOS) |

Ou seja: iPhone só entra no jogo de forma útil como **terminal de um ramal**, não como linha
controlável. E como a linha do Android continua frágil (ADB), a decisão certa para ter **iPhone e
Android juntos no mesmo sistema** é uma só:

> **Coloque a discagem no servidor (Asterisk/trunk). Os celulares viram ramais com app SIP
> (Linphone / GS Wave / Zoiper / app do seu trunk). O número do chip pode continuar existindo,
> entrando no Asterisk por gateway GSM/modem USB como *tronco de saída*, não como controlador.**

Aí iPhone e Android passam a ter exatamente o mesmo comportamento — click-to-call do CRM, popup,
disposição, gravação e CDR — e some a necessidade de manter dois mundos diferentes.

---

## 7. "Tem CRM integrado?" — resposta por suíte (lido no README de cada repo hoje)

| Projeto | CRM embutido? | Evidência |
|---|---|---|
| **GOautodial v4.0** | **SIM** — tem "Customer Relationship Manager (CRM)" na lista de features, mais ticketing/IM/redes sociais marcados como *under development*, e REST APIs + sistema de plugins | README do repo `goautodial/v4.0` (branch `master`), conferido agora |
| **OMniLeads** | **NÃO** — tem "CRM/ERP integration **APIs**": você pluga o seu CRM | README de `alejandrozf/ominicontacto` |
| **ICTDialer** | **NÃO** — o README se descreve como auto dialer / voice broadcast / fax broadcast sobre FreeSWITCH + ICTCore | README de `ictinnovations/ictdialer` |
| **VICIdial / Issabel** | **NÃO** — trabalham com "lists"/campanhas e API; CRM vem de fora (o wrapper `vicidial-api-wrapper` existe justamente para isso) | `discadora-github-repos.md` |
| **meu `dialer_bridge.py`** | **NÃO, de propósito** — ele só expõe `/pending`, `/leads/next` e `/cdr` para encaixar no CRM que você já tem | código neste diretório |

### Se você quiser CRM open source com telefonia de verdade, as 3 opções com prova

1. **SuiteCRM + `serfreeman1337/asterlink`** — 100% livre (MIT o conector, AGPL o SuiteCRM).
   O asterlink escuta AMI do Asterisk e faz click2dial + registro de chamada no SuiteCRM (e Bitrix24).
   Custo zero. Custo real: Asterisk 13+ com **4 contexts separados** no dialplan
   (`incoming_context`, `outgoing_context`, `ext_context`, `dial_context`) e o README diz que a config
   padrão foi testada em **FreePBX v14 + Asterisk v13** → valide na versão que você for usar.
2. **EspoCRM + extensão oficial VoIP Integration** — o CRM em si é livre e self-hosted (AGPL-3.0,
   R$ 0), e a integração é a mais pronta que existe em CRM open source: click-to-call, popup de
   entrada, display de saída, histórico do chamador, log da chamada em 1 clique, upload e player de
   gravação, SMS/MMS, provedores Asterisk (AMI) / Twilio / 3CX / Starface / Binotel / iexPBX /
   Squaretalk. **Porém**: a extensão VoIP é **produto comercialmente licenciado** (~**US$388**
   one-off por instância, segundo G2/Tomba 2026; e o repo `tmachyshyn/ext-voip-provider` da própria
   EspoCRM avisa "the VoIP Integration extension is a commercially licensed product — derivative
   works must not be relicensed"). Ou seja: não é "open source grátis" nessa parte.
3. **Odoo Community + `OCA/connector-telephony`** (AGPLv3, gratuito) — módulos `base_phone`,
   `base_phone_popup`, `crm_phone`, `hr_phone`, `asterisk_click2dial`. O comportamento de click-to-dial
   é literalmente o seu caso: *"no Odoo o usuário clica no número → o Asterisk faz o **telefone do
   usuário tocar** → ele atende → o Asterisk disca o número do lead"*. Com um **Android** tocando pelo
   chip via gateway, isso já funciona hoje; com **iPhone** só funciona se o "telefone do usuário" for
   um ramal SIP, não o discador nativo. Precisa de `phonenumbers` + `py-Asterisk` no servidor Odoo.

Um detalhe que pesa: no Odoo/asterlink/EspoCRM, o que o CRM faz é **registrar e originar chamadas**.
Nenhum deles é **discadora preditiva** — pacing, AMD, "3 linhas por atendente", relatório de campanha
é trabalho da suíte de contact center. Se o seu objetivo é discagem automática em volume, o par
natural é **CRM (SuiteCRM/EspoCRM/Odoo) + discadora (GOautodial/VICIdial/OMniLeads) + Asterisk no
meio**, e não um dos dois sozinho.
