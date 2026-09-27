# Repositórios no GitHub para plugar na sua discadora

Verificado em **27/09/2026** direto na API do GitHub (`api.github.com/repos/...`). Os números de estrelas/data do último push abaixo são reais, não de memória.

---

## 0. A resposta curta, e o ponto que trava tudo

Não existe repositório no GitHub que "discadorize" um telefone analógico/celular comum sozinho.
Software open source controla chamada quando existe um **motor de telefonia** (Asterisk ou FreeSWITCH)
falando SIP. O "telefone normal" precisa virar uma dessas três coisas:

| Situação de hoje | O que precisa entrar no meio | Aí sim o GitHub ajuda |
|---|---|---|
| Linha fixa analógica (fio da operadora no telefone de mesa) | Gateway **FXO** (OpenVox / Dinstar / Yeastar) ou placa USB FXO → Asterisk via DAHDI | VICIdial / Issabel / GOautodial / módulos AMI |
| Celular Android com chip (o aparelho discando fisicamente) | Gateway **GSM/banco de chips** → SIP, **ou** controle via ADB (gambiarra) | mesmo de cima, ou `android-ivr` |
| Já tem softphone/número VoIP | nada — já é SIP | qualquer repositório abaixo funciona direto |

Se seu cenário é o segundo (celular físico), saiba desde já: controle via ADB é frágil,
um aparelho por vez, sem gravação confiável e a operadora pode cortar o tráfego.
Gateway GSM resolve isso pelo mesmo preço de um VPS por mês.

---

## 1. Suites completas de discadora (você hospeda, tem API e painel de agente)

| Repo | Stars | Licença | Último push | Observação |
|---|---|---|---|---|
| `goautodial/v4.0` | 143 | (sem license file no repo; projeto se declara AGPL) | 2026-09-21 | Motor VICIdial + Asterisk por baixo, com UI web moderna e REST API. Melhor custo/benefício se você quer produto pronto e API decente. |
| `ictinnovations/ictdialer` | 128 | GPL-3.0 | 2026-09-07 | FreeSWITCH + ICTCore. Preview/progressivo/preditivo, voz, fax e SMS. Multi-tenant desde o início. 23 issues abertas. |
| `alejandrozf/ominicontacto` (OMniLeads) | 71 | LGPL-3.0 | 2026-05-12 | Espelho do GitLab `omnileads/ominicontacto`. Django + Vue + WebRTC + Kamailio + Asterisk. Forte na América Latina, API de integração com CRM/ERP. |
| `carpenox/vicidial-install-scripts` | 15 | — | 2026-05-30 | Instalador comunitário de VICIdial em AlmaLinux/Rocky 9 + Asterisk 18. É assim que se instala VICIdial hoje sem sofrer. |
| `IssabelFoundation/issabelPBX` | 177 | — | 2026-08-11 | GUI de Asterisk (sucessora do Elastix, muito usada no Brasil). Tem módulo de call center; bom se você quer PABX + fila em vez de discadora pura. |

VICIdial em si **não** tem repo oficial no GitHub — o código é distribuído por SVN
(`svn://svn.eflo.net:3690/agc_2-X/trunk`), segundo a própria comunidade. Use os wrappers abaixo para falar com ele.

---

## 2. Ponte entre a discadora e **o seu sistema** (é aqui que "adicionar ao meu sistema" acontece)

| Repo | Stars | Licença | Último push | Serve para |
|---|---|---|---|---|
| `serfreeman1337/asterlink` | 42 | MIT | 2025-04-03 | Go. Escuta eventos AMI do Asterisk e faz **click2dial + registro de chamada** no Bitrix24 e SuiteCRM. 4 contexts no dialplan, regex de CID. Se você usa Asterisk + CRM, é o mais próximo de "plug and play". |
| `marcelog/PAGI` | 190 | Apache-2.0 | 2019-06-26 | PHP AGI com **CDR, call spool e auto dial agendado**. Parado desde 2019, mas o modelo (spool de arquivos de chamada) continua sendo a forma mais robusta de discar sem manter conexão. |
| `masterfermin02/vicidial-api-wrapper` | 31 | — | 2026-01-27 | PHP para chamar a API do VICIdial (list_listing, add_lead, filter…) do seu código. |
| `thornebridge/vicijs` | 2 | — | 2026-04-08 | SDK TypeScript do VICIdial, "full feature parity". Bom se seu sistema é Node/Next. |
| `nerthux/Vicidial-PHP-API-WRAPPER` | 20 | — | 2022-08-06 | Alternativa ao de cima, mais antiga. |
| `asternic/asternic-cdr-module` | 6 | GPL-3.0 | 2026-06-03 | Módulo de **relatório de CDR** para IssabelPBX e FreePBX. Resolve "quero ver as ligações no navegador". |
| `alexiokay/AriLink` | 12 | — | 2026-03-10 | TypeScript. Servidor ARI/STASI em cima da API REST do Asterisk: originate, eventos, transcrição de fala em tempo real. Caminho moderno em vez de AMI/AGI. |
| `ros-tel/asterisk-dialer` | 3 | — | 2025-09-02 | Go. Discador em cima do AMI — pouco código, fácil de garfar para seu caso. |
| `asterisk-service/adial` | 0 | — | 2026-02-27 | PHP. "Asterisk ARI Dialer". Pequeno, recente; trate como referência, não como produto. |
| `navaismo/CallFile-Dialer` | 21 | — | 2014-04-16 | PHP, robo-dialer por call files. Morto, mas o `originate` por call file é o padrão que eu ainda recomendo para volume baixo. |

---

## 3. Se você aceitar sair do "telefone normal" e usar API de operadora (Twilio/Telnyx)

| Repo | Stars | Licença | Último push | Observação |
|---|---|---|---|---|
| `kofiowusuai-lab/open-dialer` | 3 | MIT | 2026-09-17 | Power dialer open source: CSV de leads, discagem pela **sua conta Twilio**, resultado cai na **sua** URL. É literalmente "discadora que adiciona ao meu sistema", sem PBX para manter. |
| `moazzam-07/DialerJazz` | 8 | MIT | 2026-05-05 | UI de power dialer (Next/TS), modo "tinder" de discagem. Bonito, incompleto. |
| `kaiquelupo/twilio-power-dialer` | 13 | — | 2020-12-18 | Tutorial/impl. de power dialer com Twilio. Brasileiro, bom para entender o fluxo. |
| `TwilioDevEd/browser-dialer-react` | 26 | — | 2024-04-15 | Dialer no navegador com Twilio Voice SDK. Também tem versões `vue` (29) e `angular` (9). |
| `geekydoodle/android-ivr` | 2 | — | 2026-08-13 | Python: controla um **celular Android via ADB** para chamadas de saída + tocar áudio. Exatamente o cenário "discar pelo meu telefone normal". É gambiarra assumida — funciona para poucos números, não para produção. |

---

## 4. Avisos que valem dinheiro

**Licença.** VICIdial, GOautodial e OMniLeads são **AGPL/LGPL com cláusula de rede**: se você embutir
isso num sistema que seus clientes/operadores acessam pela internet, a AGPL pode exigir liberar o
código do *seu* sistema. MIT/Apache/GPL-v3 (`asterlink`, `PAGI`, `ictdialer`, `open-dialer`, `DialerJazz`)
não têm esse problema. Se o sistema é interno da sua empresa, o risco prático é quase zero — se é
oferecido a terceiros, fale com advogado antes de casar com VICIdial.

**Anatel (importante para "discar em massa por linha comum").** Desde ago/2025 o prefixo **0303 deixou
de ser obrigatório** para telemarketing ativo (virou facultativo); em compensação, assinantes com
**mais de 500 mil chamadas/mês** são obrigados a autenticar as chamadas (Origem Verificada /
STIR-SHAKEN). Seguem valendo as proibições que fazem operadora **cortar seu trunk**: desligar a
chamada em menos de ~3s depois de atendida, ocultação de CID e **volume de discagem sem atendente
humano disponível na proporção**. Ou seja: linha residencial/comercial comum + discadora automática
em massa é o padrão que mais leva suspensão de linha. Discadora preditiva deve ir por trunk SIP
empresarial com contrato que permita outbound.

**Gravação.** Gravando conversa com cliente, avise no início da chamada (e veja LGPD para armazenar
áudio de terceiros).

---

## 5. O que eu recomendaria sem saber mais nada

1. **1–5 atendentes, poucos leads/dia** → `kofiowusuai-lab/open-dialer` (Twilio) ou escrever um
   `originate` por call file contra um Asterisk num VPS. Zero manutenção de suite.
2. **10+ atendentes, campanha de verdade** → ViciBox/VICIdial com
   `carpenox/vicidial-install-scripts` (AlmaLinux 9 + Asterisk 18), linha por gateway FXO ou trunk
   SIP, e `masterfermin02/vicidial-api-wrapper` (PHP) ou `thornebridge/vicijs` (TS) para o seu
   sistema ler/escrever leads e disposições.
3. **Você já tem FreePBX/Issabel e só quer o clique + log** → `serfreeman1337/asterlink` ou
   AMI puro + `asternic/asternic-cdr-module` para os relatórios.
4. **Quero código que eu consiga manter, sem suite gigante** → `alexiokay/AriLink` (ARI/STASI, TS)
   ou `ros-tel/asterisk-dialer` (Go) como esqueleto.

---

## 6. Para eu fechar a escolha certa, me diga

1. Sua discadora hoje **é o quê**: um software comercial (qual nome?), um Asterisk/Issabel seu, ou
   só um app no celular?
2. "Telefone normal" = **linha fixa analógica**, **celular com chip**, ou **número VoIP**?
3. "Meu sistema" = **sistema web próprio** (PHP/Python/Node?) ou **CRM pronto** (Pipedrive, RD,
   Bitrix24…)?
4. Tem **VPS Linux** para hospedar um PBX, e quantos atendentes discam ao mesmo tempo?

Com essas 4 respostas eu aponto 1 repositório e escrevo o script de integração (AMI/ARI
`originate` + webhook de CDR) na linguagem do seu sistema.
